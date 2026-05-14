import { pgTable, text, integer, serial, boolean, timestamp, primaryKey, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, vendors, orders } from "./tables-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

// ─── Wash Runs ───
export const washRuns = pgTable("wash_runs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  operatorId: integer("operator_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending"), // pending | washing | done
  durationMin: integer("duration_min"),
  startAt: timestamptz("start_at"),
  endAt: timestamptz("end_at"),
  completedAt: timestamptz("completed_at"),
  photoUrls: text("photo_urls"), // stored as postgres text[] but drizzle maps to text
  notes: text("notes"),
  separationRequired: boolean("separation_required").default(false),
  clothingTypes: text("clothing_types"), // stored as postgres text[]
});

export const insertWashRunSchema = createInsertSchema(washRuns).omit({ id: true });
export type InsertWashRun = z.infer<typeof insertWashRunSchema>;
export type WashRun = typeof washRuns.$inferSelect;

// ─── Vendor Employees ───
export const vendorEmployees = pgTable("vendor_employees", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // manager | driver | wash_operator
  permissions: text("permissions"), // jsonb stored as text in drizzle
  tempPasswordHash: text("temp_password_hash"),
  active: boolean("active").default(true),
  joinedAt: timestamptz("joined_at"),
  lastLoginAt: timestamptz("last_login_at"),
  deactivatedAt: timestamptz("deactivated_at"),
  deletedAt: timestamptz("deleted_at"),
});

export const insertVendorEmployeeSchema = createInsertSchema(vendorEmployees).omit({ id: true });
export type InsertVendorEmployee = z.infer<typeof insertVendorEmployeeSchema>;
export type VendorEmployee = typeof vendorEmployees.$inferSelect;

// ─── Performance Bonus Rules ───
export const performanceBonusRules = pgTable("performance_bonus_rules", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").references(() => vendors.id, { onDelete: "cascade" }),
  ruleType: text("rule_type").notNull(), // five_star_streak | volume | on_time
  threshold: integer("threshold").notNull(),
  amountCents: integer("amount_cents").notNull(),
  active: boolean("active").default(true),
  createdAt: timestamptz("created_at"),
  updatedAt: timestamptz("updated_at"),
});

export const insertPerformanceBonusRuleSchema = createInsertSchema(performanceBonusRules).omit({ id: true });
export type InsertPerformanceBonusRule = z.infer<typeof insertPerformanceBonusRuleSchema>;
export type PerformanceBonusRule = typeof performanceBonusRules.$inferSelect;

// ─── Performance Bonus Payouts ───
export const performanceBonusPayouts = pgTable("performance_bonus_payouts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  ruleId: integer("rule_id").notNull().references(() => performanceBonusRules.id, { onDelete: "cascade" }),
  periodStart: timestamptz("period_start"),
  periodEnd: timestamptz("period_end"),
  amountCents: integer("amount_cents").notNull(),
  triggeredAt: timestamptz("triggered_at"),
  payoutStatus: text("payout_status").notNull().default("pending"),
});

export const insertPerformanceBonusPayoutSchema = createInsertSchema(performanceBonusPayouts).omit({ id: true });
export type InsertPerformanceBonusPayout = z.infer<typeof insertPerformanceBonusPayoutSchema>;
export type PerformanceBonusPayout = typeof performanceBonusPayouts.$inferSelect;

// ─── Vendor Bank Accounts ───
export const vendorBankAccounts = pgTable("vendor_bank_accounts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  bankName: text("bank_name").notNull(),
  last4: text("last4").notNull(),
  maskedRouting: text("masked_routing"),
  status: text("status").notNull().default("pending"), // pending | verified | failed
});

export const insertVendorBankAccountSchema = createInsertSchema(vendorBankAccounts).omit({ id: true });
export type InsertVendorBankAccount = z.infer<typeof insertVendorBankAccountSchema>;
export type VendorBankAccount = typeof vendorBankAccounts.$inferSelect;

// ─── Notification Preferences ───
export const notificationPreferences = pgTable("notification_preferences", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  push: boolean("push").default(true),
  email: boolean("email").default(true),
  sms: boolean("sms").default(false),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.category] }),
}));

export const insertNotificationPreferenceSchema = createInsertSchema(notificationPreferences);
export type InsertNotificationPreference = z.infer<typeof insertNotificationPreferenceSchema>;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;

// ─── User 2FA ───
export const user2fa = pgTable("user_2fa", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  method: text("method").notNull().default("totp"), // totp | email_otp
  totpSecretEnc: text("totp_secret_enc"),
  backupCodesHash: text("backup_codes_hash"), // stored as text[] in postgres
  enabled: boolean("enabled").default(false),
  verifiedAt: timestamptz("verified_at"),
});

export const insertUser2faSchema = createInsertSchema(user2fa);
export type InsertUser2fa = z.infer<typeof insertUser2faSchema>;
export type User2fa = typeof user2fa.$inferSelect;
