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

// ─── Addresses ───
export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  label: text("label").notNull(),
  street: text("street").notNull(),
  apt: text("apt"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  notes: text("notes"),
  isDefault: integer("is_default").default(0),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
});

export const insertAddressSchema = createInsertSchema(addresses).omit({ id: true });
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type Address = typeof addresses.$inferSelect;

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

// ─── Drivers ───
export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  vehicleType: text("vehicle_type"),
  licensePlate: text("license_plate"),
  status: text("status").notNull().default("available"), // available | busy | offline
  rating: doublePrecision("rating").default(4.8),
  completedTrips: integer("completed_trips").default(0),
  avatarUrl: text("avatar_url"),
  currentLat: doublePrecision("current_lat"),
  currentLng: doublePrecision("current_lng"),
  // Payout tracking
  payoutPerTrip: doublePrecision("payout_per_trip").default(8.50),
  totalEarnings: doublePrecision("total_earnings").default(0),
  pendingPayout: doublePrecision("pending_payout").default(0),
  todayTrips: integer("today_trips").default(0),
  // AI route optimization
  currentRouteJson: text("current_route_json"), // JSON: optimized route
  estimatedAvailableAt: text("estimated_available_at"),
  maxTripsPerDay: integer("max_trips_per_day").default(15),
  preferredZones: text("preferred_zones"), // JSON: array of zip codes
  // Performance
  onTimePickupRate: doublePrecision("on_time_pickup_rate").default(0.95),
  avgPickupTime: doublePrecision("avg_pickup_time").default(12), // minutes
  customerRatingAvg: doublePrecision("customer_rating_avg").default(4.8),
});

