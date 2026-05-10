// Auto-extracted from shared/schema.ts during Stage 2 refactor

// ─── SLA Configs ───
export const SLA_CONFIGS = {
  "same_day": { hours: 12, warningHours: 8 },
  "24h": { hours: 24, warningHours: 18 },
  "48h": { hours: 48, warningHours: 36 },
} as const;

export const WEIGHT_TOLERANCE = 0.05;
export const CONSENT_TIMEOUT_HOURS = 2;
