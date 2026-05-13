import { pgTable, text, integer, serial, doublePrecision, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users, orders, vendors, drivers } from "./tables-core";
import { promoCodes } from "./tables-operations";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

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
  // Shadow _cents columns (dual-write migration -- Phase 5)
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