export const insertDriverSchema = createInsertSchema(drivers).omit({ id: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof drivers.$inferSelect;

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

// ─── Orders ───
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  vendorId: integer("vendor_id"),
  driverId: integer("driver_id"),
  returnDriverId: integer("return_driver_id"),
  status: text("status").notNull().default("pending"),
  // pending | confirmed | driver_assigned | pickup_in_progress | picked_up |
  // at_laundromat | washing | wash_complete | quality_check | packing | ready_for_delivery |
  // out_for_delivery | delivered | cancelled | disputed
  pickupAddressId: integer("pickup_address_id").notNull(),
  pickupAddress: text("pickup_address").notNull(),
  deliveryAddressId: integer("delivery_address_id"), // can differ from pickup
  deliveryAddress: text("delivery_address"),
  deliveryType: text("delivery_type").default("contactless"),
  deliverySpeed: text("delivery_speed").default("48h"), // 48h | 24h | same_day | express_3h
  scheduledPickup: text("scheduled_pickup"),
  pickupTimeWindow: text("pickup_time_window"),
  // Dynamic pickup logistics (drives Uber-style pricing)
  pickupFloor: integer("pickup_floor"), // 1 = ground/lobby. 4+ no elevator = walk-up surcharge.
  pickupHasElevator: integer("pickup_has_elevator").default(1), // 1=yes, 0=no
  pickupHandoff: text("pickup_handoff").default("curbside"), // curbside | door
  deliveryFloor: integer("delivery_floor"),
  deliveryHasElevator: integer("delivery_has_elevator").default(1),
  deliveryHandoff: text("delivery_handoff").default("curbside"),
  pickupWindowMinutes: integer("pickup_window_minutes").default(30), // 30 | 120 | 240
  pickupDistanceMiles: doublePrecision("pickup_distance_miles"), // customer→laundromat one-way
  pickupDistanceFee: doublePrecision("pickup_distance_fee").default(0),
  floorFee: doublePrecision("floor_fee").default(0),
  handoffFee: doublePrecision("handoff_fee").default(0),
  trafficMultiplier: doublePrecision("traffic_multiplier").default(1.0),
  windowDiscount: doublePrecision("window_discount").default(0),
  addressNotes: text("address_notes"),
  bags: text("bags").notNull(), // JSON
  preferences: text("preferences"), // JSON
  serviceType: text("service_type").default("wash_fold"), // wash_fold | dry_cleaning | comforters | mixed
  subtotal: doublePrecision("subtotal").default(0),
  tax: doublePrecision("tax").default(0),
  deliveryFee: doublePrecision("delivery_fee").default(0),
  discount: doublePrecision("discount").default(0), // loyalty/promo discount
  tip: doublePrecision("tip").default(0),
  total: doublePrecision("total").default(0),
  // Tier-based pricing
  pricingTierId: integer("pricing_tier_id"),
  tierName: text("tier_name"), // e.g. "medium_bag"
  tierFlatPrice: doublePrecision("tier_flat_price"), // snapshot of flat price at time of order
  tierMaxWeight: doublePrecision("tier_max_weight"), // snapshot of max weight for this tier
  overageWeight: doublePrecision("overage_weight").default(0), // lbs over the tier limit
  overageCharge: doublePrecision("overage_charge").default(0), // $ amount for overage
  dirtyWeight: doublePrecision("dirty_weight"), // weight at pickup (before washing)
  cleanWeight: doublePrecision("clean_weight"), // weight after wash/dry
  weightDifference: doublePrecision("weight_difference"), // dirty - clean
  finalPrice: doublePrecision("final_price"), // tierFlatPrice + overageCharge + addons - discount
  intakeWeight: doublePrecision("intake_weight"),
  outputWeight: doublePrecision("output_weight"),
  weightDiscrepancy: integer("weight_discrepancy").default(0),
  certifiedOnly: integer("certified_only").default(1),
  customerNotes: text("customer_notes"),
  // Payment
  paymentStatus: text("payment_status").default("pending"),
  paymentMethodId: integer("payment_method_id"),
  // SLA tracking
  slaDeadline: text("sla_deadline"),
  slaStatus: text("sla_status").default("on_track"),
  // Payouts
  vendorPayout: doublePrecision("vendor_payout").default(0),
  driverPayout: doublePrecision("driver_payout").default(0),
  platformFee: doublePrecision("platform_fee").default(0), // Offload's commission
  // Photos
  pickupPhotoUrl: text("pickup_photo_url"),
  deliveryPhotoUrl: text("delivery_photo_url"),
  intakePhotoUrl: text("intake_photo_url"),
  // AI features
  aiMatchScore: doublePrecision("ai_match_score"), // vendor match quality
  aiPredictedETA: text("ai_predicted_eta"), // AI-estimated delivery time
  aiPricingTier: text("ai_pricing_tier"), // off_peak | normal | peak | surge
  aiQualityScore: doublePrecision("ai_quality_score"), // post-wash quality assessment
  // Promo/Loyalty
  promoCode: text("promo_code"),
  loyaltyPointsEarned: integer("loyalty_points_earned").default(0),
  loyaltyPointsRedeemed: integer("loyalty_points_redeemed").default(0),
  // Reorder
  isReorder: integer("is_reorder").default(0),
  originalOrderId: integer("original_order_id"),
  // Pickup waiting fee — when driver shows up but customer is late
  // Free first 5 min, then $1/min, capped at $15.
  driverArrivedAt: text("driver_arrived_at"),
  customerHandoffAt: text("customer_handoff_at"),
  pickupWaitMinutes: doublePrecision("pickup_wait_minutes").default(0),
  pickupWaitFee: doublePrecision("pickup_wait_fee").default(0),
  // Timestamps
  confirmedAt: text("confirmed_at"),
  pickedUpAt: text("picked_up_at"),
  arrivedLaundromatAt: text("arrived_laundromat_at"),
  washStartedAt: text("wash_started_at"),
  washCompletedAt: text("wash_completed_at"),
  qualityCheckedAt: text("quality_checked_at"),
  outForDeliveryAt: text("out_for_delivery_at"),
  deliveredAt: text("delivered_at"),
  cancelledAt: text("cancelled_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ─── Order Events (Audit Trail) ───
export const orderEvents = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  eventType: text("event_type").notNull(),
  description: text("description").notNull(),
  details: text("details"),
  actorId: integer("actor_id"),
  actorRole: text("actor_role"),
  photoUrl: text("photo_url"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  timestamp: text("timestamp").notNull(),
});

export const insertOrderEventSchema = createInsertSchema(orderEvents).omit({ id: true });
export type InsertOrderEvent = z.infer<typeof insertOrderEventSchema>;
export type OrderEvent = typeof orderEvents.$inferSelect;

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

// ─── Consent Records ───
export const consentRecords = pgTable("consent_records", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  consentType: text("consent_type").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: text("requested_at").notNull(),
  respondedAt: text("responded_at"),
  autoApproveAt: text("auto_approve_at"),
  requestedBy: integer("requested_by"),
  additionalCharge: doublePrecision("additional_charge").default(0),
});

export const insertConsentSchema = createInsertSchema(consentRecords).omit({ id: true });
export type InsertConsent = z.infer<typeof insertConsentSchema>;
export type ConsentRecord = typeof consentRecords.$inferSelect;

// ─── Messages (In-app chat) ───
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id"),
  conversationId: text("conversation_id"), // for non-order chats
  senderId: integer("sender_id").notNull(),
  senderRole: text("sender_role").notNull(),
  content: text("content").notNull(),
  messageType: text("message_type").default("text"), // text | image | system | auto_response
  isAiGenerated: integer("is_ai_generated").default(0),
  readAt: text("read_at"),
  timestamp: text("timestamp").notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// ─── Disputes ───
export const disputes = pgTable("disputes", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  customerId: integer("customer_id").notNull(),
  reason: text("reason").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  creditAmount: doublePrecision("credit_amount"),
  refundAmount: doublePrecision("refund_amount"),
  assignedTo: integer("assigned_to"),
  priority: text("priority").default("medium"),
  // AI analysis
  aiSuggestedResolution: text("ai_suggested_resolution"),
  aiSentimentScore: doublePrecision("ai_sentiment_score"), // -1 to 1
  aiCategory: text("ai_category"), // missing_item | quality | timing | billing | other
  aiAutoResolvable: integer("ai_auto_resolvable").default(0),
  photoEvidence: text("photo_evidence"), // JSON: array of photo URLs
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const insertDisputeSchema = createInsertSchema(disputes).omit({ id: true });
export type InsertDispute = z.infer<typeof insertDisputeSchema>;
export type Dispute = typeof disputes.$inferSelect;

// ─── Reviews / Ratings ───
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  customerId: integer("customer_id").notNull(),
  vendorId: integer("vendor_id"),
  driverId: integer("driver_id"),
  vendorRating: integer("vendor_rating"),
  driverRating: integer("driver_rating"),
  overallRating: integer("overall_rating").notNull(),
  comment: text("comment"),
  // AI analysis
  aiSentiment: text("ai_sentiment"), // positive | neutral | negative
  aiTopics: text("ai_topics"), // JSON: extracted topics
  aiActionable: integer("ai_actionable").default(0), // needs attention?
  // Response
  vendorResponse: text("vendor_response"),
  vendorRespondedAt: text("vendor_responded_at"),
  createdAt: text("created_at").notNull(),
});

