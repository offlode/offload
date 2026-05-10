// Auto-extracted from shared/schema.ts during Stage 2 refactor

// ─── Subscription Tiers ───
export const SUBSCRIPTION_TIERS = {
  basic: { price: 19.99, freeDeliveries: 4, discount: 0.05, pointsBonus: 1.25 },
  plus: { price: 39.99, freeDeliveries: 10, discount: 0.10, pointsBonus: 1.5 },
  premium: { price: 69.99, freeDeliveries: 999, discount: 0.15, pointsBonus: 2.0, prioritySupport: true },
} as const;
