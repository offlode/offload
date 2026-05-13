import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import type { Order } from "@shared/schema";
import { storage, db, logStripeReconciliation } from "../storage";
import { requireAuth } from "../session";
import {
  VALID_TRANSITIONS as FSM_TRANSITIONS,
  STATUS_NOTIFICATIONS,
  STATUS_LABELS,
  TIMELINE_STEPS,
  validateTransition,
  getTimestampField,
  isCancellable,
  getProgressPercent,
} from "../order-fsm";
import {
  getStripe, hasStripe as hasStripeKey, dollarsToCents, centsToDollars,
} from "../lib/stripe";
import { issueStripeRefundForOrder } from "../lib/refund";
import {
  now, notifyAndEmit, canAccessOrder, emitToOrder,
  processPaymentCapture, awardLoyaltyPoints,
  validTransitions, findBestDriver,
} from "../engines";

export function registerFsmRoutes(app: Express) {

  const hasStripe = hasStripeKey();
  const stripe = getStripe();

  // P2-047: refund helpers imported from server/lib/refund.ts

  // ═══════════════════════════════════════════════════════════════
  //  FSM TRANSITION ENDPOINT
  // ═══════════════════════════════════════════════════════════════

  app.post("/api/orders/:id/transition", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // SECURITY: derive actor identity & role from authenticated session.
    // NEVER trust client-supplied actorRole/actorId — that allowed any
    // customer to spoof a vendor/admin role and bypass FSM permission checks.
    const currentUser = (req as any).currentUser;
    if (!currentUser) return res.status(401).json({ error: "Unauthenticated" });
    const role = currentUser.role || "customer";
    const actor = currentUser.id;

    // BOLA: ownership check — every actor role must own this order.
    if (role === "customer" && order.customerId !== currentUser.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (role === "driver") {
      const drv = await storage.getDriverByUserId(currentUser.id);
      if (!drv || order.driverId !== drv.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    if (role === "vendor" || role === "laundromat") {
      const vendor = await storage.getVendorByUserId?.(currentUser.id);
      if (!vendor || order.vendorId !== vendor.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    // admins and system roles are not blocked by ownership.

    const TransitionBody = z.object({ newStatus: z.string().min(1), notes: z.string().optional(), lat: z.number().optional(), lng: z.number().optional() }).strip();
    const parsedTransition = TransitionBody.safeParse(req.body);
    if (!parsedTransition.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedTransition.error.issues });
    }
    const { newStatus, notes, lat, lng } = parsedTransition.data;

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
      await processPaymentCapture(order);
      awardLoyaltyPoints(order.customerId, order.id, order.total || 0);
      const referrals_ = await storage.getReferralsByUser(order.customerId);
      const pendingReferral = referrals_.find(r => r.refereeId === order.customerId && r.status === "pending");
      if (pendingReferral) {
        await storage.updateReferral(pendingReferral.id, {
          status: "rewarded",
          completedOrderId: order.id,
          completedAt: ts_,
        });
        const referrer = await storage.getUser(pendingReferral.referrerId);
        if (referrer) {
          await storage.updateUser(referrer.id, { loyaltyPoints: (referrer.loyaltyPoints || 0) + 1000 });
          await storage.createLoyaltyTransaction({ userId: referrer.id, type: "referral", points: 1000, description: "Referral reward: your friend placed their first order!", createdAt: ts_ });
          await notifyAndEmit(referrer.id, null, "loyalty", "Referral Reward!", "You earned 1,000 points because your referral placed their first order.", "/profile");
        }
        const referee = await storage.getUser(order.customerId);
        if (referee) {
          await storage.updateUser(referee.id, { loyaltyPoints: (referee.loyaltyPoints || 0) + 1000 });
          await storage.createLoyaltyTransaction({ userId: referee.id, type: "referral", points: 1000, description: "Referral completion bonus — thanks for your first order!", createdAt: ts_ });
        }
      }
    }

    // Handle cancelled
    if (newStatus === "cancelled") {
      updateData.cancelledAt = ts_;
      // Issue Stripe refund if payment was captured
      if (order.paymentStatus === "captured" || order.paymentStatus === "paid") {
        try {
          const totalCents = Math.round((order.finalPrice ?? order.total ?? 0) * 100);
          if (totalCents > 0) {
            const refundResult = await issueStripeRefundForOrder(order, totalCents, "requested_by_customer", `fsm-cancel-${order.id}-${Date.now()}`);
            if (refundResult?.errorStatus) {
              console.error("[fsm-cancel] Stripe refund failed:", refundResult.error);
              return res.status(500).json({ error: "Refund failed — please contact support" });
            }
          }
          updateData.paymentStatus = "refunded";
        } catch (refundErr) {
          console.error("[fsm-cancel] Stripe refund exception", refundErr);
          return res.status(500).json({ error: "Refund failed — please contact support" });
        }
      } else {
        // Payment was never captured — do NOT mark refunded.
        // Preserve prior paymentStatus (or null if it was never set).
        if (order.paymentStatus) updateData.paymentStatus = order.paymentStatus;
      }
      if (order.vendorId) {
        const vendor = await storage.getVendor(order.vendorId);
        if (vendor && (vendor.currentLoad || 0) > 0) {
          await storage.updateVendor(vendor.id, { currentLoad: (vendor.currentLoad || 0) - 1 });
        }
      }
      if (order.driverId) {
        const driver = await storage.getDriver(order.driverId);
        if (driver) await storage.updateDriver(driver.id, { status: "available" });
      }
      // Delete per-user promo usage on cancellation
      if (order.promoCode) {
        await storage.deletePromoUsageByOrder(order.id);
      }
    }

    // Free resources on delivered
    if (newStatus === "delivered") {
      if (order.driverId) {
        const driver = await storage.getDriver(order.driverId);
        if (driver) await storage.updateDriver(driver.id, { status: "available" });
      }
      if (order.vendorId) {
        const vendor = await storage.getVendor(order.vendorId);
        if (vendor && (vendor.currentLoad || 0) > 0) {
          await storage.updateVendor(vendor.id, { currentLoad: (vendor.currentLoad || 0) - 1 });
        }
      }
    }

    // Assign return driver when ready_for_delivery
    if (newStatus === "ready_for_delivery") {
      const vendorObj = order.vendorId ? await storage.getVendor(order.vendorId) : null;
      if (vendorObj) {
        // P2-025: NYC fallback coords instead of Miami
        const returnDriver = await findBestDriver(vendorObj.lat || 40.7128, vendorObj.lng || -74.0060);
        if (returnDriver) {
          updateData.returnDriverId = returnDriver.id;
          await storage.updateDriver(returnDriver.id, { status: "busy", todayTrips: (returnDriver.todayTrips || 0) + 1 });
          await storage.createOrderEvent({ orderId: order.id, eventType: "return_driver_assigned", description: `${returnDriver.name} assigned for delivery`, actorRole: "system", timestamp: ts_ });
          await notifyAndEmit(returnDriver.userId, order.id, "order_update", "Delivery Pickup", `Pick up clean laundry for delivery.`, `/driver/order/${order.id}`);
        }
      }
    }

    await storage.updateOrder(order.id, updateData);

    // Record in order_status_history
    await storage.createOrderStatusHistory({
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
    await storage.createOrderEvent({
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
        await notifyAndEmit(order.customerId, order.id, "order_update",
          `Order ${STATUS_LABELS[newStatus] || newStatus}`, body, `/orders/${order.id}`);
      }
      if (notifConfig.driver && order.driverId) {
        const driver = await storage.getDriver(order.driverId);
        if (driver) {
          await notifyAndEmit(driver.userId, order.id, "order_update",
            `Order ${STATUS_LABELS[newStatus] || newStatus}`, notifConfig.driver, `/driver/order/${order.id}`);
        }
      }
      if (notifConfig.staff && order.vendorId) {
        // Notify all staff at the vendor
        const staffUsers = [...await storage.getUsersByRole("laundromat"), ...await storage.getUsersByRole("vendor")].filter(u => u.vendorId === order.vendorId);
        // P2-049: replaced .forEach(async ...) with for...of
        for (const s of staffUsers) {
          await notifyAndEmit(s.id, order.id, "order_update",
            `Order ${STATUS_LABELS[newStatus] || newStatus}`, notifConfig.staff!, `/staff`);
        }
      }
    }

    // Emit order status update via Socket.io
    const updatedOrder = await storage.getOrder(order.id);
    emitToOrder(order.id, "order_status_changed", {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: newStatus,
      timestamp: ts_,
      order: updatedOrder,
    });

    // Review request on delivered
    if (newStatus === "delivered") {
      await notifyAndEmit(order.customerId, order.id, "review_request",
        "How was your experience?", "Rate your laundry service to help us improve.", `/orders/${order.id}`);
    }

    res.json(updatedOrder);
  });

  // ── Get FSM info for an order ──
  app.get("/api/orders/:id/fsm", requireAuth(), async (req, res) => {
    // F3: ownership check.
    const __orderId = Number(String(req.params.id));
    const __order = await storage.getOrder(__orderId);
    if (!__order) return res.status(404).json({ error: "Order not found" });
    const __cu = (req as any).currentUser;
    if (!(await canAccessOrder(__order, __cu))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentStatus = order.status;
    const allowed = FSM_TRANSITIONS[currentStatus] || validTransitions[currentStatus] || [];
    const history = await storage.getOrderStatusHistory(order.id);
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
  app.get("/api/orders/:id/status-history", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // F12: full ownership (customer, driver, vendor, admin/manager/support).
    const cu = (req as any).currentUser;
    if (!(await canAccessOrder(order, cu))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const history = await storage.getOrderStatusHistory(Number(String(req.params.id)));
    res.json(history);
  });

}

