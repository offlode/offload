import type { Express } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { isR2Enabled, uploadToR2, getPresignedDownloadUrl, getPresignedUploadUrl } from "../r2";
import { distanceMatrix, isGoogleMapsConfigured } from "../maps";
import { requireAuth, isAdminOrManager } from "../session";
import { getProgressPercent } from "../order-fsm";
import {
  now, canAccessOrder, getOrderOwnershipAllowed, emitToOrder,
} from "../engines";

export function registerTrackingRoutes(app: Express) {

  // ═══════════════════════════════════════════════════════════════
  //  MAPS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/maps/distance", requireAuth(), async (req, res) => {
    const origin = typeof req.query.origin === "string" ? req.query.origin : "";
    const destination = typeof req.query.destination === "string" ? req.query.destination : "";
    if (!origin || !destination) return res.status(400).json({ error: "origin and destination are required" });
    if (!isGoogleMapsConfigured()) return res.json({ distanceMeters: null, durationSeconds: null, message: "Distance unavailable" });

    try {
      const result = await distanceMatrix(origin, destination);
      if (!result) return res.json({ distanceMeters: null, durationSeconds: null, message: "Distance unavailable" });
      res.json(result);
    } catch (err) {
      console.error("[Maps] Distance Matrix failed", err);
      res.status(502).json({ error: "Distance lookup failed" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  GPS TRACKING ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  // ── Update driver location ──
  app.post("/api/drivers/:id/location", requireAuth(["driver", "admin"]), async (req, res) => {
    // Security: drivers can only update their own location
    const cuLocP = (req as any).currentUser;
    if (cuLocP.role === "driver") {
      const myDriverLocP = await storage.getDriverByUserId(cuLocP.id);
      if (!myDriverLocP || myDriverLocP.id !== Number(String(req.params.id))) {
        return res.status(403).json({ error: "Access denied — can only update your own location" });
      }
    }
    const driverId = Number(String(req.params.id));
    const driver = await storage.getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    const LocPostBody = z.object({ lat: z.number(), lng: z.number(), speed: z.number().optional(), heading: z.number().optional(), accuracy: z.number().optional() }).strip();
    const parsedLocPost = LocPostBody.safeParse(req.body);
    if (!parsedLocPost.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedLocPost.error.issues });
    }
    const { lat, lng, speed, heading, accuracy } = parsedLocPost.data;

    await storage.updateDriver(driverId, { currentLat: lat, currentLng: lng });

    const loc = await storage.createDriverLocationHistory({
      driverId,
      orderId: req.body.orderId || null,
      lat,
      lng,
      speed: speed || null,
      heading: heading || null,
      accuracy: accuracy || null,
      timestamp: now(),
    });

    // Emit location to any order rooms this driver is assigned to
    const activeOrders = (await storage.getOrdersByDriver(driverId)).filter(
      o => !["completed", "cancelled", "delivered"].includes(o.status)
    );
    // P2-049: replaced .forEach(async ...) with for...of
    for (const order of activeOrders) {
      emitToOrder(order.id, "driver_location", { driverId, lat, lng, speed, heading, timestamp: loc.timestamp });
    }

    res.json({ id: loc.id, lat, lng, timestamp: loc.timestamp });
  });

  // ── Get order tracking info (customer-facing) ──
  app.get("/api/orders/:id/tracking", requireAuth(), async (req, res) => {
    const order = await storage.getOrder(Number(String(req.params.id)));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // BOLA: only order participants or admin/manager can track
    const user = (req as any).currentUser;
    if (!(await canAccessOrder(order, user))) {
      return res.status(403).json({ error: "Access denied" });
    }

    const isDriverPhase = [
      "driver_en_route_pickup", "arrived_pickup", "picked_up",
      "driver_en_route_facility", "driver_en_route_delivery", "arrived_delivery"
    ].includes(order.status);

    let driverLocation = null;
    let driverInfo = null;

    if (order.driverId && isDriverPhase) {
      const driver = await storage.getDriver(order.driverId);
      if (driver) {
        driverLocation = { lat: driver.currentLat, lng: driver.currentLng };
        // NEVER expose driver personal phone to customer — use masked name and vehicle only
        driverInfo = {
          id: driver.id,
          name: driver.name,
          vehicleInfo: [driver.vehicleType, driver.licensePlate].filter(Boolean).join(" • ") || null,
          photo: driver.avatarUrl,
          // phone deliberately omitted for privacy
        };
      }
    }

    let etaMinutes: number | null = null;
    let etaMessage: string | undefined;
    if (isDriverPhase) {
      if (!isGoogleMapsConfigured()) {
        etaMessage = "ETA unavailable";
      } else if (driverLocation?.lat != null && driverLocation?.lng != null) {
        const origin = `${driverLocation.lat},${driverLocation.lng}`;
        const destination = ["driver_en_route_delivery", "arrived_delivery"].includes(order.status)
          ? (order.deliveryAddress || order.pickupAddress)
          : order.pickupAddress;
        try {
          const eta = await distanceMatrix(origin, destination);
          etaMinutes = eta ? Math.ceil(eta.durationSeconds / 60) : null;
          if (!eta) etaMessage = "ETA unavailable";
        } catch (err) {
          console.error("[Maps] ETA lookup failed", err);
          etaMessage = "ETA unavailable";
        }
      } else {
        etaMessage = "ETA unavailable";
      }
    }

    const history = await storage.getOrderStatusHistory(order.id);
    const progress = getProgressPercent(order.status);

    res.json({
      orderId: order.id,
      status: order.status,
      progress,
      isDriverPhase,
      driverLocation,
      driverInfo,
      pickup: { address: order.pickupAddress },
      delivery: { address: order.deliveryAddress },
      eta: etaMinutes != null ? `~${etaMinutes} min` : null,
      etaMinutes,
      message: etaMessage,
      history,
    });
  });

  // ── Get driver location history (admin) ──
  app.get("/api/drivers/:id/location-history", requireAuth(["admin"]), async (req, res) => {
    const driverId = Number(String(req.params.id));
    const limit = Number(req.query.limit) || 100;
    const history = await storage.getDriverLocationHistory(driverId, limit);
    res.json(history);
  });

  // ═══════════════════════════════════════════════════════════════
  //  PHOTO CAPTURE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  const VALID_PHOTO_TYPES = [
    "pickup_proof", "delivery_proof", "intake_before", "intake_after",
    "damage", "quality_check",
  ];

  app.post("/api/orders/:id/photos", requireAuth(), async (req, res) => {
    const orderId = Number(String(req.params.id));
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // F4: namespace-correct ownership (driver/vendor profile, not user id).
    const currentUser = (req as any).currentUser;
    if (!(await canAccessOrder(order, currentUser))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const PhotoBody = z.object({
      type: z.string().min(1),
      photoData: z.string().min(1),
      lat: z.number().optional(),
      lng: z.number().optional(),
      notes: z.string().optional(),
    }).strip();
    const parsedPhoto = PhotoBody.safeParse(req.body);
    if (!parsedPhoto.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPhoto.error.issues });
    }
    const { type, photoData, lat, lng, notes } = parsedPhoto.data;
    if (photoData.length > 4 * 1024 * 1024) {
      return res.status(413).json({ error: "photoData too large; max 4 MB" });
    }
    if (currentUser.role === "customer" && ["pickup_proof", "delivery_proof"].includes(type)) {
      return res.status(403).json({ error: "Customers cannot upload proof photos" });
    }
    if (!VALID_PHOTO_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid photo type. Must be one of: ${VALID_PHOTO_TYPES.join(", ")}` });
    }

    let r2Key: string | null = null;
    let storedPhotoData = photoData;

    // If R2 is configured, upload to R2 and store key instead of base64
    if (isR2Enabled()) {
      try {
        const key = `orders/${orderId}/${type}/${Date.now()}-${randomBytes(8).toString("hex")}`;
        const buffer = Buffer.from(photoData, "base64");
        await uploadToR2(key, buffer, "image/jpeg");
        r2Key = key;
        storedPhotoData = "r2"; // Placeholder — actual data is in R2
      } catch (err) {
        console.error("[R2] Upload failed, falling back to base64:", err);
      }
    }

    const photo = await storage.createOrderPhoto({
      orderId,
      type,
      photoData: storedPhotoData,
      r2Key,
      lat: lat || null,
      lng: lng || null,
      capturedBy: currentUser.id,
      capturedByRole: currentUser.role,
      notes: notes || null,
      timestamp: now(),
    });

    // Update order photo URL fields
    const photoRef = `photo:${photo.id}`;
    const updateData: any = {};
    if (type === "pickup_proof") updateData.pickupPhotoUrl = photoRef;
    else if (type === "delivery_proof") updateData.deliveryPhotoUrl = photoRef;
    else if (type === "intake_before") updateData.intakePhotoUrl = photoRef;
    else if (type === "intake_after") updateData.outputPhotoUrl = photoRef;
    if (Object.keys(updateData).length > 0) await storage.updateOrder(orderId, updateData);

    await storage.createOrderEvent({
      orderId,
      eventType: `photo_${type}`,
      description: `${type.replace(/_/g, " ")} photo captured by ${currentUser.role}`,
      actorId: currentUser.id,
      actorRole: currentUser.role,
      timestamp: now(),
    });

    // Return without full base64 in response
    res.status(201).json({ id: photo.id, orderId, type, timestamp: photo.timestamp, notes: photo.notes, r2Key: photo.r2Key || undefined });
  });

  app.get("/api/orders/:id/photos", requireAuth(), async (req, res) => {
    const orderForPhotos = await storage.getOrder(Number(String(req.params.id)));
    if (!orderForPhotos) return res.status(404).json({ error: "Order not found" });
    const cu = (req as any).currentUser;
    const drPhoto = cu.role === "driver" ? await storage.getDriverByUserId(cu.id) : null;
    const vnPhoto = ["laundromat","vendor"].includes(cu.role) ? (await storage.getVendorByUserId(cu.id)) ?? (orderForPhotos.vendorId ? await storage.getVendor(orderForPhotos.vendorId) : null) : null;
    if (!getOrderOwnershipAllowed(orderForPhotos, cu, drPhoto, vnPhoto)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const photos = await storage.getOrderPhotos(Number(String(req.params.id)));
    // Build summaries with R2 presigned URLs if available
    const summaries = await Promise.all(photos.map(async (p) => {
      let downloadUrl: string | undefined;
      if (p.r2Key) {
        try { downloadUrl = await getPresignedDownloadUrl(p.r2Key); } catch (e) { console.warn("[r2] Failed to get presigned download URL:", e); }
      }
      return {
        id: p.id, orderId: p.orderId, type: p.type,
        capturedBy: p.capturedBy, capturedByRole: p.capturedByRole,
        notes: p.notes, timestamp: p.timestamp,
        hasPhoto: !!(p.photoData || p.r2Key),
        thumbnail: p.r2Key ? undefined : (p.photoData ? p.photoData.substring(0, 100) + "..." : null),
        r2Key: p.r2Key || undefined,
        downloadUrl,
      };
    }));
    res.json(summaries);
  });

  app.get("/api/orders/:id/photos/:photoId", requireAuth(), async (req, res) => {
    const orderSingle = await storage.getOrder(Number(String(req.params.id)));
    if (!orderSingle) return res.status(404).json({ error: "Order not found" });
    const cuS = (req as any).currentUser;
    const drS = cuS.role === "driver" ? await storage.getDriverByUserId(cuS.id) : null;
    const vnS = ["laundromat","vendor"].includes(cuS.role) ? (await storage.getVendorByUserId(cuS.id)) ?? (orderSingle.vendorId ? await storage.getVendor(orderSingle.vendorId) : null) : null;
    if (!getOrderOwnershipAllowed(orderSingle, cuS, drS, vnS)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const photos = await storage.getOrderPhotos(Number(String(req.params.id)));
    const photo = photos.find(p => p.id === Number(String(req.params.photoId)));
    if (!photo) return res.status(404).json({ error: "Photo not found" });
    // If photo is in R2, generate presigned download URL
    if (photo.r2Key) {
      try {
        const downloadUrl = await getPresignedDownloadUrl(photo.r2Key);
        return res.json({ ...photo, photoData: undefined, downloadUrl });
      } catch {
        return res.json(photo);
      }
    }
    res.json(photo);
  });

  app.get("/api/orders/:id/photos/type/:type", requireAuth(), async (req, res) => {
    const orderT = await storage.getOrder(Number(String(req.params.id)));
    if (!orderT) return res.status(404).json({ error: "Order not found" });
    const cuT = (req as any).currentUser;
    const drT = cuT.role === "driver" ? await storage.getDriverByUserId(cuT.id) : null;
    const vnT = ["laundromat","vendor"].includes(cuT.role) ? (await storage.getVendorByUserId(cuT.id)) ?? (orderT.vendorId ? await storage.getVendor(orderT.vendorId) : null) : null;
    if (!getOrderOwnershipAllowed(orderT, cuT, drT, vnT)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const photos = await storage.getOrderPhotosByType(Number(String(req.params.id)), String(req.params.type));
    res.json(photos);
  });

  // ═══════════════════════════════════════════════════════════════
  //  R2 PRESIGNED UPLOAD ENDPOINT
  // ═══════════════════════════════════════════════════════════════

  app.post("/api/photos/presigned-upload", requireAuth(["driver", "vendor", "laundromat", "admin", "manager"]), async (req, res) => {
    if (!isR2Enabled()) {
      return res.status(503).json({ error: "R2 storage is not configured" });
    }
    const PresignedUploadBody = z.object({ orderId: z.number(), type: z.string().min(1), contentType: z.string().optional() }).strip();
    const parsedPresigned = PresignedUploadBody.safeParse(req.body);
    if (!parsedPresigned.success) {
      return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedPresigned.error.issues });
    }
    const { orderId, type, contentType } = parsedPresigned.data;
    if (!orderId || !type || !contentType) {
      return res.status(400).json({ error: "orderId, type, and contentType are required" });
    }
    if (!VALID_PHOTO_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid photo type. Must be one of: ${VALID_PHOTO_TYPES.join(", ")}` });
    }
    const ALLOWED_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return res.status(400).json({ error: `Invalid contentType. Must be one of: ${ALLOWED_CONTENT_TYPES.join(", ")}` });
    }
    const order = await storage.getOrder(Number(orderId));
    if (!order) return res.status(404).json({ error: "Order not found" });

    // F6: ownership check — only an order participant can request an upload URL.
    const __cu = (req as any).currentUser;
    if (!(await canAccessOrder(order, __cu))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const key = `orders/${orderId}/${type}/${Date.now()}-${randomBytes(8).toString("hex")}`;
    try {
      const uploadUrl = await getPresignedUploadUrl(key, contentType);
      res.json({ uploadUrl, key });
    } catch (err) {
      res.status(500).json({ error: "Failed to generate presigned URL" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  GDPR / CCPA DATA DELETION & EXPORT
  // ═══════════════════════════════════════════════════════════════

  app.delete("/api/users/:id/data", requireAuth(), async (req, res) => {
    const targetId = Number(String(req.params.id));
    const currentUser = (req as any).currentUser;

    // Auth: user themselves or admin
    if (currentUser.id !== targetId && currentUser.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Only the user themselves or an admin can delete user data." });
    }

    const targetUser = await storage.getUser(targetId);
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    // 1. Anonymize user PII
    await storage.updateUser(targetId, {
      name: "Deleted User",
      email: `deleted-${targetId}@removed.invalid`,
      phone: null,
      avatarUrl: null,
      referralCode: null,
      specialInstructions: null,
      preferredDetergent: "standard",
      preferredWashTemp: "cold",
      subscriptionTier: null,
      subscriptionStartDate: null,
      subscriptionEndDate: null,
      churnRisk: 0,
      lastActiveAt: null,
    } as any);

    // 2. Clear addresses
    const userAddresses = await storage.getAddressesByUser(targetId);
    for (const addr of userAddresses) {
      await storage.deleteAddress(addr.id);
    }

    // 3. Clear payment methods
    const userPaymentMethods = await storage.getPaymentMethodsByUser(targetId);
    for (const pm of userPaymentMethods) {
      await storage.deletePaymentMethod(pm.id);
    }

    // 4. Clear chat sessions
    const userChatSessions = await storage.getChatSessions(targetId);
    for (const cs of userChatSessions) {
      await storage.updateChatSession(cs.id, { messages: "[]", summary: "Deleted" } as any);
    }

    // 5. Anonymize orders (keep for business records)
    const userOrders = await storage.getOrdersByCustomer(targetId);
    for (const order of userOrders) {
      await storage.updateOrder(order.id, {
        customerName: "Deleted User",
        customerEmail: null,
        customerPhone: null,
      } as any);
    }

    // 6. Clear notifications
    const userNotifications = await storage.getNotificationsByUser(targetId);
    for (const notif of userNotifications) {
      await storage.deleteNotification(notif.id);
    }

    // 7. Invalidate all sessions for the user
    await storage.deleteSessionsByUser(targetId);

    res.json({ success: true, message: "All personal data has been deleted" });
  });

  app.get("/api/users/:id/data-export", requireAuth(), async (req, res) => {
    const targetId = Number(String(req.params.id));
    const currentUser = (req as any).currentUser;

    // Auth: user themselves or admin
    if (currentUser.id !== targetId && currentUser.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Only the user themselves or an admin can export user data." });
    }

    const targetUser = await storage.getUser(targetId);
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    // Gather all user data
    const exportAddresses = await storage.getAddressesByUser(targetId);
    const exportPaymentMethods = (await storage.getPaymentMethodsByUser(targetId)).map(pm => ({
      id: pm.id,
      type: pm.type,
      label: pm.label,
      last4: pm.last4 ? `****${pm.last4}` : null,
      expiryDate: pm.expiryDate,
      isDefault: pm.isDefault,
    }));
    const exportOrders = (await storage.getOrdersByCustomer(targetId)).map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      total: o.total,
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt,
    }));
    const exportMessages = await storage.getMessagesBySender(targetId);
    const exportLoyalty = await storage.getLoyaltyTransactions(targetId);
    const exportChatSessions = await storage.getChatSessions(targetId);
    const exportNotifications = await storage.getNotificationsByUser(targetId);
    const exportReferrals = await storage.getReferralsByUser(targetId);

    const { password: _pw, ...profile } = targetUser;

    res.json({
      exportDate: new Date().toISOString(),
      profile,
      addresses: exportAddresses,
      paymentMethods: exportPaymentMethods,
      orders: exportOrders,
      messages: exportMessages.map(m => ({ id: m.id, content: m.content, timestamp: m.timestamp, orderId: m.orderId })),
      loyaltyTransactions: exportLoyalty,
      chatSessions: exportChatSessions.map(cs => ({ id: cs.id, createdAt: cs.createdAt, summary: cs.topic || cs.status })),
      notifications: exportNotifications.map(n => ({ id: n.id, title: n.title, body: n.body, createdAt: n.createdAt })),
      referrals: exportReferrals,
    });
  });

  // ═══════════════════════════════════════════════════════════════
  //  ENHANCED NOTIFICATION ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  app.delete("/api/notifications/:id", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const id = Number(String(req.params.id));
    const n = await storage.getNotification(id);
    if (!n) return res.status(404).json({ error: "Notification not found" });
    if (n.userId !== currentUser.id && !isAdminOrManager(currentUser)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    await storage.deleteNotification(id);
    res.json({ success: true });
  });

  app.get("/api/notifications/category/:category", requireAuth(), async (req, res) => {
    const currentUser = (req as any).currentUser;
    const notifications = await storage.getNotificationsByCategory(currentUser.id, String(req.params.category));
    res.json(notifications);
  });

}
