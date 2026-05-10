import { pgTable, text, integer, real, serial, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  email: text("email").notNull(),
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
  hasCleanDrivingRecord: integer("has_clean_driving_record"), // 1 yes | 0 no
  yearsDriving: integer("years_driving"),
  availabilityJson: text("availability_json"),     // JSON: {mon:["6-12","18-22"], ...}
  hoursPerWeek: integer("hours_per_week"),
  ownsSmartphone: integer("owns_smartphone"),       // 1 yes | 0 no
  consentBackgroundCheck: integer("consent_background_check"), // 1 yes | 0 no
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
  acceptsCommercial: integer("accepts_commercial"),
  acceptsRushSameDay: integer("accepts_rush_same_day"),
  hasDryCleaningOnSite: integer("has_dry_cleaning_on_site"),
  acceptsHypoallergenic: integer("accepts_hypoallergenic"),
  hasInsurance: integer("has_insurance"),
  insuranceCarrierBiz: text("insurance_carrier_biz"),
  // Acknowledgements (mandatory)
  agreesToQualityStandards: integer("agrees_to_quality_standards").notNull().default(0),
  agreesToPricing: integer("agrees_to_pricing").notNull().default(0),
  agreesToTermsOfService: integer("agrees_to_terms_of_service").notNull().default(0),
  agreesToBackgroundCheck: integer("agrees_to_background_check").notNull().default(0),
  // Free-form
  whyJoin: text("why_join"),
  references: text("references"),
  // Auto-screening
  autoScreenScore: integer("auto_screen_score"),     // 0-100
  autoScreenFlags: text("auto_screen_flags"),         // JSON: ["missing_insurance", ...]
  autoScreenRecommendation: text("auto_screen_recommendation"), // "approve" | "review" | "decline"
  // Decision
  reviewedByUserId: integer("reviewed_by_user_id"),
  reviewedAt: text("reviewed_at"),
  declineReason: text("decline_reason"),
  // Resulting records (after approval)
  resultUserId: integer("result_user_id"),
  resultDriverId: integer("result_driver_id"),
  resultVendorId: integer("result_vendor_id"),
  // Audit
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: text("created_at").notNull(),
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
