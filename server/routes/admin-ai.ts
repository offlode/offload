import type { Express } from "express";
import { z } from "zod";
import { insertVendorPayoutSchema } from "@shared/schema";
import { storage } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { logAdminAction } from "../audit-helpers";
import { isAdminOrManager, requireAuth } from "../session";
import { now, canAccessOrder, detectIntent, generateAIResponse } from "../engines";

export function registerAdminAiRoutes(app: Express) {
  // ─────────────────────────────────────────────────────────
  //  MANAGER ENDPOINTS (vendor-specific)
  // ─────────────────────────────────────────────────────────

  app.get("/api/manager/earnings", requireAuth(["admin", "manager"]), async (req, res) => {
    const vendorId = Number(req.query.vendorId);
    if (!vendorId) {
      const allVendors = await storage.getVendors();
      const allOrders = await storage.getOrders();
      const delivered = allOrders.filter(o => o.status === "delivered");
      const totalRevenue = delivered.reduce((sum, o) => sum + (o.total || 0), 0);
      const totalPayouts = delivered.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);
      const totalDriverPayouts = delivered.reduce((sum, o) => sum + (o.driverPayout || 0), 0);

      const vendorBreakdown = allVendors.map(v => {
        const vendorOrders = delivered.filter(o => o.vendorId === v.id);
        return {
          vendorId: v.id,
          vendorName: v.name,
          orders: vendorOrders.length,
          revenue: vendorOrders.reduce((sum, o) => sum + (o.total || 0), 0),
          payout: vendorOrders.reduce((sum, o) => sum + (o.vendorPayout || 0), 0),
          pending: v.pendingPayout || 0,
        };
      });

      return res.json({
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalVendorPayouts: Math.round(totalPayouts * 100) / 100,
        totalDriverPayouts: Math.round(totalDriverPayouts * 100) / 100,
        platformRevenue: Math.round((totalRevenue - totalPayouts - totalDriverPayouts) * 100) / 100,
        vendorBreakdown,
      });
    }

    const vendor = await storage.getVendor(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const vendorOrders = await storage.getOrdersByVendor(vendorId);
    const delivered = vendorOrders.filter(o => o.status === "delivered");
    const totalRevenue = delivered.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalPayout = delivered.reduce((sum, o) => sum + (o.vendorPayout || 0), 0);

    res.json({
      vendorId,
      vendorName: vendor.name,
      totalOrders: vendorOrders.length,
      completedOrders: delivered.length,
      activeOrders: vendorOrders.filter(o => !["delivered", "cancelled"].includes(o.status)).length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalPayout: Math.round(totalPayout * 100) / 100,
      pendingPayout: vendor.pendingPayout || 0,
      rating: vendor.rating,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  DRIVER EARNINGS
  // ─────────────────────────────────────────────────────────

  app.get("/api/driver/earnings", requireAuth(["driver", "admin", "manager"]), async (req, res) => {
    const cuE = (req as any).currentUser;
    if (cuE.role === "driver") {
      const myDriver = await storage.getDriverByUserId(cuE.id);
      const requestedId = Number(req.query.driverId);
      if (myDriver && requestedId && requestedId !== myDriver.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    const driverId = Number(req.query.driverId);
    if (!driverId) return res.status(400).json({ error: "driverId required" });

    const driver = await storage.getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const driverOrders = await storage.getOrdersByDriver(driverId);
    const delivered = driverOrders.filter(o => o.status === "delivered");
    const todayDelivered = delivered.filter(o => {
      if (!o.deliveredAt) return false;
      return new Date(o.deliveredAt).toDateString() === new Date().toDateString();
    });

    const todayTrips = driver.todayTrips || 0;
    const perTrip = driver.payoutPerTrip || 8.50;
    const calculatedTodayEarnings = todayDelivered.length * perTrip;
    const todayEarnings = calculatedTodayEarnings > 0 ? calculatedTodayEarnings : todayTrips * perTrip;
    const todayTips = todayTrips > 0 ? Math.round(todayTrips * 2.5 * 100) / 100 : 0;

    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weeklyData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayDelivered = delivered.filter(o => {
        if (!o.deliveredAt) return false;
        return new Date(o.deliveredAt).toDateString() === d.toDateString();
      });
      weeklyData.push({
        day: dayNames[d.getDay()],
        earnings: dayDelivered.length * perTrip,
        trips: dayDelivered.length,
      });
    }
    const finalWeeklyData = weeklyData;
    const weeklyDataMessage = weeklyData.some(w => w.earnings > 0) ? undefined : "Insufficient data: no completed driver trips in the last 7 days.";

    const tripHistory = delivered.slice(0, 10).map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      pickupAddress: o.pickupAddress || "Miami, FL",
      deliveryAddress: o.deliveryAddress || "Miami, FL",
      earnings: perTrip,
      tip: o.tip || 0,
      timestamp: o.deliveredAt || o.createdAt || new Date().toISOString(),
      status: "completed",
    }));

    const bestDayEarnings = finalWeeklyData.reduce((max, d) => Math.max(max, d.earnings), 0);
    const avgPerTrip = (driver.completedTrips || 0) > 0
      ? Math.round(((driver.totalEarnings || 0) / (driver.completedTrips || 1)) * 100) / 100
      : perTrip;

    res.json({
      driverId,
      driverName: driver.name,
      totalTrips: driver.completedTrips || 0,
      todayTrips,
      todayEarnings,
      todayTips,
      totalEarnings: driver.totalEarnings || 0,
      pendingPayout: driver.pendingPayout || 0,
      avgPerTrip,
      bestDayEarnings,
      weeklyData: finalWeeklyData,
      weeklyDataMessage,
      tripHistory,
      nextPayoutDate: new Date(Date.now() + (5 - new Date().getDay() + 7) % 7 * 86400000 || 7 * 86400000).toISOString(),
      rating: driver.rating,
      onTimePickupRate: driver.onTimePickupRate,
      avgPickupTime: driver.avgPickupTime,
    });
  });

  // ─────────────────────────────────────────────────────────
  //  VENDOR PAYOUT MANAGEMENT
  // ─────────────────────────────────────────────────────────

  app.get("/api/vendor-payouts/:vendorId", requireAuth(["admin", "manager"]), async (req, res) => {
    const vendorId = Number(String(req.params.vendorId));
    const vendor = await storage.getVendor(vendorId);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });
    const payouts = await storage.getVendorPayouts(vendorId);
    res.json({
      vendorId,
      vendorName: vendor.name,
      pendingPayout: vendor.pendingPayout,
      totalEarnings: vendor.totalEarnings,
      payouts,
    });
  });

  app.post("/api/vendor-payouts", requireAuth(["admin", "manager"]), async (req, res) => {
    const PayoutBody = z.object({
      vendorId: z.number(),
      amount: z.number(),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      ordersCount: z.number().optional(),
    }).strip();
    const parsedPayout = PayoutBody.safeParse(req.body);
    if (!parsedPayout.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPayout.error.issues });
    }
    const { vendorId, amount, periodStart, periodEnd, ordersCount } = parsedPayout.data;
    const payout = await storage.createVendorPayout({
      vendorId,
      amount,
      status: "pending",
      periodStart: periodStart || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      periodEnd: periodEnd || now(),
      ordersCount: ordersCount || 0,
      createdAt: now(),
    });
    logAdminAction(req, { action: "vendor_payout.create", entityType: "vendor_payout", entityId: payout.id, newValue: { vendorId, amount } });
    res.status(201).json(payout);
  });

  app.patch("/api/vendor-payouts/:id", requireAuth(["admin"]), async (req, res) => {
    const payoutId = Number(String(req.params.id));
    const PayoutPatch = insertVendorPayoutSchema.partial();
    const parsed = PayoutPatch.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const beforePayout = await storage.getVendorPayout(payoutId);
    const updated = await storage.updateVendorPayout(payoutId, parsed.data);
    if (!updated) return res.status(404).json({ error: "Payout not found" });
    logAdminAction(req, { action: "vendor_payout.update", entityType: "vendor_payout", entityId: payoutId, oldValue: { status: beforePayout?.status }, newValue: parsed.data });

    if (parsed.data.status === "completed") {
      const payout = updated;
      const vendor = await storage.getVendor(payout.vendorId);
      if (vendor) {
        await storage.updateVendor(vendor.id, {
          pendingPayout: Math.max(0, (vendor.pendingPayout || 0) - payout.amount),
        });
      }
    }

    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  AI CHAT (enhanced endpoint with actions)
  // ─────────────────────────────────────────────────────────

  app.post("/api/ai/chat", requireAuth(), async (req, res) => {
    const AiChatBody = z.object({ message: z.string().min(1), sessionId: z.number().optional(), orderId: z.number().optional() }).strip();
    const parsedAiChat = AiChatBody.safeParse(req.body);
    if (!parsedAiChat.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedAiChat.error.issues });
    }
    const { message, sessionId, orderId } = parsedAiChat.data;
    const currentUser = (req as any).currentUser;
    const userId = currentUser.id;
    if (!message) return res.status(400).json({ error: "message is required" });

    const intent = detectIntent(message);
    const { response, resolved, escalate } = await generateAIResponse(intent, userId, message);
    const ts_ = now();

    let session;
    if (sessionId) {
      session = await storage.getChatSession(Number(sessionId));
      if (session && session.userId !== userId && !isAdminOrManager(currentUser)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    if (!session) {
      const newMessages = [
        { role: "user", content: message, timestamp: ts_ },
        { role: "assistant", content: response, timestamp: ts_, intent },
      ];
      session = await storage.createChatSession({
        userId, orderId: orderId || undefined,
        status: resolved ? "resolved" : escalate ? "escalated" : "active",
        topic: intent, aiResolved: !!resolved,
        messagesJson: JSON.stringify(newMessages), createdAt: ts_,
        resolvedAt: resolved ? ts_ : undefined,
      });
    } else {
      let existingMessages: any[] = [];
      try { existingMessages = session.messagesJson ? JSON.parse(session.messagesJson) : []; } catch (e) { console.warn("[chat] Failed to parse session messages:", e); }
      existingMessages.push({ role: "user", content: message, timestamp: ts_ });
      existingMessages.push({ role: "assistant", content: response, timestamp: ts_, intent });
      session = await storage.updateChatSession(session.id, {
        status: resolved ? "resolved" : escalate ? "escalated" : "active",
        aiResolved: !!resolved,
        messagesJson: JSON.stringify(existingMessages),
        resolvedAt: resolved ? ts_ : undefined,
      }) || session;
    }

    const actions: any[] = [];
    if (intent === "order_status") {
      const activeOrders = (await storage.getOrdersByCustomer(userId)).filter(o => !["delivered","cancelled"].includes(o.status));
      if (activeOrders.length > 0) actions.push({ type: "view_order", data: { orderId: activeOrders[0].id } });
    }
    if (intent === "pricing") actions.push({ type: "navigate", data: { path: "/schedule" } });
    if (escalate) actions.push({ type: "escalate", data: { reason: intent } });

    res.json({ reply: response, sessionId: session.id, actions, intent, resolved, escalated: escalate });
  });

  // ─────────────────────────────────────────────────────────
  //  BLE SCALE WEIGHT RECORDING
  // ─────────────────────────────────────────────────────────

  app.post("/api/orders/:id/ble-weight", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    const currentUser = (req as any).currentUser;
    if (!(await canAccessOrder(order, currentUser))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const BleBody = z.object({
      weight: z.number(),
      weightType: z.enum(["dirty", "clean"]),
      deviceName: z.string().optional(),
      rawReading: z.number().optional(),
      taredReading: z.number().optional(),
    }).strip();
    const parsedBle = BleBody.safeParse(req.body);
    if (!parsedBle.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedBle.error.issues });
    }
    const { weight, deviceName, rawReading, taredReading, weightType } = parsedBle.data;

    const updateData: any = {};
    const ts_ = now();

    if (weightType === "dirty") {
      updateData.dirtyWeight = weight;
      updateData.intakeWeight = weight;
    } else if (weightType === "clean") {
      updateData.cleanWeight = weight;
      updateData.outputWeight = weight;
      if (order.dirtyWeight) {
        updateData.weightDifference = Math.round((order.dirtyWeight - weight) * 100) / 100;
      }
      if (order.tierMaxWeight) {
        const overage = Math.max(0, weight - order.tierMaxWeight);
        const bleBagInfo = order.tierName ? await pricingConfig.getBagPrice(order.tierName as string) : null;
        const overageRate = bleBagInfo?.overageRate ?? 2.50;
        updateData.overageWeight = Math.round(overage * 100) / 100;
        updateData.overageCharge = Math.round(overage * overageRate * 100) / 100;
        const addOnsTotal = (await storage.getOrderAddOns(order.id)).reduce((sum, a) => sum + a.total, 0);
        updateData.finalPrice = Math.round(((order.tierFlatPrice || 0) + updateData.overageCharge + addOnsTotal - (order.discount || 0) + (order.tax || 0) + (order.deliveryFee || 0)) * 100) / 100;
      }
    }

    await storage.updateOrder(order.id, updateData);
    await storage.createOrderEvent({
      orderId: order.id,
      eventType: weightType === "dirty" ? "dirty_weight_recorded" : "clean_weight_recorded",
      description: `${weightType === "dirty" ? "Dirty" : "Clean"} weight: ${weight} lbs (BLE scale: ${deviceName || "unknown"})`,
      details: JSON.stringify({ weight, deviceName, rawReading, taredReading, source: "ble_scale" }),
      actorId: currentUser.id, actorRole: currentUser.role, timestamp: ts_,
    });

    res.json(await storage.getOrder(order.id));
  });
}
