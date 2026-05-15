import type { Express, Request, Response } from "express";
import { db } from "../../storage";
import { storage } from "../../storage";
import { requireAuth } from "../../session";
import { now } from "../../engines";
import { buildOrderProgress } from "../../order-display-labels";
import { validateTransition } from "../../order-fsm";
import { washRuns } from "@shared/schema";
import { eq } from "drizzle-orm";
import { paramStr, getManagerVendorId } from "./helpers";

export function registerOrderRoutes(app: Express): void {
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
}
