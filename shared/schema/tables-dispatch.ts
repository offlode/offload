import { pgTable, text, integer, serial, doublePrecision, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, orders } from "./tables-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const laundromats = pgTable("laundromats", {
  id: text("id").primaryKey(), // UUID string
  name: text("name").notNull(),
  ownerUserId: integer("owner_user_id").references(() => users.id),
  addressLine1: text("address_line1"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  serviceRadiusMiles: integer("service_radius_miles").default(10),
  certified: boolean("certified").default(false),
  active: boolean("active").default(true),
  acceptsStandard: boolean("accepts_standard").default(true),
  acceptsSignature: boolean("accepts_signature").default(true),
  acceptsCustom: boolean("accepts_custom").default(true),
  signaturePremiumCents: integer("signature_premium_cents").default(500),
  capacityBagsPerDay: integer("capacity_bags_per_day").default(100),
  hoursJson: text("hours_json"),
  createdAt: timestamptz("created_at"),
  updatedAt: timestamptz("updated_at"),
});

export const insertLaundromatSchema = createInsertSchema(laundromats);
export type InsertLaundromat = z.infer<typeof insertLaundromatSchema>;
export type Laundromat = typeof laundromats.$inferSelect;

export const dispatchOffers = pgTable("dispatch_offers", {
  id: text("id").primaryKey(), // UUID string
  orderId: integer("order_id").notNull().references(() => orders.id),
  laundromatId: text("laundromat_id").notNull().references(() => laundromats.id),
  offeredAt: timestamptz("offered_at"),
  certifiedOnlyUntil: timestamptz("certified_only_until").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | declined | expired | superseded
  respondedAt: timestamptz("responded_at"),
  respondedByUserId: integer("responded_by_user_id").references(() => users.id),
});

export const insertDispatchOfferSchema = createInsertSchema(dispatchOffers);
export type InsertDispatchOffer = z.infer<typeof insertDispatchOfferSchema>;
export type DispatchOffer = typeof dispatchOffers.$inferSelect;
