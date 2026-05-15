import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage, db } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { distanceMiles } from "../lib/pricing";
import { SLA_CONFIGS, SUBSCRIPTION_TIERS } from "@shared/schema";
import type { Order, Vendor, Driver } from "@shared/schema";
import {
  VALID_TRANSITIONS as FSM_TRANSITIONS,
} from "../order-fsm";
import { formatCents, dollarsToCreditCents } from "../session";
import { now, notifyUser, notifyOrderUpdate } from "./order-calc";

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
