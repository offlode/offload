import { PRICING_TIERS, DELIVERY_FEES, TAX_RATE as SCHEMA_TAX_RATE } from "@shared/schema";
import { storage } from "../storage";
import { pricingConfig } from "../pricing-config-service";
import { distanceMatrix, isGoogleMapsConfigured } from "../maps";
import type { Vendor } from "@shared/schema";

// ════════════════════════════════════════════════════════════════
//  UTILITY
// ════════════════════════════════════════════════════════════════

// Haversine distance in miles
export function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ════════════════════════════════════════════════════════════════
//  PRICING ENGINE v2 — Real Quote-Based Pricing
// ════════════════════════════════════════════════════════════════

export const TAX_RATE = SCHEMA_TAX_RATE; // 0.08875 NY combined sales tax

// Map website / external tier names to schema tier names.
// Accepts both human-readable and machine forms so external API consumers
// and forms cannot trip on naming drift (e.g. xlarge vs xl vs xl_bag).
export const TIER_NAME_MAP: Record<string, string> = {
  small: "small_bag", small_bag: "small_bag",
  medium: "medium_bag", medium_bag: "medium_bag",
  large: "large_bag", large_bag: "large_bag",
  // OD-P3: add xlarge / extralarge / xLarge aliases — all normalize to xl_bag
  xl: "xl_bag", xl_bag: "xl_bag", extra_large: "xl_bag",
  xlarge: "xl_bag", extralarge: "xl_bag", xLarge: "xl_bag", XL: "xl_bag", XLARGE: "xl_bag",
};

// Map external speed aliases to canonical schema speed names.
// Accepts camelCase, lowercased, kebab/snake variants — keeps website,
// customer app, and external API consumers in lock-step.
export function normalizeDeliverySpeed(input: string | null | undefined): "48h" | "24h" | "same_day" {
  if (!input) return "48h";
  const v = String(input).trim();
  // direct schema values
  if (v === "48h" || v === "24h" || v === "same_day") return v;
  // common aliases
  const lc = v.toLowerCase();
  if (["standard", "express", "48hr", "48-hr", "48 hour", "two_day", "2day", "2 day"].includes(lc)) return "48h";
  if (["express_24h", "next_day", "nextday", "24hr", "24-hr", "24 hour"].includes(lc)) return "24h";
  if (["sameday", "same-day", "same day", "same_day_express", "sd"].includes(lc)) return "same_day";
  // unknown — throw so the caller learns about the typo instead of silently defaulting
  throw new Error(`Invalid delivery speed: ${input}. Valid options: 48h, 24h, same_day (aliases: standard/express, express_24h/next_day, sameDay/same-day)`);
}

export interface QuotePriceBreakdown {
  laundryServicePrice: number;
  speedSurcharge: number;
  deliveryFee: number;
  preferredVendorSurcharge: number;
  addOnsTotal: number;
  // Dynamic logistics (Uber-style)
  pickupDistanceMiles: number;
  pickupDistanceFee: number;
  floorFee: number;
  handoffFee: number;
  trafficMultiplier: number;
  trafficRatio: number;
  trafficLevel: string;
  windowDiscount: number;
  windowDiscountRate: number;
  surgeMultiplier: number;
  surgeTier: string;
  surgeReason: string;
  // D9: demand multiplier
  demandMultiplier: number;
  demandReason: string;
  logisticsBase: number;
  logisticsTotal: number;
  // ── totals ──
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  lineItems: Array<{ label: string; amount: number; type: string }>;
  tierName: string;
  tierFlatPrice: number;
  tierMaxWeight: number;
  overageRate: number;
  deliverySpeed: string;
  vendorChoiceMode?: string;
  recommendedVendorId?: number | null;
  recommendedVendorName?: string | null;
}

