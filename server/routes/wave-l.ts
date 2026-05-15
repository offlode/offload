// =====================================================================
//  WAVE L ROUTES — Loom/Figma Design Parity Backend
//  All new endpoints added in this file. Existing endpoints untouched.
// =====================================================================

import type { Express, Request, Response } from "express";
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";
import rateLimit from "express-rate-limit";
import { db } from "../storage";
import { storage } from "../storage";
import { requireAuth, createSession, setSessionCookie } from "../session";
import { hashPassword, verifyPassword } from "../lib/auth";
import { now } from "../engines";
import { buildOrderProgress } from "../order-display-labels";
import { evaluateFiveStarStreak } from "../bonus-engine";
import { checkServiceArea } from "../service-area";
import { validateTransition } from "../order-fsm";
import { preAuthTokenStore } from "../lib/pre-auth-tokens";
import {
  orders,
  users,
  vendors,
  reviews,
  washRuns,
  vendorEmployees,
  performanceBonusRules,
  performanceBonusPayouts,
  vendorBankAccounts,
  notificationPreferences,
  user2fa,
  serviceAreaRequests,
} from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";

// Helper to get a single string param (Express 5 params can be string | string[])
function paramStr(val: string | string[] | undefined): string {
  return Array.isArray(val) ? val[0] : (val || "");
}

// ══════════════════════════════════════════════════════════════
//  2FA TOTP Utilities
// ══════════════════════════════════════════════════════════════

function getEncryptionKey(): Buffer {
  const key = process.env.TOTP_ENCRYPTION_KEY;
  if (!key) throw new Error("TOTP_ENCRYPTION_KEY environment variable is required for 2FA");
  return scryptSync(key, "offload-2fa-salt", 32);
}

function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decryptSecret(encryptedStr: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedStr.split(":");
  if (!ivHex || !authTagHex || !encrypted) throw new Error("Invalid encrypted secret format");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function generateBackupCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString("hex");
    plain.push(code);
    hashed.push(hashPassword(code));
  }
  return { plain, hashed };
}

// TOTP helpers using otplib's low-level API
async function totpGenerateSecret(): Promise<string> {
  const { generateSecret } = await import("otplib");
  return generateSecret();
}

async function totpGenerateURI(account: string, issuer: string, secret: string): Promise<string> {
  const { generateURI } = await import("otplib");
  return generateURI({ strategy: "totp", label: account, issuer, secret });
}

