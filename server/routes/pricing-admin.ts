import type { Express } from "express";
import { requireRole } from "../middleware/requireRole";
import { storage } from "../storage";

export function registerPricingAdminRoutes(app: Express) {
  /**
   * GET /api/pricing
   * super_admin/admin only — returns pricing tiers
   */
  app.get("/api/pricing", requireRole("super_admin", "admin"), async (_req, res) => {
    try {
      const tiers = await storage.getPricingTiers();
      const addOns = await storage.getAddOns();
      res.json({ tiers, addOns });
    } catch (err: any) {
      console.error("[pricing-admin] GET error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * PATCH /api/pricing
   * super_admin/admin only — updates pricing tiers
   * Body: { tiers: Array<{ id: number, flatPrice?: number, overageRate?: number, maxWeight?: number, isActive?: boolean }> }
   */
  app.patch("/api/pricing", requireRole("super_admin", "admin"), async (req, res) => {
    try {
      const { tiers } = req.body;
      if (!Array.isArray(tiers)) {
        return res.status(400).json({ error: "tiers must be an array" });
      }

      const results: any[] = [];
      for (const tier of tiers) {
        if (!tier.id) continue;
        const existing = await storage.getPricingTier(tier.id);
        if (!existing) continue;

        // Build update fields
        const updates: any = {};
        if (tier.flatPrice !== undefined) {
          updates.flatPrice = tier.flatPrice;
          updates.flatPriceCents = Math.round(tier.flatPrice * 100);
        }
        if (tier.overageRate !== undefined) {
          updates.overageRate = tier.overageRate;
          updates.overageRateCents = Math.round(tier.overageRate * 100);
        }
        if (tier.maxWeight !== undefined) updates.maxWeight = tier.maxWeight;
        if (tier.isActive !== undefined) updates.isActive = tier.isActive;
        if (tier.displayName !== undefined) updates.displayName = tier.displayName;
        if (tier.description !== undefined) updates.description = tier.description;

        if (Object.keys(updates).length > 0) {
          // Use raw SQL to update since storage may not have a dedicated updatePricingTier
          const setClauses: string[] = [];
          const values: any[] = [];
          let idx = 1;

          const fieldMap: Record<string, string> = {
            flatPrice: "flat_price",
            flatPriceCents: "flat_price_cents",
            overageRate: "overage_rate",
            overageRateCents: "overage_rate_cents",
            maxWeight: "max_weight",
            isActive: "is_active",
            displayName: "display_name",
            description: "description",
          };

          for (const [key, val] of Object.entries(updates)) {
            const col = fieldMap[key];
            if (col) {
              setClauses.push(`${col} = $${idx}`);
              values.push(val);
              idx++;
            }
          }

          if (setClauses.length > 0) {
            const { pool } = await import("../storage");
            values.push(tier.id);
            await pool.query(
              `UPDATE pricing_tiers SET ${setClauses.join(", ")} WHERE id = $${idx}`,
              values,
            );
          }

          results.push({ id: tier.id, updated: true });
        }
      }

      const updatedTiers = await storage.getPricingTiers();
      res.json({ tiers: updatedTiers, updates: results });
    } catch (err: any) {
      console.error("[pricing-admin] PATCH error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * PATCH /api/admin/users/:id/role
   * super_admin can change user roles
   */
  app.patch("/api/admin/users/:id/role", requireRole("super_admin", "admin"), async (req, res) => {
    try {
      const targetId = Number(String(req.params.id));
      const { role } = req.body;

      const validRoles = [
        "customer", "driver", "laundromat", "vendor", "staff", "manager",
        "admin", "super_admin", "laundromat_owner", "laundromat_employee",
      ];

      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
      }

      const user = await storage.getUser(targetId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const updated = await storage.updateUser(targetId, { role });
      res.json({ ...updated, password: undefined });
    } catch (err: any) {
      console.error("[pricing-admin] PATCH /admin/users/:id/role error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
