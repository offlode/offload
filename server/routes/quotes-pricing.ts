import type { Express, Response } from "express";
import { z } from "zod";
import { randomBytes } from "crypto";
import rateLimit from "express-rate-limit";
import {
  PRICING_TIERS, DELIVERY_FEES, QUOTE_VALIDITY_MINUTES,
} from "@shared/schema";
import { storage } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { checkCoverage } from "../service-area";
import {
  distanceMiles, TAX_RATE, calculateQuotePrice,
  DYNAMIC_PRICING_CONFIG, findCheapestPickupSlot,
} from "../lib/pricing";
import { requireAuth, getSession } from "../session";
import {
  now, generateQuoteNumber, isVendorOpenNow, nextOpenAt,
} from "../engines";
import type { Quote } from "@shared/schema";

const makeRouteLimiter = (max: number) => rateLimit({
  windowMs: 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || "unknown",
});

export function registerQuotesPricingRoutes(app: Express) {
  const quoteDynamicLimiter = makeRouteLimiter(20);
  const quotesLimiter = makeRouteLimiter(20);

  // P2-051: /api/service-types routes live in users.ts — removed duplicate registration here

  // ─────────────────────────────────────────────────────────
  //  QUOTES — REAL PRICING API
  // ─────────────────────────────────────────────────────────

  // ── Public: Get pricing tiers for display (DB-backed with constant fallback) ──
  app.get("/api/pricing/tiers", async (_req, res) => {
    try {
      const [smallBag, mediumBag, largeBag, xlBag] = await Promise.all([
        pricingConfig.getBagPrice("small_bag"),
        pricingConfig.getBagPrice("medium_bag"),
        pricingConfig.getBagPrice("large_bag"),
        pricingConfig.getBagPrice("xl_bag"),
      ]);
      const [fee48h, fee24h, feeSameDay, taxRate] = await Promise.all([
        pricingConfig.getDeliveryFee("48h"),
        pricingConfig.getDeliveryFee("24h"),
        pricingConfig.getDeliveryFee("same_day"),
        pricingConfig.getTaxRate(),
      ]);
      res.json({
        tiers: {
          small_bag: { ...smallBag, displayName: "Small Bag", description: PRICING_TIERS.small_bag.description },
          medium_bag: { ...mediumBag, displayName: "Medium Bag", description: PRICING_TIERS.medium_bag.description },
          large_bag: { ...largeBag, displayName: "Large Bag", description: PRICING_TIERS.large_bag.description },
          xl_bag: { ...xlBag, displayName: "XL Bag", description: PRICING_TIERS.xl_bag.description },
        },
        deliveryFees: {
          "48h": { fee: fee48h, label: "Standard (48h)" },
          "24h": { fee: fee24h, label: "Next Day (24h)" },
          "same_day": { fee: feeSameDay, label: "Same Day" },
        },
        taxRate,
        quoteValidityMinutes: QUOTE_VALIDITY_MINUTES,
      });
    } catch (err: any) {
      console.error("[Pricing] tiers endpoint error:", err?.message);
      res.json({
        tiers: PRICING_TIERS,
        deliveryFees: DELIVERY_FEES,
        taxRate: TAX_RATE,
        quoteValidityMinutes: QUOTE_VALIDITY_MINUTES,
      });
    }
  });

  // ── Public: Check serviceability ──
  // Real vendor-coverage check.
  // Replaces hardcoded NYC/NJ ZIP range with a check against approved active vendors.
  // Returns matchedVendors so callers can see whether ANY laundromat services the area
  // — not just whether the ZIP looks NYC-ish.
  // Shared handler — supports BOTH GET (query) and POST (body)
  const checkServiceabilityHandler = async (req: any, res: any) => {
    try {
      const src = req.method === "POST" ? (req.body || {}) : (req.query || {});
      const zip = src.zip ? String(src.zip) : undefined;
      const lat = src.lat != null ? Number(src.lat) : undefined;
      const lng = src.lng != null ? Number(src.lng) : undefined;
      const service = (src.service || src.serviceType) ? String(src.service || src.serviceType) : undefined;
      const addressStr = src.address ? String(src.address) : undefined;
      // If only address text was provided, try to extract a 5-digit ZIP from it
      const resolvedZip = zip || (addressStr ? (addressStr.match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1] : undefined);
      const addOnsRaw = src.addOns ? (Array.isArray(src.addOns) ? src.addOns.join(",") : String(src.addOns)) : "";
      const addOns = addOnsRaw ? addOnsRaw.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined;
      // D8: optional scheduled time for hours gating
      const scheduledForRaw = src.scheduledFor ? String(src.scheduledFor) : undefined;
      let scheduledForDate: Date | undefined;
      if (scheduledForRaw) {
        try { scheduledForDate = new Date(scheduledForRaw); } catch { /* ignore invalid */ }
      }

      if (!resolvedZip && (lat == null || lng == null)) {
        return res.status(400).json({ error: "zip OR (lat,lng) required", serviceable: false });
      }

      const coverage = await checkCoverage({ zip: resolvedZip, lat, lng, service, addOns });

      // D8: if coverage eligible but scheduledFor provided, check operating hours
      if (coverage.eligible && scheduledForDate) {
        const refDate = scheduledForDate;
        const vendors = await storage.getVendors();
        const openMatchedIds = coverage.matchedVendors.filter(vid => {
          const v = vendors.find(x => x.id === vid);
          return v ? isVendorOpenNow(v, refDate) : false;
        });
        if (openMatchedIds.length === 0) {
          // All matched vendors are closed at scheduledFor — find nextOpenAt across them
          let earliestNextOpen: string | null = null;
          for (const vid of coverage.matchedVendors) {
            const v = vendors.find(x => x.id === vid);
            if (!v) continue;
            const n = nextOpenAt(v, refDate);
            if (n && (!earliestNextOpen || n < earliestNextOpen)) earliestNextOpen = n;
          }
          return res.json({
            serviceable: false,
            servable: false,
            zip: resolvedZip || null,
            reason: "closed_at_scheduled_time",
            checkoutGated: coverage.checkoutGated || false,
            checkoutGateReason: coverage.checkoutGateReason || null,
            nextOpenAt: earliestNextOpen,
            matchedVendors: coverage.matchedVendors.length,
            details: coverage,
          });
        }
        return res.json({
          serviceable: true,
          servable: true,
          zip: resolvedZip || null,
          reason: null,
          checkoutGated: coverage.checkoutGated || false,
          checkoutGateReason: coverage.checkoutGateReason || null,
          matchedVendors: openMatchedIds.length,
          details: { ...coverage, matchedVendors: openMatchedIds },
        });
      }

      res.json({
        serviceable: coverage.eligible,
        servable: coverage.eligible,
        zip: resolvedZip || null,
        reason: coverage.eligible ? null : coverage.reason,
        checkoutGated: coverage.checkoutGated || false,
        checkoutGateReason: coverage.checkoutGateReason || null,
        matchedVendors: coverage.matchedVendors.length,
        details: coverage,
      });
    } catch (err: any) {
      console.error("[check-serviceability] error:", err);
      res.status(500).json({ error: "Failed to check serviceability", code: "INTERNAL_ERROR", serviceable: false });
    }
  };
  app.get("/api/quotes/check-serviceability", checkServiceabilityHandler);
  app.post("/api/quotes/check-serviceability", checkServiceabilityHandler);

  // ═══════════════════════════════════════════════════════════════
  //  SERVICE AREA REQUESTS — capture unserved-area demand
  // ═══════════════════════════════════════════════════════════════
  app.post("/api/service-area-requests", async (req, res) => {
    try {
      const Body = z.object({
        name: z.string().max(200).optional(),
        email: z.string().email().max(200).optional(),
        phone: z.string().max(40).optional(),
        address: z.string().max(500).optional(),
        city: z.string().max(120).optional(),
        state: z.string().max(60).optional(),
        zip: z.string().max(20).optional(),
        lat: z.number().optional(),
        lng: z.number().optional(),
        requestedService: z.string().max(60).optional(),
        requestedSpeed: z.string().max(40).optional(),
        requestedOptions: z.union([z.string(), z.array(z.string())]).optional(),
        source: z.string().max(80).optional(),
      }).strip();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const data = { ...parsed.data } as any;
      if (Array.isArray(data.requestedOptions)) data.requestedOptions = JSON.stringify(data.requestedOptions);
      if (!data.zip && !data.email && !data.phone) {
        return res.status(400).json({ error: "At least one of zip/email/phone required so we can contact you" });
      }
      const row = await storage.createServiceAreaRequest(data);
      res.status(201).json({ id: row.id, message: "Thanks — we'll let you know as soon as Offload is in your area." });
    } catch (err: any) {
      console.error("[service-area-requests] create error:", err);
      res.status(500).json({ error: "Failed to save request", code: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/admin/service-area-requests", requireAuth(["admin", "manager"]), async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const zip = req.query.zip ? String(req.query.zip) : undefined;
      const state = req.query.state ? String(req.query.state) : undefined;
      const limit = Number(req.query.limit) || 200;
      const offset = Number(req.query.offset) || 0;
      const rows = await storage.getServiceAreaRequests({ status, zip, state, limit, offset });
      res.json(rows);
    } catch (err: any) {
      console.error("[admin/service-area-requests] error:", err);
      res.status(500).json({ error: "Failed to load requests", code: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/admin/service-area-requests/demand", requireAuth(["admin", "manager"]), async (_req, res) => {
    try {
      const demand = await storage.getServiceAreaDemandByZip();
      res.json(demand);
    } catch (err: any) {
      console.error("[admin/service-area-requests/demand] error:", err);
      res.status(500).json({ error: "Failed to load demand", code: "INTERNAL_ERROR" });
    }
  });

  app.patch("/api/admin/service-area-requests/:id", requireAuth(["admin"]), async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
      const Body = z.object({
        status: z.enum(["new", "contacted", "converted", "closed"]).optional(),
        notes: z.string().max(2000).optional(),
      }).strip();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const updated = await storage.updateServiceAreaRequest(id, parsed.data);
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (err: any) {
      console.error("[admin/service-area-requests] update error:", err);
      res.status(500).json({ error: "Failed to update", code: "INTERNAL_ERROR" });
    }
  });

  // ── Public: Dynamic quote (Uber-style breakdown + cheapest-window recommendation) ──
  // No persistence — just returns the price breakdown for live UI updates as the customer
  // tweaks floor / elevator / handoff / window / scheduled time / laundromat choice.
  app.post("/api/quote/dynamic", quoteDynamicLimiter, async (req, res) => {
    try {
      // OD-P1 / OD-P3: accept `speedTier` as an alias for `deliverySpeed` and
      // accept any tier alias supported by TIER_NAME_MAP (xlarge / xl / xl_bag / extra_large).
      const DynamicQuoteBody = z.object({
        tierName: z.string().min(1),
        deliverySpeed: z.string().optional(),
        speedTier: z.string().optional(),     // alias — will be folded into deliverySpeed below
        serviceType: z.string().optional(),
        vendorId: z.union([z.number(), z.string()]).optional(),
        pickupAddress: z.string().optional(),
        pickupLat: z.number().optional().nullable(),
        pickupLng: z.number().optional().nullable(),
        addOns: z.array(z.any()).optional(),
        promoCode: z.string().optional(),
        pickupFloor: z.number().optional().nullable(),
        pickupHasElevator: z.union([z.boolean(), z.number()]).optional().nullable(),
        pickupHandoff: z.string().optional(),
        pickupWindowMinutes: z.number().optional().nullable(),
        scheduledPickup: z.string().optional(),
        vendorChoiceMode: z.string().optional(),
        recommendCheapestWindow: z.boolean().optional(),
        view: z.enum(["customer", "admin"]).optional(),
      }).strip();
      const parsed = DynamicQuoteBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const {
        tierName, deliverySpeed: rawDeliverySpeed, speedTier, serviceType, vendorId,
        pickupAddress, pickupLat, pickupLng,
        addOns, promoCode,
        pickupFloor, pickupHasElevator, pickupHandoff, pickupWindowMinutes,
        scheduledPickup, vendorChoiceMode,
        recommendCheapestWindow,
        view,
      } = parsed.data;
      // OD-P1: fold speedTier alias into deliverySpeed (deliverySpeed wins if both passed)
      const deliverySpeed = rawDeliverySpeed ?? speedTier;

      // Customer-facing UI gets a simplified view; admin/laundromat/driver dashboards
      // get the full breakdown (vendor name, surge label, distance, traffic, etc.).
      // Default to customer view since this endpoint is publicly callable.
      const viewMode: "customer" | "admin" = view === "admin" ? "admin" : "customer";

      const breakdown = await calculateQuotePrice({
        tierName,
        deliverySpeed: deliverySpeed || "48h",
        serviceType: serviceType || undefined,
        vendorId: vendorId ? Number(vendorId) : undefined,
        pickupAddress: pickupAddress || undefined,
        pickupLat: pickupLat != null ? Number(pickupLat) : undefined,
        pickupLng: pickupLng != null ? Number(pickupLng) : undefined,
        addOns: addOns || [],
        promoCode: promoCode || undefined,
        pickupFloor: pickupFloor != null ? Number(pickupFloor) : undefined,
        pickupHasElevator: pickupHasElevator != null ? !!pickupHasElevator : undefined,
        pickupHandoff: pickupHandoff || undefined,
        pickupWindowMinutes: pickupWindowMinutes != null ? Number(pickupWindowMinutes) : undefined,
        scheduledPickup: scheduledPickup || undefined,
        vendorChoiceMode: vendorChoiceMode || undefined,
      });

      // Optionally compute the cheapest pickup slot in the next ~12 hrs
      let cheapestSlot: { scheduledPickup: string; trafficLevel: string; ratio: number; multiplier: number } | null = null;
      if (recommendCheapestWindow && pickupLat != null && pickupLng != null) {
        try {
          // Resolve nearest active vendor for slot scoring
          const vendors = (await storage.getActiveVendors()).filter(v => v.lat && v.lng);
          let pick = vendors[0];
          let pickDist = pick ? distanceMiles(Number(pickupLat), Number(pickupLng), pick.lat!, pick.lng!) : Infinity;
          for (const v of vendors) {
            const d = distanceMiles(Number(pickupLat), Number(pickupLng), v.lat!, v.lng!);
            if (d < pickDist) { pick = v; pickDist = d; }
          }
          if (pick) {
            cheapestSlot = await findCheapestPickupSlot({
              pickupLat: Number(pickupLat),
              pickupLng: Number(pickupLng),
              vendorLat: pick.lat!,
              vendorLng: pick.lng!,
              pickupFloor: pickupFloor != null ? Number(pickupFloor) : 1,
              pickupHasElevator: pickupHasElevator != null ? !!pickupHasElevator : true,
              pickupHandoff: pickupHandoff || "curbside",
              pickupWindowMinutes: pickupWindowMinutes != null ? Number(pickupWindowMinutes) : 30,
            }, 12);
          }
        } catch (e: any) {
          console.warn("[/api/quote/dynamic] cheapest-slot lookup failed:", e?.message);
        }
      }

      // ── View-aware response ──
      // For customers we hide vendor identity, distance, traffic, and surge labels.
      // We also collapse all logistics line items into a single "Pickup adjustments"
      // row so the UI stays uncluttered.
      if (viewMode === "customer") {
        const lineItems = Array.isArray(breakdown.lineItems) ? breakdown.lineItems : [];
        const logisticsItems = lineItems.filter((li: any) => li.type === "logistics" || (li.type === "discount" && !String(li.label || "").startsWith("Promo discount")));
        const logisticsNet = Math.round(logisticsItems.reduce((sum: number, li: any) => sum + (li.amount || 0), 0) * 100) / 100;

        // Service line, delivery, addons, promo, tax — keep these as-is.
        const customerLines: Array<{ label: string; amount: number; type: string }> = [];
        for (const li of lineItems) {
          if (li.type === "logistics") continue;          // collapsed
          if (li.type === "discount" && !String(li.label || "").startsWith("Promo discount")) continue; // collapsed
          customerLines.push(li);
        }
        // Insert a single rolled-up adjustments row right after the delivery line
        if (logisticsNet !== 0) {
          const insertAt = customerLines.findIndex((li) => li.type === "tax");
          const rollup = {
            label: logisticsNet >= 0 ? "Pickup adjustments" : "Pickup savings",
            amount: logisticsNet,
            type: logisticsNet >= 0 ? "logistics" : "discount",
          };
          if (insertAt === -1) customerLines.push(rollup);
          else customerLines.splice(insertAt, 0, rollup);
        }

        // Strip vendor-side fields from the breakdown
        const customerBreakdown: any = {
          laundryServicePrice: breakdown.laundryServicePrice,
          deliveryFee: breakdown.deliveryFee,
          addOnsTotal: breakdown.addOnsTotal,
          // single rollup amount for UI "Pickup adjustments"
          pickupAdjustments: logisticsNet,
          subtotal: breakdown.subtotal,
          taxRate: breakdown.taxRate,
          taxAmount: breakdown.taxAmount,
          discount: breakdown.discount,
          total: breakdown.total,
          lineItems: customerLines,
          tierName: breakdown.tierName,
          tierFlatPrice: breakdown.tierFlatPrice,
          tierMaxWeight: breakdown.tierMaxWeight,
          deliverySpeed: breakdown.deliverySpeed,
        };

        // Cheapest-slot banner: keep timing info but drop the traffic level chatter
        const customerCheapest = cheapestSlot ? {
          scheduledPickup: cheapestSlot.scheduledPickup,
          multiplier: cheapestSlot.multiplier,
        } : null;

        return res.json({
          breakdown: customerBreakdown,
          cheapestSlot: customerCheapest,
        });
      }

      // Admin / internal full breakdown
      res.json({
        breakdown,
        cheapestSlot,
        config: {
          distance: DYNAMIC_PRICING_CONFIG.distance,
          floor: DYNAMIC_PRICING_CONFIG.floor,
          handoff: DYNAMIC_PRICING_CONFIG.handoff,
          window: DYNAMIC_PRICING_CONFIG.window,
        },
      });
    } catch (err: any) {
      console.error("[/api/quote/dynamic] error:", err);
      res.status(400).json({ error: "Failed to generate dynamic quote", code: "QUOTE_ERROR" });
    }
  });

  // ── Public: Create a quote (no auth required for website) ──
  app.post("/api/quotes", quotesLimiter, async (req, res) => {
    try {
      // OD-P1: accept `speedTier` alias for `deliverySpeed`
      const QuoteBody = z.object({
        pickupAddress: z.string().min(1),
        pickupCity: z.string().optional().nullable(),
        pickupState: z.string().optional().nullable(),
        pickupZip: z.string().optional().nullable(),
        pickupLat: z.number().optional().nullable(),
        pickupLng: z.number().optional().nullable(),
        deliveryAddress: z.string().optional().nullable(),
        serviceType: z.string().optional(),
        tierName: z.string().min(1),
        deliverySpeed: z.string().optional(),
        speedTier: z.string().optional(),     // alias — folded into deliverySpeed below
        vendorId: z.union([z.number(), z.string()]).optional(),
        addOns: z.array(z.any()).optional(),
        promoCode: z.string().optional(),
        sessionId: z.string().optional().nullable(),
        idempotencyKey: z.string().optional(),
        pickupFloor: z.number().optional().nullable(),
        pickupHasElevator: z.union([z.boolean(), z.number()]).optional().nullable(),
        pickupHandoff: z.string().optional(),
        pickupWindowMinutes: z.number().optional().nullable(),
        scheduledPickup: z.string().optional(),
        vendorChoiceMode: z.string().optional(),
        // Wave 2: separation & wash preference fields
        separated: z.boolean().optional(),
        clothing_types: z.array(z.string()).optional(),
        wash_preferences: z.any().optional(),
        // B2: Signature Wash per-bag array
        bags: z.array(z.object({ size: z.string(), quantity: z.number().int().nonnegative() })).optional(),
      }).strip();
      const parsed = QuoteBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Validation failed", code: "VALIDATION_ERROR", issues: parsed.error.issues });
      }
      const { pickupAddress, pickupCity, pickupState, pickupZip, pickupLat, pickupLng,
        deliveryAddress, serviceType, tierName,
        deliverySpeed: rawQDeliverySpeed, speedTier: qSpeedTier, vendorId,
        addOns, promoCode, sessionId, idempotencyKey,
        pickupFloor, pickupHasElevator, pickupHandoff, pickupWindowMinutes,
        scheduledPickup, vendorChoiceMode,
        separated: qSeparated, clothing_types: qClothingTypes, wash_preferences: qWashPreferences,
        bags: qBags } = parsed.data;
      // OD-P1: fold speedTier alias into deliverySpeed (deliverySpeed wins if both passed)
      const deliverySpeed = rawQDeliverySpeed ?? qSpeedTier;

      // Idempotency check
      if (idempotencyKey) {
        const existing = await storage.getQuoteByIdempotencyKey(idempotencyKey);
        if (existing) return res.json(existing);
      }

      // Get authenticated user if available (optional)
      let customerId: number | null = null;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const session = await getSession(authHeader.split(" ")[1]);
        if (session) customerId = session.userId;
      }

      // Calculate price
      const breakdown = await calculateQuotePrice({
        tierName,
        deliverySpeed: deliverySpeed || "48h",
        serviceType: serviceType || undefined,
        vendorId: vendorId ? Number(vendorId) : undefined,
        pickupLat: pickupLat ? Number(pickupLat) : undefined,
        pickupLng: pickupLng ? Number(pickupLng) : undefined,
        pickupAddress,
        addOns: addOns || [],
        promoCode: promoCode || undefined,
        pickupFloor: pickupFloor != null ? Number(pickupFloor) : undefined,
        pickupHasElevator: pickupHasElevator != null ? !!pickupHasElevator : undefined,
        pickupHandoff: pickupHandoff || undefined,
        pickupWindowMinutes: pickupWindowMinutes != null ? Number(pickupWindowMinutes) : undefined,
        scheduledPickup: scheduledPickup || undefined,
        vendorChoiceMode: vendorChoiceMode || undefined,
        // B2: pass bags array for Signature Wash premium
        bags: qBags as Array<{ size: "small" | "medium" | "large" | "xl"; quantity: number }> | undefined,
      });

      // Wave 2 + D4 spec: compute separation fee if separated=true.
      // Default is $0 per D4 owner decision — admin sets the per-vendor amount in pricing-config.
      // Only attach a line item when the resolved fee is > 0.
      let separationFeeCents = 0;
      if (qSeparated) {
        let resolvedVendor = vendorId ? await storage.getVendor(Number(vendorId)) : null;
        const vendorFee = (resolvedVendor as any)?.separationFeeCents;
        separationFeeCents = typeof vendorFee === "number" ? vendorFee : 0; // D4: platform default $0

        if (separationFeeCents > 0) {
          const sepFeeDollars = separationFeeCents / 100;
          breakdown.subtotal = Math.round((breakdown.subtotal + sepFeeDollars) * 100) / 100;
          breakdown.total = Math.round((breakdown.total + sepFeeDollars) * 100) / 100;
          breakdown.lineItems = [
            ...breakdown.lineItems,
            { label: "Separation Fee", amount: sepFeeDollars, type: "separation_fee" },
          ];
        }
      }

      // Calculate expiry
      const expiresAt = new Date(Date.now() + QUOTE_VALIDITY_MINUTES * 60 * 1000).toISOString();
      const ts = now();

      // Resolve vendor name if selected
      let vendorName: string | null = null;
      let isPreferredVendor = 0;
      if (vendorId) {
        const v = await storage.getVendor(Number(vendorId));
        if (v) { vendorName = v.name; isPreferredVendor = 1; }
      }

      const quote = await storage.createQuote({
        quoteNumber: generateQuoteNumber(),
        customerId,
        sessionId: sessionId || null,
        publicToken: randomBytes(16).toString("hex"),
        status: "quoted",
        pickupAddress,
        pickupCity: pickupCity || null,
        pickupState: pickupState || null,
        pickupZip: pickupZip || null,
        pickupLat: pickupLat ? Number(pickupLat) : null,
        pickupLng: pickupLng ? Number(pickupLng) : null,
        deliveryAddress: deliveryAddress || null,
        serviceType: serviceType || "wash_fold",
        tierName: breakdown.tierName,
        tierFlatPrice: breakdown.tierFlatPrice,
        tierMaxWeight: breakdown.tierMaxWeight,
        overageRate: breakdown.overageRate,
        deliverySpeed: breakdown.deliverySpeed,
        vendorId: vendorId ? Number(vendorId) : null,
        vendorName,
        isPreferredVendor: !!isPreferredVendor,
        laundryServicePrice: breakdown.laundryServicePrice,
        speedSurcharge: breakdown.speedSurcharge,
        deliveryFee: breakdown.deliveryFee,
        preferredVendorSurcharge: breakdown.preferredVendorSurcharge,
        addOnsTotal: breakdown.addOnsTotal,
        // ── Uber-style dynamic logistics persistence ──
        pickupFloor: pickupFloor != null ? Number(pickupFloor) : null,
        pickupHasElevator: pickupHasElevator != null ? !!pickupHasElevator : true,
        pickupHandoff: pickupHandoff || "curbside",
        pickupWindowMinutes: pickupWindowMinutes != null ? Number(pickupWindowMinutes) : 30,
        pickupDistanceMiles: breakdown.pickupDistanceMiles,
        pickupDistanceFee: breakdown.pickupDistanceFee,
        floorFee: breakdown.floorFee,
        handoffFee: breakdown.handoffFee,
        trafficMultiplier: breakdown.trafficMultiplier,
        windowDiscount: breakdown.windowDiscount,
        vendorChoiceMode: vendorChoiceMode || "auto",
        // ── totals ──
        subtotal: breakdown.subtotal,
        taxRate: breakdown.taxRate,
        taxAmount: breakdown.taxAmount,
        discount: breakdown.discount,
        total: breakdown.total,
        lineItemsJson: JSON.stringify(breakdown.lineItems),
        addOnsJson: addOns ? JSON.stringify(addOns) : null,
        expiresAt,
        promoCode: promoCode || null,
        promoDiscount: breakdown.discount,
        idempotencyKey: idempotencyKey || null,
        createdAt: ts,
        updatedAt: ts,
      });

      // Audit log
      await storage.createPricingAuditEntry({
        action: "quote_created",
        details: JSON.stringify({ quoteId: quote.id, quoteNumber: quote.quoteNumber, total: quote.total, tierName: quote.tierName }),
        actorId: customerId,
        actorRole: customerId ? "customer" : "anonymous",
        timestamp: ts,
      });

      // Return the quote with parsed line items for frontend display
      res.status(201).json({
        ...quote,
        lineItems: breakdown.lineItems,
        // Wave 2: include separation info if present
        ...(qSeparated ? { separation_fee_cents: separationFeeCents, separated: true } : {}),
        ...(qClothingTypes ? { clothing_types: qClothingTypes } : {}),
      });
    } catch (err: any) {
      console.error("[/api/quotes] error:", err);
      res.status(400).json({ error: "Failed to create quote", code: "QUOTE_ERROR" });
    }
  });

  async function sendQuoteResponse(quote: Quote, res: Response) {
    if (["draft", "quoted"].includes(quote.status) && new Date(quote.expiresAt) < new Date()) {
      const expired = await storage.updateQuote(quote.id, { status: "expired", updatedAt: now() });
      const q = expired || { ...quote, status: "expired" };
      return res.json({ ...q, lineItems: quote.lineItemsJson ? JSON.parse(quote.lineItemsJson) : [] });
    }
    return res.json({
      ...quote,
      lineItems: quote.lineItemsJson ? JSON.parse(quote.lineItemsJson) : [],
    });
  }

  // ── Public quote retrieval by cryptographic token ──
  app.get("/api/quotes/by-token/:token", async (req, res) => {
    const token = String(req.params.token || "");
    if (!/^[a-f0-9]{32}$/i.test(token)) return res.status(404).json({ error: "Quote not found" });
    const quote = await storage.getQuoteByPublicToken(token);
    if (!quote) return res.status(404).json({ error: "Quote not found" });
    return sendQuoteResponse(quote, res);
  });

  // ── Legacy ID path is auth-only to prevent sequential ID enumeration ──
  app.get("/api/quotes/:id", requireAuth(), async (req, res) => {
    const quote = await storage.getQuote(Number(String(req.params.id)));
    if (!quote) return res.status(404).json({ error: "Quote not found" });
    const authUser = (req as any).currentUser;
    // P2-012: customer-role users can only access their own quotes; deny null-customerId quotes
    if (authUser.role === "customer" && (!quote.customerId || quote.customerId !== authUser.id)) {
      return res.status(403).json({ error: "Access denied" });
    }
    return sendQuoteResponse(quote, res);
  });
}