export async function calculateQuotePrice(input: {
  tierName: string;
  deliverySpeed: string;
  serviceType?: string;
  vendorId?: number;
  pickupLat?: number;
  pickupLng?: number;
  addOns?: Array<{ id: number; qty: number }>;
  promoCode?: string;
  // Uber-style dynamic logistics inputs
  pickupFloor?: number | null;
  pickupHasElevator?: boolean | number | null;
  pickupHandoff?: string | null;          // "curbside" | "door"
  pickupWindowMinutes?: number | null;    // 30 | 120 | 240
  scheduledPickup?: string | null;        // ISO timestamp
  vendorLat?: number;
  vendorLng?: number;
  vendorAddress?: string;
  pickupAddress?: string;
  vendorChoiceMode?: string;              // auto | nearest | preferred | rated
}): Promise<QuotePriceBreakdown> {
  // 1. Resolve tier
  const normalizedTier = TIER_NAME_MAP[input.tierName] || input.tierName;
  const tierConst = PRICING_TIERS[normalizedTier as keyof typeof PRICING_TIERS];
  if (!tierConst) throw new Error(`Unknown pricing tier: ${input.tierName}`);
  const tier = await pricingConfig.getBagPrice(normalizedTier);

  // 2. Laundry service price (flat rate from tier, adjusted by service type)
  const serviceMultiplier = await pricingConfig.getServiceMultiplier(input.serviceType || 'wash_fold');
  const laundryServicePrice = Math.round(tier.flatPrice * serviceMultiplier * 100) / 100;

  // 3. Delivery fee (flat rate based on speed)
  // OD-P1: route through normalizeDeliverySpeed so aliases like
  // sameDay / same-day / next_day all resolve to the canonical key.
  const speed = normalizeDeliverySpeed(input.deliverySpeed);
  if (!DELIVERY_FEES[speed as keyof typeof DELIVERY_FEES]) {
    throw new Error(`Invalid delivery speed: ${speed}. Valid options: ${Object.keys(DELIVERY_FEES).join(", ")}`);
  }
  const deliveryFee = await pricingConfig.getDeliveryFee(speed);

  // 4. Speed surcharge: $0 — speed cost is fully captured in the delivery fee
  const speedSurcharge = 0;

  // 5. Preferred vendor surcharge
  let preferredVendorSurcharge = 0;
  if (input.vendorId && input.pickupLat && input.pickupLng) {
    const selectedVendor = await storage.getVendor(input.vendorId);
    if (selectedVendor && selectedVendor.lat && selectedVendor.lng) {
      // Find nearest eligible vendor for comparison
      const activeVendors = (await storage.getActiveVendors()).filter(v => v.lat && v.lng);
      if (activeVendors.length > 0) {
        const nearestDist = Math.min(...activeVendors.map(v => distanceMiles(input.pickupLat!, input.pickupLng!, v.lat!, v.lng!)));
        const selectedDist = distanceMiles(input.pickupLat, input.pickupLng, selectedVendor.lat, selectedVendor.lng);
        const deltaMiles = Math.max(0, selectedDist - Math.max(nearestDist, 1)); // Free within 1-mile radius
        preferredVendorSurcharge = Math.min(15, Math.round(deltaMiles * 2 * 100) / 100); // $2/mile, cap $15
      }
    }
  }

  // 6. Add-ons
  let addOnsTotal = 0;
  const addOnItems: Array<{ id: number; name: string; price: number; qty: number }> = [];
  if (input.addOns && input.addOns.length > 0) {
    for (const ao of input.addOns) {
      const addon = await storage.getAddOn(ao.id);
      if (addon) {
        const lineTotal = Math.round(addon.price * ao.qty * 100) / 100;
        addOnsTotal += lineTotal;
        addOnItems.push({ id: addon.id, name: addon.displayName, price: addon.price, qty: ao.qty });
      }
    }
  }

  // 6b. Resolve recommended vendor (for logistics distance + traffic)
  // Used when caller didn't pass vendorLat/Lng directly.
  let resolvedVendorLat: number | undefined = input.vendorLat;
  let resolvedVendorLng: number | undefined = input.vendorLng;
  let resolvedVendorAddress: string | undefined = input.vendorAddress;
  let recommendedVendorId: number | null = null;
  let recommendedVendorName: string | null = null;
  const vendorChoiceMode = input.vendorChoiceMode || "auto";

  if ((!resolvedVendorLat || !resolvedVendorLng) && input.pickupLat != null && input.pickupLng != null) {
    try {
      const activeVendors = (await storage.getActiveVendors()).filter(v => v.lat && v.lng);
      if (activeVendors.length > 0) {
        let pickVendor = null as Vendor | null;
        if (input.vendorId) {
          pickVendor = await storage.getVendor(input.vendorId) || null;
        } else if (vendorChoiceMode === "rated") {
          // Highest-rated within reason
          pickVendor = [...activeVendors].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0] || null;
        } else {
          // Default "auto" or "nearest" — pick closest by haversine
          let best = activeVendors[0];
          let bestDist = distanceMiles(input.pickupLat, input.pickupLng, best.lat!, best.lng!);
          for (const v of activeVendors) {
            const d = distanceMiles(input.pickupLat, input.pickupLng, v.lat!, v.lng!);
            if (d < bestDist) { best = v; bestDist = d; }
          }
          pickVendor = best;
        }
        if (pickVendor) {
          resolvedVendorLat = pickVendor.lat || undefined;
          resolvedVendorLng = pickVendor.lng || undefined;
          resolvedVendorAddress = pickVendor.address || undefined;
          recommendedVendorId = pickVendor.id;
          recommendedVendorName = pickVendor.name;
        }
      }
    } catch (e: any) {
      console.warn("[calculateQuotePrice] vendor resolution failed:", e?.message);
    }
  }

  // 6c. Dynamic logistics breakdown (distance fee, floor fee, handoff fee, traffic, window discount)
  const logistics = await computeLogisticsBreakdown({
    pickupLat: input.pickupLat,
    pickupLng: input.pickupLng,
    vendorLat: resolvedVendorLat,
    vendorLng: resolvedVendorLng,
    pickupAddress: input.pickupAddress,
    vendorAddress: resolvedVendorAddress,
    pickupFloor: input.pickupFloor ?? 1,
    pickupHasElevator: input.pickupHasElevator ?? 1,
    pickupHandoff: input.pickupHandoff ?? "curbside",
    pickupWindowMinutes: input.pickupWindowMinutes ?? 30,
    scheduledPickup: input.scheduledPickup ?? null,
  });

  // 6d. Surge pricing tier (time-of-day / day-of-week multiplier on logistics only)
  // Uses DB-driven holiday list (pricing_config.surge_holidays) with code fallback.
  const surge = await getSurgePricingTierAsync(input.scheduledPickup || undefined);
  const logisticsAfterSurge = Math.round(logistics.logisticsTotal * surge.multiplier * 100) / 100;

  // 6e. D9 — Demand multiplier (admin-configurable, capped, applied to logistics only)
  // Read admin config: demand_multiplier_enabled (default false), demand_multiplier_cap (default 1.35)
  const demandEnabled = await pricingConfig.getJSON<boolean>("demand_multiplier_enabled", false);
  const demandCap = await pricingConfig.getJSON<number>("demand_multiplier_cap", 1.35);
  let rawDemandMultiplier = 1.0;
  let demandReason = "Demand pricing (standard)";
  if (demandEnabled) {
    rawDemandMultiplier = await getDemandMultiplier(input.serviceType || "wash_fold");
    // Clamp to [0.85, cap]
    rawDemandMultiplier = Math.max(0.85, Math.min(demandCap, rawDemandMultiplier));
    if (rawDemandMultiplier > 1.0) demandReason = "High demand pricing";
    else if (rawDemandMultiplier < 1.0) demandReason = "Low demand discount";
    else demandReason = "Demand pricing (standard)";
  }
  const logisticsAfterDemand = Math.round(logisticsAfterSurge * rawDemandMultiplier * 100) / 100;
  const demandDelta = Math.round((logisticsAfterDemand - logisticsAfterSurge) * 100) / 100;

  // 7. Subtotal (laundry + preferred surcharge + addons + dynamic logistics)
  // Note: deliveryFee is intentionally EXCLUDED from the tax base — NY does not tax
  // separately stated delivery charges, and the direct /api/orders path uses the same rule.
  // This keeps the public-quote path and the direct-order path in sync.
  const taxableSubtotal = Math.round(
    (laundryServicePrice + speedSurcharge + preferredVendorSurcharge + addOnsTotal + logisticsAfterDemand) * 100
  ) / 100;
  const subtotal = Math.round((taxableSubtotal + deliveryFee) * 100) / 100;

  // 8. Tax (computed on taxableSubtotal — delivery excluded)
  const dbTaxRate = await pricingConfig.getTaxRate();
  const taxAmount = Math.round(taxableSubtotal * dbTaxRate * 100) / 100;

  // 9. Promo discount
  let discount = 0;
  if (input.promoCode) {
    const promo = await storage.getPromoCode(input.promoCode);
    if (promo && promo.isActive && (!promo.expiresAt || new Date(promo.expiresAt) > new Date())) {
      if (!promo.minOrderAmount || (subtotal + taxAmount) >= promo.minOrderAmount) {
        if (!promo.maxUses || (promo.usedCount ?? 0) < promo.maxUses) {
          if (promo.type === "percentage") {
            discount = Math.round((subtotal + taxAmount) * (promo.value / 100) * 100) / 100;
          } else if (promo.type === "fixed") {
            discount = Math.min(promo.value, subtotal + taxAmount);
          } else if (promo.type === "free_delivery") {
            discount = deliveryFee;
          }
        }
      }
    }
  }

  // 10. Total
  const total = Math.max(0, Math.round((subtotal + taxAmount - discount) * 100) / 100);

  // Build line items for display
  const deliveryFeeLabel = DELIVERY_FEES[speed as keyof typeof DELIVERY_FEES]?.label || `Delivery (${speed})`;
  const lineItems: Array<{ label: string; amount: number; type: string }> = [
    { label: `${tierConst.displayName} — ${tierConst.description}`, amount: laundryServicePrice, type: "service" },
  ];
  if (deliveryFee > 0) {
    lineItems.push({ label: deliveryFeeLabel, amount: deliveryFee, type: "delivery" });
  } else {
    lineItems.push({ label: "Free Pickup & Delivery", amount: 0, type: "delivery" });
  }
  if (preferredVendorSurcharge > 0) {
    lineItems.push({ label: "Preferred laundromat surcharge", amount: preferredVendorSurcharge, type: "logistics" });
  }
  // Logistics line items (Uber-style)
  if (logistics.distanceFee > 0) {
    lineItems.push({ label: `Pickup distance (${logistics.distanceMiles.toFixed(2)} mi)`, amount: logistics.distanceFee, type: "logistics" });
  }
  if (logistics.floorFee > 0) {
    lineItems.push({ label: `Walk-up floor fee`, amount: logistics.floorFee, type: "logistics" });
  }
  if (logistics.handoffFee > 0) {
    lineItems.push({ label: `Door handoff`, amount: logistics.handoffFee, type: "logistics" });
  }
  if (logistics.trafficMultiplier > 1.0 && logistics.logisticsBase > 0) {
    const trafficSurcharge = Math.round((logistics.logisticsBase * (logistics.trafficMultiplier - 1)) * 100) / 100;
    if (trafficSurcharge > 0) {
      lineItems.push({ label: `Traffic surcharge (${logistics.trafficLevel})`, amount: trafficSurcharge, type: "logistics" });
    }
  }
  if (logistics.windowDiscount > 0) {
    lineItems.push({ label: `Flexible-window discount (${Math.round(logistics.windowDiscountRate * 100)}%)`, amount: -logistics.windowDiscount, type: "discount" });
  }
  if (surge.multiplier !== 1.0 && logistics.logisticsTotal > 0) {
    const surgeDelta = Math.round((logistics.logisticsTotal * (surge.multiplier - 1)) * 100) / 100;
    if (surgeDelta !== 0) {
      lineItems.push({ label: `${surge.reason} (${surge.tier})`, amount: surgeDelta, type: surgeDelta > 0 ? "logistics" : "discount" });
    }
  }
  // D9: Demand pricing line item — only shown when delta != 0
  if (demandDelta !== 0) {
    lineItems.push({ label: demandReason, amount: demandDelta, type: demandDelta > 0 ? "logistics" : "discount" });
  }
  for (const ao of addOnItems) {
    lineItems.push({ label: `${ao.name} x${ao.qty}`, amount: ao.price * ao.qty, type: "addon" });
  }
  lineItems.push({ label: `Tax (${(dbTaxRate * 100).toFixed(3)}%)`, amount: taxAmount, type: "tax" });
  if (discount > 0) {
    lineItems.push({ label: `Promo discount (${input.promoCode})`, amount: -discount, type: "discount" });
  }

  return {
    laundryServicePrice, speedSurcharge, deliveryFee, preferredVendorSurcharge,
    addOnsTotal,
    pickupDistanceMiles: logistics.distanceMiles,
    pickupDistanceFee: logistics.distanceFee,
    floorFee: logistics.floorFee,
    handoffFee: logistics.handoffFee,
    trafficMultiplier: logistics.trafficMultiplier,
    trafficRatio: logistics.trafficRatio,
    trafficLevel: logistics.trafficLevel,
    windowDiscount: logistics.windowDiscount,
    windowDiscountRate: logistics.windowDiscountRate,
    surgeMultiplier: surge.multiplier,
    surgeTier: surge.tier,
    surgeReason: surge.reason,
    logisticsBase: logistics.logisticsBase,
    logisticsTotal: logisticsAfterDemand,
    demandMultiplier: rawDemandMultiplier,
    demandReason,
    subtotal, taxRate: dbTaxRate, taxAmount, discount, total,
    lineItems, tierName: normalizedTier, tierFlatPrice: tier.flatPrice,
    tierMaxWeight: tier.maxWeight, overageRate: tier.overageRate, deliverySpeed: speed,
    vendorChoiceMode,
    recommendedVendorId,
    recommendedVendorName,
  };
}

