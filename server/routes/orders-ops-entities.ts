import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import {
  CONSENT_TIMEOUT_HOURS,
  insertAddressSchema, insertPaymentMethodSchema,
  insertDisputeSchema, insertReviewSchema,
} from "@shared/schema";
import { storage, db, logStripeReconciliation } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { applyVendorCertification } from "../certified";
import { getStripe, hasStripe as hasStripeKey, dollarsToCents, centsToDollars } from "../lib/stripe";
import { issueStripeRefundForOrder } from "../lib/refund";
import { logAdminAction } from "../audit-helpers";
import { pick } from "../lib/util";
import { DISPUTE_ADMIN_UPDATE_FIELDS, PAYMENT_METHOD_UPDATE_FIELDS } from "../lib/patch-allowlists";
import type { Order } from "@shared/schema";
import { isAdminOrManager, requireAuth } from "../session";
import {
  now, notifyUser, getOrderOwnershipAllowed, canAccessOrder,
} from "../engines";

export function registerOrdersOpsEntitiesRoutes(app: Express) {
  // ─────────────────────────────────────────────────────────
  //  ORDER EVENTS
  // ─────────────────────────────────────────────────────────

  app.get("/api/orders/:id/events", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });
    const currentUser = (req as any).currentUser;
    if (!(await canAccessOrder(order, currentUser))) {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json(await storage.getOrderEvents(Number(String(req.params.id))));
  });

  app.post("/api/orders/:id/events", requireAuth(["admin", "manager"]), async (req, res) => {
    const EventBody = z.object({
      eventType: z.string().min(1),
      description: z.string().min(1),
      details: z.string().optional().nullable(),
      actorId: z.number().optional(),
      actorRole: z.string().optional(),
      photoUrl: z.string().optional().nullable(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    }).strip();
    const parsed = EventBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const event = await storage.createOrderEvent({
      ...parsed.data,
      orderId: Number(String(req.params.id)),
      timestamp: now(),
    });
    res.status(201).json(event);
  });

  // ─────────────────────────────────────────────────────────
  //  ADDRESSES
  // ─────────────────────────────────────────────────────────

  app.get("/api/addresses", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const userId = ["admin", "manager"].includes(currentUser.role) && req.query.userId ? Number(req.query.userId) : currentUser.id;
    res.json(await storage.getAddressesByUser(userId));
  });

  app.post("/api/addresses", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const AddressBody = insertAddressSchema.omit({ userId: true });
    const parsed = AddressBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const data = { ...parsed.data, userId: currentUser.id };
    if (data.isDefault) {
      const existing = await storage.getAddressesByUser(currentUser.id);
      for (const a of existing) {
        if (a.isDefault) await storage.updateAddress(a.id, { isDefault: false });
      }
    }
    const address = await storage.createAddress(data);
    res.status(201).json(address);
  });

  app.patch("/api/addresses/:id", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const addr = await storage.getAddress(Number(String(req.params.id)));
    if (!addr) return res.status(404).json({ error: "Address not found" });
    if (addr.userId !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const AddressPatch = insertAddressSchema.omit({ userId: true }).partial();
    const parsed = AddressPatch.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    if (parsed.data.isDefault) {
      const allAddr = await storage.getAddressesByUser(addr.userId);
      for (const a of allAddr) { await storage.updateAddress(a.id, { isDefault: false }); }
    }
    const updated = await storage.updateAddress(Number(String(req.params.id)), parsed.data);
    res.json(updated);
  });

  app.delete("/api/addresses/:id", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const addr = await storage.getAddress(Number(String(req.params.id)));
    if (!addr) return res.status(404).json({ error: "Address not found" });
    if (addr.userId !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    await storage.deleteAddress(Number(String(req.params.id)));
    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────
  //  PAYMENT METHODS
  // ─────────────────────────────────────────────────────────

  app.get("/api/payment-methods", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const userId = ["admin", "manager"].includes(currentUser.role) && req.query.userId ? Number(req.query.userId) : currentUser.id;
    res.json(await storage.getPaymentMethodsByUser(userId));
  });

  app.post("/api/payment-methods", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const PMBody = insertPaymentMethodSchema.omit({ userId: true });
    const parsed = PMBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    res.status(201).json(await storage.createPaymentMethod({ ...parsed.data, userId: currentUser.id }));
  });

  app.patch("/api/payment-methods/:id", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const id = Number(String(req.params.id));
    const method = await storage.getPaymentMethod(id);
    if (!method) return res.status(404).json({ error: "Payment method not found" });
    if (method.userId !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const pmUpdates = pick(req.body, PAYMENT_METHOD_UPDATE_FIELDS);
    const PMPatch = insertPaymentMethodSchema.omit({ userId: true }).partial();
    const parsed = PMPatch.safeParse(pmUpdates);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    if (parsed.data.isDefault) {
      const existing = await storage.getPaymentMethodsByUser(method.userId);
      for (const pm of existing) {
        if (pm.id !== id && pm.isDefault) {
          await storage.updatePaymentMethod(pm.id, { isDefault: false });
        }
      }
    }
    const updated = await storage.updatePaymentMethod(id, parsed.data);
    if (!updated) return res.status(404).json({ error: "Payment method not found" });
    res.json(updated);
  });

  app.delete("/api/payment-methods/:id", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const id = Number(String(req.params.id));
    const method = await storage.getPaymentMethod(id);
    if (!method) return res.status(404).json({ error: "Payment method not found" });
    if (method.userId !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    await storage.deletePaymentMethod(id);
    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────
  //  CONSENT ENGINE
  // ─────────────────────────────────────────────────────────

  app.get("/api/orders/:id/consents", requireAuth(), async (req, res) => {
    const orderId = Number(String(req.params.id));
    const orderC = await storage.getOrder(orderId);
    if (!orderC) return res.status(404).json({ error: "Order not found" });
    const cu = (req as any).currentUser;
    const drC = cu.role === "driver" ? await storage.getDriverByUserId(cu.id) : null;
    const vnC = ["laundromat","vendor","manager"].includes(cu.role)
      ? await storage.getVendorByUserId(cu.id)
      : null;
    if (!getOrderOwnershipAllowed(orderC, cu, drC, vnC)) {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json(await storage.getConsentsByOrder(orderId));
  });

  app.post("/api/orders/:id/consents", requireAuth(["laundromat", "vendor", "admin"]), async (req, res) => {
    const orderId = Number(String(req.params.id));
    const orderC = await storage.getOrder(orderId);
    if (!orderC) return res.status(404).json({ error: "Order not found" });
    const cu = (req as any).currentUser;
    // Vendors must own this order; admins are exempt.
    if (cu.role !== "admin") {
      const vn = await storage.getVendorByUserId(cu.id);
      if (!vn || orderC.vendorId !== vn.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const ts_ = now();
    const autoApproveAt = new Date(Date.now() + CONSENT_TIMEOUT_HOURS * 3600000).toISOString();

    const ConsentBody = z.object({
      consentType: z.string().min(1),
      description: z.string().min(1),
      additionalCharge: z.number().optional().default(0),
    }).strip();
    const parsedConsent = ConsentBody.safeParse(req.body);
    if (!parsedConsent.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedConsent.error.issues });
    }
    const consent = await storage.createConsent({
      ...parsedConsent.data,
      orderId,
      requestedBy: cu.id,
      requestedAt: ts_,
      autoApproveAt,
    });

    // Log event
    await storage.createOrderEvent({
      orderId,
      eventType: "consent_requested",
      description: `Consent requested: ${parsedConsent.data.consentType} — ${parsedConsent.data.description}`,
      actorId: cu.id,
      actorRole: cu.role,
      timestamp: ts_,
    });

    // Notify customer
    if (orderC) {
      await notifyUser(orderC.customerId, orderC.id, "consent_request",
        "Action Required",
        `The laundromat needs your approval: ${parsedConsent.data.description}. Auto-approves in ${CONSENT_TIMEOUT_HOURS} hours.`,
        `/orders/${orderC.id}`
      );
    }

    res.status(201).json(consent);
  });

  // Customer responds to consent
  app.patch("/api/consents/:id", requireAuth(), async (req, res) => {
    const consent = await storage.getConsent(Number(String(req.params.id)));
    if (!consent) return res.status(404).json({ error: "Consent not found" });

    // Only the order's customer (or admin) may respond to consent.
    const cu = (req as any).currentUser;
    const orderForConsent = await storage.getOrder(consent.orderId);
    if (!orderForConsent) return res.status(404).json({ error: "Order not found" });
    if (cu.role !== "admin" && orderForConsent.customerId !== cu.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { status } = req.body;
    if (!["approved", "denied"].includes(status)) {
      return res.status(400).json({ error: "Status must be approved or denied" });
    }

    const updated = await storage.updateConsent(consent.id, {
      status,
      respondedAt: now(),
    });

    // Log event
    await storage.createOrderEvent({
      orderId: consent.orderId,
      eventType: status === "approved" ? "consent_granted" : "consent_denied",
      description: `Customer ${status} consent: ${consent.description}`,
      actorRole: "customer",
      timestamp: now(),
    });

    // If there's an additional charge and it's approved, update order total
    if (status === "approved" && consent.additionalCharge && consent.additionalCharge > 0) {
      const order = await storage.getOrder(consent.orderId);
      if (order) {
        const newSubtotal = (order.subtotal || 0) + consent.additionalCharge;
        const newTax = Math.round(newSubtotal * (await pricingConfig.getTaxRate()) * 100) / 100;
        const newTotal = Math.round((newSubtotal + newTax + (order.deliveryFee || 0)) * 100) / 100;
        await storage.updateOrder(order.id, { subtotal: newSubtotal, tax: newTax, total: newTotal });
      }
    }

    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  MESSAGES
  // ─────────────────────────────────────────────────────────

  app.get("/api/orders/:id/messages", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });
    const currentUser = (req as any).currentUser;
    if (!(await canAccessOrder(order, currentUser))) {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json(await storage.getMessagesByOrder(Number(String(req.params.id))));
  });

  app.post("/api/orders/:id/messages", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });
    const currentUser = (req as any).currentUser;
    if (!(await canAccessOrder(order, currentUser))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const MsgBody = z.object({ content: z.string().min(1), type: z.string().optional() }).strip();
    const parsedMsg = MsgBody.safeParse(req.body);
    if (!parsedMsg.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedMsg.error.issues });
    }
    const msg = await storage.createMessage({
      ...parsedMsg.data,
      orderId: Number(String(req.params.id)),
      senderId: currentUser.id,
      senderRole: currentUser.role,
      timestamp: now(),
    });
    res.status(201).json(msg);
  });

  // ─────────────────────────────────────────────────────────
  //  DISPUTES
  // ─────────────────────────────────────────────────────────

  app.get("/api/disputes", requireAuth(["admin", "manager"]), async (_req, res) => {
    res.json(await storage.getDisputes());
  });

  app.get("/api/disputes/:id", requireAuth(), async (req, res) => {
    const d = await storage.getDispute(Number(String(req.params.id)));
    if (!d) return res.status(404).json({ error: "Dispute not found" });
    const currentUser = (req as any).currentUser;
    if (d.customerId !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const order = await storage.getOrder(d.orderId);
    const customer = await storage.getUser(d.customerId);
    res.json({ ...d, order, customer: customer ? { id: customer.id, name: customer.name, email: customer.email } : null });
  });

  app.post("/api/disputes", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const DisputeBody = insertDisputeSchema.omit({ customerId: true, createdAt: true });
    const parsed = DisputeBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const order = await storage.getOrder(parsed.data.orderId);
    if (!order || order.customerId !== currentUser.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const ts_ = now();
    const dispute = await storage.createDispute({
      ...parsed.data,
      customerId: currentUser.id,
      createdAt: ts_,
    });

    // Update order status atomically with dispute event
    if (order) {
      await storage.transitionOrderStatus(order.id, order.status, "disputed", {
        eventType: "disputed",
        description: `Dispute filed: ${dispute.reason}`,
        actorId: dispute.customerId,
        actorRole: "customer",
        timestamp: ts_,
      } as any);

      // Notify admins
      const admins = await storage.getUsersByRole("admin");
      // P2-049: replaced .forEach(async ...) with for...of
      for (const admin of admins) {
        await notifyUser(admin.id, order.id, "system",
          "New Dispute",
          `Dispute on order ${order.orderNumber}: ${dispute.reason}`,
          `/admin/disputes`
        );
      }
    }

    res.status(201).json(dispute);
  });

  app.patch("/api/disputes/:id", requireAuth(["admin", "manager"]), async (req, res) => {
    const disputeId = Number(String(req.params.id));
    const disputeUpdates = pick(req.body, DISPUTE_ADMIN_UPDATE_FIELDS);
    const DisputePatch = insertDisputeSchema.partial();
    const parsed = DisputePatch.safeParse(disputeUpdates);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const beforeDispute = await storage.getDispute(disputeId);
    const updated = await storage.updateDispute(disputeId, parsed.data);
    if (!updated) return res.status(404).json({ error: "Dispute not found" });
    logAdminAction(req, { action: "dispute.update", entityType: "dispute", entityId: disputeId, oldValue: { status: beforeDispute?.status }, newValue: parsed.data });

    // If resolved, notify customer
    if (parsed.data.status === "resolved" || parsed.data.status === "closed") {
      const dispute = await storage.getDispute(Number(String(req.params.id)));
      if (dispute) {
        await notifyUser(dispute.customerId, dispute.orderId, "system",
          "Dispute Resolved",
          `Your dispute has been ${parsed.data.status}. ${parsed.data.resolution || ""}`,
          `/orders/${dispute.orderId}`
        );
        // Accept refund amount under any of the three field names the admin UIs currently send.
        // C-B1 fix: offload-admin sends `creditAmount`, offload-admin alternate sends `resolutionAmount`.
        // Without this alias the dispute was marked resolved but Stripe was never called — customer never got refunded.
        const requestedRefund = Number(parsed.data.refundAmount ?? parsed.data.creditAmount ?? req.body.resolutionAmount ?? 0);
        if (requestedRefund > 0) {
          const order = await storage.getOrder(dispute.orderId);
          if (order) {
            // Only attempt a Stripe refund (and mark refunded) if payment was actually captured.
            // No fallback marking — never claim refunded without proof.
            if (order.paymentStatus === "captured" || order.paymentStatus === "paid") {
              try {
                const refundCents = Math.round(requestedRefund * 100);
                if (refundCents > 0) {
                  const refundResult = await issueStripeRefundForOrder(order, refundCents, "requested_by_customer", `dispute-${dispute.id}-${Date.now()}`);
                  if (refundResult?.errorStatus) {
                    console.error("[dispute] Stripe refund failed:", refundResult.error);
                    return res.status(500).json({ error: "Refund failed — please retry or contact Stripe support", stripeError: refundResult.error });
                  }
                  // paymentStatus already set by issueStripeRefundForOrder (refunded or partially_refunded)
                }
              } catch (refundErr: any) {
                console.error("[dispute] Stripe refund exception", refundErr);
                return res.status(500).json({ error: "Refund failed — please retry or contact Stripe support" });
              }
            }
            // If payment was never captured, do NOT mark as refunded (semantically wrong; nothing to refund).
          }
        }
      }
    }

    if ((parsed.data.status === "resolved" || parsed.data.status === "closed") && updated.orderId) {
      const orderForResolution = await storage.getOrder(updated.orderId);
      if (orderForResolution?.status === "disputed") {
        const refundAmount = Number(parsed.data.refundAmount ?? parsed.data.creditAmount ?? 0);
        const targetStatus = refundAmount > 0 ? "refunded" : "delivered";
        await storage.transitionOrderStatus(orderForResolution.id, "disputed", targetStatus, {
          eventType: targetStatus,
          description: `Dispute resolved: ${parsed.data.resolution || targetStatus}`,
          actorId: (req as any).currentUser?.id,
          actorRole: (req as any).currentUser?.role || "admin",
          timestamp: now(),
        } as any);
      }
    }

    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  REVIEWS
  // ─────────────────────────────────────────────────────────

  app.get("/api/reviews", requireAuth(), async (req, res) => {
    // F20: scope reviews to caller.
    const cu = (req as any).currentUser;
    const all = await storage.getReviews();
    if (isAdminOrManager(cu) || cu.role === "support") return res.json(all);
    if (cu.role === "customer") {
      return res.json(all.filter((r: any) => r.customerId === cu.id));
    }
    if (cu.role === "laundromat" || cu.role === "vendor") {
      const vp = await storage.getVendorByUserId(cu.id);
      return res.json(vp ? all.filter((r: any) => r.vendorId === vp.id) : []);
    }
    if (cu.role === "driver") {
      const dp = await storage.getDriverByUserId(cu.id);
      return res.json(dp ? all.filter((r: any) => r.driverId === dp.id) : []);
    }
    return res.json([]);
  });

  app.get("/api/orders/:id/review", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const orderId = Number(String(req.params.id));
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });
    // S3 IDOR fix: only the order's customer, an admin, or a manager may read the review.
    const isStaff = ["admin", "manager"].includes(currentUser.role);
    if (!isStaff && order.customerId !== currentUser.id) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const review = await storage.getReviewByOrder(orderId);
    if (!review) return res.status(404).json({ error: "No review yet" });
    res.json(review);
  });

  app.post("/api/orders/:id/review", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // S2 IDOR fix: only the order's customer may post a review for that order.
    if (order.customerId !== currentUser.id) {
      return res.status(403).json({ error: "You can only review your own orders" });
    }

    // Reviews are only meaningful for completed/delivered orders.
    if (!["delivered", "completed"].includes(order.status)) {
      return res.status(400).json({ error: "Reviews are only available for completed orders" });
    }

    // Check if already reviewed
    const existing = await storage.getReviewByOrder(order.id);
    if (existing) return res.status(409).json({ error: "Order already reviewed" });

    const ReviewBody = insertReviewSchema.pick({ vendorRating: true, driverRating: true, overallRating: true, comment: true });
    const parsed = ReviewBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const review = await storage.createReview({
      orderId: order.id,
      customerId: currentUser.id,
      vendorId: order.vendorId || undefined,
      driverId: order.driverId || undefined,
      vendorRating: parsed.data.vendorRating,
      driverRating: parsed.data.driverRating,
      overallRating: parsed.data.overallRating || req.body.rating,
      comment: parsed.data.comment,
      createdAt: now(),
    });

    // Update vendor rating
    if (order.vendorId && req.body.vendorRating) {
      const vendorReviews = await storage.getReviewsByVendor(order.vendorId);
      const avgRating = vendorReviews.reduce((sum, r) => sum + (r.vendorRating || r.overallRating), 0) / vendorReviews.length;
      await storage.updateVendor(order.vendorId, {
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: vendorReviews.length,
      });
    }

    // Update driver rating
    if (order.driverId && req.body.driverRating) {
      const driverReviews = await storage.getReviewsByDriver(order.driverId);
      const avgRating = driverReviews.reduce((sum, r) => sum + (r.driverRating || r.overallRating), 0) / driverReviews.length;
      const driver = await storage.getDriver(order.driverId);
      if (driver) {
        await storage.updateDriver(driver.id, { rating: Math.round(avgRating * 10) / 10 });
      }
    }

    // Offload Certified — re-evaluate vendor certification based on rolling-window reviews.
    // Admin-configurable rules (certified_min_happy_reviews / max_unhappy_reviews / window_days).
    if (order.vendorId) {
      try {
        await applyVendorCertification(order.vendorId);
      } catch (e: any) {
        console.error("[Certified] failed to apply for vendor", order.vendorId, e?.message || e);
      }
    }

    await storage.createOrderEvent({
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
  //  PUSH TOKENS
  // ─────────────────────────────────────────────────────────

  app.post("/api/push/register-token", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const PushTokenBody = z.object({ token: z.string().min(1), platform: z.string().optional() }).strip();
    const parsedPushToken = PushTokenBody.safeParse(req.body);
    if (!parsedPushToken.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPushToken.error.issues });
    }
    const { token, platform } = parsedPushToken.data;
    if (!token || typeof token !== "string") return res.status(400).json({ error: "token is required" });
    if (!platform || typeof platform !== "string") return res.status(400).json({ error: "platform is required" });
    if (!["ios", "android", "web"].includes(platform)) return res.status(400).json({ error: "Unsupported platform" });

    const saved = await storage.savePushToken(currentUser.id, token, platform);
    res.status(201).json({ id: saved.id, platform: saved.platform, createdAt: saved.createdAt });
  });

  // ─────────────────────────────────────────────────────────
  //  NOTIFICATIONS
  // ─────────────────────────────────────────────────────────

  app.get("/api/notifications", requireAuth(), async (req, res) => {
    // Security: always use auth token userId, ignore query param
    const currentUserN = (req as any).currentUser;
    const userId = currentUserN.id;
    res.json(await storage.getNotificationsByUser(userId));
  });

  app.get("/api/notifications/unread-count", requireAuth(), async (req, res) => {
    const currentUserUC = (req as any).currentUser;
    const userId = currentUserUC.id;
    res.json({ count: await storage.getUnreadCount(userId) });
  });

  app.patch("/api/notifications/:id/read", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const existing = await storage.getNotification(Number(String(req.params.id)));
    if (!existing) return res.status(404).json({ error: "Notification not found" });
    if (existing.userId !== currentUser.id) return res.status(403).json({ error: "Access denied" });
    const n = await storage.markNotificationRead(existing.id);
    res.json(n);
  });

  app.post("/api/notifications/mark-all-read", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    await storage.markAllRead(currentUser.id);
    res.json({ success: true });
  });

  // ─────────────────────────────────────────────────────────
  //  CUSTOMER STATS
  // ─────────────────────────────────────────────────────────

  app.get("/api/customers/:id/stats", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    if (Number(String(req.params.id)) !== currentUser.id && !["admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json(await storage.getCustomerStats(Number(String(req.params.id))));
  });

  // P2-047: refund helpers imported from server/lib/refund.ts
}
