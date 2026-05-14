import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage, db } from "./storage";
import { sendPushToUser } from "./push";
import { pricingConfig } from "./pricing-config-service";
import { distanceMiles } from "./lib/pricing";
import { dollarsToCents } from "./lib/stripe";
import { SLA_CONFIGS, LOYALTY_TIERS, SUBSCRIPTION_TIERS } from "@shared/schema";
import type { Order, Vendor, Driver } from "@shared/schema";
import type { Server as SocketIOServer } from "socket.io";
import {
  VALID_TRANSITIONS as FSM_TRANSITIONS,
} from "./order-fsm";
import { formatCents, dollarsToCreditCents } from "./session";

// ════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════

export function generateOrderNumber(): string {
  const prefix = "OFF";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase().substring(0, 4);
  return `${prefix}-${ts}-${rand}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function generateQuoteNumber(): string {
  const prefix = "QT";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase().substring(0, 4);
  return `${prefix}-${ts}-${rand}`;
}

// ════════════════════════════════════════════════════════════════
//  AUTO-DISPATCH ENGINE
// ════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
//  SLA ENGINE
// ════════════════════════════════════════════════════════════════

export function calculateSLADeadline(deliverySpeed: string, createdAt: string): string {
  const config = SLA_CONFIGS[deliverySpeed as keyof typeof SLA_CONFIGS] || SLA_CONFIGS["48h"];
  const created = new Date(createdAt);
  // P2-032: use getTime() + millis to avoid setHours mutation pitfalls around DST
  return new Date(created.getTime() + config.hours * 3600000).toISOString();
}

export function checkSLAStatus(order: Order): "on_track" | "at_risk" | "breached" {
  if (!order.slaDeadline) return "on_track";
  const deadline = new Date(order.slaDeadline);
  const nowDate = new Date();
  if (nowDate > deadline) return "breached";
  const config = SLA_CONFIGS[order.deliverySpeed as keyof typeof SLA_CONFIGS] || SLA_CONFIGS["48h"];
  const warningDate = new Date(order.createdAt);
  warningDate.setHours(warningDate.getHours() + config.warningHours);
  if (nowDate > warningDate) return "at_risk";
  return "on_track";
}

// ════════════════════════════════════════════════════════════════
//  NOTIFICATION HELPERS
// ════════════════════════════════════════════════════════════════

export async function notifyUser(userId: number, orderId: number | null, type: string, title: string, body: string, actionUrl?: string) {
  await storage.createNotification({
    userId,
    orderId,
    type,
    title,
    body,
    actionUrl,
    createdAt: now(),
  });
}

export async function notifyOrderUpdate(order: Order, title: string, body: string) {
  await notifyUser(order.customerId, order.id, "order_update", title, body, `/orders/${order.id}`);
  void sendPushToUser(order.customerId, title, body, { orderId: order.id, type: "order_update" });
}

export async function sendOrderStatusSMS(_order: Order, _status: string): Promise<void> {
  return;
}

export async function sendClaimAccountEmail(user: schema.User): Promise<void> {
  const { Resend } = await import("resend");
  const resetToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 3600000).toISOString();
  await storage.createPasswordResetToken(user.id, resetToken, expiresAt);
  const resetUrl = `https://offloadusa.com/#/reset-password?token=${resetToken}`;
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email] Would send claim-account email to user#${user.id} (no RESEND_API_KEY)`);
    return;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: "Offload <notifications@offloadusa.com>",
    to: user.email,
    subject: "Welcome to Offload — claim your account",
    html: `<div style="font-family:Inter,Arial,sans-serif;max-width:500px;margin:0 auto;padding:32px;">
      <div style="text-align:center;margin-bottom:24px;"><h1 style="color:#5B4BC4;font-size:24px;margin:0;">Offload</h1></div>
      <h2 style="color:#1A1A1A;font-size:18px;">Claim your account</h2>
      <p style="color:#555;font-size:14px;line-height:1.6;">Hi ${user.name || "there"},</p>
      <p style="color:#555;font-size:14px;line-height:1.6;">We created an Offload account for your checkout. Set your password to track orders and manage preferences.</p>
      <div style="text-align:center;margin:28px 0;"><a href="${resetUrl}" style="background:#5B4BC4;color:#fff;padding:12px 32px;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">Claim Account</a></div>
      <p style="color:#888;font-size:12px;">This link expires in 1 hour.</p>
    </div>`,
  });
  console.log(`[Email] Claim-account email sent to user#${user.id}: ${(result as any)?.data?.id || (result as any)?.id || "accepted"}`);
}

