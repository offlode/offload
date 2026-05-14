// Canonical 13-state FSM labels — single source of truth for all tracking/home/orders pages
export const ORDER_PROGRESS_LABELS: Record<string, string> = {
  order_placed: "Order Placed",
  confirmed: "Confirmed",
  driver_assigned: "Driver Assigned",
  picked_up: "Picked Up",
  at_facility: "At Facility",
  washing: "Washing",
  wash_complete: "Wash Complete",
  folded_packaged: "Folded & Packaged",
  final_weight_verified: "Final Weight Verified",
  ready_for_delivery: "Ready for Delivery",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  completed: "Completed",
};

export const ORDER_PROGRESS_ORDER = [
  "order_placed",
  "confirmed",
  "driver_assigned",
  "picked_up",
  "at_facility",
  "washing",
  "wash_complete",
  "folded_packaged",
  "final_weight_verified",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "completed",
] as const;

export const TERMINAL_STATUSES = ["delivered", "completed"] as const;

export function friendlyStatus(status: string): string {
  return ORDER_PROGRESS_LABELS[status] || status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Status badge color classes */
export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  order_placed: "bg-amber-500/15 text-amber-400",
  confirmed: "bg-blue-500/15 text-blue-400",
  driver_assigned: "bg-blue-500/15 text-blue-400",
  pickup_in_progress: "bg-blue-500/15 text-blue-400",
  picked_up: "bg-cyan-500/15 text-cyan-400",
  at_facility: "bg-primary/15 text-primary",
  at_laundromat: "bg-primary/15 text-primary",
  washing: "bg-primary/15 text-primary",
  wash_complete: "bg-primary/15 text-primary",
  folded_packaged: "bg-primary/15 text-primary",
  final_weight_verified: "bg-primary/15 text-primary",
  packing: "bg-primary/15 text-primary",
  ready_for_delivery: "bg-sky-500/15 text-sky-400",
  out_for_delivery: "bg-blue-500/15 text-blue-400",
  delivered: "bg-emerald-500/15 text-emerald-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-red-500/15 text-red-400",
  disputed: "bg-orange-500/15 text-orange-400",
};
