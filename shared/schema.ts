import { pgTable, text, integer, serial, doublePrecision, boolean, timestamp, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

// ─── Users ───
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  role: text("role").notNull().default("customer"), // customer | driver | laundromat | manager | admin
  avatarUrl: text("avatar_url"),
  memberSince: text("member_since"),
  rating: doublePrecision("rating").default(5.0),
  vendorId: integer("vendor_id"), // For staff: which vendor they belong to; DB FK added in Wave A migration
  // Loyalty & Referrals
  loyaltyPoints: integer("loyalty_points").default(0),
  loyaltyTier: text("loyalty_tier").default("bronze"), // bronze | silver | gold | platinum
  referralCode: text("referral_code"),
  referredBy: integer("referred_by"), // self-FK added in Wave A migration
  totalOrders: integer("total_orders").default(0),
  totalSpent: doublePrecision("total_spent").default(0),
  totalSpentCents: integer("total_spent_cents").notNull().default(0),
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
  lastActiveAt: timestamptz("last_active_at"),
  // Account credits (e.g. from SLA breach refunds)
  credits: integer("credits").default(0),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ─── Addresses ───
export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  street: text("street").notNull(),
  apt: text("apt"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  zip: text("zip").notNull(),
  notes: text("notes"),
  isDefault: boolean("is_default").default(false),
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
  certified: boolean("certified").default(true),
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
  // Shadow _cents columns
  payoutRateCents: integer("payout_rate_cents").notNull().default(0),
  totalEarningsCents: integer("total_earnings_cents").notNull().default(0),
  pendingPayoutCents: integer("pending_payout_cents").notNull().default(0),
  // AI Scoring
  aiHealthScore: doublePrecision("ai_health_score").default(85), // 0-100
  avgProcessingTime: doublePrecision("avg_processing_time").default(180), // minutes
  onTimeRate: doublePrecision("on_time_rate").default(0.95), // 0-1
  qualityScore: doublePrecision("quality_score").default(4.5), // 1-5
  disputeRate: doublePrecision("dispute_rate").default(0.02), // 0-1
  // Operating hours (JSON: {mon: {open: "7:00", close: "22:00"}, ...})
  operatingHours: text("operating_hours"),
  // Normalized operating hours JSON: {mon:{open:"08:00",close:"20:00",closed:false}, tue:..., ...}
  operatingHoursJson: text("operating_hours_json"),
  // Business details
  businessName: text("business_name"),
  contactEmail: text("contact_email"),
  businessAddress: text("business_address"),
  businessCity: text("business_city"),
  businessState: text("business_state"),
  businessZip: text("business_zip"),
  businessLat: doublePrecision("business_lat"),
  businessLng: doublePrecision("business_lng"),
  // Admin override: force vendor "open" regardless of operating hours (1 = open)
  adminOverrideOpen: boolean("admin_override_open").default(false),
  // Services offered
  offersDryCleaning: boolean("offers_dry_cleaning").default(false),
  offersAlterations: boolean("offers_alterations").default(false),
  offersComforters: boolean("offers_comforters").default(false),
  offersCommercial: boolean("offers_commercial").default(false),
  offersStainTreatment: boolean("offers_stain_treatment").default(false),
  offersSteamPress: boolean("offers_steam_press").default(false),
  offersHangDry: boolean("offers_hang_dry").default(false),
  // Service area — vendors can define coverage as ZIPs, radius, or both
  serviceZips: text("service_zips"),                 // JSON array: ["11201","11215",...]
  serviceRadiusMiles: doublePrecision("service_radius_miles"),  // null = no radius coverage; numeric = miles around (lat,lng)
  serviceAreaType: text("service_area_type").default("zip"),    // "zip" | "radius" | "both"
  ownsDrivers: boolean("owns_drivers").default(false),   // 1 if vendor has own drivers preferred for routing
  pauseOrderIntake: boolean("pause_order_intake").default(false),   // admin/vendor toggle
  acceptanceTimeoutSec: integer("acceptance_timeout_sec").default(120),
  // Demand forecasting
  avgDailyOrders: doublePrecision("avg_daily_orders").default(10),
  peakDayOfWeek: text("peak_day_of_week").default("Monday"),
});