export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

// ─── Notifications ───
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  read: integer("read").default(0),
  actionUrl: text("action_url"),
  category: text("category").default("system"), // order_update | message | promo | system | driver_update
  priority: text("priority").default("normal"), // low | normal | high | urgent
  icon: text("icon"), // lucide icon name for display
  createdAt: text("created_at").notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// ─── Push Tokens ───
export const pushTokens = pgTable("push_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  platform: text("platform").notNull(),
  createdAt: text("created_at").notNull(),
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
  maxUses: integer("max_uses").default(0), // 0 = unlimited
  usedCount: integer("used_count").default(0),
  isActive: integer("is_active").default(1),
  expiresAt: text("expires_at"),
  createdAt: text("created_at").notNull(),
});

export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true });
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;

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

// ─── AI Chat Sessions ───
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id"),
  status: text("status").notNull().default("active"), // active | resolved | escalated
  topic: text("topic"), // order_status | reschedule | cancel | complaint | general
  aiResolved: integer("ai_resolved").default(0),
  escalatedTo: integer("escalated_to"), // admin userId
  messagesJson: text("messages_json"), // JSON: full conversation
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({ id: true });
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

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

// ─── Driver Location History ───
export const driverLocationHistory = pgTable("driver_location_history", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull(),
  orderId: integer("order_id"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  accuracy: doublePrecision("accuracy"),
  timestamp: text("timestamp").notNull(),
});

export const insertDriverLocationHistorySchema = createInsertSchema(driverLocationHistory).omit({ id: true });
export type InsertDriverLocationHistory = z.infer<typeof insertDriverLocationHistorySchema>;
export type DriverLocationHistory = typeof driverLocationHistory.$inferSelect;

