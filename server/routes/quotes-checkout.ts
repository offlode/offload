import type { Express } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage, db, addOrderCents } from "../storage";
import {
  PRICING_TIERS, DELIVERY_FEES, TAX_RATE as SCHEMA_TAX_RATE,
} from "@shared/schema";
import { pricingConfig } from "../pricing-config-service";
import { checkCoverage } from "../service-area";
import { isNJZip } from "../lib/nj-zip";
import { hashPassword } from "../lib/auth";
import {
  hasStripe as hasStripeKey,
} from "../lib/stripe";
import { requireAuth } from "../session";
import {
  generateOrderNumber, now, isVendorOpenNow, scoreVendor,
  findBestVendor, findBestDriver, calculateSLADeadline,
  notifyUser, sendClaimAccountEmail,
} from "../engines";

const makeRouteLimiter = (max: number) => rateLimit({
  windowMs: 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});

export function registerQuotesCheckoutRoutes(app: Express) {
  const publicCheckoutLimiter = makeRouteLimiter(10);
  const hasStripe = hasStripeKey();

  // ── PUBLIC: Checkout (no auth needed) ──
  // Website visitors: quote → checkout → Stripe PaymentIntent → order
  app.post("/api/public/checkout", publicCheckoutLimiter, async (req, res) => {
    try {
      const CheckoutBody = z.object({
        quoteId: z.union([z.number(), z.string()]),
        email: z.string().email(),
        phone: z.string().min(10),
        notes: z.string().optional().nullable(),
        pickupDate: z.string().optional().nullable(),
        pickupTime: z.string().optional().nullable(),
      }).strip();
      const parsed = CheckoutBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const { quoteId, email, phone, notes, pickupDate, pickupTime } = parsed.data;

      const digits = phone.replace(/\D/g, "");
      if (digits.length < 10) return res.status(400).json({ error: "Invalid phone number" });

      // Fetch the quote
      const quote = await storage.getQuote(Number(quoteId));
      if (!quote) return res.status(404).json({ error: "Quote not found" });

      // Check quote not expired
      if (["draft", "quoted"].includes(quote.status) && new Date(quote.expiresAt!) < new Date()) {
        await storage.updateQuote(quote.id, { status: "expired", updatedAt: now() });
        return res.status(410).json({ error: "Quote has expired. Please get a new price." });
      }
      if (quote.status === "converted") {
        return res.status(409).json({ error: "This quote has already been used for an order" });
      }

      // SERVER-AUTHORITATIVE PRICING — do not trust client totals.
      const rawTotal = Number(quote.total || 0);
      if (!Number.isFinite(rawTotal)) {
        throw new Error("pricing_invalid");
      }
      const amountCents = Math.round(rawTotal * 100);
      if (!Number.isFinite(amountCents)) {
        throw new Error("pricing_invalid");
      }

      // Pre-checkout serviceability gate: do not create an order or PaymentIntent
      // unless at least one eligible laundromat can serve the quote.
      let quoteAddOns: string[] | undefined;
      try {
        const parsedAddOns = quote.addOnsJson ? JSON.parse(quote.addOnsJson) : [];
        quoteAddOns = Array.isArray(parsedAddOns) ? parsedAddOns.map((a: any) => String(a?.type || a?.name || a)).filter(Boolean) : undefined;
      } catch { quoteAddOns = undefined; }
      const coverage = await checkCoverage({
        zip: quote.pickupZip || undefined,
        lat: quote.pickupLat == null ? undefined : Number(quote.pickupLat),
        lng: quote.pickupLng == null ? undefined : Number(quote.pickupLng),
        service: quote.serviceType || undefined,
        addOns: quoteAddOns,
      });
      const scheduledForService = pickupDate ? new Date(`${pickupDate}T${pickupTime || "09:00"}:00.000Z`) : new Date();
      const matchedVendorIds = new Set(coverage.matchedVendors || []);
      const vendorsForService = (await storage.getVendors())
        .filter(v => matchedVendorIds.has(v.id))
        .filter(v => isVendorOpenNow(v, scheduledForService));
      const serviceabilityOrder = { serviceType: quote.serviceType, certifiedOnly: true, deliverySpeed: quote.deliverySpeed } as any;
      const eligibleVendor = quote.vendorId
        ? vendorsForService.find(v => v.id === quote.vendorId) || null
        : vendorsForService
            .map(v => ({ vendor: v, score: scoreVendor(v, serviceabilityOrder, quote.pickupLat || 40.7128, quote.pickupLng || -74.0060) }))
            .sort((a, b) => b.score - a.score)[0]?.vendor || null;
      if (!coverage.eligible || coverage.checkoutGated || !eligibleVendor) {
        await storage.createServiceAreaRequest({
          email,
          phone: digits,
          address: quote.pickupAddress,
          city: quote.pickupCity || "",
          state: quote.pickupState || "NY",
          zip: quote.pickupZip || "",
          lat: quote.pickupLat,
          lng: quote.pickupLng,
          requestedService: quote.serviceType,
          requestedSpeed: quote.deliverySpeed,
          source: "public_checkout",
          notes: `No eligible vendor during checkout for quote ${quote.id}: ${coverage.reason || coverage.checkoutGateReason || "closed_or_unavailable"}`,
        } as any);
        return res.status(503).json({
          error: "no_vendor_available",
          message: "We do not have laundromats available in your area yet.",
        });
      }

      const stripeKey = process.env.STRIPE_SECRET_KEY || "";
      if (amountCents > 0 && (!stripeKey || stripeKey.startsWith("sk_test_DISABLED"))) {
        return res.status(503).json({ error: "payments_unavailable" });
      }

      const ts = now();
      const orderNumber = generateOrderNumber();
      const scheduledPickup = pickupDate ? `${pickupDate}T${pickupTime || '09:00'}:00.000Z` : null;
      let clientSecret = "";
      let paymentIntentId = "";
      let createdNewUser = false;

      // P2-026: Create order in DB transaction first, then create Stripe
      // PaymentIntent outside the transaction. Idempotency key prevents
      // duplicate intents on retry.
      const checkoutFeeRate = await pricingConfig.getPlatformFeeRate();
      const { customer, order } = await db.transaction(async (tx) => {
        let cust: typeof schema.users.$inferSelect;
        const [existing] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
        if (!existing) {
          const username = email.split("@")[0] + "_" + randomBytes(3).toString("hex");
          const randomPw = randomBytes(16).toString("hex");
          const [created] = await tx.insert(schema.users).values({
            username,
            password: hashPassword(randomPw),
            name: email.split("@")[0],
            email,
            phone: digits,
            role: "customer",
            memberSince: ts,
          }).returning();
          cust = created;
          createdNewUser = true;
        } else {
          cust = existing;
        }

        const [addr] = await tx.insert(schema.addresses).values({
          userId: cust.id,
          label: "Pickup",
          street: quote.pickupAddress,
          city: quote.pickupCity || "",
          state: quote.pickupState || "NY",
          zip: quote.pickupZip || "",
          lat: quote.pickupLat,
          lng: quote.pickupLng,
          isDefault: true,
        } as any).returning();

        const [ord] = await tx.insert(schema.orders).values(addOrderCents({
          orderNumber,
          customerId: cust.id,
          status: "pending",
          pickupAddressId: addr.id,
          pickupAddress: quote.pickupAddress,
          deliveryAddress: quote.pickupAddress,
          deliveryType: "contactless",
          deliverySpeed: quote.deliverySpeed,
          scheduledPickup,
          pickupTimeWindow: pickupTime || null,
          bags: JSON.stringify([{ tierName: quote.tierName, quantity: 1 }]),
          serviceType: quote.serviceType,
          subtotal: quote.subtotal,
          tax: quote.taxAmount,
          deliveryFee: quote.deliveryFee,
          discount: quote.discount,
          total: quote.total,
          tierName: quote.tierName,
          tierFlatPrice: quote.tierFlatPrice,
          tierMaxWeight: quote.tierMaxWeight,
          customerNotes: notes || null,
          paymentStatus: amountCents === 0 ? "authorized" : "pending",
          certifiedOnly: true,
          vendorId: eligibleVendor.id,
          aiMatchScore: scoreVendor(eligibleVendor, serviceabilityOrder, quote.pickupLat || 40.7128, quote.pickupLng || -74.0060),
          createdAt: ts,
          updatedAt: ts,
        }) as any).returning();

        await tx.update(schema.quotes).set({ status: "converted", customerId: cust.id, updatedAt: ts } as any).where(eq(schema.quotes.id, quote.id));
        await tx.insert(schema.orderEvents).values({ orderId: ord.id, eventType: "order_created", description: `Order placed via website checkout. Email: ${email}`, timestamp: ts } as any);
        await tx.insert(schema.orderEvents).values({ orderId: ord.id, eventType: "vendor_assigned", description: `Assigned to ${eligibleVendor.name} (pre-checkout serviceability match)`, details: JSON.stringify({ vendorId: eligibleVendor.id, vendorName: eligibleVendor.name }), actorRole: "system", timestamp: ts } as any);
        // P2-023: atomic vendor capacity increment
        await tx.update(schema.vendors).set({ currentLoad: sql`COALESCE(${schema.vendors.currentLoad}, 0) + 1` } as any).where(eq(schema.vendors.id, eligibleVendor.id));
        await tx.insert(schema.pricingAuditLog).values({ action: "public_checkout", details: JSON.stringify({ orderId: ord.id, orderNumber, quoteId: quote.id, total: quote.total, email }), actorId: cust.id, actorRole: "customer", timestamp: ts } as any);
        return { customer: cust, order: ord };
      });

      // P2-026: Create Stripe PaymentIntent OUTSIDE the DB transaction.
      // Idempotency key (order-{id}-intent) prevents duplicates on retry.
      if (amountCents > 0) {
        const stripeClient = new Stripe(stripeKey, { apiVersion: "2024-12-18.acacia" as any });
        const intent = await stripeClient.paymentIntents.create({
          amount: amountCents,
          currency: "usd",
          metadata: { orderId: String(order.id), orderNumber, quoteId: String(quote.id), customerEmail: email },
          receipt_email: email,
        }, { idempotencyKey: `order-${order.id}-intent` });
        paymentIntentId = intent.id;
        clientSecret = intent.client_secret!;
      } else {
        paymentIntentId = `pi_zero_${Date.now()}_${randomBytes(4).toString("hex")}`;
        clientSecret = "";
      }

      // Update order + create payment txn with the PaymentIntent ID
      await db.transaction(async (tx) => {
        await tx.update(schema.orders).set({ stripePaymentIntentId: paymentIntentId, updatedAt: now() } as any).where(eq(schema.orders.id, order.id));
        await tx.insert(schema.paymentTransactions).values({
          orderId: order.id,
          type: "charge",
          amount: quote.total || 0,
          amountCents,
          currency: "usd",
          status: amountCents === 0 ? "completed" : "pending",
          stripePaymentIntentId: paymentIntentId,
          recipientType: "platform",
          platformFee: Math.round((quote.total || 0) * checkoutFeeRate * 100) / 100,
          metadata: JSON.stringify({ quoteId: quote.id, email, phone: digits }),
          createdAt: ts,
        } as any);
      });

      if (createdNewUser) {
        await sendClaimAccountEmail(customer as any);
      }

      res.status(201).json({
        clientSecret,
        orderId: order.id,
        orderNumber,
        total: quote.total,
        demoMode: !hasStripe,
      });

    } catch (err: any) {
      console.error("[Checkout] Error:", err);
      res.status(500).json({ error: "Checkout failed", code: "CHECKOUT_ERROR" });
    }
  });

  // ── Auth required: Accept (lock) a quote ──
  app.post("/api/quotes/:id/accept", requireAuth(), async (req, res) => {
    try {
      const quote = await storage.getQuote(Number(String(req.params.id)));
      if (!quote) return res.status(404).json({ error: "Quote not found" });

      const currentUser = (req as any).currentUser;
      if (quote.customerId !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Validate state
      if (quote.status === "expired" || new Date(quote.expiresAt) < new Date()) {
        await storage.updateQuote(quote.id, { status: "expired", updatedAt: now() });
        return res.status(410).json({ error: "Quote has expired. Please request a new quote." });
      }
      if (quote.status === "converted") return res.status(409).json({ error: "Quote already converted to order." });
      if (quote.status === "accepted") return res.json(quote); // Idempotent
      if (quote.status !== "quoted") return res.status(400).json({ error: `Cannot accept quote in '${quote.status}' status` });

      const ts = now();
      const updated = await storage.updateQuote(quote.id, {
        status: "accepted",
        lockedAt: ts,
        customerId: (req as any).currentUser?.id || quote.customerId,
        updatedAt: ts,
      });

      await storage.createPricingAuditEntry({
        action: "quote_locked",
        details: JSON.stringify({ quoteId: quote.id, total: quote.total }),
        actorId: (req as any).currentUser?.id,
        actorRole: "customer",
        timestamp: ts,
      });

      res.json(updated);
    } catch (err: any) {
      console.error("[/api/quotes/:id/accept] error:", err);
      res.status(400).json({ error: "Failed to accept quote", code: "QUOTE_ERROR" });
    }
  });

  // ── Auth required: Convert accepted quote to real order ──
  app.post("/api/quotes/:id/convert", requireAuth(), async (req, res) => {
    try {
      const quote = await storage.getQuote(Number(String(req.params.id)));
      if (!quote) return res.status(404).json({ error: "Quote not found" });

      const currentUser = (req as any).currentUser;
      if (quote.customerId !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Validate state
      if (quote.status === "converted" && quote.orderId) {
        // Idempotent: return the existing order
        const existingOrder = await storage.getOrder(quote.orderId);
        if (existingOrder) return res.json(existingOrder);
      }
      if (quote.status !== "accepted") {
        return res.status(400).json({ error: `Cannot convert quote in '${quote.status}' status. Must be accepted first.` });
      }
      if (new Date(quote.expiresAt) < new Date() && !quote.lockedAt) {
        await storage.updateQuote(quote.id, { status: "expired", updatedAt: now() });
        return res.status(410).json({ error: "Quote has expired." });
      }

      // D4: NJ checkout-gating — block order placement for NJ addresses
      // P2-061: use shared NJ ZIP utility (USPS range 7000-8999)
      const quoteZip = quote.pickupZip || "";
      const quoteState = quote.pickupState || "";
      const isNJAddress = quoteState.trim().toUpperCase() === "NJ" || isNJZip(quoteZip);
      if (isNJAddress) {
        return res.status(400).json({
          error: "NJ checkout not yet available",
          code: "NJ_CHECKOUT_GATED",
          message: "NJ checkout not yet available",
        });
      }

      const userId = (req as any).currentUser?.id;
      const { pickupAddressId, pickupTimeWindow, scheduledPickup, deliveryType, customerNotes, addressNotes, paymentMethodId } = req.body || {};

      const ts = now();
      const slaDeadline = calculateSLADeadline(quote.deliverySpeed, ts);

      // Create the real order from the locked quote
      const order = await storage.createOrder({
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
        certifiedOnly: true,
        customerNotes: customerNotes || null,
        // Wave 2: quote conversion no longer auto-authorizes. The order stays
        // "pending" until the customer completes payment via
        // POST /api/quotes/:id/create-payment + client confirmPayment() and
        // the Stripe webhook fires payment_intent.succeeded.
        paymentStatus: "pending",
        paymentMethodId: paymentMethodId || null,
        slaDeadline,
        slaStatus: "on_track",
        promoCode: quote.promoCode || null,
        createdAt: ts,
        updatedAt: ts,
      });

      // Mark quote as converted
      await storage.updateQuote(quote.id, {
        status: "converted",
        orderId: order.id,
        customerId: userId,
        updatedAt: ts,
      });

      // Order event: created from quote
      await storage.createOrderEvent({
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
      await storage.transitionOrderStatus(order.id, order.status, "scheduled", {
        eventType: "order_scheduled",
        description: "Order scheduled — finding best match",
        actorRole: "system",
        timestamp: now(),
        orderUpdate: { confirmedAt: now() },
      } as any);

      // Auto-dispatch vendor
      const pickupLat = quote.pickupLat || 40.7128;
      const pickupLng = quote.pickupLng || -74.0060;

      let assignedVendorId: number | null = null;
      if (quote.vendorId) {
        // Customer selected a preferred vendor
        const selectedVendor = await storage.getVendor(quote.vendorId);
        if (selectedVendor) {
          assignedVendorId = selectedVendor.id;
          await storage.updateOrder(order.id, { vendorId: selectedVendor.id });
          await db.update(schema.vendors).set({ currentLoad: sql`COALESCE(${schema.vendors.currentLoad}, 0) + 1` } as any).where(eq(schema.vendors.id, selectedVendor.id));
          await storage.createOrderEvent({
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
        const scheduledPickupAt = order.scheduledPickup ? (() => { try { return new Date(order.scheduledPickup!); } catch { return new Date(); } })() : new Date();
        const bestVendor = await findBestVendor(order, pickupLat, pickupLng, scheduledPickupAt);
        if (bestVendor) {
          assignedVendorId = bestVendor.id;
          await storage.updateOrder(order.id, { vendorId: bestVendor.id, aiMatchScore: scoreVendor(bestVendor, order, pickupLat, pickupLng) });
          await db.update(schema.vendors).set({ currentLoad: sql`COALESCE(${schema.vendors.currentLoad}, 0) + 1` } as any).where(eq(schema.vendors.id, bestVendor.id));
          await storage.createOrderEvent({
            orderId: order.id,
            eventType: "vendor_assigned",
            description: `Auto-assigned to ${bestVendor.name} (score-based match)`,
            details: JSON.stringify({ vendorId: bestVendor.id, vendorName: bestVendor.name }),
            actorRole: "system",
            timestamp: now(),
          });
        } else {
          // No eligible vendor — check whether hours gating is the cause
          const allActive = await storage.getActiveVendors();
          const closedCount = allActive.filter(v => !isVendorOpenNow(v, scheduledPickupAt)).length;
          const eventType = closedCount > 0 && closedCount === allActive.length ? "no_vendor_open" : "no_vendor_found";
          await storage.createOrderEvent({
            orderId: order.id,
            eventType,
            description: eventType === "no_vendor_open"
              ? "All vendors are closed at the scheduled pickup time — admin manual assignment required"
              : "No eligible vendor available for this order — admin manual assignment required",
            details: JSON.stringify({ pickupLat, pickupLng, serviceType: (order as any).serviceType, scheduledAt: scheduledPickupAt.toISOString() }),
            actorRole: "system",
            timestamp: now(),
          });
        }
      }

      // Auto-assign driver (prefer vendor-owned drivers when present)
      const bestDriver = await findBestDriver(pickupLat, pickupLng, assignedVendorId);
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
        await notifyUser(bestDriver.userId, order.id, "order_update",
          "New Pickup Assigned",
          `Pickup at ${quote.pickupAddress}. ${pickupTimeWindow || "ASAP"}`,
          `/driver/order/${order.id}`
        );
      }

      // Notify customer
      await notifyUser(userId, order.id, "order_update",
        "Order Confirmed",
        `Your order ${order.orderNumber} is confirmed. Total: $${quote.total.toFixed(2)}`,
        `/orders/${order.id}`
      );

      await storage.createPricingAuditEntry({
        action: "quote_converted",
        details: JSON.stringify({ quoteId: quote.id, orderId: order.id, orderNumber: order.orderNumber }),
        actorId: userId,
        actorRole: "customer",
        timestamp: ts,
      });

      res.status(201).json(await storage.getOrder(order.id));
    } catch (err: any) {
      console.error("[/api/quotes/:id/convert] error:", err);
      res.status(400).json({ error: "Failed to convert quote to order", code: "ORDER_ERROR" });
    }
  });

  // ── Admin: Pricing config ──
  app.get("/api/pricing/config", requireAuth(["admin"]), async (_req, res) => {
    res.json(await storage.getAllPricingConfig());
  });

  // OD-P2: single-key GET so admin UI and owner review can read current values cleanly.
  // If the key is not yet in the DB, return the canonical fallback so the UI never sees a 404.
  app.get("/api/pricing/config/:key", requireAuth(["admin"]), async (req, res) => {
    const key = String(req.params.key);
    const row = await storage.getPricingConfig(key);
    if (row) return res.json(row);
    // Compute a fallback value from the same source the pricing engine falls back to.
    // PRICING_TIERS / DELIVERY_FEES / SCHEMA_TAX_RATE are imported at top of file.
    let fallbackValue: string | null = null;
    let category = "general";
    try {
      if (key === "tax_rate_default") { fallbackValue = String(SCHEMA_TAX_RATE); category = "tax"; }
      else if (key === "delivery_fee_48h") { fallbackValue = String(DELIVERY_FEES["48h"]?.fee ?? 0); category = "delivery"; }
      else if (key === "delivery_fee_24h") { fallbackValue = String(DELIVERY_FEES["24h"]?.fee ?? 0); category = "delivery"; }
      else if (key === "delivery_fee_same_day") { fallbackValue = String(DELIVERY_FEES["same_day"]?.fee ?? 0); category = "delivery"; }
      else if (key === "wait_fee_free_minutes") { fallbackValue = "5"; category = "wait_fee"; }
      else if (key === "wait_fee_per_minute") { fallbackValue = "1"; category = "wait_fee"; }
      else if (key === "wait_fee_cap") { fallbackValue = "15"; category = "wait_fee"; }
      else if (key.startsWith("bag_price_") || key.startsWith("bag_")) {
        const tier = key.replace(/^bag_(price_)?/, "");
        const t = PRICING_TIERS[tier as keyof typeof PRICING_TIERS];
        if (t) { fallbackValue = JSON.stringify({ flatPrice: t.flatPrice, overageRate: t.overageRate, maxWeight: t.maxWeight }); category = "bag"; }
      }
    } catch (_e) {
      // fall through to 404
    }
    if (fallbackValue === null) {
      return res.status(404).json({ error: "Pricing config key not found", code: "CONFIG_NOT_FOUND", key });
    }
    return res.json({
      key,
      value: fallbackValue,
      category,
      description: `Fallback value (not yet stored in DB)`,
      source: "fallback",
    });
  });

  app.put("/api/pricing/config/:key", requireAuth(["admin"]), async (req, res) => {
    const PricingBody = z.object({ value: z.string().min(1), category: z.string().min(1), description: z.string().optional() }).strip();
    const parsedPricing = PricingBody.safeParse(req.body);
    if (!parsedPricing.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPricing.error.issues });
    }
    const { value, category, description } = parsedPricing.data;
    const userId = (req as any).currentUser?.id;
    const config = await storage.upsertPricingConfig(String(req.params.key), value, category, description, userId);
    await storage.createPricingAuditEntry({
      action: "config_change",
      details: JSON.stringify({ key: String(req.params.key), value, category }),
      actorId: userId,
      actorRole: "admin",
      timestamp: now(),
    });
    res.json(config);
  });

  // ── Admin: Pricing audit log ──
  app.get("/api/pricing/audit", requireAuth(["admin"]), async (req, res) => {
    const limit = Number(req.query.limit) || 100;
    res.json(await storage.getPricingAuditLog(limit));
  });
}