// Socket.io emit helper — safe no-op when io is not available
let _io: SocketIOServer | undefined;
export function setIO(socketIO?: SocketIOServer) { _io = socketIO; }

export function emitToUser(userId: number, event: string, data: any) {
  if (_io) _io.to(`user:${userId}`).emit(event, data);
}

export function emitToOrder(orderId: number, event: string, data: any) {
  if (_io) _io.to(`order:${orderId}`).emit(event, data);
}

export function emitToRole(role: string, event: string, data: any) {
  if (_io) _io.to(`role:${role}`).emit(event, data);
}

export function emitNotification(userId: number, notification: any) {
  emitToUser(userId, "notification", notification);
}

export async function notifyAndEmit(userId: number, orderId: number | null, type: string, title: string, body: string, actionUrl?: string) {
  const notification = await storage.createNotification({
    userId,
    orderId,
    type,
    title,
    body,
    actionUrl,
    createdAt: now(),
  });
  emitNotification(userId, notification);
  return notification;
}

// ════════════════════════════════════════════════════════════════
//  OWNERSHIP CHECK HELPERS (Security fix — BOLA prevention)
// ════════════════════════════════════════════════════════════════

export function getOrderOwnershipAllowed(order: any, user: any, driverRecord?: any, vendorRecord?: any): boolean {
  const role = user.role;
  if (role === "admin" || role === "manager") return true;
  if (role === "customer" && order.customerId === user.id) return true;
  if (role === "driver" && driverRecord && order.driverId === driverRecord.id) return true;
  if (["laundromat","vendor"].includes(role) && vendorRecord && order.vendorId === vendorRecord.id) return true;
  if (role === "support") return true;
  return false;
}

export async function canAccessOrder(order: any, user: any): Promise<boolean> {
  if (!order || !user) return false;
  const role = user.role;
  if (role === "admin" || role === "manager" || role === "support") return true;
  if (role === "customer") return order.customerId === user.id;
  if (role === "driver") {
    const dp = await storage.getDriverByUserId(user.id);
    return !!(dp && order.driverId === dp.id);
  }
  if (role === "laundromat" || role === "vendor") {
    const vp = await storage.getVendorByUserId(user.id);
    return !!(vp && order.vendorId === vp.id);
  }
  return false;
}

export async function ownsDriverProfile(profileId: number, user: any): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin" || user.role === "manager") return true;
  if (user.role !== "driver") return false;
  const dp = await storage.getDriverByUserId(user.id);
  return !!(dp && dp.id === Number(profileId));
}

export async function ownsVendorProfile(vendorProfileId: number, user: any): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin" || user.role === "manager") return true;
  if (!(user.role === "laundromat" || user.role === "vendor")) return false;
  const vp = await storage.getVendorByUserId(user.id);
  return !!(vp && vp.id === Number(vendorProfileId));
}

// ════════════════════════════════════════════════════════════════
//  FINANCIAL ENGINE
// ════════════════════════════════════════════════════════════════

export async function calculatePayouts(order: Order) {
  const vendor = order.vendorId ? await storage.getVendor(order.vendorId) : null;
  const defaultRate = await pricingConfig.getDefaultVendorPayoutRate();
  const payoutRate = (vendor as any)?.payoutRate || defaultRate;
  const vendorPayout = Math.round((order.subtotal || 0) * payoutRate * 100) / 100;
  const driver = (order as any).driverId ? await storage.getDriver((order as any).driverId) : null;
  const defaultPerTrip = await pricingConfig.getDefaultDriverPayoutPerTrip();
  const perTrip = (driver as any)?.payoutPerTrip || defaultPerTrip;
  const driverPayout = Math.round(perTrip * 2 * 100) / 100;
  return { vendorPayout, driverPayout };
}

