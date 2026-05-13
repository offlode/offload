import type { Express } from "express";
import { z } from "zod";
import { WEIGHT_TOLERANCE } from "@shared/schema";
import { storage } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { applyVendorCertification, getCertifiedRules, evaluateVendorCertification } from "../certified";
import { requireAuth } from "../session";
import { canAccessOrder } from "../engines";

export function registerPlatformAdminCertifiedRoutes(app: Express) {

  // ═══════════════════════════════════════════════════════════════
  //  OFFLOAD CERTIFIED — admin-configurable rules + manual recompute
  // ═══════════════════════════════════════════════════════════════
  app.get("/api/admin/certified-rules", requireAuth(["admin", "manager"]), async (_req, res) => {
    try {
      const rules = await getCertifiedRules();
      res.json(rules);
    } catch (err: any) {
      console.error("[certified] get rules error:", err);
      res.status(500).json({ error: "Failed to load certified rules", code: "INTERNAL_ERROR" });
    }
  });

  app.put("/api/admin/certified-rules", requireAuth(["admin"]), async (req, res) => {
    try {
      const RulesBody = z.object({
        minHappyReviews:   z.number().int().min(1).max(1000).optional(),
        maxUnhappyReviews: z.number().int().min(1).max(1000).optional(),
        windowDays:        z.number().int().min(1).max(3650).optional(),
        minTotalReviews:   z.number().int().min(1).max(1000).optional(),
        happyThreshold:    z.number().min(1).max(5).optional(),
        unhappyThreshold:  z.number().min(1).max(5).optional(),
      }).strip();
      const parsed = RulesBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const currentUser = (req as any).currentUser;
      const mapping: Record<string, number | undefined> = {
        certified_min_happy_reviews:   parsed.data.minHappyReviews,
        certified_max_unhappy_reviews: parsed.data.maxUnhappyReviews,
        certified_window_days:         parsed.data.windowDays,
        certified_min_total_reviews:   parsed.data.minTotalReviews,
        certified_happy_threshold:     parsed.data.happyThreshold,
        certified_unhappy_threshold:   parsed.data.unhappyThreshold,
      };
      for (const [key, value] of Object.entries(mapping)) {
        if (value === undefined) continue;
        await storage.upsertPricingConfig(key, String(value), "certified", "Offload Certified rule", currentUser?.id);
        pricingConfig.invalidate(key);
      }
      const updated = await getCertifiedRules();
      res.json(updated);
    } catch (err: any) {
      console.error("[certified] update rules error:", err);
      res.status(500).json({ error: "Failed to update certified rules", code: "INTERNAL_ERROR" });
    }
  });

  // Manual re-evaluation for a single vendor (admin tool)
  app.post("/api/admin/certified/recompute/:vendorId", requireAuth(["admin"]), async (req, res) => {
    try {
      const vendorId = Number(req.params.vendorId);
      if (!Number.isFinite(vendorId)) return res.status(400).json({ error: "Invalid vendorId" });
      const result = await applyVendorCertification(vendorId);
      res.json(result);
    } catch (err: any) {
      console.error("[certified] recompute error:", err);
      res.status(500).json({ error: "Failed to recompute certification", code: "INTERNAL_ERROR" });
    }
  });

  // Preview (read-only) — does not write
  app.get("/api/admin/certified/preview/:vendorId", requireAuth(["admin", "manager"]), async (req, res) => {
    try {
      const vendorId = Number(req.params.vendorId);
      if (!Number.isFinite(vendorId)) return res.status(400).json({ error: "Invalid vendorId" });
      const audit = await evaluateVendorCertification(vendorId);
      res.json(audit);
    } catch (err: any) {
      console.error("[certified] preview error:", err);
      res.status(500).json({ error: "Failed to preview certification", code: "INTERNAL_ERROR" });
    }
  });

  // Audit log for pricing changes
  app.get("/api/admin/pricing-audit-log", requireAuth(["admin", "manager"]), async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 100;
      const logs = await storage.getPricingAuditLog(limit);
      res.json(logs);
    } catch (err: any) {
      console.error("[pricing-config] audit log fetch error:", err);
      res.status(500).json({ error: "Failed to fetch audit log", code: "INTERNAL_ERROR" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  ADMIN AUDIT LOG (Wave 4)
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/admin/audit-log", requireAuth(["admin"]), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
      const entityId = req.query.entityId ? String(req.query.entityId) : undefined;
      const actorId = req.query.actorId ? Number(req.query.actorId) : undefined;
      const opts = { entityType, entityId, actorId, limit, offset };
      const [items, total] = await Promise.all([
        storage.getAdminAuditLog(opts),
        storage.countAdminAuditLog(opts),
      ]);
      res.json({ items, total, limit, offset });
    } catch (err: any) {
      console.error("[admin-audit-log] error:", err);
      res.status(500).json({ error: "Failed to fetch audit log", code: "INTERNAL_ERROR" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  CHAIN OF CUSTODY SUMMARY
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/orders/:id/chain-of-custody", requireAuth(), async (req, res) => {
    const orderId = Number(String(req.params.id));
    const order = await storage.getOrder(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // F11: full ownership (customer/driver/vendor/admin/support).
    const cu = (req as any).currentUser;
    if (!(await canAccessOrder(order, cu))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const events = await storage.getOrderEvents(orderId);
    const photos = storage.getOrderPhotos ? await storage.getOrderPhotos(orderId) : [];

    // Build chain of custody timeline
    const custodyChain = [];

    // Pickup
    if (order.pickedUpAt) {
      custodyChain.push({
        phase: "pickup",
        timestamp: order.pickedUpAt,
        actor: order.driverId ? `Driver #${order.driverId}` : "Unknown",
        weight: order.dirtyWeight || null,
        photoUrl: order.pickupPhotoUrl || null,
        status: "completed",
      });
    }

    // Facility intake
    if (order.arrivedLaundromatAt) {
      custodyChain.push({
        phase: "facility_intake",
        timestamp: order.arrivedLaundromatAt,
        actor: order.vendorId ? `Vendor #${order.vendorId}` : "Unknown",
        weight: order.intakeWeight || order.dirtyWeight || null,
        photoUrl: order.intakePhotoUrl || null,
        status: "completed",
      });
    }

    // Processing complete
    if (order.washCompletedAt) {
      custodyChain.push({
        phase: "processing_complete",
        timestamp: order.washCompletedAt,
        actor: order.vendorId ? `Vendor #${order.vendorId}` : "Unknown",
        weight: order.cleanWeight || null,
        photoUrl: order.intakePhotoUrl || null,
        weightDifference: order.weightDifference || null,
        status: "completed",
      });
    }

    // Delivery
    if (order.deliveredAt) {
      custodyChain.push({
        phase: "delivery",
        timestamp: order.deliveredAt,
        actor: order.driverId ? `Driver #${order.driverId}` : "Unknown",
        photoUrl: order.deliveryPhotoUrl || null,
        status: "completed",
      });
    }

    res.json({
      orderId,
      orderNumber: order.orderNumber,
      chain: custodyChain,
      weightReconciliation: {
        dirtyWeight: order.dirtyWeight || null,
        cleanWeight: order.cleanWeight || null,
        difference: order.weightDifference || null,
        withinTolerance: order.weightDifference != null ? Math.abs(order.weightDifference) <= (WEIGHT_TOLERANCE * (order.dirtyWeight || 1)) : null,
      },
      evidencePhotos: photos,
      relatedEvents: events.filter((e: any) =>
        ["dirty_weight_recorded", "clean_weight_recorded", "intake_completed", "output_weight_recorded",
         "pickup_proof", "delivery_proof", "quality_check"].includes(e.eventType)
      ),
    });
  });

}