// Legacy pricing function — used by existing POST /api/orders for backward compat
export async function calculatePricing(bags: any[], deliverySpeed: string) {
  let subtotal = 0;
  for (const bag of bags) {
    const tierKey = TIER_NAME_MAP[bag.type];
    if (tierKey) {
      const bagPrice = await pricingConfig.getBagPrice(tierKey);
      subtotal += bagPrice.flatPrice * (bag.quantity || 1);
    } else {
      const fallbackBag = await pricingConfig.getBagPrice("small_bag");
      subtotal += fallbackBag.flatPrice * (bag.quantity || 1);
    }
  }
  const normalizedSpeed = normalizeDeliverySpeed(deliverySpeed);
  const deliveryFee = await pricingConfig.getDeliveryFee(normalizedSpeed);
  const taxRate = await pricingConfig.getTaxRate();
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax + deliveryFee) * 100) / 100;
  return { subtotal, tax, deliveryFee, total };
}

// ── Pickup waiting fee ──
// OD-8: WAIT_FEE_CONFIG is now a FALLBACK only. The live values come from
// pricing_config (keys: wait_fee_free_minutes / wait_fee_per_minute / wait_fee_cap)
// via pricingConfig.getWaitFeeConfig(). Use calculateWaitFeeAsync() for fresh
// values; calculateWaitFee() preserves the legacy sync signature for legacy callers.
export const WAIT_FEE_CONFIG = {
  freeMinutes: 5,
  perMinute: 1.0,
  cap: 15.0,
};