export async function processPaymentCapture(order: Order): Promise<{ alreadyCaptured: boolean; success?: boolean; reason?: string }> {
  if (order.paymentStatus === "captured") {
    await recordPayoutsForCapturedOrder(order);
    return { alreadyCaptured: true };
  }

  const txns = await storage.getPaymentTransactionsByOrder(order.id);
  const realChargeTxn = txns.find((t: any) =>
    t.type === "charge" &&
    t.stripePaymentIntentId &&
    !String(t.stripePaymentIntentId).startsWith("pi_demo_") &&
    !String(t.stripePaymentIntentId).startsWith("pi_quote_")
  );

  if (!realChargeTxn) {
    console.warn(`[Payment] Order ${order.id} delivered without a real Stripe charge — paymentStatus left as "${order.paymentStatus}". Admin must collect.`);
    return { alreadyCaptured: false, success: false, reason: "no_real_stripe_charge" };
  }

  return { alreadyCaptured: false, success: true, reason: "waiting_for_webhook" };
}

export async function recordPayoutsForCapturedOrder(order: Order): Promise<void> {
  if ((order as any).payoutRecorded) return;
  if (order.paymentStatus !== "captured") return;

  const { vendorPayout, driverPayout } = await calculatePayouts(order);

  await db.transaction(async (tx) => {
    await tx.update(schema.orders).set({
      vendorPayout,
      driverPayout,
      payoutRecorded: true,
    } as any).where(eq(schema.orders.id, order.id));

    if (order.vendorId) {
      const [vendor] = await tx.select().from(schema.vendors).where(eq(schema.vendors.id, order.vendorId));
      if (vendor) {
        await tx.update(schema.vendors).set({
          totalEarnings: (vendor.totalEarnings || 0) + vendorPayout,
          pendingPayout: (vendor.pendingPayout || 0) + vendorPayout,
        }).where(eq(schema.vendors.id, vendor.id));
      }
    }

    if (order.driverId) {
      const [driver] = await tx.select().from(schema.drivers).where(eq(schema.drivers.id, order.driverId));
      if (driver) {
        await tx.update(schema.drivers).set({
          totalEarnings: (driver.totalEarnings || 0) + driverPayout,
          pendingPayout: (driver.pendingPayout || 0) + driverPayout,
          completedTrips: (driver.completedTrips || 0) + 1,
        }).where(eq(schema.drivers.id, driver.id));
      }
    }
  });
}

// ════════════════════════════════════════════════════════════════
//  LOYALTY ENGINE
// ════════════════════════════════════════════════════════════════

export async function getLoyaltyTier(points: number): Promise<string> {
  const loyaltyConfig = await pricingConfig.getLoyaltyConfig();
  const tiers = loyaltyConfig.tiers as any;
  if (tiers.platinum && points >= tiers.platinum.minPoints) return "platinum";
  if (tiers.gold && points >= tiers.gold.minPoints) return "gold";
  if (tiers.silver && points >= tiers.silver.minPoints) return "silver";
  return "bronze";
}

export async function awardLoyaltyPoints(userId: number, orderId: number, orderTotal: number) {
  const user = await storage.getUser(userId);
  if (!user) return;

  // P2-029: dedup — check if loyalty points already awarded for this order
  const existingTxns = await storage.getLoyaltyTransactions(userId);
  if (existingTxns.some(t => t.type === "earned" && t.orderId === orderId)) {
    return; // already awarded
  }

  const loyaltyConfig = await pricingConfig.getLoyaltyConfig();
  const tier = user.loyaltyTier || "bronze";
  const tierConfig = (loyaltyConfig.tiers as any)[tier];
  const multiplier = tierConfig?.multiplier || 1.0;
  // P2-033: use totalCents (integer math) not float total
  const totalCents = Math.round(orderTotal * 100);
  const basePoints = Math.floor(totalCents * loyaltyConfig.pointsPerDollarEarned / 100);
  const pointsEarned = Math.floor(basePoints * multiplier);

  let bonusMultiplier = 1.0;
  if (user.subscriptionTier && SUBSCRIPTION_TIERS[user.subscriptionTier as keyof typeof SUBSCRIPTION_TIERS]) {
    bonusMultiplier = SUBSCRIPTION_TIERS[user.subscriptionTier as keyof typeof SUBSCRIPTION_TIERS].pointsBonus;
  }
  const finalPoints = Math.floor(pointsEarned * bonusMultiplier);

  const newTotal = (user.loyaltyPoints || 0) + finalPoints;
  const newTier = await getLoyaltyTier(newTotal);

  await storage.updateUser(userId, {
    loyaltyPoints: newTotal,
    loyaltyTier: newTier,
    totalOrders: (user.totalOrders || 0) + 1,
    totalSpent: (user.totalSpent || 0) + orderTotal,
  });

  await storage.createLoyaltyTransaction({
    userId,
    orderId,
    type: "earned",
    points: finalPoints,
    description: `Earned ${finalPoints} points for order #${orderId} ($${orderTotal.toFixed(2)} \u00d7 ${multiplier}x tier multiplier)`,
    createdAt: now(),
  });

  await storage.updateOrder(orderId, { loyaltyPointsEarned: finalPoints });

  if (newTier !== tier) {
    await notifyUser(userId, null, "loyalty",
      `Tier Upgrade: ${newTier.charAt(0).toUpperCase() + newTier.slice(1)}!`,
      `Congratulations! You've been upgraded to ${newTier} tier with ${newTotal} points.`,
      "/profile"
    );
  }
}

