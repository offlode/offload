import type { Express } from "express";
import { requireRole } from "../middleware/requireRole";
import { pool } from "../storage";

export function registerDispatchRoutes(app: Express) {
  /**
   * GET /api/dispatch/offers
   * Returns pending offers for the user's laundromat.
   * Requires laundromat_owner or laundromat_employee role.
   * If certified_only_until > now() AND laundromat is NOT certified, exclude those offers.
   */
  app.get("/api/dispatch/offers", requireRole("laundromat_owner", "laundromat_employee", "admin", "super_admin"), async (req, res) => {
    try {
      const user = (req as any).currentUser;
      const laundromatId = user.laundromatId || user.laundromat_id;

      if (!laundromatId && !["admin", "super_admin"].includes(user.role)) {
        return res.status(400).json({ error: "No laundromat associated with this user" });
      }

      let query: string;
      let params: any[];

      if (["admin", "super_admin"].includes(user.role)) {
        // Admins see all pending offers
        query = `
          SELECT do.*, o.order_number, o.service_type, o.pickup_address, o.status as order_status,
                 l.name as laundromat_name, l.certified as laundromat_certified
          FROM dispatch_offers do
          JOIN orders o ON o.id = do.order_id
          JOIN laundromats l ON l.id = do.laundromat_id
          WHERE do.status = 'pending'
          ORDER BY do.offered_at DESC
        `;
        params = [];
      } else {
        // Check if laundromat is certified
        const { rows: lmRows } = await pool.query(
          `SELECT certified FROM laundromats WHERE id = $1`,
          [laundromatId],
        );
        const isCertified = lmRows.length > 0 && lmRows[0].certified === true;

        if (isCertified) {
          // Certified laundromats see all pending offers for them
          query = `
            SELECT do.*, o.order_number, o.service_type, o.pickup_address, o.status as order_status,
                   l.name as laundromat_name, l.certified as laundromat_certified
            FROM dispatch_offers do
            JOIN orders o ON o.id = do.order_id
            JOIN laundromats l ON l.id = do.laundromat_id
            WHERE do.laundromat_id = $1 AND do.status = 'pending'
            ORDER BY do.offered_at DESC
          `;
          params = [laundromatId];
        } else {
          // Non-certified: only see offers where certified_only_until has passed
          query = `
            SELECT do.*, o.order_number, o.service_type, o.pickup_address, o.status as order_status,
                   l.name as laundromat_name, l.certified as laundromat_certified
            FROM dispatch_offers do
            JOIN orders o ON o.id = do.order_id
            JOIN laundromats l ON l.id = do.laundromat_id
            WHERE do.laundromat_id = $1
              AND do.status = 'pending'
              AND do.certified_only_until <= NOW()
            ORDER BY do.offered_at DESC
          `;
          params = [laundromatId];
        }
      }

      const { rows } = await pool.query(query, params);
      res.json(rows);
    } catch (err: any) {
      console.error("[dispatch] GET /api/dispatch/offers error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /api/dispatch/offers/:id/accept
   * Atomic acceptance: only succeeds if offer is pending AND no other offer for the same order is accepted.
   */
  app.post("/api/dispatch/offers/:id/accept", requireRole("laundromat_owner", "laundromat_employee", "admin", "super_admin"), async (req, res) => {
    const client = await pool.connect();
    try {
      const user = (req as any).currentUser;
      const offerId = req.params.id;

      await client.query("BEGIN");

      // Lock and get the offer
      const { rows: offerRows } = await client.query(
        `SELECT * FROM dispatch_offers WHERE id = $1 FOR UPDATE`,
        [offerId],
      );
      if (offerRows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Offer not found" });
      }
      const offer = offerRows[0];

      if (offer.status !== "pending") {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: `Offer is already ${offer.status}` });
      }

      // Check no other offer for this order is already accepted
      const { rows: acceptedRows } = await client.query(
        `SELECT 1 FROM dispatch_offers WHERE order_id = $1 AND status = 'accepted' LIMIT 1`,
        [offer.order_id],
      );
      if (acceptedRows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Another laundromat has already accepted this order" });
      }

      // Verify user belongs to this laundromat (unless admin)
      if (!["admin", "super_admin"].includes(user.role)) {
        const userLaundromatId = user.laundromatId || user.laundromat_id;
        if (userLaundromatId !== offer.laundromat_id) {
          await client.query("ROLLBACK");
          return res.status(403).json({ error: "This offer is not for your laundromat" });
        }
      }

      const respondedAt = new Date().toISOString();

      // Mark this offer as accepted
      await client.query(
        `UPDATE dispatch_offers SET status = 'accepted', responded_at = $1, responded_by_user_id = $2 WHERE id = $3`,
        [respondedAt, user.id, offerId],
      );

      // Mark all sibling offers as superseded
      await client.query(
        `UPDATE dispatch_offers SET status = 'superseded' WHERE order_id = $1 AND id != $2 AND status = 'pending'`,
        [offer.order_id, offerId],
      );

      // Update the order
      await client.query(
        `UPDATE orders SET laundromat_id = $1, auction_won_at = $2, status = 'confirmed', updated_at = $3 WHERE id = $4`,
        [offer.laundromat_id, respondedAt, respondedAt, offer.order_id],
      );

      await client.query("COMMIT");
      res.json({ success: true, offerId, orderId: offer.order_id, laundromatId: offer.laundromat_id });
    } catch (err: any) {
      await client.query("ROLLBACK");
      console.error("[dispatch] accept offer error:", err);
      res.status(500).json({ error: "Internal server error" });
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/dispatch/offers/:id/decline
   * Marks the offer as declined.
   */
  app.post("/api/dispatch/offers/:id/decline", requireRole("laundromat_owner", "laundromat_employee", "admin", "super_admin"), async (req, res) => {
    try {
      const user = (req as any).currentUser;
      const offerId = req.params.id;

      const { rows: offerRows } = await pool.query(
        `SELECT * FROM dispatch_offers WHERE id = $1`,
        [offerId],
      );
      if (offerRows.length === 0) {
        return res.status(404).json({ error: "Offer not found" });
      }
      const offer = offerRows[0];

      if (offer.status !== "pending") {
        return res.status(409).json({ error: `Offer is already ${offer.status}` });
      }

      // Verify user belongs to this laundromat (unless admin)
      if (!["admin", "super_admin"].includes(user.role)) {
        const userLaundromatId = user.laundromatId || user.laundromat_id;
        if (userLaundromatId !== offer.laundromat_id) {
          return res.status(403).json({ error: "This offer is not for your laundromat" });
        }
      }

      await pool.query(
        `UPDATE dispatch_offers SET status = 'declined', responded_at = $1, responded_by_user_id = $2 WHERE id = $3`,
        [new Date().toISOString(), user.id, offerId],
      );

      res.json({ success: true, offerId, status: "declined" });
    } catch (err: any) {
      console.error("[dispatch] decline offer error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
