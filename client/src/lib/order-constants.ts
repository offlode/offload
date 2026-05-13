import {
  Check, Truck, Package, MapPin, Droplets, PackageCheck,
  CircleDot, X, AlertCircle, Clock,
} from "lucide-react";

export const EVENT_ICONS: Record<string, typeof Check> = {
  order_placed: Check,
  order_confirmed: Check,
  driver_assigned: Truck,
  pickup_started: Truck,
  pickup_confirmed: Package,
  arrived_laundromat: MapPin,
  intake_completed: Package,
  wash_started: Droplets,
  wash_completed: Droplets,
  packing_completed: PackageCheck,
  price_confirmed: Check,
  ready_for_delivery: PackageCheck,
  out_for_delivery: Truck,
  delivered: Check,
  cancelled: X,
  disputed: AlertCircle,
};

export const EVENT_COLORS: Record<string, string> = {
  order_placed: "bg-primary/20 text-primary",
  order_confirmed: "bg-emerald-500/20 text-emerald-400",
  driver_assigned: "bg-blue-500/20 text-blue-400",
  pickup_started: "bg-blue-500/20 text-blue-400",
  pickup_confirmed: "bg-cyan-500/20 text-cyan-400",
  arrived_laundromat: "bg-primary/20 text-primary",
  intake_completed: "bg-primary/20 text-primary",
  wash_started: "bg-sky-500/20 text-sky-400",
  wash_completed: "bg-sky-500/20 text-sky-400",
  packing_completed: "bg-primary/20 text-primary",
  price_confirmed: "bg-emerald-500/20 text-emerald-400",
  ready_for_delivery: "bg-primary/20 text-primary",
  out_for_delivery: "bg-blue-500/20 text-blue-400",
  delivered: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-red-500/20 text-red-400",
  disputed: "bg-orange-500/20 text-orange-400",
};

export const CANCELLABLE = ["pending", "confirmed", "driver_assigned", "pickup_in_progress"];

// ── 16-State FSM Timeline Steps ──
export const FSM_TIMELINE = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "scheduled", label: "Scheduled", icon: Check },
  { key: "driver_assigned", label: "Driver Assigned", icon: Truck },
  { key: "driver_en_route_pickup", label: "Driver En Route", icon: Truck },
  { key: "arrived_pickup", label: "Arrived", icon: MapPin },
  { key: "picked_up", label: "Picked Up", icon: Package },
  { key: "driver_en_route_facility", label: "To Facility", icon: Truck },
  { key: "at_facility", label: "At Facility", icon: MapPin },
  { key: "processing", label: "Processing", icon: CircleDot },
  { key: "washing", label: "Washing", icon: Droplets },
  { key: "drying", label: "Drying", icon: Droplets },
  { key: "folding", label: "Folding", icon: PackageCheck },
  { key: "ready_for_delivery", label: "Ready", icon: PackageCheck },
  { key: "driver_en_route_delivery", label: "Out for Delivery", icon: Truck },
  { key: "arrived_delivery", label: "Driver Arrived", icon: MapPin },
  { key: "delivered", label: "Delivered", icon: Check },
  { key: "completed", label: "Completed", icon: Check },
];

// Map legacy statuses to FSM equivalents for display
export const LEGACY_MAP: Record<string, string> = {
  confirmed: "scheduled",
  pickup_in_progress: "driver_en_route_pickup",
  at_laundromat: "at_facility",
  wash_complete: "drying",
  quality_check: "folding",
  packing: "folding",
  out_for_delivery: "driver_en_route_delivery",
};

export function formatEventType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
    });
  } catch { return iso; }
}