// ─── Order Photos ───
export const orderPhotos = pgTable("order_photos", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  type: text("type").notNull(), // pickup_proof | delivery_proof | intake_before | intake_after | damage | quality_check
  photoData: text("photo_data").notNull(), // base64 encoded (MVP; would be S3 URL in production)
  r2Key: text("r2_key"), // Cloudflare R2 object key (when using R2 storage)
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  capturedBy: integer("captured_by").notNull(),
  capturedByRole: text("captured_by_role").notNull(),
  notes: text("notes"),
  timestamp: text("timestamp").notNull(),
});

export const insertOrderPhotoSchema = createInsertSchema(orderPhotos).omit({ id: true });
export type InsertOrderPhoto = z.infer<typeof insertOrderPhotoSchema>;
export type OrderPhoto = typeof orderPhotos.$inferSelect;

// ─── Order Status History ───
export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  actorId: integer("actor_id"),
  actorRole: text("actor_role"),
  notes: text("notes"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  timestamp: text("timestamp").notNull(),
});

export const insertOrderStatusHistorySchema = createInsertSchema(orderStatusHistory).omit({ id: true });
export type InsertOrderStatusHistory = z.infer<typeof insertOrderStatusHistorySchema>;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;

// ─── Quotes ───
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  customerId: integer("customer_id"), // null for anonymous website quotes
  sessionId: text("session_id"), // for anonymous quotes from website
  status: text("status").notNull().default("draft"), // draft | quoted | accepted | expired | converted
  // Address info
  pickupAddress: text("pickup_address").notNull(),
  pickupCity: text("pickup_city"),
  pickupState: text("pickup_state"),
  pickupZip: text("pickup_zip"),
  pickupLat: doublePrecision("pickup_lat"),
  pickupLng: doublePrecision("pickup_lng"),
  deliveryAddress: text("delivery_address"),
  // Service selection
  serviceType: text("service_type").notNull().default("wash_fold"),
  tierName: text("tier_name").notNull(), // small_bag | medium_bag | large_bag | xl_bag
  tierFlatPrice: doublePrecision("tier_flat_price").notNull(),
  tierMaxWeight: doublePrecision("tier_max_weight").notNull(),
  overageRate: doublePrecision("overage_rate").notNull(),
  deliverySpeed: text("delivery_speed").notNull().default("48h"),
  // Vendor info
  vendorId: integer("vendor_id"), // null = auto-assign nearest
  vendorName: text("vendor_name"),
  isPreferredVendor: integer("is_preferred_vendor").default(0),
  // Price breakdown
  laundryServicePrice: doublePrecision("laundry_service_price").notNull(),
  speedSurcharge: doublePrecision("speed_surcharge").default(0),
  deliveryFee: doublePrecision("delivery_fee").default(0),
  preferredVendorSurcharge: doublePrecision("preferred_vendor_surcharge").default(0),
  addOnsTotal: doublePrecision("add_ons_total").default(0),
  subtotal: doublePrecision("subtotal").notNull(),
  taxRate: doublePrecision("tax_rate").notNull(),
  taxAmount: doublePrecision("tax_amount").notNull(),
  discount: doublePrecision("discount").default(0),
  total: doublePrecision("total").notNull(),
  // Dynamic pickup logistics (Uber-style)
  pickupFloor: integer("pickup_floor"),
  pickupHasElevator: integer("pickup_has_elevator").default(1),
  pickupHandoff: text("pickup_handoff").default("curbside"),
  pickupWindowMinutes: integer("pickup_window_minutes").default(30),
  pickupDistanceMiles: doublePrecision("pickup_distance_miles"),
  pickupDistanceFee: doublePrecision("pickup_distance_fee").default(0),
  floorFee: doublePrecision("floor_fee").default(0),
  handoffFee: doublePrecision("handoff_fee").default(0),
  trafficMultiplier: doublePrecision("traffic_multiplier").default(1.0),
  windowDiscount: doublePrecision("window_discount").default(0),
  vendorChoiceMode: text("vendor_choice_mode").default("auto"), // auto | nearest | preferred | rated
  // Itemized line items and add-ons as JSON
  lineItemsJson: text("line_items_json"),
  addOnsJson: text("add_ons_json"),
  // Validity & locking
  expiresAt: text("expires_at").notNull(),
  lockedAt: text("locked_at"),
  // Promo
  promoCode: text("promo_code"),
  promoDiscount: doublePrecision("promo_discount").default(0),
  // Conversion tracking
  orderId: integer("order_id"),
  // Idempotency
  idempotencyKey: text("idempotency_key").unique(),
  // Timestamps
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

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

