import { pgTable, text, integer, serial, doublePrecision, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./tables-core";
import { orders } from "./tables-core";
import { vendors } from "./tables-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

// ─── Order Events (Audit Trail) ───
export const orderEvents = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  details: text("details"),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorRole: text("actor_role"),
  photoUrl: text("photo_url"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  timestamp: timestamptz("timestamp").notNull(),
});

export const insertOrderEventSchema = createInsertSchema(orderEvents).omit({ id: true });
export type InsertOrderEvent = z.infer<typeof insertOrderEventSchema>;
export type OrderEvent = typeof orderEvents.$inferSelect;

// ─── Payment Methods ───
export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // card | apple_pay | google_pay
  label: text("label").notNull(),
  last4: text("last4"),
  expiryDate: text("expiry_date"),
  isDefault: boolean("is_default").default(false),
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ id: true });
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type PaymentMethod = typeof paymentMethods.$inferSelect;

// ─── Consent Records ───
export const consentRecords = pgTable("consent_records", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  consentType: text("consent_type").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamptz("requested_at").notNull(),
  respondedAt: timestamptz("responded_at"),
  autoApproveAt: timestamptz("auto_approve_at"),
  requestedBy: integer("requested_by"),
  additionalCharge: doublePrecision("additional_charge").default(0),
  additionalChargeCents: integer("additional_charge_cents").notNull().default(0),
});

export const insertConsentSchema = createInsertSchema(consentRecords).omit({ id: true });
export type InsertConsent = z.infer<typeof insertConsentSchema>;
export type ConsentRecord = typeof consentRecords.$inferSelect;

// ─── Messages (In-app chat) ───
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  conversationId: text("conversation_id"), // for non-order chats
  senderId: integer("sender_id").notNull(),
  senderRole: text("sender_role").notNull(),
  content: text("content").notNull(),
  messageType: text("message_type").default("text"), // text | image | system | auto_response
  isAiGenerated: boolean("is_ai_generated").default(false),
  readAt: timestamptz("read_at"),
  timestamp: timestamptz("timestamp").notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ─── Disputes ───
export const disputes = pgTable("disputes", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  customerId: integer("customer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  creditAmount: doublePrecision("credit_amount"),
  refundAmount: doublePrecision("refund_amount"),
  creditAmountCents: integer("credit_amount_cents").notNull().default(0),
  refundAmountCents: integer("refund_amount_cents").notNull().default(0),
  assignedTo: integer("assigned_to"),
  priority: text("priority").default("medium"),
  // AI analysis
  aiSuggestedResolution: text("ai_suggested_resolution"),
  aiSentimentScore: doublePrecision("ai_sentiment_score"), // -1 to 1
  aiCategory: text("ai_category"), // missing_item | quality | timing | billing | other
  aiAutoResolvable: boolean("ai_auto_resolvable").default(false),
  photoEvidence: text("photo_evidence"), // JSON: array of photo URLs
  createdAt: timestamptz("created_at").notNull(),
  resolvedAt: timestamptz("resolved_at"),
});

export const insertDisputeSchema = createInsertSchema(disputes).omit({ id: true });
export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputes.$inferSelect;

// ─── Reviews / Ratings ───
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  vendorId: integer("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  driverId: integer("driver_id"),
  vendorRating: integer("vendor_rating"),
  driverRating: integer("driver_rating"),
  overallRating: integer("overall_rating").notNull(),
  comment: text("comment"),
  // AI analysis
  aiSentiment: text("ai_sentiment"), // positive | neutral | negative
  aiTopics: text("ai_topics"), // JSON: extracted topics
  aiActionable: boolean("ai_actionable").default(false), // needs attention?
  // Response
  vendorResponse: text("vendor_response"),
  vendorRespondedAt: timestamptz("vendor_responded_at"),
  createdAt: timestamptz("created_at").notNull(),
});

export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

// ─── Notifications ───
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: boolean("read").default(false),
  actionUrl: text("action_url"),
  category: text("category").default("system"), // order_update | message | promo | system | driver_update
  priority: text("priority").default("normal"), // low | normal | high | urgent
  icon: text("icon"), // lucide icon name for display
  createdAt: timestamptz("created_at").notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ─── Push Tokens ───
export const pushTokens = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(),
  createdAt: timestamptz("created_at").notNull(),
});

export const insertPushTokenSchema = createInsertSchema(pushTokens).omit({ id: true });
export type InsertPushToken = z.infer<typeof insertPushTokenSchema>;
export type PushToken = typeof pushTokens.$inferSelect;

