import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  deliverySpeed: text("delivery_speed").default("48h"), // 48h | 24h | same_day
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
