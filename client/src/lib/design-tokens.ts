// Offload Design Tokens — Figma "Offload new version" source of truth
// All hardcoded colors/sizes referenced from here instead of inline

export const colors = {
  // Brand
  primary: "#5B4BC4",
  primaryHsl: "248 51% 53%",

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

// Bag metadata for customer display only. Pricing is backend-owned and is never
// calculated in the customer app.
export const BAG_OPTIONS = {
  small: { maxLbs: 10, label: "Small Bag" },
  medium: { maxLbs: 20, label: "Medium Bag" },
  large: { maxLbs: 30, label: "Large Bag" },
  xl: { maxLbs: 50, label: "XL Bag" },
} as const;

// Canonical flat-rate bag prices (display only — backend is authoritative)
export const BAG_PRICES: Record<BagSize, { standard: number; signature: number }> = {
  small: { standard: 24.99, signature: 29.99 },
  medium: { standard: 44.99, signature: 49.99 },
  large: { standard: 59.99, signature: 64.99 },
  xl: { standard: 89.99, signature: 94.99 },
};

export const SIGNATURE_PREMIUM = 5;

export const DELIVERY_SPEEDS = {
  standard: { label: "Standard (48h)", hours: 48 },
  next_day: { label: "Next Day (24h)", hours: 24 },
  same_day: { label: "Same Day", hours: 12 },
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
  { key: "final_weight_verified", label: "Final Weight Verified" },
  { key: "ready_for_delivery", label: "Ready for Delivery" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "completed", label: "Completed" },
] as const;

export type BagSize = keyof typeof BAG_OPTIONS;
export type DeliverySpeed = keyof typeof DELIVERY_SPEEDS;
