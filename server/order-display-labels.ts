// =====================================================================
//  ORDER DISPLAY LABELS — Loom 13-state timeline
//  Maps internal FSM states to customer-facing display labels.
//  Used by GET /api/orders/:id/progress
// =====================================================================

import type { Order } from "@shared/schema";

export interface DisplayStep {
  label: string;
  fsmState: string;
  completed: boolean;
  timestamp: string | null;
}

// The 13 Loom display labels in order (using 12 steps — Loom calls them "13-state"
// but "Weight Verified" and "Separated" share a visual group in some designs).
export const DISPLAY_LABELS: ReadonlyArray<{ label: string; fsmStates: readonly string[] }> = [
  { label: "Pickup Schedule", fsmStates: ["pending", "driver_assigned"] },
  { label: "Driver On Way", fsmStates: ["driver_en_route_pickup"] },
  { label: "Delivered to Laundromat", fsmStates: ["picked_up", "at_facility"] },
  { label: "Weight Verified & Photographed", fsmStates: ["weighed"] },
  { label: "Clothes Separated by Type", fsmStates: ["sorted"] },
  { label: "Washing", fsmStates: ["washing"] },
  { label: "All Washing Complete", fsmStates: ["wash_complete", "drying", "folding"] },
  { label: "Laundry Folded & Packaged", fsmStates: ["folded_packaged"] },
  { label: "Final Weight Verified", fsmStates: ["final_weight_verified"] },
  { label: "Ready for Delivery", fsmStates: ["ready_for_delivery"] },
  { label: "Out for Delivery", fsmStates: ["driver_en_route_delivery"] },
  { label: "Delivered to Customer", fsmStates: ["delivered", "completed"] },
];

// Map FSM state to its index in the 13-step display timeline (0-based).
// States before the first display step (quote lifecycle) map to -1.
const FSM_TO_DISPLAY_INDEX: Record<string, number> = {};
DISPLAY_LABELS.forEach((step, idx) => {
  for (const s of step.fsmStates) {
    FSM_TO_DISPLAY_INDEX[s] = idx;
  }
});

// Additional FSM states that map to specific display steps
// (intermediate states that exist in the FSM but don't have their own display label)
const EXTRA_STATE_MAP: Record<string, number> = {
  // Quote lifecycle → not started
  draft_quote: -1,
  quoted: -1,
  quote_accepted: -1,
  quote_expired: -1,
  payment_pending: -1,
  confirmed: 0,
  scheduled: 0,
  arrived_pickup: 1,
  driver_en_route_facility: 2,
  at_facility: 2,
  processing: 3,
  // disputed/refunded/cancelled — show last completed step
  disputed: -2,
  refunded: -2,
  cancelled: -2,
};

function getDisplayIndex(fsmState: string): number {
  if (FSM_TO_DISPLAY_INDEX[fsmState] !== undefined) return FSM_TO_DISPLAY_INDEX[fsmState];
  if (EXTRA_STATE_MAP[fsmState] !== undefined) return EXTRA_STATE_MAP[fsmState];
  return -1;
}

/**
 * Dynamic wash label based on clothing types.
 * If the order includes 'whites' → "Hot Wash Started (White Shirts)"
 * If the order includes 'dark items' or 'delicates' → "Cold Wash Started (Dark & Delicates)"
 * Otherwise → "Washing"
 */
function getWashLabel(clothingTypes: string[] | null | undefined): string {
  if (!clothingTypes || !Array.isArray(clothingTypes) || clothingTypes.length === 0) {
    return "Washing";
  }
  const lower = clothingTypes.map(c => c.toLowerCase());
  if (lower.includes("whites")) {
    return "Hot Wash Started (White Shirts)";
  }
  if (lower.includes("dark items") || lower.includes("delicates")) {
    return "Cold Wash Started (Dark & Delicates)";
  }
  return "Washing";
}

/**
 * Build the 13-step progress array for a given order.
 * Each step has { label, fsmState, completed, timestamp }.
 */
export function buildOrderProgress(order: any): DisplayStep[] {
  const currentStatus: string = order.status || "pending";
  const currentIdx = getDisplayIndex(currentStatus);
  const clothingTypes: string[] | null = order.clothingTypes || order.clothing_types || null;

  // Timestamps from the order record
  const tsMap: Record<string, string | null> = {
    0: order.confirmedAt || order.confirmed_at || order.createdAt || order.created_at || null,
    1: null, // driver_en_route_pickup — no dedicated timestamp
    2: order.pickedUpAt || order.picked_up_at || order.arrivedLaundromatAt || order.arrived_laundromat_at || null,
    3: null, // weighed — processing start
    4: null, // sorted
    5: order.washStartedAt || order.wash_started_at || null,
    6: order.washCompletedAt || order.wash_completed_at || null,
    7: order.qualityCheckedAt || order.quality_checked_at || null,
    8: order.qualityCheckedAt || order.quality_checked_at || null,
    9: null, // ready_for_delivery
    10: order.outForDeliveryAt || order.out_for_delivery_at || null,
    11: order.deliveredAt || order.delivered_at || null,
  };

  const steps: DisplayStep[] = [];

  for (let i = 0; i < DISPLAY_LABELS.length; i++) {
    let label = DISPLAY_LABELS[i].label;
    // Dynamic wash label for step 5 (Washing)
    if (i === 5) {
      label = getWashLabel(clothingTypes);
    }

    const primaryState = DISPLAY_LABELS[i].fsmStates[0];
    const completed = currentIdx >= 0 && i <= currentIdx;

    steps.push({
      label,
      fsmState: primaryState,
      completed,
      timestamp: completed ? (tsMap[i] || null) : null,
    });
  }

  return steps;
}
