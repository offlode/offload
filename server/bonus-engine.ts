// =====================================================================
//  PERFORMANCE BONUS ENGINE
//  Evaluates bonus rules (e.g., 5-star streak) and creates payout rows.
// =====================================================================

import { db } from "./storage";
import { eq, and, desc, sql } from "drizzle-orm";
import { reviews, performanceBonusRules, performanceBonusPayouts } from "@shared/schema";

/**
 * Evaluate the five-star streak bonus for a vendor.
 * Called after a review is inserted.
 * Checks if the last N reviews (ending at reviewCreatedAt) are all 5-star.
 * If count % threshold === 0, creates a payout row.
 */
export async function evaluateFiveStarStreak(
  vendorId: number,
  reviewCreatedAt: string,
): Promise<{ triggered: boolean; payoutId?: number; amountCents?: number }> {
  // Get active five_star_streak rules for this vendor or global (vendor_id IS NULL)
  const rules = await db
    .select()
    .from(performanceBonusRules)
    .where(
      and(
        eq(performanceBonusRules.ruleType, "five_star_streak"),
        eq(performanceBonusRules.active, true),
      ),
    );

  // Filter to rules applicable to this vendor (vendor_id matches or is null for global)
  const applicableRules = rules.filter(
    (r) => r.vendorId === null || r.vendorId === vendorId,
  );

  if (applicableRules.length === 0) {
    return { triggered: false };
  }

  // Get the most recent reviews for this vendor, ordered by creation date desc
  const recentReviews = await db
    .select({ overallRating: reviews.overallRating })
    .from(reviews)
    .where(eq(reviews.vendorId, vendorId))
    .orderBy(desc(reviews.createdAt))
    .limit(100);

  // Count consecutive 5-star reviews from the most recent
  let streak = 0;
  for (const r of recentReviews) {
    if (r.overallRating === 5) {
      streak++;
    } else {
      break;
    }
  }

  // Check each rule
  for (const rule of applicableRules) {
    if (streak > 0 && streak % rule.threshold === 0) {
      // Create a payout
      const [payout] = await db
        .insert(performanceBonusPayouts)
        .values({
          vendorId,
          ruleId: rule.id,
          amountCents: rule.amountCents,
          triggeredAt: new Date().toISOString(),
          payoutStatus: "pending",
          periodStart: reviewCreatedAt,
          periodEnd: reviewCreatedAt,
        })
        .returning();

      return {
        triggered: true,
        payoutId: payout.id,
        amountCents: rule.amountCents,
      };
    }
  }

  return { triggered: false };
}
