import type { Express } from "express";
import { z } from "zod";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { PRICING_TIERS } from "@shared/schema";
import type { Order } from "@shared/schema";
import { storage, db, logStripeReconciliation, addOrderCents } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import {
  calculatePricing,
  getSurgePricingTierAsync, getDemandMultiplier,
} from "../lib/pricing";
import {
  getStripe, hasStripe as hasStripeKey, dollarsToCents, centsToDollars,
} from "../lib/stripe";
import { getOrderEmailTemplate } from "../lib/email-templates";
import { requireAuth } from "../session";
import {
  generateOrderNumber, now,
  isVendorOpenNow, scoreVendor,
  findBestVendor, findBestDriver,
  calculateSLADeadline, checkSLAStatus,
  notifyUser,
  calculateFraudRisk,
} from "../engines";
import { getPagination, paginatedResponse } from "./deps";

// ── Shared helpers ─────────────────────────────────────────────────────────────
// These are exported so orders-ops-flow.ts can import them without duplicating.

export async function enrichAdminOrder(order: Order) {
  const customer = await storage.getUser(order.customerId);
  const vendor = order.vendorId ? await storage.getVendor(order.vendorId) : null;
  const driver = order.driverId ? await storage.getDriver(order.driverId) : null;
  const returnDriver = order.returnDriverId ? await storage.getDriver(order.returnDriverId) : null;
  return {
    ...order,
    customerName: customer?.name || "Unknown customer",
    customerEmail: customer?.email || null,
    customerPhone: customer?.phone || null,
    vendorName: vendor?.name || null,
    driverName: driver?.name || null,
    returnDriverName: returnDriver?.name || null,
  };
}

export async function sendOrderEmail(order: Order, template: string) {
  const customer = await storage.getUser(order.customerId);
  if (!customer?.email) return;

  const tmpl = getOrderEmailTemplate(template, order, customer);
  if (!tmpl) {
    console.log(`[Email] No template for '${template}', skipping order#${order.id}`);
    return;
  }

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: "Offload <notifications@offloadusa.com>",
      to: customer.email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
    });
    console.log(`[Email] Sent '${template}' to customer#${customer.id} via Resend: ${(result as any)?.data?.id || (result as any)?.id || "accepted"}`);
  } else if (process.env.SENDGRID_API_KEY) {
    console.log(`[Email] Would send '${template}' to customer#${customer.id} via SendGrid`);
  } else {
    console.log(`[Email] Would send '${template}' to customer#${customer.id}: ${tmpl.subject}`);
  }

  await storage.createOrderEvent({
    orderId: order.id,
    eventType: "email_sent",
    description: `Email sent: ${tmpl.subject}`,
    details: JSON.stringify({ template, to: customer.email }),
    actorRole: "system",
    timestamp: now(),
  });
}

export async function getCapturedChargeForOrder(orderId: number) {
  const transactions = await storage.getPaymentTransactionsByOrder(orderId);
  const chargeTxn = transactions.find(t =>
    t.type === "charge" &&
    ["completed", "paid", "captured"].includes(String(t.status || "")) &&
    !!t.stripePaymentIntentId
  ) || transactions.find(t =>
    t.type === "charge" &&
    !!t.stripePaymentIntentId &&
    !String(t.stripePaymentIntentId).startsWith("pi_demo_")
  );
  const alreadyRefundedCents = transactions
    .filter(t => t.type === "refund" && t.status === "completed")
    .reduce((sum, t) => sum + Number(t.amountCents ?? dollarsToCents(t.amount || 0)), 0);
  return { transactions, chargeTxn, alreadyRefundedCents };
}

