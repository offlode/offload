import type { Express } from "express";
import { timingSafeEqual } from "crypto";
import { Resend } from "resend";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Order } from "@shared/schema";
import { storage, db, logStripeReconciliation } from "../storage";
import { getStripe } from "../lib/stripe";
import { getOrderEmailTemplate } from "../lib/email-templates";
import { requireAuth } from "../session";
import { now, recordPayoutsForCapturedOrder } from "../engines";

export function registerWebhookRoutes(app: Express) {

  const stripe = getStripe();

  // ═══════════════════════════════════════════════════════════════
  //  EMAIL NOTIFICATION SYSTEM
  // ═══════════════════════════════════════════════════════════════

  async function sendOrderEmail(order: Order, template: string) {
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

  // ── Send email endpoint for admin/system use ──
  app.post("/api/notifications/send-email", requireAuth(["admin", "manager"]), async (req, res) => {
    const { z } = await import("zod");
    const SendEmailBody = z.object({ orderId: z.number().optional(), template: z.string().optional(), customEmail: z.string().email().optional() }).strip();
    const parsedSendEmail = SendEmailBody.safeParse(req.body);
    if (!parsedSendEmail.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedSendEmail.error.issues });
    }
    const { orderId, template, customEmail } = parsedSendEmail.data;
    if (!orderId && !customEmail) return res.status(400).json({ error: "orderId or customEmail required" });

    if (orderId) {
      const order = await storage.getOrder(Number(orderId));
      if (!order) return res.status(404).json({ error: "Order not found" });
      await sendOrderEmail(order, template || "order_confirmation");
      return res.json({ sent: true, orderId, template });
    }

    res.json({ sent: true, to: customEmail, template });
  });

  // ═══════════════════════════════════════════════════════════════
  //  STRIPE WEBHOOK ENDPOINT
  // ═══════════════════════════════════════════════════════════════

  // Handler defined once, registered on both paths for compatibility with Stripe Dashboard
  // endpoints that may have been configured with either URL pattern.
  const stripeWebhookHandler = async (req: any, res: any) => {
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

    let processedStripeEventId: string | null = null;
    try {
      // Use Stripe SDK constructEvent for proper signature verification with raw body
      const rawBody = (req as any).rawBody ? (req as any).rawBody.toString() : (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
      let event: any;
      if (stripe) {
        // Use official Stripe SDK verification
        event = stripe.webhooks.constructEvent(rawBody, sig as string, webhookSecret);
      } else {
        // Fallback manual HMAC verification for environments without Stripe SDK
        const crypto = require("crypto");
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
        const signedPayload = `${timestamp}.${rawBody}`;
        const computedSig = crypto.createHmac("sha256", webhookSecret).update(signedPayload).digest("hex");
        let signatureMatches = false;
        try {
          const computedBuf = Buffer.from(computedSig, "hex");
          const expectedBuf = Buffer.from(expectedSig, "hex");
          signatureMatches = computedBuf.length === expectedBuf.length && timingSafeEqual(computedBuf, expectedBuf);
        } catch {
          signatureMatches = false;
        }
        if (!signatureMatches) {
          console.warn("[Stripe Webhook] REJECTED — signature mismatch");
          return res.status(400).json({ error: "Webhook signature verification failed" });
        }
        const ageSeconds = Math.floor(Date.now() / 1000) - Number(timestamp);
        if (Math.abs(ageSeconds) > 300) {
          return res.status(400).json({ error: "Webhook timestamp too old" });
        }
        event = JSON.parse(rawBody);
      }

      if (!event?.id || !event?.type) {
        return res.status(400).json({ error: "Invalid Stripe event" });
      }
      const shouldProcess = await storage.recordStripeEvent(event.id, event.type);
      if (!shouldProcess) {
        return res.status(200).json({ received: true, duplicate: true });
      }
      processedStripeEventId = event.id;

      switch (event.type) {
        case "payment_intent.succeeded": {
          const pi = event.data?.object;
          if (pi?.metadata?.orderId) {
            const orderId = Number(pi.metadata.orderId);
            const order = await storage.getOrder(orderId);
            if (order) {
              const ts_pi = now();
              try {
                await db.transaction(async (tx) => {
                  await tx.update(schema.orders).set({
                    paymentStatus: "captured",
                    updatedAt: ts_pi,
                  } as any).where(eq(schema.orders.id, orderId));
                  // Mark charge txn completed
                  const txns4stripe = await storage.getPaymentTransactionsByOrder(orderId);
                  const chargeTxn = txns4stripe.find(t => t.type === "charge" && t.stripePaymentIntentId === pi.id);
                  if (chargeTxn) {
                    await tx.update(schema.paymentTransactions).set({
                      status: "completed",
                      completedAt: ts_pi,
                    } as any).where(eq(schema.paymentTransactions.id, chargeTxn.id));
                  }
                  await tx.insert(schema.orderEvents).values({
                    orderId, eventType: "payment_captured",
                    description: `Payment of $${(pi.amount / 100).toFixed(2)} confirmed via Stripe`,
                    timestamp: ts_pi,
                  } as any);
                });
              } catch (txErr: any) {
                console.error("[webhook] payment_intent.succeeded tx failed:", txErr.message);
                await logStripeReconciliation({
                  stripeEventId: event.id,
                  stripeResourceId: pi.id,
                  action: "payment_captured",
                  dbState: JSON.stringify({ orderId, paymentStatus: order.paymentStatus }),
                  errorMessage: txErr.message,
                  notes: "DB transaction failed after Stripe confirmed payment — needs manual reconciliation",
                });
                break;
              }
              // Record vendor/driver payouts (already uses its own transaction)
              const freshOrder = await storage.getOrder(orderId);
              if (freshOrder) await recordPayoutsForCapturedOrder(freshOrder);
              // Trigger email notification
              await sendOrderEmail(order, "payment_confirmed");
            }
          }
          break;
        }
        case "payment_intent.payment_failed": {
          const pi = event.data?.object;
          if (pi?.metadata?.orderId) {
            const orderId = Number(pi.metadata.orderId);
            await storage.updateOrder(orderId, { paymentStatus: "failed" });
            await storage.createOrderEvent({
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
            await storage.updateOrder(orderId, { paymentStatus: "refunded" });
            await storage.createOrderEvent({
              orderId, eventType: "payment_refunded",
              description: `Refund of $${(charge.amount_refunded / 100).toFixed(2)} confirmed via Stripe`,
              timestamp: now(),
            });
          }
          break;
        }
        // Wave 2: dispute lifecycle handling. We do NOT auto-refund — admin reviews.
        case "charge.dispute.created": {
          const dispute = event.data?.object as any;
          const orderIdRaw = dispute?.metadata?.orderId || dispute?.payment_intent_metadata?.orderId;
          if (orderIdRaw) {
            const orderId = Number(orderIdRaw);
            await storage.updateOrder(orderId, { paymentStatus: "disputed" } as any);
            await storage.createOrderEvent({
              orderId, eventType: "payment_disputed",
              description: `Dispute opened (${dispute.reason || "unknown reason"}). Amount $${((dispute.amount || 0) / 100).toFixed(2)}.`,
              details: JSON.stringify({ disputeId: dispute.id, reason: dispute.reason, status: dispute.status }),
              timestamp: now(),
            });
            console.warn(`[Stripe Webhook] Dispute opened on order ${orderId}: ${dispute.id} (${dispute.reason})`);
          }
          break;
        }
        case "charge.dispute.closed": {
          const dispute = event.data?.object as any;
          const orderIdRaw = dispute?.metadata?.orderId || dispute?.payment_intent_metadata?.orderId;
          if (orderIdRaw) {
            const orderId = Number(orderIdRaw);
            const won = dispute.status === "won";
            // If lost, Stripe has already reversed funds — mark as refunded for accounting.
            // If won, restore paymentStatus to captured.
            await storage.updateOrder(orderId, { paymentStatus: won ? "captured" : "refunded" } as any);
            await storage.createOrderEvent({
              orderId, eventType: won ? "dispute_won" : "dispute_lost",
              description: `Dispute ${dispute.status}. ${won ? "Funds retained." : "Funds reversed by Stripe."}`,
              details: JSON.stringify({ disputeId: dispute.id, status: dispute.status }),
              timestamp: now(),
            });
          }
          break;
        }
        case "payment_intent.canceled": {
          const pi = event.data?.object as any;
          if (pi?.metadata?.orderId) {
            const orderId = Number(pi.metadata.orderId);
            const order = await storage.getOrder(orderId);
            if (order && order.paymentStatus !== "captured" && order.paymentStatus !== "refunded") {
              await storage.updateOrder(orderId, { paymentStatus: "failed" });
              await storage.createOrderEvent({
                orderId, eventType: "payment_canceled",
                description: `PaymentIntent canceled or expired`,
                timestamp: now(),
              });
            }
          }
          break;
        }
        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error("[Stripe Webhook] Error:", err.message);
      // Allow Stripe to retry events whose local processing failed after the
      // dedupe row was inserted.
      if (processedStripeEventId) await storage.deleteStripeEvent(processedStripeEventId);
      res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }
  };

  // Register stripe webhook on BOTH paths for Dashboard URL compatibility.
  // Some endpoints were created with /api/stripe/webhook; the canonical path is /api/webhooks/stripe.
  app.post("/api/webhooks/stripe", stripeWebhookHandler);
  app.post("/api/stripe/webhook", stripeWebhookHandler);

}
