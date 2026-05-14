// Offload Design Tokens — Figma "Offload new version" source of truth
// All hardcoded colors/sizes referenced from here instead of inline

export const colors = {
  // Brand
  primaryPurple: "#7C3AED",
  primaryPurpleHsl: "263 70% 58%",

  // Surfaces (dark theme)
  surfaceBase: "#1C1C1C",
  surfaceCard: "#232323",
  surfaceElevated: "#2E2E2E",

  // Status
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#60A5FA",

  // Status pills
  statusActive: "bg-blue-500/15 text-blue-400",
  statusSuccess: "bg-emerald-500/15 text-emerald-400",
  statusWarning: "bg-amber-500/15 text-amber-400",
  statusError: "bg-red-500/15 text-red-400",
  statusMuted: "bg-muted text-muted-foreground",
} as const;

// Pricing (canonical — do NOT change without owner directive)
export const BAG_PRICING = {
  small: { price: 24.99, maxLbs: 10, label: "Small Bag" },
  medium: { price: 44.99, maxLbs: 20, label: "Medium Bag" },
  large: { price: 59.99, maxLbs: 30, label: "Large Bag" },
  xl: { price: 89.99, maxLbs: 50, label: "XL Bag" },
} as const;

export const PRICING = BAG_PRICING;
export const OVERAGE_PER_LB = 2.50;

export const DELIVERY_SPEEDS = {
  standard: { fee: 0, label: "Standard (48h)", hours: 48 },
  next_day: { fee: 5.99, label: "Next Day (24h)", hours: 24 },
  same_day: { fee: 12.99, label: "Same Day", hours: 12 },
} as const;

// Clothing types — Loom verbatim list (D9)
export const CLOTHING_TYPES = [
  "Shirts",
  "Undershirts",
  "Undergarments",
  "Bras",
  "Socks",
  "Towels",
  "Bedsheets",
  "Pants",
  "Dresses",
  "Baby clothes",
  "Gym clothes",
  "Delicates",
  "Dark items",
  "Whites",
] as const;

// Order Progress — 13 display labels (D1 hybrid)
export const ORDER_PROGRESS_LABELS = [
  { key: "order_placed", label: "Order Placed" },
  { key: "confirmed", label: "Confirmed" },
  { key: "driver_assigned", label: "Driver Assigned" },
  { key: "picked_up", label: "Picked Up" },
  { key: "at_facility", label: "At Facility" },
  { key: "washing", label: "Washing" },
  { key: "wash_complete", label: "Wash Complete" },
  { key: "folded_packaged", label: "Folded & Packaged" },
  { key: "final_weight_verified", label: "Weight Verified" },
  { key: "ready_for_delivery", label: "Ready for Delivery" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Completed" },
] as const;

export type BagSize = keyof typeof BAG_PRICING;
export type DeliverySpeed = keyof typeof DELIVERY_SPEEDS;
