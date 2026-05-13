export const VENDOR_SELF_UPDATE_FIELDS = [
  "operatingHoursJson", "operatingHours", "phone", "email", "contactEmail",
  "address", "city", "businessName", "businessAddress", "businessCity",
  "businessState", "businessZip", "capabilities", "avatarUrl",
  "offersDryCleaning", "offersAlterations", "offersComforters", "offersCommercial",
  "offersStainTreatment", "offersSteamPress", "offersHangDry", "serviceZips",
  "serviceRadiusMiles", "serviceAreaType", "pauseOrderIntake",
] as const;

export const VENDOR_ADMIN_UPDATE_FIELDS = [
  ...VENDOR_SELF_UPDATE_FIELDS,
  "name", "rating", "reviewCount", "certified", "capacity", "currentLoad", "status",
  "performanceTier", "lat", "lng", "payoutRate", "totalEarnings", "pendingPayout",
  "payoutRateCents", "totalEarningsCents", "pendingPayoutCents", "aiHealthScore",
  "avgProcessingTime", "onTimeRate", "qualityScore", "disputeRate", "businessLat",
  "businessLng", "adminOverrideOpen", "ownsDrivers", "acceptanceTimeoutSec",
  "avgDailyOrders", "peakDayOfWeek",
] as const;

export const DRIVER_SELF_UPDATE_FIELDS = [
  "currentLat", "currentLng", "avatarUrl", "vehicleType", "licensePlate", "phone",
  "status", "workSchedule", "preferredZones",
] as const;

export const DRIVER_ADMIN_UPDATE_FIELDS = [
  ...DRIVER_SELF_UPDATE_FIELDS,
  "userId", "vendorId", "driverOwnership", "name", "rating", "completedTrips",
  "payoutPerTrip", "totalEarnings", "pendingPayout", "payoutPerTripCents",
  "totalEarningsCents", "pendingPayoutCents", "todayTrips", "currentRouteJson",
  "estimatedAvailableAt", "maxTripsPerDay", "onTimePickupRate", "avgPickupTime",
  "customerRatingAvg",
] as const;

export const ORDER_UPDATE_FIELDS = [
  "status", "customerNotes", "specialInstructions", "deliveryNotes", "actualWeight",
  "overageWeight", "pickupPhotoUrl", "deliveryPhotoUrl", "driverNotes",
  "driverLocationLat", "driverLocationLng", "estimatedDeliveryTime", "processingNotes",
  "weightVerified", "vendorNotes", "washStartedAt", "washCompletedAt", "qualityScore",
  "finalWeight", "vendorId", "driverId",
] as const;

export const DISPUTE_ADMIN_UPDATE_FIELDS = [
  "status", "resolution", "creditAmount", "refundAmount", "creditAmountCents",
  "refundAmountCents", "assignedTo", "priority", "photoEvidence", "resolvedAt",
] as const;

export const PAYMENT_METHOD_UPDATE_FIELDS = [
  "type", "label", "last4", "expiryDate", "isDefault",
] as const;