function _calc(
  arrivedAt: string | null | undefined,
  handoffAt: string | null | undefined,
  cfg: { freeMinutes: number; perMinute: number; cap: number },
): { waitMinutes: number; waitFee: number } {
  if (!arrivedAt || !handoffAt) return { waitMinutes: 0, waitFee: 0 };
  const a = new Date(arrivedAt).getTime();
  const h = new Date(handoffAt).getTime();
  if (isNaN(a) || isNaN(h) || h <= a) return { waitMinutes: 0, waitFee: 0 };
  const minutes = (h - a) / 60000;
  const billable = Math.max(0, minutes - cfg.freeMinutes);
  const fee = Math.min(cfg.cap, billable * cfg.perMinute);
  return {
    waitMinutes: Math.round(minutes * 100) / 100,
    waitFee: Math.round(fee * 100) / 100,
  };
}

export function calculateWaitFee(arrivedAt: string | null | undefined, handoffAt: string | null | undefined): { waitMinutes: number; waitFee: number } {
  return _calc(arrivedAt, handoffAt, WAIT_FEE_CONFIG);
}

export async function calculateWaitFeeAsync(
  arrivedAt: string | null | undefined,
  handoffAt: string | null | undefined,
): Promise<{ waitMinutes: number; waitFee: number; config: { freeMinutes: number; perMinute: number; cap: number } }> {
  const { pricingConfig } = await import("../pricing-config-service");
  const cfg = await pricingConfig.getWaitFeeConfig();
  const { waitMinutes, waitFee } = _calc(arrivedAt, handoffAt, cfg);
  return { waitMinutes, waitFee, config: cfg };
}