async function totpVerify(token: string, secret: string): Promise<boolean> {
  const { verifySync } = await import("otplib");
  try {
    const result = verifySync({ token, secret });
    return result.valid;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  REGISTER ALL WAVE L ROUTES
// ══════════════════════════════════════════════════════════════

export function registerWaveLRoutes(app: Express): void {
  // ── Rate limiters for 2FA endpoints ──
  const twoFaChallengeLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many 2FA attempts. Please try again later." },
    keyGenerator: (req) => {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const userId = req.body?.user_id || "anon";
      return `${ip}:${userId}`;
    },
  });

  const twoFaSetupLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many 2FA setup attempts. Please try again later." },
    keyGenerator: (req) => {
      const user = (req as any).currentUser;
      return `2fa-setup:${user?.id || req.ip || "unknown"}`;
    },
  });

  const twoFaVerifyLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many 2FA verification attempts. Please try again later." },
    keyGenerator: (req) => {
      const user = (req as any).currentUser;
      return `2fa-verify:${user?.id || req.ip || "unknown"}`;
    },
  });

  // ── GET /api/orders/:id/progress — 13-label timeline ──
  app.get("/api/orders/:id/progress", requireAuth(), async (req: Request, res: Response) => {
    try {
      const orderId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const user = (req as any).currentUser;
      if (user.role === "customer" && order.customerId !== user.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const progress = buildOrderProgress(order);
      res.json({ orderId, currentStatus: order.status, progress });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  WASH RUNS
  // ══════════════════════════════════════════════════════════

  // Wave 2 compat: accept BOTH new shape {orderId, washType, clothingCategory, weightLbs, notes}
  // AND v1 operator shape {orderId, durationMin, clothingTypesInRun} / {order_id, duration_min, clothing_types_in_run}
  app.post("/api/wash-runs", requireAuth(["laundromat", "admin", "manager"]), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const body = req.body;

      // Normalize: accept both camelCase and snake_case
      const orderId = body.orderId || body.order_id;
      const vendorId = body.vendorId || body.vendor_id;
      const durationMin = body.durationMin || body.duration_min;
      const washType = body.washType || body.wash_type;
      const clothingCategory = body.clothingCategory || body.clothing_category;
      const weightLbs = body.weightLbs || body.weight_lbs;
      const separationRequired = body.separation_required || body.separationRequired || false;
      const notes = body.notes;
      // v1 operator shape compat
      const clothingTypesInRun = body.clothingTypesInRun || body.clothing_types_in_run || body.clothing_types;

      if (!orderId) return res.status(400).json({ error: "orderId (or order_id) is required" });

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      // P1-8: cross-vendor IDOR — a non-admin cannot create wash-runs against another vendor's order
      if (user.role !== "admin") {
        const callerVendorId = await getManagerVendorId(user);
        if (!callerVendorId || order.vendorId !== callerVendorId) {
          return res.status(403).json({ error: "Order belongs to another vendor" });
        }
      }

      const vId = vendorId || order.vendorId;
      if (!vId) return res.status(400).json({ error: "vendor_id is required" });

      const [run] = await db
        .insert(washRuns)
        .values({
          orderId,
          operatorId: user.id,
          vendorId: vId,
          status: "pending",
          durationMin: durationMin || null,
          startAt: now(),
          separationRequired: separationRequired,
          clothingTypes: clothingTypesInRun ? JSON.stringify(
            Array.isArray(clothingTypesInRun) ? clothingTypesInRun : [clothingTypesInRun]
          ) : (clothingCategory ? JSON.stringify([clothingCategory]) : null),
          notes: notes || (washType ? `washType: ${washType}` : null) || null,
        })
        .returning();

      res.status(201).json(run);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/wash-runs/:id", requireAuth(["laundromat", "admin", "manager"]), async (req: Request, res: Response) => {
    try {
      const runId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(runId)) return res.status(400).json({ error: "Invalid run ID" });

      const currentUser = (req as any).currentUser;

      // P1-9: cross-vendor IDOR — verify run.vendorId matches caller's vendor
      const [existingRun] = await db.select().from(washRuns).where(eq(washRuns.id, runId));
      if (!existingRun) return res.status(404).json({ error: "Wash run not found" });
      if (currentUser.role !== "admin") {
        const callerVendorId = await getManagerVendorId(currentUser);
        if (!callerVendorId || existingRun.vendorId !== callerVendorId) {
          return res.status(403).json({ error: "Wash run belongs to another vendor" });
        }
      }

      const { status, photo_urls, notes, duration_min } = req.body;
      const updates: Record<string, any> = {};
      if (status) updates.status = status;
      if (photo_urls) updates.photoUrls = JSON.stringify(photo_urls);
      if (notes !== undefined) updates.notes = notes;
      if (duration_min) updates.durationMin = duration_min;
      if (status === "washing") updates.startAt = now();
      if (status === "done") {
        updates.completedAt = now();
        updates.endAt = now();
      }

      const [updated] = await db
        .update(washRuns)
        .set(updates)
        .where(eq(washRuns.id, runId))
        .returning();

      if (!updated) return res.status(404).json({ error: "Wash run not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Wave 2: extended to accept optional folded_photo_url alongside weightAfterLbs
  app.post("/api/wash-runs/:id/complete", requireAuth(["laundromat", "admin", "manager"]), async (req: Request, res: Response) => {
    try {
      const runId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(runId)) return res.status(400).json({ error: "Invalid run ID" });

      const currentUser = (req as any).currentUser;

      // P1-9: cross-vendor IDOR — verify run.vendorId matches caller's vendor
      const [existingRun] = await db.select().from(washRuns).where(eq(washRuns.id, runId));
      if (!existingRun) return res.status(404).json({ error: "Wash run not found" });
      if (currentUser.role !== "admin") {
        const callerVendorId = await getManagerVendorId(currentUser);
        if (!callerVendorId || existingRun.vendorId !== callerVendorId) {
          return res.status(403).json({ error: "Wash run belongs to another vendor" });
        }
      }

      const { folded_photo_url, foldedPhotoUrl, weightAfterLbs, weight_after_lbs } = req.body;
      const photoUrl = folded_photo_url || foldedPhotoUrl;

      // Build update payload
      const updatePayload: Record<string, any> = { status: "done", completedAt: now(), endAt: now() };

      // If photo URL provided, append to photo_urls array
      if (photoUrl) {
        // Read existing photo_urls, append new one
        const [existing] = await db.select({ photoUrls: washRuns.photoUrls }).from(washRuns).where(eq(washRuns.id, runId));
        let photos: string[] = [];
        if (existing?.photoUrls) {
          try { photos = JSON.parse(existing.photoUrls); } catch { photos = []; }
        }
        photos.push(photoUrl);
        updatePayload.photoUrls = JSON.stringify(photos);
      }

      const [run] = await db
        .update(washRuns)
        .set(updatePayload)
        .where(eq(washRuns.id, runId))
        .returning();

      if (!run) return res.status(404).json({ error: "Wash run not found" });

      const order = await storage.getOrder(run.orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      const sourceStates = ["wash_complete", "folding", "drying", "washing"];
      let transitioned = false;
      for (const fromState of sourceStates) {
        if (order.status === fromState) {
          const validation = validateTransition(fromState, "folded_packaged");
          if (validation.valid) {
            await storage.updateOrder(order.id, { status: "folded_packaged" } as any);
            transitioned = true;
            break;
          }
        }
      }

      const updatedOrder = await storage.getOrder(run.orderId);
      res.json({ washRun: run, order: updatedOrder, transitioned });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/orders/:id/final-weight", requireAuth(["laundromat", "admin", "manager"]), async (req: Request, res: Response) => {
    try {
      const orderId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(orderId)) return res.status(400).json({ error: "Invalid order ID" });

      const order = await storage.getOrder(orderId);
      if (!order) return res.status(404).json({ error: "Order not found" });

      // P1-9: cross-vendor IDOR — verify order.vendorId matches caller's vendor
      const currentUser = (req as any).currentUser;
      if (currentUser.role !== "admin") {
        const callerVendorId = await getManagerVendorId(currentUser);
        if (!callerVendorId || order.vendorId !== callerVendorId) {
          return res.status(403).json({ error: "Order belongs to another vendor" });
        }
      }

      const { output_weight } = req.body;

      const validation = validateTransition(order.status, "final_weight_verified");
      if (!validation.valid) {
        return res.status(422).json({
          error: `Cannot transition from '${order.status}' to 'final_weight_verified'`,
          currentStatus: order.status,
        });
      }

      const updateData: any = { status: "final_weight_verified" };
      if (output_weight != null) {
        updateData.outputWeight = output_weight;
        updateData.cleanWeight = output_weight;
      }

      await storage.updateOrder(orderId, updateData);
      const updated = await storage.getOrder(orderId);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  VENDOR EMPLOYEES
  // ══════════════════════════════════════════════════════════

  async function getManagerVendorId(user: any): Promise<number | null> {
    if (user.role === "admin") return null;
    if (user.vendorId) return user.vendorId;
    const [emp] = await db
      .select()
      .from(vendorEmployees)
      .where(and(eq(vendorEmployees.userId, user.id), eq(vendorEmployees.active, true)));
    return emp?.vendorId || null;
  }

  app.post("/api/vendor-employees", requireAuth(["manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const currentUser = (req as any).currentUser;
      const { name, email, phone, role, permissions, vendor_id } = req.body;

      if (!name || !email || !role) {
        return res.status(400).json({ error: "name, email, and role are required" });
      }

      const validRoles = ["manager", "driver", "wash_operator"];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
      }

      let resolvedVendorId = vendor_id;
      if (currentUser.role !== "admin") {
        const mgrVendorId = await getManagerVendorId(currentUser);
        if (!mgrVendorId) return res.status(403).json({ error: "You are not associated with a vendor" });
        resolvedVendorId = mgrVendorId;
      }
      if (!resolvedVendorId) return res.status(400).json({ error: "vendor_id is required" });

      const tempPassword = randomBytes(6).toString("hex");
      const hashedPassword = hashPassword(tempPassword);

      // P2-22: reject malformed permissions payloads (number or object only; undefined falls through to defaults)
      if (permissions !== undefined && typeof permissions !== "number" && (typeof permissions !== "object" || permissions === null || Array.isArray(permissions))) {
        return res.status(400).json({ error: "permissions must be a bitmask number or an object" });
      }

      const username = email.toLowerCase().trim();
      const existingUser = await storage.getUserByEmail(username);
      let newUser;
      if (existingUser) {
        // P0-5: privilege escalation guard
        //   - never attach an admin account to a vendor
        //   - never silently move a user out of an existing different vendor
        if (existingUser.role === "admin") {
          return res.status(403).json({ error: "Cannot attach an admin account as a vendor employee" });
        }
        if (existingUser.vendorId && existingUser.vendorId !== resolvedVendorId) {
          return res.status(409).json({ error: "User already belongs to another vendor" });
        }
        newUser = existingUser;
      } else {
        newUser = await storage.createUser({
          username,
          email: username,
          name,
          phone: phone || "",
          role: role === "wash_operator" ? "laundromat" : role,
          password: hashedPassword,
          memberSince: new Date().toISOString().slice(0, 10),
        });
        await db.update(users).set({ mustChangePassword: true } as any).where(eq(users.id, newUser.id));
      }

      // Wave 2: accept permissions as bitmask number OR as JSON object
      // Bitmask: 1=view_orders, 2=update_wash_status, 4=weight_verification, 8=photo_upload, 16=wash_preferences
      let resolvedPermissions: Record<string, boolean>;
      if (typeof permissions === "number") {
        resolvedPermissions = {
          view_orders: !!(permissions & 1),
          update_wash_status: !!(permissions & 2),
          weight_verification: !!(permissions & 4),
          photo_upload: !!(permissions & 8),
          wash_preferences: !!(permissions & 16),
        };
      } else if (permissions && typeof permissions === "object") {
        resolvedPermissions = permissions;
      } else {
        resolvedPermissions = {
          view_orders: true,
          update_wash_status: role === "wash_operator",
          weight_verification: role === "wash_operator",
          photo_upload: true,
          wash_preferences: role === "wash_operator",
        };
      }

      const [emp] = await db
        .insert(vendorEmployees)
        .values({
          vendorId: resolvedVendorId,
          userId: newUser.id,
          role,
          permissions: JSON.stringify(resolvedPermissions),
          tempPasswordHash: hashedPassword,
          active: true,
          joinedAt: now(),
        })
        .returning();

      await storage.updateUser(newUser.id, { vendorId: resolvedVendorId } as any);

      res.status(201).json({
        employee: emp,
        user: { id: newUser.id, email: newUser.email, name: newUser.name },
        tempPassword,
      });
    } catch (err: any) {
      if (err.message?.includes("duplicate") || (err as any).code === "23505") {
        return res.status(409).json({ error: "Employee already exists for this vendor" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/vendor-employees", requireAuth(["manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const currentUser = (req as any).currentUser;
      let vendorId: number | null = null;

      if (currentUser.role === "admin" && req.query.vendor_id) {
        vendorId = parseInt(String(req.query.vendor_id), 10);
      } else {
        vendorId = await getManagerVendorId(currentUser);
      }

      if (!vendorId) return res.status(403).json({ error: "Not associated with a vendor" });

      const emps = await db
        .select()
        .from(vendorEmployees)
        .where(and(eq(vendorEmployees.vendorId, vendorId), sql`${vendorEmployees.deletedAt} IS NULL`));

      const result = [];
      for (const emp of emps) {
        const user = await storage.getUser(emp.userId);
        result.push({
          ...emp,
          user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null,
        });
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/vendor-employees/:id", requireAuth(["manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const empId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(empId)) return res.status(400).json({ error: "Invalid employee ID" });

      const currentUser = (req as any).currentUser;
      const [emp] = await db.select().from(vendorEmployees).where(eq(vendorEmployees.id, empId));
      if (!emp) return res.status(404).json({ error: "Employee not found" });

      if (currentUser.role !== "admin") {
        const mgrVendorId = await getManagerVendorId(currentUser);
        if (emp.vendorId !== mgrVendorId) return res.status(403).json({ error: "Not authorized" });
      }

      const user = await storage.getUser(emp.userId);
      res.json({
        ...emp,
        user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/vendor-employees/:id", requireAuth(["manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const empId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(empId)) return res.status(400).json({ error: "Invalid employee ID" });

      const currentUser = (req as any).currentUser;
      const [existing] = await db.select().from(vendorEmployees).where(eq(vendorEmployees.id, empId));
      if (!existing) return res.status(404).json({ error: "Employee not found" });

      if (currentUser.role !== "admin") {
        const mgrVendorId = await getManagerVendorId(currentUser);
        if (existing.vendorId !== mgrVendorId) return res.status(403).json({ error: "Not authorized" });
      }

      const { role, permissions, active } = req.body;
      const updates: Record<string, any> = {};
      if (role !== undefined) updates.role = role;
      if (permissions !== undefined) {
        // Wave 2: accept bitmask or object
        if (typeof permissions === "number") {
          updates.permissions = JSON.stringify({
            view_orders: !!(permissions & 1),
            update_wash_status: !!(permissions & 2),
            weight_verification: !!(permissions & 4),
            photo_upload: !!(permissions & 8),
            wash_preferences: !!(permissions & 16),
          });
        } else {
          updates.permissions = JSON.stringify(permissions);
        }
      }
      if (active !== undefined) {
        updates.active = active;
        if (!active) updates.deactivatedAt = now();
      }

      const [updated] = await db
        .update(vendorEmployees)
        .set(updates)
        .where(eq(vendorEmployees.id, empId))
        .returning();

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/vendor-employees/:id", requireAuth(["manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const empId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(empId)) return res.status(400).json({ error: "Invalid employee ID" });

      const currentUser = (req as any).currentUser;
      const [existing] = await db.select().from(vendorEmployees).where(eq(vendorEmployees.id, empId));
      if (!existing) return res.status(404).json({ error: "Employee not found" });

      if (currentUser.role !== "admin") {
        const mgrVendorId = await getManagerVendorId(currentUser);
        if (existing.vendorId !== mgrVendorId) return res.status(403).json({ error: "Not authorized" });
      }

      const [deleted] = await db
        .update(vendorEmployees)
        .set({ deletedAt: now(), active: false })
        .where(eq(vendorEmployees.id, empId))
        .returning();

      res.json({ success: true, employee: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  NOTIFICATION PREFERENCES
  // ══════════════════════════════════════════════════════════

  app.get("/api/notification-preferences", requireAuth(), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const prefs = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, user.id));

      if (prefs.length === 0) {
        const defaults = ["order_updates", "pickup_reminders", "delivery_alerts", "promotions"].map((cat) => ({
          userId: user.id,
          category: cat,
          push: true,
          email: true,
          sms: false,
        }));
        return res.json(defaults);
      }

      res.json(prefs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/notification-preferences", requireAuth(), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const { preferences } = req.body;

      if (!Array.isArray(preferences)) {
        return res.status(400).json({ error: "preferences must be an array" });
      }

      const results = [];
      for (const pref of preferences) {
        if (!pref.category) continue;

        const [existing] = await db
          .select()
          .from(notificationPreferences)
          .where(
            and(
              eq(notificationPreferences.userId, user.id),
              eq(notificationPreferences.category, pref.category),
            ),
          );

        if (existing) {
          const [updated] = await db
            .update(notificationPreferences)
            .set({
              push: pref.push ?? existing.push,
              email: pref.email ?? existing.email,
              sms: pref.sms ?? existing.sms,
            })
            .where(
              and(
                eq(notificationPreferences.userId, user.id),
                eq(notificationPreferences.category, pref.category),
              ),
            )
            .returning();
          results.push(updated);
        } else {
          const [created] = await db
            .insert(notificationPreferences)
            .values({
              userId: user.id,
              category: pref.category,
              push: pref.push ?? true,
              email: pref.email ?? true,
              sms: pref.sms ?? false,
            })
            .returning();
          results.push(created);
        }
      }

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  2FA TOTP
  // ══════════════════════════════════════════════════════════

  app.post("/api/2fa/setup", requireAuth(), twoFaSetupLimit, async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;

      const [existing] = await db.select().from(user2fa).where(eq(user2fa.userId, user.id));
      if (existing?.enabled) {
        return res.status(409).json({ error: "2FA is already enabled. Disable first to reconfigure." });
      }

      const secret = await totpGenerateSecret();
      const encryptedSecret = encryptSecret(secret);
      const { plain: backupCodes, hashed: backupCodesHashed } = generateBackupCodes(10);
      const otpauth = await totpGenerateURI(user.email || user.username, "Offload", secret);

      if (existing) {
        await db
          .update(user2fa)
          .set({
            totpSecretEnc: encryptedSecret,
            backupCodesHash: JSON.stringify(backupCodesHashed),
            enabled: false,
            verifiedAt: null,
          })
          .where(eq(user2fa.userId, user.id));
      } else {
        await db.insert(user2fa).values({
          userId: user.id,
          method: "totp",
          totpSecretEnc: encryptedSecret,
          backupCodesHash: JSON.stringify(backupCodesHashed),
          enabled: false,
        });
      }

      res.json({
        otpauth,
        secret,
        backupCodes,
        message: "Scan the QR code, then verify with POST /api/2fa/verify",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/2fa/verify", requireAuth(), twoFaVerifyLimit, async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const { token } = req.body;

      if (!token) return res.status(400).json({ error: "token is required" });

      const [record] = await db.select().from(user2fa).where(eq(user2fa.userId, user.id));
      if (!record) return res.status(404).json({ error: "2FA not set up. Call POST /api/2fa/setup first." });
      if (!record.totpSecretEnc) return res.status(400).json({ error: "No TOTP secret configured" });

      const secret = decryptSecret(record.totpSecretEnc);
      const valid = await totpVerify(token, secret);
      if (!valid) return res.status(401).json({ error: "Invalid TOTP token" });

      await db
        .update(user2fa)
        .set({ enabled: true, verifiedAt: now() })
        .where(eq(user2fa.userId, user.id));

      res.json({ success: true, message: "2FA is now enabled" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/2fa", requireAuth(), async (req: Request, res: Response) => {
    try {
      const user = (req as any).currentUser;
      const { token } = req.body;

      if (!token) return res.status(400).json({ error: "Current TOTP token required to disable 2FA" });

      const [record] = await db.select().from(user2fa).where(eq(user2fa.userId, user.id));
      if (!record || !record.enabled) return res.status(404).json({ error: "2FA is not enabled" });
      if (!record.totpSecretEnc) return res.status(400).json({ error: "No TOTP secret configured" });

      const secret = decryptSecret(record.totpSecretEnc);
      const valid = await totpVerify(token, secret);
      if (!valid) return res.status(401).json({ error: "Invalid TOTP token" });

      await db.delete(user2fa).where(eq(user2fa.userId, user.id));
      res.json({ success: true, message: "2FA has been disabled" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/2fa-challenge", twoFaChallengeLimit, async (req: Request, res: Response) => {
    try {
      const { user_id, token, backup_code, pre_auth_token } = req.body;

      if (!user_id) return res.status(400).json({ error: "user_id is required" });
      if (!token && !backup_code) return res.status(400).json({ error: "token or backup_code is required" });

      // Require valid pre-auth token (issued by login endpoint when 2FA is needed)
      if (!pre_auth_token || !preAuthTokenStore.validate(pre_auth_token, user_id)) {
        return res.status(403).json({ error: "Invalid or expired pre-auth token. Please log in again." });
      }

      const [record] = await db.select().from(user2fa).where(eq(user2fa.userId, user_id));
      if (!record || !record.enabled) {
        return res.status(400).json({ error: "2FA is not enabled for this user" });
      }

      let verified = false;
      let message = "";
      let extra: Record<string, any> = {};

      if (token) {
        if (!record.totpSecretEnc) return res.status(400).json({ error: "No TOTP secret configured" });
        const secret = decryptSecret(record.totpSecretEnc);
        const valid = await totpVerify(token, secret);
        if (!valid) return res.status(401).json({ error: "Invalid TOTP token" });
        verified = true;
        message = "2FA verified";
      } else if (backup_code && record.backupCodesHash) {
        let hashes: string[];
        try {
          hashes = JSON.parse(record.backupCodesHash);
        } catch {
          return res.status(500).json({ error: "Backup codes corrupted" });
        }

        let found = -1;
        for (let i = 0; i < hashes.length; i++) {
          if (verifyPassword(backup_code, hashes[i])) {
            found = i;
            break;
          }
        }

        if (found === -1) return res.status(401).json({ error: "Invalid backup code" });

        hashes.splice(found, 1);
        await db
          .update(user2fa)
          .set({ backupCodesHash: JSON.stringify(hashes) })
          .where(eq(user2fa.userId, user_id));

        verified = true;
        message = "2FA verified via backup code";
        extra = { remainingBackupCodes: hashes.length };
      }

      if (!verified) {
        return res.status(400).json({ error: "No valid verification provided" });
      }

      // Consume the pre-auth token and issue a real session
      preAuthTokenStore.consume(pre_auth_token, user_id);
      const user = await storage.getUser(user_id);
      if (!user) return res.status(404).json({ error: "User not found" });
      const sessionToken = await createSession(user.id, user.role);
      setSessionCookie(res, sessionToken);

      return res.json({ success: true, message, ...extra, user: { ...user, password: undefined }, token: sessionToken });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  VENDOR BANK ACCOUNT (masked display only)
  // ══════════════════════════════════════════════════════════

  app.get("/api/vendors/:id/bank-account", requireAuth(["manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(vendorId)) return res.status(400).json({ error: "Invalid vendor ID" });

      const currentUser = (req as any).currentUser;
      if (currentUser.role !== "admin") {
        const mgrVendorId = await getManagerVendorId(currentUser);
        if (vendorId !== mgrVendorId) return res.status(403).json({ error: "Not authorized" });
      }

      const [account] = await db
        .select({
          id: vendorBankAccounts.id,
          vendorId: vendorBankAccounts.vendorId,
          bankName: vendorBankAccounts.bankName,
          last4: vendorBankAccounts.last4,
          status: vendorBankAccounts.status,
        })
        .from(vendorBankAccounts)
        .where(eq(vendorBankAccounts.vendorId, vendorId))
        .limit(1);

      if (!account) return res.status(404).json({ error: "No bank account on file" });

      res.json({
        id: account.id,
        bankName: account.bankName,
        last4: account.last4,
        display: `${account.bankName} ••••${account.last4}`,
        status: account.status,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  SERVICE AREA REQUESTS (public)
  // ══════════════════════════════════════════════════════════

  app.post("/api/service-area-requests", async (req: Request, res: Response) => {
    try {
      const {
        address, lat, lng, zip, requested_service, contact_email, contact_phone, notes: bodyNotes,
        name, email, phone, city, state,
      } = req.body;

      if (!zip && !address) {
        return res.status(400).json({ error: "zip or address is required" });
      }

      const request = await storage.createServiceAreaRequest({
        name: name || null,
        email: email || contact_email || null,
        phone: phone || contact_phone || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zip: zip || null,
        lat: lat || null,
        lng: lng || null,
        requestedService: requested_service || null,
        source: "customer_app",
        notes: bodyNotes || null,
      });

      res.status(201).json({ id: request.id, status: request.status });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/service-area/check", async (req: Request, res: Response) => {
    try {
      const { lat, lng, zip, service_type } = req.query;
      const result = await checkServiceArea({
        lat: lat ? parseFloat(String(lat)) : undefined,
        lng: lng ? parseFloat(String(lng)) : undefined,
        zip: zip ? String(zip) : undefined,
        service_type: service_type ? String(service_type) : undefined,
      });

      if (!result.available) {
        return res.status(422).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  ADMIN SERVICE AREA REQUESTS
  // ══════════════════════════════════════════════════════════

  app.get("/api/admin/service-area-requests", requireAuth(["admin"]), async (req: Request, res: Response) => {
    try {
      const { status, zip, limit, offset } = req.query;
      const requests = await storage.getServiceAreaRequests({
        status: status ? String(status) : undefined,
        zip: zip ? String(zip) : undefined,
        limit: limit ? parseInt(String(limit), 10) : 50,
        offset: offset ? parseInt(String(offset), 10) : 0,
      });
      res.json(requests);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/service-area-requests/:id", requireAuth(["admin"]), async (req: Request, res: Response) => {
    try {
      const id = parseInt(paramStr(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

      const { status, notes } = req.body;
      const updated = await storage.updateServiceAreaRequest(id, { status, notes });
      if (!updated) return res.status(404).json({ error: "Request not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  BONUS ENDPOINTS
  // ══════════════════════════════════════════════════════════

  app.get("/api/vendors/:id/bonuses", requireAuth(["manager", "admin"]), async (req: Request, res: Response) => {
    try {
      const vendorId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(vendorId)) return res.status(400).json({ error: "Invalid vendor ID" });

      const currentUser = (req as any).currentUser;
      if (currentUser.role !== "admin") {
        const mgrVendorId = await getManagerVendorId(currentUser);
        if (vendorId !== mgrVendorId) return res.status(403).json({ error: "Not authorized" });
      }

      const payouts = await db
        .select()
        .from(performanceBonusPayouts)
        .where(eq(performanceBonusPayouts.vendorId, vendorId))
        .orderBy(desc(performanceBonusPayouts.triggeredAt));

      res.json(payouts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/bonus-rules", requireAuth(["admin"]), async (req: Request, res: Response) => {
    try {
      const rules = await db.select().from(performanceBonusRules);
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/admin/bonus-rules/:id", requireAuth(["admin"]), async (req: Request, res: Response) => {
    try {
      const ruleId = parseInt(paramStr(req.params.id), 10);
      if (isNaN(ruleId)) return res.status(400).json({ error: "Invalid rule ID" });

      const { active, threshold, amount_cents } = req.body;
      const updates: Record<string, any> = { updatedAt: now() };
      if (active !== undefined) updates.active = active;
      if (threshold !== undefined) updates.threshold = threshold;
      if (amount_cents !== undefined) updates.amountCents = amount_cents;

      const [updated] = await db
        .update(performanceBonusRules)
        .set(updates)
        .where(eq(performanceBonusRules.id, ruleId))
        .returning();

      if (!updated) return res.status(404).json({ error: "Rule not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════════════════════════
  //  VOICE ORDER (structured extraction, NO price compute)
  // ══════════════════════════════════════════════════════════

  // DEPRECATED: Use POST /api/voice/parse instead (Wave 2).
  // Owner directive: "Voice NEVER displays a price; price comes from /api/quote after wizard submission."
  // This endpoint should NOT be used by the new wizard flow. Kept for backward compat only.
  app.post("/api/voice/order", requireAuth(), async (req: Request, res: Response) => {
    // Set deprecation header
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", "2026-07-01");
    res.setHeader("Link", '</api/voice/parse>; rel="successor-version"');

    // P1-14: feature flag to disable the deprecated endpoint entirely (default off; flip to "true" in production)
    if (process.env.DISABLE_LEGACY_VOICE_ORDER === "true") {
      return res.status(410).json({ error: "Endpoint removed. Use POST /api/voice/parse." });
    }

    try {
      const { transcript, intent } = req.body;

      if (!transcript) return res.status(400).json({ error: "transcript is required" });

      const washSpec: Record<string, any> = {
        transcript,
        bags: intent?.bags || [],
        service_type: intent?.service_type || "wash_fold",
        delivery_speed: intent?.delivery_speed || "48h",
        clothing_types: intent?.clothing_types || [],
        separated: intent?.separated || false,
        wash_preferences: {
          detergent: intent?.detergent || "standard",
          water_temp: intent?.water_temp || "cold",
          drying: intent?.drying || "normal",
          stain_treatment: intent?.stain_treatment || false,
          extra_rinse: intent?.extra_rinse || false,
          special_instructions: intent?.special_instructions || "",
        },
        address: intent?.address || null,
        pickup_time: intent?.pickup_time || null,
        language: intent?.language || "en",
      };

      res.json({
        success: true,
        washSpec,
        message: "Use this wash spec to call POST /api/quotes/calculate for pricing",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