export async function issueStripeRefundForOrder(order: Order, amountCents: number, reason: string | undefined, idempotencyKey: string) {
  const hasStripe = hasStripeKey();
  const stripe = getStripe();

  if (!["paid", "captured"].includes(String(order.paymentStatus || ""))) {
    return { errorStatus: 400, error: "Order payment must be paid or captured before refunding" };
  }

  const { chargeTxn, alreadyRefundedCents } = await getCapturedChargeForOrder(order.id);
  if (!chargeTxn) {
    return { errorStatus: 400, error: "Captured payment transaction not found" };
  }
  if (stripe && (!chargeTxn.stripePaymentIntentId || String(chargeTxn.stripePaymentIntentId).startsWith("pi_demo_"))) {
    return { errorStatus: 400, error: "Captured Stripe payment intent not found" };
  }

  const capturedAmountCents = Number(chargeTxn.amountCents ?? dollarsToCents(chargeTxn.amount || (order.finalPrice ?? order.total ?? 0)));
  const remainingRefundableCents = capturedAmountCents - alreadyRefundedCents;
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { errorStatus: 400, error: "Refund amount must be a positive integer number of cents" };
  }
  if (amountCents > remainingRefundableCents) {
    return {
      errorStatus: 400,
      error: "Refund amount exceeds remaining refundable amount",
      maxRefundable: remainingRefundableCents,
      totalAlreadyRefunded: alreadyRefundedCents,
    };
  }

  let stripeRefundId: string | null = null;
  if (stripe) {
    try {
      // Verify with Stripe that the PaymentIntent is in a state where a
      // refund of this size is actually possible. This catches edge cases
      // where local state is out of sync with Stripe (e.g. dispute, prior
      // out-of-band refund, uncaptured intent).
      const pi = await stripe.paymentIntents.retrieve(chargeTxn.stripePaymentIntentId!, {
        expand: ["latest_charge"],
      });
      if (pi.status !== "succeeded") {
        return { errorStatus: 400, error: `Cannot refund: PaymentIntent status is ${pi.status}` };
      }
      const latestCharge: any = (pi as any).latest_charge;
      if (!latestCharge || typeof latestCharge === "string") {
        return { errorStatus: 400, error: "Cannot refund: PaymentIntent has no expanded charge" };
      }
      if (latestCharge.refunded === true) {
        return { errorStatus: 400, error: "Cannot refund: charge is already fully refunded on Stripe" };
      }
      if (latestCharge.disputed === true) {
        return { errorStatus: 400, error: "Cannot refund: charge has an active dispute" };
      }
      const stripeRemainingCents = Number(latestCharge.amount_captured || latestCharge.amount || 0) - Number(latestCharge.amount_refunded || 0);
      if (amountCents > stripeRemainingCents) {
        return {
          errorStatus: 400,
          error: "Refund amount exceeds Stripe-side remaining refundable amount",
          stripeRemainingCents,
        };
      }
      const refund = await stripe.refunds.create({
        payment_intent: chargeTxn.stripePaymentIntentId!,
        amount: amountCents,
        reason: (reason === "duplicate" || reason === "fraudulent" || reason === "requested_by_customer") ? reason : "requested_by_customer",
      }, { idempotencyKey });
      stripeRefundId = refund.id;
    } catch (err: any) {
      console.error("[Stripe] Refund failed:", err.message);
      return { errorStatus: 502, error: "Refund processing failed" };
    }
  }

  const ts_ = now();
  const amountDollars = centsToDollars(amountCents);
  const newTotalRefundedCents = alreadyRefundedCents + amountCents;
  const newPaymentStatus = newTotalRefundedCents >= capturedAmountCents ? "refunded" : "partially_refunded";

  // Stripe refund already succeeded above — DB writes must be atomic.
  // If the transaction fails, log to reconciliation table so admins can fix.
  let txn: any;
  try {
    await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(schema.paymentTransactions).values({
        orderId: order.id,
        type: "refund",
        amount: amountDollars,
        amountCents,
        currency: "usd",
        status: "completed",
        recipientType: "platform",
        metadata: JSON.stringify({ reason, stripeRefundId, amountCents, idempotencyKey, demo: !hasStripe }),
        createdAt: ts_,
        completedAt: ts_,
      } as any).returning();
      txn = inserted;
      await tx.update(schema.orders).set({
        paymentStatus: newPaymentStatus,
        updatedAt: ts_,
      } as any).where(eq(schema.orders.id, order.id));
      await tx.insert(schema.orderEvents).values({
        orderId: order.id,
        eventType: "refund_issued",
        description: `Refund of $${amountDollars.toFixed(2)} issued. Reason: ${reason || "not specified"}`,
        timestamp: ts_,
      } as any);
    });
  } catch (txErr: any) {
    console.error("[refund] DB transaction failed after Stripe refund succeeded:", txErr.message);
    await logStripeReconciliation({
      stripeResourceId: stripeRefundId || undefined,
      action: "refund_db_write",
      dbState: JSON.stringify({ orderId: order.id, amountCents, stripeRefundId }),
      errorMessage: txErr.message,
      notes: "Stripe refund succeeded but DB write failed — refund exists on Stripe but not in DB",
    });
    // Return a partial success so the caller knows Stripe worked but DB didn't
    return {
      txn: null,
      stripeRefundId,
      amountCents,
      amount: amountDollars,
      remainingRefundable: remainingRefundableCents - amountCents,
      totalRefunded: newTotalRefundedCents,
      paymentStatus: newPaymentStatus,
      warning: "Refund issued on Stripe but database update failed — logged for reconciliation",
    };
  }

  return {
    txn,
    stripeRefundId,
    amountCents,
    amount: amountDollars,
    remainingRefundable: remainingRefundableCents - amountCents,
    totalRefunded: newTotalRefundedCents,
    paymentStatus: newPaymentStatus,
  };
}

