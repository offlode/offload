import { randomBytes } from "crypto";
import { pool, integrityReady } from "./storage";

function generateId(): string {
  return randomBytes(16).toString("hex");
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Idempotent backfill: for any orders that have auction_started_at IS NULL
 * and status not in terminal states, create dispatch_offers for all eligible
 * laundromats. This catches orders placed before the dispatchOrder() call was
 * wired into the order-creation flow.
 */
export async function backfillDispatch(): Promise<void> {
  await integrityReady;

  try {
    // Find orders missing dispatch (no auction_started_at, not terminal)
    const { rows: orphanOrders } = await pool.query(
      `SELECT o.id, o.service_type, o.order_number
       FROM orders o
       WHERE o.auction_started_at IS NULL
         AND o.status NOT IN ('cancelled', 'delivered', 'completed')
         AND NOT EXISTS (
           SELECT 1 FROM dispatch_offers d WHERE d.order_id = o.id
         )`,
    );

    if (orphanOrders.length === 0) {
      console.log("[backfill-dispatch] No orphan orders to backfill.");
      return;
    }

    console.log(`[backfill-dispatch] Found ${orphanOrders.length} orphan order(s) — creating dispatch offers...`);

    for (const order of orphanOrders) {
      const serviceType = order.service_type || "wash_fold";
      let serviceFilter = "accepts_standard = true";
      if (serviceType === "signature" || serviceType === "premium") {
        serviceFilter = "accepts_signature = true";
      } else if (serviceType === "custom") {
        serviceFilter = "accepts_custom = true";
      }

      const { rows: laundromats } = await pool.query(
        `SELECT id, certified FROM laundromats WHERE active = true AND ${serviceFilter}`,
      );

      if (laundromats.length === 0) {
        console.log(`[backfill-dispatch] No eligible laundromats for order ${order.id}`);
        continue;
      }

      // Certified-only window already elapsed for backfilled orders
      const certifiedOnlyUntil = new Date(Date.now() - 1000).toISOString();
      let inserted = 0;

      for (const lm of laundromats) {
        const offerId = generateId();
        try {
          await pool.query(
            `INSERT INTO dispatch_offers (id, order_id, laundromat_id, offered_at, certified_only_until, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             ON CONFLICT DO NOTHING`,
            [offerId, order.id, lm.id, now(), certifiedOnlyUntil],
          );
          inserted++;
        } catch (err: any) {
          console.warn(`[backfill-dispatch] Failed to create offer for order ${order.id}, laundromat ${lm.id}:`, err?.message);
        }
      }

      if (inserted > 0) {
        await pool.query(
          `UPDATE orders SET auction_started_at = $1 WHERE id = $2`,
          [now(), order.id],
        );
        console.log(`[backfill-dispatch] Created ${inserted} offers for order ${order.id} (${order.order_number})`);
      }
    }

    console.log("[backfill-dispatch] Backfill complete.");
  } catch (err: any) {
    console.error("[backfill-dispatch] Error:", err?.message);
  }
}
