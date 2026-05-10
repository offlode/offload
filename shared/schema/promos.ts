import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Promo Codes ───
export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull(), // percentage | fixed | free_delivery
  value: doublePrecision("value").notNull(), // % off or $ amount
  minOrderAmount: doublePrecision("min_order_amount").default(0),
  maxUses: integer("max_uses").default(0), // 0 = unlimited
  usedCount: integer("used_count").default(0),
  isActive: integer("is_active").default(1),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
});

export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true });
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;


// ─── Promo Usage (per-user tracking) ───
export const promoUsage = pgTable("promo_usage", {
  id: serial("id").primaryKey(),
  promoId: integer("promo_id").notNull(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id"),
  usedAt: text("used_at").notNull(),
});