// ════════════════════════════════════════════════════════════════
//  SURGE PRICING ENGINE
// ════════════════════════════════════════════════════════════════

// Fallback US holidays — used only if DB key "surge_holidays" is missing.
// Source of truth is pricing_config.surge_holidays (JSON array of YYYY-MM-DD strings).
// Owner can update via the admin pricing config UI without a code deploy.
const US_HOLIDAYS_FALLBACK = [
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25",
  "2026-07-04", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027 (added so the fallback does not silently expire)
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31",
  "2027-07-04", "2027-09-06", "2027-11-25", "2027-12-25",
];

// Async DB-aware variant. Reads holiday list from pricing_config (60s TTL cache).
export async function getSurgePricingTierAsync(pickupTime?: string): Promise<{ tier: string; multiplier: number; reason: string }> {
  const dt = pickupTime ? new Date(pickupTime) : new Date();
  const hour = dt.getHours();
  const dayOfWeek = dt.getDay();
  const dateStr = dt.toISOString().split("T")[0];

  const holidays = await pricingConfig.getJSON<string[]>("surge_holidays", US_HOLIDAYS_FALLBACK);
  if (Array.isArray(holidays) && holidays.includes(dateStr)) {
    return { tier: "holiday", multiplier: 1.5, reason: "Holiday surge pricing" };
  }
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { tier: "weekend", multiplier: 1.15, reason: "Weekend demand pricing" };
  }
  if ((hour >= 6 && hour < 9) || (hour >= 17 && hour < 20)) {
    return { tier: "peak", multiplier: 1.2, reason: "Peak hour pricing" };
  }
  if (hour < 6 || hour >= 22) {
    return { tier: "off_peak", multiplier: 0.9, reason: "Off-peak discount" };
  }
  return { tier: "normal", multiplier: 1.0, reason: "Standard pricing" };
}