// ─── Sessions (DB-backed) ───
export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull(),
  role: text("role").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

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

// ─── Password Reset Tokens ───
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

// ─── Notification Rules ───
export const notificationRules = pgTable("notification_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),                       // e.g. "Customer: driver assigned"
  trigger: text("trigger").notNull(),                 // matches order status
  audience: text("audience").notNull(),               // customer | driver | vendor | admin
  channels: text("channels").notNull(),               // JSON array of "in_app" | "email" | "sms" | "push"
  titleTemplate: text("title_template").notNull(),
  bodyTemplate: text("body_template").notNull(),
  isActive: integer("is_active").default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertNotificationRuleSchema = createInsertSchema(notificationRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationRule = z.infer<typeof insertNotificationRuleSchema>;
export type NotificationRule = typeof notificationRules.$inferSelect;

// ─── Promo Usage (per-user tracking) ───
export const promoUsage = pgTable("promo_usage", {
  id: serial("id").primaryKey(),
  promoId: integer("promo_id").notNull(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id"),
  usedAt: text("used_at").notNull(),
});

// ─── Pricing Tiers Constant ───
export const PRICING_TIERS = {
  small_bag: { maxWeight: 10, flatPrice: 24.99, overageRate: 2.50, displayName: "Small Bag", description: "Perfect for a week's basics" },
  medium_bag: { maxWeight: 20, flatPrice: 44.99, overageRate: 2.50, displayName: "Medium Bag", description: "Great for families" },
  large_bag: { maxWeight: 30, flatPrice: 59.99, overageRate: 2.50, displayName: "Large Bag", description: "Big loads, big savings" },
  xl_bag: { maxWeight: 50, flatPrice: 89.99, overageRate: 2.50, displayName: "XL Bag", description: "Commercial & bulk orders" },
} as const;

// ─── Service Type Multipliers ───
export const SERVICE_TYPE_MULTIPLIERS: Record<string, number> = {
  wash_fold: 1.0,
  dry_cleaning: 1.65,
  comforters: 1.40,
  mixed: 1.25,
  alterations: 1.50,
  commercial: 0.85, // bulk discount
};

// ─── Delivery Fees ───
export const DELIVERY_FEES = {
  "48h": { fee: 0, label: "Standard (48h)" },
  "24h": { fee: 5.99, label: "Next Day (24h)" },
  "same_day": { fee: 12.99, label: "Same Day" },
  "express_3h": { fee: 19.99, label: "Express (3h)" },
} as const;

// ─── Tax Rate ───
export const TAX_RATE = 0.08875; // NY combined sales tax

// ─── Quote Validity ───
export const QUOTE_VALIDITY_MINUTES = 15;

// ─── SLA Configs ───
export const SLA_CONFIGS = {
  "express_3h": { hours: 3, warningHours: 2 },
  "same_day": { hours: 12, warningHours: 8 },
  "24h": { hours: 24, warningHours: 18 },
  "48h": { hours: 48, warningHours: 36 },
} as const;

export const WEIGHT_TOLERANCE = 0.05;
export const CONSENT_TIMEOUT_HOURS = 2;

// ─── Loyalty Tiers ───
export const LOYALTY_TIERS = {
  bronze: { minPoints: 0, multiplier: 1.0, perks: ["5% off first order"] },
  silver: { minPoints: 500, multiplier: 1.25, perks: ["Free delivery", "10% off"] },
  gold: { minPoints: 2000, multiplier: 1.5, perks: ["Free delivery", "15% off", "Priority matching"] },
  platinum: { minPoints: 5000, multiplier: 2.0, perks: ["Free delivery", "20% off", "Priority matching", "Dedicated support"] },
} as const;

// ─── Subscription Tiers ───
export const SUBSCRIPTION_TIERS = {
  basic: { price: 19.99, freeDeliveries: 4, discount: 0.05, pointsBonus: 1.25 },
  plus: { price: 39.99, freeDeliveries: 10, discount: 0.10, pointsBonus: 1.5 },
  premium: { price: 69.99, freeDeliveries: 999, discount: 0.15, pointsBonus: 2.0, prioritySupport: true },
} as const;
