import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users ───
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  role: text("role").notNull().default("customer"), // customer | driver | laundromat | manager | admin
  avatarUrl: text("avatar_url"),
  memberSince: text("member_since"),
  rating: doublePrecision("rating").default(5.0),
  vendorId: integer("vendor_id"), // For staff: which vendor they belong to
  // Loyalty & Referrals
  loyaltyPoints: integer("loyalty_points").default(0),
  loyaltyTier: text("loyalty_tier").default("bronze"), // bronze | silver | gold | platinum
  referralCode: text("referral_code"),
  referredBy: integer("referred_by"),
  totalOrders: integer("total_orders").default(0),
  totalSpent: doublePrecision("total_spent").default(0),
  // Preferences
  preferredDetergent: text("preferred_detergent").default("standard"), // standard | hypoallergenic | eco | fragrance_free
  preferredWashTemp: text("preferred_wash_temp").default("cold"), // cold | warm | hot
  specialInstructions: text("special_instructions"),
  // Subscription
  subscriptionTier: text("subscription_tier"), // null | basic | plus | premium
  subscriptionStartDate: text("subscription_start_date"),
  subscriptionEndDate: text("subscription_end_date"),
  // Algorithmic churn risk score
  churnRisk: doublePrecision("churn_risk").default(0), // 0-1 probability
  lastActiveAt: text("last_active_at"),
  // Account credits (e.g. from SLA breach refunds)
  credits: integer("credits").default(0),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;


// ─── Sessions (DB-backed) ───
export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});


// ─── Password Reset Tokens ───
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});