// ─── Service Area Requests — unserved-area demand capture ───
export const serviceAreaRequests = pgTable("service_area_requests", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  requestedService: text("requested_service"),     // wash_fold | dry_cleaning | comforters | etc.
  requestedSpeed: text("requested_speed"),         // 48h | 24h | same_day
  requestedOptions: text("requested_options"),     // JSON array of add-ons
  source: text("source"),                          // website_quote | customer_app | voice | api
  status: text("status").notNull().default("new"), // new | contacted | converted | closed
  notes: text("notes"),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
});
export const insertServiceAreaRequestSchema = createInsertSchema(serviceAreaRequests).omit({ id: true, status: true, notes: true, createdAt: true, updatedAt: true });
export type InsertServiceAreaRequest = z.infer<typeof insertServiceAreaRequestSchema>;
export type ServiceAreaRequest = typeof serviceAreaRequests.$inferSelect;

export const insertVendorSchema = createInsertSchema(vendors).omit({ id: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;

// ─── Drivers ───
export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Vendor-owned driver linking (nullable for platform drivers)
  vendorId: integer("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  driverOwnership: text("driver_ownership").default("platform"), // platform | vendor
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
  // Shadow _cents columns
  payoutPerTripCents: integer("payout_per_trip_cents").notNull().default(0),
  totalEarningsCents: integer("total_earnings_cents").notNull().default(0),
  pendingPayoutCents: integer("pending_payout_cents").notNull().default(0),
  todayTrips: integer("today_trips").default(0),
  // AI route optimization
  currentRouteJson: text("current_route_json"), // JSON: optimized route
  estimatedAvailableAt: timestamptz("estimated_available_at"),
  maxTripsPerDay: integer("max_trips_per_day").default(15),
  preferredZones: text("preferred_zones"), // JSON: array of zip codes
  // Performance
  onTimePickupRate: doublePrecision("on_time_pickup_rate").default(0.95),
  avgPickupTime: doublePrecision("avg_pickup_time").default(12), // minutes
  customerRatingAvg: doublePrecision("customer_rating_avg").default(4.8),
  // Availability preferences — JSON: { days: string[], timeStart: "HH:MM", timeEnd: "HH:MM" }
  workSchedule: text("work_schedule"),
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
  basePriceCents: integer("base_price_cents").notNull().default(0),
  unit: text("unit").notNull().default("lb"), // lb | item | load
  icon: text("icon"), // lucide icon name
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
});

export const insertServiceTypeSchema = createInsertSchema(serviceTypes).omit({ id: true });
export type InsertServiceType = z.infer<typeof insertServiceTypeSchema>;
export type ServiceType = typeof serviceTypes.$inferSelect;

// ─── Orders ───
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerId: integer("customer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  vendorId: integer("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  returnDriverId: integer("return_driver_id").references(() => drivers.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  // pending | confirmed | driver_assigned | pickup_in_progress | picked_up |
  // at_laundromat | washing | wash_complete | quality_check | packing | ready_for_delivery |
  // out_for_delivery | delivered | cancelled | disputed
  pickupAddressId: integer("pickup_address_id").notNull().references(() => addresses.id, { onDelete: "restrict" }),
  pickupAddress: text("pickup_address").notNull(),
  deliveryAddressId: integer("delivery_address_id").references(() => addresses.id, { onDelete: "set null" }), // can differ from pickup
  deliveryAddress: text("delivery_address"),
  deliveryType: text("delivery_type").default("contactless"),
  deliverySpeed: text("delivery_speed").default("48h"), // 48h | 24h | same_day
  scheduledPickup: text("scheduled_pickup"),
  pickupTimeWindow: text("pickup_time_window"),
  // Dynamic pickup logistics (drives Uber-style pricing)
  pickupFloor: integer("pickup_floor"), // 1 = ground/lobby. 4+ no elevator = walk-up surcharge.
  pickupHasElevator: boolean("pickup_has_elevator").default(true), // 1=yes, 0=no
  pickupHandoff: text("pickup_handoff").default("curbside"), // curbside | door
  deliveryFloor: integer("delivery_floor"),
  deliveryHasElevator: boolean("delivery_has_elevator").default(true),
  deliveryHandoff: text("delivery_handoff").default("curbside"),
  pickupWindowMinutes: integer("pickup_window_minutes").default(30), // 30 | 120 | 240
  pickupDistanceMiles: doublePrecision("pickup_distance_miles"), // customer→laundromat one-way
  pickupDistanceFee: doublePrecision("pickup_distance_fee").default(0),
  pickupDistanceFeeCents: integer("pickup_distance_fee_cents").notNull().default(0),
  floorFee: doublePrecision("floor_fee").default(0),
  floorFeeCents: integer("floor_fee_cents").notNull().default(0),
  handoffFee: doublePrecision("handoff_fee").default(0),
  handoffFeeCents: integer("handoff_fee_cents").notNull().default(0),
  trafficMultiplier: doublePrecision("traffic_multiplier").default(1.0),
  windowDiscount: doublePrecision("window_discount").default(0),
  windowDiscountCents: integer("window_discount_cents").notNull().default(0),
  addressNotes: text("address_notes"),
  bags: text("bags").notNull(), // JSON
  preferences: text("preferences"), // JSON
  serviceType: text("service_type").default("wash_fold"), // wash_fold | dry_cleaning | comforters | mixed
  subtotal: doublePrecision("subtotal").default(0),
  tax: doublePrecision("tax").default(0),
  deliveryFee: doublePrecision("delivery_fee").default(0),
  discount: doublePrecision("discount").default(0), // loyalty/promo discount
  tip: doublePrecision("tip").default(0),
  tipCents: integer("tip_cents").notNull().default(0),
  total: doublePrecision("total").default(0),
  // Tier-based pricing
  pricingTierId: integer("pricing_tier_id"), // FK added in Wave A migration
  tierName: text("tier_name"), // e.g. "medium_bag"
  tierFlatPrice: doublePrecision("tier_flat_price"), // snapshot of flat price at time of order
  tierMaxWeight: doublePrecision("tier_max_weight"), // snapshot of max weight for this tier
  overageWeight: doublePrecision("overage_weight").default(0), // lbs over the tier limit
  overageCharge: doublePrecision("overage_charge").default(0),
  overageChargeCents: integer("overage_charge_cents").notNull().default(0), // $ amount for overage
  dirtyWeight: doublePrecision("dirty_weight"), // weight at pickup (before washing)
  cleanWeight: doublePrecision("clean_weight"), // weight after wash/dry
  weightDifference: doublePrecision("weight_difference"), // dirty - clean
  finalPrice: doublePrecision("final_price"), // tierFlatPrice + overageCharge + addons - discount
  intakeWeight: doublePrecision("intake_weight"),
  outputWeight: doublePrecision("output_weight"),
  weightDiscrepancy: boolean("weight_discrepancy").default(false),
  certifiedOnly: boolean("certified_only").default(true),
  customerNotes: text("customer_notes"),
  // Payment
  paymentStatus: text("payment_status").default("pending"),
  paymentMethodId: integer("payment_method_id"), // FK added in Wave A migration
  // SLA tracking
  slaDeadline: text("sla_deadline"),
  slaStatus: text("sla_status").default("on_track"),
  // Payouts
  vendorPayout: doublePrecision("vendor_payout").default(0),
  driverPayout: doublePrecision("driver_payout").default(0),
  platformFee: doublePrecision("platform_fee").default(0),
  platformFeeCents: integer("platform_fee_cents").notNull().default(0), // Offload's commission
  // Shadow _cents columns (dual-write migration — Phase 5)
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  finalPriceCents: integer("final_price_cents").notNull().default(0),
  vendorPayoutCents: integer("vendor_payout_cents").notNull().default(0),
  driverPayoutCents: integer("driver_payout_cents").notNull().default(0),
  tierFlatPriceCents: integer("tier_flat_price_cents").notNull().default(0),
  // Wave 2: idempotency flag for recordPayoutsForCapturedOrder() — prevents double-counting
  // vendor/driver earnings if the capture path is invoked more than once for the same order.
  payoutRecorded: boolean("payout_recorded").default(false),
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
  isReorder: boolean("is_reorder").default(false),
  originalOrderId: integer("original_order_id"), // self-FK added in Wave A migration
  // Pickup waiting fee — when driver shows up but customer is late
  // Free first 5 min, then $1/min, capped at $15.
  driverArrivedAt: timestamptz("driver_arrived_at"),
  customerHandoffAt: timestamptz("customer_handoff_at"),
  pickupWaitMinutes: doublePrecision("pickup_wait_minutes").default(0),
  pickupWaitFee: doublePrecision("pickup_wait_fee").default(0),
  pickupWaitFeeCents: integer("pickup_wait_fee_cents").notNull().default(0),
  // Timestamps
  confirmedAt: timestamptz("confirmed_at"),
  pickedUpAt: timestamptz("picked_up_at"),
  arrivedLaundromatAt: timestamptz("arrived_laundromat_at"),
  washStartedAt: timestamptz("wash_started_at"),
  washCompletedAt: timestamptz("wash_completed_at"),
  qualityCheckedAt: timestamptz("quality_checked_at"),
  outForDeliveryAt: timestamptz("out_for_delivery_at"),
  deliveredAt: timestamptz("delivered_at"),
  cancelledAt: timestamptz("cancelled_at"),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
}, (table) => ({
  statusCheck: check("orders_status_check", sql`${table.status} IN ('draft_quote', 'quoted', 'quote_accepted', 'quote_expired', 'payment_pending', 'confirmed', 'pending', 'scheduled', 'driver_assigned', 'driver_en_route_pickup', 'arrived_pickup', 'picked_up', 'driver_en_route_facility', 'at_facility', 'processing', 'washing', 'drying', 'folding', 'ready_for_delivery', 'driver_en_route_delivery', 'arrived_delivery', 'delivered', 'completed', 'cancelled')`),
}));

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

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

// ─── Payment Transactions (Stripe Connect) ───
export const paymentTransactions = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "restrict" }),
  type: text("type").notNull(), // charge | refund | payout_vendor | payout_driver
  amount: doublePrecision("amount").notNull(),
  amountCents: integer("amount_cents").notNull().default(0),
  currency: text("currency").default("usd"),
  status: text("status").default("pending"), // pending | processing | completed | failed
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeTransferId: text("stripe_transfer_id"),
  recipientType: text("recipient_type"), // platform | vendor | driver
  recipientId: integer("recipient_id"),
  platformFee: doublePrecision("platform_fee"),
  platformFeeCents: integer("platform_fee_cents").notNull().default(0),
  metadata: text("metadata"), // JSON
  createdAt: timestamptz("created_at").notNull(),
  completedAt: timestamptz("completed_at"),
});

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({ id: true });
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;

