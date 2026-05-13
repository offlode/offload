/**
 * Centralized Stripe refund logic — extracted from orders-crud.ts (P2-047).
 * All route modules that need refund capability should import from here
 * instead of maintaining duplicate copies.
 */
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Order } from "@shared/schema";
import { storage, db, logStripeReconciliation } from "../storage";
import {
  getStripe, hasStripe as hasStripeKey, dollarsToCents, centsToDollars,
} from "./stripe";
import { now } from "../engines";

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
