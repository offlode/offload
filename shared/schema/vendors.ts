import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Vendors (Laundromats) ───
export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  phone: text("phone"),
  email: text("email"),
  rating: doublePrecision("rating").default(4.5),
  reviewCount: integer("review_count").default(0),
  certified: integer("certified").default(1),
  capacity: integer("capacity").default(50),
  currentLoad: integer("current_load").default(0),
  status: text("status").notNull().default("active"), // active | inactive | suspended
  capabilities: text("capabilities"), // JSON: wash types supported
  avatarUrl: text("avatar_url"),
  performanceTier: text("performance_tier").default("standard"), // standard | premium | elite
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  // Payout tracking
  payoutRate: doublePrecision("payout_rate").default(0.65),
  totalEarnings: doublePrecision("total_earnings").default(0),
  pendingPayout: doublePrecision("pending_payout").default(0),
  // AI Scoring
  aiHealthScore: doublePrecision("ai_health_score").default(85), // 0-100
  avgProcessingTime: doublePrecision("avg_processing_time").default(180), // minutes
  onTimeRate: doublePrecision("on_time_rate").default(0.95), // 0-1
  qualityScore: doublePrecision("quality_score").default(4.5), // 1-5
  disputeRate: doublePrecision("dispute_rate").default(0.02), // 0-1
  // Operating hours (JSON: {mon: {open: "7:00", close: "22:00"}, ...})
  operatingHours: text("operating_hours"),
  // Services offered
  offersDryCleaning: integer("offers_dry_cleaning").default(0),
  offersAlterations: integer("offers_alterations").default(0),
  offersComforters: integer("offers_comforters").default(0),
  offersCommercial: integer("offers_commercial").default(0),
  // Demand forecasting
  avgDailyOrders: doublePrecision("avg_daily_orders").default(10),
  peakDayOfWeek: text("peak_day_of_week").default("Monday"),
});

export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;


// ─── Vendor Payouts (ledger) ───
export const vendorPayouts = pgTable("vendor_payouts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),
  amount: doublePrecision("amount").notNull(),
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  ordersCount: integer("orders_count").default(0),
  createdAt: text("created_at").notNull(),
  paidAt: text("paid_at"),
});

export const insertVendorPayoutSchema = createInsertSchema(vendorPayouts).omit({ id: true });
export type InsertVendorPayout = z.infer<typeof insertVendorPayoutSchema>;
export type VendorPayout = typeof vendorPayouts.$inferSelect;


// ─── Stripe Connect Accounts ───
export const stripeAccounts = pgTable("stripe_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userType: text("user_type").notNull(), // vendor | driver
  stripeAccountId: text("stripe_account_id"), // acct_xxx
  status: text("status").default("pending"), // pending | active | restricted | disabled
  onboardingComplete: integer("onboarding_complete").default(0),
  payoutsEnabled: integer("payouts_enabled").default(0),
  chargesEnabled: integer("charges_enabled").default(0),
  createdAt: text("created_at").notNull(),
});

export const insertStripeAccountSchema = createInsertSchema(stripeAccounts).omit({ id: true });
export type InsertStripeAccount = z.infer<typeof insertStripeAccountSchema>;
export type StripeAccount = typeof stripeAccounts.$inferSelect;