// ── Route registration ─────────────────────────────────────────────────────────

export function registerOrdersCrudRoutes(app: Express) {

  // ─────────────────────────────────────────────────────────
  //  ORDERS — THE CORE ENGINE
  // ─────────────────────────────────────────────────────────

  app.get("/api/orders", requireAuth(), async (req, res) => {
    const user = (req as any).currentUser;
    const userRole = user?.role || "customer";
    const pg = getPagination(req);

    // Admin/manager can see all orders with optional filters
    if (["admin", "manager", "support"].includes(userRole)) {
      const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
      const vendorId = req.query.vendorId ? Number(req.query.vendorId) : undefined;
      const driverId = req.query.driverId ? Number(req.query.driverId) : undefined;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      if (customerId) return res.json(paginatedResponse(await Promise.all((await storage.getOrdersByCustomer(customerId)).map(enrichAdminOrder)), pg));
      if (vendorId) return res.json(paginatedResponse(await Promise.all((await storage.getOrdersByVendor(vendorId)).map(enrichAdminOrder)), pg));
      if (driverId) return res.json(paginatedResponse(await Promise.all((await storage.getOrdersByDriver(driverId)).map(enrichAdminOrder)), pg));
      if (status) return res.json(paginatedResponse(await Promise.all((await storage.getOrdersByStatus(status)).map(enrichAdminOrder)), pg));
      return res.json(paginatedResponse(await Promise.all((await storage.getOrders()).map(enrichAdminOrder)), pg));
    }

    // Vendor sees only their assigned orders
    if (["laundromat","vendor"].includes(userRole)) {
      const vendorProfile = await storage.getVendorByUserId(user.id);
      if (vendorProfile) return res.json(await storage.getOrdersByVendor(vendorProfile.id));
      return res.json([]);
    }

    // Driver sees only their assigned orders
    if (userRole === "driver") {
      const driverProfile = await storage.getDriverByUserId(user.id);
      if (driverProfile) return res.json(await storage.getOrdersByDriver(driverProfile.id));
      return res.json([]);
    }

    // Customer sees only their own orders
    res.json(await storage.getOrdersByCustomer(user.id));
  });

  app.get("/api/orders/active", requireAuth(["admin", "manager"]), async (_req, res) => {
    res.json(await storage.getActiveOrders());
  });

  app.get("/api/orders/:id", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA check: enforce ownership based on role
    const user = (req as any).currentUser;
    const userRole = user?.role || "customer";
    if (userRole === "customer" && order.customerId !== user.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (userRole === "driver" && order.driverId !== user.id) {
      const driverProfile = await storage.getDriverByUserId(user.id);
      if (!driverProfile || (order.driverId !== driverProfile.id && order.returnDriverId !== driverProfile.id)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    // Enrich with related data
    const events = await storage.getOrderEvents(order.id);
    const vendor = order.vendorId ? await storage.getVendor(order.vendorId) : null;
    const driver = order.driverId ? await storage.getDriver(order.driverId) : null;
    const customer = await storage.getUser(order.customerId);
    const consents = await storage.getConsentsByOrder(order.id);
    const review = await storage.getReviewByOrder(order.id);

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

    // ── Strip vendor-side financial / operational fields from customer-facing payload ──
    // Customers never need to see what we pay vendors / drivers, our cut, or AI scoring.
    const sanitizedOrder: any = { ...order };
    if (userRole === "customer") {
      delete sanitizedOrder.vendorPayout;
      delete sanitizedOrder.driverPayout;
      delete sanitizedOrder.platformFee;
      delete sanitizedOrder.aiMatchScore;
      delete sanitizedOrder.aiPricingTier;
      delete sanitizedOrder.surgeMultiplier;
      delete sanitizedOrder.surgeReason;
      delete sanitizedOrder.demandMultiplier;
      delete sanitizedOrder.actualWeight;     // operational — customer sees their tier weight only
      delete sanitizedOrder.weighedBy;
      delete sanitizedOrder.driverNotes;
      delete sanitizedOrder.vendorNotes;
      delete sanitizedOrder.internalNotes;
    }

    res.json({
      ...sanitizedOrder,
      ...(userRole === "admin" || userRole === "manager" ? enrichAdminOrder(order) : {}),
      events,
      statusHistory: await storage.getOrderStatusHistory(order.id),
      // Customers see vendor name + address (so they know where their laundry is) but not rating-internals or vendor IDs they can't act on.
      vendor: vendor ? { id: vendor.id, name: vendor.name, rating: vendor.rating, address: vendor.address } : null,
      driver: driverInfo,
      customer: customerInfo,
      consents,
      review,
      slaStatus: order.slaDeadline ? checkSLAStatus(order) : "on_track",
    });
  });

  // ── CREATE ORDER (the main flow) ──
  app.post("/api/orders", requireAuth(), async (req, res) => {
    try {
      const currentUser = (req as any).currentUser;
      const customerId = currentUser.id;
      const OrderBody = z.object({
        pickupAddressId: z.number(),
        pickupAddress: z.string().min(1),
        deliveryType: z.string().optional(),
        deliverySpeed: z.string().optional(),
        scheduledPickup: z.string().optional(),
        pickupTimeWindow: z.string().optional().nullable(),
        bags: z.union([z.string(), z.array(z.any())]).optional(),
        preferences: z.any().optional(),
        certifiedOnly: z.number().optional(),
        customerNotes: z.string().optional().nullable(),
        addressNotes: z.string().optional().nullable(),
        paymentMethodId: z.number().optional().nullable(),
        serviceType: z.string().optional(),
        promoCode: z.string().optional().nullable(),
        loyaltyPointsToRedeem: z.number().optional(),
        pricingTierId: z.number().optional().nullable(),
        tierName: z.string().optional().nullable(),
        selectedAddOns: z.array(z.any()).optional(),
      }).strip();
      const parsed = OrderBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const {
        pickupAddressId, pickupAddress, deliveryType, deliverySpeed,
        scheduledPickup, pickupTimeWindow, bags, preferences, certifiedOnly,
        customerNotes, addressNotes, paymentMethodId, serviceType, promoCode,
        loyaltyPointsToRedeem, pricingTierId, tierName, selectedAddOns,
      } = parsed.data;

      // D4: NJ checkout-gating — block order placement for NJ addresses
      if (pickupAddressId) {
        const addrForNJCheck = await storage.getAddress(pickupAddressId);
        if (addrForNJCheck) {
          const addrState = (addrForNJCheck.state || "").trim().toUpperCase();
          const addrZip = (addrForNJCheck.zip || "").trim();
          const isNJAddr = addrState === "NJ" || addrZip.startsWith("07") || addrZip.startsWith("08");
          if (isNJAddr) {
            return res.status(400).json({
              error: "NJ checkout not yet available",
              code: "NJ_CHECKOUT_GATED",
              message: "NJ checkout not yet available",
            });
          }
        }
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
        const tierKey = tierName as keyof typeof PRICING_TIERS;
        if (tierKey && PRICING_TIERS[tierKey]) {
          const t = await pricingConfig.getBagPrice(tierKey);
          tierInfo = { name: tierKey, flatPrice: t.flatPrice, maxWeight: t.maxWeight, overageRate: t.overageRate };
        }
      }

      // Calculate add-ons total
      // SERVER-AUTHORITATIVE PRICING — do not trust client total
      // D10: enforce priceMode — per_order add-ons always get qty=1
      let addOnsTotal = 0;
      let parsedAddOns: { addOnId: number; quantity: number; unitPrice: number }[] = [];
      if (selectedAddOns && Array.isArray(selectedAddOns)) {
        for (const sa of selectedAddOns) {
          const addon = await storage.getAddOn(sa.addOnId);
          if (addon) {
            // D10: enforce priceMode — per_order forces qty=1, per_item uses client qty
            const addonPriceMode = (addon as any).priceMode || "per_order";
            const qty = addonPriceMode === "per_item" ? (sa.quantity || 1) : 1;
            parsedAddOns.push({ addOnId: addon.id, quantity: qty, unitPrice: addon.price });
            addOnsTotal += addon.price * qty;
          }
        }
      }

      // SERVER-AUTHORITATIVE PRICING — do not trust client total
      // All pricing is recomputed server-side from inputs; client-supplied totals are ignored.
      // Dynamic pricing with surge (DB-driven holiday list)
      const basePickupTime = scheduledPickup;
      const surge = await getSurgePricingTierAsync(basePickupTime);
      const demandMultiplier = await getDemandMultiplier(serviceType || "wash_fold");

      let surgeSubtotal: number;
      let surgeTax: number;
      let surgeTotal: number;
      let deliveryFee: number;

      if (tierInfo) {
        // Tier-based flat rate pricing — the base price IS the flat rate
        const bagPriceInfo = await pricingConfig.getBagPrice(tierInfo.name || "small_bag");
        surgeSubtotal = bagPriceInfo.flatPrice + addOnsTotal;
        surgeTax = Math.round(surgeSubtotal * (await pricingConfig.getTaxRate()) * 100) / 100;
        deliveryFee = await pricingConfig.getDeliveryFee((speed as "48h" | "24h" | "same_day") || "48h");
        surgeTotal = Math.round((surgeSubtotal + surgeTax + deliveryFee) * 100) / 100;
      } else {
        // Legacy bag-count-based pricing
        const pricing = await calculatePricing(parsedBags, speed);
        surgeSubtotal = Math.round(pricing.subtotal * surge.multiplier * demandMultiplier * 100) / 100;
        surgeTax = Math.round(surgeSubtotal * (await pricingConfig.getTaxRate()) * 100) / 100;
        deliveryFee = pricing.deliveryFee;
        surgeTotal = Math.round((surgeSubtotal + surgeTax + deliveryFee) * 100) / 100;
      }

      let discount = 0;
      let loyaltyPointsRedeemed = 0;

      // Validate promo code (reads only — writes deferred to txn)
      let appliedPromoId: number | null = null;
      let promoUsedCountBefore: number | null = null;
      if (promoCode) {
        const promo = await storage.getPromoCode(promoCode);
        if (promo && promo.isActive && (!promo.expiresAt || new Date(promo.expiresAt) > new Date())) {
          const userUsageCount = await storage.getPromoUsageByUser(promo.id, customerId);
          if (userUsageCount > 0) {
            return res.status(400).json({ error: "You've already used this promo code" });
          }
          if (!promo.minOrderAmount || surgeTotal >= promo.minOrderAmount) {
            if (!promo.maxUses || promo.usedCount! < promo.maxUses) {
              if (promo.type === "percentage") {
                discount = Math.round(surgeTotal * (promo.value / 100) * 100) / 100;
              } else if (promo.type === "fixed") {
                discount = Math.min(promo.value, surgeTotal);
              } else if (promo.type === "free_delivery") {
                discount = deliveryFee;
              }
              appliedPromoId = promo.id;
              promoUsedCountBefore = promo.usedCount || 0;
            }
          }
        }
      }

      // Validate loyalty points (reads only — deduction deferred to txn)
      let loyaltyPointsBefore: number | null = null;
      if (loyaltyPointsToRedeem && loyaltyPointsToRedeem > 0) {
        const user = await storage.getUser(customerId);
        if (user && user.loyaltyPoints && user.loyaltyPoints >= loyaltyPointsToRedeem) {
          const maxRedeemable = Math.floor(user.loyaltyPoints / 100) * 100;
          const toRedeem = Math.min(loyaltyPointsToRedeem, maxRedeemable);
          const dollarValue = toRedeem / 100;
          discount += dollarValue;
          loyaltyPointsRedeemed = toRedeem;
          loyaltyPointsBefore = user.loyaltyPoints;
        }
      }

      const finalTotal = Math.max(0, Math.round((surgeTotal - discount) * 100) / 100);

      const ts_ = now();
      const slaDeadline = calculateSLADeadline(speed, ts_);
      const generatedOrderNumber = generateOrderNumber();

      // ── Atomic txn: order create + promo increment + loyalty deduction + add-ons + event ──
      const order = await db.transaction(async (tx) => {
        // Create order
        const orderData = addOrderCents({
          orderNumber: generatedOrderNumber,
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
          pricingTierId: pricingTierId || null,
          tierName: tierInfo?.name || null,
          tierFlatPrice: tierInfo?.flatPrice || null,
          tierMaxWeight: tierInfo?.maxWeight || null,
          finalPrice: tierInfo ? finalTotal : null,
          certifiedOnly: certifiedOnly ?? true,
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
        const [ord] = await tx.insert(schema.orders).values(orderData as any).returning();

        // Increment promo usage count (was outside txn before)
        if (appliedPromoId && promoUsedCountBefore != null) {
          await tx.update(schema.promoCodes).set({
            usedCount: promoUsedCountBefore + 1,
          } as any).where(eq(schema.promoCodes.id, appliedPromoId));
        }

        // Deduct loyalty points (was outside txn before)
        if (loyaltyPointsRedeemed > 0 && loyaltyPointsBefore != null) {
          await tx.update(schema.users).set({
            loyaltyPoints: loyaltyPointsBefore - loyaltyPointsRedeemed,
          } as any).where(eq(schema.users.id, customerId));
        }

        // Create order add-on records
        for (const addon of parsedAddOns) {
          await tx.insert(schema.orderAddOns).values({
            orderId: ord.id,
            addOnId: addon.addOnId,
            quantity: addon.quantity,
            unitPrice: addon.unitPrice,
            total: Math.round(addon.unitPrice * addon.quantity * 100) / 100,
          } as any);
        }

        // Record loyalty redemption transaction
        if (loyaltyPointsRedeemed > 0) {
          await tx.insert(schema.loyaltyTransactions).values({
            userId: customerId,
            orderId: ord.id,
            type: "redeemed",
            points: -loyaltyPointsRedeemed,
            description: `Redeemed ${loyaltyPointsRedeemed} points for $${(loyaltyPointsRedeemed / 100).toFixed(2)} off order ${ord.orderNumber}`,
            createdAt: ts_,
          } as any);
        }

        // Record per-user promo usage
        if (appliedPromoId) {
          await tx.insert(schema.promoUsage).values({
            promoId: appliedPromoId,
            userId: customerId,
            orderId: ord.id,
            usedAt: ts_,
          } as any);
        }

        // Event: order placed
        await tx.insert(schema.orderEvents).values({
          orderId: ord.id,
          eventType: "order_placed",
          description: "Your pickup has been scheduled",
          details: JSON.stringify({ address: pickupAddress, bags: parsedBags, total: finalTotal, pricingTier: surge.tier, surgeReason: surge.reason }),
          actorId: customerId,
          actorRole: "customer",
          timestamp: ts_,
        } as any);

        return ord;
      });

      // ── STEP 1: Payment status ──
      // Wave 2 (S4 follow-up): Only genuine zero-dollar orders auto-authorize.
      // Any positive amount stays "pending" until the customer completes payment
      // via /api/payments/create-intent + client confirmPayment + webhook.
      // We no longer treat "Stripe missing" as a license to fake authorization —
      // if Stripe isn't configured, the order stays pending and admin sees the
      // gap on the operations dashboard.
      if (finalTotal <= 0) {
        await storage.updateOrder(order.id, { paymentStatus: "authorized" });
        await storage.createOrderEvent({
          orderId: order.id,
          eventType: "payment_authorized",
          description: "Zero-dollar order \u2014 no payment required",
          actorRole: "system",
          timestamp: now(),
        });
      } else {
        // Keep paymentStatus = "pending" until webhook confirms the charge.
        await storage.createOrderEvent({
          orderId: order.id,
          eventType: "payment_pending",
          description: `Payment of $${finalTotal.toFixed(2)} pending \u2014 awaiting customer payment confirmation`,
          actorRole: "system",
          timestamp: now(),
        });
      }

      // ── STEP 2: Auto-confirm ──
      await storage.transitionOrderStatus(order.id, order.status, "scheduled", {
        eventType: "order_scheduled",
        description: "Order scheduled — finding best match",
        actorRole: "system",
        timestamp: now(),
        orderUpdate: { confirmedAt: now() },
      } as any);

      // ── STEP 3: Auto-dispatch vendor ──
      const addr = await storage.getAddress(pickupAddressId);
      const pickupLat = addr?.lat || 25.78;
      const pickupLng = addr?.lng || -80.19;

      const scheduledPickupAt2 = order.scheduledPickup ? (() => { try { return new Date(order.scheduledPickup!); } catch { return new Date(); } })() : new Date();
      const bestVendor = await findBestVendor(order, pickupLat, pickupLng, scheduledPickupAt2);
      if (bestVendor) {
        await storage.updateOrder(order.id, { vendorId: bestVendor.id, aiMatchScore: scoreVendor(bestVendor, order, pickupLat, pickupLng) });
        await storage.updateVendor(bestVendor.id, { currentLoad: (bestVendor.currentLoad || 0) + 1 });
        await storage.createOrderEvent({
          orderId: order.id,
          eventType: "vendor_assigned",
          description: `Assigned to ${bestVendor.name} (score-based match)`,
          details: JSON.stringify({ vendorId: bestVendor.id, vendorName: bestVendor.name }),
          actorRole: "system",
          timestamp: now(),
        });
      } else {
        // No eligible vendor — check whether hours gating is the cause
        const allActive2 = await storage.getActiveVendors();
        const closedCount2 = allActive2.filter(v => !isVendorOpenNow(v, scheduledPickupAt2)).length;
        const eventType2 = closedCount2 > 0 && closedCount2 === allActive2.length ? "no_vendor_open" : "no_vendor_found";
        await storage.createOrderEvent({
          orderId: order.id,
          eventType: eventType2,
          description: eventType2 === "no_vendor_open"
            ? "All vendors are closed at the scheduled pickup time — admin manual assignment required"
            : "No eligible vendor available for this order — admin manual assignment required",
          details: JSON.stringify({ pickupLat, pickupLng, serviceType: (order as any).serviceType, scheduledAt: scheduledPickupAt2.toISOString() }),
          actorRole: "system",
          timestamp: now(),
        });
      }

      // ── STEP 4: Auto-assign driver (prefer vendor-owned drivers) ──
      const bestDriver = await findBestDriver(pickupLat, pickupLng, bestVendor?.id ?? null);
      if (bestDriver) {
        await storage.transitionOrderStatus(order.id, "scheduled", "driver_assigned", {
          eventType: "driver_assigned",
          description: `${bestDriver.name} assigned (proximity + rating match)`,
          details: JSON.stringify({ driverId: bestDriver.id, driverName: bestDriver.name }),
          actorRole: "system",
          timestamp: now(),
          orderUpdate: { driverId: bestDriver.id },
          driverUpdate: { id: bestDriver.id, data: { status: "busy", todayTrips: (bestDriver.todayTrips || 0) + 1 } },
        } as any);

        // Notify driver
        await notifyUser(bestDriver.userId, order.id, "order_update",
          "New Pickup Assigned",
          `Pickup at ${pickupAddress}. ${pickupTimeWindow || "ASAP"}`,
          `/driver/order/${order.id}`
        );
      }

      // Notify customer
      await notifyUser(customerId, order.id, "order_update",
        "Order Confirmed",
        `Your order ${order.orderNumber} is confirmed. ${bestDriver ? `${bestDriver.name} will pick up your laundry.` : "Finding a driver..."}${surge.tier !== "normal" ? ` (${surge.reason})` : ""}`,
        `/orders/${order.id}`
      );

      // Run fraud check for high-value orders
      await storage.getOrder(order.id);
      const fraud = await calculateFraudRisk(order.id);
      if (fraud.autoFlagged) {
        await storage.createOrderEvent({
          orderId: order.id,
          eventType: "fraud_flagged",
          description: `Auto-fraud flag: risk score ${fraud.riskScore}/100. Flags: ${fraud.flags.join("; ")}`,
          actorRole: "system",
          timestamp: now(),
        });
        const admins = await storage.getUsersByRole("admin");
        admins.forEach(async admin => {
          await notifyUser(admin.id, order.id, "fraud_alert",
            "Fraud Alert",
            `Order ${order.orderNumber} flagged with risk score ${fraud.riskScore}/100`,
            "/admin/orders"
          );
        });
      }

      res.status(201).json(await storage.getOrder(order.id));
    } catch (err: any) {
      console.error("[/api/orders] error:", err);
      res.status(400).json({ error: "Failed to create order", code: "ORDER_ERROR" });
    }
  });
}
