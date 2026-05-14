// =============================================================================
//  Pricing Engine — Unit Tests
//  Tests: Signature Wash per-bag premium, TIER_NAME_MAP normalization
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies ───
// We mock storage and pricingConfig so the test doesn't need a DB connection.
vi.mock("../storage", () => ({
  storage: {
    getVendor: vi.fn().mockResolvedValue(null),
    getActiveVendors: vi.fn().mockResolvedValue([]),
    getAddOn: vi.fn().mockResolvedValue(null),
    getPromoCode: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../maps", () => ({
  distanceMatrix: vi.fn().mockResolvedValue(null),
  isGoogleMapsConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("../pricing-config-service", () => ({
  pricingConfig: {
    getBagPrice: vi.fn().mockImplementation(async (tierKey: string) => {
      const prices: Record<string, { flatPrice: number; overageRate: number; maxWeight: number }> = {
        small_bag:  { flatPrice: 24.99, overageRate: 2.50, maxWeight: 10 },
        medium_bag: { flatPrice: 44.99, overageRate: 2.50, maxWeight: 20 },
        large_bag:  { flatPrice: 59.99, overageRate: 2.50, maxWeight: 30 },
        xl_bag:     { flatPrice: 89.99, overageRate: 2.50, maxWeight: 50 },
      };
      return prices[tierKey] || { flatPrice: 24.99, overageRate: 2.50, maxWeight: 10 };
    }),
    getDeliveryFee: vi.fn().mockResolvedValue(0),
    getTaxRate: vi.fn().mockResolvedValue(0.08875),
    getServiceMultiplier: vi.fn().mockResolvedValue(1.0),
    getJSON: vi.fn().mockImplementation(async (_key: string, fallback: unknown) => fallback),
    getSignaturePremiumCents: vi.fn().mockResolvedValue(500), // $5.00 per bag
  },
}));

import { calculateQuotePrice } from "../lib/pricing";

// ═══════════════════════════════════════════════════════════════
//  SIGNATURE WASH PREMIUM — per-bag premium line item
// ═══════════════════════════════════════════════════════════════
describe("Signature Wash per-bag premium", () => {
  it("adds a signature_premium line item worth $10 for 2 medium bags", async () => {
    const result = await calculateQuotePrice({
      tierName: "medium",
      deliverySpeed: "48h",
      serviceType: "wash_fold_signature",
      bags: [{ size: "medium", quantity: 2 }],
    });

    const premiumItem = result.lineItems.find(li => li.type === "signature_premium");
    expect(premiumItem).toBeDefined();
    expect(premiumItem!.amount).toBe(10.00); // 2 bags × $5.00 = $10.00
    expect(premiumItem!.label).toContain("×2 bags");
  });

  it("does not add a premium for standard wash_fold service", async () => {
    const result = await calculateQuotePrice({
      tierName: "medium",
      deliverySpeed: "48h",
      serviceType: "wash_fold",
      bags: [{ size: "medium", quantity: 2 }],
    });

    const premiumItem = result.lineItems.find(li => li.type === "signature_premium");
    expect(premiumItem).toBeUndefined();
  });

  it("does not add a premium for wash_fold_signature when bags array is absent", async () => {
    const result = await calculateQuotePrice({
      tierName: "medium",
      deliverySpeed: "48h",
      serviceType: "wash_fold_signature",
      // no bags array
    });

    const premiumItem = result.lineItems.find(li => li.type === "signature_premium");
    expect(premiumItem).toBeUndefined();
  });

  it("does not add a premium for wash_fold_custom", async () => {
    const result = await calculateQuotePrice({
      tierName: "medium",
      deliverySpeed: "48h",
      serviceType: "wash_fold_custom",
      bags: [{ size: "medium", quantity: 1 }],
    });

    const premiumItem = result.lineItems.find(li => li.type === "signature_premium");
    expect(premiumItem).toBeUndefined();
  });

  it("includes premium in the total", async () => {
    const baseResult = await calculateQuotePrice({
      tierName: "medium",
      deliverySpeed: "48h",
      serviceType: "wash_fold",
    });

    const sigResult = await calculateQuotePrice({
      tierName: "medium",
      deliverySpeed: "48h",
      serviceType: "wash_fold_signature",
      bags: [{ size: "medium", quantity: 2 }],
    });

    // Signature total should be higher by $10 + tax on $10
    const premiumDiff = sigResult.total - baseResult.total;
    expect(premiumDiff).toBeCloseTo(10 * (1 + 0.08875), 1);
  });
});
