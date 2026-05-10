import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Referrals ───
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull(),
  refereeId: integer("referee_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | completed | rewarded
  referrerReward: doublePrecision("referrer_reward").default(10), // $ credit
  refereeReward: doublePrecision("referee_reward").default(10), // $ credit
  completedOrderId: integer("completed_order_id"), // first order by referee
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;


// ─── Loyalty Transactions ───
export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id"),
  type: text("type").notNull(), // earned | redeemed | bonus | referral | expired
  points: integer("points").notNull(),
  description: text("description").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactions).omit({ id: true });
export type InsertLoyaltyTransaction = z.infer<typeof insertLoyaltyTransactionSchema>;
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