// ════════════════════════════════════════════════════════════════
//  AI CHATBOT ENGINE
// ════════════════════════════════════════════════════════════════

export type ChatIntent = "order_status" | "reschedule" | "cancel" | "complaint" | "pricing" | "general" | "loyalty" | "subscription";

export function detectIntent(message: string): ChatIntent {
  const lower = message.toLowerCase();
  if (lower.match(/\b(where|status|track|locate|order|pickup|delivery|when|eta|arrival)\b/)) return "order_status";
  if (lower.match(/\b(reschedule|change|move|postpone|different time|new time)\b/)) return "reschedule";
  if (lower.match(/\b(cancel|cancellation|stop|refund)\b/)) return "cancel";
  if (lower.match(/\b(complaint|issue|problem|missing|damaged|wrong|bad|terrible|awful|lost|broken)\b/)) return "complaint";
  if (lower.match(/\b(price|cost|fee|charge|how much|expensive|cheap|discount|promo|coupon)\b/)) return "pricing";
  if (lower.match(/\b(points|loyalty|tier|rewards|silver|gold|platinum|bronze)\b/)) return "loyalty";
  if (lower.match(/\b(subscription|plan|upgrade|basic|plus|premium|membership)\b/)) return "subscription";
  return "general";
}

export async function generateAIResponse(intent: ChatIntent, userId: number, message: string): Promise<{ response: string; resolved: boolean; escalate: boolean }> {
  switch (intent) {
    case "order_status": {
      const userOrders = await storage.getOrdersByCustomer(userId);
      const activeOrders = userOrders.filter(o => !["delivered", "cancelled"].includes(o.status));
      if (activeOrders.length === 0) {
        const lastDelivered = userOrders.find(o => o.status === "delivered");
        if (lastDelivered) {
          return {
            response: `Your last order (${lastDelivered.orderNumber}) was delivered on ${lastDelivered.deliveredAt ? new Date(lastDelivered.deliveredAt).toLocaleDateString() : "recently"}. You have no active orders right now. Would you like to schedule a new pickup?`,
            resolved: true, escalate: false,
          };
        }
        return {
          response: "You don't have any active orders at the moment. Would you like to schedule your first pickup? Just head to the home screen to get started!",
          resolved: true, escalate: false,
        };
      }
      const order = activeOrders[0];
      const statusMsg: Record<string, string> = {
        pending: "is pending and we're finding you the best vendor and driver",
        scheduled: "has been confirmed and we're assigning a driver",
        driver_assigned: "has a driver assigned and they'll be heading to you soon",
        pickup_in_progress: "has a driver en route to pick up your laundry right now",
        picked_up: "has been picked up and is on its way to the laundromat",
        at_laundromat: "has arrived at the facility and will start washing soon",
        washing: "is currently being washed",
        wash_complete: "has finished washing and is being packed",
        packing: "is being carefully packed for delivery",
        ready_for_delivery: "is ready and we're dispatching a delivery driver",
        out_for_delivery: "is out for delivery and should arrive soon!",
      };
      return {
        response: `Your order **${order.orderNumber}** ${statusMsg[order.status] || "is in progress"}. ${order.slaDeadline ? `Estimated delivery by ${new Date(order.slaDeadline).toLocaleString()}.` : ""} Is there anything else I can help you with?`,
        resolved: true, escalate: false,
      };
    }
    case "reschedule":
      return { response: "To reschedule your pickup, please go to your order details and tap 'Reschedule'. You can change your pickup time up to 2 hours before the scheduled time. If your driver has already been assigned, please call us at (305) 555-0100 and we'll arrange it for you.", resolved: true, escalate: false };
    case "cancel": {
      const activeOrders = (await storage.getOrdersByCustomer(userId)).filter(o => ["pending", "scheduled", "driver_assigned"].includes(o.status));
      if (activeOrders.length > 0) {
        return { response: `I can help you cancel your order **${activeOrders[0].orderNumber}**. Please note that cancellations are free before the driver is dispatched. To proceed, go to your order details and tap 'Cancel Order', or I can escalate this to our team who can process it immediately. Would you like me to connect you with a team member?`, resolved: false, escalate: true };
      }
      return { response: "You don't have any cancellable orders at this time. Orders can only be cancelled before the pickup is completed. If you have concerns about a delivered order, I can help you file a dispute.", resolved: true, escalate: false };
    }
    case "complaint":
      return { response: "I'm sorry to hear you're having an issue! Your satisfaction is our top priority. To ensure this is handled properly, I'm escalating your concern to our customer care team. They'll reach out within 2 hours. In the meantime, you can also file a formal dispute from your order details page, which initiates our resolution process immediately.", resolved: false, escalate: true };
    case "pricing":
      return { response: "Our pricing uses flat-rate bag sizes:\n\n\u2022 **Small Bag**: $24.99 (up to 10 lbs)\n\u2022 **Medium Bag**: $44.99 (up to 20 lbs)\n\u2022 **Large Bag**: $59.99 (up to 30 lbs)\n\u2022 **XL Bag**: $89.99 (up to 50 lbs)\n\nDelivery options: Standard (48h) is free, Next Day (24h) +$5.99, Same Day (12h) +$12.99. If your laundry goes over the bag weight limit, it's $2.50 per extra pound. Tax is 8.875% (NYC). Try promo code **WELCOME20** for 20% off your first order!", resolved: true, escalate: false };
    case "loyalty": {
      const user = await storage.getUser(userId);
      const points = user?.loyaltyPoints || 0;
      const tier = user?.loyaltyTier || "bronze";
      const tierInfo = LOYALTY_TIERS[tier as keyof typeof LOYALTY_TIERS];
      return { response: `You currently have **${points} loyalty points** and you're a **${tier.charAt(0).toUpperCase() + tier.slice(1)} member**!\n\nYour tier perks include: ${tierInfo.perks.join(", ")}.\n\n100 points = $1 discount on your next order. You can redeem points from the checkout screen. Keep washing to level up!`, resolved: true, escalate: false };
    }
    case "subscription":
      return { response: "We use simple flat-rate pricing per bag \u2014 Small $24.99, Medium $44.99, Large $59.99, XL $89.99 \u2014 with $2.50/lb overage if your bag is heavier than expected. Standard 48-hour return is free; Next Day (+$5.99) and Same Day (+$12.99) are also available.", resolved: true, escalate: false };
    default:
      return { response: "Hi! I'm Offload's virtual assistant. I can help you with:\n\n\u2022 **Order status** \u2014 track your active orders\n\u2022 **Pricing** \u2014 get a quote\n\u2022 **Cancellations** \u2014 cancel or reschedule\n\u2022 **Loyalty points** \u2014 check your rewards\n\u2022 **Issues** \u2014 file a complaint\n\nWhat can I help you with today?", resolved: false, escalate: false };
  }
}

