import type { Express, Request, Response } from "express";
import { randomBytes } from "crypto";
import { db } from "../../storage";
import { storage } from "../../storage";
import { requireAuth } from "../../session";
import { hashPassword } from "../../lib/auth";
import { now } from "../../engines";
import { users, vendorEmployees, vendorBankAccounts } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { paramStr, getManagerVendorId } from "./helpers";

export function registerVendorRoutes(app: Express): void {
  // ══════════════════════════════════════════════════════════
  //  VENDOR EMPLOYEES
  // ══════════════════════════════════════════════════════════

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
}
