import type { Express } from "express";
import { z } from "zod";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Order } from "@shared/schema";
import { storage, db, logStripeReconciliation } from "../storage";
import { requireAuth, isAdminOrManager } from "../session";
import {
  getStripe, hasStripe as hasStripeKey, dollarsToCents, centsToDollars,
} from "../lib/stripe";
import { issueStripeRefundForOrder } from "../lib/refund";
import { pricingConfig } from "../pricing-config-service";
import { logAdminAction } from "../audit-helpers";
import {
  now, canAccessOrder, getOrderOwnershipAllowed,
  calculatePayouts, recordPayoutsForCapturedOrder,
} from "../engines";

export function registerPaymentRoutes(app: Express) {

  // ─────────────────────────────────────────────────────────
  //  STRIPE CONNECT PAYMENT ROUTES
  // ─────────────────────────────────────────────────────────

  // Fee model unified in Wave 3: vendor = subtotal × payoutRate, driver = flat per-trip.
  // Old Model B constants (PLATFORM_FEE_RATE, VENDOR_SHARE, DRIVER_SHARE) removed.
  // Stripe client, money conversions → server/lib/stripe.ts
  const hasStripe = hasStripeKey();
  const stripe = getStripe();

  function getOrderChargeAmountCents(order: Order): number {
    return dollarsToCents(order.finalPrice ?? order.total ?? 0);
  }

  // P2-047: refund helpers imported from server/lib/refund.ts

  app.post("/api/payments/create-intent", requireAuth(), async (req, res) => {
    const CreateIntentBody = z.object({ orderId: z.number() }).strip();
    const parsedCreateIntent = CreateIntentBody.safeParse(req.body);
    if (!parsedCreateIntent.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedCreateIntent.error.issues });
    }
    const { orderId } = parsedCreateIntent.data;
    if (!orderId) return res.status(400).json({ error: "orderId required" });

    const order = await storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentUser = (req as any).currentUser;
    if (order.customerId !== currentUser.id && !isAdminOrManager(currentUser)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const amountCents = getOrderChargeAmountCents(order);
    if (amountCents <= 0) return res.status(400).json({ error: "Order total must be positive" });
    const amount = centsToDollars(amountCents);

    let intentId: string;
    let clientSecret: string | null = null;

    if (stripe && !(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_DISABLED")) {
      // Real Stripe payment intent
      try {
        const intent = await stripe.paymentIntents.create({
          amount: amountCents,
          currency: "usd",
          metadata: { orderId: String(orderId), orderNumber: order.orderNumber || "" },
        }, { idempotencyKey: `order-${order.id}-intent` });
        intentId = intent.id;
        clientSecret = intent.client_secret;
      } catch (err: any) {
        console.error("[Stripe] Payment intent creation failed:", err.message);
        return res.status(500).json({ error: "Payment processing failed" });
      }
    } else {
      return res.status(503).json({ error: "payments_unavailable" });
    }

    const txn = await storage.createPaymentTransaction({
      orderId: Number(orderId), type: "charge", amount, currency: "usd",
      amountCents,
      status: "pending", stripePaymentIntentId: intentId,
      recipientType: "platform",
      platformFee: Math.round(amount * (await pricingConfig.getPlatformFeeRate()) * 100) / 100,
      metadata: JSON.stringify({ demo: !hasStripe, amountCents }), createdAt: now(),
    });

    res.json({
      paymentIntentId: intentId, transactionId: txn.id,
      clientSecret,
      amount, amountCents, status: "pending", demoMode: !hasStripe,
    });
  });

  app.post("/api/payments/confirm", requireAuth(["admin", "manager"]), async (req, res) => {
    // Wave 2: admin manual confirm is only allowed when the order has a REAL
    // Stripe PaymentIntent that has actually succeeded. We verify with Stripe
    // directly. Demo/zero-amount intents (pi_demo_*, pi_quote_*, pi_zero_*) are
    // not eligible — the webhook is the only path to "captured" for them too.
    const ConfirmPaymentBody = z.object({ orderId: z.number() }).strip();
    const parsedConfirmPayment = ConfirmPaymentBody.safeParse(req.body);
    if (!parsedConfirmPayment.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedConfirmPayment.error.issues });
    }
    const { orderId } = parsedConfirmPayment.data;
    if (!orderId) return res.status(400).json({ error: "orderId required" });
    const order = await storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.paymentStatus === "captured") {
      return res.json({ status: "already_captured", orderId: order.id });
    }

    const txns = await storage.getPaymentTransactionsByOrder(Number(orderId));
    const chargeTxn = txns.find((t: any) => t.type === "charge" && t.status === "pending");
    if (!chargeTxn) {
      return res.status(400).json({ error: "No pending charge transaction found for this order" });
    }

    const pi = chargeTxn.stripePaymentIntentId || "";
    const isFakeIntent = !pi || pi.startsWith("pi_demo_") || pi.startsWith("pi_quote_") || pi.startsWith("pi_zero_");
    if (isFakeIntent) {
      return res.status(400).json({
        error: "This order has no real Stripe PaymentIntent. Manual confirmation is disabled until Stripe is configured.",
        code: "NO_REAL_PAYMENT_INTENT",
      });
    }
    if (!stripe) {
      return res.status(503).json({
        error: "Stripe is not configured on this server. Cannot verify payment.",
        code: "STRIPE_NOT_CONFIGURED",
      });
    }

    let stripePi: Stripe.PaymentIntent;
    try {
      stripePi = await stripe.paymentIntents.retrieve(pi);
    } catch (err: any) {
      console.error("[Payments] confirm: Stripe retrieve failed", err?.message);
      return res.status(502).json({ error: "Failed to verify payment with Stripe", code: "STRIPE_ERROR" });
    }
    if (stripePi.status !== "succeeded") {
      return res.status(400).json({
        error: `Cannot confirm: PaymentIntent status is "${stripePi.status}", expected "succeeded".`,
        intentStatus: stripePi.status,
      });
    }

    // P2-039: wrap updatePaymentTransaction + updateOrder + createOrderEvent
    // in db.transaction(). recordPayoutsForCapturedOrder stays outside (has own tx).
    const confirmTs = now();
    await db.transaction(async (tx) => {
      await tx.update(schema.paymentTransactions).set({
        status: "completed",
        completedAt: confirmTs,
      } as any).where(eq(schema.paymentTransactions.id, chargeTxn.id));
      await tx.update(schema.orders).set({
        paymentStatus: "captured",
        updatedAt: confirmTs,
      } as any).where(eq(schema.orders.id, order.id));
      await tx.insert(schema.orderEvents).values({
        orderId: order.id, eventType: "payment_captured",
        description: `Payment of $${order.total?.toFixed(2)} captured (admin-verified via Stripe)`,
        timestamp: confirmTs,
      } as any);
    });
    const fresh = await storage.getOrder(order.id);
    if (fresh) await recordPayoutsForCapturedOrder(fresh);
    logAdminAction(req, { action: "payment.confirm", entityType: "order", entityId: order.id, newValue: { paymentStatus: "captured" } });
    res.json({ status: "completed", orderId: order.id, intentStatus: stripePi.status });
  });

  app.post("/api/payments/refund", requireAuth(["admin", "manager"]), async (req, res) => {
    // Accepts amountCents (preferred, explicit unit) or legacy amount (also cents).
    // Both are integer minor units; refusing to silently treat dollars as cents.
    const RefundBody = z.object({
      orderId: z.number(),
      amountCents: z.number().int().nonnegative().optional(),
      amount: z.number().int().nonnegative().optional(),
      reason: z.string().optional(),
    }).strip().refine(
      (v) => v.amountCents !== undefined || v.amount !== undefined,
      { message: "amountCents (or legacy amount) is required, expressed in cents (integer minor units)" }
    );
    const parsedRefund = RefundBody.safeParse(req.body);
    if (!parsedRefund.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedRefund.error.issues });
    }
    const { orderId, reason } = parsedRefund.data;
    const amountCents = parsedRefund.data.amountCents ?? parsedRefund.data.amount!;
    const order = await storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const result = await issueStripeRefundForOrder(order, amountCents, reason, `refund-${order.id}-${Date.now()}`);
    if ("errorStatus" in result) {
      return res.status(result.errorStatus as number).json(result);
    }
    logAdminAction(req, { action: "payment.refund", entityType: "order", entityId: order.id, newValue: { amountCents, reason } });
    res.json({
      refundId: result.txn.id,
      stripeRefundId: result.stripeRefundId,
      amount: result.amount,
      amountCents: result.amountCents,
      status: "completed",
      paymentStatus: result.paymentStatus,
      demoMode: !hasStripe,
    });
  });

  app.get("/api/payments/order/:id", requireAuth(), async (req, res) => {
    // F2: ownership check + redact financial splits for non-admin roles.
    const orderId = Number(String(req.params.id));
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const currentUser = (req as any).currentUser;
    if (!(await canAccessOrder(order, currentUser))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const transactionsRaw = await storage.getPaymentTransactionsByOrder(orderId);
    // Unified fee model (Model A): vendor = subtotal × payoutRate, driver = flat per-trip
    const { vendorPayout, driverPayout } = await calculatePayouts(order);
    const total = order.finalPrice || order.total || 0;
    const platformFee = Math.round((total - vendorPayout - driverPayout) * 100) / 100;
    const vendorShare = vendorPayout;
    const driverShare = driverPayout;

    // Only admin/manager see internal splits. Vendors see their own share. Drivers see their own. Customer sees neither.
    const isAdminMgr = isAdminOrManager(currentUser);
    const isVendor = currentUser.role === "laundromat" || currentUser.role === "vendor";
    const isDriver = currentUser.role === "driver";

    // Sanitize each transaction row so split columns are not leaked to roles that
    // should not see them. Admin/manager see everything; vendor/driver see only
    // their own share columns; customer sees neither.
    const sanitizeTxn = (t: any) => {
      if (isAdminMgr) return t;
      const out: any = { ...t };
      if (isVendor) {
        delete out.platformFee;
        delete out.driverShare;
      } else if (isDriver) {
        delete out.platformFee;
        delete out.vendorShare;
      } else {
        // customer (or any other role): strip all split columns
        delete out.platformFee;
        delete out.vendorShare;
        delete out.driverShare;
      }
      return out;
    };
    const transactions = Array.isArray(transactionsRaw) ? transactionsRaw.map(sanitizeTxn) : transactionsRaw;

    const payload: any = { orderId, paymentStatus: order.paymentStatus, total, transactions, demoMode: !hasStripe };
    if (isAdminMgr) {
      payload.platformFee = platformFee;
      payload.vendorShare = vendorShare;
      payload.driverShare = driverShare;
    } else if (isVendor) {
      payload.vendorShare = vendorShare;
    } else if (isDriver) {
      payload.driverShare = driverShare;
    }
    res.json(payload);
  });

  // ─────────────────────────────────────────────────────────
  //  SETUP INTENT — collect a card via Stripe Elements (test mode)
  // ─────────────────────────────────────────────────────────
  app.post("/api/payments/setup-intent", requireAuth(), async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured on this server.", code: "STRIPE_NOT_CONFIGURED" });
    }
    const currentUser = (req as any).currentUser;

    // Create a Stripe Customer on-the-fly so the SetupIntent can attach the card
    let stripeCustomerId: string;
    try {
      const customer = await stripe.customers.create({
        email: currentUser.email || undefined,
        name: currentUser.name || undefined,
        metadata: { offloadUserId: String(currentUser.id) },
      });
      stripeCustomerId = customer.id;
    } catch (err: any) {
      console.error("[Stripe] Customer creation failed:", err.message);
      return res.status(500).json({ error: "Failed to create Stripe customer" });
    }

    try {
      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ["card"],
        metadata: { offloadUserId: String(currentUser.id) },
      });
      res.json({ clientSecret: setupIntent.client_secret });
    } catch (err: any) {
      console.error("[Stripe] SetupIntent creation failed:", err.message);
      return res.status(500).json({ error: "Failed to create setup intent" });
    }
  });

  // Save a confirmed payment method to the local DB after Stripe card setup
  app.post("/api/payments/save-card", requireAuth(), async (req, res) => {
    if (!stripe) {
      return res.status(503).json({ error: "Stripe is not configured.", code: "STRIPE_NOT_CONFIGURED" });
    }
    const SaveCardBody = z.object({ paymentMethodId: z.string() }).strip();
    const parsed = SaveCardBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    }
    const currentUser = (req as any).currentUser;
    const { paymentMethodId } = parsed.data;

    try {
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      const card = pm.card;
      const last4 = card?.last4 || "****";
      const brand = card?.brand || "card";
      const expMonth = card?.exp_month ?? 0;
      const expYear = card?.exp_year ?? 0;

      const saved = await storage.createPaymentMethod({
        userId: currentUser.id,
        type: "card",
        label: `${brand.charAt(0).toUpperCase() + brand.slice(1)} ••${last4}`,
        last4,
        expiryDate: `${String(expMonth).padStart(2, "0")}/${expYear}`,
        isDefault: false,
      });
      res.json(saved);
    } catch (err: any) {
      console.error("[Stripe] save-card failed:", err.message);
      return res.status(500).json({ error: "Failed to save payment method" });
    }
  });

  app.post("/api/payments/setup-connect", requireAuth(), (_req, res) => {
    res.status(501).json({ error: "Vendor payout onboarding is not yet available. Please contact support." });
  });

  app.get("/api/payments/connect-status/:userId", requireAuth(), async (req, res) => {
    const userId = Number(String(req.params.userId));
    const currentUser = (req as any).currentUser;
    if (userId !== currentUser.id && !isAdminOrManager(currentUser)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const account = await storage.getStripeAccount(userId);
    if (!account) return res.json({ connected: false, status: "not_connected" });
    if (!account.stripeAccountId || account.stripeAccountId.startsWith("acct_demo_")) {
      return res.json({ connected: false, status: "not_connected", demoMode: false });
    }
    res.json({
      connected: true, accountId: account.stripeAccountId, status: account.status,
      onboardingComplete: !!account.onboardingComplete, payoutsEnabled: !!account.payoutsEnabled,
      chargesEnabled: !!account.chargesEnabled, demoMode: !hasStripe,
    });
  });

}