// ════════════════════════════════════════════════════════════════
//  VENDOR HEALTH SCORING
// ════════════════════════════════════════════════════════════════

export function calculateVendorHealthScore(vendor: Vendor): {
  score: number;
  breakdown: Record<string, number>;
  recommendations: string[];
} {
  const ratingScore = ((vendor.rating || 4.0) / 5.0) * 25;
  const onTimeScore = (vendor.onTimeRate || 0.95) * 25;
  const disputeScore = (1 - (vendor.disputeRate || 0.02)) * 20;
  const processingScore = Math.max(0, (300 - (vendor.avgProcessingTime || 180)) / 300) * 15;
  const capacityUtil = (vendor.currentLoad || 0) / (vendor.capacity || 50);
  const capacityScore = capacityUtil < 0.3 ? capacityUtil / 0.3 * 15
    : capacityUtil > 0.9 ? (1 - capacityUtil) / 0.1 * 15
    : 15;

  const totalScore = Math.round((ratingScore + onTimeScore + disputeScore + processingScore + capacityScore) * 10) / 10;

  const recommendations: string[] = [];
  if ((vendor.rating || 0) < 4.0) recommendations.push("Rating below 4.0 \u2014 review customer feedback and improve quality control");
  if ((vendor.onTimeRate || 0) < 0.85) recommendations.push("On-time rate below 85% \u2014 consider adjusting capacity or staffing");
  if ((vendor.disputeRate || 0) > 0.05) recommendations.push("High dispute rate \u2014 investigate common complaint patterns");
  if ((vendor.avgProcessingTime || 0) > 240) recommendations.push("Processing time exceeds 4 hours \u2014 streamline workflow");
  if (capacityUtil > 0.9) recommendations.push("Near full capacity \u2014 consider hiring additional staff or limiting new orders");
  if (capacityUtil < 0.2) recommendations.push("Very low utilization \u2014 consider marketing campaigns or promotional pricing");
  if (recommendations.length === 0) recommendations.push("Excellent performance! Keep up the great work.");

  return {
    score: totalScore,
    breakdown: {
      rating: Math.round(ratingScore * 10) / 10,
      onTimeRate: Math.round(onTimeScore * 10) / 10,
      disputeRate: Math.round(disputeScore * 10) / 10,
      processingTime: Math.round(processingScore * 10) / 10,
      capacityUtilization: Math.round(capacityScore * 10) / 10,
    },
    recommendations,
  };
}

