import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";
import type { Server as SocketIOServer } from "socket.io";
import { storage } from "./storage";
import { SLA_CONFIGS, WEIGHT_TOLERANCE, CONSENT_TIMEOUT_HOURS, LOYALTY_TIERS, SUBSCRIPTION_TIERS, PRICING_TIERS, DELIVERY_FEES, TAX_RATE as SCHEMA_TAX_RATE, QUOTE_VALIDITY_MINUTES } from "@shared/schema";
import type { Order, Vendor, Driver, Quote } from "@shared/schema";
import {
  VALID_TRANSITIONS as FSM_TRANSITIONS,
  TRANSITION_ACTORS,
  STATUS_NOTIFICATIONS,
  STATUS_LABELS,
  TIMELINE_STEPS,
  validateTransition,
  getTimestampField,
  isCancellable,
  getProgressPercent,
  LEGACY_STATUS_MAP,
} from "./order-fsm";

// ════════════════════════════════════════════════════════════════
//  PASSWORD HASHING
// ════════════════════════════════════════════════════════════════

// Password hashing using crypto.scrypt (secure, no external dependency needed)
function hashPassword(pw: string): string {
  const salt = require("crypto").randomBytes(16).toString("hex");
  const hash = require("crypto").scryptSync(pw, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(pw: string, stored: string): boolean {
  // Support legacy SHA-256 hashes during migration
  if (!stored.startsWith("scrypt:")) {
    return createHash("sha256").update(pw).digest("hex") === stored;
  }
  const [, salt, hash] = stored.split(":");
  const computed = require("crypto").scryptSync(pw, salt, 64).toString("hex");
  return computed === hash;
}

// ════════════════════════════════════════════════════════════════
//  SERVER-SIDE SESSION MANAGEMENT
// ════════════════════════════════════════════════════════════════

interface SessionData {
  userId: number;
  role: string;
  createdAt: number;
  expiresAt: number;
}

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const sessions = new Map<string, SessionData>();

function createSession(userId: number, role: string): string {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, {
    userId,
    role,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION_MS,
  });
  return token;
}

function getSession(token: string): SessionData | null {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function destroySession(token: string): void {
  sessions.delete(token);
}

// Clean up expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(token);
  }
}, 10 * 60 * 1000);

// ════════════════════════════════════════════════════════════════
//  LOGIN RATE LIMITING
// ════════════════════════════════════════════════════════════════

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip: string): boolean {
  const record = loginAttempts.get(ip);
  if (!record) return true;
  if (Date.now() - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return true;
  }
  return record.count < MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt(ip: string): void {
  const record = loginAttempts.get(ip);
  if (!record || Date.now() - record.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: Date.now() });
  } else {
    record.count++;
  }
}

// Clean up rate limit records every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of loginAttempts) {
    if (now - record.firstAttempt > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

// ════════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════

function generateOrderNumber(): string {
  const prefix = "OFF";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase().substring(0, 4);
  return `${prefix}-${ts}-${rand}`;
}

function now(): string {
  return new Date().toISOString();
}

// Haversine distance in miles
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ════════════════════════════════════════════════════════════════
//  PRICING ENGINE v2 — Real Quote-Based Pricing
// ════════════════════════════════════════════════════════════════

const TAX_RATE = SCHEMA_TAX_RATE; // 0.08875 NY combined sales tax

// Map website tier names to schema tier names
const TIER_NAME_MAP: Record<string, string> = {
  small: "small_bag", small_bag: "small_bag",
  medium: "medium_bag", medium_bag: "medium_bag",
  large: "large_bag", large_bag: "large_bag",
  xl: "xl_bag", xl_bag: "xl_bag", extra_large: "xl_bag",
};

interface QuotePriceBreakdown {
  laundryServicePrice: number;
  speedSurcharge: number;
  deliveryFee: number;
  preferredVendorSurcharge: number;
  addOnsTotal: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  lineItems: Array<{ label: string; amount: number; type: string }>;
  tierName: string;
  tierFlatPrice: number;
  tierMaxWeight: number;
  overageRate: number;
  deliverySpeed: string;
}

function calculateQuotePrice(input: {
  tierName: string;
  deliverySpeed: string;
  vendorId?: number;
  pickupLat?: number;
  pickupLng?: number;
  addOns?: Array<{ id: number; qty: number }>;
  promoCode?: string;
}): QuotePriceBreakdown {
  // 1. Resolve tier
  const normalizedTier = TIER_NAME_MAP[input.tierName] || input.tierName;
  const tier = PRICING_TIERS[normalizedTier as keyof typeof PRICING_TIERS];
  if (!tier) throw new Error(`Unknown pricing tier: ${input.tierName}`);

  // 2. Laundry service price (flat rate from tier)
  const laundryServicePrice = tier.flatPrice;

  // 3. Delivery fee (flat rate based on speed)
  const speed = (input.deliverySpeed === "express" ? "express_3h" : input.deliverySpeed === "express_24h" ? "24h" : input.deliverySpeed === "standard" ? "48h" : input.deliverySpeed) || "48h";
  if (speed && !DELIVERY_FEES[speed as keyof typeof DELIVERY_FEES]) {
    throw new Error(`Invalid delivery speed: ${speed}. Valid options: ${Object.keys(DELIVERY_FEES).join(", ")}`);
  }
  const deliveryFeeConfig = DELIVERY_FEES[speed as keyof typeof DELIVERY_FEES] || DELIVERY_FEES["48h"];
  const deliveryFee = deliveryFeeConfig.fee;

  // 4. Speed surcharge: $0 — speed cost is fully captured in the delivery fee
  const speedSurcharge = 0;

  // 5. Preferred vendor surcharge
  let preferredVendorSurcharge = 0;
  if (input.vendorId && input.pickupLat && input.pickupLng) {
    const selectedVendor = storage.getVendor(input.vendorId);
    if (selectedVendor && selectedVendor.lat && selectedVendor.lng) {
      // Find nearest eligible vendor for comparison
      const activeVendors = storage.getActiveVendors().filter(v => v.lat && v.lng);
      if (activeVendors.length > 0) {
        const nearestDist = Math.min(...activeVendors.map(v => distanceMiles(input.pickupLat!, input.pickupLng!, v.lat!, v.lng!)));
        const selectedDist = distanceMiles(input.pickupLat, input.pickupLng, selectedVendor.lat, selectedVendor.lng);
        const deltaMiles = Math.max(0, selectedDist - Math.max(nearestDist, 1)); // Free within 1-mile radius
        preferredVendorSurcharge = Math.min(15, Math.round(deltaMiles * 2 * 100) / 100); // $2/mile, cap $15
      }
    }
  }

  // 6. Add-ons
  let addOnsTotal = 0;
  const addOnItems: Array<{ id: number; name: string; price: number; qty: number }> = [];
  if (input.addOns && input.addOns.length > 0) {
    for (const ao of input.addOns) {
      const addon = storage.getAddOn(ao.id);
      if (addon) {
        const lineTotal = Math.round(addon.price * ao.qty * 100) / 100;
        addOnsTotal += lineTotal;
        addOnItems.push({ id: addon.id, name: addon.displayName, price: addon.price, qty: ao.qty });
      }
    }
  }

  // 7. Subtotal
  const subtotal = Math.round((laundryServicePrice + speedSurcharge + deliveryFee + preferredVendorSurcharge + addOnsTotal) * 100) / 100;

  // 8. Tax
  const taxAmount = Math.round(subtotal * TAX_RATE * 100) / 100;

  // 9. Promo discount
  let discount = 0;
  if (input.promoCode) {
    const promo = storage.getPromoCode(input.promoCode);
    if (promo && promo.isActive && (!promo.expiresAt || new Date(promo.expiresAt) > new Date())) {
      if (!promo.minOrderAmount || (subtotal + taxAmount) >= promo.minOrderAmount) {
        if (!promo.maxUses || (promo.usedCount ?? 0) < promo.maxUses) {
          if (promo.type === "percentage") {
            discount = Math.round((subtotal + taxAmount) * (promo.value / 100) * 100) / 100;
          } else if (promo.type === "fixed") {
            discount = Math.min(promo.value, subtotal + taxAmount);
          } else if (promo.type === "free_delivery") {
            discount = deliveryFee;
          }
        }
      }
    }
  }

  // 10. Total
  const total = Math.max(0, Math.round((subtotal + taxAmount - discount) * 100) / 100);

  // Build line items for display
  const lineItems: Array<{ label: string; amount: number; type: string }> = [
    { label: `${tier.displayName} — ${tier.description}`, amount: laundryServicePrice, type: "service" },
  ];
  if (deliveryFee > 0) {
    lineItems.push({ label: deliveryFeeConfig.label, amount: deliveryFee, type: "delivery" });
  } else {
    lineItems.push({ label: "Free Pickup & Delivery", amount: 0, type: "delivery" });
  }
  if (preferredVendorSurcharge > 0) {
    lineItems.push({ label: "Preferred laundromat surcharge", amount: preferredVendorSurcharge, type: "logistics" });
  }
  for (const ao of addOnItems) {
    lineItems.push({ label: `${ao.name} x${ao.qty}`, amount: ao.price * ao.qty, type: "addon" });
  }
  lineItems.push({ label: "Tax (8.875%)", amount: taxAmount, type: "tax" });
  if (discount > 0) {
    lineItems.push({ label: `Promo discount (${input.promoCode})`, amount: -discount, type: "discount" });
  }

  return {
    laundryServicePrice, speedSurcharge, deliveryFee, preferredVendorSurcharge,
    addOnsTotal, subtotal, taxRate: TAX_RATE, taxAmount, discount, total,
    lineItems, tierName: normalizedTier, tierFlatPrice: tier.flatPrice,
    tierMaxWeight: tier.maxWeight, overageRate: tier.overageRate, deliverySpeed: speed,
  };
}

function generateQuoteNumber(): string {
  const prefix = "QT";
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString("hex").toUpperCase().substring(0, 4);
  return `${prefix}-${ts}-${rand}`;
}

// Legacy pricing function — used by existing POST /api/orders for backward compat
function calculatePricing(bags: any[], deliverySpeed: string) {
  // Use tier-based pricing when possible
  let subtotal = 0;
  for (const bag of bags) {
    const tierKey = TIER_NAME_MAP[bag.type];
    if (tierKey) {
      const tier = PRICING_TIERS[tierKey as keyof typeof PRICING_TIERS];
      subtotal += tier.flatPrice * (bag.quantity || 1);
    } else {
      subtotal += 24.99 * (bag.quantity || 1); // fallback to small bag
    }
  }
  const normalizedSpeed = deliverySpeed === "express" ? "express_3h" : deliverySpeed === "express_24h" ? "24h" : deliverySpeed === "standard" ? "48h" : deliverySpeed;
  const deliveryFeeConfig = DELIVERY_FEES[normalizedSpeed as keyof typeof DELIVERY_FEES] || DELIVERY_FEES["48h"];
  const deliveryFee = deliveryFeeConfig.fee;
  const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
  const total = Math.round((subtotal + tax + deliveryFee) * 100) / 100;
  return { subtotal, tax, deliveryFee, total };
}

// ════════════════════════════════════════════════════════════════
//  AUTO-DISPATCH ENGINE
// ════════════════════════════════════════════════════════════════

function scoreVendor(vendor: Vendor, order: Order, pickupLat: number, pickupLng: number): number {
  let score = 0;

  // 1. Distance from pickup (closer = better, max 40 pts)
  if (vendor.lat && vendor.lng) {
    const dist = distanceMiles(pickupLat, pickupLng, vendor.lat, vendor.lng);
    score += Math.max(0, 40 - dist * 4); // lose 4 pts per mile
  }

  // 2. Available capacity (max 25 pts)
  const capacity = vendor.capacity || 50;
  const load = vendor.currentLoad || 0;
  const availableRatio = (capacity - load) / capacity;
  score += availableRatio * 25;

  // 3. Performance tier (max 20 pts)
  const tierScore: Record<string, number> = { elite: 20, premium: 14, standard: 8 };
  score += tierScore[vendor.performanceTier || "standard"] || 8;

  // 4. Rating (max 10 pts)
  score += (vendor.rating || 4.0) * 2;

  // 5. Capability match (max 5 pts)
  let prefs: any = {};
  try { prefs = order.preferences ? JSON.parse(order.preferences) : {}; } catch (_) {}
  let caps: any[] = [];
  try { caps = vendor.capabilities ? JSON.parse(vendor.capabilities) : []; } catch (_) {}
  if (!prefs.washType || caps.includes(prefs.washType) || caps.includes("custom")) {
    score += 5;
  }

  // 6. Certified bonus
  if (order.certifiedOnly && vendor.certified) score += 5;

  return Math.round(score * 10) / 10;
}

function scoreDriver(driver: Driver, pickupLat: number, pickupLng: number): number {
  let score = 0;

  // 1. Distance (max 40 pts)
  if (driver.currentLat && driver.currentLng) {
    const dist = distanceMiles(pickupLat, pickupLng, driver.currentLat, driver.currentLng);
    score += Math.max(0, 40 - dist * 5);
  } else {
    score += 20; // default mid-score if no location
  }

  // 2. Rating (max 25 pts)
  score += (driver.rating || 4.0) * 5;

  // 3. Experience (max 20 pts)
  const trips = driver.completedTrips || 0;
  score += Math.min(20, trips / 20);

  // 4. Workload balance — fewer today trips = higher score (max 15 pts)
  const todayTrips = driver.todayTrips || 0;
  score += Math.max(0, 15 - todayTrips * 3);

  return Math.round(score * 10) / 10;
}

function findBestVendor(order: Order, pickupLat: number, pickupLng: number): Vendor | null {
  const activeVendors = storage.getActiveVendors();
  if (activeVendors.length === 0) return null;

  const scored = activeVendors
    .filter(v => {
      // Filter out vendors at capacity
      const cap = v.capacity || 50;
      const load = v.currentLoad || 0;
      return load < cap;
    })
    .filter(v => {
      // If certified-only required, filter
      if (order.certifiedOnly) return v.certified === 1;
      return true;
    })
    .map(v => ({ vendor: v, score: scoreVendor(v, order, pickupLat, pickupLng) }))
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].vendor : null;
}

function findBestDriver(pickupLat: number, pickupLng: number): Driver | null {
  const available = storage.getAvailableDrivers();
  if (available.length === 0) return null;

  const scored = available
    .map(d => ({ driver: d, score: scoreDriver(d, pickupLat, pickupLng) }))
    .sort((a, b) => b.score - a.score);

  return scored[0].driver;
}

// ════════════════════════════════════════════════════════════════
//  SLA ENGINE
// ════════════════════════════════════════════════════════════════

function calculateSLADeadline(deliverySpeed: string, createdAt: string): string {
  const config = SLA_CONFIGS[deliverySpeed as keyof typeof SLA_CONFIGS] || SLA_CONFIGS["48h"];
  const created = new Date(createdAt);
  created.setHours(created.getHours() + config.hours);
  return created.toISOString();
}

function checkSLAStatus(order: Order): "on_track" | "at_risk" | "breached" {
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

function notifyUser(userId: number, orderId: number | null, type: string, title: string, body: string, actionUrl?: string) {
  storage.createNotification({
    userId,
    orderId,
    type,
    title,
    body,
    actionUrl,
    createdAt: now(),
  });
}

function notifyOrderUpdate(order: Order, title: string, body: string) {
  // Notify customer
  notifyUser(order.customerId, order.id, "order_update", title, body, `/orders/${order.id}`);
}

// Socket.io emit helper — safe no-op when io is not available
let _io: SocketIOServer | undefined;
function setIO(socketIO?: SocketIOServer) { _io = socketIO; }

function emitToUser(userId: number, event: string, data: any) {
  if (_io) _io.to(`user:${userId}`).emit(event, data);
}

function emitToOrder(orderId: number, event: string, data: any) {
  if (_io) _io.to(`order:${orderId}`).emit(event, data);
}

function emitToRole(role: string, event: string, data: any) {
  if (_io) _io.to(`role:${role}`).emit(event, data);
}

function emitNotification(userId: number, notification: any) {
  emitToUser(userId, "notification", notification);
}

// Enhanced notifyUser that also emits via Socket.io
function notifyAndEmit(userId: number, orderId: number | null, type: string, title: string, body: string, actionUrl?: string) {
  const notification = storage.createNotification({
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

function getOrderOwnershipAllowed(order: any, user: any, driverRecord?: any, vendorRecord?: any): boolean {
  const role = user.role;
  if (role === "admin" || role === "manager") return true;
  if (role === "customer" && order.customerId === user.id) return true;
  if (role === "driver" && driverRecord && order.driverId === driverRecord.id) return true;
  if (["laundromat","vendor"].includes(role) && vendorRecord && order.vendorId === vendorRecord.id) return true;
  if (role === "support") return true;
  return false;
}

// ════════════════════════════════════════════════════════════════
//  FINANCIAL ENGINE
// ════════════════════════════════════════════════════════════════

function calculatePayouts(order: Order) {
  const vendor = order.vendorId ? storage.getVendor(order.vendorId) : null;
  const payoutRate = (vendor as any)?.payoutRate || 0.65;
  const vendorPayout = Math.round((order.subtotal || 0) * payoutRate * 100) / 100;
  const driverPayout = 8.50 * 2; // $8.50 per trip (pickup + delivery = 2 trips)
  return { vendorPayout, driverPayout };
}

function processPaymentCapture(order: Order) {
  if (order.paymentStatus === "captured") return;
  // In a real system, this would call Stripe/payment gateway
  // For now, we simulate the capture
  storage.updateOrder(order.id, {
    paymentStatus: "captured",
  });

  // Calculate and record payouts
  const { vendorPayout, driverPayout } = calculatePayouts(order);
  storage.updateOrder(order.id, { vendorPayout, driverPayout });

  // Update vendor earnings
  if (order.vendorId) {
    const vendor = storage.getVendor(order.vendorId);
    if (vendor) {
      storage.updateVendor(vendor.id, {
        totalEarnings: (vendor.totalEarnings || 0) + vendorPayout,
        pendingPayout: (vendor.pendingPayout || 0) + vendorPayout,
      });
    }
  }

  // Update driver earnings
  if (order.driverId) {
    const driver = storage.getDriver(order.driverId);
    if (driver) {
      storage.updateDriver(driver.id, {
        totalEarnings: (driver.totalEarnings || 0) + driverPayout,
        pendingPayout: (driver.pendingPayout || 0) + driverPayout,
        completedTrips: (driver.completedTrips || 0) + 1,
      });
    }
  }

  return { vendorPayout, driverPayout };
}

// ════════════════════════════════════════════════════════════════
//  LOYALTY ENGINE
// ════════════════════════════════════════════════════════════════

function getLoyaltyTier(points: number): string {
  if (points >= LOYALTY_TIERS.platinum.minPoints) return "platinum";
  if (points >= LOYALTY_TIERS.gold.minPoints) return "gold";
  if (points >= LOYALTY_TIERS.silver.minPoints) return "silver";
  return "bronze";
}

function awardLoyaltyPoints(userId: number, orderId: number, orderTotal: number) {
  const user = storage.getUser(userId);
  if (!user) return;

  // Base points: 10 per $1 spent
  const tier = user.loyaltyTier || "bronze";
  const multiplier = LOYALTY_TIERS[tier as keyof typeof LOYALTY_TIERS]?.multiplier || 1.0;
  const basePoints = Math.floor(orderTotal * 10);
  const pointsEarned = Math.floor(basePoints * multiplier);

  // Subscription bonus
  let bonusMultiplier = 1.0;
  if (user.subscriptionTier && SUBSCRIPTION_TIERS[user.subscriptionTier as keyof typeof SUBSCRIPTION_TIERS]) {
    bonusMultiplier = SUBSCRIPTION_TIERS[user.subscriptionTier as keyof typeof SUBSCRIPTION_TIERS].pointsBonus;
  }
  const finalPoints = Math.floor(pointsEarned * bonusMultiplier);

  const newTotal = (user.loyaltyPoints || 0) + finalPoints;
  const newTier = getLoyaltyTier(newTotal);

  storage.updateUser(userId, {
    loyaltyPoints: newTotal,
    loyaltyTier: newTier,
    totalOrders: (user.totalOrders || 0) + 1,
    totalSpent: (user.totalSpent || 0) + orderTotal,
  });

  storage.createLoyaltyTransaction({
    userId,
    orderId,
    type: "earned",
    points: finalPoints,
    description: `Earned ${finalPoints} points for order #${orderId} ($${orderTotal.toFixed(2)} × ${multiplier}x tier multiplier)`,
    createdAt: now(),
  });

  storage.updateOrder(orderId, { loyaltyPointsEarned: finalPoints });

  // Tier upgrade notification
  if (newTier !== tier) {
    notifyUser(userId, null, "loyalty",
      `Tier Upgrade: ${newTier.charAt(0).toUpperCase() + newTier.slice(1)}!`,
      `Congratulations! You've been upgraded to ${newTier} tier with ${newTotal} points.`,
      "/profile"
    );
  }
}

// ════════════════════════════════════════════════════════════════
//  SURGE PRICING ENGINE
// ════════════════════════════════════════════════════════════════

const US_HOLIDAYS_2026 = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25",
  "2026-07-04", "2026-09-07", "2026-11-26", "2026-12-25",
];

function getSurgePricingTier(pickupTime?: string): { tier: string; multiplier: number; reason: string } {
  const dt = pickupTime ? new Date(pickupTime) : new Date();
  const hour = dt.getHours();
  const dayOfWeek = dt.getDay(); // 0=Sun, 6=Sat
  const dateStr = dt.toISOString().split("T")[0];

  // Holiday check
  if (US_HOLIDAYS_2026.includes(dateStr)) {
    return { tier: "holiday", multiplier: 1.5, reason: "Holiday surge pricing" };
  }

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { tier: "weekend", multiplier: 1.15, reason: "Weekend demand pricing" };
  }

  // Peak hours: 6-9am or 5-8pm on weekdays
  if ((hour >= 6 && hour < 9) || (hour >= 17 && hour < 20)) {
    return { tier: "peak", multiplier: 1.2, reason: "Peak hour pricing" };
  }

  // Off-peak hours: late night
  if (hour < 6 || hour >= 22) {
    return { tier: "off_peak", multiplier: 0.9, reason: "Off-peak discount" };
  }

  return { tier: "normal", multiplier: 1.0, reason: "Standard pricing" };
}

function getDemandMultiplier(serviceType: string): number {
  const vendors = storage.getActiveVendors();
  if (vendors.length === 0) return 1.0;

  const totalCapacity = vendors.reduce((sum, v) => sum + (v.capacity || 50), 0);
  const totalLoad = vendors.reduce((sum, v) => sum + (v.currentLoad || 0), 0);
  const utilization = totalCapacity > 0 ? totalLoad / totalCapacity : 0;

  // High demand: > 80% utilization
  if (utilization > 0.8) return 1.15;
  // Moderate demand: > 60%
  if (utilization > 0.6) return 1.08;
  // Low demand: < 30%
  if (utilization < 0.3) return 0.95;
  return 1.0;
}

// ════════════════════════════════════════════════════════════════
//  AI CHATBOT ENGINE
// ════════════════════════════════════════════════════════════════

type ChatIntent = "order_status" | "reschedule" | "cancel" | "complaint" | "pricing" | "general" | "loyalty" | "subscription";

function detectIntent(message: string): ChatIntent {
  const lower = message.toLowerCase();

  if (lower.match(/\b(where|status|track|locate|order|pickup|delivery|when|eta|arrival)\b/)) {
    return "order_status";
  }
  if (lower.match(/\b(reschedule|change|move|postpone|different time|new time)\b/)) {
    return "reschedule";
  }
  if (lower.match(/\b(cancel|cancellation|stop|refund)\b/)) {
    return "cancel";
  }
  if (lower.match(/\b(complaint|issue|problem|missing|damaged|wrong|bad|terrible|awful|lost|broken)\b/)) {
    return "complaint";
  }
  if (lower.match(/\b(price|cost|fee|charge|how much|expensive|cheap|discount|promo|coupon)\b/)) {
    return "pricing";
  }
  if (lower.match(/\b(points|loyalty|tier|rewards|silver|gold|platinum|bronze)\b/)) {
    return "loyalty";
  }
  if (lower.match(/\b(subscription|plan|upgrade|basic|plus|premium|membership)\b/)) {
    return "subscription";
  }

  return "general";
}

function generateAIResponse(intent: ChatIntent, userId: number, message: string): { response: string; resolved: boolean; escalate: boolean } {
  switch (intent) {
    case "order_status": {
      const userOrders = storage.getOrdersByCustomer(userId);
      const activeOrders = userOrders.filter(o => !["delivered", "cancelled"].includes(o.status));
      if (activeOrders.length === 0) {
        const lastDelivered = userOrders.find(o => o.status === "delivered");
        if (lastDelivered) {
          return {
            response: `Your last order (${lastDelivered.orderNumber}) was delivered on ${lastDelivered.deliveredAt ? new Date(lastDelivered.deliveredAt).toLocaleDateString() : "recently"}. You have no active orders right now. Would you like to schedule a new pickup?`,
            resolved: true,
            escalate: false,
          };
        }
        return {
          response: "You don't have any active orders at the moment. Would you like to schedule your first pickup? Just head to the home screen to get started!",
          resolved: true,
          escalate: false,
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
        response: `Your order **${order.orderNumber}** ${statusMsg[order.status] || "is being processed"}. ${order.slaDeadline ? `Estimated delivery by ${new Date(order.slaDeadline).toLocaleString()}.` : ""} Is there anything else I can help you with?`,
        resolved: true,
        escalate: false,
      };
    }

    case "reschedule": {
      return {
        response: "To reschedule your pickup, please go to your order details and tap 'Reschedule'. You can change your pickup time up to 2 hours before the scheduled time. If your driver has already been assigned, please call us at (305) 555-0100 and we'll arrange it for you.",
        resolved: true,
        escalate: false,
      };
    }

    case "cancel": {
      const activeOrders = storage.getOrdersByCustomer(userId).filter(o =>
        ["pending", "scheduled", "driver_assigned"].includes(o.status)
      );
      if (activeOrders.length > 0) {
        return {
          response: `I can help you cancel your order **${activeOrders[0].orderNumber}**. Please note that cancellations are free before the driver is dispatched. To proceed, go to your order details and tap 'Cancel Order', or I can escalate this to our team who can process it immediately. Would you like me to connect you with a team member?`,
          resolved: false,
          escalate: true,
        };
      }
      return {
        response: "You don't have any cancellable orders at this time. Orders can only be cancelled before the pickup is completed. If you have concerns about a delivered order, I can help you file a dispute.",
        resolved: true,
        escalate: false,
      };
    }

    case "complaint": {
      return {
        response: "I'm sorry to hear you're having an issue! Your satisfaction is our top priority. To ensure this is handled properly, I'm escalating your concern to our customer care team. They'll reach out within 2 hours. In the meantime, you can also file a formal dispute from your order details page, which initiates our resolution process immediately.",
        resolved: false,
        escalate: true,
      };
    }

    case "pricing": {
      return {
        response: "Our pricing uses flat-rate bag sizes:\n\n• **Small Bag**: $24.99 (up to 10 lbs)\n• **Medium Bag**: $44.99 (up to 20 lbs)\n• **Large Bag**: $59.99 (up to 30 lbs)\n• **XL Bag**: $89.99 (up to 50 lbs)\n\nDelivery options: Standard (48h) is free, Next Day (24h) +$5.99, Same Day +$12.99, Express (3h) +$19.99. If your laundry goes over the bag weight limit, it's $2.50 per extra pound. Tax is 8.875% (NYC). Try promo code **WELCOME20** for 20% off your first order!",
        resolved: true,
        escalate: false,
      };
    }

    case "loyalty": {
      const user = storage.getUser(userId);
      const points = user?.loyaltyPoints || 0;
      const tier = user?.loyaltyTier || "bronze";
      const tierInfo = LOYALTY_TIERS[tier as keyof typeof LOYALTY_TIERS];
      return {
        response: `You currently have **${points} loyalty points** and you're a **${tier.charAt(0).toUpperCase() + tier.slice(1)} member**! 🌟\n\nYour tier perks include: ${tierInfo.perks.join(", ")}.\n\n100 points = $1 discount on your next order. You can redeem points from the checkout screen. Keep washing to level up!`,
        resolved: true,
        escalate: false,
      };
    }

    case "subscription": {
      return {
        response: "We offer three subscription plans:\n\n• **Basic** ($19.99/mo): 4 free deliveries, 5% off, 1.25x points\n• **Plus** ($39.99/mo): 10 free deliveries, 10% off, 1.5x points\n• **Premium** ($69.99/mo): Unlimited free deliveries, 15% off, 2x points, priority support\n\nYou can upgrade from your profile page. All plans renew monthly and can be cancelled anytime.",
        resolved: true,
        escalate: false,
      };
    }

    default: {
      return {
        response: "Hi! I'm Offload's AI assistant. I can help you with:\n\n• **Order status** — track your active orders\n• **Pricing** — get a quote\n• **Cancellations** — cancel or reschedule\n• **Loyalty points** — check your rewards\n• **Subscriptions** — manage your plan\n• **Issues** — file a complaint\n\nWhat can I help you with today?",
        resolved: false,
        escalate: false,
      };
    }
  }
}

// ════════════════════════════════════════════════════════════════
//  VENDOR HEALTH SCORING
// ════════════════════════════════════════════════════════════════

function calculateVendorHealthScore(vendor: Vendor): {
  score: number;
  breakdown: Record<string, number>;
  recommendations: string[];
} {
  const ratingScore = ((vendor.rating || 4.0) / 5.0) * 25;
  const onTimeScore = (vendor.onTimeRate || 0.95) * 25;
  const disputeScore = (1 - (vendor.disputeRate || 0.02)) * 20;
  const processingScore = Math.max(0, (300 - (vendor.avgProcessingTime || 180)) / 300) * 15;
  const capacityUtil = (vendor.currentLoad || 0) / (vendor.capacity || 50);
  // Optimal utilization is 60-80%, penalize extremes
  const capacityScore = capacityUtil < 0.3 ? capacityUtil / 0.3 * 15
    : capacityUtil > 0.9 ? (1 - capacityUtil) / 0.1 * 15
    : 15;

  const totalScore = Math.round((ratingScore + onTimeScore + disputeScore + processingScore + capacityScore) * 10) / 10;

  const recommendations: string[] = [];
  if ((vendor.rating || 0) < 4.0) recommendations.push("Rating below 4.0 — review customer feedback and improve quality control");
  if ((vendor.onTimeRate || 0) < 0.85) recommendations.push("On-time rate below 85% — consider adjusting capacity or staffing");
  if ((vendor.disputeRate || 0) > 0.05) recommendations.push("High dispute rate — investigate common complaint patterns");
  if ((vendor.avgProcessingTime || 0) > 240) recommendations.push("Processing time exceeds 4 hours — streamline workflow");
  if (capacityUtil > 0.9) recommendations.push("Near full capacity — consider hiring additional staff or limiting new orders");
  if (capacityUtil < 0.2) recommendations.push("Very low utilization — consider marketing campaigns or promotional pricing");
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

function calculateFraudRisk(orderId: number): {
  riskScore: number;
  flags: string[];
  autoFlagged: boolean;
} {
  const order = storage.getOrder(orderId);
  if (!order) return { riskScore: 0, flags: [], autoFlagged: false };

  const flags: string[] = [];
  let riskScore = 0;

  // 1. New account with high-value order
  const customer = storage.getUser(order.customerId);
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

  // 2. Unusual order frequency
  const recentOrders = storage.getOrdersByCustomer(order.customerId);
  const last24h = recentOrders.filter(o => {
    const created = new Date(o.createdAt);
    return (Date.now() - created.getTime()) < 24 * 60 * 60 * 1000;
  });
  if (last24h.length > 5) {
    flags.push(`Unusual order frequency: ${last24h.length} orders in last 24 hours`);
    riskScore += 25;
  }

  // 3. Weight discrepancy
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

  // 4. Multiple addresses in short time (possible fraud indicator)
  const customerAddresses = storage.getAddressesByUser(order.customerId);
  if (customerAddresses.length > 5 && customer) {
    const memberSince = customer.memberSince ? new Date(customer.memberSince) : new Date();
    const daysSinceMember = (Date.now() - memberSince.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceMember < 30) {
      flags.push(`${customerAddresses.length} addresses on a new account`);
      riskScore += 15;
    }
  }

  // 5. Very large bag count
  try {
    const bags = JSON.parse(order.bags || "[]");
    const totalBags = bags.reduce((sum: number, b: any) => sum + (b.quantity || 1), 0);
    if (totalBags > 10) {
      flags.push(`Unusually large order: ${totalBags} bags`);
      riskScore += 10;
    }
  } catch (_) {}

  // 6. High value with first-time promo code
  if (order.promoCode && (order.total || 0) > 150) {
    flags.push("Promo code applied to high-value order");
    riskScore += 10;
  }

  const autoFlagged = riskScore > 70;

  return {
    riskScore: Math.min(100, riskScore),
    flags,
    autoFlagged,
  };
}

// ════════════════════════════════════════════════════════════════
//  PREDICTIVE ETA ENGINE
// ════════════════════════════════════════════════════════════════

function calculatePredictiveETA(orderId: number): {
  phases: Array<{ phase: string; estimatedMinutes: number; estimatedAt: string }>;
  totalEstimatedMinutes: number;
  estimatedDelivery: string;
} {
  const order = storage.getOrder(orderId);
  if (!order) return { phases: [], totalEstimatedMinutes: 0, estimatedDelivery: new Date().toISOString() };

  const vendor = order.vendorId ? storage.getVendor(order.vendorId) : null;
  const driver = order.driverId ? storage.getDriver(order.driverId) : null;
  const addr = storage.getAddress(order.pickupAddressId);

  const now_ = new Date();
  const hour = now_.getHours();
  const dayOfWeek = now_.getDay();

  // Time-of-day factor
  const timeOfDayFactor = (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20) ? 1.3 : 1.0;
  // Day-of-week factor
  const dayFactor = dayOfWeek === 1 ? 1.2 : dayOfWeek === 0 || dayOfWeek === 6 ? 0.9 : 1.0; // Monday is busiest

  // Driver pickup time
  const avgPickupMins = driver?.avgPickupTime || 15;
  const pickupDistance = (vendor?.lat && addr?.lat)
    ? distanceMiles(addr.lat, addr.lng!, vendor.lat, vendor.lng!)
    : 2;
  const drivingMins = Math.round(pickupDistance * 4); // ~4 min/mile
  const pickupMins = Math.round((avgPickupMins + drivingMins) * timeOfDayFactor);

  // Vendor processing time
  const vendorProcessMins = Math.round((vendor?.avgProcessingTime || 180) * dayFactor);

  // Delivery time (return trip)
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

  return {
    phases,
    totalEstimatedMinutes: totalMins,
    estimatedDelivery: cursor.toISOString(),
  };
}

function getRemainingPhases(status: string): string[] {
  const allPhases = ["pickup", "transit_to_laundromat", "processing", "packing", "transit_to_customer", "delivery"];
  const completedByStatus: Record<string, string[]> = {
    pending: [],
    scheduled_legacy: [], // legacy "confirmed" state mapped to scheduled
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
//  VALID STATUS TRANSITIONS (uses FSM from order-fsm.ts)
//  Legacy map kept for backward compatibility — routes through FSM
// ════════════════════════════════════════════════════════════════

const validTransitions: Record<string, string[]> = {
  // New 16-state FSM transitions
  ...FSM_TRANSITIONS,
  // Extended states for failure handling
  arrived_pickup: [...(FSM_TRANSITIONS.arrived_pickup || []), "pickup_failed"],
  arrived_delivery: [...(FSM_TRANSITIONS.arrived_delivery || []), "delivery_failed"],
  pickup_failed: ["scheduled", "cancelled"],
  delivery_failed: ["driver_en_route_delivery", "cancelled"],
  // Legacy aliases for backward compat — old statuses that map to new
  confirmed: ["driver_assigned", "cancelled"],
  pickup_in_progress: ["picked_up", "arrived_pickup"],
  at_laundromat: ["washing", "processing"],
  wash_complete: ["packing", "drying"],
  packing: ["ready_for_delivery", "folding"],
  out_for_delivery: ["delivered", "arrived_delivery"],
  disputed: [],
};

// ════════════════════════════════════════════════════════════════
//  MIDDLEWARE
// ════════════════════════════════════════════════════════════════

function requireAuth(allowedRoles?: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Extract token from Authorization header: "Bearer <token>"
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

    let userId: number | null = null;

    if (token) {
      const session = getSession(token);
      if (!session) {
        return res.status(401).json({ error: "Session expired or invalid" });
      }
      userId = session.userId;
    }

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: "Invalid user" });
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    (req as any).currentUser = user;
    next();
  };
}

// ════════════════════════════════════════════════════════════════
//  BACKGROUND TASKS (consent timeout, SLA checks)
// ════════════════════════════════════════════════════════════════

function startBackgroundTasks() {
  // Check consent timeouts every 60 seconds
  setInterval(() => {
    const pending = storage.getPendingConsents();
    for (const consent of pending) {
      if (consent.autoApproveAt && new Date(consent.autoApproveAt) < new Date()) {
        storage.updateConsent(consent.id, {
          status: "auto_approved",
          respondedAt: now(),
        });
        // Log event
        storage.createOrderEvent({
          orderId: consent.orderId,
          eventType: "consent_auto_approved",
          description: `Consent auto-approved: ${consent.consentType} — ${consent.description}`,
          actorRole: "system",
          timestamp: now(),
        });
        // Notify customer
        const order = storage.getOrder(consent.orderId);
        if (order) {
          notifyUser(order.customerId, order.id, "consent_request",
            "Consent Auto-Approved",
            `Your consent for "${consent.description}" was auto-approved after the timeout period.`,
            `/orders/${order.id}`
          );
        }
      }
    }
  }, 60000);

  // Check SLA status every 2 minutes
  setInterval(() => {
    const activeOrders = storage.getActiveOrders();
    for (const order of activeOrders) {
      if (order.slaDeadline && order.status !== "cancelled") {
        const slaStatus = checkSLAStatus(order);
        if (slaStatus !== order.slaStatus) {
          storage.updateOrder(order.id, { slaStatus });

          if (slaStatus === "at_risk") {
            notifyOrderUpdate(order, "Order At Risk",
              `Order ${order.orderNumber} is approaching its SLA deadline.`);
            // Notify admin
            const admins = storage.getUsersByRole("admin");
            admins.forEach(admin => {
              notifyUser(admin.id, order.id, "sla_warning",
                "SLA Warning",
                `Order ${order.orderNumber} is at risk of breaching SLA.`,
                `/admin/orders`
              );
            });
          } else if (slaStatus === "breached") {
            notifyOrderUpdate(order, "Order Delayed",
              `Order ${order.orderNumber} has exceeded its expected delivery time. We're working on it.`);
            storage.createOrderEvent({
              orderId: order.id,
              eventType: "sla_breached",
              description: "SLA deadline has been breached",
              actorRole: "system",
              timestamp: now(),
            });
          }
        }
      }
    }
  }, 120000);
}

// ════════════════════════════════════════════════════════════════
//  ROUTE REGISTRATION
// ════════════════════════════════════════════════════════════════


// ── RATE LIMITING ──
const rateLimitBuckets: Record<string, { count: number; resetAt: number }> = {};
const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  "POST:/api/auth/register": { maxRequests: 5, windowMs: 60000 },
  "POST:/api/orders": { maxRequests: 20, windowMs: 60000 },
  "POST:/api/messages": { maxRequests: 30, windowMs: 60000 },
  "POST:/api/pricing/calculate": { maxRequests: 60, windowMs: 60000 },
  "POST:/api/disputes": { maxRequests: 5, windowMs: 60000 },
};

function checkRateLimit(method: string, path: string, ip: string): boolean {
  const routeKey = `${method}:${path}`;
  const limit = RATE_LIMITS[routeKey];
  if (!limit) return true; // No limit for this route
  
  const bucketKey = `${routeKey}:${ip}`;
  const now = Date.now();
  const bucket = rateLimitBuckets[bucketKey];
  
  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets[bucketKey] = { count: 1, resetAt: now + limit.windowMs };
    return true;
  }
  
  if (bucket.count >= limit.maxRequests) return false;
  bucket.count++;
  return true;
}

// Clean up expired buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(rateLimitBuckets)) {
    if (rateLimitBuckets[key].resetAt < now) delete rateLimitBuckets[key];
  }
}, 300000);



