/**
 * Shared cancel side-effects — called from both PATCH /orders/:id/status and
 * POST /orders/:id/cancel to prevent drift between the two cancel paths.
 *
 * Must be called AFTER the FSM transition to "cancelled" has succeeded.
 */
import { eq, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import { storage, db } from "../storage";
import { issueStripeRefundForOrder } from "./refund";

/**
 * Runs all cancel side-effects for an order that has already transitioned to "cancelled":
 *  - Stripe refund (if payment was captured)
 *  - Loyalty points restoration
 *  - Vendor capacity release (atomic SQL)
 *  - Driver release
 *  - Promo usedCount decrement + per-user usage deletion
 */
export async function cancelOrderSideEffects(
  order: typeof schema.orders.$inferSelect,
  ts: string,
): Promise<void> {
  // 1. Stripe refund — order is already cancelled; if refund fails, mark for manual reconciliation
  if (order.paymentStatus === "captured" || order.paymentStatus === "paid") {
    const totalCents = Math.round(((order as any).finalPrice ?? order.total ?? 0) * 100);
    if (totalCents > 0) {
      try {
        const idempotencyKey = `cancel-order-${order.id}`;
        const refundResult: any = await issueStripeRefundForOrder(
          order, totalCents, "requested_by_customer", idempotencyKey,
        );
        if (refundResult?.errorStatus) {
          console.error("[cancel-side-effects] Stripe refund failed:", refundResult.error);
          await storage.updateOrder(order.id, { paymentStatus: "refund_pending" } as any);
        } else {
          await storage.updateOrder(order.id, { paymentStatus: refundResult?.paymentStatus || "refunded" });
        }
      } catch (err: any) {
        console.error("[cancel-side-effects] Stripe refund exception:", err?.message);
        await storage.updateOrder(order.id, { paymentStatus: "refund_pending" } as any);
      }
    } else {
      await storage.updateOrder(order.id, { paymentStatus: "refunded" });
    }
  }

  // 2. Restore redeemed loyalty points
  if (order.loyaltyPointsRedeemed && order.loyaltyPointsRedeemed > 0) {
    const user = await storage.getUser(order.customerId);
    if (user) {
      await storage.updateUser(order.customerId, {
        loyaltyPoints: (user.loyaltyPoints || 0) + order.loyaltyPointsRedeemed,
      });
      await storage.createLoyaltyTransaction({
        userId: order.customerId,
        orderId: order.id,
        type: "bonus",
        points: order.loyaltyPointsRedeemed,
        description: "Points restored after order cancellation",
        createdAt: ts,
      });
    }
  }

  // 3. Release vendor capacity (atomic SQL — P2-023 / P3-005)
  if (order.vendorId) {
    await db.update(schema.vendors)
      .set({ currentLoad: sql`GREATEST(0, COALESCE(${schema.vendors.currentLoad}, 0) - 1)` } as any)
      .where(eq(schema.vendors.id, order.vendorId));
  }

  // 4. Free driver
  if (order.driverId) {
    const driver = await storage.getDriver(order.driverId);
    if (driver) {
      await storage.updateDriver(driver.id, { status: "available" });
    }
  }

  // 5. Decrement promo usedCount (atomic SQL) + delete per-user usage
  if (order.promoCode) {
    const promo = await storage.getPromoCode(order.promoCode);
    if (promo) {
      await db.update(schema.promoCodes)
        .set({ usedCount: sql`GREATEST(0, COALESCE(${schema.promoCodes.usedCount}, 0) - 1)` } as any)
        .where(eq(schema.promoCodes.id, promo.id));
    }
    await storage.deletePromoUsageByOrder(order.id);
  }
}
