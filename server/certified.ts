// ──────────────────────────────────────────────────────────────
// Offload Certified — Vendor Quality Certification Engine
//
// Rules (all admin-configurable via pricing_config):
//   certified_min_happy_reviews   (default 5)  → reviews ≥ 4★ to grant certification
//   certified_max_unhappy_reviews (default 5)  → reviews ≤ 2★ to revoke certification
//   certified_window_days         (default 90) → rolling window for counting
//   certified_min_total_reviews   (default 5)  → minimum total reviews to be eligible
//
// Called automatically after each review is created.
// Idempotent — safe to call multiple times.
// ──────────────────────────────────────────────────────────────

import { storage } from "./storage";
import { pricingConfig } from "./pricing-config-service";

export interface CertifiedRules {
  minHappyReviews: number;       // # of 4★+ reviews needed to grant
  maxUnhappyReviews: number;     // # of ≤2★ reviews to revoke
  windowDays: number;            // rolling window (days)
  minTotalReviews: number;       // minimum review count to be eligible
  happyThreshold: number;        // rating ≥ this counts as happy (default 4)
  unhappyThreshold: number;      // rating ≤ this counts as unhappy (default 2)
}

const DEFAULTS: CertifiedRules = {
  minHappyReviews: 5,
  maxUnhappyReviews: 5,
  windowDays: 90,
  minTotalReviews: 5,
  happyThreshold: 4,
  unhappyThreshold: 2,
};

export async function getCertifiedRules(): Promise<CertifiedRules> {
  const get = async (key: string, fallback: number) => {
    try {
      return await pricingConfig.getNumber(key, fallback);
    } catch {
      return fallback;
    }
  };
  return {
    minHappyReviews:   await get("certified_min_happy_reviews",   DEFAULTS.minHappyReviews),
    maxUnhappyReviews: await get("certified_max_unhappy_reviews", DEFAULTS.maxUnhappyReviews),
    windowDays:        await get("certified_window_days",         DEFAULTS.windowDays),
    minTotalReviews:   await get("certified_min_total_reviews",   DEFAULTS.minTotalReviews),
    happyThreshold:    await get("certified_happy_threshold",     DEFAULTS.happyThreshold),
    unhappyThreshold:  await get("certified_unhappy_threshold",   DEFAULTS.unhappyThreshold),
  };
}

export interface CertifiedAudit {
  vendorId: number;
  shouldBeCertified: boolean;
  reason: string;
  happyCount: number;
  unhappyCount: number;
  totalCount: number;
  rules: CertifiedRules;
}

export async function evaluateVendorCertification(vendorId: number): Promise<CertifiedAudit> {
  const rules = await getCertifiedRules();
  const cutoff = new Date(Date.now() - rules.windowDays * 86400_000).toISOString();

  const allReviews = await storage.getReviewsByVendor(vendorId);
  const recent = (allReviews || []).filter((r: any) => r.createdAt >= cutoff);

  const happy   = recent.filter((r: any) => (r.overallRating ?? r.vendorRating ?? 0) >= rules.happyThreshold).length;
  const unhappy = recent.filter((r: any) => (r.overallRating ?? r.vendorRating ?? 0) <= rules.unhappyThreshold).length;

  let shouldBeCertified = false;
  let reason = "";

  if (recent.length < rules.minTotalReviews) {
    shouldBeCertified = false;
    reason = `Not enough reviews in ${rules.windowDays}d window (${recent.length}/${rules.minTotalReviews})`;
  } else if (unhappy >= rules.maxUnhappyReviews) {
    shouldBeCertified = false;
    reason = `Too many unhappy reviews (${unhappy}/${rules.maxUnhappyReviews}) in ${rules.windowDays}d window`;
  } else if (happy >= rules.minHappyReviews) {
    shouldBeCertified = true;
    reason = `Earned: ${happy} happy reviews (need ${rules.minHappyReviews}), ${unhappy} unhappy (allowed ${rules.maxUnhappyReviews - 1})`;
  } else {
    shouldBeCertified = false;
    reason = `Not yet certified: ${happy}/${rules.minHappyReviews} happy reviews in ${rules.windowDays}d window`;
  }

  return {
    vendorId,
    shouldBeCertified,
    reason,
    happyCount: happy,
    unhappyCount: unhappy,
    totalCount: recent.length,
    rules,
  };
}

/**
 * Apply certification state to vendor row. Returns audit + whether the row was changed.
 * Idempotent — only writes if state actually changed.
 */
export async function applyVendorCertification(vendorId: number): Promise<{ audit: CertifiedAudit; changed: boolean; previousState: boolean }> {
  const audit = await evaluateVendorCertification(vendorId);
  const vendor = await storage.getVendor(vendorId);
  if (!vendor) {
    return { audit, changed: false, previousState: false };
  }
  const previousState = !!vendor.certified;
  if (previousState !== audit.shouldBeCertified) {
    await storage.updateVendor(vendorId, { certified: audit.shouldBeCertified ? 1 : 0 } as any);
    console.log(`[Certified] vendor ${vendorId} ${previousState ? "REVOKED" : "GRANTED"} — ${audit.reason}`);
    return { audit, changed: true, previousState };
  }
  return { audit, changed: false, previousState };
}
