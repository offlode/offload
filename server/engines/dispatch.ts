import * as schema from "@shared/schema";
import { storage } from "../storage";
import { distanceMiles } from "../lib/pricing";
import type { Order, Vendor, Driver } from "@shared/schema";

// ── D8: Operating-hours gate ──
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = typeof DAY_KEYS[number];
interface DayHours { open?: string; close?: string; closed?: boolean; }
type OperatingHoursJson = Partial<Record<DayKey, DayHours>>;

function parseTimeToMinutes(t: string): number {
  const [hh, mm] = t.split(":").map(Number);
  return (hh || 0) * 60 + (mm || 0);
}

/** Return the next "open" ISO datetime string for a vendor (up to 7 days ahead), or null. */
export function nextOpenAt(vendor: any, fromDate: Date): string | null {
  let hours: OperatingHoursJson;
  try { hours = JSON.parse(vendor.operatingHoursJson || ""); } catch { return null; }
  for (let d = 0; d < 7; d++) {
    const candidate = new Date(fromDate);
    candidate.setDate(candidate.getDate() + d);
    const dayKey = DAY_KEYS[candidate.getDay()];
    const dayHours = hours[dayKey];
    if (!dayHours || dayHours.closed) continue;
    if (!dayHours.open) continue;
    const openMins = parseTimeToMinutes(dayHours.open);
    const result = new Date(candidate);
    result.setHours(Math.floor(openMins / 60), openMins % 60, 0, 0);
    if (d === 0 && result <= fromDate) continue; // already past today's open
    return result.toISOString();
  }
  return null;
}

export function isVendorOpenNow(vendor: any, atDate: Date): boolean {
  if (vendor.adminOverrideOpen === true) return true;
  if (vendor.pauseOrderIntake === true) return false;
  if (!vendor.operatingHoursJson) return true;
  let hours: OperatingHoursJson;
  try { hours = JSON.parse(vendor.operatingHoursJson); } catch { return true; }
  const dayKey = DAY_KEYS[atDate.getDay()];
  const dayHours = hours[dayKey];
  if (!dayHours) return true;
  if (dayHours.closed) return false;
  if (!dayHours.open || !dayHours.close) return true;
  const nowMins = atDate.getHours() * 60 + atDate.getMinutes();
  const openMins = parseTimeToMinutes(dayHours.open);
  const closeMins = parseTimeToMinutes(dayHours.close);
  return nowMins >= openMins && nowMins < closeMins;
}

export function scoreVendor(vendor: Vendor, order: Order, pickupLat: number, pickupLng: number): number {
  let score = 0;
  if (vendor.lat && vendor.lng) {
    const dist = distanceMiles(pickupLat, pickupLng, vendor.lat, vendor.lng);
    score += Math.max(0, 40 - dist * 4);
  }
  const capacity = vendor.capacity || 50;
  const load = vendor.currentLoad || 0;
  const availableRatio = (capacity - load) / capacity;
  score += availableRatio * 25;
  const tierScore: Record<string, number> = { elite: 20, premium: 14, standard: 8 };
  score += tierScore[vendor.performanceTier || "standard"] || 8;
  score += (vendor.rating || 4.0) * 2;
  let prefs: any = {};
  try { prefs = order.preferences ? JSON.parse(order.preferences) : {}; } catch (e) { console.warn("[vendor-match] Failed to parse order preferences:", e); }
  let caps: any[] = [];
  try { const parsed = vendor.capabilities ? JSON.parse(vendor.capabilities) : []; caps = Array.isArray(parsed) ? parsed : []; } catch (e) { console.warn("[vendor-match] Failed to parse vendor capabilities:", e); }
  if (!prefs.washType || caps.includes(prefs.washType) || caps.includes("custom")) {
    score += 5;
  }
  if (order.certifiedOnly && vendor.certified) score += 5;
  return Math.round(score * 10) / 10;
}

export function scoreDriver(driver: Driver, pickupLat: number, pickupLng: number): number {
  let score = 0;
  if (driver.currentLat && driver.currentLng) {
    const dist = distanceMiles(pickupLat, pickupLng, driver.currentLat, driver.currentLng);
    score += Math.max(0, 40 - dist * 5);
  } else {
    score += 20;
  }
  score += (driver.rating || 4.0) * 5;
  const trips = driver.completedTrips || 0;
  score += Math.min(20, trips / 20);
  const todayTrips = driver.todayTrips || 0;
  score += Math.max(0, 15 - todayTrips * 3);
  return Math.round(score * 10) / 10;
}

export async function findBestVendor(order: Order, pickupLat: number, pickupLng: number, scheduledAt?: Date): Promise<Vendor | null> {
  let activeVendors = await storage.getActiveVendors();
  if (activeVendors.length === 0) return null;

  // Wave 2: exclude demo vendors in production unless ALLOW_DEMO_VENDORS=true
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_VENDORS !== "true") {
    activeVendors = activeVendors.filter(v => (v as any).isDemo !== true);
    if (activeVendors.length === 0) return null;
  }

  let dispatchAt: Date = scheduledAt || new Date();
  if (!scheduledAt && (order as any).scheduledPickup) {
    try { dispatchAt = new Date((order as any).scheduledPickup); } catch { dispatchAt = new Date(); }
  }

  let requiredWashType: string | null = null;
  try {
    const prefs = order.preferences ? JSON.parse(order.preferences) : {};
    if (prefs.washType) requiredWashType = String(prefs.washType);
  } catch (e) { /* ignore */ }
  if (!requiredWashType && (order as any).serviceType) {
    const st = String((order as any).serviceType);
    if (st !== "mixed") requiredWashType = st;
  }

  const scored = activeVendors
    .filter(v => {
      const cap = v.capacity || 50;
      const load = v.currentLoad || 0;
      return load < cap;
    })
    .filter(v => (v as any).pauseOrderIntake !== true)
    .filter(v => isVendorOpenNow(v, dispatchAt))
    .filter(v => {
      if (order.certifiedOnly) return v.certified === true;
      return true;
    })
    .filter(v => {
      if (!requiredWashType) return true;
      let caps: string[] = [];
      try { const parsed = v.capabilities ? JSON.parse(v.capabilities) : []; caps = Array.isArray(parsed) ? parsed : []; } catch { caps = []; }
      if (caps.includes("custom") || caps.includes(requiredWashType)) return true;
      if (requiredWashType === "dry_cleaning" && v.offersDryCleaning === true) return true;
      if (requiredWashType === "comforters" && v.offersComforters === true) return true;
      if (requiredWashType === "alterations" && v.offersAlterations === true) return true;
      if (requiredWashType === "commercial" && v.offersCommercial === true) return true;
      if (requiredWashType === "wash_fold" && caps.length === 0) return true;
      return false;
    })
    .map(v => ({ vendor: v, score: scoreVendor(v, order, pickupLat, pickupLng) }))
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].vendor : null;
}

export async function findBestDriver(pickupLat: number, pickupLng: number, vendorId?: number | null): Promise<Driver | null> {
  const available = await storage.getAvailableDrivers();
  if (available.length === 0) return null;

  let pool = available;
  if (vendorId != null) {
    const owned = available.filter(d => (d as any).vendorId === vendorId);
    if (owned.length > 0) pool = owned;
  } else {
    const platform = available.filter(d => !(d as any).vendorId);
    if (platform.length > 0) pool = platform;
  }

  const scored = pool
    .map(d => ({ driver: d, score: scoreDriver(d, pickupLat, pickupLng) }))
    .sort((a, b) => b.score - a.score);

  return scored[0].driver;
}
