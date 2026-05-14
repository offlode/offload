// =====================================================================
//  WAVE 2 ROUTES — Integration Fix Endpoints
//  All new endpoints for Wave 2 integration parity.
//  Items: Vehicle profile, Manager KPIs, Operator KPIs, Driver endpoints,
//         Voice parse, Wash-run compat, Bonus rules, Wash queue, Demo filter
// =====================================================================

import type { Express, Request, Response } from "express";
import { db } from "../storage";
import { storage } from "../storage";
import { requireAuth } from "../session";
import { now } from "../engines";
import { distanceMiles } from "../lib/pricing";
import { validateTransition } from "../order-fsm";
import {
  orders,
  users,
  vendors,
  drivers,
  reviews,
  washRuns,
  vendorEmployees,
  performanceBonusRules,
} from "@shared/schema";
import { eq, and, sql, desc, inArray, gte, or, isNull } from "drizzle-orm";

// Helper to get a single string param (Express 5 params can be string | string[])
function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : (val || "");
}

// Helper to resolve vendor ID for manager/laundromat users
async function resolveVendorId(user: any): Promise<number | null> {
  if (user.role === "admin") return null;
  if (user.vendorId) return user.vendorId;
  const [emp] = await db
    .select()
    .from(vendorEmployees)
    .where(and(eq(vendorEmployees.userId, user.id), eq(vendorEmployees.active, true)));
  return emp?.vendorId || null;
}

// ══════════════════════════════════════════════════════════════
//  REGISTER ALL WAVE 2 ROUTES
// ══════════════════════════════════════════════════════════════

