import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Payment Methods ───
export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // card | apple_pay | google_pay
  label: text("label").notNull(),
  last4: text("last4"),
  expiryDate: text("expiry_date"),
  isDefault: integer("is_default").default(0),
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ id: true });
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type PaymentMethod = typeof paymentMethods.$inferSelect;


// ─── Payment Transactions (Stripe Connect) ───
export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  type: text("type").notNull(), // charge | refund | payout_vendor | payout_driver
  amount: doublePrecision("amount").notNull(),
  amountCents: integer("amount_cents"),
  currency: text("currency").default("usd"),
  status: text("status").default("pending"), // pending | processing | completed | failed
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeTransferId: text("stripe_transfer_id"),
  recipientType: text("recipient_type"), // platform | vendor | driver
  recipientId: integer("recipient_id"),
  platformFee: doublePrecision("platform_fee"),
  metadata: text("metadata"), // JSON
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({ id: true });
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;


// ─── Idempotency Keys (DB-backed) ───
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  response: text("response").notNull(), // JSON stringified response
  statusCode: integer("status_code").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});


// ─── Stripe Webhook Processed Events ───
export const stripeProcessedEvents = pgTable("stripe_processed_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: text("processed_at").notNull(),
});

export const insertStripeProcessedEventSchema = createInsertSchema(stripeProcessedEvents);
export type InsertStripeProcessedEvent = z.infer<typeof insertStripeProcessedEventSchema>;
export type StripeProcessedEvent = typeof stripeProcessedEvents.$inferSelect;
