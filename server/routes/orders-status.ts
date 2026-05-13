import type { Express } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage, db } from "../storage";
import { logAdminAction } from "../audit-helpers";
import { TRANSITION_ACTORS } from "../order-fsm";
import { requireAuth } from "../session";
import {
  now,
  notifyUser, notifyOrderUpdate, sendOrderStatusSMS,
  emitToOrder, notifyAndEmit,
  processPaymentCapture,
  awardLoyaltyPoints,
  findBestDriver,
  validTransitions,
} from "../engines";
import { issueStripeRefundForOrder, sendOrderEmail } from "./orders-crud";

export function registerOrdersStatusRoutes(app: Express) {

  // ── UPDATE ORDER STATUS — Step-locked transitions ──
  app.patch("/api/orders/:id/status", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: ownership check
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
      // Vendor can only see orders assigned to their vendor profile
      const vendorProfile = await storage.getVendorByUserId(currentUser.id);
      if (!vendorProfile || order.vendorId !== vendorProfile.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    const StatusBody = z.object({
      status: z.string().min(1),
      description: z.string().optional(),
      actorId: z.number().optional(),
      actorRole: z.string().optional(),
      photoUrl: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      details: z.string().optional(),
      driverId: z.number().optional(),
    }).strip();
    const parsedBody = StatusBody.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedBody.error.issues });
    }
    const { status, description, actorId, actorRole, photoUrl, lat, lng, details, driverId: reqDriverId } = parsedBody.data;
    const allowed = validTransitions[order.status];
    if (!allowed || !allowed.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from '${order.status}' to '${status}'`,
        allowed: allowed || [],
      });
    }

    // Security: enforce actor roles per transition (from order-fsm.ts TRANSITION_ACTORS)
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

    // WS7: Mandatory photo enforcement at key handoff points
    const PHOTO_REQUIRED_TRANSITIONS = [
      "picked_up",           // Driver must photo the bags at pickup
      "at_facility",         // Photo of bags arriving at laundromat
      "ready_for_delivery",  // Photo of cleaned/folded items
      "delivered",           // Proof of delivery photo
    ];
    if (PHOTO_REQUIRED_TRANSITIONS.includes(status)) {
      const existingPhotos = await storage.getPhotosByOrder(order.id);
      const hasPhotoForStep = existingPhotos.some(
        (p: any) => p.type === status || p.type === `${status}_proof`
      ) || photoUrl; // Also accept inline photoUrl
      // In production, enforce photo requirement
      if (!hasPhotoForStep && process.env.ENFORCE_PHOTOS === "true") {
        return res.status(400).json({
          error: `Photo proof required for '${status}' transition`,
          hint: `Upload a photo to /api/orders/${order.id}/photos with type='${status}_proof' before updating status`,
        });
      }
    }

    const ts_ = now();
    const updateData: any = { status };

    // Save driverId when assigning driver
    if (status === "driver_assigned" && reqDriverId) {
      updateData.driverId = reqDriverId;
    }

    // Set timestamp fields based on transition (using new FSM state names)
    if (status === "picked_up") updateData.pickedUpAt = ts_;
    if (status === "at_facility") updateData.arrivedLaundromatAt = ts_;
    if (status === "processing") updateData.washStartedAt = ts_;
    if (status === "ready_for_delivery") updateData.washCompletedAt = ts_;
    if (status === "driver_en_route_delivery") updateData.outForDeliveryAt = ts_;
    if (status === "at_laundromat") updateData.arrivedLaundromatAt = ts_;
    if (status === "washing") updateData.washStartedAt = ts_;
    if (status === "wash_complete") updateData.washCompletedAt = ts_;
    if (status === "out_for_delivery") updateData.outForDeliveryAt = ts_;
    if (status === "delivered") {
      updateData.deliveredAt = ts_;
      // P2-016: payment capture + loyalty + referral moved AFTER the atomic
      // transitionOrderStatus call below. Only set timestamp fields here.
    }
    if (status === "cancelled") {
      updateData.cancelledAt = ts_;
      // Wave 2: only mark "refunded" if there was actually something to refund.
      // If a real Stripe charge was captured, attempt a real refund. Otherwise
      // preserve current paymentStatus ("pending" / "failed" / etc.).
      if (order.paymentStatus === "captured" || order.paymentStatus === "paid") {
        const totalCents = Math.round(((order as any).finalPrice ?? order.total ?? 0) * 100);
        if (totalCents > 0) {
          try {
            const refundResult: any = await issueStripeRefundForOrder(
              order,
              totalCents,
              "requested_by_customer",
              `patch-cancel-${order.id}-${Date.now()}`
            );
            if (refundResult && "errorStatus" in refundResult) {
              return res.status(refundResult.errorStatus as number).json({
                error: refundResult.error || "Refund failed",
              });
            }
            updateData.paymentStatus = refundResult?.paymentStatus || "refunded";
          } catch (err: any) {
            console.error("[PATCH cancel] Stripe refund failed:", err?.message);
            return res.status(500).json({ error: "Refund failed; cancel aborted." });
          }
        } else {
          updateData.paymentStatus = "refunded";
        }
      }
      // P2-023: Release vendor capacity with atomic SQL
      if (order.vendorId) {
        await db.update(schema.vendors)
          .set({ currentLoad: sql`GREATEST(0, COALESCE(${schema.vendors.currentLoad}, 0) - 1)` } as any)
          .where(eq(schema.vendors.id, order.vendorId));
      }
      // Free driver
      if (order.driverId) {
        const driver = await storage.getDriver(order.driverId);
        if (driver) {
          await storage.updateDriver(driver.id, { status: "available" });
        }
      }
      // Delete per-user promo usage on cancellation
      if (order.promoCode) {
        await storage.deletePromoUsageByOrder(order.id);
      }
    }

    // If photo provided (pickup proof, delivery proof)
    if (photoUrl) {
      if (status === "picked_up") updateData.pickupPhotoUrl = photoUrl;
      if (status === "delivered") updateData.deliveryPhotoUrl = photoUrl;
    }

    // P2-016: atomic transition FIRST; catch conflict for 409 response
    try {
      await storage.transitionOrderStatus(order.id, order.status, status, {
        eventType: status,
        description: description || `Order status: ${status.replace(/_/g, " ")}`,
        details: details ? (typeof details === "string" ? details : JSON.stringify(details)) : undefined,
        actorId,
        actorRole: actorRole || "system",
        photoUrl,
        lat,
        lng,
        timestamp: ts_,
        orderUpdate: updateData,
      } as any);
    } catch (transitionErr: any) {
      if (transitionErr?.message?.includes("order_status_conflict") || transitionErr?.code === "23505") {
        return res.status(409).json({ error: "Order status has changed — please retry" });
      }
      throw transitionErr;
    }

    // P2-016: Side-effects AFTER successful atomic status transition
    if (status === "delivered") {
      await processPaymentCapture(order);
      awardLoyaltyPoints(order.customerId, order.id, order.total || 0);
      // P2-030: atomic referral UPDATE — only proceed if row returned
      const referrals_ = await storage.getReferralsByUser(order.customerId);
      const pendingReferral = referrals_.find(r => r.refereeId === order.customerId && r.status === "pending");
      if (pendingReferral) {
        const [claimed] = await db.update(schema.referrals)
          .set({ status: "rewarded", completedOrderId: order.id, completedAt: ts_ } as any)
          .where(sql`${schema.referrals.id} = ${pendingReferral.id} AND ${schema.referrals.status} = 'pending'`)
          .returning();
        if (claimed) {
          const referrer = await storage.getUser(pendingReferral.referrerId);
          if (referrer) {
            await storage.updateUser(referrer.id, { loyaltyPoints: (referrer.loyaltyPoints || 0) + 1000 });
            await storage.createLoyaltyTransaction({ userId: referrer.id, type: "referral", points: 1000, description: "Referral reward: your friend placed their first order!", createdAt: ts_ });
            await notifyUser(referrer.id, null, "loyalty", "Referral Reward!", "You earned 1,000 points because your referral placed their first order.", "/profile");
          }
          const referee = await storage.getUser(order.customerId);
          if (referee) {
            await storage.updateUser(referee.id, { loyaltyPoints: (referee.loyaltyPoints || 0) + 1000 });
            await storage.createLoyaltyTransaction({ userId: referee.id, type: "referral", points: 1000, description: "Referral completion bonus — thanks for your first order!", createdAt: ts_ });
          }
        }
      }
    }

    if (currentUser.role === "admin" || currentUser.role === "manager") {
      await logAdminAction(req, { action: "order_status_override", entityType: "order", entityId: order.id, oldValue: { status: order.status }, newValue: { status } });
    }
    emitToOrder(order.id, "order_status_changed", {
      orderId: order.id,
      status,
      fromStatus: order.status,
      toStatus: status,
      timestamp: ts_,
    });

    // WS3: Send email notification on status change
    const STATUS_LABELS: Record<string, string> = {
      "driver_assigned": "Driver Assigned",
      "driver_en_route_pickup": "Driver En Route to You",
      "picked_up": "Laundry Picked Up",
      "at_facility": "Arrived at Laundromat",
      "processing": "Washing In Progress",
      "ready_for_delivery": "Ready for Delivery",
      "driver_en_route_delivery": "Out for Delivery",
      "delivered": "Delivered",
      "pickup_failed": "Pickup Issue",
      "delivery_failed": "Delivery Issue",
    };
    const orderCustomer = await storage.getUser(order.customerId);
    if (orderCustomer?.email) {
      await sendOrderEmail(order, status);
    }

    // Notify customer on key transitions
    const statusMessages: Record<string, string> = {
      pickup_in_progress: "Your driver is on the way to pick up your laundry.",
      picked_up: "Your laundry has been picked up!",
      at_laundromat: "Your laundry has arrived at the facility.",
      washing: "Your laundry is being washed.",
      wash_complete: "Your laundry is done washing!",
      ready_for_delivery: "Your laundry is ready for delivery.",
      out_for_delivery: "Your clean laundry is on the way back to you!",
      delivered: "Your laundry has been delivered! Rate your experience.",
      cancelled: "Your order has been cancelled. A refund has been initiated.",
    };

    if (statusMessages[status]) {
      await notifyOrderUpdate(order, `Order ${status.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}`, statusMessages[status]);
      await sendOrderStatusSMS(order, status);
    }

    // Process custom notification rules
    try {
      const customRules = await storage.getNotificationRulesByTrigger(status);
      for (const rule of customRules) {
        if (!rule.isActive) continue;
        let recipientUserId: number | null = null;
        if (rule.audience === "customer") {
          recipientUserId = order.customerId;
        } else if (rule.audience === "driver" && order.driverId) {
          const drv = await storage.getDriver(order.driverId);
          recipientUserId = drv?.userId || null;
        } else if (rule.audience === "vendor" && order.vendorId) {
          const v = await storage.getVendor(order.vendorId);
          recipientUserId = (v as any)?.userId || null;
        } else if (rule.audience === "admin") {
          const admins = await storage.getUsersByRole("admin");
          recipientUserId = admins[0]?.id || 1;
        }
        if (!recipientUserId) continue;

        const orderCustomerForRule = await storage.getUser(order.customerId);
        const vars: Record<string, string> = {
          orderNumber: (order as any).orderNumber || `#${order.id}`,
          customerName: orderCustomerForRule?.name || "Customer",
          status: status,
          statusLabel: STATUS_LABELS[status] || status,
        };
        const renderTemplate = (t: string) => t.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => vars[k] || `{{${k}}}`);
        const title = renderTemplate(rule.titleTemplate);
        const body = renderTemplate(rule.bodyTemplate);

        let channels: string[] = [];
        try { channels = JSON.parse(rule.channels); } catch { channels = ["in_app"]; }

        if (channels.includes("in_app") || channels.includes("push")) {
          await notifyAndEmit(recipientUserId, order.id, "custom_rule", title, body, `/orders/${order.id}`);
        }
        if (channels.includes("email")) {
          const recipientUser = await storage.getUser(recipientUserId);
          if (recipientUser?.email) {
            try { await sendOrderEmail(order, status); } catch (err) { console.error("[notif-rule email]", err); }
          }
        }
        // TODO(sms-launch): re-enable when SMS provider integration ships
      }
    } catch (ruleErr) {
      console.error("[notif-rules] Error processing custom notification rules:", ruleErr);
    }

    // When delivered, send review request
    if (status === "delivered") {
      await notifyUser(order.customerId, order.id, "review_request",
        "How was your experience?",
        "Rate your laundry service to help us improve.",
        `/orders/${order.id}`
      );
      // Free up driver
      if (order.driverId) {
        const driver = await storage.getDriver(order.driverId);
        if (driver) await storage.updateDriver(driver.id, { status: "available" });
      }
      // P2-023: Free vendor capacity with atomic SQL
      if (order.vendorId) {
        await db.update(schema.vendors)
          .set({ currentLoad: sql`GREATEST(0, COALESCE(${schema.vendors.currentLoad}, 0) - 1)` } as any)
          .where(eq(schema.vendors.id, order.vendorId));
      }
    }

    // When ready_for_delivery, assign return driver
    if (status === "ready_for_delivery") {
      const vendorObj = order.vendorId ? await storage.getVendor(order.vendorId) : null;
      if (vendorObj) {
        // P2-025: NYC fallback coords instead of Miami
        const returnDriver = await findBestDriver(vendorObj.lat || 40.7128, vendorObj.lng || -74.0060);
        if (returnDriver) {
          await storage.updateOrder(order.id, { returnDriverId: returnDriver.id });
          await storage.updateDriver(returnDriver.id, { status: "busy", todayTrips: (returnDriver.todayTrips || 0) + 1 });
          await storage.createOrderEvent({
            orderId: order.id,
            eventType: "return_driver_assigned",
            description: `${returnDriver.name} assigned for delivery`,
            actorRole: "system",
            timestamp: now(),
          });
          await notifyUser(returnDriver.userId, order.id, "order_update",
            "Delivery Pickup",
            `Pick up clean laundry from ${vendorObj.name} for delivery.`,
            `/driver/order/${order.id}`
          );
        }
      }
    }

    res.json(await storage.getOrder(order.id));
  });
}