// ─── Stripe Connect Accounts ───
export const stripeAccounts = pgTable("stripe_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  userType: text("user_type").notNull(), // vendor | driver
  stripeAccountId: text("stripe_account_id"), // acct_xxx
  status: text("status").default("pending"), // pending | active | restricted | disabled
  onboardingComplete: boolean("onboarding_complete").default(false),
  payoutsEnabled: boolean("payouts_enabled").default(false),
  chargesEnabled: boolean("charges_enabled").default(false),
  createdAt: timestamptz("created_at").notNull(),
});

export const insertStripeAccountSchema = createInsertSchema(stripeAccounts).omit({ id: true });
export type InsertStripeAccount = z.infer<typeof insertStripeAccountSchema>;
export type StripeAccount = typeof stripeAccounts.$inferSelect;

// ─── Driver Location History ───
export const driverLocationHistory = pgTable("driver_location_history", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  accuracy: doublePrecision("accuracy"),
  timestamp: timestamptz("timestamp").notNull(),
});

export const insertDriverLocationHistorySchema = createInsertSchema(driverLocationHistory).omit({ id: true });
export type InsertDriverLocationHistory = z.infer<typeof insertDriverLocationHistorySchema>;
export type DriverLocationHistory = typeof driverLocationHistory.$inferSelect;

