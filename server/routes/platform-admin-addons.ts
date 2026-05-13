import type { Express } from "express";
import { z } from "zod";
import { insertNotificationRuleSchema, insertAddOnSchema } from "@shared/schema";
import { storage } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { logAdminAction } from "../audit-helpers";
import { requireAuth } from "../session";
import { now } from "../engines";

export function registerPlatformAdminAddonsRoutes(app: Express) {

  // ═══════════════════════════════════════════════════════════════
  //  ADMIN NOTIFICATION RULES
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/admin/notification-rules", requireAuth(["admin"]), async (_req, res) => {
    try {
      const rules = await storage.getNotificationRules();
      res.json(rules);
    } catch (err: any) {
      console.error("[notification-rules] fetch error:", err);
      res.status(500).json({ error: "Failed to fetch notification rules", code: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/admin/notification-rules", requireAuth(["admin"]), async (req, res) => {
    try {
      const parsed = insertNotificationRuleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
      const rule = await storage.createNotificationRule(parsed.data);
      logAdminAction(req, { action: "notification_rule.create", entityType: "notification_rule", entityId: rule.id, newValue: { name: rule.name, trigger: rule.trigger } });
      res.status(201).json(rule);
    } catch (err: any) {
      console.error("[notification-rules] create error:", err);
      res.status(500).json({ error: "Failed to create notification rule", code: "INTERNAL_ERROR" });
    }
  });

  app.patch("/api/admin/notification-rules/:id", requireAuth(["admin"]), async (req, res) => {
    try {
      const RulePatch = z.object({
        name: z.string().optional(),
        trigger: z.string().optional(),
        audience: z.string().optional(),
        channels: z.string().optional(),
        titleTemplate: z.string().optional(),
        bodyTemplate: z.string().optional(),
        isActive: z.preprocess((v) => typeof v === "number" ? v === 1 : v, z.boolean().optional()),
      }).strip();
      const parsed = RulePatch.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const id = Number(req.params.id);
      const rule = await storage.updateNotificationRule(id, parsed.data);
      if (!rule) return res.status(404).json({ error: "Rule not found" });
      logAdminAction(req, { action: "notification_rule.update", entityType: "notification_rule", entityId: id, newValue: parsed.data });
      res.json(rule);
    } catch (err: any) {
      console.error("[notification-rules] update error:", err);
      res.status(500).json({ error: "Failed to update notification rule", code: "INTERNAL_ERROR" });
    }
  });

  app.delete("/api/admin/notification-rules/:id", requireAuth(["admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const deleted = await storage.deleteNotificationRule(id);
      if (!deleted) return res.status(404).json({ error: "Rule not found" });
      logAdminAction(req, { action: "notification_rule.delete", entityType: "notification_rule", entityId: id });
      res.json({ deleted: true });
    } catch (err: any) {
      console.error("[notification-rules] delete error:", err);
      res.status(500).json({ error: "Failed to delete notification rule", code: "INTERNAL_ERROR" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  ADMIN ADD-ON PRICING (CRUD)
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/admin/add-ons", requireAuth(["admin", "manager"]), async (_req, res) => {
    try {
      const items = await storage.getAllAddOns();
      res.json(items);
    } catch (err: any) {
      console.error("[add-ons] fetch error:", err);
      res.status(500).json({ error: "Failed to fetch add-ons", code: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/admin/add-ons/:id", requireAuth(["admin", "manager"]), async (req, res) => {
    try {
      const item = await storage.getAddOn(Number(req.params.id));
      if (!item) return res.status(404).json({ error: "Add-on not found" });
      res.json(item);
    } catch (err: any) {
      console.error("[add-ons] fetch error:", err);
      res.status(500).json({ error: "Failed to fetch add-on", code: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/admin/add-ons", requireAuth(["admin"]), async (req, res) => {
    try {
      const parsed = insertAddOnSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Validation error", details: parsed.error.flatten() });
      const item = await storage.createAddOn(parsed.data);
      try {
        await storage.createPricingAuditEntry({
          action: "create_addon",
          details: JSON.stringify({ entityType: "add_on", entityId: item.id, after: item }),
          actorId: (req as any).currentUser?.id || null,
          actorRole: (req as any).currentUser?.role || null,
          timestamp: now(),
        });
      } catch (e) { console.warn("[audit] Failed to log add-on create:", e); }
      res.status(201).json(item);
    } catch (err: any) {
      console.error("[add-ons] create error:", err);
      res.status(500).json({ error: "Failed to create add-on", code: "INTERNAL_ERROR" });
    }
  });

  app.patch("/api/admin/add-ons/:id", requireAuth(["admin"]), async (req, res) => {
    try {
      const AddOnPatch = z.object({
        name: z.string().optional(),
        displayName: z.string().optional(),
        price: z.number().optional(),
        description: z.string().optional().nullable(),
        category: z.string().optional(),
        isActive: z.preprocess((v) => typeof v === "number" ? v === 1 : v, z.boolean().optional()),
        // D10: priceMode controls per_order vs per_item billing
        priceMode: z.enum(["per_order", "per_item"]).optional(),
      }).strip();
      const parsed = AddOnPatch.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const id = Number(req.params.id);
      const before = await storage.getAddOn(id);
      if (!before) return res.status(404).json({ error: "Add-on not found" });
      const item = await storage.updateAddOn(id, parsed.data);
      if (!item) return res.status(404).json({ error: "Add-on not found" });
      try {
        await storage.createPricingAuditEntry({
          action: "update_addon",
          details: JSON.stringify({ entityType: "add_on", entityId: id, before, after: item }),
          actorId: (req as any).currentUser?.id || null,
          actorRole: (req as any).currentUser?.role || null,
          timestamp: now(),
        });
      } catch (e) { console.warn("[audit] Failed to log add-on update:", e); }
      res.json(item);
    } catch (err: any) {
      console.error("[add-ons] update error:", err);
      res.status(500).json({ error: "Failed to update add-on", code: "INTERNAL_ERROR" });
    }
  });

  app.delete("/api/admin/add-ons/:id", requireAuth(["admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      // Soft delete: deactivate instead of hard delete (preserves order history)
      const before = await storage.getAddOn(id);
      if (!before) return res.status(404).json({ error: "Add-on not found" });
      const item = await storage.updateAddOn(id, { isActive: false });
      try {
        await storage.createPricingAuditEntry({
          action: "deactivate_addon",
          details: JSON.stringify({ entityType: "add_on", entityId: id, before, after: item }),
          actorId: (req as any).currentUser?.id || null,
          actorRole: (req as any).currentUser?.role || null,
          timestamp: now(),
        });
      } catch (e) { console.warn("[audit] Failed to log add-on deactivate:", e); }
      res.json({ deactivated: true, id });
    } catch (err: any) {
      console.error("[add-ons] deactivate error:", err);
      res.status(500).json({ error: "Failed to deactivate add-on", code: "INTERNAL_ERROR" });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  //  PRICING CONFIG ADMIN CRUD (Wave 3)
  // ═══════════════════════════════════════════════════════════════

  app.get("/api/admin/pricing-config", requireAuth(["admin", "manager"]), async (_req, res) => {
    try {
      const items = await storage.getAllPricingConfig();
      res.json(items);
    } catch (err: any) {
      console.error("[pricing-config] fetch error:", err);
      res.status(500).json({ error: "Failed to fetch pricing config", code: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/admin/pricing-config/category/:category", requireAuth(["admin", "manager"]), async (req, res) => {
    try {
      const items = await storage.getPricingConfigByCategory(String(req.params.category));
      res.json(items);
    } catch (err: any) {
      console.error("[pricing-config] category fetch error:", err);
      res.status(500).json({ error: "Failed to fetch pricing config by category", code: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/admin/pricing-config/:key", requireAuth(["admin", "manager"]), async (req, res) => {
    try {
      const item = await storage.getPricingConfig(String(req.params.key));
      if (!item) return res.status(404).json({ error: "Pricing config key not found" });
      res.json(item);
    } catch (err: any) {
      console.error("[pricing-config] fetch error:", err);
      res.status(500).json({ error: "Failed to fetch pricing config", code: "INTERNAL_ERROR" });
    }
  });

  app.put("/api/admin/pricing-config/:key", requireAuth(["admin"]), async (req, res) => {
    try {
      const AdminPricingBody = z.object({ value: z.union([z.string(), z.number()]), category: z.string().optional(), description: z.string().optional() }).strip();
      const parsedAP = AdminPricingBody.safeParse(req.body);
      if (!parsedAP.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsedAP.error.issues });
      }
      const { value, category, description } = parsedAP.data;
      const key = String(req.params.key);

      // Validate based on key pattern
      const numVal = Number(value);
      if (key.startsWith("tax_rate") && (numVal < 0 || numVal >= 0.25)) {
        return res.status(400).json({ error: "Tax rate must be between 0 and 0.25" });
      }
      if ((key.startsWith("delivery_fee") || key.startsWith("bag_") || key.includes("overage")) && typeof value === "string" && !key.startsWith("bag_")) {
        if (numVal < 0) return res.status(400).json({ error: "Fee/price must be >= 0" });
      }
      if ((key.includes("platform_fee") || key.includes("vendor_payout_default") || key.includes("vendor_share")) && (numVal < 0 || numVal > 1)) {
        return res.status(400).json({ error: "Rate must be between 0 and 1" });
      }

      const currentUser = (req as any).currentUser;
      const existing = await storage.getPricingConfig(key);
      const oldValue = existing?.value ?? null;

      const item = await storage.upsertPricingConfig(
        key,
        typeof value === "object" ? JSON.stringify(value) : String(value),
        category || existing?.category || "general",
        description || existing?.description || undefined,
        currentUser?.id,
      );

      // Invalidate cache for this key
      pricingConfig.invalidate(key);

      // Write to pricing_audit_log
      try {
        await storage.createPricingAuditEntry({
          action: "config_change",
          details: JSON.stringify({ key, oldValue, newValue: item.value, category: item.category }),
          actorId: currentUser?.id || null,
          actorRole: currentUser?.role || null,
          timestamp: now(),
        });
      } catch (e) { console.warn("[audit] Failed to log pricing config change:", e); }

      res.json(item);
    } catch (err: any) {
      console.error("[pricing-config] update error:", err);
      res.status(500).json({ error: "Failed to update pricing config", code: "INTERNAL_ERROR" });
    }
  });

}
