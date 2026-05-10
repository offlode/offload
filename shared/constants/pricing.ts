// Auto-extracted from shared/schema.ts during Stage 2 refactor

// ─── Pricing Tiers Constant ───
export const PRICING_TIERS = {
  small_bag: { maxWeight: 10, flatPrice: 24.99, overageRate: 2.50, displayName: "Small Bag", description: "Perfect for a week's basics" },
  medium_bag: { maxWeight: 20, flatPrice: 44.99, overageRate: 2.50, displayName: "Medium Bag", description: "Great for families" },
  large_bag: { maxWeight: 30, flatPrice: 59.99, overageRate: 2.50, displayName: "Large Bag", description: "Big loads, big savings" },
  xl_bag: { maxWeight: 50, flatPrice: 89.99, overageRate: 2.50, displayName: "XL Bag", description: "Commercial & bulk orders" },
} as const;


// ─── Service Type Multipliers ───
export const SERVICE_TYPE_MULTIPLIERS: Record<string, number> = {
  wash_fold: 1.0,
  dry_cleaning: 1.65,
  comforters: 1.40,
  mixed: 1.25,
  alterations: 1.50,
  commercial: 0.85, // bulk discount
};


// ─── Delivery Fees ───
export const DELIVERY_FEES = {
  "48h": { fee: 0, label: "Standard (48h)" },
  "24h": { fee: 5.99, label: "Next Day (24h)" },
  "same_day": { fee: 12.99, label: "Same Day" },
} as const;


// ─── Tax Rate ───
export const TAX_RATE = 0.08875; // NY combined sales tax


// ─── Quote Validity ───
export const QUOTE_VALIDITY_MINUTES = 15;
