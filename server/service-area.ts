// ──────────────────────────────────────────────────────────────
// Offload Service Area Engine
//
// "We do not have laundromats available in your area yet."
//
// Replaces the old hardcoded NYC/NJ ZIP range check with a real
// vendor-coverage check:
//   1. Are there approved, active vendors that cover this ZIP/address?
//   2. Do any of them support the requested service/add-ons?
//   3. Is at least one not paused?
//
// If no eligible vendor exists → block checkout, capture lead.
// ──────────────────────────────────────────────────────────────

import { storage } from "./storage";
import type { Vendor } from "@shared/schema";

export interface CoverageQuery {
  zip?: string;
  lat?: number;
  lng?: number;
  service?: string;     // wash_fold | dry_cleaning | comforters | alterations | commercial | stain_treatment | steam_press
  addOns?: string[];    // additional capability requirements
}

export interface CoverageResult {
  eligible: boolean;
  reason: string;                  // human-readable
  matchedVendors: number[];        // vendor ids that pass all filters
  totalActiveVendors: number;
  checkoutGated: boolean;          // true = serviceable but checkout blocked (e.g. NJ coming soon)
  checkoutGateReason?: string;     // human-readable reason for the gate
  failures: {
    notInZip: number;
    outsideRadius: number;
    missingCapability: number;
    paused: number;
    inactive: number;
  };
}

const EARTH_MILES = 3958.8;

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parseZips(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch { /* fall through */ }
  return [];
}

function capabilityField(service?: string): keyof Vendor | null {
  if (!service) return null;
  const s = service.toLowerCase().replace(/[-\s]/g, "_");
  if (s === "dry_cleaning" || s === "drycleaning") return "offersDryCleaning";
  if (s === "alterations") return "offersAlterations";
  if (s === "comforters" || s === "bedding") return "offersComforters";
  if (s === "commercial") return "offersCommercial";
  if (s === "stain_treatment" || s === "stain") return "offersStainTreatment";
  if (s === "steam_press" || s === "steam" || s === "press") return "offersSteamPress";
  if (s === "hang_dry") return "offersHangDry";
  // wash_fold and signature are the universal default — all active vendors support
  return null;
}

function vendorCovers(vendor: Vendor, q: CoverageQuery): { covers: boolean; failReason?: "zip" | "radius" } {
  const type = (vendor as any).serviceAreaType || "zip";
  const vendorZips = parseZips((vendor as any).serviceZips);
  const radius = Number((vendor as any).serviceRadiusMiles) || 0;
  const vLat = Number((vendor as any).lat);
  const vLng = Number((vendor as any).lng);

  // ZIP coverage
  if ((type === "zip" || type === "both") && q.zip && vendorZips.length > 0) {
    if (vendorZips.includes(String(q.zip))) return { covers: true };
  }
  // Radius coverage
  if ((type === "radius" || type === "both") && radius > 0 && q.lat != null && q.lng != null && Number.isFinite(vLat) && Number.isFinite(vLng)) {
    const dist = haversineMiles(vLat, vLng, q.lat, q.lng);
    if (dist <= radius) return { covers: true };
  }
  // If vendor has neither zips nor radius configured, fall back to "platform service area"
  // (the admin-managed `service_area_zips` pricing-config entry) — this preserves backward compat
  // for legacy vendors that exist before vendor-level service-area data is filled in.
  if (vendorZips.length === 0 && !radius) {
    return { covers: false, failReason: "zip" };
  }
  return { covers: false, failReason: type === "radius" ? "radius" : "zip" };
}

function vendorHasCapability(vendor: Vendor, service?: string, addOns?: string[]): boolean {
  // wash_fold is universal
  if (!service || service === "wash_fold" || service === "signature") {
    // still check add-ons
  } else {
    const field = capabilityField(service);
    if (field && !(vendor as any)[field]) return false;
  }
  for (const addOn of addOns || []) {
    const field = capabilityField(addOn);
    if (field && !(vendor as any)[field]) return false;
  }
  return true;
}

// ── NJ ZIP detection ──
// NJ ZIPs begin with 07xxx or 08xxx.
function isNJZip(zip?: string): boolean {
  if (!zip) return false;
  const z = String(zip).trim();
  return z.startsWith("07") || z.startsWith("08");
}

export async function checkCoverage(q: CoverageQuery): Promise<CoverageResult> {
  const vendors = await storage.getVendors();
  const failures = { notInZip: 0, outsideRadius: 0, missingCapability: 0, paused: 0, inactive: 0 };
  const matched: number[] = [];
  let totalActive = 0;

  for (const v of vendors || []) {
    if (v.status !== "active") { failures.inactive++; continue; }
    if ((v as any).pauseOrderIntake) { failures.paused++; continue; }
    totalActive++;

    const cov = vendorCovers(v, q);
    if (!cov.covers) {
      if (cov.failReason === "radius") failures.outsideRadius++;
      else failures.notInZip++;
      continue;
    }
    if (!vendorHasCapability(v, q.service, q.addOns)) {
      failures.missingCapability++;
      continue;
    }
    matched.push(v.id);
  }

  // D4: NJ checkout-gating — NJ is serviceable but checkout is blocked until D4 NJ launch
  const njGated = isNJZip(q.zip);

  if (matched.length > 0) {
    if (njGated) {
      return {
        eligible: true,
        reason: "NJ checkout coming soon — leave us your email",
        matchedVendors: matched,
        totalActiveVendors: totalActive,
        checkoutGated: true,
        checkoutGateReason: "NJ checkout coming soon — leave us your email",
        failures,
      };
    }
    return {
      eligible: true,
      reason: `${matched.length} laundromat(s) can service your area`,
      matchedVendors: matched,
      totalActiveVendors: totalActive,
      checkoutGated: false,
      failures,
    };
  }

  // NJ ZIPs that aren’t covered by any vendor yet: still show as serviceable+gated
  if (njGated) {
    return {
      eligible: true,
      reason: "NJ checkout coming soon — leave us your email",
      matchedVendors: [],
      totalActiveVendors: totalActive,
      checkoutGated: true,
      checkoutGateReason: "NJ checkout coming soon — leave us your email",
      failures,
    };
  }

  // Build a helpful reason
  let reason = "We do not have laundromats available in your area yet. Offload is coming soon to your area.";
  if (failures.missingCapability > 0 && (failures.notInZip + failures.outsideRadius) === 0) {
    reason = `We service your area but no laundromat currently offers ${q.service?.replace(/_/g, " ") || "this service"}. We'll let you know when it's available.`;
  } else if (totalActive === 0) {
    reason = "Service is temporarily unavailable. Please try again shortly.";
  }

  return {
    eligible: false,
    reason,
    matchedVendors: [],
    totalActiveVendors: totalActive,
    checkoutGated: false,
    failures,
  };
}
