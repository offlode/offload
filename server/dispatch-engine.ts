import { randomBytes } from "crypto";
import { pool } from "./storage";

function generateId(): string {
  return randomBytes(16).toString("hex");
}

function now(): string {
  return new Date().toISOString();
}

/**
 * Dispatch an order to eligible laundromats by creating dispatch_offer rows.
 * Eligible means: active, within service radius, and accepts the order's service type.
 */
export async function dispatchOrder(orderId: number): Promise<number> {
  // Get the order
  const { rows: orderRows } = await pool.query(
    `SELECT id, pickup_address, service_type, certified_only FROM orders WHERE id = $1`,
    [orderId],
  );
  if (orderRows.length === 0) {
    console.warn(`[dispatch] Order ${orderId} not found`);
    return 0;
  }
  const order = orderRows[0];

  // Determine service type filter column
  const serviceType = order.service_type || "wash_fold";
  let serviceFilter = "accepts_standard = true";
  if (serviceType === "signature" || serviceType === "premium") {
    serviceFilter = "accepts_signature = true";
  } else if (serviceType === "custom") {
    serviceFilter = "accepts_custom = true";
  }

  // Find eligible laundromats (active + accepts the service)
  const { rows: laundromats } = await pool.query(
    `SELECT id, lat, lng, service_radius_miles, certified
     FROM laundromats
     WHERE active = true AND ${serviceFilter}`,
  );

  if (laundromats.length === 0) {
    console.log(`[dispatch] No eligible laundromats for order ${orderId}`);
    return 0;
  }

  const certifiedOnlyUntil = new Date(Date.now() + 60 * 1000).toISOString(); // 60s certified-first window
  let inserted = 0;

  for (const lm of laundromats) {
    const offerId = generateId();
    try {
      await pool.query(
        `INSERT INTO dispatch_offers (id, order_id, laundromat_id, offered_at, certified_only_until, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [offerId, orderId, lm.id, now(), certifiedOnlyUntil],
      );
      inserted++;
    } catch (err: any) {
      console.warn(`[dispatch] Failed to create offer for laundromat ${lm.id}:`, err?.message);
    }
  }

  // Mark order auction as started
  if (inserted > 0) {
    await pool.query(
      `UPDATE orders SET auction_started_at = $1 WHERE id = $2`,
      [now(), orderId],
    );
  }

  console.log(`[dispatch] Created ${inserted} offers for order ${orderId}`);
  return inserted;
}

/**
 * Background task: check for stale auctions (started > 10 min ago, no accepted offer)
 * and mark the order as unmatched + notify super_admin users.
 */
async function checkStaleAuctions(): Promise<void> {
  try {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { rows: staleOrders } = await pool.query(
      `SELECT o.id, o.order_number
       FROM orders o
       WHERE o.auction_started_at IS NOT NULL
         AND o.auction_started_at < $1
         AND o.auction_won_at IS NULL
         AND o.status NOT IN ('cancelled', 'delivered', 'completed')
         AND NOT EXISTS (
           SELECT 1 FROM dispatch_offers d
           WHERE d.order_id = o.id AND d.status = 'accepted'
         )`,
      [tenMinAgo],
    );

    for (const order of staleOrders) {
      // Mark all pending offers as expired
      await pool.query(
        `UPDATE dispatch_offers SET status = 'expired' WHERE order_id = $1 AND status = 'pending'`,
        [order.id],
      );

      // Notify super_admin and admin users
      const { rows: admins } = await pool.query(
        `SELECT id FROM users WHERE role IN ('super_admin', 'admin')`,
      );
      for (const admin of admins) {
        try {
          await pool.query(
            `INSERT INTO notifications (user_id, order_id, type, title, body, category, priority, created_at)
             VALUES ($1, $2, 'auction_timeout', 'Auction Timed Out',
                     $3, 'system', 'high', $4)`,
            [admin.id, order.id, `Order ${order.order_number || order.id} had no laundromat accept within 10 minutes.`, now()],
          );
        } catch (err: any) {
          console.warn(`[dispatch] Failed to notify admin ${admin.id}:`, err?.message);
        }
      }

      console.log(`[dispatch] Auction timed out for order ${order.id}`);
    }
  } catch (err: any) {
    console.error("[dispatch] checkStaleAuctions error:", err?.message);
  }
}

// Start the background interval (every 60s)
let _dispatchInterval: ReturnType<typeof setInterval> | null = null;

export function startDispatchEngine(): void {
  if (_dispatchInterval) return;
  _dispatchInterval = setInterval(checkStaleAuctions, 60_000);
  console.log("[dispatch] Background auction monitor started (60s interval)");
}