// Sync fallback — kept for callers that cannot easily go async.
// Uses the in-code fallback list only.
export function getSurgePricingTier(pickupTime?: string): { tier: string; multiplier: number; reason: string } {
  const dt = pickupTime ? new Date(pickupTime) : new Date();
  const hour = dt.getHours();
  const dayOfWeek = dt.getDay(); // 0=Sun, 6=Sat
  const dateStr = dt.toISOString().split("T")[0];

  // Holiday check (fallback list)
  if (US_HOLIDAYS_FALLBACK.includes(dateStr)) {
    return { tier: "holiday", multiplier: 1.5, reason: "Holiday surge pricing" };
  }

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { tier: "weekend", multiplier: 1.15, reason: "Weekend demand pricing" };
  }

  // Peak hours: 6-9am or 5-8pm on weekdays
  if ((hour >= 6 && hour < 9) || (hour >= 17 && hour < 20)) {
    return { tier: "peak", multiplier: 1.2, reason: "Peak hour pricing" };
  }

  // Off-peak hours: late night
  if (hour < 6 || hour >= 22) {
    return { tier: "off_peak", multiplier: 0.9, reason: "Off-peak discount" };
  }

  return { tier: "normal", multiplier: 1.0, reason: "Standard pricing" };
}

// ══════════════════════════════════════════════════════════════
//  DYNAMIC LOGISTICS PRICING (Uber-style)
// ══════════════════════════════════════════════════════════════
export const DYNAMIC_PRICING_CONFIG = {
  distance: {
    freeMiles: 1,            // free up to 1 mi customer→laundromat
    perMileAfter: 1.50,      // $1.50/mi past the free zone
    capUsd: 12,              // hard cap on distance fee
  },
  floor: {
    freeFloor: 3,            // floors 1–3 are free regardless of elevator
    perFloorAfter: 2.00,     // $2/floor for floors 4+ if NO elevator
    capUsd: 20,
  },
  handoff: {
    door: 3.00,              // $3 to send driver to door
    curbside: 0,             // default — customer brings down
  },
  window: {
    // multiplicative discount applied to (distance + floor + handoff) only —
    // never to the laundry service price itself
    "30":  0.00,             // 30-min slot — no discount
    "120": 0.05,             // 2-hr window — 5% off logistics
    "240": 0.10,             // 4-hr / flexible — 10% off logistics
  } as Record<string, number>,
  traffic: {
    freeFlowMultiplier: 1.0,
    breakpoints: [
      { ratio: 1.10, multiplier: 1.0  },
      { ratio: 1.30, multiplier: 1.10 },
      { ratio: 1.60, multiplier: 1.20 },
      { ratio: Infinity, multiplier: 1.30 },
    ],
    capMultiplier: 1.30,
  },
};

export function calculateDistanceFee(miles: number): number {
  if (!Number.isFinite(miles) || miles <= 0) return 0;
  const cfg = DYNAMIC_PRICING_CONFIG.distance;
  const billable = Math.max(0, miles - cfg.freeMiles);
  const raw = billable * cfg.perMileAfter;
  return Math.round(Math.min(cfg.capUsd, raw) * 100) / 100;
}

