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
  // Wave L: force password change for temp-password employees
  mustChangePassword: boolean("must_change_password").default(false),
  // Wave L: wash preferences JSON
  preferences: text("preferences"),
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
  // Cross-app compat columns (offload-admin references these names)
  healthScore: doublePrecision("health_score").default(85),
  totalOrders: integer("total_orders").default(0),
  totalPayout: doublePrecision("total_payout").default(0),
  joinedAt: text("joined_at"),
  // AI Scoring
  aiHealthScore: doublePrecision("ai_health_score").default(85), // 0-100
  avgProcessingTime: doublePrecision("avg_processing_time").default(180), // minutes
  onTimeRate: doublePrecision("on_time_rate").default(0.95), // 0-1
  qualityScore: doublePrecision("quality_score").default(4.5), // 1-5
  disputeRate: doublePrecision("dispute_rate").default(0.02), // 0-1
  // DEPRECATED: consolidated into operatingHoursJson by wave_h_01 migration. Kept for type compat.
  operatingHours: text("operating_hours"),
  // Operating hours JSON: {mon:{open:"08:00",close:"20:00",closed:false}, tue:..., ...}
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
  // Wave L: separation fee per order (cents, admin-configurable)
  separationFeeCents: integer("separation_fee_cents").default(0),
  // Wave L: demo vendor flag — production excludes is_demo=true vendors.
  // Default flipped to false in Wave 3 (Opus P1 #13): real new vendors must NOT be excluded by accident.
  // Existing seed/dev rows that should remain demo can be set explicitly.
  isDemo: boolean("is_demo").default(false),
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
  // Wave 2: vehicle profile fields
  vehicleColor: text("vehicle_color"),
  vehiclePhotoUrl: text("vehicle_photo_url"),
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
  pickupDistanceMiles: doublePrecision("pickup_distance_miles"), // customer->laundromat one-way
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
  // Wave L: wash wizard fields
  clothingTypes: text("clothing_types"), // postgres text[] stored as text in drizzle
  separated: boolean("separated").default(false),
  separationFeeCents: integer("separation_fee_cents").default(0),
  washPreferences: text("wash_preferences"), // jsonb: {detergent, water_temp, drying, stain, extra_rinse, special_instructions}
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
  // Shadow _cents columns (dual-write migration -- Phase 5)
  subtotalCents: integer("subtotal_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
  discountCents: integer("discount_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  finalPriceCents: integer("final_price_cents").notNull().default(0),
  vendorPayoutCents: integer("vendor_payout_cents").notNull().default(0),
  driverPayoutCents: integer("driver_payout_cents").notNull().default(0),
  tierFlatPriceCents: integer("tier_flat_price_cents").notNull().default(0),
  // Wave 2: idempotency flag for recordPayoutsForCapturedOrder() -- prevents double-counting
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
  // Pickup waiting fee -- when driver shows up but customer is late
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
  slaCreditIssuedAt: timestamptz("sla_credit_issued_at"),
  createdAt: timestamptz("created_at").notNull(),
  updatedAt: timestamptz("updated_at").notNull(),
}, (table) => ({
  statusCheck: check("orders_status_check", sql`${table.status} IN ('draft_quote', 'quoted', 'quote_accepted', 'quote_expired', 'payment_pending', 'confirmed', 'pending', 'scheduled', 'driver_assigned', 'driver_en_route_pickup', 'arrived_pickup', 'picked_up', 'driver_en_route_facility', 'at_facility', 'processing', 'washing', 'drying', 'folding', 'ready_for_delivery', 'driver_en_route_delivery', 'arrived_delivery', 'delivered', 'completed', 'cancelled')`),
}));

export const insertOrderSchema = createInsertSchema(orders).omit({ id: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;