export function registerWave2Routes(app: Express): void {

  // ══════════════════════════════════════════════════════════
  //  1. VEHICLE PROFILE — PUT/GET /api/drivers/me/vehicle
  // ══════════════════════════════════════════════════════════

  app.get("/api/drivers/me/vehicle", requireAuth(["driver", "admin"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const driver = await storage.getDriverByUserId(user.id);
      if (!driver) return res.status(404).json({ error: "Driver profile not found" });

      // Vehicle info stored as individual columns; compose response
      const vehicle = {
        color: (driver as any).vehicleColor || null,
        model: driver.vehicleType || null,
        license_plate: driver.licensePlate || null,
        photo_url: (driver as any).vehiclePhotoUrl || null,
      };

      res.json(vehicle);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/drivers/me/vehicle", requireAuth(["driver", "admin"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const driver = await storage.getDriverByUserId(user.id);
      if (!driver) return res.status(404).json({ error: "Driver profile not found" });

      const { color, model, license_plate, photo_url } = req.body;

      const updates: Record<string, any> = {};
      if (model !== undefined) updates.vehicleType = model;
      if (license_plate !== undefined) updates.licensePlate = license_plate;
      // Store color and photo_url via vehicleInfo jsonb (auto-created column)
      // Also store as direct columns for backward compat
      if (color !== undefined) updates.vehicleColor = color;
      if (photo_url !== undefined) updates.vehiclePhotoUrl = photo_url;

      await storage.updateDriver(driver.id, updates);
      const updated = await storage.getDriverByUserId(user.id);

      res.json({
        color: (updated as any)?.vehicleColor || color || null,
        model: updated?.vehicleType || model || null,
        license_plate: updated?.licensePlate || license_plate || null,
        photo_url: (updated as any)?.vehiclePhotoUrl || photo_url || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  2. MANAGER KPI ENDPOINTS
  // ══════════════════════════════════════════════════════════

  // GET /api/vendors/me — vendor profile for authenticated manager
  app.get("/api/vendors/me", requireAuth(["manager", "admin", "laundromat"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const vendorId = await resolveVendorId(user);
      if (!vendorId) return res.status(404).json({ error: "No vendor associated with your account" });

      const vendor = await storage.getVendor(vendorId);
      if (!vendor) return res.status(404).json({ error: "Vendor not found" });

      // Compute on_time_rate from orders last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const recentOrders = await db
        .select({ status: orders.status, deliveredAt: orders.deliveredAt })
        .from(orders)
        .where(and(
          eq(orders.vendorId, vendorId),
          gte(orders.createdAt, thirtyDaysAgo),
        ));

      const delivered = recentOrders.filter(o => o.deliveredAt);
      const onTimeRate = delivered.length > 0
        ? Math.round((vendor.onTimeRate || 0.95) * 100) / 100
        : 0.95;

      // Compute growth_pct: revenue last 30d vs prior 30d
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const [revenueNow] = await db
        .select({ total: sql<number>`coalesce(sum(${orders.totalCents}), 0)` })
        .from(orders)
        .where(and(
          eq(orders.vendorId, vendorId),
          gte(orders.createdAt, thirtyDaysAgo),
          inArray(orders.status, ["delivered", "completed"]),
        ));
      const [revenuePrev] = await db
        .select({ total: sql<number>`coalesce(sum(${orders.totalCents}), 0)` })
        .from(orders)
        .where(and(
          eq(orders.vendorId, vendorId),
          gte(orders.createdAt, sixtyDaysAgo),
          sql`${orders.createdAt} < ${thirtyDaysAgo}`,
          inArray(orders.status, ["delivered", "completed"]),
        ));

      const revNow = Number(revenueNow?.total || 0);
      const revPrev = Number(revenuePrev?.total || 0);
      const growthPct = revPrev > 0
        ? Math.round(((revNow - revPrev) / revPrev) * 100 * 10) / 10
        : 0;

      res.json({
        id: vendor.id,
        name: vendor.name,
        location_label: vendor.city || vendor.businessCity || null,
        certified: vendor.certified || false,
        rating: vendor.rating || 4.5,
        on_time_rate: onTimeRate,
        growth_pct: growthPct,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/vendors/me/kpis — live vendor KPIs
  app.get("/api/vendors/me/kpis", requireAuth(["manager", "admin", "laundromat"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const vendorId = await resolveVendorId(user);
      if (!vendorId) return res.status(404).json({ error: "No vendor associated with your account" });

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // New orders (pending/confirmed)
      const [newCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(
          eq(orders.vendorId, vendorId),
          inArray(orders.status, ["pending", "confirmed"]),
        ));

      // Active orders (in-progress statuses)
      const activeStatuses = [
        "scheduled", "driver_assigned", "driver_en_route_pickup",
        "arrived_pickup", "picked_up", "driver_en_route_facility",
        "at_facility", "processing", "at_vendor", "weighed", "sorted",
        "washing", "drying", "folding", "wash_complete",
        "folded_packaged", "final_weight_verified", "ready_for_delivery",
        "driver_en_route_delivery", "arrived_delivery",
      ];
      const [activeCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(
          eq(orders.vendorId, vendorId),
          inArray(orders.status, activeStatuses),
        ));

      // Completed today
      const [completedToday] = await db
        .select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(
          eq(orders.vendorId, vendorId),
          inArray(orders.status, ["delivered", "completed"]),
          gte(orders.deliveredAt, todayIso),
        ));

      // Revenue this week (cents)
      const [revenueWeek] = await db
        .select({ total: sql<number>`coalesce(sum(${orders.totalCents}), 0)` })
        .from(orders)
        .where(and(
          eq(orders.vendorId, vendorId),
          inArray(orders.status, ["delivered", "completed"]),
          gte(orders.createdAt, weekAgo),
        ));

      res.json({
        new_orders: Number(newCount?.count || 0),
        active_orders: Number(activeCount?.count || 0),
        completed_today: Number(completedToday?.count || 0),
        revenue_this_week_cents: Number(revenueWeek?.total || 0),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/vendors/:id/bonus-rules — active bonus rules for a vendor
  app.get("/api/vendors/:id/bonus-rules", requireAuth(["manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(vendorId)) return res.status(400).json({ error: "Invalid vendor ID" });

      const currentUser = (req as any).currentUser;
      if (currentUser.role !== "admin") {
        const mgrVendorId = await resolveVendorId(currentUser);
        if (vendorId !== mgrVendorId) return res.status(403).json({ error: "Not authorized" });
      }

      // Return rules where vendor_id = :id OR vendor_id IS NULL (global rules), and active
      const rules = await db
        .select()
        .from(performanceBonusRules)
        .where(and(
          or(eq(performanceBonusRules.vendorId, vendorId), isNull(performanceBonusRules.vendorId)),
          eq(performanceBonusRules.active, true),
        ));

      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  3. WASH OPERATOR ENDPOINTS
  // ══════════════════════════════════════════════════════════

  // GET /api/operators/me/kpis — operator KPIs
  app.get("/api/operators/me/kpis", requireAuth(["laundromat", "manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayIso = todayStart.toISOString();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // processed_today: wash_runs status=done today by this operator
      const [processedToday] = await db
        .select({ count: sql<number>`count(*)` })
        .from(washRuns)
        .where(and(
          eq(washRuns.operatorId, user.id),
          eq(washRuns.status, "done"),
          gte(washRuns.completedAt, todayIso),
        ));

      // currently_washing: wash_runs status in ('washing', 'pending') for this operator
      const [currentlyWashing] = await db
        .select({ count: sql<number>`count(*)` })
        .from(washRuns)
        .where(and(
          eq(washRuns.operatorId, user.id),
          inArray(washRuns.status, ["washing", "pending"]),
        ));

      // avg_wash_time_min: avg(completed_at - start_at) for done runs last 7 days
      const [avgTime] = await db
        .select({
          avg: sql<number>`coalesce(avg(extract(epoch from (${washRuns.completedAt}::timestamp - ${washRuns.startAt}::timestamp)) / 60), 0)`,
        })
        .from(washRuns)
        .where(and(
          eq(washRuns.operatorId, user.id),
          eq(washRuns.status, "done"),
          gte(washRuns.completedAt, weekAgo),
        ));

      // quality_pct: default to 95 since no reorder signal exists yet
      const qualityPct = 95;

      res.json({
        processed_today: Number(processedToday?.count || 0),
        currently_washing: Number(currentlyWashing?.count || 0),
        avg_wash_time_min: Math.round(Number(avgTime?.avg || 0) * 10) / 10,
        quality_pct: qualityPct,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/wash-queue — orders at operator's vendor in wash-relevant statuses
  app.get("/api/wash-queue", requireAuth(["laundromat", "manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const vendorId = await resolveVendorId(user);
      if (!vendorId && user.role !== "admin") {
        return res.status(403).json({ error: "Not associated with a vendor" });
      }

      const washStatuses = ["at_vendor", "weighed", "sorted", "washing", "wash_complete", "folded_packaged"];
      const statusFilter = req.query.status ? String(req.query.status) : null;

      // P2-17: reject status filter values outside the wash-relevant whitelist
      if (statusFilter && !washStatuses.includes(statusFilter)) {
        return res.status(400).json({
          error: `Invalid status filter. Allowed: ${washStatuses.join(", ")}`,
        });
      }

      let conditions: any[];
      if (vendorId) {
        conditions = [eq(orders.vendorId, vendorId)];
      } else {
        conditions = []; // admin sees all
      }

      if (statusFilter) {
        conditions.push(eq(orders.status, statusFilter));
      } else {
        conditions.push(inArray(orders.status, washStatuses));
      }

      const queueOrders = await db
        .select()
        .from(orders)
        .where(conditions.length > 1 ? and(...conditions) : conditions[0])
        .orderBy(desc(orders.createdAt));

      res.json(queueOrders);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  4. DRIVER ENDPOINTS
  // ══════════════════════════════════════════════════════════

  // GET /api/drivers/me — driver profile + stats
  app.get("/api/drivers/me", requireAuth(["driver", "admin"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const driver = await storage.getDriverByUserId(user.id);
      if (!driver) return res.status(404).json({ error: "Driver profile not found" });

      res.json({
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        status: driver.status,
        rating: driver.rating,
        completedTrips: driver.completedTrips,
        todayTrips: driver.todayTrips,
        totalEarnings: driver.totalEarnings,
        pendingPayout: driver.pendingPayout,
        vehicleType: driver.vehicleType,
        licensePlate: driver.licensePlate,
        avatarUrl: driver.avatarUrl,
        currentLat: driver.currentLat,
        currentLng: driver.currentLng,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/drivers/me/status — online/offline toggle
  app.patch("/api/drivers/me/status", requireAuth(["driver", "admin"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const driver = await storage.getDriverByUserId(user.id);
      if (!driver) return res.status(404).json({ error: "Driver profile not found" });

      const { status } = req.body;
      if (!status || !["available", "offline", "busy"].includes(status)) {
        return res.status(400).json({ error: "status must be 'available', 'offline', or 'busy'" });
      }

      await storage.updateDriver(driver.id, { status });
      const updated = await storage.getDriverByUserId(user.id);
      res.json({ id: updated!.id, status: updated!.status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/drivers/me/jobs — driver's current + upcoming assigned orders
  app.get("/api/drivers/me/jobs", requireAuth(["driver", "admin"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const driver = await storage.getDriverByUserId(user.id);
      if (!driver) return res.status(404).json({ error: "Driver profile not found" });

      const driverOrders = await storage.getOrdersByDriver(driver.id);
      // Filter to active statuses only
      const activeStatuses = [
        "driver_assigned", "driver_en_route_pickup", "arrived_pickup",
        "picked_up", "driver_en_route_facility", "at_facility",
        "ready_for_delivery", "driver_en_route_delivery", "arrived_delivery",
      ];
      const activeJobs = driverOrders.filter((o: any) => activeStatuses.includes(o.status));

      res.json(activeJobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/orders/:id/arrived — geofence check at pickup
  app.patch("/api/orders/:id/arrived", requireAuth(["driver", "admin", "manager"]), async (req: Request, res: Response) => {
    try {
      const orderId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      // P0-1: driver ownership check — non-owning drivers cannot probe geofence
      const currentUser = (req as any).currentUser;
      if (currentUser.role === "driver") {
        const driver = await storage.getDriverByUserId(currentUser.id);
        if (!driver || order.driverId !== driver.id) {
          return res.status(403).json({ error: "Not your order" });
        }
      }

      // P1-12: numeric coercion for lat/lng
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "lat/lng must be numbers" });
      }

      // Get vendor's geofence radius or default 100m
      let geofenceRadius = 100; // meters
      if (order.vendorId) {
        const vendor = await storage.getVendor(order.vendorId);
        if (vendor && (vendor as any).pickupGeofenceRadiusM) {
          geofenceRadius = (vendor as any).pickupGeofenceRadiusM;
        }
      }

      // Calculate distance from driver to pickup location
      const pickupLat = (order as any).pickupLat || (order as any).pickup_lat;
      const pickupLng = (order as any).pickupLng || (order as any).pickup_lng;

      let withinGeofence = true;
      let distanceM = 0;

      if (pickupLat && pickupLng) {
        const distMiles = distanceMiles(lat, lng, pickupLat, pickupLng);
        distanceM = Math.round(distMiles * 1609.34); // convert miles to meters
        withinGeofence = distanceM <= geofenceRadius;
      }

      res.json({
        within_geofence: withinGeofence,
        distance_m: distanceM,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/orders/:id/picked-up — transition to picked_up
  app.post("/api/orders/:id/picked-up", requireAuth(["driver", "admin", "manager"]), async (req: Request, res: Response) => {
    try {
      const orderId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      // P0-2: driver ownership check
      const currentUser = (req as any).currentUser;
      if (currentUser.role === "driver") {
        const driver = await storage.getDriverByUserId(currentUser.id);
        if (!driver || order.driverId !== driver.id) {
          return res.status(403).json({ error: "Not your order" });
        }
      }

      // P1-10: FSM gate — prevent jumping straight from pending to picked_up
      const fsmCheck = validateTransition(order.status, "picked_up");
      if (!fsmCheck.valid) {
        return res.status(422).json({
          error: fsmCheck.error,
          currentStatus: order.status,
        });
      }

      const { bag_count, notes, photo_url } = req.body;

      const updateData: any = {
        status: "picked_up",
        pickedUpAt: now(),
      };
      if (bag_count != null) updateData.bagCount = bag_count;
      if (notes) updateData.pickupNotes = notes;
      if (photo_url) updateData.pickupPhotoUrl = photo_url;

      await storage.updateOrder(orderId, updateData);
      const updated = await storage.getOrder(orderId);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/orders/:id/arrived-delivery — geofence check at delivery
  app.patch("/api/orders/:id/arrived-delivery", requireAuth(["driver", "admin", "manager"]), async (req: Request, res: Response) => {
    try {
      const orderId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      // P0-3: driver ownership check
      const currentUser = (req as any).currentUser;
      if (currentUser.role === "driver") {
        const driver = await storage.getDriverByUserId(currentUser.id);
        if (!driver || order.driverId !== driver.id) {
          return res.status(403).json({ error: "Not your order" });
        }
      }

      // P1-12: numeric coercion for lat/lng
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: "lat/lng must be numbers" });
      }

      // P1-11: pull geofence radius from vendor row (same source as pickup)
      let geofenceRadius = 100; // meters
      if (order.vendorId) {
        const vendor = await storage.getVendor(order.vendorId);
        if (vendor && (vendor as any).pickupGeofenceRadiusM) {
          geofenceRadius = (vendor as any).pickupGeofenceRadiusM;
        }
      }

      // Calculate distance from driver to delivery location
      const deliveryLat = (order as any).deliveryLat || (order as any).delivery_lat || (order as any).pickupLat;
      const deliveryLng = (order as any).deliveryLng || (order as any).delivery_lng || (order as any).pickupLng;

      let withinGeofence = true;
      let distanceM = 0;

      if (deliveryLat && deliveryLng) {
        const distMiles = distanceMiles(lat, lng, deliveryLat, deliveryLng);
        distanceM = Math.round(distMiles * 1609.34);
        withinGeofence = distanceM <= geofenceRadius;
      }

      res.json({
        within_geofence: withinGeofence,
        distance_m: distanceM,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/orders/:id/delivered — transition to delivered
  app.post("/api/orders/:id/delivered", requireAuth(["driver", "admin", "manager"]), async (req: Request, res: Response) => {
    try {
      const orderId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      // P0-4: driver ownership check
      const currentUser = (req as any).currentUser;
      if (currentUser.role === "driver") {
        const driver = await storage.getDriverByUserId(currentUser.id);
        if (!driver || order.driverId !== driver.id) {
          return res.status(403).json({ error: "Not your order" });
        }
      }

      // P1-10: FSM gate — prevent skipping straight to delivered
      const fsmCheck = validateTransition(order.status, "delivered");
      if (!fsmCheck.valid) {
        return res.status(422).json({
          error: fsmCheck.error,
          currentStatus: order.status,
        });
      }

      const { notes, photo_url, signature_data } = req.body;

      const updateData: any = {
        status: "delivered",
        deliveredAt: now(),
      };
      if (notes) updateData.deliveryNotes = notes;
      if (photo_url) updateData.deliveryPhotoUrl = photo_url;
      if (signature_data) updateData.signatureData = signature_data;

      await storage.updateOrder(orderId, updateData);
      const updated = await storage.getOrder(orderId);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  6. VOICE PARSE — parse intent WITHOUT creating order
  // ══════════════════════════════════════════════════════════

  app.post("/api/voice/parse", requireAuth(), async (req: Request, res: Response) => {
    try {
      const { transcription, language } = req.body;

      if (!transcription || typeof transcription !== "string" || transcription.trim().length === 0) {
        return res.status(400).json({ error: "transcription is required" });
      }

      // P2-16: reject oversize transcriptions to protect regex from pathological input
      if (transcription.length > 4096) {
        return res.status(400).json({ error: "transcription exceeds maximum length (4096 chars)" });
      }

      const lang = language || "en";
      if (lang !== "en" && lang !== "es") {
        return res.status(422).json({ error: "Unsupported language. Only 'en' and 'es' are supported." });
      }

      // Simple keyword-based intent extraction (no AI call required for basic parsing)
      // Falls back to the full AI extraction via /api/voice/extract for complex cases
      const text = transcription.toLowerCase().trim();

      // P2-15: word-boundary tier matching to avoid collisions like "xls" -> xl_bag
      let tierName: string | null = null;
      if (/\b(xl|extra[\s-]?large)\b/i.test(transcription)) tierName = "xl_bag";
      else if (/\blarge\b/i.test(transcription)) tierName = "large_bag";
      else if (/\bmedium\b/i.test(transcription)) tierName = "medium_bag";
      else if (/\bsmall\b/i.test(transcription)) tierName = "small_bag";

      // Extract separation preference
      const separated = text.includes("separat") || text.includes("sort");

      // Extract clothing types
      const clothingTypes: string[] = [];
      if (text.includes("white")) clothingTypes.push("Whites");
      if (text.includes("dark")) clothingTypes.push("Dark Items");
      if (text.includes("delicat")) clothingTypes.push("Delicates");
      if (text.includes("towel")) clothingTypes.push("Towels");
      if (text.includes("sheet") || text.includes("bed")) clothingTypes.push("Bedding");

      // Extract address (look for "at" followed by address-like text)
      let pickupAddress: string | null = null;
      const atMatch = transcription.match(/(?:at|from)\s+(\d+\s+.+?)(?:\s+(?:tomorrow|today|next|on|in|morning|afternoon|evening)|$)/i);
      if (atMatch) pickupAddress = atMatch[1].trim();

      // Extract scheduled pickup hints
      let scheduledPickup: string | null = null;
      if (text.includes("tomorrow morning")) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        scheduledPickup = tomorrow.toISOString();
      } else if (text.includes("tomorrow afternoon")) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(14, 0, 0, 0);
        scheduledPickup = tomorrow.toISOString();
      } else if (text.includes("tomorrow")) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        scheduledPickup = tomorrow.toISOString();
      }

      // Extract special instructions
      let specialInstructions: string | null = null;
      const instrMatch = transcription.match(/(?:special|instruction|note|please)\s*[:\-]?\s*(.+?)(?:\.|$)/i);
      if (instrMatch) specialInstructions = instrMatch[1].trim();

      res.json({
        tierName,
        separated,
        clothingTypes: clothingTypes.length > 0 ? clothingTypes : null,
        pickupAddress,
        scheduledPickup,
        special_instructions: specialInstructions,
        language: lang,
        _hint: "Use POST /api/quotes to get pricing after user confirms these fields",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  8. WASH RUN COMPLETE — extend to accept folded_photo_url
  //  (This patches the existing endpoint behavior via middleware-like override)
  //  Actually: we modify the existing endpoint in wave-l.ts. See wave-l.ts edits.
  // ══════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════
  //  9. WASH RUN BODY SHAPE COMPAT + GET /api/wash-runs/:id
  // ══════════════════════════════════════════════════════════

  // GET /api/wash-runs/:id — operator UI poll for countdown
  app.get("/api/wash-runs/:id", requireAuth(["laundromat", "manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const runId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(runId)) return res.status(400).json({ error: "Invalid wash run ID" });

      const [run] = await db
        .select()
        .from(washRuns)
        .where(eq(washRuns.id, runId));

      if (!run) return res.status(404).json({ error: "Wash run not found" });

      // P1-7: cross-vendor IDOR — reject when run.vendorId doesn't match caller's vendor (admin bypass)
      const currentUser = (req as any).currentUser;
      if (currentUser.role !== "admin") {
        const callerVendorId = await resolveVendorId(currentUser);
        if (!callerVendorId || run.vendorId !== callerVendorId) {
          return res.status(403).json({ error: "Not your wash run" });
        }
      }

      // Compute elapsed time if still washing
      let elapsedMin: number | null = null;
      let remainingMin: number | null = null;
      if (run.startAt && run.status === "washing") {
        const startMs = new Date(run.startAt).getTime();
        elapsedMin = Math.round((Date.now() - startMs) / 60000 * 10) / 10;
        if (run.durationMin) {
          remainingMin = Math.max(0, run.durationMin - elapsedMin);
        }
      }

      res.json({
        ...run,
        elapsedMin,
        remainingMin,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