export function calculateFloorFee(floor: number | null | undefined, hasElevator: boolean | number | null): number {
  const f = Number(floor || 1);
  if (!Number.isFinite(f) || f <= 0) return 0;
  // If there's an elevator, floor is free regardless of how high.
  if (hasElevator === true || hasElevator === 1) return 0;
  const cfg = DYNAMIC_PRICING_CONFIG.floor;
  if (f <= cfg.freeFloor) return 0;
  const billableFloors = f - cfg.freeFloor;
  const raw = billableFloors * cfg.perFloorAfter;
  return Math.round(Math.min(cfg.capUsd, raw) * 100) / 100;
}

export function calculateHandoffFee(handoff: string | null | undefined): number {
  const cfg = DYNAMIC_PRICING_CONFIG.handoff;
  return handoff === "door" ? cfg.door : cfg.curbside;
}

export function calculateWindowDiscountRate(windowMinutes: number | null | undefined): number {
  const key = String(Number(windowMinutes || 30));
  const map = DYNAMIC_PRICING_CONFIG.window;
  return map[key] ?? 0;
}

export function calculateTrafficMultiplier(freeFlowSeconds: number, inTrafficSeconds: number | undefined): { multiplier: number; ratio: number; level: string } {
  if (!freeFlowSeconds || !inTrafficSeconds || inTrafficSeconds <= 0) {
    return { multiplier: 1.0, ratio: 1.0, level: "unknown" };
  }
  const ratio = inTrafficSeconds / freeFlowSeconds;
  const cfg = DYNAMIC_PRICING_CONFIG.traffic;
  for (const bp of cfg.breakpoints) {
    if (ratio <= bp.ratio) {
      const level = bp.multiplier === 1.0 ? "light"
        : bp.multiplier <= 1.10 ? "moderate"
        : bp.multiplier <= 1.20 ? "heavy"
        : "gridlock";
      return { multiplier: bp.multiplier, ratio: Math.round(ratio * 100) / 100, level };
    }
  }
  return { multiplier: cfg.capMultiplier, ratio: Math.round(ratio * 100) / 100, level: "gridlock" };
}

export interface LogisticsContext {
  pickupLat?: number;
  pickupLng?: number;
  vendorLat?: number;
  vendorLng?: number;
  pickupAddress?: string;
  vendorAddress?: string;
  pickupFloor?: number | null;
  pickupHasElevator?: boolean | number | null;
  pickupHandoff?: string | null;
  pickupWindowMinutes?: number | null;
  scheduledPickup?: string | null;
}

export interface LogisticsBreakdown {
  distanceMiles: number;
  distanceFee: number;
  floorFee: number;
  handoffFee: number;
  trafficMultiplier: number;
  trafficRatio: number;
  trafficLevel: string;
  windowDiscount: number;
  windowDiscountRate: number;
  logisticsBase: number;
  logisticsTotal: number;
  durationFreeFlowSec: number;
  durationInTrafficSec: number;
  source: "google" | "haversine" | "unknown";
  // D9: demand multiplier fields (populated by calculateQuotePrice)
  demandMultiplier?: number;
  demandReason?: string;
}

