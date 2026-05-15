import type { Express, Request, Response } from "express";
import { db } from "../../storage";
import { requireAuth } from "../../session";
import { notificationPreferences } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export function registerDriverRoutes(app: Express): void {
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
}
