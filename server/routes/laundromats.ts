import type { Express } from "express";
import { randomBytes } from "crypto";
import { requireRole } from "../middleware/requireRole";
import { pool } from "../storage";
import { storage } from "../storage";
import { hashPassword } from "../lib/auth";

function generateId(): string {
  return randomBytes(16).toString("hex");
}

function now(): string {
  return new Date().toISOString();
}

export function registerLaundromatRoutes(app: Express) {
  /**
   * GET /api/laundromats
   * super_admin/admin sees all; laundromat_owner sees only their own
   */
  app.get("/api/laundromats", requireRole("super_admin", "admin", "manager", "laundromat_owner"), async (req, res) => {
    try {
      const user = (req as any).currentUser;

      if (["super_admin", "admin", "manager"].includes(user.role)) {
        const { rows } = await pool.query(`SELECT * FROM laundromats ORDER BY created_at DESC`);
        return res.json(rows);
      }

      // laundromat_owner: see only their own
      const laundromatId = user.laundromatId || user.laundromat_id;
      if (!laundromatId) {
        return res.json([]);
      }
      const { rows } = await pool.query(`SELECT * FROM laundromats WHERE id = $1`, [laundromatId]);
      res.json(rows);
    } catch (err: any) {
      console.error("[laundromats] GET error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /api/laundromats/me
   * Returns the laundromat profile for the current laundromat_owner or laundromat_employee
   */
  app.get("/api/laundromats/me", requireRole("laundromat_owner", "laundromat_employee"), async (req, res) => {
    try {
      const user = (req as any).currentUser;
      const laundromatId = user.laundromatId || user.laundromat_id;
      if (!laundromatId) {
        return res.status(404).json({ error: "No laundromat linked to your account" });
      }
      const { rows } = await pool.query(`SELECT * FROM laundromats WHERE id = $1`, [laundromatId]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Laundromat not found" });
      }
      res.json(rows[0]);
    } catch (err: any) {
      console.error("[laundromats] GET /me error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * GET /api/laundromats/:id
   */
  app.get("/api/laundromats/:id", requireRole("super_admin", "admin", "manager", "laundromat_owner", "laundromat_employee"), async (req, res) => {
    try {
      const user = (req as any).currentUser;
      const id = req.params.id;

      const { rows } = await pool.query(`SELECT * FROM laundromats WHERE id = $1`, [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: "Laundromat not found" });
      }

      // Ownership check for non-admins
      if (!["super_admin", "admin", "manager"].includes(user.role)) {
        const userLaundromatId = user.laundromatId || user.laundromat_id;
        if (userLaundromatId !== id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      res.json(rows[0]);
    } catch (err: any) {
      console.error("[laundromats] GET :id error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /api/laundromats
   * super_admin/admin only
   */
  app.post("/api/laundromats", requireRole("super_admin", "admin"), async (req, res) => {
    try {
      const id = generateId();
      const {
        name, ownerUserId, addressLine1, city, state, zip, lat, lng,
        serviceRadiusMiles, certified, active, acceptsStandard, acceptsSignature,
        acceptsCustom, signaturePremiumCents, capacityBagsPerDay, hoursJson,
      } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      await pool.query(
        `INSERT INTO laundromats (
          id, name, owner_user_id, address_line1, city, state, zip, lat, lng,
          service_radius_miles, certified, active, accepts_standard, accepts_signature,
          accepts_custom, signature_premium_cents, capacity_bags_per_day, hours_json,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          id, name, ownerUserId || null, addressLine1 || null, city || null,
          state || null, zip || null, lat || null, lng || null,
          serviceRadiusMiles ?? 10, certified ?? false, active ?? true,
          acceptsStandard ?? true, acceptsSignature ?? true, acceptsCustom ?? true,
          signaturePremiumCents ?? 500, capacityBagsPerDay ?? 100, hoursJson || null,
          now(), now(),
        ],
      );

      // If ownerUserId provided, set their laundromat_id
      if (ownerUserId) {
        await pool.query(
          `UPDATE users SET laundromat_id = $1 WHERE id = $2`,
          [id, ownerUserId],
        );
      }

      const { rows } = await pool.query(`SELECT * FROM laundromats WHERE id = $1`, [id]);
      res.status(201).json(rows[0]);
    } catch (err: any) {
      console.error("[laundromats] POST error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * PATCH /api/laundromats/:id
   * Owner can edit limited fields; super_admin edits anything
   */
  app.patch("/api/laundromats/:id", requireRole("super_admin", "admin", "laundromat_owner"), async (req, res) => {
    try {
      const user = (req as any).currentUser;
      const id = req.params.id;

      // Verify laundromat exists
      const { rows: existing } = await pool.query(`SELECT * FROM laundromats WHERE id = $1`, [id]);
      if (existing.length === 0) {
        return res.status(404).json({ error: "Laundromat not found" });
      }

      // Ownership check for non-admins
      if (!["super_admin", "admin"].includes(user.role)) {
        const userLaundromatId = user.laundromatId || user.laundromat_id;
        if (userLaundromatId !== id) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      // Determine allowed fields based on role
      const adminFields = [
        "name", "owner_user_id", "address_line1", "city", "state", "zip",
        "lat", "lng", "service_radius_miles", "certified", "active",
        "accepts_standard", "accepts_signature", "accepts_custom",
        "signature_premium_cents", "capacity_bags_per_day", "hours_json",
      ];
      const ownerFields = [
        "name", "address_line1", "city", "state", "zip",
        "hours_json", "accepts_standard", "accepts_signature", "accepts_custom",
        "signature_premium_cents", "capacity_bags_per_day", "service_radius_miles",
      ];

      const isAdmin = ["super_admin", "admin"].includes(user.role);
      const allowedFields = isAdmin ? adminFields : ownerFields;

      // Map body keys (camelCase or snake_case) to snake_case SQL columns
      const fieldMap: Record<string, string> = {
        name: "name",
        ownerUserId: "owner_user_id",
        owner_user_id: "owner_user_id",
        addressLine1: "address_line1",
        address_line1: "address_line1",
        city: "city",
        state: "state",
        zip: "zip",
        lat: "lat",
        lng: "lng",
        serviceRadiusMiles: "service_radius_miles",
        service_radius_miles: "service_radius_miles",
        certified: "certified",
        active: "active",
        acceptsStandard: "accepts_standard",
        accepts_standard: "accepts_standard",
        acceptsSignature: "accepts_signature",
        accepts_signature: "accepts_signature",
        acceptsCustom: "accepts_custom",
        accepts_custom: "accepts_custom",
        signaturePremiumCents: "signature_premium_cents",
        signature_premium_cents: "signature_premium_cents",
        capacityBagsPerDay: "capacity_bags_per_day",
        capacity_bags_per_day: "capacity_bags_per_day",
        hoursJson: "hours_json",
        hours_json: "hours_json",
      };

      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      for (const [camel, snake] of Object.entries(fieldMap)) {
        if (req.body[camel] !== undefined && allowedFields.includes(snake)) {
          setClauses.push(`${snake} = $${paramIdx}`);
          values.push(req.body[camel]);
          paramIdx++;
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      setClauses.push(`updated_at = $${paramIdx}`);
      values.push(now());
      paramIdx++;

      values.push(id);
      await pool.query(
        `UPDATE laundromats SET ${setClauses.join(", ")} WHERE id = $${paramIdx}`,
        values,
      );

      const { rows } = await pool.query(`SELECT * FROM laundromats WHERE id = $1`, [id]);
      res.json(rows[0]);
    } catch (err: any) {
      console.error("[laundromats] PATCH error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  /**
   * POST /api/laundromats/:id/employees/invite
   * Owner invites employee by email. Creates user with role laundromat_employee.
   */
  app.post("/api/laundromats/:id/employees/invite", requireRole("super_admin", "admin", "laundromat_owner"), async (req, res) => {
    try {
      const user = (req as any).currentUser;
      const laundromatId = req.params.id;

      // Verify laundromat exists
      const { rows: lmRows } = await pool.query(`SELECT * FROM laundromats WHERE id = $1`, [laundromatId]);
      if (lmRows.length === 0) {
        return res.status(404).json({ error: "Laundromat not found" });
      }

      // Ownership check for non-admins
      if (!["super_admin", "admin"].includes(user.role)) {
        const userLaundromatId = user.laundromatId || user.laundromat_id;
        if (userLaundromatId !== laundromatId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const { email, name } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Check if user already exists with this email
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        // Update their role and laundromat_id
        await pool.query(
          `UPDATE users SET role = 'laundromat_employee', laundromat_id = $1 WHERE id = $2`,
          [laundromatId, existingUser.id],
        );
        return res.json({ success: true, userId: existingUser.id, message: "Existing user updated to laundromat employee" });
      }

      // Create new user with temp password
      const tempPassword = randomBytes(8).toString("hex");
      const newUser = await storage.createUser({
        username: email,
        email,
        name: name || email.split("@")[0],
        role: "laundromat_employee",
        password: hashPassword(tempPassword),
        phone: "",
        memberSince: new Date().toISOString().slice(0, 10),
      });

      // Set laundromat_id and must_change_password
      await pool.query(
        `UPDATE users SET laundromat_id = $1, must_change_password = true WHERE id = $2`,
        [laundromatId, newUser.id],
      );

      res.status(201).json({
        success: true,
        userId: newUser.id,
        email,
        tempPassword,
        message: "Employee account created. Share the temporary password with them.",
      });
    } catch (err: any) {
      console.error("[laundromats] invite employee error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
