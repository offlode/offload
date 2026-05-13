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

  async function getCapturedChargeForOrder(orderId: number) {
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

  async function issueStripeRefundForOrder(order: Order, amountCents: number, reason: string | undefined, idempotencyKey: string) {
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

    // Verified by Stripe. Flip txn + order, record payouts.
    await storage.updatePaymentTransaction(chargeTxn.id, { status: "completed", completedAt: now() });
    await storage.updateOrder(order.id, { paymentStatus: "captured" });
    const fresh = await storage.getOrder(order.id);
    if (fresh) await recordPayoutsForCapturedOrder(fresh);
    await storage.createOrderEvent({
      orderId: order.id, eventType: "payment_captured",
      description: `Payment of $${order.total?.toFixed(2)} captured (admin-verified via Stripe)`,
      timestamp: now(),
    });
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