// ════════════════════════════════════════════════════════════════
//  FRAUD DETECTION ENGINE
// ════════════════════════════════════════════════════════════════

export async function calculateFraudRisk(orderId: number): Promise<{
  riskScore: number;
  flags: string[];
  autoFlagged: boolean;
}> {
  const order = await storage.getOrder(orderId);
  if (!order) return { riskScore: 0, flags: [], autoFlagged: false };

  const flags: string[] = [];
  let riskScore = 0;

  const customer = await storage.getUser(order.customerId);
  if (customer) {
    const memberSince = customer.memberSince ? new Date(customer.memberSince) : new Date();
    const daysSinceMember = (Date.now() - memberSince.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceMember < 7 && (order.total || 0) > 100) {
      flags.push("New account (<7 days) placing high-value order (>$100)");
      riskScore += 30;
    } else if (daysSinceMember < 30 && (order.total || 0) > 200) {
      flags.push("New account (<30 days) placing very high-value order (>$200)");
      riskScore += 20;
    }
  }

  const recentOrders = await storage.getOrdersByCustomer(order.customerId);
  const last24h = recentOrders.filter(o => {
    const created = new Date(o.createdAt);
    return (Date.now() - created.getTime()) < 24 * 60 * 60 * 1000;
  });
  if (last24h.length > 5) {
    flags.push(`Unusual order frequency: ${last24h.length} orders in last 24 hours`);
    riskScore += 25;
  }

  if (order.weightDiscrepancy) {
    const intake = order.intakeWeight || 0;
    const output = order.outputWeight || 0;
    if (intake > 0 && output > 0) {
      const diffPct = Math.abs(output - intake) / intake;
      if (diffPct > 0.2) {
        flags.push(`Weight discrepancy: ${(diffPct * 100).toFixed(1)}% variance (intake: ${intake} lbs, output: ${output} lbs)`);
        riskScore += 20;
      }
    }
  }

  const customerAddresses = await storage.getAddressesByUser(order.customerId);
  if (customerAddresses.length > 5 && customer) {
    const memberSince = customer.memberSince ? new Date(customer.memberSince) : new Date();
    const daysSinceMember = (Date.now() - memberSince.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceMember < 30) {
      flags.push(`${customerAddresses.length} addresses on a new account`);
      riskScore += 15;
    }
  }

  try {
    const bags = JSON.parse(order.bags || "[]");
    const totalBags = bags.reduce((sum: number, b: any) => sum + (b.quantity || 1), 0);
    if (totalBags > 10) {
      flags.push(`Unusually large order: ${totalBags} bags`);
      riskScore += 10;
    }
  } catch (e) { console.warn("[fraud] Failed to parse order bags:", e); }

  if (order.promoCode && (order.total || 0) > 150) {
    flags.push("Promo code applied to high-value order");
    riskScore += 10;
  }

  const autoFlagged = riskScore > 70;
  return { riskScore: Math.min(100, riskScore), flags, autoFlagged };
}

