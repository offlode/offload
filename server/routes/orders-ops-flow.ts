import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { logAdminAction } from "../audit-helpers";
import { calculateWaitFeeAsync } from "../lib/pricing";
import { pick } from "../lib/util";
import { ORDER_UPDATE_FIELDS } from "../lib/patch-allowlists";
import { TRANSITION_ACTORS } from "../order-fsm";
import { requireAuth } from "../session";
import {
  now,
  notifyUser, notifyOrderUpdate,
  emitToOrder,
  canAccessOrder,
  calculatePredictiveETA,
  validTransitions,
} from "../engines";
import { sendOrderEmail } from "./orders-crud";
import { cancelOrderSideEffects } from "../lib/order-cancel";

export function registerOrdersFlowRoutes(app: Express) {

  // General order update
  app.patch("/api/orders/:id", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: ownership + role check
    const currentUser = (req as any).currentUser;
    if (currentUser.role === "customer" && order.customerId !== currentUser.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (currentUser.role === "driver") {
      const driver = await storage.getDriverByUserId(currentUser.id);
      if (!driver || order.driverId !== driver.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    if (["laundromat","vendor"].includes(currentUser.role)) {
      const vendorProfile = await storage.getVendorByUserId(currentUser.id);
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

    // Role-based field whitelists to prevent unauthorized field modification
    const ROLE_FIELD_WHITELIST: Record<string, string[] | "*"> = {
      // customers/drivers/vendors cannot self-reassign — only admin/manager can set vendorId/driverId
      customer: ["customerNotes", "specialInstructions", "deliveryNotes", "status"],
      driver: ["actualWeight", "overageWeight", "pickupPhotoUrl", "deliveryPhotoUrl", "driverNotes", "driverLocationLat", "driverLocationLng", "estimatedDeliveryTime", "status"],
      vendor: ["processingNotes", "weightVerified", "vendorNotes", "washStartedAt", "washCompletedAt", "qualityScore", "finalWeight", "status"],
      laundromat: ["processingNotes", "weightVerified", "vendorNotes", "washStartedAt", "washCompletedAt", "qualityScore", "finalWeight", "status"],
      staff: ["processingNotes", "weightVerified", "vendorNotes", "washStartedAt", "washCompletedAt", "qualityScore", "finalWeight", "actualWeight", "overageWeight", "status"],
      manager: "*",
      admin: "*",
    };
    const OrderPatch = z.object({
      status: z.string().optional(),
      customerNotes: z.string().optional().nullable(),
      specialInstructions: z.string().optional().nullable(),
      deliveryNotes: z.string().optional().nullable(),
      actualWeight: z.number().optional().nullable(),
      overageWeight: z.number().optional().nullable(),
      pickupPhotoUrl: z.string().optional().nullable(),
      deliveryPhotoUrl: z.string().optional().nullable(),
      driverNotes: z.string().optional().nullable(),
      driverLocationLat: z.number().optional().nullable(),
      driverLocationLng: z.number().optional().nullable(),
      estimatedDeliveryTime: z.string().optional().nullable(),
      processingNotes: z.string().optional().nullable(),
      weightVerified: z.union([z.number(), z.boolean()]).optional().nullable(),
      vendorNotes: z.string().optional().nullable(),
      washStartedAt: z.string().optional().nullable(),
      washCompletedAt: z.string().optional().nullable(),
      qualityScore: z.number().optional().nullable(),
      finalWeight: z.number().optional().nullable(),
      // wave5b-part30: admin/manager assignment fields (was missing, blocked UI)
      vendorId: z.number().optional().nullable(),
      driverId: z.number().optional().nullable(),
    }).strip();
    const orderUpdates = pick(req.body, ORDER_UPDATE_FIELDS);
    const parsedPatch = OrderPatch.safeParse(orderUpdates);
    if (!parsedPatch.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPatch.error.issues });
    }
    const patchData = parsedPatch.data;
    const allowedFields = ROLE_FIELD_WHITELIST[currentUser.role];
    if (allowedFields === undefined) {
      return res.status(403).json({ error: `Role '${currentUser.role}' is not permitted to update orders` });
    }
    if (allowedFields !== "*" && Array.isArray(allowedFields)) {
      const extraFields = Object.keys(patchData).filter(k => !allowedFields.includes(k));
      if (extraFields.length > 0) {
        return res.status(403).json({ error: `Role '${currentUser.role}' cannot update fields: ${extraFields.join(", ")}` });
      }
    }

    // Guard: skip update if no fields remain after whitelist filtering
    if (Object.keys(patchData).length === 0) {
      return res.status(400).json({ error: "No updatable fields in body", code: "EMPTY_PATCH" });
    }

    // wave5b-part30: if vendorId or driverId is set and order is still "pending",
    // also auto-advance the FSM so the driver/vendor flow can begin. Admin UI does
    // not separately call /transition, so without this the order stays stuck pending.
    let effectivePatch: any = { ...patchData };
    if ((currentUser.role === "admin" || currentUser.role === "manager") &&
        order.status === "pending" &&
        (patchData.vendorId != null || patchData.driverId != null) &&
        !patchData.status) {
      effectivePatch.status = "confirmed";
    }

    let updated: any;
    if (effectivePatch.status && effectivePatch.status !== order.status) {
      updated = await storage.transitionOrderStatus(order.id, order.status, effectivePatch.status, {
        eventType: "status_change",
        description: `Order ${effectivePatch.status} (admin assignment)`,
        actorId: currentUser.id,
        actorRole: currentUser.role,
        timestamp: now(),
        orderUpdate: effectivePatch,
      } as any);
      if (currentUser.role === "admin" || currentUser.role === "manager") {
        await logAdminAction(req, { action: "order_status_override", entityType: "order", entityId: order.id, oldValue: { status: order.status }, newValue: { status: effectivePatch.status } });
      }
      emitToOrder(order.id, "order_status_changed", { orderId: order.id, status: effectivePatch.status, fromStatus: order.status, toStatus: effectivePatch.status, order: updated });
    } else {
      updated = await storage.updateOrder(order.id, effectivePatch);
    }
    res.json(updated);
  });


  // ── WS5: Driver failure reporting ──
  app.post("/api/orders/:id/report-issue", requireAuth(["driver"]), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentUser = (req as any).currentUser;
    const driver = await storage.getDriverByUserId(currentUser.id);
    if (!driver || order.driverId !== driver.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const ReportIssueBody = z.object({ issueType: z.string().min(1), description: z.string().min(1), photoUrl: z.string().optional() }).strip();
    const parsedReport = ReportIssueBody.safeParse(req.body);
    if (!parsedReport.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedReport.error.issues });
    }
    const { issueType, description, photoUrl } = parsedReport.data;
    const validIssues = ["customer_unavailable", "wrong_address", "building_access", "safety_concern", "vehicle_issue", "other"];
    if (!issueType || !validIssues.includes(issueType)) {
      return res.status(400).json({ error: `Invalid issue type. Valid: ${validIssues.join(", ")}` });
    }

    const ts = now();

    // Determine appropriate status transition
    const failureStatus = order.status.includes("pickup") ? "pickup_failed" : "delivery_failed";

    await storage.transitionOrderStatus(order.id, order.status, failureStatus, {
      eventType: failureStatus,
      description: `Driver reported issue: ${issueType} — ${description || "No details provided"}`,
      actorId: currentUser.id,
      actorRole: "driver",
      timestamp: ts,
    } as any);

    // Notify customer
    const customer = await storage.getUser(order.customerId);
    if (customer) {
      await notifyUser(customer.id, order.id, "order_update",
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

  // ────────────────────────────────────────────────────────────────────────────
  //  Pickup waiting fee — driver "arrived" / customer "handed off" timestamps
  //  Free first 5 minutes, then $1/min capped at $15. Charged on top of order total.
  // ────────────────────────────────────────────────────────────────────────────
  app.post("/api/orders/:id/driver-arrived", requireAuth(["driver", "admin", "manager"]), async (req, res) => {
    try {
      const order = await storage.getOrder(Number(String(req.params.id)));
      if (!order) return res.status(404).json({ error: "Order not found" });
      const currentUser = (req as any).currentUser;

      // Auth: drivers can only mark their own assigned order; admin/manager bypass
      if (currentUser.role === "driver") {
        const driver = await storage.getDriverByUserId(currentUser.id);
        if (!driver || order.driverId !== driver.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      // Idempotent — return existing timestamp if already set unless ?force=true
      if (order.driverArrivedAt && !req.query.force) {
        return res.json({
          orderId: order.id,
          driverArrivedAt: order.driverArrivedAt,
          alreadyMarked: true,
        });
      }

      const arrivedAt = now();
      await storage.updateOrder(order.id, { driverArrivedAt: arrivedAt } as any);
      await storage.createOrderEvent({
        orderId: order.id,
        eventType: "driver_arrived",
        description: "Driver arrived at pickup location — wait clock started",
        actorId: currentUser.id,
        actorRole: currentUser.role,
        timestamp: arrivedAt,
      });

      // Notify customer to come down (5 min grace)
      try {
        await notifyUser(order.customerId, order.id, "order_update",
          "Your driver has arrived",
          "Please come down within 5 minutes — additional waiting time may incur a fee ($1/min after 5 min, capped at $15).",
          `/orders/${order.id}`);
      } catch (e: any) {
        console.warn("[driver-arrived] notify failed:", e?.message);
      }

      // OD-8: read live wait-fee config from pricing_config
      const wfCfg = await pricingConfig.getWaitFeeConfig();
      // Live update via socket so customer app can show countdown
      try { emitToOrder(order.id, "driver_arrived", { orderId: order.id, arrivedAt, freeMinutes: wfCfg.freeMinutes }); } catch (e) { console.warn("[socket] Failed to emit driver_arrived:", e); }

      res.json({
        orderId: order.id,
        driverArrivedAt: arrivedAt,
        freeMinutes: wfCfg.freeMinutes,
        perMinute: wfCfg.perMinute,
        cap: wfCfg.cap,
      });
    } catch (err: any) {
      console.error("[/api/orders/:id/driver-arrived] error:", err);
      console.error("[driver-arrived] error:", err);
      res.status(500).json({ error: "Failed to mark arrival", code: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/orders/:id/customer-handoff", requireAuth(["driver", "admin", "manager"]), async (req, res) => {
    try {
      const order = await storage.getOrder(Number(String(req.params.id)));
      if (!order) return res.status(404).json({ error: "Order not found" });
      const currentUser = (req as any).currentUser;

      if (currentUser.role === "driver") {
        const driver = await storage.getDriverByUserId(currentUser.id);
        if (!driver || order.driverId !== driver.id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      if (!order.driverArrivedAt) {
        return res.status(400).json({ error: "Cannot mark handoff before driver-arrived. Mark arrival first." });
      }

      const handoffAt = now();
      // OD-8: read live wait-fee config from pricing_config and use async calculator.
      const { waitMinutes, waitFee, config: wfCfg2 } = await calculateWaitFeeAsync(order.driverArrivedAt, handoffAt);

      // Update order: store timestamps, wait minutes, wait fee. Roll wait fee into total.
      const newTotal = Math.round(((order.total || 0) + waitFee) * 100) / 100;
      await storage.updateOrder(order.id, {
        customerHandoffAt: handoffAt,
        pickupWaitMinutes: waitMinutes,
        pickupWaitFee: waitFee,
        total: newTotal,
      } as any);

      await storage.createOrderEvent({
        orderId: order.id,
        eventType: "customer_handoff",
        description: waitFee > 0
          ? `Customer handed off bags — waited ${waitMinutes.toFixed(1)} min, wait fee $${waitFee.toFixed(2)} added`
          : `Customer handed off bags — within ${wfCfg2.freeMinutes}-min grace, no wait fee`,
        details: JSON.stringify({ waitMinutes, waitFee, freeMinutes: wfCfg2.freeMinutes }),
        actorId: currentUser.id,
        actorRole: currentUser.role,
        timestamp: handoffAt,
      });

      // Notify customer of wait fee charge if any
      if (waitFee > 0) {
        try {
          await notifyUser(order.customerId, order.id, "order_update",
            "Wait fee added",
            `A $${waitFee.toFixed(2)} wait fee was added to your order (${waitMinutes.toFixed(1)} min wait, free ${wfCfg2.freeMinutes} min).`,
            `/orders/${order.id}`);
        } catch (e: any) {
          console.warn("[customer-handoff] notify failed:", e?.message);
        }
      }

      try { emitToOrder(order.id, "customer_handoff", { orderId: order.id, handoffAt, waitMinutes, waitFee, newTotal }); } catch (e) { console.warn("[socket] Failed to emit customer_handoff:", e); }

      res.json({
        orderId: order.id,
        driverArrivedAt: order.driverArrivedAt,
        customerHandoffAt: handoffAt,
        waitMinutes,
        waitFee,
        newTotal,
        graceMinutes: wfCfg2.freeMinutes,
      });
    } catch (err: any) {
      console.error("[/api/orders/:id/customer-handoff] error:", err);
      console.error("[customer-handoff] error:", err);
      res.status(500).json({ error: "Failed to mark handoff", code: "INTERNAL_ERROR" });
    }
  });

  // Read-only endpoint — useful for the customer app to render a live countdown.
  app.get("/api/orders/:id/wait-fee", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });
    const currentUser = (req as any).currentUser;
    if (!(await canAccessOrder(order, currentUser))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const handoffAt = order.customerHandoffAt || (order.driverArrivedAt ? now() : null);
    // OD-8: live wait-fee config + async calc.
    const { waitMinutes, waitFee, config: wfReadCfg } = await calculateWaitFeeAsync(order.driverArrivedAt, handoffAt);
    res.json({
      orderId: order.id,
      driverArrivedAt: order.driverArrivedAt,
      customerHandoffAt: order.customerHandoffAt,
      live: !order.customerHandoffAt,
      graceMinutes: wfReadCfg.freeMinutes,
      perMinute: wfReadCfg.perMinute,
      cap: wfReadCfg.cap,
      currentWaitMinutes: waitMinutes,
      currentWaitFee: waitFee,
    });
  });

  // ── WS5: Vendor order actions (accept/reject/complete) ──
  app.post("/api/orders/:id/vendor-action", requireAuth(["laundromat", "vendor", "admin", "manager"]), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentUser = (req as any).currentUser;
    if (["laundromat","vendor"].includes(currentUser.role)) {
      const vendorProfile = await storage.getVendorByUserId(currentUser.id);
      if (!vendorProfile || order.vendorId !== vendorProfile.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const VendorActionBody = z.object({
      action: z.enum(["accept", "reject", "quality_check", "mark_complete"]),
      reason: z.string().optional(),
      estimatedCompletionTime: z.string().optional(),
    }).strip();
    const parsedVA = VendorActionBody.safeParse(req.body);
    if (!parsedVA.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedVA.error.issues });
    }
    const { action, reason, estimatedCompletionTime } = parsedVA.data;
    const ts = now();

    switch (action) {
      case "accept":
        if (order.status !== "at_facility" && order.status !== "at_laundromat") {
          return res.status(400).json({ error: "Order must be at facility to accept" });
        }
        await storage.transitionOrderStatus(order.id, order.status, "processing", {
          eventType: "vendor_accepted",
          description: `Vendor accepted order${estimatedCompletionTime ? `. Estimated completion: ${estimatedCompletionTime}` : ""}`,
          actorId: currentUser.id, actorRole: currentUser.role, timestamp: ts,
        } as any);
        break;

      case "reject":
        await storage.createOrderEvent({
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
        // P2-015: Use transitionOrderStatus with proper fromStatus, not direct updateOrder
        await storage.transitionOrderStatus(order.id, order.status, "ready_for_delivery", {
          eventType: "quality_checked",
          description: "Quality check passed — order ready for delivery",
          actorId: currentUser.id, actorRole: currentUser.role, timestamp: ts,
          orderUpdate: { qualityCheckedAt: ts, washCompletedAt: ts },
        } as any);
        break;

      default:
        return res.status(400).json({ error: "Invalid action. Valid: accept, reject, quality_check" });
    }

    res.json(await storage.getOrder(order.id));
  });


  // ── CANCEL ORDER ──
  app.post("/api/orders/:id/cancel", requireAuth(), async (req, res) => {
    const CancelBody = z.object({ reason: z.string().optional() }).strip();
    const parsedCancel = CancelBody.safeParse(req.body);
    if (!parsedCancel.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedCancel.error.issues });
    }
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentUser = (req as any).currentUser;
    if (!(await canAccessOrder(order, currentUser))) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Can only cancel before washing starts
    const cancellableStatuses = ["pending", "confirmed", "scheduled", "driver_assigned", "driver_en_route_pickup", "arrived_pickup", "pickup_in_progress"];
    if (!cancellableStatuses.includes(order.status)) {
      return res.status(400).json({ error: "Order cannot be cancelled at this stage. Please file a dispute instead." });
    }

    const ts_ = now();

    // P2-014: Transition status BEFORE issuing refund so FSM state is consistent
    // if Stripe call fails. Use orderId-derived idempotency key.
    try {
      await storage.transitionOrderStatus(order.id, order.status, "cancelled", {
        eventType: "cancelled",
        description: parsedCancel.data.reason || "Order cancelled by customer",
        actorId: currentUser.id,
        actorRole: currentUser.role,
        timestamp: ts_,
        orderUpdate: { cancelledAt: ts_ },
      } as any);
    } catch (transitionErr: any) {
      if (transitionErr?.message?.includes("order_status_conflict")) {
        return res.status(409).json({ error: "Order status has changed — please retry" });
      }
      throw transitionErr;
    }

    // P3-004: shared cancel side-effects (refund, loyalty restore, capacity, driver, promo)
    await cancelOrderSideEffects(order, ts_);

    await notifyOrderUpdate(order, "Order Cancelled", "Your order has been cancelled and a full refund has been initiated.");

    res.json(await storage.getOrder(order.id));
  });

  // ── RESCHEDULE ORDER ──
  app.post("/api/orders/:id/reschedule", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentUser = (req as any).currentUser;
    // Only order owner or admin/manager can reschedule
    if (currentUser.role === "customer" && order.customerId !== currentUser.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!["customer", "admin", "manager"].includes(currentUser.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Only allow reschedule before physical pickup
    const reschedulableStatuses = ["confirmed", "scheduled", "driver_assigned", "driver_en_route_pickup"];
    if (!reschedulableStatuses.includes(order.status)) {
      return res.status(400).json({ error: "Order cannot be rescheduled at this stage. Only orders before pickup can be rescheduled." });
    }

    const RescheduleBody = z.object({ pickupDate: z.string().min(1), pickupTimeSlot: z.string().min(1) }).strip();
    const parsedReschedule = RescheduleBody.safeParse(req.body);
    if (!parsedReschedule.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedReschedule.error.issues });
    }
    const { pickupDate, pickupTimeSlot } = parsedReschedule.data;

    const ts_ = now();
    const oldPickup = order.scheduledPickup;
    const oldTimeWindow = order.pickupTimeWindow;

    await storage.updateOrder(order.id, {
      scheduledPickup: pickupDate,
      pickupTimeWindow: pickupTimeSlot,
      updatedAt: ts_,
    });

    // Audit trail event
    await storage.createOrderEvent({
      orderId: order.id,
      eventType: "reschedule",
      description: `Order rescheduled: pickup changed to ${pickupDate} (${pickupTimeSlot})`,
      details: JSON.stringify({
        type: "reschedule",
        previousPickup: oldPickup,
        previousTimeWindow: oldTimeWindow,
        newPickup: pickupDate,
        newTimeSlot: pickupTimeSlot,
        rescheduledBy: currentUser.id,
        rescheduledByRole: currentUser.role,
      }),
      actorId: currentUser.id,
      actorRole: currentUser.role,
      timestamp: ts_,
    });

    // Notify assigned driver if any
    if (order.driverId) {
      const driver = await storage.getDriver(order.driverId);
      if (driver) {
        await notifyUser(driver.userId, order.id, "driver_update",
          "Pickup Rescheduled",
          `Order ${order.orderNumber} has been rescheduled. New pickup: ${pickupDate} (${pickupTimeSlot}).`,
          `/orders/${order.id}`);
      }
    }

    // Notify customer if rescheduled by admin/manager
    if (currentUser.role !== "customer") {
      await notifyUser(order.customerId, order.id, "order_update",
        "Pickup Rescheduled",
        `Your order ${order.orderNumber} has been rescheduled. New pickup: ${pickupDate} (${pickupTimeSlot}).`,
        `/orders/${order.id}`);
    }

    res.json(await storage.getOrder(order.id));
  });

  // ── PREDICTIVE ETA ──
  app.get("/api/orders/:id/eta", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });
    // F9: ownership check.
    {
      const __cu = (req as any).currentUser;
      if (!(await canAccessOrder(order, __cu))) return res.status(403).json({ error: "Forbidden" });
    }
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
}
