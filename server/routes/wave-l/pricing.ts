import type { Express, Request, Response } from "express";
import { db } from "../../storage";
import { storage } from "../../storage";
import { requireAuth } from "../../session";
import { now } from "../../engines";
import { checkServiceArea } from "../../service-area";
import { performanceBonusRules, performanceBonusPayouts } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { paramStr, getManagerVendorId } from "./helpers";

export function registerPricingRoutes(app: Express): void {
  // ══════════════════════════════════════════════════════════
  //  SERVICE AREA REQUESTS (public)
  // ══════════════════════════════════════════════════════════

  app.post("/api/service-area-requests", async (req: Request, res: Response) => {
    try {
      const {
        address, lat, lng, zip, requested_service, contact_email, contact_phone, notes: bodyNotes,
        name, email, phone, city, state,
      } = req.body;

      if (!zip && !address) {
        return res.status(400).json({ error: "zip or address is required" });
      }

      const request = await storage.createServiceAreaRequest({
        name: name || null,
        email: email || contact_email || null,
        phone: phone || contact_phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        lat: lat || null,
        lng: lng || null,
        requestedService: requested_service || null,
        source: "customer_app",
        notes: bodyNotes || null,
      });

      res.status(201).json({ id: request.id, status: request.status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/service-area/check", async (req: Request, res: Response) => {
    try {
      const { lat, lng, zip, service_type } = req.query;
      const result = await checkServiceArea({
        lat: lat ? parseFloat(String(lat)) : undefined,
        lng: lng ? parseFloat(String(lng)) : undefined,
        zip: zip ? String(zip) : undefined,
        service_type: service_type ? String(service_type) : undefined,
      });

      if (!result.available) {
        return res.status(422).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  ADMIN SERVICE AREA REQUESTS
  // ══════════════════════════════════════════════════════════

  app.get("/api/admin/service-area-requests", requireAuth(["admin"]), async (req: Request, res: Response) => {
    try {
      const { status, zip, limit, offset } = req.query;
      const requests = await storage.getServiceAreaRequests({
        status: status ? String(status) : undefined,
        zip: zip ? String(zip) : undefined,
        limit: limit ? parseInt(String(limit), 10) : 50,
        offset: offset ? parseInt(String(offset), 10) : 0,
      });
      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/service-area-requests/:id", requireAuth(["admin"]), async (req: Request, res: Response) => {
    try {
      const id = parseInt(paramStr(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const { status, notes } = req.body;
      const updated = await storage.updateServiceAreaRequest(id, { status, notes });
      if (!updated) return res.status(404).json({ error: "Request not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  BONUS ENDPOINTS
  // ══════════════════════════════════════════════════════════

  app.get("/api/vendors/:id/bonuses", requireAuth(["manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(vendorId)) return res.status(400).json({ error: "Invalid vendor ID" });

      const currentUser = (req as any).currentUser;
      if (currentUser.role !== "admin") {
        const mgrVendorId = await getManagerVendorId(currentUser);
        if (vendorId !== mgrVendorId) return res.status(403).json({ error: "Not authorized" });
      }

      const payouts = await db
        .select()
        .from(performanceBonusPayouts)
        .where(eq(performanceBonusPayouts.vendorId, vendorId))
        .orderBy(desc(performanceBonusPayouts.triggeredAt));

      res.json(payouts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/bonus-rules", requireAuth(["admin"]), async (req: Request, res: Response) => {
    try {
      const rules = await db.select().from(performanceBonusRules);
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/bonus-rules/:id", requireAuth(["admin"]), async (req: Request, res: Response) => {
    try {
      const ruleId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(ruleId)) return res.status(400).json({ error: "Invalid rule ID" });

      const { active, threshold, amount_cents } = req.body;
      const updates: Record<string, any> = { updatedAt: now() };
      if (active !== undefined) updates.active = active;
      if (threshold !== undefined) updates.threshold = threshold;
      if (amount_cents !== undefined) updates.amountCents = amount_cents;

      const [updated] = await db
        .update(performanceBonusRules)
        .set(updates)
        .where(eq(performanceBonusRules.id, ruleId))
        .returning();

      if (!updated) return res.status(404).json({ error: "Rule not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  VOICE ORDER (structured extraction, NO price compute)
  // ══════════════════════════════════════════════════════════

  // DEPRECATED: Use POST /api/voice/parse instead (Wave 2).
  // Owner directive: "Voice NEVER displays a price; price comes from /api/quote after wizard submission."
  // This endpoint should NOT be used by the new wizard flow. Kept for backward compat only.
  app.post("/api/voice/order", requireAuth(), async (req: Request, res: Response) => {
    // Set deprecation header
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", "2026-07-01");
    res.setHeader("Link", '</api/voice/parse>; rel="successor-version"');

    // P1-14: feature flag to disable the deprecated endpoint entirely (default off; flip to "true" in production)
    if (process.env.DISABLE_LEGACY_VOICE_ORDER === "true") {
      return res.status(410).json({ error: "Endpoint removed. Use POST /api/voice/parse." });
    }

    try {
      const { transcript, intent } = req.body;

      if (!transcript) return res.status(400).json({ error: "transcript is required" });

      const washSpec: Record<string, any> = {
        transcript,
        bags: intent?.bags || [],
        service_type: intent?.service_type || "wash_fold",
        delivery_speed: intent?.delivery_speed || "48h",
        clothing_types: intent?.clothing_types || [],
        separated: intent?.separated || false,
        wash_preferences: {
          detergent: intent?.detergent || "standard",
          water_temp: intent?.water_temp || "cold",
          drying: intent?.drying || "normal",
          stain_treatment: intent?.stain_treatment || false,
          extra_rinse: intent?.extra_rinse || false,
          special_instructions: intent?.special_instructions || "",
        },
        address: intent?.address || null,
        pickup_time: intent?.pickup_time || null,
        language: intent?.language || "en",
      };

      res.json({
        success: true,
        washSpec,
        message: "Use this wash spec to call POST /api/quotes/calculate for pricing",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