// ════════════════════════════════════════════════════════════════
//  PREDICTIVE ETA ENGINE
// ════════════════════════════════════════════════════════════════

export async function calculatePredictiveETA(orderId: number): Promise<{
  phases: Array<{ phase: string; estimatedMinutes: number; estimatedAt: string }>;
  totalEstimatedMinutes: number;
  estimatedDelivery: string;
}> {
  const order = await storage.getOrder(orderId);
  if (!order) return { phases: [], totalEstimatedMinutes: 0, estimatedDelivery: new Date().toISOString() };

  const vendor = order.vendorId ? await storage.getVendor(order.vendorId) : null;
  const driver = order.driverId ? await storage.getDriver(order.driverId) : null;
  const addr = await storage.getAddress(order.pickupAddressId);

  const now_ = new Date();
  const hour = now_.getHours();
  const dayOfWeek = now_.getDay();

  const timeOfDayFactor = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20) ? 1.3 : 1.0;
  const dayFactor = dayOfWeek === 1 ? 1.2 : dayOfWeek === 0 || dayOfWeek === 6 ? 0.9 : 1.0;

  const avgPickupMins = driver?.avgPickupTime || 15;
  const pickupDistance = (vendor?.lat && addr?.lat)
    ? distanceMiles(addr.lat, addr.lng!, vendor.lat, vendor.lng!)
    : 2;
  const drivingMins = Math.round(pickupDistance * 4);
  const pickupMins = Math.round((avgPickupMins + drivingMins) * timeOfDayFactor);
  const vendorProcessMins = Math.round((vendor?.avgProcessingTime || 180) * dayFactor);
  const deliveryMins = Math.round((drivingMins + 10) * timeOfDayFactor);

  const phases: Array<{ phase: string; estimatedMinutes: number; estimatedAt: string }> = [];
  let cursor = new Date();
  let totalMins = 0;

  const remainingPhases = getRemainingPhases(order.status);

  for (const phase of remainingPhases) {
    let mins = 0;
    if (phase === "pickup") mins = pickupMins;
    else if (phase === "processing") mins = vendorProcessMins;
    else if (phase === "delivery") mins = deliveryMins;
    else mins = 10;

    totalMins += mins;
    cursor = new Date(cursor.getTime() + mins * 60000);
    phases.push({ phase, estimatedMinutes: mins, estimatedAt: cursor.toISOString() });
  }

  return { phases, totalEstimatedMinutes: totalMins, estimatedDelivery: cursor.toISOString() };
}

export function getRemainingPhases(status: string): string[] {
  const allPhases = ["pickup", "transit_to_laundromat", "processing", "packing", "transit_to_customer", "delivery"];
  const completedByStatus: Record<string, string[]> = {
    pending: [],
    scheduled_legacy: [],
    driver_assigned: [],
    pickup_in_progress: [],
    picked_up: ["pickup"],
    at_laundromat: ["pickup", "transit_to_laundromat"],
    washing: ["pickup", "transit_to_laundromat", "processing"],
    wash_complete: ["pickup", "transit_to_laundromat", "processing"],
    packing: ["pickup", "transit_to_laundromat", "processing"],
    ready_for_delivery: ["pickup", "transit_to_laundromat", "processing", "packing"],
    out_for_delivery: ["pickup", "transit_to_laundromat", "processing", "packing", "transit_to_customer"],
    delivered: allPhases,
  };
  const completed = completedByStatus[status] || [];
  return allPhases.filter(p => !completed.includes(p));
}

// ════════════════════════════════════════════════════════════════
//  VALID STATUS TRANSITIONS
// ════════════════════════════════════════════════════════════════

