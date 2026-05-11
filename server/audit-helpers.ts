import type { Request } from "express";
import { storage } from "./storage";

/**
 * Log an admin action to the admin_audit_log table.
 * Fire-and-forget: never throws (catches + logs errors internally).
 */
export async function logAdminAction(req: Request, opts: {
  action: string;
  entityType: string;
  entityId?: string | number;
  oldValue?: any;
  newValue?: any;
  notes?: string;
}): Promise<void> {
  try {
    const user = (req as any).currentUser;
    await storage.createAdminAuditLog({
      actorId: user?.id ?? 0,
      actorRole: user?.role ?? "unknown",
      action: opts.action,
      entityType: opts.entityType,
      entityId: opts.entityId != null ? String(opts.entityId) : null,
      oldValue: opts.oldValue != null ? JSON.stringify(opts.oldValue) : null,
      newValue: opts.newValue != null ? JSON.stringify(opts.newValue) : null,
      ip: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.headers["user-agent"] || null,
      notes: opts.notes || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[audit] Failed to log admin action:", err);
  }
}
