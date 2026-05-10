// Auto-extracted from shared/schema.ts during Stage 2 refactor

// ─── Loyalty Tiers ───
export const LOYALTY_TIERS = {
  bronze: { minPoints: 0, multiplier: 1.0, perks: ["5% off first order"] },
  silver: { minPoints: 500, multiplier: 1.25, perks: ["Free delivery", "10% off"] },
  gold: { minPoints: 2000, multiplier: 1.5, perks: ["Free delivery", "15% off", "Priority matching"] },
  platinum: { minPoints: 5000, multiplier: 2.0, perks: ["Free delivery", "20% off", "Priority matching", "Dedicated support"] },
} as const;