// ─── Order Photos ───
export const orderPhotos = pgTable("order_photos", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // pickup_proof | delivery_proof | intake_before | intake_after | damage | quality_check
  photoData: text("photo_data").notNull(), // base64 encoded (MVP; would be S3 URL in production)
  r2Key: text("r2_key"), // Cloudflare R2 object key (when using R2 storage)
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  capturedBy: integer("captured_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  capturedByRole: text("captured_by_role").notNull(),
  notes: text("notes"),
  timestamp: timestamptz("timestamp").notNull(),
});

export const insertOrderPhotoSchema = createInsertSchema(orderPhotos).omit({ id: true });
export type InsertOrderPhoto = z.infer<typeof insertOrderPhotoSchema>;
export type OrderPhoto = typeof orderPhotos.$inferSelect;

// ─── Order Status History ───
export const orderStatusHistory = pgTable("order_status_history", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorRole: text("actor_role"),
  notes: text("notes"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  timestamp: timestamptz("timestamp").notNull(),
});

export const insertOrderStatusHistorySchema = createInsertSchema(orderStatusHistory).omit({ id: true });
export type InsertOrderStatusHistory = z.infer<typeof insertOrderStatusHistorySchema>;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;

// ─── Quotes ───
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  customerId: integer("customer_id").references(() => users.id, { onDelete: "set null" }), // null for anonymous website quotes
  sessionId: text("session_id"), // legacy anonymous session hint; not used for public retrieval
  publicToken: text("public_token"), // cryptographic token for public quote retrieval
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
  vendorId: integer("vendor_id").references(() => vendors.id, { onDelete: "set null" }), // null = auto-assign nearest
  vendorName: text("vendor_name"),
  isPreferredVendor: boolean("is_preferred_vendor").default(false),
  // Price breakdown
  laundryServicePrice: doublePrecision("laundry_service_price").notNull(),
  laundryServicePriceCents: integer("laundry_service_price_cents").notNull().default(0),
  speedSurcharge: doublePrecision("speed_surcharge").default(0),
  speedSurchargeCents: integer("speed_surcharge_cents").notNull().default(0),
  deliveryFee: doublePrecision("delivery_fee").default(0),
  preferredVendorSurcharge: doublePrecision("preferred_vendor_surcharge").default(0),
  preferredVendorSurchargeCents: integer("preferred_vendor_surcharge_cents").notNull().default(0),
  addOnsTotal: doublePrecision("add_ons_total").default(0),
  addOnsTotalCents: integer("add_ons_total_cents").notNull().default(0),
  subtotal: doublePrecision("subtotal").notNull(),
  taxRate: doublePrecision("tax_rate").notNull(),
  taxAmount: doublePrecision("tax_amount").notNull(),
  discount: doublePrecision("discount").default(0),
  total: doublePrecision("total").notNull(),
  // Dynamic pickup logistics (Uber-style)
  pickupFloor: integer("pickup_floor"),
  pickupHasElevator: boolean("pickup_has_elevator").default(true),
  pickupHandoff: text("pickup_handoff").default("curbside"),
  pickupWindowMinutes: integer("pickup_window_minutes").default(30),
  pickupDistanceMiles: doublePrecision("pickup_distance_miles"),
  pickupDistanceFee: doublePrecision("pickup_distance_fee").default(0),
  pickupDistanceFeeCents: integer("pickup_distance_fee_cents").notNull().default(0),
  floorFee: doublePrecision("floor_fee").default(0),
  floorFeeCents: integer("floor_fee_cents").notNull().default(0),
  handoffFee: doublePrecision("handoff_fee").default(0),
  handoffFeeCents: integer("handoff_fee_cents").notNull().default(0),
  trafficMultiplier: doublePrecision("traffic_multiplier").default(1.0),
  windowDiscount: doublePrecision("window_discount").default(0),
  windowDiscountCents: integer("window_discount_cents").notNull().default(0),
  vendorChoiceMode: text("vendor_choice_mode").default("auto"), // auto | nearest | preferred | rated
  // Shadow _cents columns (dual-write migration — Phase 5)
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxAmountCents: integer("tax_amount_cents").notNull().default(0),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  tierFlatPriceCents: integer("tier_flat_price_cents").notNull().default(0),
  // Itemized line items and add-ons as JSON
  lineItemsJson: text("line_items_json"),
  addOnsJson: text("add_ons_json"),
  // Validity & locking
  expiresAt: timestamptz("expires_at").notNull(),
  lockedAt: timestamptz("locked_at"),
  // Promo
  promoCode: text("promo_code"),
  promoDiscount: doublePrecision("promo_discount").default(0),
  promoDiscountCents: integer("promo_discount_cents").notNull().default(0),
  // Conversion tracking
  orderId: integer("order_id"),
  // Idempotency
  idempotencyKey: text("idempotency_key").unique(),
  // Timestamps
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
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
  updatedAt: timestamptz("updated_at").notNull(),
  updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const insertPricingConfigSchema = createInsertSchema(pricingConfig).omit({ id: true });