// ─── Promo Codes ───
export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull(), // percentage | fixed | free_delivery
  value: doublePrecision("value").notNull(), // % off or $ amount
  minOrderAmount: doublePrecision("min_order_amount").default(0),
  valueCents: integer("value_cents").notNull().default(0),
  minOrderAmountCents: integer("min_order_amount_cents").notNull().default(0),
  maxUses: integer("max_uses").default(0), // 0 = unlimited
  usedCount: integer("used_count").default(0),
  isActive: boolean("is_active").default(true),
  expiresAt: timestamptz("expires_at"),
  createdAt: timestamptz("created_at").notNull(),
});

export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true });
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;

// ─── Referrals ───
export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refereeId: integer("referee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | completed | rewarded
  referrerReward: doublePrecision("referrer_reward").default(10), // $ credit
  refereeReward: doublePrecision("referee_reward").default(10), // $ credit
  referrerRewardCents: integer("referrer_reward_cents").notNull().default(0),
  refereeRewardCents: integer("referee_reward_cents").notNull().default(0),
  completedOrderId: integer("completed_order_id").references(() => orders.id, { onDelete: "set null" }), // first order by referee
  createdAt: timestamptz("created_at").notNull(),
  completedAt: timestamptz("completed_at"),
});

export const insertReferralSchema = createInsertSchema(referrals).omit({ id: true });
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Referral = typeof referrals.$inferSelect;

// ─── Loyalty Transactions ───
export const loyaltyTransactions = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  type: text("type").notNull(), // earned | redeemed | bonus | referral | expired
  points: integer("points").notNull(),
  description: text("description").notNull(),
  createdAt: timestamptz("created_at").notNull(),
});

export const insertLoyaltyTransactionSchema = createInsertSchema(loyaltyTransactions).omit({ id: true });
export type InsertLoyaltyTransaction = z.infer<typeof insertLoyaltyTransactionSchema>;
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;

// ─── AI Chat Sessions ───
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  status: text("status").notNull().default("active"), // active | resolved | escalated
  topic: text("topic"), // order_status | reschedule | cancel | complaint | general
  aiResolved: boolean("ai_resolved").default(false),
  escalatedTo: integer("escalated_to"), // admin userId
  messagesJson: text("messages_json"), // JSON: full conversation
  createdAt: timestamptz("created_at").notNull(),
  resolvedAt: timestamptz("resolved_at"),
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({ id: true });
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

// ─── Vendor Payouts (ledger) ───
export const vendorPayouts = pgTable("vendor_payouts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "restrict" }),
  amount: doublePrecision("amount").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | processing | completed | failed
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  ordersCount: integer("orders_count").default(0),
  createdAt: timestamptz("created_at").notNull(),
  paidAt: timestamptz("paid_at"),
});

export const insertVendorPayoutSchema = createInsertSchema(vendorPayouts).omit({ id: true });
export type InsertVendorPayout = z.infer<typeof insertVendorPayoutSchema>;
export type VendorPayout = typeof vendorPayouts.$inferSelect;

// ─── Pricing Tiers ───
export const pricingTiers = pgTable("pricing_tiers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // small_bag | medium_bag | large_bag | xl_bag
  displayName: text("display_name").notNull(),
  maxWeight: doublePrecision("max_weight").notNull(), // lbs
  flatPrice: doublePrecision("flat_price").notNull(),
  overageRate: doublePrecision("overage_rate").notNull(), // per lb
  flatPriceCents: integer("flat_price_cents").notNull().default(0),
  overageRateCents: integer("overage_rate_cents").notNull().default(0),
  description: text("description"),
  icon: text("icon"),
  isActive: boolean("is_active").default(true),
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
  priceCents: integer("price_cents").notNull().default(0),
  description: text("description"),
  category: text("category").notNull().default("service"), // detergent | treatment | service
  isActive: boolean("is_active").default(true),
  // D10: priceMode controls whether qty is forced to 1 (per_order) or matches item count (per_item)
  priceMode: text("price_mode").default("per_order"), // "per_item" | "per_order"
});

export const insertAddOnSchema = createInsertSchema(addOns).omit({ id: true });
export type InsertAddOn = z.infer<typeof insertAddOnSchema>;
export type AddOn = typeof addOns.$inferSelect;

// ─── Order Add-Ons (junction) ───
export const orderAddOns = pgTable("order_add_ons", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  addOnId: integer("add_on_id").notNull().references(() => addOns.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: doublePrecision("unit_price").notNull(),
  total: doublePrecision("total").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
});

export const insertOrderAddOnSchema = createInsertSchema(orderAddOns).omit({ id: true });
export type InsertOrderAddOn = z.infer<typeof insertOrderAddOnSchema>;
export type OrderAddOn = typeof orderAddOns.$inferSelect;
