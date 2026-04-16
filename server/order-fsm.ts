// =====================================================================
//  21-STATE ORDER FINITE STATE MACHINE
//  Includes quote lifecycle: draft_quote → quoted → accepted → payment_pending → pending
// =====================================================================

export const ORDER_STATES = {
  // Pre-order quote lifecycle
  DRAFT_QUOTE: 'draft_quote',
  QUOTED: 'quoted',
  QUOTE_ACCEPTED: 'quote_accepted',
  QUOTE_EXPIRED: 'quote_expired',
  PAYMENT_PENDING: 'payment_pending',
  CONFIRMED: 'confirmed',
  // Standard order lifecycle
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  DRIVER_ASSIGNED: 'driver_assigned',
  DRIVER_EN_ROUTE_PICKUP: 'driver_en_route_pickup',
  ARRIVED_PICKUP: 'arrived_pickup',
  PICKED_UP: 'picked_up',
  DRIVER_EN_ROUTE_FACILITY: 'driver_en_route_facility',
  AT_FACILITY: 'at_facility',
  PROCESSING: 'processing',
  WASHING: 'washing',
  DRYING: 'drying',
  FOLDING: 'folding',
  READY_FOR_DELIVERY: 'ready_for_delivery',
  DRIVER_EN_ROUTE_DELIVERY: 'driver_en_route_delivery',
  ARRIVED_DELIVERY: 'arrived_delivery',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

export type OrderState = typeof ORDER_STATES[keyof typeof ORDER_STATES];

// Define valid transitions: from -> [allowed next states]
export const VALID_TRANSITIONS: Record<string, string[]> = {
  // Quote lifecycle
  draft_quote: ['quoted', 'quote_expired', 'cancelled'],
  quoted: ['quote_accepted', 'quote_expired', 'cancelled'],
  quote_accepted: ['payment_pending', 'pending', 'cancelled'],
  quote_expired: [], // terminal
  payment_pending: ['pending', 'cancelled'],
  confirmed: ['scheduled', 'driver_assigned', 'cancelled'],
  // Standard order lifecycle
  pending: ['confirmed', 'scheduled', 'cancelled'],
  scheduled: ['driver_assigned', 'cancelled'],
  driver_assigned: ['driver_en_route_pickup', 'cancelled'],
  driver_en_route_pickup: ['arrived_pickup', 'cancelled'],
  arrived_pickup: ['picked_up', 'cancelled'],
  picked_up: ['driver_en_route_facility'],
  driver_en_route_facility: ['at_facility'],
  at_facility: ['processing'],
  processing: ['washing'],
  washing: ['drying'],
  drying: ['folding'],
  folding: ['ready_for_delivery'],
  ready_for_delivery: ['driver_en_route_delivery'],
  driver_en_route_delivery: ['arrived_delivery'],
  arrived_delivery: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};

// Who can trigger each transition
export const TRANSITION_ACTORS: Record<string, string[]> = {
  // Quote lifecycle actors
  'draft_quote->quoted': ['system'],
  'draft_quote->quote_expired': ['system'],
  'draft_quote->cancelled': ['customer', 'admin'],
  'quoted->quote_accepted': ['customer'],
  'quoted->quote_expired': ['system'],
  'quoted->cancelled': ['customer', 'admin'],
  'quote_accepted->payment_pending': ['system'],
  'quote_accepted->pending': ['system'], // auto-convert for authorized orders
  'quote_accepted->cancelled': ['customer', 'admin'],
  'payment_pending->pending': ['system'], // payment confirmed
  'payment_pending->cancelled': ['customer', 'admin', 'system'],
  'pending->confirmed': ['system'],
  'confirmed->scheduled': ['system', 'customer'],
  'confirmed->driver_assigned': ['system', 'admin'],
  'confirmed->cancelled': ['customer', 'admin', 'system'],
  // Standard order lifecycle actors
  'pending->scheduled': ['system', 'customer'],
  'scheduled->driver_assigned': ['system', 'admin'],
  'driver_assigned->driver_en_route_pickup': ['driver'],
  'driver_en_route_pickup->arrived_pickup': ['driver', 'system'],
  'arrived_pickup->picked_up': ['driver'],
  'picked_up->driver_en_route_facility': ['driver', 'system'],
  'driver_en_route_facility->at_facility': ['driver', 'system'],
  'at_facility->processing': ['laundromat'],
  'processing->washing': ['laundromat'],
  'washing->drying': ['laundromat'],
  'drying->folding': ['laundromat'],
  'folding->ready_for_delivery': ['laundromat'],
  'ready_for_delivery->driver_en_route_delivery': ['driver'],
  'driver_en_route_delivery->arrived_delivery': ['driver', 'system'],
  'arrived_delivery->delivered': ['driver'],
  'delivered->completed': ['system'],
  // Cancellation can be triggered by multiple actors
  'pending->cancelled': ['customer', 'admin', 'system'],
  'scheduled->cancelled': ['customer', 'admin', 'system'],
  'driver_assigned->cancelled': ['customer', 'admin', 'system'],
  'driver_en_route_pickup->cancelled': ['customer', 'admin', 'system'],
  'arrived_pickup->cancelled': ['customer', 'admin', 'system'],
};

// Notification templates per transition
export const STATUS_NOTIFICATIONS: Record<string, { customer?: string; driver?: string; staff?: string }> = {
  'draft_quote': { customer: 'Your quote is being prepared' },
  'quoted': { customer: 'Your quote is ready! Review and accept within {expiry} minutes.' },
  'quote_accepted': { customer: 'Quote accepted! Proceeding to payment.' },
  'quote_expired': { customer: 'Your quote has expired. Please request a new one.' },
  'payment_pending': { customer: 'Waiting for payment confirmation...' },
  'confirmed': { customer: 'Your order is confirmed! We\'re matching you with the best vendor.' },
  'scheduled': { customer: 'Your order is confirmed! Pickup window: {time}' },
  'driver_assigned': { customer: 'A driver has been assigned to your pickup!', driver: 'New pickup job assigned!' },
  'driver_en_route_pickup': { customer: 'Your driver is on the way! ETA: {eta}' },
  'arrived_pickup': { customer: 'Your driver has arrived for pickup!' },
  'picked_up': { customer: 'Your laundry has been picked up!' },
  'at_facility': { customer: 'Your laundry has arrived at the facility', staff: 'New order arrived for processing' },
  'processing': { customer: 'Your laundry is being processed' },
  'washing': { customer: 'Your laundry is in the wash!' },
  'drying': { customer: 'Your laundry is drying' },
  'folding': { customer: 'Your laundry is being folded' },
  'ready_for_delivery': { customer: 'Your laundry is clean and ready for delivery!', driver: 'New delivery assignment available' },
  'driver_en_route_delivery': { customer: 'Your clean laundry is on its way! ETA: {eta}' },
  'arrived_delivery': { customer: 'Your driver has arrived with your laundry!' },
  'delivered': { customer: 'Delivery complete! Rate your experience.' },
  'completed': { customer: 'Order complete. Thank you!' },
  'cancelled': { customer: 'Your order has been cancelled.' },
};

// Human-readable status labels
export const STATUS_LABELS: Record<string, string> = {
  draft_quote: 'Draft Quote',
  quoted: 'Quoted',
  quote_accepted: 'Quote Accepted',
  quote_expired: 'Quote Expired',
  payment_pending: 'Payment Pending',
  confirmed: 'Confirmed',
  pending: 'Pending',
  scheduled: 'Scheduled',
  driver_assigned: 'Driver Assigned',
  driver_en_route_pickup: 'Driver En Route',
  arrived_pickup: 'Driver Arrived',
  picked_up: 'Picked Up',
  driver_en_route_facility: 'En Route to Facility',
  at_facility: 'At Facility',
  processing: 'Processing',
  washing: 'Washing',
  drying: 'Drying',
  folding: 'Folding',
  ready_for_delivery: 'Ready for Delivery',
  driver_en_route_delivery: 'Out for Delivery',
  arrived_delivery: 'Driver Arrived',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// Ordered steps for the timeline (excluding cancelled and expired)
export const TIMELINE_STEPS: string[] = [
  'draft_quote',
  'quoted',
  'quote_accepted',
  'payment_pending',
  'confirmed',
  'pending',
  'scheduled',
  'driver_assigned',
  'driver_en_route_pickup',
  'arrived_pickup',
  'picked_up',
  'driver_en_route_facility',
  'at_facility',
  'processing',
  'washing',
  'drying',
  'folding',
  'ready_for_delivery',
  'driver_en_route_delivery',
  'arrived_delivery',
  'delivered',
  'completed',
];

// Map old statuses to new FSM statuses for backward compatibility
export const LEGACY_STATUS_MAP: Record<string, string> = {
  quote: 'quoted',
  accepted: 'quote_accepted',
  payment: 'payment_pending',
  // confirmed is now a real state — no legacy mapping needed
  pickup_in_progress: 'driver_en_route_pickup',
  at_laundromat: 'at_facility',
  wash_complete: 'drying',
  quality_check: 'folding',
  packing: 'folding',
  out_for_delivery: 'driver_en_route_delivery',
  disputed: 'delivered', // disputes are a separate concern
};

/**
 * Validate a state transition.
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function validateTransition(
  currentStatus: string,
  newStatus: string,
  actorRole?: string,
): { valid: true } | { valid: false; error: string; allowed: string[] } {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) {
    return { valid: false, error: `Unknown status: '${currentStatus}'`, allowed: [] };
  }

  if (!allowed.includes(newStatus)) {
    return {
      valid: false,
      error: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
      allowed,
    };
  }

  if (actorRole) {
    const transitionKey = `${currentStatus}->${newStatus}`;
    const allowedActors = TRANSITION_ACTORS[transitionKey];
    if (allowedActors && !allowedActors.includes(actorRole)) {
      return {
        valid: false,
        error: `Role '${actorRole}' cannot trigger transition from '${currentStatus}' to '${newStatus}'. Allowed: ${allowedActors.join(', ')}`,
        allowed,
      };
    }
  }

  return { valid: true };
}

/**
 * Get the timestamp field name that should be set for a given status.
 */
export function getTimestampField(status: string): string | null {
  const map: Record<string, string> = {
    quoted: 'quotedAt',
    quote_accepted: 'quoteAcceptedAt',
    payment_pending: 'paymentInitiatedAt',
    confirmed: 'confirmedAt',
    scheduled: 'scheduledAt',
    picked_up: 'pickedUpAt',
    at_facility: 'arrivedLaundromatAt',
    washing: 'washStartedAt',
    drying: 'washCompletedAt',
    driver_en_route_delivery: 'outForDeliveryAt',
    delivered: 'deliveredAt',
    cancelled: 'cancelledAt',
  };
  return map[status] || null;
}

/**
 * Determine if a status is cancellable.
 */
export function isCancellable(status: string): boolean {
  const allowed = VALID_TRANSITIONS[status];
  return !!allowed && allowed.includes('cancelled');
}

/**
 * Check if a status is a pre-order quote state.
 */
export function isQuoteState(status: string): boolean {
  return ['draft_quote', 'quoted', 'quote_accepted', 'quote_expired', 'payment_pending'].includes(status);
}

/**
 * Get the index of a status in the timeline (for progress calculation).
 * Returns -1 if cancelled, expired, or unknown.
 */
export function getTimelineIndex(status: string): number {
  if (status === 'cancelled' || status === 'quote_expired') return -1;
  return TIMELINE_STEPS.indexOf(status);
}

/**
 * Get progress percentage through the order lifecycle.
 */
export function getProgressPercent(status: string): number {
  if (status === 'cancelled' || status === 'quote_expired') return 0;
  const idx = TIMELINE_STEPS.indexOf(status);
  if (idx < 0) return 0;
  return Math.round((idx / (TIMELINE_STEPS.length - 1)) * 100);
}