export type InsertPricingConfig = z.infer<typeof insertPricingConfigSchema>;
export type PricingConfig = typeof pricingConfig.$inferSelect;

// ─── Pricing Audit Log ───
export const pricingAuditLog = pgTable("pricing_audit_log", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(), // config_change | quote_created | quote_locked | quote_expired | price_override
  details: text("details").notNull(), // JSON
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorRole: text("actor_role"),
  timestamp: timestamptz("timestamp").notNull(),
});

export const insertPricingAuditLogSchema = createInsertSchema(pricingAuditLog).omit({ id: true });
export type InsertPricingAuditLog = z.infer<typeof insertPricingAuditLogSchema>;
export type PricingAuditLog = typeof pricingAuditLog.$inferSelect;

// ─── Admin Audit Log (Wave 4) ───
export const adminAuditLog = pgTable("admin_audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").notNull(),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  notes: text("notes"),
  timestamp: timestamptz("timestamp").notNull(),
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLog).omit({ id: true });
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminAuditLog = typeof adminAuditLog.$inferSelect;

// ─── Sessions (DB-backed) ───
export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamptz("created_at").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
});

// ─── Idempotency Keys (DB-backed) ───
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  response: text("response").notNull(), // JSON stringified response
  statusCode: integer("status_code").notNull(),
  createdAt: timestamptz("created_at").notNull(),
  expiresAt: timestamptz("expires_at").notNull(),
});