// ── IDEMPOTENCY KEY CACHE ──
const idempotencyCache: Record<string, { response: any; statusCode: number; expiresAt: number }> = {};

function getIdempotentResponse(key: string): { response: any; statusCode: number } | null {
  const cached = idempotencyCache[key];
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    delete idempotencyCache[key];
    return null;
  }
  return { response: cached.response, statusCode: cached.statusCode };
}

function setIdempotentResponse(key: string, response: any, statusCode: number): void {
  idempotencyCache[key] = { response, statusCode, expiresAt: Date.now() + 86400000 }; // 24h
}

// Clean up expired idempotency keys every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(idempotencyCache)) {
    if (idempotencyCache[key].expiresAt < now) delete idempotencyCache[key];
  }
}, 600000);



// ── INPUT SANITIZATION ──
function sanitizeInput(input: string, maxLength = 5000): string {
  if (!input || typeof input !== "string") return "";
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, "") // Strip script tags
    .replace(/on\w+="[^"]*"/gi, "")               // Strip event handlers
    .trim()
    .substring(0, maxLength);
}


export async function registerRoutes(
  httpServer: Server,
  app: Express,
  io?: SocketIOServer,
): Promise<Server> {

  // Set Socket.io reference for emit helpers
  setIO(io);

  // Seed WELCOME20 promo code if it doesn't exist
  const welcome = storage.getPromoCode("WELCOME20");
  if (!welcome) {
    storage.createPromoCode({
      code: "WELCOME20",
      type: "percentage",
      value: 20,
      maxUses: 10000,
      usedCount: 0,
      isActive: 1,
      minOrderAmount: 0,
      expiresAt: null,
    });
  }

  // ── Security headers + CORS for website ──
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Allow cross-origin requests from the marketing site and deployed site
    const origin = req.headers.origin;
    const allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000", "https://offloadusa.com", "http://offloadusa.com"];
    if (origin && allowedOrigins.some(o => origin.startsWith(o))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });

  // Start background tasks
  startBackgroundTasks();

  // ── HEALTH CHECK ──
  app.get("/api/health", (_req, res) => {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    res.json({
      status: "healthy",
      uptime: Math.floor(uptime),
      memory: {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || "1.0.0",
      environment: process.env.NODE_ENV || "development",
    });
  });

  // ── REQUEST BODY SIZE LIMIT ──
  app.use("/api/", (req, res, next) => {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    if (contentLength > 1048576) { // 1MB limit
      return res.status(413).json({ error: "Request body too large" });
    }
    next();
  });

  // ── RATE LIMITING MIDDLEWARE ──
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const routePath = req.path.replace(/\/\d+/g, "/:id");
    if (!checkRateLimit(req.method, routePath, ip)) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    next();
  });

  // ── IDEMPOTENCY MIDDLEWARE ──
  app.use("/api/", (req, res, next) => {
    if ((req.method === "POST" || req.method === "PATCH") && req.headers["idempotency-key"]) {
      const key = req.headers["idempotency-key"] as string;
      const cached = getIdempotentResponse(key);
      if (cached) {
        return res.status(cached.statusCode).json(cached.response);
      }
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        setIdempotentResponse(key, body, res.statusCode);
        return originalJson(body);
      };
    }
    next();
  });

  // ─────────────────────────────────────────────────────────
  //  SEED DATA — REMOVED FOR PRODUCTION
  // ─────────────────────────────────────────────────────────

  app.post("/api/seed", (_req, res) => {
    return res.status(404).json({ error: "Not found" });
  });


  // ─────────────────────────────────────────────────────────
  //  AUTH
  // ─────────────────────────────────────────────────────────

  app.post("/api/auth/register", (req, res) => {
    const { name, email, phone, password, referralCode } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const existingUser = storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: "Email already in use" });
    }

    // Generate unique referral code for new user
    const newReferralCode = name.toUpperCase().replace(/\s+/g, "-").substring(0, 8) + "-" + Date.now().toString(36).toUpperCase().substring(0, 4);

    // Check referrer
    let referrerId: number | undefined;
    if (referralCode) {
      // Find user with this referral code by searching all users
      const allUsers = storage.getUsersByRole("customer");
      const referrer = allUsers.find(u => u.referralCode === referralCode);
      if (referrer) referrerId = referrer.id;
    }

    const user = storage.createUser({
      username: email.split("@")[0] + "_" + Date.now(),
      password: hashPassword(password),
      name,
      email,
      phone: phone || null,
      role: "customer",
      memberSince: new Date().toISOString().split("T")[0],
      loyaltyPoints: referrerId ? 100 : 0, // 100 bonus points if referred
      loyaltyTier: "bronze",
      referralCode: newReferralCode,
      referredBy: referrerId,
    });

    // If referred, create referral record
    if (referrerId) {
      storage.createReferral({
        referrerId,
        refereeId: user.id,
        status: "pending",
        referrerReward: 10,
        refereeReward: 10,
        createdAt: now(),
      });
      // Bonus points for referee
      storage.createLoyaltyTransaction({
        userId: user.id,
        type: "referral",
        points: 100,
        description: "Referral signup bonus — Welcome to Offload!",
        createdAt: now(),
      });
    }

    // Welcome notification
    notifyUser(user.id, null, "system", "Welcome to Offload!", `Hey ${name}, welcome aboard! Your account is set up and ready to go.`, "/");

    const token = createSession(user.id, user.role);
    res.status(201).json({ user: { ...user, password: undefined }, token });
  });

  app.post("/api/auth/login", (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!checkLoginRateLimit(ip)) {
      return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }
    const user = storage.getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password)) {
      recordLoginAttempt(ip);
      return res.status(401).json({ error: "Invalid credentials" });
    }
    // Create server-side session and return token
    const token = createSession(user.id, user.role);
    storage.updateUser(user.id, { lastActiveAt: now() });
    res.json({ user: { ...user, password: undefined }, token });
  });

  // Demo login removed — use real auth only
  // (endpoint kept as 404 to avoid silent failures in old clients)
  app.post("/api/auth/demo-login", (_req, res) => {
    res.status(404).json({ error: "Demo login is not available in production" });
  });

  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (token) destroySession(token);
    res.json({ success: true });
  });

  // Session validation endpoint
  app.get("/api/auth/me", requireAuth(), (req, res) => {
    const user = (req as any).currentUser;
    res.json({ user: { ...user, password: undefined } });
  });

  // ─────────────────────────────────────────────────────────
  //  USERS
  // ─────────────────────────────────────────────────────────

  app.get("/api/users/:id", requireAuth(), (req, res) => {
    const currentUserP = (req as any).currentUser;
    if (currentUserP.role !== "admin" && currentUserP.role !== "manager" && currentUserP.id !== Number(req.params.id)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const user = storage.getUser(Number(req.params.id));
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ ...user, password: undefined });
  });

  app.patch("/api/users/:id", requireAuth(), (req, res) => {
    const currentUserU = (req as any).currentUser;
    const targetId = Number(req.params.id);
    if (targetId !== currentUserU.id && !["admin","manager"].includes(currentUserU.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const SELF_FIELDS = ["name","email","phone","profileImage","notificationPreferences"];
    const updateData: any = {};
    for (const k of SELF_FIELDS) { if (req.body[k] !== undefined) updateData[k] = req.body[k]; }
    if (["admin","manager"].includes(currentUserU.role)) {
      if (req.body.role) updateData.role = req.body.role;
    }
    const updated = storage.updateUser(targetId, updateData);
    if (!updated) return res.status(404).json({ error: "User not found" });
    res.json({ ...updated, password: undefined });
  });

  // ─────────────────────────────────────────────────────────
  //  PRICING TIERS & ADD-ONS
  // ─────────────────────────────────────────────────────────

  app.get("/api/pricing-tiers", (_req, res) => {
    res.json(storage.getPricingTiers());
  });

  app.get("/api/add-ons", (_req, res) => {
    res.json(storage.getAddOns());
  });

  // ─────────────────────────────────────────────────────────
  //  VENDORS
  // ─────────────────────────────────────────────────────────

  app.get("/api/vendors", requireAuth(), (_req, res) => {
    res.json(storage.getVendors());
  });

  app.get("/api/vendors/:id", requireAuth(["admin", "manager", "laundromat", "vendor"]), (req, res) => {
    const v = storage.getVendor(Number(req.params.id));
    if (!v) return res.status(404).json({ error: "Vendor not found" });
    res.json(v);
  });

  app.get("/api/vendors/:id/stats", requireAuth(["admin", "manager", "laundromat", "vendor"]), (req, res) => {
    res.json(storage.getVendorStats(Number(req.params.id)));
  });

  app.post("/api/vendors", requireAuth(["admin", "manager"]), (req, res) => {
    const vendor = storage.createVendor(req.body);
    res.status(201).json(vendor);
  });

  app.patch("/api/vendors/:id", requireAuth(["admin", "manager", "laundromat", "vendor"]), (req, res) => {
    const updated = storage.updateVendor(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  DRIVERS
  // ─────────────────────────────────────────────────────────

  app.get("/api/drivers", requireAuth(["admin", "manager"]), (_req, res) => {
    res.json(storage.getDrivers());
  });

  app.get("/api/drivers/user/:userId", requireAuth(["driver", "admin", "manager"]), (req, res) => {
    const d = storage.getDriverByUserId(Number(req.params.userId));
    if (!d) return res.status(404).json({ error: "Driver not found" });
    res.json(d);
  });

  app.get("/api/drivers/:id", requireAuth(), (req, res) => {
    const d = storage.getDriver(Number(req.params.id));
    if (!d) return res.status(404).json({ error: "Driver not found" });
    res.json(d);
  });

  app.get("/api/drivers/:id/stats", requireAuth(["driver", "admin", "manager"]), (req, res) => {
    res.json(storage.getDriverStats(Number(req.params.id)));
  });

  app.post("/api/drivers", requireAuth(["admin", "manager"]), (req, res) => {
    const driverUser = storage.createUser({
      username: req.body.name.toLowerCase().replace(/\s/g, "_") + "_driver",
      password: hashPassword("driver123"),
      name: req.body.name,
      email: req.body.email || `${req.body.name.toLowerCase().replace(/\s/g, ".")}@offload.com`,
      phone: req.body.phone,
      role: "driver",
    });
    const driver = storage.createDriver({
      ...req.body,
      userId: driverUser.id,
    });
    res.status(201).json(driver);
  });

  app.patch("/api/drivers/:id", requireAuth(["driver", "admin", "manager"]), (req, res) => {
    const updated = storage.updateDriver(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Driver not found" });
    res.json(updated);
  });

  // Driver location update
  app.patch("/api/drivers/:id/location", requireAuth(["driver", "admin"]), (req, res) => {
    // Security: drivers can only update their own location
    const cuLoc = (req as any).currentUser;
    if (cuLoc.role === "driver") {
      const myDriverLoc = storage.getDriverByUserId(cuLoc.id);
      if (!myDriverLoc || myDriverLoc.id !== Number(req.params.id)) {
        return res.status(403).json({ error: "Access denied — can only update your own location" });
      }
    }
    const { lat, lng } = req.body;
    const updated = storage.updateDriver(Number(req.params.id), {
      currentLat: lat,
      currentLng: lng,
    });
    if (!updated) return res.status(404).json({ error: "Driver not found" });
    res.json(updated);
  });

  // Driver go online/offline
  app.patch("/api/drivers/:id/status", requireAuth(["driver", "admin"]), (req, res) => {
    const { status } = req.body;
    if (!["available", "busy", "offline"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const updated = storage.updateDriver(Number(req.params.id), { status });
    if (!updated) return res.status(404).json({ error: "Driver not found" });
    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  SERVICE TYPES
  // ─────────────────────────────────────────────────────────

  app.get("/api/service-types", (_req, res) => {
    res.json(storage.getServiceTypes());
  });

  app.post("/api/service-types", requireAuth(["admin"]), (req, res) => {
    const st = storage.createServiceType(req.body);
    res.status(201).json(st);
  });

  // ─────────────────────────────────────────────────────────
  //  QUOTES — REAL PRICING API
  // ─────────────────────────────────────────────────────────

  // ── Public: Get pricing tiers for display ──
  app.get("/api/pricing/tiers", (_req, res) => {
    res.json({
      tiers: PRICING_TIERS,
      deliveryFees: DELIVERY_FEES,
      taxRate: TAX_RATE,
      quoteValidityMinutes: QUOTE_VALIDITY_MINUTES,
    });
  });

  // ── Public: Check serviceability ──
  app.get("/api/quotes/check-serviceability", (req, res) => {
    const { zip } = req.query;
    if (!zip || typeof zip !== "string") {
      return res.status(400).json({ error: "zip query parameter required" });
    }
    // NYC metro area zip codes (10001-10499, 11001-11999) + common NJ/CT suburbs
    const zipNum = parseInt(zip, 10);
    const serviceable = (
      (zipNum >= 10001 && zipNum <= 10499) ||
      (zipNum >= 10501 && zipNum <= 10599) ||
      (zipNum >= 10701 && zipNum <= 10710) ||
      (zipNum >= 10801 && zipNum <= 10805) ||
      (zipNum >= 11001 && zipNum <= 11999) ||
      (zipNum >= 7001 && zipNum <= 7999)   // NJ
    );
    res.json({ serviceable, zip, reason: serviceable ? null : "We don't serve this area yet. Currently available in the NYC metro area." });
  });

  // ── Public: Create a quote (no auth required for website) ──
  app.post("/api/quotes", (req, res) => {
    try {
      const { pickupAddress, pickupCity, pickupState, pickupZip, pickupLat, pickupLng,
        deliveryAddress, serviceType, tierName, deliverySpeed, vendorId,
        addOns, promoCode, sessionId, idempotencyKey } = req.body;

      // Validate required fields
      if (!pickupAddress) return res.status(400).json({ error: "Pickup address is required" });
      if (!tierName) return res.status(400).json({ error: "Bag size (tierName) is required" });

      // Idempotency check
      if (idempotencyKey) {
        const existing = storage.getQuoteByIdempotencyKey(idempotencyKey);
        if (existing) return res.json(existing);
      }

      // Get authenticated user if available (optional)
      let customerId: number | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const session = getSession(authHeader.split(" ")[1]);
        if (session) customerId = session.userId;
      }

      // Calculate price
      const breakdown = calculateQuotePrice({
        tierName,
        deliverySpeed: deliverySpeed || "48h",
        vendorId: vendorId ? Number(vendorId) : undefined,
        pickupLat: pickupLat ? Number(pickupLat) : undefined,
        pickupLng: pickupLng ? Number(pickupLng) : undefined,
        addOns: addOns || [],
        promoCode: promoCode || undefined,
      });

      // Calculate expiry
      const expiresAt = new Date(Date.now() + QUOTE_VALIDITY_MINUTES * 60 * 1000).toISOString();
      const ts = now();

      // Resolve vendor name if selected
      let vendorName: string | null = null;
      let isPreferredVendor = 0;
      if (vendorId) {
        const v = storage.getVendor(Number(vendorId));
        if (v) { vendorName = v.name; isPreferredVendor = 1; }
      }

      const quote = storage.createQuote({
        quoteNumber: generateQuoteNumber(),
        customerId,
        sessionId: sessionId || null,
        status: "quoted",
        pickupAddress,
        pickupCity: pickupCity || null,
        pickupState: pickupState || null,
        pickupZip: pickupZip || null,
        pickupLat: pickupLat ? Number(pickupLat) : null,
        pickupLng: pickupLng ? Number(pickupLng) : null,
        deliveryAddress: deliveryAddress || null,
        serviceType: serviceType || "wash_fold",
        tierName: breakdown.tierName,
        tierFlatPrice: breakdown.tierFlatPrice,
        tierMaxWeight: breakdown.tierMaxWeight,
        overageRate: breakdown.overageRate,
        deliverySpeed: breakdown.deliverySpeed,
        vendorId: vendorId ? Number(vendorId) : null,
        vendorName,
        isPreferredVendor,
        laundryServicePrice: breakdown.laundryServicePrice,
        speedSurcharge: breakdown.speedSurcharge,
        deliveryFee: breakdown.deliveryFee,
        preferredVendorSurcharge: breakdown.preferredVendorSurcharge,
        addOnsTotal: breakdown.addOnsTotal,
        subtotal: breakdown.subtotal,
        taxRate: breakdown.taxRate,
        taxAmount: breakdown.taxAmount,
        discount: breakdown.discount,
        total: breakdown.total,
        lineItemsJson: JSON.stringify(breakdown.lineItems),
        addOnsJson: addOns ? JSON.stringify(addOns) : null,
        expiresAt,
        promoCode: promoCode || null,
        promoDiscount: breakdown.discount,
        idempotencyKey: idempotencyKey || null,
        createdAt: ts,
        updatedAt: ts,
      });

      // Audit log
      storage.createPricingAuditEntry({
        action: "quote_created",
        details: JSON.stringify({ quoteId: quote.id, quoteNumber: quote.quoteNumber, total: quote.total, tierName: quote.tierName }),
        actorId: customerId,
        actorRole: customerId ? "customer" : "anonymous",
        timestamp: ts,
      });

      // Return the quote with parsed line items for frontend display
      res.status(201).json({
        ...quote,
        lineItems: breakdown.lineItems,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── Public: Get quote by ID ──
  app.get("/api/quotes/:id", (req, res) => {
    const quote = storage.getQuote(Number(req.params.id));
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    // Check expiry
    if (["draft", "quoted"].includes(quote.status) && new Date(quote.expiresAt) < new Date()) {
      storage.updateQuote(quote.id, { status: "expired", updatedAt: now() });
      return res.json({ ...quote, status: "expired", lineItems: quote.lineItemsJson ? JSON.parse(quote.lineItemsJson) : [] });
    }

    res.json({
      ...quote,
      lineItems: quote.lineItemsJson ? JSON.parse(quote.lineItemsJson) : [],
    });
  });

  // ── Auth required: Accept (lock) a quote ──
  app.post("/api/quotes/:id/accept", requireAuth(), (req, res) => {
    try {
      const quote = storage.getQuote(Number(req.params.id));
      if (!quote) return res.status(404).json({ error: "Quote not found" });

      // Validate state
      if (quote.status === "expired" || new Date(quote.expiresAt) < new Date()) {
        storage.updateQuote(quote.id, { status: "expired", updatedAt: now() });
        return res.status(410).json({ error: "Quote has expired. Please request a new quote." });
      }
      if (quote.status === "converted") return res.status(409).json({ error: "Quote already converted to order." });
      if (quote.status === "accepted") return res.json(quote); // Idempotent
      if (quote.status !== "quoted") return res.status(400).json({ error: `Cannot accept quote in '${quote.status}' status` });

      const ts = now();
      const updated = storage.updateQuote(quote.id, {
        status: "accepted",
        lockedAt: ts,
        customerId: (req as any).currentUser?.id || quote.customerId,
        updatedAt: ts,
      });

      storage.createPricingAuditEntry({
        action: "quote_locked",
        details: JSON.stringify({ quoteId: quote.id, total: quote.total }),
        actorId: (req as any).currentUser?.id,
        actorRole: "customer",
        timestamp: ts,
      });

      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── Auth required: Convert accepted quote to real order ──
  app.post("/api/quotes/:id/convert", requireAuth(), (req, res) => {
    try {
      const quote = storage.getQuote(Number(req.params.id));
      if (!quote) return res.status(404).json({ error: "Quote not found" });

      // Validate state
      if (quote.status === "converted" && quote.orderId) {
        // Idempotent: return the existing order
        const existingOrder = storage.getOrder(quote.orderId);
        if (existingOrder) return res.json(existingOrder);
      }
      if (quote.status !== "accepted") {
        return res.status(400).json({ error: `Cannot convert quote in '${quote.status}' status. Must be accepted first.` });
      }
      if (new Date(quote.expiresAt) < new Date() && !quote.lockedAt) {
        storage.updateQuote(quote.id, { status: "expired", updatedAt: now() });
        return res.status(410).json({ error: "Quote has expired." });
      }

      const userId = (req as any).currentUser?.id;
      const { pickupAddressId, pickupTimeWindow, scheduledPickup, deliveryType, customerNotes, addressNotes, paymentMethodId } = req.body || {};

      const ts = now();
      const slaDeadline = calculateSLADeadline(quote.deliverySpeed, ts);

      // Create the real order from the locked quote
      const order = storage.createOrder({
        orderNumber: generateOrderNumber(),
        customerId: userId,
        status: "pending",
        pickupAddressId: pickupAddressId || 0,
        pickupAddress: quote.pickupAddress,
        deliveryAddress: quote.deliveryAddress || quote.pickupAddress,
        deliveryType: deliveryType || "contactless",
        deliverySpeed: quote.deliverySpeed,
        serviceType: quote.serviceType,
        scheduledPickup: scheduledPickup || null,
        pickupTimeWindow: pickupTimeWindow || null,
        addressNotes: addressNotes || null,
        bags: JSON.stringify([{ type: quote.tierName, quantity: 1 }]),
        preferences: null,
        subtotal: quote.subtotal,
        tax: quote.taxAmount,
        deliveryFee: quote.deliveryFee,
        discount: quote.discount,
        total: quote.total,
        pricingTierId: null,
        tierName: quote.tierName,
        tierFlatPrice: quote.tierFlatPrice,
        tierMaxWeight: quote.tierMaxWeight,
        finalPrice: quote.total,
        certifiedOnly: 1,
        customerNotes: customerNotes || null,
        paymentStatus: "authorized",
        paymentMethodId: paymentMethodId || null,
        slaDeadline,
        slaStatus: "on_track",
        promoCode: quote.promoCode || null,
        createdAt: ts,
        updatedAt: ts,
      });

      // Mark quote as converted
      storage.updateQuote(quote.id, {
        status: "converted",
        orderId: order.id,
        customerId: userId,
        updatedAt: ts,
      });

      // Order event: created from quote
      storage.createOrderEvent({
        orderId: order.id,
        eventType: "order_placed",
        description: `Order created from quote ${quote.quoteNumber}`,
        details: JSON.stringify({
          quoteId: quote.id,
          quoteNumber: quote.quoteNumber,
          total: quote.total,
          address: quote.pickupAddress,
        }),
        actorId: userId,
        actorRole: "customer",
        timestamp: ts,
      });

      // Auto-confirm
      storage.updateOrder(order.id, { status: "scheduled", confirmedAt: now() });
      storage.createOrderEvent({
        orderId: order.id,
        eventType: "order_scheduled",
        description: "Order scheduled — finding best match",
        actorRole: "system",
        timestamp: now(),
      });

      // Auto-dispatch vendor
      const pickupLat = quote.pickupLat || 40.7128;
      const pickupLng = quote.pickupLng || -74.0060;

      if (quote.vendorId) {
        // Customer selected a preferred vendor
        const selectedVendor = storage.getVendor(quote.vendorId);
        if (selectedVendor) {
          storage.updateOrder(order.id, { vendorId: selectedVendor.id });
          storage.updateVendor(selectedVendor.id, { currentLoad: (selectedVendor.currentLoad || 0) + 1 });
          storage.createOrderEvent({
            orderId: order.id,
            eventType: "vendor_assigned",
            description: `Assigned to preferred vendor: ${selectedVendor.name}`,
            details: JSON.stringify({ vendorId: selectedVendor.id, vendorName: selectedVendor.name, preferred: true }),
            actorRole: "system",
            timestamp: now(),
          });
        }
      } else {
        // Auto-assign best vendor
        const bestVendor = findBestVendor(order, pickupLat, pickupLng);
        if (bestVendor) {
          storage.updateOrder(order.id, { vendorId: bestVendor.id, aiMatchScore: scoreVendor(bestVendor, order, pickupLat, pickupLng) });
          storage.updateVendor(bestVendor.id, { currentLoad: (bestVendor.currentLoad || 0) + 1 });
          storage.createOrderEvent({
            orderId: order.id,
            eventType: "vendor_assigned",
            description: `Auto-assigned to ${bestVendor.name} (score-based match)`,
            details: JSON.stringify({ vendorId: bestVendor.id, vendorName: bestVendor.name }),
            actorRole: "system",
            timestamp: now(),
          });
        }
      }

      // Auto-assign driver
      const bestDriver = findBestDriver(pickupLat, pickupLng);
      if (bestDriver) {
        storage.updateOrder(order.id, { status: "driver_assigned", driverId: bestDriver.id });
        storage.updateDriver(bestDriver.id, {
          status: "busy",
          todayTrips: (bestDriver.todayTrips || 0) + 1,
        });
        storage.createOrderEvent({
          orderId: order.id,
          eventType: "driver_assigned",
          description: `${bestDriver.name} assigned (proximity + rating match)`,
          details: JSON.stringify({ driverId: bestDriver.id, driverName: bestDriver.name }),
          actorRole: "system",
          timestamp: now(),
        });
        notifyUser(bestDriver.userId, order.id, "order_update",
          "New Pickup Assigned",
          `Pickup at ${quote.pickupAddress}. ${pickupTimeWindow || "ASAP"}`,
          `/driver/order/${order.id}`
        );
      }

      // Notify customer
      notifyUser(userId, order.id, "order_update",
        "Order Confirmed",
        `Your order ${order.orderNumber} is confirmed. Total: $${quote.total.toFixed(2)}`,
        `/orders/${order.id}`
      );

      storage.createPricingAuditEntry({
        action: "quote_converted",
        details: JSON.stringify({ quoteId: quote.id, orderId: order.id, orderNumber: order.orderNumber }),
        actorId: userId,
        actorRole: "customer",
        timestamp: ts,
      });

      res.status(201).json(storage.getOrder(order.id));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── Admin: Pricing config ──
  app.get("/api/pricing/config", requireAuth(["admin"]), (_req, res) => {
    res.json(storage.getAllPricingConfig());
  });

  app.put("/api/pricing/config/:key", requireAuth(["admin"]), (req, res) => {
    const { value, category, description } = req.body;
    if (!value || !category) return res.status(400).json({ error: "value and category required" });
    const userId = (req as any).currentUser?.id;
    const config = storage.upsertPricingConfig(req.params.key, value, category, description, userId);
    storage.createPricingAuditEntry({
      action: "config_change",
      details: JSON.stringify({ key: req.params.key, value, category }),
      actorId: userId,
      actorRole: "admin",
      timestamp: now(),
    });
    res.json(config);
  });

  // ── Admin: Pricing audit log ──
  app.get("/api/pricing/audit", requireAuth(["admin"]), (req, res) => {
    const limit = Number(req.query.limit) || 100;
    res.json(storage.getPricingAuditLog(limit));
  });

  // ─────────────────────────────────────────────────────────
  //  ORDERS — THE CORE ENGINE
  // ─────────────────────────────────────────────────────────

  app.get("/api/orders", requireAuth(), (req, res) => {
    const user = (req as any).currentUser;
    const userRole = user?.role || "customer";

    // Admin/manager can see all orders with optional filters
    if (["admin", "manager", "support"].includes(userRole)) {
      const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
      const vendorId = req.query.vendorId ? Number(req.query.vendorId) : undefined;
      const driverId = req.query.driverId ? Number(req.query.driverId) : undefined;
      const status = req.query.status as string | undefined;
      if (customerId) return res.json(storage.getOrdersByCustomer(customerId));
      if (vendorId) return res.json(storage.getOrdersByVendor(vendorId));
      if (driverId) return res.json(storage.getOrdersByDriver(driverId));
      if (status) return res.json(storage.getOrdersByStatus(status));
      return res.json(storage.getOrders());
    }

    // Vendor sees only their assigned orders
    if (["laundromat","vendor"].includes(userRole)) {
      const vendorProfile = storage.getVendorByUserId?.(user.id);
      if (vendorProfile) return res.json(storage.getOrdersByVendor(vendorProfile.id));
      return res.json([]);
    }

    // Driver sees only their assigned orders
    if (userRole === "driver") {
      const driverProfile = storage.getDriverByUserId?.(user.id);
      if (driverProfile) return res.json(storage.getOrdersByDriver(driverProfile.id));
      return res.json([]);
    }

    // Customer sees only their own orders
    res.json(storage.getOrdersByCustomer(user.id));
  });

  app.get("/api/orders/active", requireAuth(["admin", "manager"]), (_req, res) => {
    res.json(storage.getActiveOrders());
  });

  app.get("/api/orders/:id", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA check: enforce ownership based on role
    const user = (req as any).currentUser;
    const userRole = user?.role || "customer";
    if (userRole === "customer" && order.customerId !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (userRole === "driver" && order.driverId !== user.id) {
      const driverProfile = storage.getDriverByUserId?.(user.id);
      if (!driverProfile || (order.driverId !== driverProfile.id && order.returnDriverId !== driverProfile.id)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // Enrich with related data
    const events = storage.getOrderEvents(order.id);
    const vendor = order.vendorId ? storage.getVendor(order.vendorId) : null;
    const driver = order.driverId ? storage.getDriver(order.driverId) : null;
    const customer = storage.getUser(order.customerId);
    const consents = storage.getConsentsByOrder(order.id);
    const review = storage.getReviewByOrder(order.id);

    // Mask sensitive info based on role
    const driverInfo = driver ? {
      id: driver.id, name: driver.name, rating: driver.rating,
      vehicleType: driver.vehicleType,
      // Never expose driver phone to customer
      ...(userRole !== "customer" ? { phone: driver.phone } : {})
    } : null;

    const customerInfo = customer ? {
      id: customer.id, name: customer.name,
      // Never expose customer phone to driver
      ...(userRole !== "driver" ? { phone: customer.phone } : {})
    } : null;

    res.json({
      ...order,
      events,
      vendor: vendor ? { id: vendor.id, name: vendor.name, rating: vendor.rating, address: vendor.address } : null,
      driver: driverInfo,
      customer: customerInfo,
      consents,
      review,
      slaStatus: order.slaDeadline ? checkSLAStatus(order) : "on_track",
    });
  });

  // ── CREATE ORDER (the main flow) ──
  app.post("/api/orders", requireAuth(), (req, res) => {
    try {
      const currentUser = (req as any).currentUser;
      const customerId = currentUser.id;
      const {
        pickupAddressId, pickupAddress, deliveryType, deliverySpeed,
        scheduledPickup, pickupTimeWindow, bags, preferences, certifiedOnly,
        customerNotes, addressNotes, paymentMethodId, serviceType, promoCode,
        loyaltyPointsToRedeem, pricingTierId, tierName, selectedAddOns,
      } = req.body;

      if (!pickupAddressId || !pickupAddress) {
        return res.status(400).json({ error: "Missing required fields: pickupAddressId, pickupAddress" });
      }

      let parsedBags: any[];
      try {
        parsedBags = typeof bags === "string" ? JSON.parse(bags) : (bags || []);
      } catch (_) {
        parsedBags = [];
      }

      // WS7: Validate bag IDs are unique and present
      if (parsedBags.length > 0) {
        const bagIds = parsedBags.map((b: any) => b.bagId).filter(Boolean);
        const uniqueBagIds = new Set(bagIds);
        if (bagIds.length > 0 && bagIds.length !== uniqueBagIds.size) {
          return res.status(400).json({ error: "Duplicate bag IDs detected. Each bag must have a unique ID." });
        }
      }

            const speed = deliverySpeed || "48h";

      // Determine if using tier-based pricing
      const useTierPricing = !!(tierName || pricingTierId);
      let tierInfo: { name: string; flatPrice: number; maxWeight: number; overageRate: number } | null = null;

      if (useTierPricing) {
        // Look up tier from DB or constant
        const tierKey = tierName as keyof typeof PRICING_TIERS;
        if (tierKey && PRICING_TIERS[tierKey]) {
          const t = PRICING_TIERS[tierKey];
          tierInfo = { name: tierKey, flatPrice: t.flatPrice, maxWeight: t.maxWeight, overageRate: t.overageRate };
        }
      }

      // Calculate add-ons total
      let addOnsTotal = 0;
      let parsedAddOns: { addOnId: number; quantity: number; unitPrice: number }[] = [];
      if (selectedAddOns && Array.isArray(selectedAddOns)) {
        for (const sa of selectedAddOns) {
          const addon = storage.getAddOn(sa.addOnId);
          if (addon) {
            const qty = sa.quantity || 1;
            parsedAddOns.push({ addOnId: addon.id, quantity: qty, unitPrice: addon.price });
            addOnsTotal += addon.price * qty;
          }
        }
      }

      // Dynamic pricing with surge
      const basePickupTime = scheduledPickup;
      const surge = getSurgePricingTier(basePickupTime);
      const demandMultiplier = getDemandMultiplier(serviceType || "wash_fold");

      let surgeSubtotal: number;
      let surgeTax: number;
      let surgeTotal: number;
      let deliveryFee: number;

      if (tierInfo) {
        // Tier-based flat rate pricing — the base price IS the flat rate
        surgeSubtotal = tierInfo.flatPrice + addOnsTotal;
        surgeTax = Math.round(surgeSubtotal * TAX_RATE * 100) / 100;
        deliveryFee = speed === "express_3h" ? 19.99 : speed === "same_day" ? 12.99 : speed === "24h" ? 5.99 : 0;
        surgeTotal = Math.round((surgeSubtotal + surgeTax + deliveryFee) * 100) / 100;
      } else {
        // Legacy bag-count-based pricing
        const pricing = calculatePricing(parsedBags, speed);
        surgeSubtotal = Math.round(pricing.subtotal * surge.multiplier * demandMultiplier * 100) / 100;
        surgeTax = Math.round(surgeSubtotal * TAX_RATE * 100) / 100;
        deliveryFee = pricing.deliveryFee;
        surgeTotal = Math.round((surgeSubtotal + surgeTax + deliveryFee) * 100) / 100;
      }

      let discount = 0;
      let loyaltyPointsRedeemed = 0;

      // Validate and apply promo code
      if (promoCode) {
        const promo = storage.getPromoCode(promoCode);
        if (promo && promo.isActive && (!promo.expiresAt || new Date(promo.expiresAt) > new Date())) {
          if (!promo.minOrderAmount || surgeTotal >= promo.minOrderAmount) {
            if (!promo.maxUses || promo.usedCount! < promo.maxUses) {
              if (promo.type === "percentage") {
                discount = Math.round(surgeTotal * (promo.value / 100) * 100) / 100;
              } else if (promo.type === "fixed") {
                discount = Math.min(promo.value, surgeTotal);
              } else if (promo.type === "free_delivery") {
                discount = deliveryFee;
              }
              // Increment usage count
              storage.updatePromoCode(promo.id, { usedCount: (promo.usedCount || 0) + 1 });
            }
          }
        }
      }

      // Apply loyalty points redemption (100 points = $1)
      if (loyaltyPointsToRedeem && loyaltyPointsToRedeem > 0) {
        const user = storage.getUser(customerId);
        if (user && user.loyaltyPoints && user.loyaltyPoints >= loyaltyPointsToRedeem) {
          const maxRedeemable = Math.floor(user.loyaltyPoints / 100) * 100; // must be multiple of 100
          const toRedeem = Math.min(loyaltyPointsToRedeem, maxRedeemable);
          const dollarValue = toRedeem / 100;
          discount += dollarValue;
          loyaltyPointsRedeemed = toRedeem;
          // Deduct points from user
          storage.updateUser(customerId, {
            loyaltyPoints: user.loyaltyPoints - toRedeem,
          });
        }
      }

      const finalTotal = Math.max(0, Math.round((surgeTotal - discount) * 100) / 100);

      const ts_ = now();
      const slaDeadline = calculateSLADeadline(speed, ts_);

      const order = storage.createOrder({
        orderNumber: generateOrderNumber(),
        customerId,
        status: "pending",
        pickupAddressId,
        pickupAddress,
        deliveryType: deliveryType || "contactless",
        deliverySpeed: speed,
        serviceType: serviceType || "wash_fold",
        scheduledPickup,
        pickupTimeWindow,
        addressNotes,
        bags: typeof bags === "string" ? bags : JSON.stringify(bags || []),
        preferences: preferences ? (typeof preferences === "string" ? preferences : JSON.stringify(preferences)) : null,
        subtotal: surgeSubtotal,
        tax: surgeTax,
        deliveryFee,
        discount,
        total: finalTotal,
        // Tier-based pricing fields
        pricingTierId: pricingTierId || null,
        tierName: tierInfo?.name || null,
        tierFlatPrice: tierInfo?.flatPrice || null,
        tierMaxWeight: tierInfo?.maxWeight || null,
        finalPrice: tierInfo ? finalTotal : null,
        certifiedOnly: certifiedOnly ?? 1,
        customerNotes,
        paymentStatus: "pending",
        paymentMethodId: paymentMethodId || null,
        slaDeadline,
        slaStatus: "on_track",
        promoCode: promoCode || null,
        loyaltyPointsRedeemed,
        aiPricingTier: surge.tier,
        createdAt: ts_,
        updatedAt: ts_,
      });

      // Create order add-on records
      for (const addon of parsedAddOns) {
        storage.createOrderAddOn({
          orderId: order.id,
          addOnId: addon.addOnId,
          quantity: addon.quantity,
          unitPrice: addon.unitPrice,
          total: Math.round(addon.unitPrice * addon.quantity * 100) / 100,
        });
      }

      // Record loyalty redemption transaction
      if (loyaltyPointsRedeemed > 0) {
        storage.createLoyaltyTransaction({
          userId: customerId,
          orderId: order.id,
          type: "redeemed",
          points: -loyaltyPointsRedeemed,
          description: `Redeemed ${loyaltyPointsRedeemed} points for $${(loyaltyPointsRedeemed / 100).toFixed(2)} off order ${order.orderNumber}`,
          createdAt: ts_,
        });
        storage.updateOrder(order.id, { loyaltyPointsRedeemed });
      }

      // Event: order placed
      storage.createOrderEvent({
        orderId: order.id,
        eventType: "order_placed",
        description: "Your pickup has been scheduled",
        details: JSON.stringify({ address: pickupAddress, bags: parsedBags, total: finalTotal, pricingTier: surge.tier, surgeReason: surge.reason }),
        actorId: customerId,
        actorRole: "customer",
        timestamp: ts_,
      });

      // ── STEP 1: Authorize payment ──
      storage.updateOrder(order.id, { paymentStatus: "authorized" });
      storage.createOrderEvent({
        orderId: order.id,
        eventType: "payment_authorized",
        description: `Payment of $${finalTotal.toFixed(2)} authorized`,
        actorRole: "system",
        timestamp: now(),
      });

      // ── STEP 2: Auto-confirm ──
      storage.updateOrder(order.id, { status: "scheduled", confirmedAt: now() });
      storage.createOrderEvent({
        orderId: order.id,
        eventType: "order_scheduled",
        description: "Order scheduled — finding best match",
        actorRole: "system",
        timestamp: now(),
      });

      // ── STEP 3: Auto-dispatch vendor ──
      const addr = storage.getAddress(pickupAddressId);
      const pickupLat = addr?.lat || 25.78;
      const pickupLng = addr?.lng || -80.19;

      const bestVendor = findBestVendor(order, pickupLat, pickupLng);
      if (bestVendor) {
        storage.updateOrder(order.id, { vendorId: bestVendor.id, aiMatchScore: scoreVendor(bestVendor, order, pickupLat, pickupLng) });
        storage.updateVendor(bestVendor.id, { currentLoad: (bestVendor.currentLoad || 0) + 1 });
        storage.createOrderEvent({
          orderId: order.id,
          eventType: "vendor_assigned",
          description: `Assigned to ${bestVendor.name} (score-based match)`,
          details: JSON.stringify({ vendorId: bestVendor.id, vendorName: bestVendor.name }),
          actorRole: "system",
          timestamp: now(),
        });
      }

      // ── STEP 4: Auto-assign driver ──
      const bestDriver = findBestDriver(pickupLat, pickupLng);
      if (bestDriver) {
        storage.updateOrder(order.id, { status: "driver_assigned", driverId: bestDriver.id });
        storage.updateDriver(bestDriver.id, {
          status: "busy",
          todayTrips: (bestDriver.todayTrips || 0) + 1,
        });
        storage.createOrderEvent({
          orderId: order.id,
          eventType: "driver_assigned",
          description: `${bestDriver.name} assigned (proximity + rating match)`,
          details: JSON.stringify({ driverId: bestDriver.id, driverName: bestDriver.name }),
          actorRole: "system",
          timestamp: now(),
        });

        // Notify driver
        notifyUser(bestDriver.userId, order.id, "order_update",
          "New Pickup Assigned",
          `Pickup at ${pickupAddress}. ${pickupTimeWindow || "ASAP"}`,
          `/driver/order/${order.id}`
        );
      }

      // Notify customer
      notifyUser(customerId, order.id, "order_update",
        "Order Confirmed",
        `Your order ${order.orderNumber} is confirmed. ${bestDriver ? `${bestDriver.name} will pick up your laundry.` : "Finding a driver..."}${surge.tier !== "normal" ? ` (${surge.reason})` : ""}`,
        `/orders/${order.id}`
      );

      // Run fraud check for high-value orders
      const freshOrder = storage.getOrder(order.id)!;
      const fraud = calculateFraudRisk(order.id);
      if (fraud.autoFlagged) {
        storage.createOrderEvent({
          orderId: order.id,
          eventType: "fraud_flagged",
          description: `Auto-fraud flag: risk score ${fraud.riskScore}/100. Flags: ${fraud.flags.join("; ")}`,
          actorRole: "system",
          timestamp: now(),
        });
        const admins = storage.getUsersByRole("admin");
        admins.forEach(admin => {
          notifyUser(admin.id, order.id, "fraud_alert",
            "Fraud Alert",
            `Order ${order.orderNumber} flagged with risk score ${fraud.riskScore}/100`,
            "/admin/orders"
          );
        });
      }

      res.status(201).json(storage.getOrder(order.id));
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ── UPDATE ORDER STATUS — Step-locked transitions ──
  app.patch("/api/orders/:id/status", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: ownership check
    const currentUser = (req as any).currentUser;
    if (currentUser.role === "customer" && order.customerId !== currentUser.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (currentUser.role === "driver") {
      const driver = storage.getDriverByUserId(currentUser.id);
      if (!driver || order.driverId !== driver.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    if (["laundromat","vendor"].includes(currentUser.role)) {
      // Vendor can only see orders assigned to their vendor profile
      const vendorProfile = (storage as any).getVendorByUserId?.(currentUser.id);
      if (!vendorProfile || order.vendorId !== vendorProfile.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const { status, description, actorId, actorRole, photoUrl, lat, lng, details, driverId: reqDriverId } = req.body;
    const allowed = validTransitions[order.status];
    if (!allowed || !allowed.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from '${order.status}' to '${status}'`,
        allowed: allowed || [],
      });
    }

    // Security: enforce actor roles per transition (from order-fsm.ts TRANSITION_ACTORS)
    const transitionKey = `${order.status}->${status}`;
    const allowedActors = TRANSITION_ACTORS[transitionKey as keyof typeof TRANSITION_ACTORS];
    if (allowedActors && allowedActors.length > 0) {
      if (!allowedActors.includes(currentUser.role as any) && currentUser.role !== "admin" && currentUser.role !== "manager") {
        return res.status(403).json({
          error: `Role '${currentUser.role}' is not allowed to perform transition '${order.status}' → '${status}'`,
          allowedRoles: allowedActors,
        });
      }
    }


    // WS7: Mandatory photo enforcement at key handoff points
    const PHOTO_REQUIRED_TRANSITIONS = [
      "picked_up",           // Driver must photo the bags at pickup
      "at_facility",         // Photo of bags arriving at laundromat
      "ready_for_delivery",  // Photo of cleaned/folded items
      "delivered",           // Proof of delivery photo
    ];
    if (PHOTO_REQUIRED_TRANSITIONS.includes(status)) {
      const existingPhotos = storage.getPhotosByOrder(order.id);
      const hasPhotoForStep = existingPhotos.some(
        (p: any) => p.type === status || p.type === `${status}_proof`
      ) || photoUrl; // Also accept inline photoUrl
      // In production, enforce photo requirement
      if (!hasPhotoForStep && process.env.ENFORCE_PHOTOS === "true") {
        return res.status(400).json({
          error: `Photo proof required for '${status}' transition`,
          hint: `Upload a photo to /api/orders/${order.id}/photos with type='${status}_proof' before updating status`,
        });
      }
    }


    const ts_ = now();
    const updateData: any = { status };

    // Save driverId when assigning driver
    if (status === "driver_assigned" && reqDriverId) {
      updateData.driverId = reqDriverId;
    }

    // Set timestamp fields based on transition (using new FSM state names)
    if (status === "picked_up") updateData.pickedUpAt = ts_;
    if (status === "at_facility") updateData.arrivedLaundromatAt = ts_;
    if (status === "processing") updateData.washStartedAt = ts_;
    if (status === "ready_for_delivery") updateData.washCompletedAt = ts_;
    if (status === "driver_en_route_delivery") updateData.outForDeliveryAt = ts_;
    if (status === "at_laundromat") updateData.arrivedLaundromatAt = ts_;
    if (status === "washing") updateData.washStartedAt = ts_;
    if (status === "wash_complete") updateData.washCompletedAt = ts_;
    if (status === "out_for_delivery") updateData.outForDeliveryAt = ts_;
    if (status === "delivered") {
      updateData.deliveredAt = ts_;
      // Process payment capture on delivery
      processPaymentCapture(order);
      // Award loyalty points
      awardLoyaltyPoints(order.customerId, order.id, order.total || 0);
      // Check if this completes a referral
      const referrals_ = storage.getReferralsByUser(order.customerId);
      const pendingReferral = referrals_.find(r => r.refereeId === order.customerId && r.status === "pending");
      if (pendingReferral) {
        // First completed order — complete the referral
        storage.updateReferral(pendingReferral.id, {
          status: "rewarded",
          completedOrderId: order.id,
          completedAt: ts_,
        });
        // Credit referrer $10 in points (1000 points = $10)
        const referrer = storage.getUser(pendingReferral.referrerId);
        if (referrer) {
          storage.updateUser(referrer.id, {
            loyaltyPoints: (referrer.loyaltyPoints || 0) + 1000,
          });
          storage.createLoyaltyTransaction({
            userId: referrer.id,
            type: "referral",
            points: 1000,
            description: `Referral reward: your friend placed their first order!`,
            createdAt: ts_,
          });
          notifyUser(referrer.id, null, "loyalty",
            "Referral Reward!",
            `You earned 1,000 points because your referral placed their first order.`,
            "/profile"
          );
        }
        // Credit referee $10 in points
        const referee = storage.getUser(order.customerId);
        if (referee) {
          storage.updateUser(referee.id, {
            loyaltyPoints: (referee.loyaltyPoints || 0) + 1000,
          });
          storage.createLoyaltyTransaction({
            userId: referee.id,
            type: "referral",
            points: 1000,
            description: "Referral completion bonus — thanks for your first order!",
            createdAt: ts_,
          });
        }
      }
    }
    if (status === "cancelled") {
      updateData.cancelledAt = ts_;
      updateData.paymentStatus = "refunded";
      // Release vendor capacity
      if (order.vendorId) {
        const vendor = storage.getVendor(order.vendorId);
        if (vendor && (vendor.currentLoad || 0) > 0) {
          storage.updateVendor(vendor.id, { currentLoad: (vendor.currentLoad || 0) - 1 });
        }
      }
      // Free driver
      if (order.driverId) {
        const driver = storage.getDriver(order.driverId);
        if (driver) {
          storage.updateDriver(driver.id, { status: "available" });
        }
      }
    }

    // If photo provided (pickup proof, delivery proof)
    if (photoUrl) {
      if (status === "picked_up") updateData.pickupPhotoUrl = photoUrl;
      if (status === "delivered") updateData.deliveryPhotoUrl = photoUrl;
    }

    storage.updateOrder(order.id, updateData);

    storage.createOrderEvent({
      orderId: order.id,
      eventType: status,
      description: description || `Order status: ${status.replace(/_/g, " ")}`,
      details: details ? (typeof details === "string" ? details : JSON.stringify(details)) : undefined,
      actorId,
      actorRole: actorRole || "system",
      photoUrl,
      lat,
      lng,
      timestamp: ts_,
    });

    // WS3: Send email notification on status change
    const orderCustomer = storage.getUser(order.customerId);
    if (orderCustomer?.email) {
      const STATUS_LABELS: Record<string, string> = {
        "driver_assigned": "Driver Assigned",
        "driver_en_route_pickup": "Driver En Route to You",
        "picked_up": "Laundry Picked Up",
        "at_facility": "Arrived at Laundromat",
        "processing": "Washing In Progress",
        "ready_for_delivery": "Ready for Delivery",
        "driver_en_route_delivery": "Out for Delivery",
        "delivered": "Delivered",
        "pickup_failed": "Pickup Issue",
        "delivery_failed": "Delivery Issue",
      };
      const STATUS_MESSAGES: Record<string, string> = {
        "driver_assigned": "A driver has been assigned to pick up your laundry.",
        "driver_en_route_pickup": "Your driver is on the way to pick up your laundry.",
        "picked_up": "Your laundry has been picked up and is heading to the laundromat.",
        "at_facility": "Your laundry has arrived at our partner laundromat.",
        "processing": "Your laundry is being washed and folded with care.",
        "ready_for_delivery": "Your laundry is clean and ready for delivery.",
        "driver_en_route_delivery": "Your clean laundry is on its way back to you.",
        "delivered": "Your laundry has been delivered. Enjoy your fresh clothes!",
        "pickup_failed": "We encountered an issue with your pickup. Our team is working on a solution.",
        "delivery_failed": "We encountered an issue with your delivery. Our team is working on a solution.",
      };
      const label = STATUS_LABELS[status] || status;
      const msg = STATUS_MESSAGES[status] || `Your order status has been updated to: ${status}`;
      sendOrderEmail(order, status);
    }


    // Notify customer on key transitions
    const statusMessages: Record<string, string> = {
      pickup_in_progress: "Your driver is on the way to pick up your laundry.",
      picked_up: "Your laundry has been picked up!",
      at_laundromat: "Your laundry has arrived at the facility.",
      washing: "Your laundry is being washed.",
      wash_complete: "Your laundry is done washing!",
      ready_for_delivery: "Your laundry is ready for delivery.",
      out_for_delivery: "Your clean laundry is on the way back to you!",
      delivered: "Your laundry has been delivered! Rate your experience.",
      cancelled: "Your order has been cancelled. A refund has been initiated.",
    };

    if (statusMessages[status]) {
      notifyOrderUpdate(order, `Order ${status.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}`, statusMessages[status]);
    }

    // When delivered, send review request
    if (status === "delivered") {
      notifyUser(order.customerId, order.id, "review_request",
        "How was your experience?",
        "Rate your laundry service to help us improve.",
        `/orders/${order.id}`
      );
      // Free up driver
      if (order.driverId) {
        const driver = storage.getDriver(order.driverId);
        if (driver) storage.updateDriver(driver.id, { status: "available" });
      }
      // Free vendor capacity
      if (order.vendorId) {
        const vendor = storage.getVendor(order.vendorId);
        if (vendor && (vendor.currentLoad || 0) > 0) {
          storage.updateVendor(vendor.id, { currentLoad: (vendor.currentLoad || 0) - 1 });
        }
      }
    }

    // When ready_for_delivery, assign return driver
    if (status === "ready_for_delivery") {
      const vendorObj = order.vendorId ? storage.getVendor(order.vendorId) : null;
      if (vendorObj) {
        const returnDriver = findBestDriver(vendorObj.lat || 25.78, vendorObj.lng || -80.19);
        if (returnDriver) {
          storage.updateOrder(order.id, { returnDriverId: returnDriver.id });
          storage.updateDriver(returnDriver.id, { status: "busy", todayTrips: (returnDriver.todayTrips || 0) + 1 });
          storage.createOrderEvent({
            orderId: order.id,
            eventType: "return_driver_assigned",
            description: `${returnDriver.name} assigned for delivery`,
            actorRole: "system",
            timestamp: now(),
          });
          notifyUser(returnDriver.userId, order.id, "order_update",
            "Delivery Pickup",
            `Pick up clean laundry from ${vendorObj.name} for delivery.`,
            `/driver/order/${order.id}`
          );
        }
      }
    }

    res.json(storage.getOrder(order.id));
  });

  // General order update
  app.patch("/api/orders/:id", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: ownership + role check
    const currentUser = (req as any).currentUser;
    if (currentUser.role === "customer" && order.customerId !== currentUser.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (currentUser.role === "driver") {
      const driver = storage.getDriverByUserId(currentUser.id);
      if (!driver || order.driverId !== driver.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    if (["laundromat","vendor"].includes(currentUser.role)) {
      const vendorProfile = (storage as any).getVendorByUserId?.(currentUser.id);
      if (!vendorProfile || order.vendorId !== vendorProfile.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // If updating status, redirect to the status-specific endpoint logic
    if (req.body.status && req.body.status !== order.status) {
      const { status } = req.body;
      const allowed = validTransitions[order.status];
      if (!allowed || !allowed.includes(status)) {
        return res.status(400).json({
          error: `Cannot transition from '${order.status}' to '${status}'`,
          allowed: allowed || [],
        });
      }
      // FSM actor enforcement
      const transitionKey = `${order.status}->${status}`;
      const allowedActors = TRANSITION_ACTORS[transitionKey as keyof typeof TRANSITION_ACTORS];
      if (allowedActors && allowedActors.length > 0) {
        if (!allowedActors.includes(currentUser.role as any) && currentUser.role !== "admin" && currentUser.role !== "manager") {
          return res.status(403).json({
            error: `Role '${currentUser.role}' is not allowed to perform transition '${order.status}' → '${status}'`,
            allowedRoles: allowedActors,
          });
        }
      }
    }

    // Prevent customers from modifying sensitive fields
    if (currentUser.role === "customer") {
      const forbidden = ["vendorId", "driverId", "total", "paymentStatus", "paymentIntentId", "subtotal", "tax", "finalPrice", "discount", "deliveryFee", "tip", "overageCharge", "customerId", "loyaltyPointsUsed", "loyaltyPointsEarned"];
      for (const key of forbidden) {
        if (key in req.body) {
          return res.status(403).json({ error: `Customers cannot modify '${key}'` });
        }
      }
    }

    const updated = storage.updateOrder(order.id, req.body);
    res.json(updated);
  });


  // ── WS5: Driver failure reporting ──
  app.post("/api/orders/:id/report-issue", requireAuth(["driver"]), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentUser = (req as any).currentUser;
    const driver = storage.getDriverByUserId(currentUser.id);
    if (!driver || order.driverId !== driver.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { issueType, description, photoUrl } = req.body;
    const validIssues = ["customer_unavailable", "wrong_address", "building_access", "safety_concern", "vehicle_issue", "other"];
    if (!issueType || !validIssues.includes(issueType)) {
      return res.status(400).json({ error: `Invalid issue type. Valid: ${validIssues.join(", ")}` });
    }

    const ts = now();
    
    // Determine appropriate status transition
    const failureStatus = order.status.includes("pickup") ? "pickup_failed" : "delivery_failed";
    
    storage.updateOrder(order.id, { status: failureStatus });
    storage.createOrderEvent({
      orderId: order.id,
      eventType: failureStatus,
      description: `Driver reported issue: ${issueType} — ${description || "No details provided"}`,
      actorId: currentUser.id,
      actorRole: "driver",
      timestamp: ts,
    });

    // Notify customer
    const customer = storage.getUser(order.customerId);
    if (customer) {
      notifyUser(customer.id, order.id, "order_update", 
        `Issue with your ${failureStatus === "pickup_failed" ? "pickup" : "delivery"}`,
        `Your driver reported an issue: ${issueType}. Our team is working on a resolution.`,
        `/orders/${order.id}`
      );
    }

    res.json({ 
      status: failureStatus, 
      message: "Issue reported. Support team has been notified.",
      orderId: order.id,
    });
  });



  // ── WS5: Vendor order actions (accept/reject/complete) ──
  app.post("/api/orders/:id/vendor-action", requireAuth(["laundromat", "vendor", "admin", "manager"]), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentUser = (req as any).currentUser;
    if (["laundromat","vendor"].includes(currentUser.role)) {
      const vendorProfile = (storage as any).getVendorByUserId?.(currentUser.id);
      if (!vendorProfile || order.vendorId !== vendorProfile.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const { action, reason, estimatedCompletionTime } = req.body;
    const ts = now();

    switch (action) {
      case "accept":
        if (order.status !== "at_facility" && order.status !== "at_laundromat") {
          return res.status(400).json({ error: "Order must be at facility to accept" });
        }
        storage.updateOrder(order.id, { status: "processing" });
        storage.createOrderEvent({
          orderId: order.id, eventType: "vendor_accepted",
          description: `Vendor accepted order${estimatedCompletionTime ? `. Estimated completion: ${estimatedCompletionTime}` : ""}`,
          actorId: currentUser.id, actorRole: currentUser.role, timestamp: ts,
        });
        break;

      case "reject":
        storage.createOrderEvent({
          orderId: order.id, eventType: "vendor_rejected",
          description: `Vendor rejected order: ${reason || "No reason provided"}`,
          actorId: currentUser.id, actorRole: currentUser.role, timestamp: ts,
        });
        // Re-assign to another vendor
        break;

      case "quality_check":
        if (order.status !== "processing" && order.status !== "washing" && order.status !== "wash_complete") {
          return res.status(400).json({ error: "Order must be in processing/washing to quality check" });
        }
        storage.updateOrder(order.id, { 
          status: "ready_for_delivery",
          qualityCheckedAt: ts,
          washCompletedAt: ts,
        });
        storage.createOrderEvent({
          orderId: order.id, eventType: "quality_checked",
          description: "Quality check passed — order ready for delivery",
          actorId: currentUser.id, actorRole: currentUser.role, timestamp: ts,
        });
        break;

      default:
        return res.status(400).json({ error: "Invalid action. Valid: accept, reject, quality_check" });
    }

    res.json(storage.getOrder(order.id));
  });


  // ── CANCEL ORDER ──
  app.post("/api/orders/:id/cancel", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: only order owner or admin/manager can cancel
    const currentUser = (req as any).currentUser;
    if (currentUser.role === "customer" && order.customerId !== currentUser.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Can only cancel before washing starts
    const cancellableStatuses = ["pending", "scheduled", "driver_assigned", "driver_en_route_pickup", "arrived_pickup", "pickup_in_progress"];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({ error: "Order cannot be cancelled at this stage. Please file a dispute instead." });
    }

    const ts_ = now();
    storage.updateOrder(order.id, {
      status: "cancelled",
      cancelledAt: ts_,
      paymentStatus: "refunded",
    });

    // Restore redeemed loyalty points on cancellation
    if (order.loyaltyPointsRedeemed && order.loyaltyPointsRedeemed > 0) {
      const user = storage.getUser(order.customerId);
      if (user) {
        storage.updateUser(order.customerId, {
          loyaltyPoints: (user.loyaltyPoints || 0) + order.loyaltyPointsRedeemed,
        });
        storage.createLoyaltyTransaction({
          userId: order.customerId,
          orderId: order.id,
          type: "bonus",
          points: order.loyaltyPointsRedeemed,
          description: `Points restored after order cancellation`,
          createdAt: ts_,
        });
      }
    }

    // Release resources
    if (order.vendorId) {
      const vendor = storage.getVendor(order.vendorId);
      if (vendor && (vendor.currentLoad || 0) > 0) {
        storage.updateVendor(vendor.id, { currentLoad: (vendor.currentLoad || 0) - 1 });
      }
    }
    if (order.driverId) {
      const driver = storage.getDriver(order.driverId);
      if (driver) storage.updateDriver(driver.id, { status: "available" });
    }

    storage.createOrderEvent({
      orderId: order.id,
      eventType: "cancelled",
      description: req.body.reason || "Order cancelled by customer — full refund issued",
      actorId: req.body.actorId || order.customerId,
      actorRole: req.body.actorRole || "customer",
      timestamp: ts_,
    });

    notifyOrderUpdate(order, "Order Cancelled", "Your order has been cancelled and a full refund has been initiated.");

    res.json(storage.getOrder(order.id));
  });

  // ── PREDICTIVE ETA ──
  app.get("/api/orders/:id/eta", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status === "delivered" || order.status === "cancelled") {
      return res.json({ message: "Order is no longer active", status: order.status, deliveredAt: order.deliveredAt });
    }
    const eta = calculatePredictiveETA(order.id);
    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      currentStatus: order.status,
      slaDeadline: order.slaDeadline,
      ...eta,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  STAFF QUALITY STATS
  // ─────────────────────────────────────────────────────────

  app.get("/api/staff/quality-stats", requireAuth(), (req, res) => {
    const vendorId = Number(req.query.vendorId);
    if (!vendorId) return res.status(400).json({ error: "vendorId required" });

    const allOrders = storage.getOrders().filter(o => o.vendorId === vendorId);
    const completedOrders = allOrders.filter(o =>
      ["packing", "ready_for_delivery", "out_for_delivery", "delivered"].includes(o.status)
    );

    // Compute average quality score from aiQualityScore field
    const scoredOrders = completedOrders.filter(o => o.aiQualityScore != null && o.aiQualityScore > 0);
    const myScore = scoredOrders.length > 0
      ? Math.round((scoredOrders.reduce((s, o) => s + (o.aiQualityScore || 0), 0) / scoredOrders.length) * 10) / 10
      : 4.5;

    // Vendor-wide average (all vendors for comparison)
    const allVendorOrders = storage.getOrders().filter(o => o.aiQualityScore != null && o.aiQualityScore > 0);
    const vendorAvgScore = allVendorOrders.length > 0
      ? Math.round((allVendorOrders.reduce((s, o) => s + (o.aiQualityScore || 0), 0) / allVendorOrders.length) * 10) / 10
      : 4.1;

    // Weekly scores by day-of-week (use deterministic seed from order data)
    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    // Day indices: Mon=1..Sun=0 (mapped to 1-7 for display)
    const dayScoreSum: Record<string, number> = {};
    const dayScoreCount: Record<string, number> = {};
    const dayVendorSum: Record<string, number> = {};
    const dayVendorCount: Record<string, number> = {};

    DAY_LABELS.forEach(d => {
      dayScoreSum[d] = 0; dayScoreCount[d] = 0;
      dayVendorSum[d] = 0; dayVendorCount[d] = 0;
    });

    scoredOrders.forEach(o => {
      if (o.createdAt) {
        const raw = new Date(o.createdAt).getDay(); // 0=Sun..6=Sat
        // Map to Mon-Sun labels
        const label = DAY_LABELS[(raw + 6) % 7]; // shift so Mon=0
        dayScoreSum[label] += o.aiQualityScore || 0;
        dayScoreCount[label]++;
      }
    });
    allVendorOrders.forEach(o => {
      if (o.createdAt) {
        const raw = new Date(o.createdAt).getDay();
        const label = DAY_LABELS[(raw + 6) % 7];
        dayVendorSum[label] += o.aiQualityScore || 0;
        dayVendorCount[label]++;
      }
    });

    // Use deterministic fallback scores based on vendorId seed when no data
    const BASE_SCORES = [4.2, 4.5, 4.3, 4.8, 4.6, 4.4, 4.7];
    const BASE_AVG = [4.0, 4.1, 4.2, 4.1, 4.3, 4.0, 4.2];
    const weeklyScores = DAY_LABELS.map((day, i) => ({
      day,
      score: dayScoreCount[day] > 0
        ? Math.round((dayScoreSum[day] / dayScoreCount[day]) * 10) / 10
        : BASE_SCORES[i],
      vendorAvg: dayVendorCount[day] > 0
        ? Math.round((dayVendorSum[day] / dayVendorCount[day]) * 10) / 10
        : BASE_AVG[i],
    }));

    res.json({
      vendorId,
      myScore,
      vendorAvgScore,
      totalChecked: completedOrders.length,
      weeklyScores,
      recentChecklistItems: [],
    });
  });

  // ─────────────────────────────────────────────────────────
  //  WEIGHT VALIDATION & INTAKE
  // ─────────────────────────────────────────────────────────

  // Staff records intake weight
  app.post("/api/orders/:id/intake", requireAuth(["laundromat", "vendor", "admin"]), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const { weight, photoUrl, actorId } = req.body;
    if (!weight) return res.status(400).json({ error: "Weight is required" });

    storage.updateOrder(order.id, {
      intakeWeight: weight,
      intakePhotoUrl: photoUrl || undefined,
    });

    storage.createOrderEvent({
      orderId: order.id,
      eventType: "intake_completed",
      description: `Intake: ${weight} lbs recorded${photoUrl ? ", photo taken" : ""}`,
      details: JSON.stringify({ weight, photoUrl }),
      actorId,
      actorRole: "vendor",
      photoUrl,
      timestamp: now(),
    });

    res.json(storage.getOrder(order.id));
  });

  // Staff records output weight (after wash)
  app.post("/api/orders/:id/output-weight", requireAuth(["laundromat", "vendor", "admin"]), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const { weight, actorId } = req.body;
    if (!weight) return res.status(400).json({ error: "Weight is required" });

    const updateData: any = { outputWeight: weight };

    // Check weight discrepancy
    if (order.intakeWeight) {
      const diff = Math.abs(weight - order.intakeWeight) / order.intakeWeight;
      if (diff > WEIGHT_TOLERANCE) {
        updateData.weightDiscrepancy = 1;
        storage.createOrderEvent({
          orderId: order.id,
          eventType: "weight_discrepancy",
          description: `Weight discrepancy detected: intake ${order.intakeWeight} lbs → output ${weight} lbs (${(diff * 100).toFixed(1)}% variance)`,
          details: JSON.stringify({ intake: order.intakeWeight, output: weight, variance: diff }),
          actorRole: "system",
          timestamp: now(),
        });

        // Notify customer and admin
        notifyUser(order.customerId, order.id, "order_update",
          "Weight Discrepancy",
          `A weight difference was detected in your order. Intake: ${order.intakeWeight} lbs, Output: ${weight} lbs.`,
          `/orders/${order.id}`
        );
        // Auto-create consent request
        storage.createConsent({
          orderId: order.id,
          consentType: "overweight",
          description: `Weight changed from ${order.intakeWeight} lbs to ${weight} lbs (${(diff * 100).toFixed(1)}% variance)`,
          status: "pending",
          requestedAt: now(),
          autoApproveAt: new Date(Date.now() + CONSENT_TIMEOUT_HOURS * 3600000).toISOString(),
          requestedBy: actorId,
        });
      }
    }

    storage.updateOrder(order.id, updateData);
    storage.createOrderEvent({
      orderId: order.id,
      eventType: "output_weight_recorded",
      description: `Output weight: ${weight} lbs`,
      actorId,
      actorRole: "vendor",
      timestamp: now(),
    });

    res.json(storage.getOrder(order.id));
  });

  // Driver records dirty weight at pickup
  app.post("/api/orders/:id/record-dirty-weight", requireAuth(["driver", "laundromat", "vendor", "admin"]), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const { weight, actorId } = req.body;
    if (!weight || weight <= 0) return res.status(400).json({ error: "Valid weight is required" });

    storage.updateOrder(order.id, { dirtyWeight: weight });

    storage.createOrderEvent({
      orderId: order.id,
      eventType: "dirty_weight_recorded",
      description: `Dirty weight at pickup: ${weight} lbs`,
      details: JSON.stringify({ dirtyWeight: weight }),
      actorId,
      actorRole: "driver",
      timestamp: now(),
    });

    res.json(storage.getOrder(order.id));
  });

  // Staff records clean weight after wash — auto-calculates overage and final price
  app.post("/api/orders/:id/record-clean-weight", requireAuth(["laundromat", "vendor", "admin"]), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const { weight, actorId } = req.body;
    if (!weight || weight <= 0) return res.status(400).json({ error: "Valid weight is required" });

    const updateData: any = { cleanWeight: weight };

    // Calculate weight difference if dirty weight exists
    if (order.dirtyWeight) {
      updateData.weightDifference = Math.round((order.dirtyWeight - weight) * 100) / 100;
    }

    // Calculate overage pricing if tier info exists
    if (order.tierMaxWeight && order.tierFlatPrice != null) {
      const tierMaxWeight = order.tierMaxWeight;
      const tierFlatPrice = order.tierFlatPrice;
      const overageRate = 2.50; // from PRICING_TIERS

      const overageWeight = Math.max(0, Math.round((weight - tierMaxWeight) * 100) / 100);
      const overageCharge = Math.round(overageWeight * overageRate * 100) / 100;

      updateData.overageWeight = overageWeight;
      updateData.overageCharge = overageCharge;

      // Calculate add-ons total
      const orderAddOnsList = storage.getOrderAddOns(order.id);
      const addOnsTotal = orderAddOnsList.reduce((sum, oa) => sum + oa.total, 0);

      const finalPrice = Math.round((tierFlatPrice + overageCharge + addOnsTotal - (order.discount || 0) + (order.tax || 0) + (order.deliveryFee || 0)) * 100) / 100;
      updateData.finalPrice = Math.max(0, finalPrice);

      if (overageWeight > 0) {
        storage.createOrderEvent({
          orderId: order.id,
          eventType: "overage_calculated",
          description: `Order exceeds ${order.tierName || "tier"} limit by ${overageWeight} lbs. Overage charge: $${overageCharge.toFixed(2)}`,
          details: JSON.stringify({ cleanWeight: weight, tierMaxWeight, overageWeight, overageCharge, finalPrice: updateData.finalPrice }),
          actorRole: "system",
          timestamp: now(),
        });
      }
    }

    storage.updateOrder(order.id, updateData);

    storage.createOrderEvent({
      orderId: order.id,
      eventType: "clean_weight_recorded",
      description: `Clean weight after wash: ${weight} lbs${updateData.weightDifference != null ? ` (${updateData.weightDifference > 0 ? "-" : "+"}${Math.abs(updateData.weightDifference).toFixed(1)} lbs from dirty weight)` : ""}`,
      details: JSON.stringify({ cleanWeight: weight, dirtyWeight: order.dirtyWeight, weightDifference: updateData.weightDifference }),
      actorId,
      actorRole: "vendor",
      timestamp: now(),
    });

    res.json(storage.getOrder(order.id));
  });

  // Weight comparison breakdown
  app.get("/api/orders/:id/weight-comparison", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const orderAddOnsList = storage.getOrderAddOns(order.id);
    const addOnsTotal = orderAddOnsList.reduce((sum, oa) => sum + oa.total, 0);

    res.json({
      orderId: order.id,
      tierName: order.tierName,
      tierFlatPrice: order.tierFlatPrice,
      tierMaxWeight: order.tierMaxWeight,
      dirtyWeight: order.dirtyWeight,
      cleanWeight: order.cleanWeight,
      weightDifference: order.weightDifference,
      overageWeight: order.overageWeight,
      overageCharge: order.overageCharge,
      addOnsTotal,
      addOns: orderAddOnsList,
      discount: order.discount || 0,
      finalPrice: order.finalPrice,
      explanation: order.dirtyWeight && order.cleanWeight
        ? `Clothes typically lose 10-15% weight when clean due to moisture and lint removal. Your laundry went from ${order.dirtyWeight} lbs (dirty) to ${order.cleanWeight} lbs (clean), a difference of ${(order.weightDifference || 0).toFixed(1)} lbs.`
        : null,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  ORDER EVENTS
  // ─────────────────────────────────────────────────────────

  app.get("/api/orders/:id/events", requireAuth(), (req, res) => {
    res.json(storage.getOrderEvents(Number(req.params.id)));
  });

  app.post("/api/orders/:id/events", requireAuth(), (req, res) => {
    const event = storage.createOrderEvent({
      ...req.body,
      orderId: Number(req.params.id),
      timestamp: now(),
    });
    res.status(201).json(event);
  });

  // ─────────────────────────────────────────────────────────
  //  ADDRESSES
  // ─────────────────────────────────────────────────────────

  app.get("/api/addresses", requireAuth(), (req, res) => {
    const userId = Number(req.query.userId);
    res.json(storage.getAddressesByUser(userId));
  });

  app.post("/api/addresses", requireAuth(), (req, res) => {
    if (req.body.isDefault) {
      const existing = storage.getAddressesByUser(req.body.userId);
      existing.forEach(a => {
        if (a.isDefault) storage.updateAddress(a.id, { isDefault: 0 });
      });
    }
    const address = storage.createAddress(req.body);
    res.status(201).json(address);
  });

  app.patch("/api/addresses/:id", requireAuth(), (req, res) => {
    if (req.body.isDefault) {
      const addr = storage.getAddressesByUser(req.body.userId || 0);
      addr.forEach(a => storage.updateAddress(a.id, { isDefault: 0 }));
    }
    const updated = storage.updateAddress(Number(req.params.id), req.body);
    res.json(updated);
  });

  app.delete("/api/addresses/:id", requireAuth(), (req, res) => {
    storage.deleteAddress(Number(req.params.id));
    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────
  //  PAYMENT METHODS
  // ─────────────────────────────────────────────────────────

  app.get("/api/payment-methods", requireAuth(), (req, res) => {
    res.json(storage.getPaymentMethodsByUser(Number(req.query.userId)));
  });

  app.post("/api/payment-methods", requireAuth(), (req, res) => {
    res.status(201).json(storage.createPaymentMethod(req.body));
  });

  app.patch("/api/payment-methods/:id", requireAuth(), (req, res) => {
    const id = Number(req.params.id);
    const { isDefault, userId } = req.body;
    if (isDefault && userId) {
      const existing = storage.getPaymentMethodsByUser(userId);
      existing.forEach(pm => {
        if (pm.id !== id && pm.isDefault) {
          storage.updatePaymentMethod(pm.id, { isDefault: 0 });
        }
      });
    }
    const updated = storage.updatePaymentMethod(id, req.body);
    if (!updated) return res.status(404).json({ error: "Payment method not found" });
    res.json(updated);
  });

  app.delete("/api/payment-methods/:id", requireAuth(), (req, res) => {
    storage.deletePaymentMethod(Number(req.params.id));
    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────
  //  CONSENT ENGINE
  // ─────────────────────────────────────────────────────────

  app.get("/api/orders/:id/consents", requireAuth(), (req, res) => {
    res.json(storage.getConsentsByOrder(Number(req.params.id)));
  });

  app.post("/api/orders/:id/consents", requireAuth(["laundromat", "vendor", "admin"]), (req, res) => {
    const ts_ = now();
    const autoApproveAt = new Date(Date.now() + CONSENT_TIMEOUT_HOURS * 3600000).toISOString();

    const consent = storage.createConsent({
      ...req.body,
      orderId: Number(req.params.id),
      requestedAt: ts_,
      autoApproveAt,
    });

    // Log event
    storage.createOrderEvent({
      orderId: Number(req.params.id),
      eventType: "consent_requested",
      description: `Consent requested: ${req.body.consentType} — ${req.body.description}`,
      actorId: req.body.requestedBy,
      actorRole: "vendor",
      timestamp: ts_,
    });

    // Notify customer
    const order = storage.getOrder(Number(req.params.id));
    if (order) {
      notifyUser(order.customerId, order.id, "consent_request",
        "Action Required",
        `The laundromat needs your approval: ${req.body.description}. Auto-approves in ${CONSENT_TIMEOUT_HOURS} hours.`,
        `/orders/${order.id}`
      );
    }

    res.status(201).json(consent);
  });

  // Customer responds to consent
  app.patch("/api/consents/:id", requireAuth(), (req, res) => {
    const consent = storage.getConsent(Number(req.params.id));
    if (!consent) return res.status(404).json({ error: "Consent not found" });

    const { status } = req.body;
    if (!["approved", "denied"].includes(status)) {
      return res.status(400).json({ error: "Status must be approved or denied" });
    }

    const updated = storage.updateConsent(consent.id, {
      status,
      respondedAt: now(),
    });

    // Log event
    storage.createOrderEvent({
      orderId: consent.orderId,
      eventType: status === "approved" ? "consent_granted" : "consent_denied",
      description: `Customer ${status} consent: ${consent.description}`,
      actorRole: "customer",
      timestamp: now(),
    });

    // If there's an additional charge and it's approved, update order total
    if (status === "approved" && consent.additionalCharge && consent.additionalCharge > 0) {
      const order = storage.getOrder(consent.orderId);
      if (order) {
        const newSubtotal = (order.subtotal || 0) + consent.additionalCharge;
        const newTax = Math.round(newSubtotal * TAX_RATE * 100) / 100;
        const newTotal = Math.round((newSubtotal + newTax + (order.deliveryFee || 0)) * 100) / 100;
        storage.updateOrder(order.id, { subtotal: newSubtotal, tax: newTax, total: newTotal });
      }
    }

    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  MESSAGES
  // ─────────────────────────────────────────────────────────

  app.get("/api/orders/:id/messages", requireAuth(), (req, res) => {
    res.json(storage.getMessagesByOrder(Number(req.params.id)));
  });

  app.post("/api/orders/:id/messages", requireAuth(), (req, res) => {
    const msg = storage.createMessage({
      ...req.body,
      orderId: Number(req.params.id),
      timestamp: now(),
    });
    res.status(201).json(msg);
  });

  // ─────────────────────────────────────────────────────────
  //  DISPUTES
  // ─────────────────────────────────────────────────────────

  app.get("/api/disputes", requireAuth(["admin", "manager"]), (_req, res) => {
    res.json(storage.getDisputes());
  });

  app.get("/api/disputes/:id", requireAuth(), (req, res) => {
    const d = storage.getDispute(Number(req.params.id));
    if (!d) return res.status(404).json({ error: "Dispute not found" });
    const order = storage.getOrder(d.orderId);
    const customer = storage.getUser(d.customerId);
    res.json({ ...d, order, customer: customer ? { id: customer.id, name: customer.name, email: customer.email } : null });
  });

  app.post("/api/disputes", requireAuth(), (req, res) => {
    const ts_ = now();
    const dispute = storage.createDispute({
      ...req.body,
      createdAt: ts_,
    });

    // Update order status
    const order = storage.getOrder(dispute.orderId);
    if (order) {
      storage.updateOrder(order.id, { status: "disputed" });
      storage.createOrderEvent({
        orderId: order.id,
        eventType: "disputed",
        description: `Dispute filed: ${dispute.reason}`,
        actorId: dispute.customerId,
        actorRole: "customer",
        timestamp: ts_,
      });

      // Notify admins
      const admins = storage.getUsersByRole("admin");
      admins.forEach(admin => {
        notifyUser(admin.id, order.id, "system",
          "New Dispute",
          `Dispute on order ${order.orderNumber}: ${dispute.reason}`,
          `/admin/disputes`
        );
      });
    }

    res.status(201).json(dispute);
  });

  app.patch("/api/disputes/:id", requireAuth(["admin", "manager"]), (req, res) => {
    const updated = storage.updateDispute(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Dispute not found" });

    // If resolved, notify customer
    if (req.body.status === "resolved" || req.body.status === "closed") {
      const dispute = storage.getDispute(Number(req.params.id));
      if (dispute) {
        notifyUser(dispute.customerId, dispute.orderId, "system",
          "Dispute Resolved",
          `Your dispute has been ${req.body.status}. ${req.body.resolution || ""}`,
          `/orders/${dispute.orderId}`
        );
        if (req.body.refundAmount && req.body.refundAmount > 0) {
          const order = storage.getOrder(dispute.orderId);
          if (order) {
            storage.updateOrder(order.id, { paymentStatus: "refunded" });
          }
        }
      }
    }

    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  REVIEWS
  // ─────────────────────────────────────────────────────────

  app.get("/api/reviews", requireAuth(), (_req, res) => {
    res.json(storage.getReviews());
  });

  app.get("/api/orders/:id/review", requireAuth(), (req, res) => {
    const review = storage.getReviewByOrder(Number(req.params.id));
    if (!review) return res.status(404).json({ error: "No review yet" });
    res.json(review);
  });

  app.post("/api/orders/:id/review", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Check if already reviewed
    const existing = storage.getReviewByOrder(order.id);
    if (existing) return res.status(409).json({ error: "Order already reviewed" });

    const review = storage.createReview({
      orderId: order.id,
      customerId: order.customerId,
      vendorId: order.vendorId || undefined,
      driverId: order.driverId || undefined,
      vendorRating: req.body.vendorRating,
      driverRating: req.body.driverRating,
      overallRating: req.body.overallRating || req.body.rating,
      comment: req.body.comment,
      createdAt: now(),
    });

    // Update vendor rating
    if (order.vendorId && req.body.vendorRating) {
      const vendorReviews = storage.getReviewsByVendor(order.vendorId);
      const avgRating = vendorReviews.reduce((sum, r) => sum + (r.vendorRating || r.overallRating), 0) / vendorReviews.length;
      storage.updateVendor(order.vendorId, {
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: vendorReviews.length,
      });
    }

    // Update driver rating
    if (order.driverId && req.body.driverRating) {
      const driverReviews = storage.getReviewsByDriver(order.driverId);
      const avgRating = driverReviews.reduce((sum, r) => sum + (r.driverRating || r.overallRating), 0) / driverReviews.length;
      const driver = storage.getDriver(order.driverId);
      if (driver) {
        storage.updateDriver(driver.id, { rating: Math.round(avgRating * 10) / 10 });
      }
    }

    storage.createOrderEvent({
      orderId: order.id,
      eventType: "review_submitted",
      description: `Customer rated ${req.body.overallRating || req.body.rating}/5: ${req.body.comment || "No comment"}`,
      actorId: order.customerId,
      actorRole: "customer",
      timestamp: now(),
    });

    res.status(201).json(review);
  });

  // ─────────────────────────────────────────────────────────
  //  NOTIFICATIONS
  // ─────────────────────────────────────────────────────────

  app.get("/api/notifications", requireAuth(), (req, res) => {
    // Security: always use auth token userId, ignore query param
    const currentUserN = (req as any).currentUser;
    const userId = currentUserN.id;
    res.json(storage.getNotificationsByUser(userId));
  });

  app.get("/api/notifications/unread-count", requireAuth(), (req, res) => {
    const currentUserUC = (req as any).currentUser;
    const userId = currentUserUC.id;
    res.json({ count: storage.getUnreadCount(userId) });
  });

  app.patch("/api/notifications/:id/read", requireAuth(), (req, res) => {
    const n = storage.markNotificationRead(Number(req.params.id));
    if (!n) return res.status(404).json({ error: "Notification not found" });
    res.json(n);
  });

  app.post("/api/notifications/mark-all-read", requireAuth(), (req, res) => {
    const userId = Number(req.body.userId);
    if (!userId) return res.status(400).json({ error: "userId required" });
    storage.markAllRead(userId);
    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────
  //  CUSTOMER STATS
  // ─────────────────────────────────────────────────────────

  app.get("/api/customers/:id/stats", requireAuth(), (req, res) => {
    res.json(storage.getCustomerStats(Number(req.params.id)));
  });

  // ─────────────────────────────────────────────────────────
  //  PRICING CALCULATOR (basic)
  // ─────────────────────────────────────────────────────────

  app.post("/api/pricing/calculate", requireAuth(), (req, res) => {
    const { bags, deliverySpeed } = req.body;
    let parsedBags: any[];
    try {
      parsedBags = typeof bags === "string" ? JSON.parse(bags) : bags;
    } catch (_) {
      return res.status(400).json({ error: "Invalid bags format" });
    }
    res.json(calculatePricing(parsedBags, deliverySpeed));
  });

  // ─────────────────────────────────────────────────────────
  //  DYNAMIC PRICING ESTIMATE (with surge)
  // ─────────────────────────────────────────────────────────

  app.get("/api/pricing/estimate", requireAuth(), (req, res) => {
    try {
      const { serviceType, bags, deliverySpeed, pickupTime } = req.query;
      let parsedBags: any[];
      try {
        parsedBags = bags ? JSON.parse(bags as string) : [{ type: "medium", quantity: 1 }];
      } catch (_) {
        parsedBags = [{ type: "medium", quantity: 1 }];
      }
      const speed = (deliverySpeed as string) || "48h";

      const basePrice = calculatePricing(parsedBags, speed);
      const surge = getSurgePricingTier(pickupTime as string | undefined);
      const demandMultiplier = getDemandMultiplier((serviceType as string) || "wash_fold");

      const surgedSubtotal = Math.round(basePrice.subtotal * surge.multiplier * demandMultiplier * 100) / 100;
      const surgedTax = Math.round(surgedSubtotal * TAX_RATE * 100) / 100;
      const surgedTotal = Math.round((surgedSubtotal + surgedTax + basePrice.deliveryFee) * 100) / 100;

      res.json({
        serviceType: serviceType || "wash_fold",
        bags: parsedBags,
        deliverySpeed: speed,
        pickupTime: pickupTime || new Date().toISOString(),
        basePrice: {
          subtotal: basePrice.subtotal,
          tax: basePrice.tax,
          deliveryFee: basePrice.deliveryFee,
          total: basePrice.total,
        },
        surgePricing: {
          tier: surge.tier,
          multiplier: surge.multiplier,
          reason: surge.reason,
          demandMultiplier,
        },
        finalPrice: {
          subtotal: surgedSubtotal,
          tax: surgedTax,
          deliveryFee: basePrice.deliveryFee,
          total: surgedTotal,
        },
        aiPricingTier: surge.tier,
        savings: surge.tier === "off_peak" ? Math.round((basePrice.total - surgedTotal) * 100) / 100 : 0,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  //  LOYALTY SYSTEM
  // ─────────────────────────────────────────────────────────

  app.get("/api/loyalty/:userId", requireAuth(), (req, res) => {
    const cuL = (req as any).currentUser;
    if (cuL.role !== "admin" && cuL.role !== "manager" && cuL.id !== Number(req.params.userId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const userId = Number(req.params.userId);
    const user = storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const transactions = storage.getLoyaltyTransactions(userId);
    const tier = user.loyaltyTier || "bronze";
    const tierInfo = LOYALTY_TIERS[tier as keyof typeof LOYALTY_TIERS];
    const nextTierEntry = Object.entries(LOYALTY_TIERS).find(([t, info]) => info.minPoints > (user.loyaltyPoints || 0));

    res.json({
      userId,
      points: user.loyaltyPoints || 0,
      tier,
      tierInfo: {
        ...tierInfo,
        name: tier,
      },
      nextTier: nextTierEntry ? nextTierEntry[0] : null,
      pointsToNext: nextTierEntry ? nextTierEntry[1].minPoints - (user.loyaltyPoints || 0) : null,
      dollarValue: Math.floor((user.loyaltyPoints || 0) / 100),
      perks: tierInfo?.perks || [],
      transactions,
      totalEarned: transactions.filter(t => t.points > 0).reduce((sum, t) => sum + t.points, 0),
      totalRedeemed: Math.abs(transactions.filter(t => t.points < 0).reduce((sum, t) => sum + t.points, 0)),
    });
  });

  app.post("/api/loyalty/redeem", requireAuth(), (req, res) => {
    const { userId, points, orderId } = req.body;
    if (!userId || !points) {
      return res.status(400).json({ error: "userId and points are required" });
    }
    if (points % 100 !== 0) {
      return res.status(400).json({ error: "Points must be redeemable in multiples of 100" });
    }

    const user = storage.getUser(Number(userId));
    if (!user) return res.status(404).json({ error: "User not found" });
    if ((user.loyaltyPoints || 0) < points) {
      return res.status(400).json({ error: `Insufficient points. You have ${user.loyaltyPoints || 0} points.` });
    }

    const dollarValue = points / 100;
    const newBalance = (user.loyaltyPoints || 0) - points;

    storage.updateUser(Number(userId), { loyaltyPoints: newBalance });

    const transaction = storage.createLoyaltyTransaction({
      userId: Number(userId),
      orderId: orderId || null,
      type: "redeemed",
      points: -points,
      description: `Redeemed ${points} points for $${dollarValue.toFixed(2)} credit${orderId ? ` on order #${orderId}` : ""}`,
      createdAt: now(),
    });

    notifyUser(Number(userId), null, "loyalty",
      "Points Redeemed",
      `You redeemed ${points} points for $${dollarValue.toFixed(2)} credit.`,
      "/profile"
    );

    res.json({
      success: true,
      pointsRedeemed: points,
      dollarValue,
      newBalance,
      transaction,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  REFERRAL SYSTEM
  // ─────────────────────────────────────────────────────────

  app.get("/api/referrals/:userId", requireAuth(), (req, res) => {
    const cuR = (req as any).currentUser;
    if (cuR.role !== "admin" && cuR.role !== "manager" && cuR.id !== Number(req.params.userId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const userId = Number(req.params.userId);
    const user = storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const referrals_ = storage.getReferralsByUser(userId);
    const asReferrer = referrals_.filter(r => r.referrerId === userId);
    const asReferee = referrals_.filter(r => r.refereeId === userId);

    const completedCount = asReferrer.filter(r => r.status !== "pending").length;
    const pendingCount = asReferrer.filter(r => r.status === "pending").length;
    const totalRewards = asReferrer
      .filter(r => r.status === "rewarded")
      .reduce((sum, r) => sum + (r.referrerReward || 0), 0);

    // Enrich referrals with user info
    const enrichedReferrals = asReferrer.map(r => {
      const referee = storage.getUser(r.refereeId);
      return {
        ...r,
        refereeName: referee ? referee.name : "Unknown",
        refereeEmail: referee ? referee.email : null,
      };
    });

    res.json({
      userId,
      referralCode: user.referralCode,
      referralLink: `https://offload.app/signup?ref=${user.referralCode}`,
      stats: {
        totalReferrals: asReferrer.length,
        completed: completedCount,
        pending: pendingCount,
        totalEarned: totalRewards,
      },
      referrals: enrichedReferrals,
      referredBy: asReferee.length > 0 ? {
        referralId: asReferee[0].id,
        status: asReferee[0].status,
      } : null,
    });
  });

  app.post("/api/referrals/apply", requireAuth(), (req, res) => {
    const { userId, referralCode } = req.body;
    if (!userId || !referralCode) {
      return res.status(400).json({ error: "userId and referralCode are required" });
    }

    const user = storage.getUser(Number(userId));
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.referredBy) {
      return res.status(409).json({ error: "User has already been referred" });
    }

    // Find referrer
    const allCustomers = storage.getUsersByRole("customer");
    const referrer = allCustomers.find(u => u.referralCode === referralCode);
    if (!referrer) {
      return res.status(404).json({ error: "Invalid referral code" });
    }
    if (referrer.id === Number(userId)) {
      return res.status(400).json({ error: "Cannot refer yourself" });
    }

    // Create referral record
    const referral = storage.createReferral({
      referrerId: referrer.id,
      refereeId: Number(userId),
      status: "pending",
      referrerReward: 10,
      refereeReward: 10,
      createdAt: now(),
    });

    // Update user's referredBy
    storage.updateUser(Number(userId), { referredBy: referrer.id });

    // Give referee 100 bonus points
    storage.updateUser(Number(userId), {
      loyaltyPoints: (user.loyaltyPoints || 0) + 100,
    });
    storage.createLoyaltyTransaction({
      userId: Number(userId),
      type: "referral",
      points: 100,
      description: `Referral bonus for using code ${referralCode}`,
      createdAt: now(),
    });

    notifyUser(referrer.id, null, "system",
      "New Referral!",
      `${user.name} signed up using your referral code. You'll earn 1,000 points when they complete their first order.`,
      "/profile"
    );

    res.status(201).json({
      success: true,
      referral,
      bonusPointsAwarded: 100,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  PROMO CODE SYSTEM
  // ─────────────────────────────────────────────────────────

  app.post("/api/promo/validate", requireAuth(), (req, res) => {
    const { code, orderTotal, userId } = req.body;
    if (!code) return res.status(400).json({ error: "Promo code is required" });

    const promo = storage.getPromoCode(code.toUpperCase());
    if (!promo) {
      return res.status(404).json({ error: "Promo code not found", valid: false });
    }
    if (!promo.isActive) {
      return res.status(400).json({ error: "This promo code is no longer active", valid: false });
    }
    if (promo.expiresAt && new Date(promo.expiresAt) < new Date()) {
      return res.status(400).json({ error: "This promo code has expired", valid: false });
    }
    if (promo.maxUses && promo.maxUses > 0 && (promo.usedCount || 0) >= promo.maxUses) {
      return res.status(400).json({ error: "This promo code has reached its usage limit", valid: false });
    }
    if (promo.minOrderAmount && orderTotal && orderTotal < promo.minOrderAmount) {
      return res.status(400).json({
        error: `Minimum order of $${promo.minOrderAmount.toFixed(2)} required`,
        valid: false,
        minOrderAmount: promo.minOrderAmount,
      });
    }

    // Calculate discount
    let discountAmount = 0;
    let discountDescription = "";
    const total = orderTotal || 0;

    if (promo.type === "percentage") {
      discountAmount = Math.round(total * (promo.value / 100) * 100) / 100;
      discountDescription = `${promo.value}% off`;
    } else if (promo.type === "fixed") {
      discountAmount = Math.min(promo.value, total);
      discountDescription = `$${promo.value.toFixed(2)} off`;
    } else if (promo.type === "free_delivery") {
      discountDescription = "Free delivery";
    }

    res.json({
      valid: true,
      code: promo.code,
      type: promo.type,
      value: promo.value,
      discountAmount,
      discountDescription,
      expiresAt: promo.expiresAt,
      usesRemaining: promo.maxUses ? promo.maxUses - (promo.usedCount || 0) : null,
    });
  });

  app.get("/api/admin/promos", requireAuth(["admin"]), (_req, res) => {
    res.json(storage.getPromoCodes());
  });

  app.post("/api/admin/promos", requireAuth(["admin"]), (req, res) => {
    const { code, type, value, minOrderAmount, maxUses, expiresAt } = req.body;
    if (!code || !type || value === undefined) {
      return res.status(400).json({ error: "code, type, and value are required" });
    }
    if (!["percentage", "fixed", "free_delivery"].includes(type)) {
      return res.status(400).json({ error: "type must be percentage, fixed, or free_delivery" });
    }

    const existing = storage.getPromoCode(code.toUpperCase());
    if (existing) {
      return res.status(409).json({ error: "Promo code already exists" });
    }

    const promo = storage.createPromoCode({
      code: code.toUpperCase(),
      type,
      value,
      minOrderAmount: minOrderAmount || 0,
      maxUses: maxUses || 0,
      usedCount: 0,
      isActive: 1,
      expiresAt: expiresAt || null,
      createdAt: now(),
    });

    res.status(201).json(promo);
  });

  app.patch("/api/admin/promos/:id", requireAuth(["admin"]), (req, res) => {
    const updated = storage.updatePromoCode(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Promo code not found" });
    res.json(updated);
  });

  app.delete("/api/admin/promos/:id", requireAuth(["admin"]), (req, res) => {
    const updated = storage.updatePromoCode(Number(req.params.id), { isActive: 0 });
    if (!updated) return res.status(404).json({ error: "Promo code not found" });
    res.json({ success: true, message: "Promo code deactivated" });
  });

  // ─────────────────────────────────────────────────────────
  //  AI CHATBOT
  // ─────────────────────────────────────────────────────────

  app.post("/api/chat/message", requireAuth(), (req, res) => {
    const { userId, message, sessionId } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ error: "userId and message are required" });
    }

    const intent = detectIntent(message);
    const { response, resolved, escalate } = generateAIResponse(intent, Number(userId), message);

    const ts_ = now();

    // Find or create session
    let session;
    if (sessionId) {
      session = storage.getChatSession(Number(sessionId));
    }

    if (!session) {
      // Create new session
      const newMessages = [
        { role: "user", content: message, timestamp: ts_ },
        { role: "assistant", content: response, timestamp: ts_, intent },
      ];
      session = storage.createChatSession({
        userId: Number(userId),
        status: resolved ? "resolved" : escalate ? "escalated" : "active",
        topic: intent,
        aiResolved: resolved ? 1 : 0,
        messagesJson: JSON.stringify(newMessages),
        createdAt: ts_,
        resolvedAt: resolved ? ts_ : undefined,
      });
    } else {
      // Append to existing session
      let existingMessages: any[] = [];
      try { existingMessages = session.messagesJson ? JSON.parse(session.messagesJson) : []; } catch (_) {}
      existingMessages.push({ role: "user", content: message, timestamp: ts_ });
      existingMessages.push({ role: "assistant", content: response, timestamp: ts_, intent });

      session = storage.updateChatSession(session.id, {
        status: resolved ? "resolved" : escalate ? "escalated" : "active",
        aiResolved: resolved ? 1 : 0,
        messagesJson: JSON.stringify(existingMessages),
        resolvedAt: resolved ? ts_ : undefined,
      }) || session;
    }

    // Also store as messages
    storage.createMessage({
      conversationId: `chat-${session.id}`,
      senderId: Number(userId),
      senderRole: "customer",
      content: message,
      messageType: "text",
      timestamp: ts_,
    });
    storage.createMessage({
      conversationId: `chat-${session.id}`,
      senderId: 0, // AI
      senderRole: "ai",
      content: response,
      messageType: "ai_response",
      isAiGenerated: 1,
      timestamp: ts_,
    });

    if (escalate) {
      const admins = storage.getUsersByRole("admin");
      admins.forEach(admin => {
        notifyUser(admin.id, null, "system",
          "Chat Escalation",
          `Customer chat session requires human attention. Topic: ${intent}`,
          "/admin/support"
        );
      });
    }

    res.json({
      sessionId: session.id,
      intent,
      response,
      resolved,
      escalated: escalate,
      timestamp: ts_,
    });
  });

  app.get("/api/chat/sessions/:userId", requireAuth(), (req, res) => {
    const userId = Number(req.params.userId);
    const user = storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const sessions = storage.getChatSessions(userId);
    res.json({
      userId,
      totalSessions: sessions.length,
      resolvedSessions: sessions.filter(s => s.aiResolved).length,
      escalatedSessions: sessions.filter(s => s.status === "escalated").length,
      sessions: sessions.map(s => ({
        ...s,
        messages: (() => { try { return s.messagesJson ? JSON.parse(s.messagesJson) : []; } catch (_) { return []; } })(),
      })),
    });
  });

  app.get("/api/chat/sessions/:userId/:sessionId", requireAuth(), (req, res) => {
    const session = storage.getChatSession(Number(req.params.sessionId));
    if (!session) return res.status(404).json({ error: "Session not found" });
    res.json({
      ...session,
      messages: (() => { try { return session.messagesJson ? JSON.parse(session.messagesJson) : []; } catch (_) { return []; } })(),
    });
  });

  // ─────────────────────────────────────────────────────────
  //  VENDOR SCORING (AI Health)
  // ─────────────────────────────────────────────────────────

  app.get("/api/admin/vendor-scores", requireAuth(["admin"]), (_req, res) => {
    const vendors = storage.getVendors();
    const scored = vendors.map(vendor => {
      const health = calculateVendorHealthScore(vendor);
      const stats = storage.getVendorStats(vendor.id);
      // Update stored score
      storage.updateVendor(vendor.id, { aiHealthScore: health.score });
      return {
        id: vendor.id,
        name: vendor.name,
        city: vendor.city,
        status: vendor.status,
        performanceTier: vendor.performanceTier,
        aiHealthScore: health.score,
        breakdown: health.breakdown,
        recommendations: health.recommendations,
        stats: {
          totalOrders: stats.totalOrders,
          completedOrders: stats.completedOrders,
          activeOrders: stats.activeOrders,
          avgRating: stats.avgRating,
          totalRevenue: stats.totalRevenue,
        },
        capacityUtilization: Math.round(((vendor.currentLoad || 0) / (vendor.capacity || 50)) * 100),
        rating: vendor.rating,
        onTimeRate: vendor.onTimeRate,
        disputeRate: vendor.disputeRate,
        avgProcessingTime: vendor.avgProcessingTime,
      };
    }).sort((a, b) => b.aiHealthScore - a.aiHealthScore);

    const eliteCount = scored.filter(v => v.performanceTier === "elite").length;
    const atRiskCount = scored.filter(v => v.aiHealthScore < 60).length;
    const avgOnTime = scored.length > 0 ? scored.reduce((sum, v) => sum + ((v.onTimeRate || 0) * 100), 0) / scored.length : 0;

    res.json({
      total: scored.length,
      avgScore: scored.length > 0 ? Math.round(scored.reduce((sum, v) => sum + v.aiHealthScore, 0) / scored.length * 10) / 10 : 0,
      avgHealthScore: scored.length > 0 ? Math.round(scored.reduce((sum, v) => sum + v.aiHealthScore, 0) / scored.length * 10) / 10 : 0,
      eliteVendors: eliteCount,
      atRiskVendors: atRiskCount,
      avgOnTimeRate: Math.round(avgOnTime * 10) / 10,
      vendors: scored.map(v => ({
        ...v,
        healthScore: v.aiHealthScore,
        tier: v.performanceTier || "standard",
        onTimeRate: Math.round((v.onTimeRate || 0) * 100),
        disputeRate: Math.round((v.disputeRate || 0) * 100 * 10) / 10,
      })),
    });
  });

  app.get("/api/admin/vendor-health/:id", requireAuth(["admin", "manager"]), (req, res) => {
    const vendor = storage.getVendor(Number(req.params.id));
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const health = calculateVendorHealthScore(vendor);
    const stats = storage.getVendorStats(vendor.id);
    const recentOrders = storage.getOrdersByVendor(vendor.id).slice(0, 20);
    const reviews = storage.getReviewsByVendor(vendor.id);

    // Update stored score
    storage.updateVendor(vendor.id, { aiHealthScore: health.score });

    // On-time delivery analysis
    const deliveredOrders = recentOrders.filter(o => o.status === "delivered");
    const onTimeCount = deliveredOrders.filter(o => {
      if (!o.deliveredAt || !o.slaDeadline) return true;
      return new Date(o.deliveredAt) <= new Date(o.slaDeadline);
    }).length;

    // Recent trend
    const recentRatings = reviews.slice(0, 10).map(r => r.vendorRating || r.overallRating);
    const recentAvgRating = recentRatings.length > 0
      ? recentRatings.reduce((sum, r) => sum + r, 0) / recentRatings.length
      : 0;

    const previousRatings = reviews.slice(10, 20).map(r => r.vendorRating || r.overallRating);
    const prevAvgRating = previousRatings.length > 0
      ? previousRatings.reduce((sum, r) => sum + r, 0) / previousRatings.length
      : 0;

    res.json({
      vendor: {
        id: vendor.id,
        name: vendor.name,
        address: vendor.address,
        city: vendor.city,
        performanceTier: vendor.performanceTier,
        tier: vendor.performanceTier || "standard",
        status: vendor.status,
        healthScore: health.score,
        rating: vendor.rating,
        onTimeRate: Math.round((vendor.onTimeRate || 0) * 100),
        disputeRate: Math.round((vendor.disputeRate || 0) * 100 * 10) / 10,
        avgProcessingTime: vendor.avgProcessingTime,
      },
      healthScore: health.score,
      breakdown: health.breakdown,
      scoreBreakdown: {
        quality: health.breakdown.rating || 0,
        onTime: health.breakdown.onTimeRate || 0,
        disputes: health.breakdown.disputeRate || 0,
        processing: health.breakdown.processingTime || 0,
        volume: health.breakdown.capacityUtilization || 0,
      },
      recommendations: health.recommendations,
      metrics: {
        rating: vendor.rating,
        onTimeRate: vendor.onTimeRate,
        disputeRate: vendor.disputeRate,
        avgProcessingTimeMinutes: vendor.avgProcessingTime,
        capacityUtilization: Math.round(((vendor.currentLoad || 0) / (vendor.capacity || 50)) * 100),
        currentLoad: vendor.currentLoad,
        capacity: vendor.capacity,
        onTimeCount,
        deliveredOrdersCount: deliveredOrders.length,
      },
      financials: {
        totalEarnings: vendor.totalEarnings,
        pendingPayout: vendor.pendingPayout,
        payoutRate: vendor.payoutRate,
        totalRevenue: stats.totalRevenue,
      },
      trends: {
        ratingTrend: recentAvgRating >= prevAvgRating ? "improving" : "declining",
        recentAvgRating: Math.round(recentAvgRating * 10) / 10,
        previousAvgRating: Math.round(prevAvgRating * 10) / 10,
      },
      recentOrders: recentOrders.slice(0, 5).map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        total: Number(o.total) || 0,
        createdAt: o.createdAt,
      })),
      recentReviews: reviews.slice(0, 5).map(r => ({
        id: r.id,
        rating: r.overallRating || r.vendorRating || 0,
        comment: r.comment,
        createdAt: r.createdAt,
      })),
    });
  });

  // ─────────────────────────────────────────────────────────
  //  FRAUD DETECTION
  // ─────────────────────────────────────────────────────────

  app.post("/api/admin/fraud-check/:orderId", requireAuth(["admin"]), (req, res) => {
    const orderId = Number(req.params.orderId);
    const order = storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const result = calculateFraudRisk(orderId);

    // If auto-flagged, add event
    if (result.autoFlagged) {
      storage.createOrderEvent({
        orderId,
        eventType: "fraud_reviewed",
        description: `Manual fraud review: risk score ${result.riskScore}/100`,
        actorRole: "admin",
        timestamp: now(),
      });
    }

    res.json({
      orderId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      orderTotal: order.total,
      riskScore: result.riskScore,
      riskLevel: result.riskScore >= 70 ? "high" : result.riskScore >= 40 ? "medium" : "low",
      flags: result.flags,
      autoFlagged: result.autoFlagged,
      recommendation: result.riskScore >= 70
        ? "Manually review before processing. Consider additional verification."
        : result.riskScore >= 40
        ? "Monitor this order closely."
        : "Order appears legitimate.",
      timestamp: now(),
    });
  });

  // Bulk fraud scan
  app.get("/api/admin/fraud-scan", requireAuth(["admin"]), (_req, res) => {
    const activeOrders = storage.getActiveOrders();
    const results = activeOrders.map(order => {
      const fraud = calculateFraudRisk(order.id);
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        total: order.total,
        riskScore: fraud.riskScore,
        riskLevel: fraud.riskScore >= 70 ? "high" : fraud.riskScore >= 40 ? "medium" : "low",
        flags: fraud.flags,
        autoFlagged: fraud.autoFlagged,
      };
    }).filter(r => r.riskScore > 0).sort((a, b) => b.riskScore - a.riskScore);

    res.json({
      scanned: activeOrders.length,
      flagged: results.filter(r => r.autoFlagged).length,
      highRisk: results.filter(r => r.riskLevel === "high").length,
      mediumRisk: results.filter(r => r.riskLevel === "medium").length,
      results,
    });
  });

  // Admin: Fraud alerts (matching frontend FraudSummary interface)
  app.get("/api/admin/fraud-alerts", requireAuth(["admin"]), (_req, res) => {
    const allOrders = storage.getOrders();
    const alerts = allOrders.map(order => {
      const fraud = calculateFraudRisk(order.id);
      if (fraud.riskScore <= 10) return null;
      const customer = storage.getUser(order.customerId);
      return {
        id: order.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: customer?.name || "Unknown",
        riskScore: fraud.riskScore,
        riskLevel: fraud.riskScore >= 70 ? "high" : fraud.riskScore >= 40 ? "medium" : "low" as "high" | "medium" | "low",
        flags: fraud.flags,
        status: fraud.autoFlagged ? "flagged" : "cleared" as "flagged" | "cleared" | "escalated",
        amount: Number(order.total) || 0,
        createdAt: order.createdAt,
      };
    }).filter(Boolean).sort((a: any, b: any) => b.riskScore - a.riskScore);

    const flaggedAlerts = alerts.filter((a: any) => a.status === "flagged");
    res.json({
      totalFlagged: flaggedAlerts.length,
      highRisk: alerts.filter((a: any) => a.riskLevel === "high").length,
      mediumRisk: alerts.filter((a: any) => a.riskLevel === "medium").length,
      cleared: alerts.filter((a: any) => a.status === "cleared").length,
      alerts,
    });
  });

  // Fraud alert actions
  app.post("/api/admin/fraud-alerts/:alertId/clear", requireAuth(["admin"]), (req, res) => {
    res.json({ success: true, message: "Alert cleared" });
  });

  app.post("/api/admin/fraud-alerts/:alertId/escalate", requireAuth(["admin"]), (req, res) => {
    res.json({ success: true, message: "Alert escalated" });
  });

  // ─────────────────────────────────────────────────────────
  //  SUBSCRIPTION MANAGEMENT
  // ─────────────────────────────────────────────────────────

  app.get("/api/subscription/:userId", requireAuth(), (req, res) => {
    const cuSub = (req as any).currentUser;
    if (cuSub.role !== "admin" && cuSub.role !== "manager" && cuSub.id !== Number(req.params.userId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const userId = Number(req.params.userId);
    const user = storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const tier = user.subscriptionTier;
    if (!tier || !SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS]) {
      return res.json({
        userId,
        subscriptionTier: null,
        active: false,
        message: "No active subscription",
        availablePlans: Object.entries(SUBSCRIPTION_TIERS).map(([name, info]) => ({
          name,
          ...info,
          pricePerMonth: info.price,
        })),
      });
    }

    const tierInfo = SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS];
    const isActive = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) > new Date() : false;

    res.json({
      userId,
      subscriptionTier: tier,
      active: isActive,
      startDate: user.subscriptionStartDate,
      endDate: user.subscriptionEndDate,
      benefits: {
        price: tierInfo.price,
        freeDeliveries: tierInfo.freeDeliveries,
        discount: `${tierInfo.discount * 100}%`,
        pointsBonus: `${tierInfo.pointsBonus}x`,
        prioritySupport: (tierInfo as any).prioritySupport || false,
      },
      nextRenewal: user.subscriptionEndDate,
      availableUpgrades: Object.entries(SUBSCRIPTION_TIERS)
        .filter(([name]) => name !== tier)
        .map(([name, info]) => ({
          name,
          price: info.price,
          freeDeliveries: info.freeDeliveries,
          discount: `${info.discount * 100}%`,
          pointsBonus: `${info.pointsBonus}x`,
        })),
    });
  });

  app.post("/api/subscription/upgrade", requireAuth(), (req, res) => {
    const { userId, tier } = req.body;
    if (!userId || !tier) {
      return res.status(400).json({ error: "userId and tier are required" });
    }
    if (!SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS]) {
      return res.status(400).json({ error: `Invalid tier. Must be: ${Object.keys(SUBSCRIPTION_TIERS).join(", ")}` });
    }

    const user = storage.getUser(Number(userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const tierInfo = SUBSCRIPTION_TIERS[tier as keyof typeof SUBSCRIPTION_TIERS];
    const startDate = now();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);

    const updated = storage.updateUser(Number(userId), {
      subscriptionTier: tier,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate.toISOString(),
    });

    notifyUser(Number(userId), null, "system",
      `Subscribed to ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan!`,
      `Your ${tier} plan is now active. Enjoy ${tierInfo.freeDeliveries} free deliveries, ${tierInfo.discount * 100}% off orders, and ${tierInfo.pointsBonus}x loyalty points!`,
      "/profile"
    );

    // Award bonus points for subscribing
    const bonusPoints = tier === "premium" ? 500 : tier === "plus" ? 300 : 150;
    storage.updateUser(Number(userId), {
      loyaltyPoints: (user.loyaltyPoints || 0) + bonusPoints,
    });
    storage.createLoyaltyTransaction({
      userId: Number(userId),
      type: "bonus",
      points: bonusPoints,
      description: `${tier} subscription signup bonus`,
      createdAt: startDate,
    });

    res.json({
      success: true,
      subscriptionTier: tier,
      startDate,
      endDate: endDate.toISOString(),
      benefits: tierInfo,
      bonusPointsAwarded: bonusPoints,
      user: { ...updated, password: undefined },
    });
  });

  app.delete("/api/subscription/:userId", requireAuth(), (req, res) => {
    const cuSubD = (req as any).currentUser;
    if (cuSubD.role !== "admin" && cuSubD.role !== "manager" && cuSubD.id !== Number(req.params.userId)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const userId = Number(req.params.userId);
    const user = storage.getUser(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.subscriptionTier) {
      return res.status(400).json({ error: "No active subscription to cancel" });
    }

    const updated = storage.updateUser(userId, {
      subscriptionTier: null,
      subscriptionEndDate: now(), // End immediately
    });

    notifyUser(userId, null, "system",
      "Subscription Cancelled",
      "Your subscription has been cancelled. You can re-subscribe at any time.",
      "/profile"
    );

    res.json({
      success: true,
      message: "Subscription cancelled",
      user: { ...updated, password: undefined },
    });
  });

  // ─────────────────────────────────────────────────────────
  //  ADMIN METRICS (dashboard)
  // ─────────────────────────────────────────────────────────

  app.get("/api/admin/metrics", requireAuth(["admin", "manager"]), (_req, res) => {
    const allOrders = storage.getOrders();
    const allVendors = storage.getVendors();
    const allDrivers = storage.getDrivers();
    const allDisputes = storage.getDisputes();
    const allReviews = storage.getReviews();

    const totalRevenue = allOrders
      .filter(o => o.status === "delivered")
      .reduce((sum, o) => sum + (o.total || 0), 0);
    const activeOrders = allOrders.filter(o => !["delivered", "cancelled"].includes(o.status)).length;
    const completedOrders = allOrders.filter(o => o.status === "delivered").length;
    const cancelledOrders = allOrders.filter(o => o.status === "cancelled").length;
    const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

    // SLA compliance
    const slaBreached = allOrders.filter(o => o.slaStatus === "breached").length;
    const slaAtRisk = allOrders.filter(o => o.slaStatus === "at_risk").length;

    // Status distribution
    const statusCounts: Record<string, number> = {};
    allOrders.forEach(o => {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    });

    // Revenue by vendor
    const revenueByVendor: Record<string, number> = {};
    allOrders.filter(o => o.status === "delivered").forEach(o => {
      const vendor = allVendors.find(v => v.id === o.vendorId);
      const name = vendor?.name || "Unassigned";
      revenueByVendor[name] = (revenueByVendor[name] || 0) + (o.total || 0);
    });

    // Avg review score
    const avgRating = allReviews.length > 0
      ? allReviews.reduce((sum, r) => sum + r.overallRating, 0) / allReviews.length
      : 0;

    // Total payouts
    const totalVendorPayouts = allOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
    const totalDriverPayouts = allOrders.reduce((sum, o) => sum + (o.driverPayout || 0), 0);

    // Loyalty stats
    const allCustomers = storage.getUsersByRole("customer");
    const totalLoyaltyPoints = allCustomers.reduce((sum, u) => sum + (u.loyaltyPoints || 0), 0);
    const tierBreakdown: Record<string, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
    allCustomers.forEach(u => {
      const t = u.loyaltyTier || "bronze";
      tierBreakdown[t] = (tierBreakdown[t] || 0) + 1;
    });

    // Pricing tier distribution
    const pricingTierCounts: Record<string, number> = {};
    allOrders.forEach(o => {
      if (o.aiPricingTier) {
        pricingTierCounts[o.aiPricingTier] = (pricingTierCounts[o.aiPricingTier] || 0) + 1;
      }
    });

    res.json({
      totalOrders: allOrders.length,
      activeOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      totalVendors: allVendors.length,
      activeVendors: allVendors.filter(v => v.status === "active").length,
      totalDrivers: allDrivers.length,
      availableDrivers: allDrivers.filter(d => d.status === "available").length,
      openDisputes: allDisputes.filter(d => d.status === "open" || d.status === "investigating").length,
      statusCounts,
      revenueByVendor,
      slaBreached,
      slaAtRisk,
      avgRating: Math.round(avgRating * 10) / 10,
      totalVendorPayouts: Math.round(totalVendorPayouts * 100) / 100,
      totalDriverPayouts: Math.round(totalDriverPayouts * 100) / 100,
      platformRevenue: Math.round((totalRevenue - totalVendorPayouts - totalDriverPayouts) * 100) / 100,
      loyalty: {
        totalPoints: totalLoyaltyPoints,
        tierBreakdown,
      },
      pricingTierDistribution: pricingTierCounts,
    });
  });

  // Admin: Analytics dashboard
  app.get("/api/admin/analytics", requireAuth(["admin", "manager"]), (_req, res) => {
    const allOrders = storage.getOrders();
    const allVendors = storage.getVendors();
    const allCustomers = storage.getUsersByRole("customer");
    const deliveredOrders = allOrders.filter(o => o.status === "delivered");

    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalVendorPayouts = allOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
    const totalDriverPayouts = allOrders.reduce((sum, o) => sum + (o.driverPayout || 0), 0);
    const platformCommission = totalRevenue - totalVendorPayouts - totalDriverPayouts;
    const avgOrderValue = deliveredOrders.length > 0 ? totalRevenue / deliveredOrders.length : 0;

    // Revenue by day — aggregate real delivered orders by day-of-week
    const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayRevenue: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    const dayOrderCount: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    deliveredOrders.forEach(o => {
      if (o.createdAt) {
        const dow = new Date(o.createdAt).getDay();
        dayRevenue[dow] = (dayRevenue[dow] || 0) + (o.total || 0);
        dayOrderCount[dow] = (dayOrderCount[dow] || 0) + 1;
      }
    });
    const revenueByDay = DAY_LABELS.map((day, i) => ({
      day,
      revenue: Math.round((dayRevenue[i] || 0) * 100) / 100,
      orders: dayOrderCount[i] || 0,
    }));

    // Order status breakdown
    const statusCounts: Record<string, number> = {};
    allOrders.forEach(o => { statusCounts[o.status] = (statusCounts[o.status] || 0) + 1; });
    const orderStatusBreakdown = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

    // Acquisition funnel
    const acquisitionFunnel = [
      { stage: "Visitors", count: allCustomers.length * 12, percentage: 100 },
      { stage: "Sign-ups", count: allCustomers.length * 4, percentage: 33 },
      { stage: "First Order", count: allCustomers.length * 2, percentage: 17 },
      { stage: "Repeat Customer", count: allCustomers.length, percentage: 8 },
    ];

    // Top vendors
    const topVendors = allVendors.map(v => {
      const vOrders = deliveredOrders.filter(o => o.vendorId === v.id);
      return {
        id: v.id,
        name: v.name,
        orders: vOrders.length,
        rating: v.rating || 0,
        revenue: Math.round(vOrders.reduce((sum, o) => sum + (o.total || 0), 0) * 100) / 100,
        tier: v.performanceTier || "standard",
      };
    }).sort((a, b) => b.revenue - a.revenue);

    res.json({
      revenueByDay,
      kpis: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders: allOrders.length,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        platformCommission: Math.round(platformCommission * 100) / 100,
      },
      orderStatusBreakdown,
      acquisitionFunnel,
      topVendors,
    });
  });

  // Admin: Financial report
  app.get("/api/admin/financial", requireAuth(["admin", "manager"]), (_req, res) => {
    const allOrders = storage.getOrders();
    const allVendors = storage.getVendors();
    const deliveredOrders = allOrders.filter(o => o.status === "delivered");

    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    // Only count payouts for delivered orders to keep financials consistent
    const totalVendorPayouts = deliveredOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
    const totalDriverPayouts = deliveredOrders.reduce((sum, o) => sum + (o.driverPayout || 0), 0);
    const platformRevenue = totalRevenue - totalVendorPayouts - totalDriverPayouts;
    const commissionRate = totalRevenue > 0 ? Math.round((platformRevenue / totalRevenue) * 100) : 13;

    // Vendor breakdown
    const vendorBreakdown = allVendors.map(v => {
      const vOrders = deliveredOrders.filter(o => o.vendorId === v.id);
      const grossRevenue = vOrders.reduce((sum, o) => sum + (o.total || 0), 0);
      const vendorPayout = vOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
      const platformFee = grossRevenue - vendorPayout;
      return {
        id: v.id,
        name: v.name,
        orders: vOrders.length,
        grossRevenue: Math.round(grossRevenue * 100) / 100,
        vendorPayout: Math.round(vendorPayout * 100) / 100,
        platformFee: Math.round(platformFee * 100) / 100,
        payoutStatus: (v.pendingPayout || 0) > 0 ? "pending" : "completed" as "pending" | "processing" | "completed",
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

    // Monthly trend (simulated for demo since we don't have months of data)
    const months = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan"];
    const monthlyTrend = months.map((month, i) => {
      const factor = 0.6 + (i * 0.1) + 0.075;
      const revenue = Math.round(totalRevenue * factor * 4);
      return {
        month,
        revenue,
        vendorPayouts: Math.round(revenue * 0.65),
        driverPayouts: Math.round(revenue * 0.14),
        platformRevenue: Math.round(revenue * 0.21),
      };
    });

    res.json({
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        vendorPayouts: Math.round(totalVendorPayouts * 100) / 100,
        driverPayouts: Math.round(totalDriverPayouts * 100) / 100,
        platformRevenue: Math.round(platformRevenue * 100) / 100,
        commissionRate,
      },
      vendorBreakdown,
      monthlyTrend,
    });
  });

  // Admin: all users list
  app.get("/api/admin/users", requireAuth(["admin"]), (req, res) => {
    const role = req.query.role as string | undefined;
    if (role) {
      const users = storage.getUsersByRole(role);
      return res.json(users.map(u => ({ ...u, password: undefined })));
    }
    const allRoles = ["customer", "driver", "laundromat", "vendor", "manager", "admin"];
    const allUsers = allRoles.flatMap(r => storage.getUsersByRole(r));
    res.json(allUsers.map(u => ({ ...u, password: undefined })));
  });

  // Admin: search users
  app.get("/api/admin/users/search", requireAuth(["admin"]), (req, res) => {
    const query = req.query.q as string;
    if (!query) return res.status(400).json({ error: "Search query required" });
    const users = storage.searchUsers(query);
    res.json(users.map(u => ({ ...u, password: undefined })));
  });

  // ─────────────────────────────────────────────────────────
  //  MANAGER ENDPOINTS (vendor-specific)
  // ─────────────────────────────────────────────────────────

  app.get("/api/manager/earnings", requireAuth(["admin", "manager"]), (req, res) => {
    const vendorId = Number(req.query.vendorId);
    if (!vendorId) {
      // Return aggregated earnings for all vendors
      const allVendors = storage.getVendors();
      const allOrders = storage.getOrders();
      const delivered = allOrders.filter(o => o.status === "delivered");
      const totalRevenue = delivered.reduce((sum, o) => sum + (o.total || 0), 0);
      const totalPayouts = delivered.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
      const totalDriverPayouts = delivered.reduce((sum, o) => sum + (o.driverPayout || 0), 0);

      const vendorBreakdown = allVendors.map(v => {
        const vendorOrders = delivered.filter(o => o.vendorId === v.id);
        return {
          vendorId: v.id,
          vendorName: v.name,
          orders: vendorOrders.length,
          revenue: vendorOrders.reduce((sum, o) => sum + (o.total || 0), 0),
          payout: vendorOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0),
          pending: v.pendingPayout || 0,
        };
      });

      return res.json({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalVendorPayouts: Math.round(totalPayouts * 100) / 100,
        totalDriverPayouts: Math.round(totalDriverPayouts * 100) / 100,
        platformRevenue: Math.round((totalRevenue - totalPayouts - totalDriverPayouts) * 100) / 100,
        vendorBreakdown,
      });
    }

    const vendor = storage.getVendor(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const vendorOrders = storage.getOrdersByVendor(vendorId);
    const delivered = vendorOrders.filter(o => o.status === "delivered");
    const totalRevenue = delivered.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalPayout = delivered.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);

    res.json({
      vendorId,
      vendorName: vendor.name,
      totalOrders: vendorOrders.length,
      completedOrders: delivered.length,
      activeOrders: vendorOrders.filter(o => !["delivered", "cancelled"].includes(o.status)).length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalPayout: Math.round(totalPayout * 100) / 100,
      pendingPayout: vendor.pendingPayout || 0,
      rating: vendor.rating,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  DRIVER EARNINGS
  // ─────────────────────────────────────────────────────────

  app.get("/api/driver/earnings", requireAuth(["driver", "admin", "manager"]), (req, res) => {
    // Security: drivers can only see their own earnings
    const cuE = (req as any).currentUser;
    if (cuE.role === "driver") {
      const myDriver = storage.getDriverByUserId(cuE.id);
      const requestedId = Number(req.query.driverId);
      if (myDriver && requestedId && requestedId !== myDriver.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    const driverId = Number(req.query.driverId);
    if (!driverId) return res.status(400).json({ error: "driverId required" });

    const driver = storage.getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const driverOrders = storage.getOrdersByDriver(driverId);
    const delivered = driverOrders.filter(o => o.status === "delivered");
    const todayDelivered = delivered.filter(o => {
      if (!o.deliveredAt) return false;
      return new Date(o.deliveredAt).toDateString() === new Date().toDateString();
    });

    const todayTrips = driver.todayTrips || 0;
    const perTrip = driver.payoutPerTrip || 8.50;
    // Calculate today earnings from actual deliveries; fall back to trips * rate if driver has trips recorded
    const calculatedTodayEarnings = todayDelivered.length * perTrip;
    const todayEarnings = calculatedTodayEarnings > 0 ? calculatedTodayEarnings : todayTrips * perTrip;
    const todayTips = todayTrips > 0 ? Math.round(todayTrips * 2.5 * 100) / 100 : 0; // avg $2.50 tip estimate

    // Weekly data from recent orders
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayDelivered = delivered.filter(o => {
        if (!o.deliveredAt) return false;
        return new Date(o.deliveredAt).toDateString() === d.toDateString();
      });
      weeklyData.push({
        day: dayNames[d.getDay()],
        earnings: dayDelivered.length * perTrip,
        trips: dayDelivered.length,
      });
    }
    // If all weekly data is 0 (demo data with old dates), generate realistic fallback
    const hasWeeklyData = weeklyData.some(w => w.earnings > 0);
    const finalWeeklyData = hasWeeklyData ? weeklyData : [
      { day: "Mon", earnings: 62.50, trips: 7 },
      { day: "Tue", earnings: 85.00, trips: 10 },
      { day: "Wed", earnings: 44.50, trips: 5 },
      { day: "Thu", earnings: 97.00, trips: 11 },
      { day: "Fri", earnings: 120.50, trips: 14 },
      { day: "Sat", earnings: 78.00, trips: 9 },
      { day: "Sun", earnings: 55.50, trips: 6 },
    ];

    // Trip history from delivered orders
    const tripHistory = delivered.slice(0, 10).map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      pickupAddress: o.pickupAddress || "Miami, FL",
      deliveryAddress: o.deliveryAddress || "Miami, FL",
      earnings: perTrip,
      tip: o.tip || 0,
      timestamp: o.deliveredAt || o.createdAt || new Date().toISOString(),
      status: "completed",
    }));

    const bestDayEarnings = finalWeeklyData.reduce((max, d) => Math.max(max, d.earnings), 0);
    const avgPerTrip = (driver.completedTrips || 0) > 0
      ? Math.round(((driver.totalEarnings || 0) / (driver.completedTrips || 1)) * 100) / 100
      : perTrip;

    res.json({
      driverId,
      driverName: driver.name,
      totalTrips: driver.completedTrips || 0,
      todayTrips,
      todayEarnings,
      todayTips,
      totalEarnings: driver.totalEarnings || 0,
      pendingPayout: driver.pendingPayout || 0,
      avgPerTrip,
      bestDayEarnings,
      weeklyData: finalWeeklyData,
      tripHistory,
      nextPayoutDate: new Date(Date.now() + (5 - new Date().getDay() + 7) % 7 * 86400000 || 7 * 86400000).toISOString(),
      rating: driver.rating,
      onTimePickupRate: driver.onTimePickupRate,
      avgPickupTime: driver.avgPickupTime,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  VENDOR PAYOUT MANAGEMENT
  // ─────────────────────────────────────────────────────────

  app.get("/api/vendor-payouts/:vendorId", requireAuth(["admin", "manager"]), (req, res) => {
    const vendorId = Number(req.params.vendorId);
    const vendor = storage.getVendor(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    const payouts = storage.getVendorPayouts(vendorId);
    res.json({
      vendorId,
      vendorName: vendor.name,
      pendingPayout: vendor.pendingPayout,
      totalEarnings: vendor.totalEarnings,
      payouts,
    });
  });

  app.post("/api/vendor-payouts", requireAuth(["admin", "manager"]), (req, res) => {
    const { vendorId, amount, periodStart, periodEnd, ordersCount } = req.body;
    if (!vendorId || !amount) {
      return res.status(400).json({ error: "vendorId and amount are required" });
    }
    const payout = storage.createVendorPayout({
      vendorId,
      amount,
      status: "pending",
      periodStart: periodStart || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: periodEnd || now(),
      ordersCount: ordersCount || 0,
      createdAt: now(),
    });
    res.status(201).json(payout);
  });

  app.patch("/api/vendor-payouts/:id", requireAuth(["admin"]), (req, res) => {
    const updated = storage.updateVendorPayout(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Payout not found" });

    // If completed, clear pendingPayout for vendor
    if (req.body.status === "completed") {
      const payout = updated;
      const vendor = storage.getVendor(payout.vendorId);
      if (vendor) {
        storage.updateVendor(vendor.id, {
          pendingPayout: Math.max(0, (vendor.pendingPayout || 0) - payout.amount),
        });
      }
    }

    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  AI CHAT (enhanced endpoint with actions)
  // ─────────────────────────────────────────────────────────

  app.post("/api/ai/chat", requireAuth(), (req, res) => {
    const { message, sessionId, orderId } = req.body;
    const currentUser = (req as any).currentUser;
    const userId = currentUser.id;
    if (!message) return res.status(400).json({ error: "message is required" });

    const intent = detectIntent(message);
    const { response, resolved, escalate } = generateAIResponse(intent, userId, message);
    const ts_ = now();

    let session;
    if (sessionId) session = storage.getChatSession(Number(sessionId));
    if (!session) {
      const newMessages = [
        { role: "user", content: message, timestamp: ts_ },
        { role: "assistant", content: response, timestamp: ts_, intent },
      ];
      session = storage.createChatSession({
        userId, orderId: orderId || undefined,
        status: resolved ? "resolved" : escalate ? "escalated" : "active",
        topic: intent, aiResolved: resolved ? 1 : 0,
        messagesJson: JSON.stringify(newMessages), createdAt: ts_,
        resolvedAt: resolved ? ts_ : undefined,
      });
    } else {
      let existingMessages: any[] = [];
      try { existingMessages = session.messagesJson ? JSON.parse(session.messagesJson) : []; } catch (_) {}
      existingMessages.push({ role: "user", content: message, timestamp: ts_ });
      existingMessages.push({ role: "assistant", content: response, timestamp: ts_, intent });
      session = storage.updateChatSession(session.id, {
        status: resolved ? "resolved" : escalate ? "escalated" : "active",
        aiResolved: resolved ? 1 : 0,
        messagesJson: JSON.stringify(existingMessages),
        resolvedAt: resolved ? ts_ : undefined,
      }) || session;
    }

    const actions: any[] = [];
    if (intent === "order_status") {
      const activeOrders = storage.getOrdersByCustomer(userId).filter(o => !["delivered","cancelled"].includes(o.status));
      if (activeOrders.length > 0) actions.push({ type: "view_order", data: { orderId: activeOrders[0].id } });
    }
    if (intent === "pricing") actions.push({ type: "navigate", data: { path: "/schedule" } });
    if (escalate) actions.push({ type: "escalate", data: { reason: intent } });

    res.json({ reply: response, sessionId: session.id, actions, intent, resolved, escalated: escalate });
  });

  // ─────────────────────────────────────────────────────────
  //  BLE SCALE WEIGHT RECORDING
  // ─────────────────────────────────────────────────────────

  app.post("/api/orders/:id/ble-weight", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const { weight, deviceName, rawReading, taredReading, weightType, actorId } = req.body;
    if (!weight || !weightType) return res.status(400).json({ error: "weight and weightType (dirty|clean) required" });

    const updateData: any = {};
    const ts_ = now();

    if (weightType === "dirty") {
      updateData.dirtyWeight = weight;
      updateData.intakeWeight = weight;
    } else if (weightType === "clean") {
      updateData.cleanWeight = weight;
      updateData.outputWeight = weight;
      if (order.dirtyWeight) {
        updateData.weightDifference = Math.round((order.dirtyWeight - weight) * 100) / 100;
      }
      if (order.tierMaxWeight) {
        const overage = Math.max(0, weight - order.tierMaxWeight);
        const tierInfo = order.tierName ? PRICING_TIERS[order.tierName as keyof typeof PRICING_TIERS] : null;
        const overageRate = tierInfo?.overageRate || 2.50;
        updateData.overageWeight = Math.round(overage * 100) / 100;
        updateData.overageCharge = Math.round(overage * overageRate * 100) / 100;
        const addOnsTotal = storage.getOrderAddOns(order.id).reduce((sum, a) => sum + a.total, 0);
        updateData.finalPrice = Math.round(((order.tierFlatPrice || 0) + updateData.overageCharge + addOnsTotal - (order.discount || 0) + (order.tax || 0) + (order.deliveryFee || 0)) * 100) / 100;
      }
    }

    storage.updateOrder(order.id, updateData);
    storage.createOrderEvent({
      orderId: order.id,
      eventType: weightType === "dirty" ? "dirty_weight_recorded" : "clean_weight_recorded",
      description: `${weightType === "dirty" ? "Dirty" : "Clean"} weight: ${weight} lbs (BLE scale: ${deviceName || "unknown"})`,
      details: JSON.stringify({ weight, deviceName, rawReading, taredReading, source: "ble_scale" }),
      actorId, actorRole: "vendor", timestamp: ts_,
    });

    res.json(storage.getOrder(order.id));
  });

  // ─────────────────────────────────────────────────────────
  //  STRIPE CONNECT PAYMENT ROUTES
  // ─────────────────────────────────────────────────────────

  const PLATFORM_FEE_RATE = 0.18;
  const VENDOR_SHARE = 0.65;
  const DRIVER_SHARE = 0.35;
  const hasStripe = !!process.env.STRIPE_SECRET_KEY;

  app.post("/api/payments/create-intent", requireAuth(), (req, res) => {
    const { orderId, amount } = req.body;
    if (!orderId || !amount) return res.status(400).json({ error: "orderId and amount required" });

    const order = storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const demoIntentId = `pi_demo_${Date.now()}_${randomBytes(4).toString("hex")}`;
    const txn = storage.createPaymentTransaction({
      orderId: Number(orderId), type: "charge", amount, currency: "usd",
      status: "pending", stripePaymentIntentId: demoIntentId,
      recipientType: "platform",
      platformFee: Math.round(amount * PLATFORM_FEE_RATE * 100) / 100,
      metadata: JSON.stringify({ demo: !hasStripe }), createdAt: now(),
    });

    res.json({
      paymentIntentId: demoIntentId, transactionId: txn.id,
      clientSecret: hasStripe ? null : `demo_secret_${demoIntentId}`,
      amount, status: "pending", demoMode: !hasStripe,
    });
  });

  app.post("/api/payments/confirm", requireAuth(["admin", "manager"]), (req, res) => {
    // Security: only admin/manager can confirm payments — real payment confirmation
    // comes through the Stripe webhook, not from client-side requests
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    const order = storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const txns = storage.getPaymentTransactionsByOrder(Number(orderId));
    const chargeTxn = txns.find(t => t.type === "charge" && t.status === "pending");
    if (chargeTxn) storage.updatePaymentTransaction(chargeTxn.id, { status: "completed", completedAt: now() });

    storage.updateOrder(order.id, { paymentStatus: "captured" });
    storage.createOrderEvent({
      orderId: order.id, eventType: "payment_captured",
      description: `Payment of $${order.total?.toFixed(2)} captured${hasStripe ? "" : " (demo)"}`,
      timestamp: now(),
    });
    res.json({ status: "completed", orderId: order.id, demoMode: !hasStripe });
  });

  app.post("/api/payments/refund", requireAuth(), (req, res) => {
    const { orderId, amount, reason } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    const order = storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const refundAmount = amount || order.total || 0;
    const ts_ = now();
    const txn = storage.createPaymentTransaction({
      orderId: Number(orderId), type: "refund", amount: refundAmount,
      currency: "usd", status: "completed", recipientType: "platform",
      metadata: JSON.stringify({ reason, demo: !hasStripe }),
      createdAt: ts_, completedAt: ts_,
    });
    storage.updateOrder(order.id, { paymentStatus: "refunded" });
    res.json({ refundId: txn.id, amount: refundAmount, status: "completed", demoMode: !hasStripe });
  });

  app.get("/api/payments/order/:id", requireAuth(), (req, res) => {
    const orderId = Number(req.params.id);
    const order = storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const transactions = storage.getPaymentTransactionsByOrder(orderId);
    const total = order.finalPrice || order.total || 0;
    const platformFee = Math.round(total * PLATFORM_FEE_RATE * 100) / 100;
    const remaining = total - platformFee;
    const vendorShare = Math.round(remaining * VENDOR_SHARE * 100) / 100;
    const driverShare = Math.round(remaining * DRIVER_SHARE * 100) / 100;

    res.json({ orderId, paymentStatus: order.paymentStatus, total, platformFee, vendorShare, driverShare, transactions, demoMode: !hasStripe });
  });

  app.post("/api/payments/setup-connect", requireAuth(), (req, res) => {
    const { userId, userType } = req.body;
    if (!userId || !userType) return res.status(400).json({ error: "userId and userType required" });

    const existing = storage.getStripeAccount(Number(userId));
    if (existing) return res.json({ accountId: existing.stripeAccountId, status: existing.status, onboardingUrl: null, existing: true });

    const demoAccountId = `acct_demo_${Date.now()}_${randomBytes(3).toString("hex")}`;
    const account = storage.createStripeAccount({
      userId: Number(userId), userType, stripeAccountId: demoAccountId,
      status: hasStripe ? "pending" : "active",
      onboardingComplete: hasStripe ? 0 : 1,
      payoutsEnabled: hasStripe ? 0 : 1,
      chargesEnabled: hasStripe ? 0 : 1,
      createdAt: now(),
    });
    res.status(201).json({ accountId: demoAccountId, status: account.status, onboardingUrl: hasStripe ? `https://connect.stripe.com/setup/${demoAccountId}` : null, demoMode: !hasStripe });
  });

  app.get("/api/payments/connect-status/:userId", requireAuth(), (req, res) => {
    const userId = Number(req.params.userId);
    const account = storage.getStripeAccount(userId);
    if (!account) return res.json({ connected: false, status: "not_connected" });
    res.json({
      connected: true, accountId: account.stripeAccountId, status: account.status,
      onboardingComplete: !!account.onboardingComplete, payoutsEnabled: !!account.payoutsEnabled,
      chargesEnabled: !!account.chargesEnabled, demoMode: !hasStripe,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  GPS TRACKING ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  // ── Update driver location ──
  app.post("/api/drivers/:id/location", requireAuth(["driver", "admin"]), (req, res) => {
    // Security: drivers can only update their own location
    const cuLocP = (req as any).currentUser;
    if (cuLocP.role === "driver") {
      const myDriverLocP = storage.getDriverByUserId(cuLocP.id);
      if (!myDriverLocP || myDriverLocP.id !== Number(req.params.id)) {
        return res.status(403).json({ error: "Access denied — can only update your own location" });
      }
    }
    const driverId = Number(req.params.id);
    const driver = storage.getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const { lat, lng, speed, heading, accuracy } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: "lat and lng required" });

    storage.updateDriver(driverId, { currentLat: lat, currentLng: lng });

    const loc = storage.createDriverLocationHistory({
      driverId,
      orderId: req.body.orderId || null,
      lat,
      lng,
      speed: speed || null,
      heading: heading || null,
      accuracy: accuracy || null,
      timestamp: now(),
    });

    // Emit location to any order rooms this driver is assigned to
    const activeOrders = storage.getOrdersByDriver(driverId).filter(
      o => !["completed", "cancelled", "delivered"].includes(o.status)
    );
    activeOrders.forEach(order => {
      emitToOrder(order.id, "driver_location", { driverId, lat, lng, speed, heading, timestamp: loc.timestamp });
    });

    res.json({ id: loc.id, lat, lng, timestamp: loc.timestamp });
  });

  // ── Get order tracking info (customer-facing) ──
  app.get("/api/orders/:id/tracking", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: customer can only track their own orders
    const user = (req as any).currentUser;
    const userRole = user?.role || "customer";
    if (userRole === "customer" && order.customerId !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const isDriverPhase = [
      "driver_en_route_pickup", "arrived_pickup", "picked_up",
      "driver_en_route_facility", "driver_en_route_delivery", "arrived_delivery"
    ].includes(order.status);

    let driverLocation = null;
    let driverInfo = null;

    if (order.driverId && isDriverPhase) {
      const driver = storage.getDriver(order.driverId);
      if (driver) {
        driverLocation = { lat: driver.currentLat, lng: driver.currentLng };
        // NEVER expose driver personal phone to customer — use masked name and vehicle only
        driverInfo = {
          id: driver.id,
          name: driver.name,
          vehicleInfo: driver.vehicleInfo,
          photo: driver.photo,
          // phone deliberately omitted for privacy
        };
      }
    }

    const history = storage.getOrderStatusHistory(order.id);
    const progress = getProgressPercent(order.status);

    res.json({
      orderId: order.id,
      status: order.status,
      progress,
      isDriverPhase,
      driverLocation,
      driverInfo,
      pickup: { address: order.pickupAddress },
      delivery: { address: order.deliveryAddress },
      eta: isDriverPhase ? "~15 min" : null,
      history,
    });
  });

  // ── Get driver location history (admin) ──
  app.get("/api/drivers/:id/location-history", requireAuth(["admin"]), (req, res) => {
    const driverId = Number(req.params.id);
    const limit = Number(req.query.limit) || 100;
    const history = storage.getDriverLocationHistory(driverId, limit);
    res.json(history);
  });

  // ═══════════════════════════════════════════════════════════════
  //  PHOTO CAPTURE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  const VALID_PHOTO_TYPES = [
    "pickup_proof", "delivery_proof", "intake_before", "intake_after",
    "damage", "quality_check",
  ];

  app.post("/api/orders/:id/photos", requireAuth(), (req, res) => {
    const orderId = Number(req.params.id);
    const order = storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentUser = (req as any).currentUser;
    const { type, photoData, lat, lng, notes } = req.body;

    if (!type || !photoData) return res.status(400).json({ error: "type and photoData required" });
    if (!VALID_PHOTO_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid photo type. Must be one of: ${VALID_PHOTO_TYPES.join(", ")}` });
    }

    const photo = storage.createOrderPhoto({
      orderId,
      type,
      photoData,
      lat: lat || null,
      lng: lng || null,
      capturedBy: currentUser.id,
      capturedByRole: currentUser.role,
      notes: notes || null,
      timestamp: now(),
    });

    // Update order photo URL fields
    const photoRef = `photo:${photo.id}`;
    const updateData: any = {};
    if (type === "pickup_proof") updateData.pickupPhotoUrl = photoRef;
    else if (type === "delivery_proof") updateData.deliveryPhotoUrl = photoRef;
    else if (type === "intake_before") updateData.intakePhotoUrl = photoRef;
    else if (type === "intake_after") updateData.outputPhotoUrl = photoRef;
    if (Object.keys(updateData).length > 0) storage.updateOrder(orderId, updateData);

    storage.createOrderEvent({
      orderId,
      eventType: `photo_${type}`,
      description: `${type.replace(/_/g, " ")} photo captured by ${currentUser.role}`,
      actorId: currentUser.id,
      actorRole: currentUser.role,
      timestamp: now(),
    });

    // Return without full base64 in response
    res.status(201).json({ id: photo.id, orderId, type, timestamp: photo.timestamp, notes: photo.notes });
  });

  app.get("/api/orders/:id/photos", requireAuth(), (req, res) => {
    const orderForPhotos = storage.getOrder(Number(req.params.id));
    if (!orderForPhotos) return res.status(404).json({ error: "Order not found" });
    const cu = (req as any).currentUser;
    const drPhoto = cu.role === "driver" ? storage.getDriverByUserId(cu.id) : null;
    const vnPhoto = ["laundromat","vendor"].includes(cu.role) ? (storage as any).getVendorByUserId?.(cu.id) ?? (orderForPhotos.vendorId ? storage.getVendor(orderForPhotos.vendorId) : null) : null;
    if (!getOrderOwnershipAllowed(orderForPhotos, cu, drPhoto, vnPhoto)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const photos = storage.getOrderPhotos(Number(req.params.id));
    // Truncate base64 for listing
    const summaries = photos.map(p => ({
      id: p.id, orderId: p.orderId, type: p.type,
      capturedBy: p.capturedBy, capturedByRole: p.capturedByRole,
      notes: p.notes, timestamp: p.timestamp,
      hasPhoto: !!p.photoData,
      thumbnail: p.photoData ? p.photoData.substring(0, 100) + "..." : null,
    }));
    res.json(summaries);
  });

  app.get("/api/orders/:id/photos/:photoId", requireAuth(), (req, res) => {
    const orderSingle = storage.getOrder(Number(req.params.id));
    if (!orderSingle) return res.status(404).json({ error: "Order not found" });
    const cuS = (req as any).currentUser;
    const drS = cuS.role === "driver" ? storage.getDriverByUserId(cuS.id) : null;
    const vnS = ["laundromat","vendor"].includes(cuS.role) ? (storage as any).getVendorByUserId?.(cuS.id) ?? (orderSingle.vendorId ? storage.getVendor(orderSingle.vendorId) : null) : null;
    if (!getOrderOwnershipAllowed(orderSingle, cuS, drS, vnS)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const photos = storage.getOrderPhotos(Number(req.params.id));
    const photo = photos.find(p => p.id === Number(req.params.photoId));
    if (!photo) return res.status(404).json({ error: "Photo not found" });
    res.json(photo);
  });

  app.get("/api/orders/:id/photos/type/:type", requireAuth(), (req, res) => {
    const orderT = storage.getOrder(Number(req.params.id));
    if (!orderT) return res.status(404).json({ error: "Order not found" });
    const cuT = (req as any).currentUser;
    const drT = cuT.role === "driver" ? storage.getDriverByUserId(cuT.id) : null;
    const vnT = ["laundromat","vendor"].includes(cuT.role) ? (storage as any).getVendorByUserId?.(cuT.id) ?? (orderT.vendorId ? storage.getVendor(orderT.vendorId) : null) : null;
    if (!getOrderOwnershipAllowed(orderT, cuT, drT, vnT)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const photos = storage.getOrderPhotosByType(Number(req.params.id), req.params.type);
    res.json(photos);
  });

  // ═══════════════════════════════════════════════════════════════
  //  ENHANCED NOTIFICATION ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  app.delete("/api/notifications/:id", requireAuth(), (req, res) => {
    storage.deleteNotification(Number(req.params.id));
    res.json({ success: true });
  });

  app.get("/api/notifications/category/:category", requireAuth(), (req, res) => {
    const currentUser = (req as any).currentUser;
    const notifications = storage.getNotificationsByCategory(currentUser.id, req.params.category);
    res.json(notifications);
  });

  // ─────────────────────────────────────────────────────────
  //  HEALTH CHECK
  // ─────────────────────────────────────────────────────────

  app.get("/api/health", (_req, res) => {
    const allOrders = storage.getOrders();
    const allVendors = storage.getVendors();
    const allDrivers = storage.getDrivers();

    res.json({
      status: "healthy",
      timestamp: now(),
      counts: {
        orders: allOrders.length,
        vendors: allVendors.length,
        drivers: allDrivers.length,
      },
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  FSM TRANSITION ENDPOINT
  // ═══════════════════════════════════════════════════════════════

  app.post("/api/orders/:id/transition", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: ownership check
    const user_ = (req as any).currentUser;
    if (user_.role === "customer" && order.customerId !== user_.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (user_.role === "driver") {
      const drv = storage.getDriverByUserId(user_.id);
      if (!drv || order.driverId !== drv.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const { newStatus, actorRole, actorId, notes, lat, lng } = req.body;
    if (!newStatus) return res.status(400).json({ error: "newStatus is required" });

    const currentUser = (req as any).currentUser;
    const role = actorRole || currentUser?.role || "system";
    const actor = actorId || currentUser?.id;

    // Validate the transition using the FSM
    const validation = validateTransition(order.status, newStatus, role);
    if (!validation.valid) {
      return res.status(400).json({
        error: (validation as any).error,
        allowed: (validation as any).allowed,
      });
    }

    const ts_ = now();
    const updateData: any = { status: newStatus, updatedAt: ts_ };

    // Set timestamp field based on transition
    const tsField = getTimestampField(newStatus);
    if (tsField) updateData[tsField] = ts_;

    // Handle delivered — payment capture, loyalty, referrals
    if (newStatus === "delivered") {
      processPaymentCapture(order);
      awardLoyaltyPoints(order.customerId, order.id, order.total || 0);
      const referrals_ = storage.getReferralsByUser(order.customerId);
      const pendingReferral = referrals_.find(r => r.refereeId === order.customerId && r.status === "pending");
      if (pendingReferral) {
        storage.updateReferral(pendingReferral.id, {
          status: "rewarded",
          completedOrderId: order.id,
          completedAt: ts_,
        });
        const referrer = storage.getUser(pendingReferral.referrerId);
        if (referrer) {
          storage.updateUser(referrer.id, { loyaltyPoints: (referrer.loyaltyPoints || 0) + 1000 });
          storage.createLoyaltyTransaction({ userId: referrer.id, type: "referral", points: 1000, description: "Referral reward: your friend placed their first order!", createdAt: ts_ });
          notifyAndEmit(referrer.id, null, "loyalty", "Referral Reward!", "You earned 1,000 points because your referral placed their first order.", "/profile");
        }
        const referee = storage.getUser(order.customerId);
        if (referee) {
          storage.updateUser(referee.id, { loyaltyPoints: (referee.loyaltyPoints || 0) + 1000 });
          storage.createLoyaltyTransaction({ userId: referee.id, type: "referral", points: 1000, description: "Referral completion bonus — thanks for your first order!", createdAt: ts_ });
        }
      }
    }

    // Handle cancelled
    if (newStatus === "cancelled") {
      updateData.cancelledAt = ts_;
      updateData.paymentStatus = "refunded";
      if (order.vendorId) {
        const vendor = storage.getVendor(order.vendorId);
        if (vendor && (vendor.currentLoad || 0) > 0) {
          storage.updateVendor(vendor.id, { currentLoad: (vendor.currentLoad || 0) - 1 });
        }
      }
      if (order.driverId) {
        const driver = storage.getDriver(order.driverId);
        if (driver) storage.updateDriver(driver.id, { status: "available" });
      }
    }

    // Free resources on delivered
    if (newStatus === "delivered") {
      if (order.driverId) {
        const driver = storage.getDriver(order.driverId);
        if (driver) storage.updateDriver(driver.id, { status: "available" });
      }
      if (order.vendorId) {
        const vendor = storage.getVendor(order.vendorId);
        if (vendor && (vendor.currentLoad || 0) > 0) {
          storage.updateVendor(vendor.id, { currentLoad: (vendor.currentLoad || 0) - 1 });
        }
      }
    }

    // Assign return driver when ready_for_delivery
    if (newStatus === "ready_for_delivery") {
      const vendorObj = order.vendorId ? storage.getVendor(order.vendorId) : null;
      if (vendorObj) {
        const returnDriver = findBestDriver(vendorObj.lat || 25.78, vendorObj.lng || -80.19);
        if (returnDriver) {
          updateData.returnDriverId = returnDriver.id;
          storage.updateDriver(returnDriver.id, { status: "busy", todayTrips: (returnDriver.todayTrips || 0) + 1 });
          storage.createOrderEvent({ orderId: order.id, eventType: "return_driver_assigned", description: `${returnDriver.name} assigned for delivery`, actorRole: "system", timestamp: ts_ });
          notifyAndEmit(returnDriver.userId, order.id, "order_update", "Delivery Pickup", `Pick up clean laundry for delivery.`, `/driver/order/${order.id}`);
        }
      }
    }

    storage.updateOrder(order.id, updateData);

    // Record in order_status_history
    storage.createOrderStatusHistory({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: newStatus,
      actorId: actor,
      actorRole: role,
      notes,
      lat,
      lng,
      timestamp: ts_,
    });

    // Record in order_events audit trail
    storage.createOrderEvent({
      orderId: order.id,
      eventType: newStatus,
      description: notes || `Order transitioned to ${newStatus.replace(/_/g, " ")}`,
      actorId: actor,
      actorRole: role,
      lat,
      lng,
      timestamp: ts_,
    });

    // Send notifications based on FSM config
    const notifConfig = STATUS_NOTIFICATIONS[newStatus];
    if (notifConfig) {
      if (notifConfig.customer) {
        const body = notifConfig.customer
          .replace("{time}", order.pickupTimeWindow || "")
          .replace("{eta}", "~15 min");
        notifyAndEmit(order.customerId, order.id, "order_update",
          `Order ${STATUS_LABELS[newStatus] || newStatus}`, body, `/orders/${order.id}`);
      }
      if (notifConfig.driver && order.driverId) {
        const driver = storage.getDriver(order.driverId);
        if (driver) {
          notifyAndEmit(driver.userId, order.id, "order_update",
            `Order ${STATUS_LABELS[newStatus] || newStatus}`, notifConfig.driver, `/driver/order/${order.id}`);
        }
      }
      if (notifConfig.staff && order.vendorId) {
        // Notify all staff at the vendor
        const staffUsers = [...storage.getUsersByRole("laundromat"), ...storage.getUsersByRole("vendor")].filter(u => u.vendorId === order.vendorId);
        staffUsers.forEach(s => {
          notifyAndEmit(s.id, order.id, "order_update",
            `Order ${STATUS_LABELS[newStatus] || newStatus}`, notifConfig.staff!, `/staff`);
        });
      }
    }

    // Emit order status update via Socket.io
    const updatedOrder = storage.getOrder(order.id);
    emitToOrder(order.id, "order_status_changed", {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: newStatus,
      timestamp: ts_,
      order: updatedOrder,
    });

    // Review request on delivered
    if (newStatus === "delivered") {
      notifyAndEmit(order.customerId, order.id, "review_request",
        "How was your experience?", "Rate your laundry service to help us improve.", `/orders/${order.id}`);
    }

    res.json(updatedOrder);
  });

  // ── Get FSM info for an order ──
  app.get("/api/orders/:id/fsm", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentStatus = order.status;
    const allowed = FSM_TRANSITIONS[currentStatus] || validTransitions[currentStatus] || [];
    const history = storage.getOrderStatusHistory(order.id);
    const progress = getProgressPercent(currentStatus);
    const cancellable = isCancellable(currentStatus);

    res.json({
      currentStatus,
      allowed,
      cancellable,
      progress,
      timelineSteps: TIMELINE_STEPS,
      statusLabels: STATUS_LABELS,
      history,
    });
  });

  // ── Get order status history ──
  app.get("/api/orders/:id/status-history", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: ownership check
    const cu = (req as any).currentUser;
    if (cu.role === "customer" && order.customerId !== cu.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (cu.role === "driver") {
      const drv = storage.getDriverByUserId(cu.id);
      if (!drv || order.driverId !== drv.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const history = storage.getOrderStatusHistory(Number(req.params.id));
    res.json(history);
  });

  // ═══════════════════════════════════════════════════════════════
  //  REAL-TIME MESSAGING ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  // ── Get messages for an order ──
  app.get("/api/messages/:orderId", requireAuth(), (req, res) => {
    const orderId = Number(req.params.orderId);
    const order = storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: only participants can read messages
    const cu = (req as any).currentUser;
    if (cu.role === "customer" && order.customerId !== cu.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (cu.role === "driver") {
      const drv = storage.getDriverByUserId(cu.id);
      if (!drv || order.driverId !== drv.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const messages = storage.getMessagesByOrder(orderId);
    res.json(messages);
  });

  // ── Send a message ──
  app.post("/api/messages", requireAuth(), (req, res) => {
    const currentUser = (req as any).currentUser;
    const { orderId, content, messageType, recipientId } = req.body;

    if (!content || !orderId) {
      return res.status(400).json({ error: "orderId and content are required" });
    }

    // Security: ownership check + sender auth from token (not request body)
    const order = storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });
    const driverRec = currentUser.role === "driver" ? storage.getDriverByUserId(currentUser.id) : null;
    const vendorRec = ["laundromat","vendor"].includes(currentUser.role) ? (storage as any).getVendorByUserId?.(currentUser.id) ?? (order.vendorId ? storage.getVendor(order.vendorId) : null) : null;
    if (!getOrderOwnershipAllowed(order, currentUser, driverRec, vendorRec)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const message = storage.createMessage({
      orderId,
      conversationId: `order-${orderId}`,
      senderId: currentUser.id,
      senderRole: currentUser.role,
      content,
      messageType: messageType || "text",
      timestamp: now(),
    });

    // Emit via Socket.io to the order room
    emitToOrder(orderId, "new_message", message);

    // Notify the other party (reuse `order` from ownership check above)
    if (order) {
      // Determine who to notify based on sender role
      if (currentUser.role === "customer" && order.driverId) {
        const driverNotif = storage.getDriver(order.driverId);
        if (driverNotif) {
          notifyAndEmit(driverNotif.userId, orderId, "new_message",
            "New Message", `${(currentUser as any).name}: ${content.substring(0, 50)}`, `/driver/order/${orderId}`);
        }
      } else if (currentUser.role === "driver") {
        notifyAndEmit(order.customerId, orderId, "new_message",
          "New Message", `Driver: ${content.substring(0, 50)}`, `/orders/${orderId}`);
      }
    }

    res.status(201).json(message);
  });

  // ── Mark message as read ──
  app.patch("/api/messages/:id/read", requireAuth(), (req, res) => {
    const message = storage.markMessageRead(Number(req.params.id));
    if (!message) return res.status(404).json({ error: "Message not found" });

    // Emit read receipt
    if (message.orderId) {
      emitToOrder(message.orderId, "message_read", {
        messageId: message.id,
        readAt: message.readAt,
      });
    }

    res.json(message);
  });

  // ── Get conversations for current user ──
  app.get("/api/conversations", requireAuth(), (req, res) => {
    const currentUser = (req as any).currentUser;
    let userOrders: Order[];

    if (currentUser.role === "customer") {
      userOrders = storage.getOrdersByCustomer(currentUser.id);
    } else if (currentUser.role === "driver") {
      const driver = storage.getDriverByUserId(currentUser.id);
      userOrders = driver ? storage.getOrdersByDriver(driver.id) : [];
    } else {
      userOrders = storage.getActiveOrders();
    }

    // Build conversation list with latest message per order
    const conversations = userOrders
      .filter(o => !["cancelled"].includes(o.status))
      .map(order => {
        const messages = storage.getMessagesByOrder(order.id);
        const lastMessage = messages[messages.length - 1];
        const unreadCount = messages.filter(m => !m.readAt && m.senderId !== currentUser.id).length;
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          lastMessage: lastMessage ? {
            content: lastMessage.content,
            timestamp: lastMessage.timestamp,
            senderRole: lastMessage.senderRole,
          } : null,
          unreadCount,
        };
      })
      .filter(c => c.lastMessage)
      .sort((a, b) => {
        const ta = a.lastMessage?.timestamp || "";
        const tb = b.lastMessage?.timestamp || "";
        return tb.localeCompare(ta);
      });

    res.json(conversations);
  });

  // =====================================================================
  //  PHASE 6: RECEIPTS, REFUND FLOW, EMAIL/SMS COMMUNICATIONS
  // =====================================================================

  // ── Generate receipt for an order ──
  app.get("/api/orders/:id/receipt", requireAuth(), (req, res) => {
    const order = storage.getOrder(Number(req.params.id));
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!["delivered", "completed"].includes(order.status)) {
      return res.status(400).json({ error: "Receipt only available for completed orders" });
    }

    const transactions = storage.getPaymentTransactionsByOrder(order.id);
    const chargeTxn = transactions.find(t => t.type === "charge" && t.status === "completed");
    const refundTxns = transactions.filter(t => t.type === "refund");
    const totalRefunded = refundTxns.reduce((sum, t) => sum + (t.amount || 0), 0);

    // Parse line items from the order's details or from associated quote
    let lineItems: any[] = [];
    try {
      const details = order.details ? JSON.parse(order.details as string) : {};
      if (details.lineItems) lineItems = details.lineItems;
    } catch { /* ignore */ }

    const receipt = {
      receiptNumber: `RCT-${order.orderNumber}`,
      orderNumber: order.orderNumber,
      orderId: order.id,
      customerId: order.customerId,
      issuedAt: now(),
      orderDate: order.createdAt,
      completedDate: order.deliveredAt || order.updatedAt,
      pickupAddress: order.pickupAddress,
      deliveryAddress: order.deliveryAddress || order.pickupAddress,
      lineItems,
      subtotal: order.subtotal || order.total || 0,
      tax: order.tax || 0,
      taxRate: TAX_RATE,
      deliveryFee: order.deliveryFee || 0,
      discount: order.discount || 0,
      total: order.finalPrice || order.total || 0,
      amountPaid: chargeTxn?.amount || order.finalPrice || order.total || 0,
      amountRefunded: totalRefunded,
      netCharged: (chargeTxn?.amount || 0) - totalRefunded,
      paymentMethod: chargeTxn?.stripePaymentIntentId?.startsWith("pi_demo") ? "Demo Payment" : "Credit Card",
      paymentStatus: order.paymentStatus,
      transactionId: chargeTxn?.stripePaymentIntentId || null,
      company: {
        name: "Offload USA",
        address: "New York, NY",
        email: "support@offloadusa.com",
        website: "https://offloadusa.com",
      },
    };

    res.json(receipt);
  });

  // ── Email/SMS communication stubs ──
  // These log communications and will be wired to real providers (SendGrid/Twilio)
  const communicationLog: any[] = [];

  app.post("/api/communications/send", requireAuth(["admin", "system"]), (req, res) => {
    const { recipientId, channel, templateName, templateData, orderId } = req.body;
    if (!recipientId || !channel || !templateName) {
      return res.status(400).json({ error: "recipientId, channel, and templateName required" });
    }
    if (!["email", "sms", "push", "in_app"].includes(channel)) {
      return res.status(400).json({ error: "channel must be email, sms, push, or in_app" });
    }

    // Template registry
    const templates: Record<string, { subject?: string; body: string }> = {
      order_confirmation: {
        subject: "Your Offload order is confirmed!",
        body: "Hi {{name}}, your order {{orderNumber}} has been confirmed. Pickup: {{pickupDate}} {{pickupTime}}. Total: ${{total}}.",
      },
      driver_assigned: {
        subject: "Driver on the way!",
        body: "Hi {{name}}, {{driverName}} is heading to pick up your laundry. ETA: {{eta}}.",
      },
      order_complete: {
        subject: "Your laundry is delivered!",
        body: "Hi {{name}}, your order {{orderNumber}} has been delivered. Final total: ${{total}}. Rate your experience at offloadusa.com.",
      },
      payment_receipt: {
        subject: "Payment receipt for order {{orderNumber}}",
        body: "Hi {{name}}, payment of ${{total}} has been processed for order {{orderNumber}}. Thank you!",
      },
      quote_ready: {
        subject: "Your Offload quote is ready",
        body: "Hi {{name}}, your quote {{quoteNumber}} for ${{total}} is ready. Accept within {{expiry}} minutes.",
      },
      quote_expired: {
        subject: "Your quote has expired",
        body: "Hi {{name}}, your quote {{quoteNumber}} has expired. Request a new quote at offloadusa.com.",
      },
      refund_issued: {
        subject: "Refund processed for order {{orderNumber}}",
        body: "Hi {{name}}, a refund of ${{refundAmount}} has been issued for order {{orderNumber}}. Allow 3-5 business days.",
      },
    };

    const template = templates[templateName];
    if (!template) return res.status(400).json({ error: `Unknown template: ${templateName}` });

    // Interpolate template
    let body = template.body;
    let subject = template.subject || "";
    if (templateData) {
      Object.entries(templateData).forEach(([k, v]) => {
        body = body.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        subject = subject.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
      });
    }

    const entry = {
      id: communicationLog.length + 1,
      recipientId,
      channel,
      templateName,
      subject,
      body,
      orderId: orderId || null,
      status: "sent",  // In production: "queued" → provider confirms "sent"/"delivered"/"failed"
      sentAt: now(),
      provider: channel === "email" ? "sendgrid" : channel === "sms" ? "twilio" : "internal",
    };
    communicationLog.push(entry);

    // Also create notification for in-app
    if (channel === "in_app" || channel === "push") {
      storage.createNotification({
        userId: Number(recipientId),
        type: templateName,
        message: body,
        data: JSON.stringify({ orderId, templateName, subject }),
        read: 0,
        timestamp: now(),
      });
    }

    res.status(201).json(entry);
  });

  app.get("/api/communications/log", requireAuth(["admin"]), (req, res) => {
    const { orderId, channel, limit } = req.query;
    let filtered = communicationLog;
    if (orderId) filtered = filtered.filter(c => c.orderId === Number(orderId));
    if (channel) filtered = filtered.filter(c => c.channel === channel);
    const max = Math.min(Number(limit) || 100, 500);
    res.json(filtered.slice(-max));
  });

  // ── Enhanced refund with reason codes and partial refund support ──
  app.post("/api/payments/partial-refund", requireAuth(["admin", "manager"]), (req, res) => {
    const { orderId, amount, reasonCode, notes } = req.body;
    if (!orderId || !amount) return res.status(400).json({ error: "orderId and amount required" });

    const validReasons = ["damaged_items", "late_delivery", "wrong_items", "quality_issue", "customer_request", "overcharge", "other"];
    if (reasonCode && !validReasons.includes(reasonCode)) {
      return res.status(400).json({ error: `Invalid reason code. Valid: ${validReasons.join(", ")}` });
    }

    const order = storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const existingRefunds = storage.getPaymentTransactionsByOrder(Number(orderId))
      .filter(t => t.type === "refund" && t.status === "completed");
    const totalRefunded = existingRefunds.reduce((sum, t) => sum + (t.amount || 0), 0);
    const orderTotal = order.finalPrice || order.total || 0;
    const maxRefundable = orderTotal - totalRefunded;

    if (amount > maxRefundable) {
      return res.status(400).json({
        error: `Refund amount $${amount} exceeds max refundable $${maxRefundable.toFixed(2)}`,
        maxRefundable,
        totalAlreadyRefunded: totalRefunded,
      });
    }

    const ts_ = now();
    const txn = storage.createPaymentTransaction({
      orderId: Number(orderId),
      type: "refund",
      amount: Number(amount),
      currency: "usd",
      status: "completed",
      recipientType: "platform",
      metadata: JSON.stringify({ reasonCode, notes, partial: amount < orderTotal, demo: !hasStripe }),
      createdAt: ts_,
      completedAt: ts_,
    });

    // Update payment status
    const newTotalRefunded = totalRefunded + Number(amount);
    const newPaymentStatus = newTotalRefunded >= orderTotal ? "refunded" : "partially_refunded";
    storage.updateOrder(order.id, { paymentStatus: newPaymentStatus });

    storage.createOrderEvent({
      orderId: order.id,
      eventType: "refund_issued",
      description: `Partial refund of $${Number(amount).toFixed(2)} issued. Reason: ${reasonCode || "not specified"}`,
      timestamp: ts_,
    });

    res.json({
      refundId: txn.id,
      amount: Number(amount),
      reasonCode,
      remainingRefundable: maxRefundable - Number(amount),
      totalRefunded: newTotalRefunded,
      paymentStatus: newPaymentStatus,
      demoMode: !hasStripe,
    });
  });

  // ── Quote-to-payment bridge: create payment intent from accepted quote ──
  app.post("/api/quotes/:id/create-payment", requireAuth(), (req, res) => {
    const quote = storage.getQuote(Number(req.params.id));
    if (!quote) return res.status(404).json({ error: "Quote not found" });
    if (quote.status !== "accepted") {
      return res.status(400).json({ error: "Quote must be accepted before payment" });
    }

    const amount = Number(quote.total);
    const demoIntentId = `pi_quote_${quote.id}_${Date.now()}`;

    // Update quote status to indicate payment initiated
    storage.updateQuote(quote.id, { status: "payment_pending", updatedAt: now() });

    res.json({
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      paymentIntentId: demoIntentId,
      clientSecret: hasStripe ? null : `demo_secret_${demoIntentId}`,
      amount,
      demoMode: !hasStripe,
    });
  });

  // =====================================================================
  //  PHASE 8: ENHANCED HEALTH CHECK, FEATURE FLAGS, ENV CONFIG
  // =====================================================================

  // ── Deep health check (replaces basic one above — more detailed) ──
  app.get("/api/health/deep", requireAuth(["admin", "manager"]), (_req, res) => {
    const startMs = Date.now();
    try {
      // DB connectivity check
      const allOrders = storage.getOrders();
      const allVendors = storage.getVendors();
      const allDrivers = storage.getDrivers();
      const activeOrders = allOrders.filter(o => !["completed", "cancelled", "quote_expired"].includes(o.status));

      // Memory usage
      const mem = process.memoryUsage();

      res.json({
        status: "healthy",
        version: process.env.APP_VERSION || "1.0.0",
        environment: process.env.NODE_ENV || "development",
        timestamp: now(),
        uptime: Math.round(process.uptime()),
        responseTimeMs: Date.now() - startMs,
        database: {
          status: "connected",
          engine: "sqlite",
          counts: {
            orders: allOrders.length,
            activeOrders: activeOrders.length,
            vendors: allVendors.length,
            drivers: allDrivers.length,
          },
        },
        payments: {
          stripeConnected: hasStripe,
          mode: hasStripe ? "live" : "demo",
        },
        memory: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
        features: getFeatureFlags(),
      });
    } catch (err: any) {
      res.status(503).json({
        status: "unhealthy",
        error: err.message,
        timestamp: now(),
      });
    }
  });

  // ── Feature flags ──
  const FEATURE_FLAGS: Record<string, { enabled: boolean; description: string; rolloutPercent: number }> = {
    real_payments: { enabled: hasStripe, description: "Process real Stripe payments vs demo mode", rolloutPercent: hasStripe ? 100 : 0 },
    quote_flow: { enabled: true, description: "Enable quote-first order flow (quote → accept → pay → order)", rolloutPercent: 100 },
    surge_pricing: { enabled: true, description: "Dynamic surge pricing during holidays/peak demand", rolloutPercent: 100 },
    preferred_vendor: { enabled: true, description: "Allow customers to choose preferred vendor with surcharge", rolloutPercent: 100 },
    ai_chat: { enabled: true, description: "AI-powered customer support chatbot", rolloutPercent: 100 },
    gps_tracking: { enabled: true, description: "Real-time driver GPS tracking", rolloutPercent: 100 },
    photo_evidence: { enabled: true, description: "Before/after photo capture for orders", rolloutPercent: 100 },
    subscription_tiers: { enabled: true, description: "Monthly subscription plans with discounts", rolloutPercent: 100 },
    email_notifications: { enabled: !!process.env.RESEND_API_KEY, description: "Email notifications via Resend (or SendGrid fallback)", rolloutPercent: process.env.RESEND_API_KEY ? 100 : 0 },
    sms_notifications: { enabled: false, description: "Twilio SMS notifications (requires TWILIO_SID)", rolloutPercent: 0 },
    weight_reconciliation: { enabled: true, description: "Dirty→clean weight comparison for quality assurance", rolloutPercent: 100 },
    fraud_detection: { enabled: true, description: "AI-based fraud detection on orders", rolloutPercent: 100 },
  };

  function getFeatureFlags() { return FEATURE_FLAGS; }

  app.get("/api/feature-flags", requireAuth(["admin", "manager"]), (_req, res) => {
    res.json(FEATURE_FLAGS);
  });

  app.put("/api/feature-flags/:flag", requireAuth(["admin"]), (req, res) => {
    const flag = req.params.flag;
    if (!FEATURE_FLAGS[flag]) return res.status(404).json({ error: `Unknown feature flag: ${flag}` });

    const { enabled, rolloutPercent } = req.body;
    if (typeof enabled === "boolean") FEATURE_FLAGS[flag].enabled = enabled;
    if (typeof rolloutPercent === "number") FEATURE_FLAGS[flag].rolloutPercent = Math.max(0, Math.min(100, rolloutPercent));

    storage.createPricingAuditEntry({
      action: "feature_flag_updated",
      details: JSON.stringify({ flag, enabled: FEATURE_FLAGS[flag].enabled, rolloutPercent: FEATURE_FLAGS[flag].rolloutPercent }),
      actorId: (req as any).currentUser?.id,
      actorRole: (req as any).currentUser?.role || "admin",
      timestamp: now(),
    });

    res.json({ flag, ...FEATURE_FLAGS[flag] });
  });

  // ── Environment info (admin only) ──
  app.get("/api/env", requireAuth(["admin"]), (_req, res) => {
    res.json({
      nodeEnv: process.env.NODE_ENV || "development",
      appVersion: process.env.APP_VERSION || "1.0.0",
      port: process.env.PORT || 5000,
      stripeConfigured: hasStripe,
      resendConfigured: !!process.env.RESEND_API_KEY,
      sendgridConfigured: !!process.env.SENDGRID_API_KEY,
      twilioConfigured: !!process.env.TWILIO_ACCOUNT_SID,
      databaseEngine: "sqlite",
      uptime: Math.round(process.uptime()),
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    });
  });

  // ── Request ID middleware is already in place via rate limiter ──
  // ── Structured logging helper ──
  app.get("/api/admin/audit-log", requireAuth(["admin"]), (req, res) => {
    const { limit, offset, action } = req.query;
    const allLogs = storage.getPricingAuditLog(Number(limit) || 100, Number(offset) || 0);
    const filtered = action ? allLogs.filter((l: any) => l.action === action) : allLogs;
    res.json({
      total: filtered.length,
      entries: filtered,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  STRIPE WEBHOOK ENDPOINT
  // ═══════════════════════════════════════════════════════════════

  app.post("/api/webhooks/stripe", (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      // SECURITY: Do NOT process webhooks without a configured secret
      console.warn("[Stripe Webhook] REJECTED — STRIPE_WEBHOOK_SECRET not configured. Set it in environment.");
      return res.status(503).json({ error: "Payment webhook not configured", mode: "not_ready" });
    }

    if (!sig) {
      console.warn("[Stripe Webhook] REJECTED — missing stripe-signature header");
      return res.status(400).json({ error: "Missing stripe-signature header" });
    }

    try {
      // Verify webhook signature using Stripe SDK
      // NOTE: Requires `stripe` package and raw body. Until Stripe SDK is configured:
      const crypto = require("crypto");
      const payload = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const sigParts = (sig as string).split(",").reduce((acc: any, part: string) => {
        const [k, v] = part.split("=");
        acc[k] = v;
        return acc;
      }, {} as Record<string, string>);
      const timestamp = sigParts["t"];
      const expectedSig = sigParts["v1"];
      if (!timestamp || !expectedSig) {
        return res.status(400).json({ error: "Invalid stripe-signature format" });
      }
      const signedPayload = `${timestamp}.${payload}`;
      const computedSig = crypto.createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");
      if (computedSig !== expectedSig) {
        console.warn("[Stripe Webhook] REJECTED — signature mismatch");
        return res.status(400).json({ error: "Webhook signature verification failed" });
      }
      // Check timestamp freshness (reject events older than 5 minutes)
      const ageSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
      if (Math.abs(ageSeconds) > 300) {
        return res.status(400).json({ error: "Webhook timestamp too old" });
      }

      const event = req.body;

      switch (event.type) {
        case "payment_intent.succeeded": {
          const pi = event.data?.object;
          if (pi?.metadata?.orderId) {
            const orderId = Number(pi.metadata.orderId);
            const order = storage.getOrder(orderId);
            if (order) {
              storage.updateOrder(orderId, { paymentStatus: "captured" });
              storage.createOrderEvent({
                orderId, eventType: "payment_captured",
                description: `Payment of $${(pi.amount / 100).toFixed(2)} confirmed via Stripe`,
                timestamp: now(),
              });
              // Trigger email notification
              sendOrderEmail(order, "payment_confirmed");
            }
          }
          break;
        }
        case "payment_intent.payment_failed": {
          const pi = event.data?.object;
          if (pi?.metadata?.orderId) {
            const orderId = Number(pi.metadata.orderId);
            storage.updateOrder(orderId, { paymentStatus: "failed" });
            storage.createOrderEvent({
              orderId, eventType: "payment_failed",
              description: `Payment failed: ${pi.last_payment_error?.message || "Unknown error"}`,
              timestamp: now(),
            });
          }
          break;
        }
        case "charge.refunded": {
          const charge = event.data?.object;
          if (charge?.metadata?.orderId) {
            const orderId = Number(charge.metadata.orderId);
            storage.updateOrder(orderId, { paymentStatus: "refunded" });
            storage.createOrderEvent({
              orderId, eventType: "payment_refunded",
              description: `Refund of $${(charge.amount_refunded / 100).toFixed(2)} processed`,
              timestamp: now(),
            });
          }
          break;
        }
        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[Stripe Webhook] Error:", err.message);
      res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  EMAIL NOTIFICATION SYSTEM
  // ═══════════════════════════════════════════════════════════════

  function sendOrderEmail(order: Order, template: string) {
    const customer = storage.getUser(order.customerId);
    if (!customer?.email) return;

    const templates: Record<string, { subject: string; body: (o: Order, c: any) => string }> = {
      order_confirmation: {
        subject: "Your Offload order is confirmed",
        body: (o, c) => `Hi ${c.name},\n\nYour order ${o.orderNumber} has been confirmed. Total: $${o.total?.toFixed(2)}.\n\nTrack your order in the app.\n\n— The Offload Team`,
      },
      payment_confirmed: {
        subject: "Payment received — Offload",
        body: (o, c) => `Hi ${c.name},\n\nPayment of $${o.total?.toFixed(2)} for order ${o.orderNumber} has been confirmed.\n\n— The Offload Team`,
      },
      driver_assigned: {
        subject: "Your driver is on the way — Offload",
        body: (o, c) => `Hi ${c.name},\n\nA driver has been assigned to your order ${o.orderNumber} and is heading your way.\n\nTrack in real-time in the app.\n\n— The Offload Team`,
      },
      delivered: {
        subject: "Your laundry has been delivered — Offload",
        body: (o, c) => `Hi ${c.name},\n\nYour order ${o.orderNumber} has been delivered. We hope everything looks great!\n\nLeave a review in the app.\n\n— The Offload Team`,
      },
      cancelled: {
        subject: "Order cancelled — Offload",
        body: (o, c) => `Hi ${c.name},\n\nYour order ${o.orderNumber} has been cancelled. Any charges have been refunded.\n\n— The Offload Team`,
      },
    };

    const tmpl = templates[template];
    if (!tmpl) return;

    const emailBody = tmpl.body(order, customer);
    const emailSubject = tmpl.subject;

    // Send email via Resend (or log in dev)
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      resend.emails.send({
        from: "Offload <notifications@offloadusa.com>",
        to: customer.email,
        subject: emailSubject,
        text: emailBody,
      }).then(() => {
        console.log(`[Email] Sent '${template}' to ${customer.email} via Resend`);
      }).catch((err: any) => {
        console.error(`[Email] Failed to send '${template}' to ${customer.email}:`, err);
      });
    } else if (process.env.SENDGRID_API_KEY) {
      // Fallback: SendGrid
      console.log(`[Email] Sending '${template}' to ${customer.email} via SendGrid`);
    } else {
      // Log email in development
      console.log(`[Email] Would send '${template}' to ${customer.email}: ${emailSubject}`);
    }

    // Always log the communication
    storage.createOrderEvent({
      orderId: order.id,
      eventType: "email_sent",
      description: `Email: ${emailSubject}`,
      details: JSON.stringify({ to: customer.email, template, subject: emailSubject }),
      timestamp: now(),
    });
  }

  // ── Send email endpoint for admin/system use ──
  app.post("/api/notifications/send-email", requireAuth(["admin", "manager"]), (req, res) => {
    const { orderId, template, customEmail } = req.body;
    if (!orderId && !customEmail) return res.status(400).json({ error: "orderId or customEmail required" });

    if (orderId) {
      const order = storage.getOrder(Number(orderId));
      if (!order) return res.status(404).json({ error: "Order not found" });
      sendOrderEmail(order, template || "order_confirmation");
      return res.json({ sent: true, orderId, template });
    }

    res.json({ sent: true, to: customEmail, template });
  });

  // ═══════════════════════════════════════════════════════════════
  //  CHAIN OF CUSTODY SUMMARY
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/orders/:id/chain-of-custody", requireAuth(), (req, res) => {
    const orderId = Number(req.params.id);
    const order = storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: ownership check
    const cu = (req as any).currentUser;
    if (cu.role === "customer" && order.customerId !== cu.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const events = storage.getOrderEvents(orderId);
    const photos = storage.getOrderPhotos ? storage.getOrderPhotos(orderId) : [];

    // Build chain of custody timeline
    const custodyChain = [];

    // Pickup
    if (order.pickedUpAt) {
      custodyChain.push({
        phase: "pickup",
        timestamp: order.pickedUpAt,
        actor: order.driverId ? `Driver #${order.driverId}` : "Unknown",
        weight: order.dirtyWeight || null,
        photoUrl: order.pickupPhotoUrl || null,
        status: "completed",
      });
    }

    // Facility intake
    if (order.arrivedLaundromatAt) {
      custodyChain.push({
        phase: "facility_intake",
        timestamp: order.arrivedLaundromatAt,
        actor: order.vendorId ? `Vendor #${order.vendorId}` : "Unknown",
        weight: order.intakeWeight || order.dirtyWeight || null,
        photoUrl: order.intakePhotoUrl || null,
        status: "completed",
      });
    }

    // Processing complete
    if (order.washCompletedAt) {
      custodyChain.push({
        phase: "processing_complete",
        timestamp: order.washCompletedAt,
        actor: order.vendorId ? `Vendor #${order.vendorId}` : "Unknown",
        weight: order.cleanWeight || null,
        photoUrl: order.outputPhotoUrl || null,
        weightDifference: order.weightDifference || null,
        status: "completed",
      });
    }

    // Delivery
    if (order.deliveredAt) {
      custodyChain.push({
        phase: "delivery",
        timestamp: order.deliveredAt,
        actor: order.driverId ? `Driver #${order.driverId}` : "Unknown",
        photoUrl: order.deliveryPhotoUrl || null,
        status: "completed",
      });
    }

    res.json({
      orderId,
      orderNumber: order.orderNumber,
      chain: custodyChain,
      weightReconciliation: {
        dirtyWeight: order.dirtyWeight || null,
        cleanWeight: order.cleanWeight || null,
        difference: order.weightDifference || null,
        withinTolerance: order.weightDifference != null ? Math.abs(order.weightDifference) <= (WEIGHT_TOLERANCE * (order.dirtyWeight || 1)) : null,
      },
      evidencePhotos: photos,
      relatedEvents: events.filter((e: any) =>
        ["dirty_weight_recorded", "clean_weight_recorded", "intake_completed", "output_weight_recorded",
         "pickup_proof", "delivery_proof", "quality_check"].includes(e.eventType)
      ),
    });
  });

  // ── API versioning header ──
  app.use((_req, res, next) => {
    res.setHeader("X-API-Version", "1.0.0");
    res.setHeader("X-Powered-By", "Offload");
    next();
  });

  return httpServer;
}
