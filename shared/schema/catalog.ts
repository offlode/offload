import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Service Types ───
export const serviceTypes = pgTable("service_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // wash_fold | dry_cleaning | comforters | alterations | commercial
  displayName: text("display_name").notNull(),
  description: text("description"),
  basePrice: doublePrecision("base_price").notNull(), // per unit (lb or item)
  unit: text("unit").notNull().default("lb"), // lb | item | load
  icon: text("icon"), // lucide icon name
  isActive: integer("is_active").default(1),
  sortOrder: integer("sort_order").default(0),
});

export const insertServiceTypeSchema = createInsertSchema(serviceTypes).omit({ id: true });
export type InsertServiceType = z.infer<typeof insertServiceTypeSchema>;
export type ServiceType = typeof serviceTypes.$inferSelect;


// ─── Pricing Tiers ───
export const pricingTiers = pgTable("pricing_tiers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // small_bag | medium_bag | large_bag | xl_bag
  displayName: text("display_name").notNull(),
  maxWeight: doublePrecision("max_weight").notNull(), // lbs
  flatPrice: doublePrecision("flat_price").notNull(),
  overageRate: doublePrecision("overage_rate").notNull(), // per lb
  description: text("description"),
  icon: text("icon"),
  isActive: integer("is_active").default(1),
  sortOrder: integer("sort_order").default(0),
});

export const insertPricingTierSchema = createInsertSchema(pricingTiers).omit({ id: true });
export type InsertPricingTier = z.infer<typeof insertPricingTierSchema>;
export type PricingTier = typeof pricingTiers.$inferSelect;


// ─── Add-Ons ───
export const addOns = pgTable("add_ons", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  displayName: text("display_name").notNull(),
  price: doublePrecision("price").notNull(),
  description: text("description"),
  category: text("category").notNull().default("service"), // detergent | treatment | service
  isActive: integer("is_active").default(1),
});

export const insertAddOnSchema = createInsertSchema(addOns).omit({ id: true });
export type InsertAddOn = z.infer<typeof insertAddOnSchema>;
export type AddOn = typeof addOns.$inferSelect;


// ─── Order Add-Ons (junction) ───
export const orderAddOns = pgTable("order_add_ons", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  addOnId: integer("add_on_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: doublePrecision("unit_price").notNull(),
  total: doublePrecision("total").notNull(),
});

export const insertOrderAddOnSchema = createInsertSchema(orderAddOns).omit({ id: true });
export type InsertOrderAddOn = z.infer<typeof insertOrderAddOnSchema>;
export type OrderAddOn = typeof orderAddOns.$inferSelect;


// ─── Pricing Config (admin-configurable) ───
export const pricingConfig = pgTable("pricing_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(), // JSON
  category: text("category").notNull(), // service_tiers | delivery_fees | speed_surcharges | logistics | tax | general
  description: text("description"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: integer("updated_by"),
});

export const insertPricingConfigSchema = createInsertSchema(pricingConfig).omit({ id: true });
export type InsertPricingConfig = z.infer<typeof insertPricingConfigSchema>;
export type PricingConfig = typeof pricingConfig.$inferSelect;


// ─── Pricing Audit Log ───
export const pricingAuditLog = pgTable("pricing_audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // config_change | quote_created | quote_locked | quote_expired | price_override
  details: text("details").notNull(), // JSON
  actorId: integer("actor_id"),
  actorRole: text("actor_role"),
  timestamp: text("timestamp").notNull(),
});

export const insertPricingAuditLogSchema = createInsertSchema(pricingAuditLog).omit({ id: true });
export type InsertPricingAuditLog = z.infer<typeof insertPricingAuditLogSchema>;
export type PricingAuditLog = typeof pricingAuditLog.$inferSelect;