// ─── Stripe Webhook Processed Events ───
export const stripeProcessedEvents = pgTable("stripe_processed_events", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamptz("processed_at").notNull(),
});

export const insertStripeProcessedEventSchema = createInsertSchema(stripeProcessedEvents);
export type InsertStripeProcessedEvent = z.infer<typeof insertStripeProcessedEventSchema>;
export type StripeProcessedEvent = typeof stripeProcessedEvents.$inferSelect;

// ─── Password Reset Tokens ───
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamptz("expires_at").notNull(),
  usedAt: timestamptz("used_at"),
  createdAt: timestamptz("created_at").notNull(),
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
  isActive: boolean("is_active").default(true),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
});

export const insertNotificationRuleSchema = createInsertSchema(notificationRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNotificationRule = z.infer<typeof insertNotificationRuleSchema>;
export type NotificationRule = typeof notificationRules.$inferSelect;

// ─── Promo Usage (per-user tracking) ───
export const promoUsage = pgTable("promo_usage", {
  id: serial("id").primaryKey(),
  promoId: integer("promo_id").notNull().references(() => promoCodes.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  usedAt: timestamptz("used_at").notNull(),
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
} as const;

// ─── Tax Rate ───
export const TAX_RATE = 0.08875; // NY combined sales tax

// ─── Quote Validity ───
export const QUOTE_VALIDITY_MINUTES = 15;

// ─── Partner Applications (drivers + laundromats) ───
// Captures everything we need to vet a driver or laundromat before granting access
// to the operator portals. Auto-screening flags missing/inconsistent answers; an
// admin can flip the final decision (approve/decline) and the system creates the
// real driver/vendor record + login on approval.
export const partnerApplications = pgTable("partner_applications", {
  id: serial("id").primaryKey(),
  applicantType: text("applicant_type").notNull(), // "driver" | "laundromat"
  status: text("status").notNull().default("pending_review"), // pending_review | auto_flagged | approved | declined
  // Identity
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  // Address (laundromat = business address; driver = home/service area)
  addressLine: text("address_line"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  serviceZips: text("service_zips"),  // JSON: ["10001", "10002", ...] for drivers
  // Driver-specific
  vehicleType: text("vehicle_type"),                // "car" | "suv" | "van" | "cargo_van" | "box_truck"
  licensePlate: text("license_plate"),
  driversLicenseNumber: text("drivers_license_number"),
  driversLicenseState: text("drivers_license_state"),
  driversLicenseExpiry: text("drivers_license_expiry"),
  insuranceCarrier: text("insurance_carrier"),
  insurancePolicyNumber: text("insurance_policy_number"),
  insuranceExpiry: text("insurance_expiry"),
  hasCleanDrivingRecord: boolean("has_clean_driving_record"), // 1 yes | 0 no
  yearsDriving: integer("years_driving"),
  availabilityJson: text("availability_json"),     // JSON: {mon:["6-12","18-22"], ...}
  hoursPerWeek: integer("hours_per_week"),
  ownsSmartphone: boolean("owns_smartphone"),       // 1 yes | 0 no
  consentBackgroundCheck: boolean("consent_background_check"), // 1 yes | 0 no
  // Laundromat-specific
  businessName: text("business_name"),
  businessLegalEntity: text("business_legal_entity"), // "LLC" | "Corp" | "Sole Prop"
  ein: text("ein"),
  yearsInBusiness: integer("years_in_business"),
  numberOfWashers: integer("number_of_washers"),
  numberOfDryers: integer("number_of_dryers"),
  largestMachineLbs: integer("largest_machine_lbs"), // largest single machine capacity
  dailyCapacityLbs: integer("daily_capacity_lbs"),
  operatingHoursJson: text("operating_hours_json"), // JSON: {mon:{open,close}, ...}
  servicesOfferedJson: text("services_offered_json"), // JSON: ["wash_fold","dry_cleaning","comforters",...]
  acceptsCommercial: boolean("accepts_commercial"),
  acceptsRushSameDay: boolean("accepts_rush_same_day"),
  hasDryCleaningOnSite: boolean("has_dry_cleaning_on_site"),
  acceptsHypoallergenic: boolean("accepts_hypoallergenic"),
  hasInsurance: boolean("has_insurance"),
  insuranceCarrierBiz: text("insurance_carrier_biz"),
  // Acknowledgements (mandatory)
  agreesToQualityStandards: boolean("agrees_to_quality_standards").notNull().default(false),
  agreesToPricing: boolean("agrees_to_pricing").notNull().default(false),
  agreesToTermsOfService: boolean("agrees_to_terms_of_service").notNull().default(false),
  agreesToBackgroundCheck: boolean("agrees_to_background_check").notNull().default(false),
  // Free-form
  whyJoin: text("why_join"),
  references: text("references"),
  // Auto-screening
  autoScreenScore: integer("auto_screen_score"),     // 0-100
  autoScreenFlags: text("auto_screen_flags"),         // JSON: ["missing_insurance", ...]
  autoScreenRecommendation: text("auto_screen_recommendation"), // "approve" | "review" | "decline"
  // Decision
  reviewedByUserId: integer("reviewed_by_user_id"),
  reviewedAt: timestamptz("reviewed_at"),
  declineReason: text("decline_reason"),
  // Resulting records (after approval)
  resultUserId: integer("result_user_id"),
  resultDriverId: integer("result_driver_id"),
  resultVendorId: integer("result_vendor_id"),
  // Audit
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamptz("created_at").notNull(),
});

export const insertPartnerApplicationSchema = createInsertSchema(partnerApplications).omit({
  id: true,
  status: true,
  autoScreenScore: true,
  autoScreenFlags: true,
  autoScreenRecommendation: true,
  reviewedByUserId: true,
  reviewedAt: true,
  declineReason: true,
  resultUserId: true,
  resultDriverId: true,
  resultVendorId: true,
  createdAt: true,
});
export type InsertPartnerApplication = z.infer<typeof insertPartnerApplicationSchema>;
export type PartnerApplication = typeof partnerApplications.$inferSelect;

// ─── SLA Configs ───
export const SLA_CONFIGS = {
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