export const validTransitions: Record<string, string[]> = {
  ...FSM_TRANSITIONS,
  arrived_pickup: [...(FSM_TRANSITIONS.arrived_pickup || []), "pickup_failed"],
  arrived_delivery: [...(FSM_TRANSITIONS.arrived_delivery || []), "delivery_failed"],
  pickup_failed: ["scheduled", "cancelled"],
  delivery_failed: ["driver_en_route_delivery", "cancelled"],
  // P2-019: include 'scheduled' (matches order-fsm.ts:47)
  confirmed: ["scheduled", "driver_assigned", "cancelled"],
  pickup_in_progress: ["picked_up", "arrived_pickup"],
  at_laundromat: ["washing", "processing"],
  wash_complete: ["packing", "drying", "ready_for_delivery"],
  packing: ["ready_for_delivery", "folding"],
  out_for_delivery: ["delivered", "arrived_delivery"],
};

// ════════════════════════════════════════════════════════════════
//  BACKGROUND TASKS
// ════════════════════════════════════════════════════════════════

export async function startBackgroundTasks() {
  // Check consent timeouts every 60 seconds
  setInterval(async () => {
    const pending = await storage.getPendingConsents();
    for (const consent of pending) {
      if (consent.autoApproveAt && new Date(consent.autoApproveAt) < new Date()) {
        await storage.updateConsent(consent.id, {
          status: "auto_approved",
          respondedAt: now(),
        });
        await storage.createOrderEvent({
          orderId: consent.orderId,
          eventType: "consent_auto_approved",
          description: `Consent auto-approved: ${consent.consentType} \u2014 ${consent.description}`,
          actorRole: "system",
          timestamp: now(),
        });
        const order = await storage.getOrder(consent.orderId);
        if (order) {
          await notifyUser(order.customerId, order.id, "consent_request",
            "Consent Auto-Approved",
            `Your consent for "${consent.description}" was auto-approved after the timeout period.`,
            `/orders/${order.id}`
          );
        }
      }
    }
  }, 60000);

  // Check SLA status every 2 minutes
  setInterval(async () => {
    const activeOrders = await storage.getActiveOrders();
    for (const order of activeOrders) {
      if (order.slaDeadline && order.status !== "cancelled") {
        const slaStatus = checkSLAStatus(order);
        if (slaStatus !== order.slaStatus) {
          await storage.updateOrder(order.id, { slaStatus });

          if (slaStatus === "at_risk") {
            await notifyOrderUpdate(order, "Order At Risk",
              `Order ${order.orderNumber} is approaching its SLA deadline.`);
            const admins = await storage.getUsersByRole("admin");
            for (const admin of admins) {
              await notifyUser(admin.id, order.id, "sla_warning",
                "SLA Warning",
                `Order ${order.orderNumber} is at risk of breaching SLA.`,
                `/admin/orders`
              );
            }
          } else if (slaStatus === "breached") {
            await notifyOrderUpdate(order, "Order Delayed",
              `Order ${order.orderNumber} has exceeded its expected delivery time. We're working on it.`);
            await storage.createOrderEvent({
              orderId: order.id,
              eventType: "sla_breached",
              description: "SLA deadline has been breached",
              actorRole: "system",
              timestamp: now(),
            });

            const deliveryFee = order.deliveryFee || 0;
            const creditCents = dollarsToCreditCents(deliveryFee);
            // P2-021: dedup via dedicated slaCreditIssuedAt column instead of customerNotes scan
            if (creditCents > 0 && !order.slaCreditIssuedAt) {
              const customer = await storage.getUser(order.customerId);
              if (customer) {
                const currentCredits = customer.credits || 0;
                await storage.updateUser(order.customerId, { credits: currentCredits + creditCents });
                await storage.createOrderEvent({
                  orderId: order.id,
                  eventType: "sla_credit_issued",
                  description: `SLA breach credit of ${formatCents(creditCents)} issued to customer account`,
                  actorRole: "system",
                  timestamp: now(),
                });
                await notifyUser(order.customerId, order.id, "sla_credit",
                  "Delivery Credit Issued",
                  `We're sorry your order was delayed. A ${formatCents(creditCents)} credit has been applied to your account.`,
                  `/orders/${order.id}`
                );
                await storage.updateOrder(order.id, { slaCreditIssuedAt: now() });
              }
            }
          }
        }
      }
    }
  }, 120000);
}
