// Canonical 13-state FSM labels — single source of truth for all tracking/home/orders pages
export const ORDER_PROGRESS_LABELS: Record<string, string> = {
  order_placed: "Order Placed",
  confirmed: "Confirmed",
  driver_assigned: "Driver Assigned",
  picked_up: "Picked Up",
  at_facility: "At Facility",
  washing: "Washing",
  wash_complete: "Wash Complete",
  folded_packaged: "Laundry Folded & Packaged",
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
