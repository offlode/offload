import type { Express } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { insertVendorSchema, insertDriverSchema, insertServiceTypeSchema } from "@shared/schema";
import { hashPassword } from "../lib/auth";
import { now, ownsDriverProfile } from "../engines";
import {
  requireAuth,
  isAdminOrManager,
  getSessionTokenFromRequest,
  clearSessionCookie,
  destroySession,
} from "../session";
import { logAdminAction } from "../audit-helpers";
import { pick } from "../lib/util";
import {
  VENDOR_SELF_UPDATE_FIELDS, VENDOR_ADMIN_UPDATE_FIELDS,
  DRIVER_SELF_UPDATE_FIELDS, DRIVER_ADMIN_UPDATE_FIELDS,
} from "../lib/patch-allowlists";
import { getPagination, paginatedResponse } from "./deps";

export function registerUserRoutes(app: Express) {
  // ─────────────────────────────────────────────────────────
  //  USERS
  // ─────────────────────────────────────────────────────────

  app.get("/api/users/:id", requireAuth(), async (req, res) => {
    const currentUserP = (req as any).currentUser;
    if (currentUserP.role !== "admin" && currentUserP.role !== "super_admin" && currentUserP.role !== "manager" && currentUserP.id !== Number(String(req.params.id))) {
      return res.status(403).json({ error: "Access denied" });
    }
    const user = await storage.getUser(Number(String(req.params.id)));
    if (!user) return res.status(404).json({ error: "User not found" });
    // Parse preferences JSON text for client consumption
    let parsedPrefs = null;
    if (user.preferences) {
      try { parsedPrefs = JSON.parse(user.preferences); } catch { parsedPrefs = null; }
    }
    res.json({ ...user, password: undefined, preferences: parsedPrefs });
  });

  app.patch("/api/users/:id", requireAuth(), async (req, res) => {
    const currentUserU = (req as any).currentUser;
    const targetId = Number(String(req.params.id));
    if (targetId !== currentUserU.id && !["admin","manager","super_admin"].includes(currentUserU.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const UserPatch = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional().nullable(),
      profileImage: z.string().optional().nullable(),
      notificationPreferences: z.any().optional(),
      preferredDetergent: z.string().optional().nullable(),
      preferences: z.any().optional(),
      preferredLaundromatId: z.string().optional().nullable(),
    }).strip();
    const parsed = UserPatch.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const body = parsed.data;
    const SELF_FIELDS = ["name","email","phone","profileImage","notificationPreferences","preferredDetergent","preferences","preferredLaundromatId"] as const;
    const updateData: any = {};
    for (const k of SELF_FIELDS) { if ((body as any)[k] !== undefined) updateData[k] = (body as any)[k]; }
    const updated = await storage.updateUser(targetId, updateData);
    if (!updated) return res.status(404).json({ error: "User not found" });
    let parsedPrefsU = null;
    if (updated.preferences) {
      try { parsedPrefsU = JSON.parse(updated.preferences); } catch { parsedPrefsU = null; }
    }
    res.json({ ...updated, password: undefined, preferences: parsedPrefsU });
  });


  app.post("/api/users/:id/role", requireAuth(["admin", "super_admin"]), async (req, res) => {
    const targetId = Number(String(req.params.id));
    const RoleBody = z.object({ role: z.enum(["customer","driver","laundromat","vendor","staff","manager","admin","super_admin","laundromat_owner","laundromat_employee"]) }).strip();
    const parsed = RoleBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const before = await storage.getUser(targetId);
    const updated = await storage.updateUser(targetId, { role: parsed.data.role });
    if (!updated) return res.status(404).json({ error: "User not found" });
    logAdminAction(req, { action: "user.role.update", entityType: "user", entityId: targetId, oldValue: { role: before?.role }, newValue: { role: parsed.data.role } });
    res.json({ ...updated, password: undefined });
  });

  // ── Account Deletion (Apple Guideline 5.1.1(v)) ──
  app.delete("/api/users/me", requireAuth(), async (req, res) => {
    const user = (req as any).currentUser;
    try {
      // Cancel any active orders that are still cancellable
      const userOrders = await storage.getOrdersByCustomer(user.id);
      const cancellable = ["pending", "scheduled", "confirmed", "driver_assigned"];
      for (const order of userOrders) {
        if (cancellable.includes(order.status)) {
          await storage.transitionOrderStatus(order.id, order.status, "cancelled", {
            eventType: "account_deleted_cancelled",
            description: "Order cancelled because customer deleted account",
            actorId: user.id,
            actorRole: user.role,
            timestamp: now(),
            orderUpdate: { cancelledAt: now() },
          } as any);
        }
      }

      // Scrub PII and delete personal data
      await storage.deleteUserAccount(user.id);

      // Invalidate the current session
      const token = getSessionTokenFromRequest(req);
      if (token) await destroySession(token);
      clearSessionCookie(res);

      res.json({ success: true, message: "Account deleted" });
    } catch (err: any) {
      console.error("[account-deletion] error:", err);
      res.status(500).json({ error: "Failed to delete account. Please try again." });
    }
  });

  // ─────────────────────────────────────────────────────────
  //  PRICING TIERS & ADD-ONS
  // ─────────────────────────────────────────────────────────

  app.get("/api/pricing-tiers", async (_req, res) => {
    res.json(await storage.getPricingTiers());
  });

  app.get("/api/add-ons", async (_req, res) => {
    res.json(await storage.getAddOns());
  });

  // ─────────────────────────────────────────────────────────
  //  VENDORS
  // ─────────────────────────────────────────────────────────

  app.get("/api/vendors", requireAuth(), async (req, res) => {
    // F19: customers see only a sanitized view (no internal owner/financial fields).
    const cu = (req as any).currentUser;
    const pg = getPagination(req);
    const all = await storage.getVendors();
    if (isAdminOrManager(cu) || cu.role === "laundromat" || cu.role === "vendor" || cu.role === "support") {
      // Vendor-scoped owners only see their own vendor
      const scopedVendorId = cu.vendorId ? Number(cu.vendorId) : null;
      if (scopedVendorId) {
        const scoped = all.filter((v: any) => v.id === scopedVendorId);
        return res.json(paginatedResponse(scoped, pg));
      }
      return res.json(paginatedResponse(all, pg));
    }
    // Customer / driver view
    const sanitized = all
      .filter((v: any) => (v.status ?? "active") === "active")
      .map((v: any) => ({
        id: v.id,
        name: v.name,
        address: v.address,
        city: v.city,
        state: v.state,
        zip: v.zip,
        rating: v.rating,
        offersDryCleaning: v.offersDryCleaning,
        offersComforters: v.offersComforters,
        offersCommercial: v.offersCommercial,
        operatingHours: v.operatingHours,
      }));
    res.json(sanitized);
  });

  app.get("/api/vendors/:id", requireAuth(["admin", "manager", "laundromat", "vendor"]), async (req, res) => {
    const v = await storage.getVendor(Number(String(req.params.id)));
    if (!v) return res.status(404).json({ error: "Vendor not found" });
    const currentUser = (req as any).currentUser;
    if (currentUser.role === "laundromat" || currentUser.role === "vendor") {
      const myVendor = await storage.getVendorByUserId(currentUser.id);
      if (!myVendor || myVendor.id !== v.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    res.json(v);
  });

  app.get("/api/vendors/:id/stats", requireAuth(["admin", "manager", "laundromat", "vendor"]), async (req, res) => {
    const currentUser = (req as any).currentUser;
    if (currentUser.role === "laundromat" || currentUser.role === "vendor") {
      const vendor = await storage.getVendor(Number(String(req.params.id)));
      if (!vendor || (await storage.getVendorByUserId(currentUser.id))?.id !== vendor.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    res.json(await storage.getVendorStats(Number(String(req.params.id))));
  });

  app.post("/api/vendors", requireAuth(["admin", "manager"]), async (req, res) => {
    const parsed = insertVendorSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const vendor = await storage.createVendor(parsed.data);
    logAdminAction(req, { action: "vendor.create", entityType: "vendor", entityId: vendor.id, newValue: { name: vendor.name, email: vendor.email } });
    res.status(201).json(vendor);
  });

  app.patch("/api/vendors/:id", requireAuth(["admin", "manager", "laundromat", "vendor"]), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const vendorId = Number(String(req.params.id));
    if (currentUser.role === "laundromat" || currentUser.role === "vendor") {
      const vendor = await storage.getVendor(vendorId);
      if (!vendor || (await storage.getVendorByUserId(currentUser.id))?.id !== vendor.id) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    const allowedVendorFields = isAdminOrManager(currentUser) ? VENDOR_ADMIN_UPDATE_FIELDS : VENDOR_SELF_UPDATE_FIELDS;
    const vendorUpdates = pick(req.body, allowedVendorFields);
    const VendorPatch = insertVendorSchema.partial();
    const parsed = VendorPatch.safeParse(vendorUpdates);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const before = await storage.getVendor(vendorId);
    const updated = await storage.updateVendor(vendorId, parsed.data);
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    logAdminAction(req, { action: "vendor.update", entityType: "vendor", entityId: vendorId, oldValue: before, newValue: parsed.data });
    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  DRIVERS
  // ─────────────────────────────────────────────────────────

  app.get("/api/drivers", requireAuth(["admin", "manager"]), async (req, res) => {
    const pg = getPagination(req);
    res.json(paginatedResponse(await storage.getDrivers(), pg));
  });

  app.get("/api/drivers/user/:userId", requireAuth(["driver", "admin", "manager"]), async (req, res) => {
    const currentUser = (req as any).currentUser;
    if (currentUser.role === "driver" && Number(String(req.params.userId)) !== currentUser.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    const d = await storage.getDriverByUserId(Number(String(req.params.userId)));
    if (!d) return res.status(404).json({ error: "Driver not found" });
    res.json(d);
  });

  app.get("/api/drivers/:id", requireAuth(), async (req, res) => {
    // F18: restrict to driver themselves, admin/manager, or a customer with an active order assigned to this driver.
    const d = await storage.getDriver(Number(String(req.params.id)));
    if (!d) return res.status(404).json({ error: "Driver not found" });
    const cu = (req as any).currentUser;
    if (isAdminOrManager(cu) || cu.role === "support") return res.json(d);
    if (cu.role === "driver") {
      const me = await storage.getDriverByUserId(cu.id);
      if (me && me.id === d.id) return res.json(d);
      return res.status(403).json({ error: "Forbidden" });
    }
    if (cu.role === "customer") {
      // Allow only if the customer has an active order assigned to this driver. Return a sanitized view.
      const myOrders = await storage.getOrdersByCustomer(cu.id);
      const hasLink = myOrders.some(o => o.driverId === d.id && !["delivered", "cancelled"].includes(o.status));
      if (!hasLink) return res.status(403).json({ error: "Forbidden" });
      return res.json({
        id: d.id,
        name: d.name,
        rating: (d as any).rating ?? null,
        vehicleType: (d as any).vehicleType ?? null,
        status: (d as any).status ?? null,
      });
    }
    if (cu.role === "laundromat" || cu.role === "vendor") {
      // Vendor can see the driver only if currently handling an order linking them.
      const vp = await storage.getVendorByUserId(cu.id);
      if (!vp) return res.status(403).json({ error: "Forbidden" });
      const allOrders = await storage.getOrders();
      const hasLink = allOrders.some(o => o.vendorId === vp.id && o.driverId === d.id);
      if (!hasLink) return res.status(403).json({ error: "Forbidden" });
      return res.json({
        id: d.id,
        name: d.name,
        rating: (d as any).rating ?? null,
        vehicleType: (d as any).vehicleType ?? null,
        status: (d as any).status ?? null,
      });
    }
    return res.status(403).json({ error: "Forbidden" });
  });

  app.get("/api/drivers/:id/stats", requireAuth(["driver", "admin", "manager"]), async (req, res) => {
    // F8: driver ownership check.
    const __statsId = Number(String(req.params.id));
    const __cuStats = (req as any).currentUser;
    if (!(await ownsDriverProfile(__statsId, __cuStats))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    res.json(await storage.getDriverStats(__statsId));
  });

  app.post("/api/drivers", requireAuth(["admin", "manager"]), async (req, res) => {
    const DriverBody = insertDriverSchema.omit({ userId: true });
    const parsed = DriverBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const temporaryPassword = randomBytes(18).toString("base64url").slice(0, 24);
    // P2-003: never log generated passwords
    console.log(`[Driver] Generated one-time temporary password for new driver ${parsed.data.name}`);
    const driverUser = await storage.createUser({
      username: parsed.data.name.toLowerCase().replace(/\s/g, "_") + "_driver",
      password: hashPassword(temporaryPassword),
      name: parsed.data.name,
      email: req.body.email || `${parsed.data.name.toLowerCase().replace(/\s/g, ".")}@offload.com`,
      phone: parsed.data.phone,
      role: "driver",
    });
    const driver = await storage.createDriver({
      ...parsed.data,
      userId: driverUser.id,
    });
    logAdminAction(req, { action: "driver.create", entityType: "driver", entityId: driver.id, newValue: { name: driver.name, phone: driver.phone } });
    res.status(201).json(driver);
  });

  app.patch("/api/drivers/:id", requireAuth(["driver", "admin", "manager"]), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const driverId = Number(String(req.params.id));
    if (currentUser.role === "driver") {
      const myDriver = await storage.getDriverByUserId(currentUser.id);
      if (!myDriver || myDriver.id !== driverId) {
        return res.status(403).json({ error: "Access denied" });
      }
    }
    const allowedDriverFields = isAdminOrManager(currentUser) ? DRIVER_ADMIN_UPDATE_FIELDS : DRIVER_SELF_UPDATE_FIELDS;
    const driverUpdates = pick(req.body, allowedDriverFields);
    const DriverPatch = insertDriverSchema.partial();
    const parsed = DriverPatch.safeParse(driverUpdates);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const updated = await storage.updateDriver(driverId, parsed.data);
    if (!updated) return res.status(404).json({ error: "Driver not found" });
    if (isAdminOrManager(currentUser)) {
      logAdminAction(req, { action: "driver.update", entityType: "driver", entityId: driverId, newValue: parsed.data });
    }
    res.json(updated);
  });

  // Driver location update
  app.patch("/api/drivers/:id/location", requireAuth(["driver", "admin"]), async (req, res) => {
    // Security: drivers can only update their own location
    const cuLoc = (req as any).currentUser;
    if (cuLoc.role === "driver") {
      const myDriverLoc = await storage.getDriverByUserId(cuLoc.id);
      if (!myDriverLoc || myDriverLoc.id !== Number(String(req.params.id))) {
        return res.status(403).json({ error: "Access denied — can only update your own location" });
      }
    }
    const LocPatch = z.object({ lat: z.number(), lng: z.number() }).strip();
    const parsedLoc = LocPatch.safeParse(req.body);
    if (!parsedLoc.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedLoc.error.issues });
    }
    const { lat, lng } = parsedLoc.data;
    const updated = await storage.updateDriver(Number(String(req.params.id)), {
      currentLat: lat,
      currentLng: lng,
    });
    if (!updated) return res.status(404).json({ error: "Driver not found" });
    res.json(updated);
  });

  // Driver go online/offline
  app.patch("/api/drivers/:id/status", requireAuth(["driver", "admin"]), async (req, res) => {
    // F7: driver ownership check.
    const __sid = Number(String(req.params.id));
    const __cuS = (req as any).currentUser;
    if (!(await ownsDriverProfile(__sid, __cuS))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const DriverStatusBody = z.object({ status: z.string().min(1) }).strip();
    const parsedDriverStatus = DriverStatusBody.safeParse(req.body);
    if (!parsedDriverStatus.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedDriverStatus.error.issues });
    }
    const { status } = parsedDriverStatus.data;
    if (!["available", "busy", "offline"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const updated = await storage.updateDriver(__sid, { status });
    if (!updated) return res.status(404).json({ error: "Driver not found" });
    res.json(updated);
  });

  // ─────────────────────────────────────────────────────────
  //  SERVICE TYPES
  // ─────────────────────────────────────────────────────────

  app.get("/api/service-types", async (_req, res) => {
    res.json(await storage.getServiceTypes());
  });

  app.post("/api/service-types", requireAuth(["admin"]), async (req, res) => {
    const parsed = insertServiceTypeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
    }
    const st = await storage.createServiceType(parsed.data);
    logAdminAction(req, { action: "service_type.create", entityType: "service_type", entityId: st.id, newValue: { name: st.name } });
    res.status(201).json(st);
  });
}