export async function computeLogisticsBreakdown(ctx: LogisticsContext): Promise<LogisticsBreakdown> {
  let distanceMi = 0;
  let durationFreeFlow = 0;
  let durationTraffic = 0;
  let source: LogisticsBreakdown["source"] = "unknown";

  const haveCoords = ctx.pickupLat != null && ctx.pickupLng != null && ctx.vendorLat != null && ctx.vendorLng != null;
  const haveAddrs = !!(ctx.pickupAddress && ctx.vendorAddress);

  if (isGoogleMapsConfigured() && (haveCoords || haveAddrs)) {
    try {
      const origin = haveCoords ? `${ctx.pickupLat},${ctx.pickupLng}` : ctx.pickupAddress!;
      const dest = haveCoords ? `${ctx.vendorLat},${ctx.vendorLng}` : ctx.vendorAddress!;
      const departure = ctx.scheduledPickup ? new Date(ctx.scheduledPickup) : new Date(Date.now() + 60_000);
      const dm = await distanceMatrix(origin, dest, departure);
      if (dm) {
        distanceMi = dm.distanceMeters / 1609.344;
        durationFreeFlow = dm.durationSeconds;
        durationTraffic = dm.durationInTrafficSeconds || dm.durationSeconds;
        source = "google";
      }
    } catch (e: any) {
      console.warn("[logistics] distanceMatrix failed, falling back:", e?.message);
    }
  }

  if (source !== "google" && haveCoords) {
    distanceMi = distanceMiles(ctx.pickupLat!, ctx.pickupLng!, ctx.vendorLat!, ctx.vendorLng!);
    source = "haversine";
  }

  const distFee = calculateDistanceFee(distanceMi);
  const flrFee = calculateFloorFee(ctx.pickupFloor ?? 1, ctx.pickupHasElevator ?? 1);
  const hndFee = calculateHandoffFee(ctx.pickupHandoff || "curbside");
  const traffic = calculateTrafficMultiplier(durationFreeFlow, durationTraffic);
  const windowRate = calculateWindowDiscountRate(ctx.pickupWindowMinutes ?? 30);

  const logisticsBase = Math.round((distFee + flrFee + hndFee) * 100) / 100;
  const afterTraffic = Math.round(logisticsBase * traffic.multiplier * 100) / 100;
  const windowDiscount = Math.round(afterTraffic * windowRate * 100) / 100;
  const logisticsTotal = Math.max(0, Math.round((afterTraffic - windowDiscount) * 100) / 100);

  return {
    distanceMiles: Math.round(distanceMi * 100) / 100,
    distanceFee: distFee,
    floorFee: flrFee,
    handoffFee: hndFee,
    trafficMultiplier: traffic.multiplier,
    trafficRatio: traffic.ratio,
    trafficLevel: traffic.level,
    windowDiscount,
    windowDiscountRate: windowRate,
    logisticsBase,
    logisticsTotal,
    durationFreeFlowSec: durationFreeFlow,
    durationInTrafficSec: durationTraffic,
    source,
  };
}

export async function findCheapestPickupSlot(ctx: LogisticsContext, hoursAhead = 12): Promise<{ scheduledPickup: string; trafficLevel: string; ratio: number; multiplier: number }> {
  const haveCoords = ctx.pickupLat != null && ctx.pickupLng != null && ctx.vendorLat != null && ctx.vendorLng != null;
  if (!isGoogleMapsConfigured() || !haveCoords) {
    const dt = new Date();
    return { scheduledPickup: dt.toISOString(), trafficLevel: "unknown", ratio: 1.0, multiplier: 1.0 };
  }

  const slots: Array<{ when: Date; ratio: number; level: string; mult: number }> = [];
  const stepMin = 60;
  for (let m = 0; m < hoursAhead * 60; m += stepMin) {
    const when = new Date(Date.now() + m * 60 * 1000);
    try {
      const dm = await distanceMatrix(`${ctx.pickupLat},${ctx.pickupLng}`, `${ctx.vendorLat},${ctx.vendorLng}`, when);
      if (dm && dm.durationSeconds && dm.durationInTrafficSeconds) {
        const t = calculateTrafficMultiplier(dm.durationSeconds, dm.durationInTrafficSeconds);
        slots.push({ when, ratio: t.ratio, level: t.level, mult: t.multiplier });
      }
    } catch (_) { /* skip slot */ }
  }

  if (slots.length === 0) {
    const dt = new Date();
    return { scheduledPickup: dt.toISOString(), trafficLevel: "unknown", ratio: 1.0, multiplier: 1.0 };
  }
  slots.sort((a, b) => a.mult - b.mult || a.ratio - b.ratio);
  const best = slots[0];
  return { scheduledPickup: best.when.toISOString(), trafficLevel: best.level, ratio: best.ratio, multiplier: best.mult };
}

export async function getDemandMultiplier(serviceType: string): Promise<number> {
  const vendors = await storage.getActiveVendors();
  if (vendors.length === 0) return 1.0;

  const totalCapacity = vendors.reduce((sum, v) => sum + (v.capacity || 50), 0);
  const totalLoad = vendors.reduce((sum, v) => sum + (v.currentLoad || 0), 0);
  const utilization = totalCapacity > 0 ? totalLoad / totalCapacity : 0;

  // High demand: > 80% utilization
  if (utilization > 0.8) return 1.15;
  // Moderate demand: > 60%
  if (utilization > 0.6) return 1.08;
  // Low demand: < 30%
  if (utilization < 0.3) return 0.95;
  return 1.0;
}
