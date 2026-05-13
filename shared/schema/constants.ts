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

// ─── SLA Configs ───
export const SLA_CONFIGS = {
  "same_day": { hours: 12, warningHours: 8 },
  "24h": { hours: 24, warningHours: 18 },
  "48h": { hours: 48, warningHours: 36 },
} as const;

export const WEIGHT_TOLERANCE = 0.05;
export const CONSENT_TIMEOUT_HOURS = 2;

// ─── Loyalty Tiers ───
export const LOYALTY_TIERS = {
  bronze: { minPoints: 0, multiplier: 1.0, perks: ["5% off first order"] },
  silver: { minPoints: 500, multiplier: 1.25, perks: ["Free delivery", "10% off"] },
  gold: { minPoints: 2000, multiplier: 1.5, perks: ["Free delivery", "15% off", "Priority matching"] },
  platinum: { minPoints: 5000, multiplier: 2.0, perks: ["Free delivery", "20% off", "Priority matching", "Dedicated support"] },
} as const;

// ─── Subscription Tiers ───
export const SUBSCRIPTION_TIERS = {
  basic: { price: 19.99, freeDeliveries: 4, discount: 0.05, pointsBonus: 1.25 },
  plus: { price: 39.99, freeDeliveries: 10, discount: 0.10, pointsBonus: 1.5 },
  premium: { price: 69.99, freeDeliveries: 999, discount: 0.15, pointsBonus: 2.0, prioritySupport: true },
} as const;
