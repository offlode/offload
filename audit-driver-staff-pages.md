# Offload — Driver, Staff & Manager Pages Audit

Audit date: 2026-04-14  
Files reviewed: 18 (7 driver, 8 staff, 3 manager)  
Schema cross-referenced: `/home/user/workspace/offload/shared/schema.ts`

---

## Summary Table

| File | Bugs / Issues |
|---|---|
| driver/dashboard.tsx | 1 — Hooks called after conditional return (Rules of Hooks violation) |
| driver/earnings.tsx | 1 — Hooks called after conditional return (Rules of Hooks violation) |
| driver/availability.tsx | 2 — Hooks called after conditional return; schedule preferences (days/times) never saved to API |
| driver/route.tsx | 2 — Hooks called after conditional return; "Complete stop" is client-only (no API call) |
| driver/order-detail.tsx | 1 — `bagCountConfirmed` state set but never read |
| driver/navigation.tsx | 1 — Wrong delivery address used for navigation (always uses `pickupAddress` for delivery stops) |
| driver/layout.tsx | 1 — Nav link to `/driver/orders` has no corresponding route/page |
| staff/orders.tsx | 2 — Broken route paths for Weigh and Wash buttons; broken "View" route |
| staff/queue.tsx | No issues found |
| staff/quality.tsx | 1 — Quality checklist submit fires no API call (submit is purely local state) |
| staff/weigh-photo.tsx | No issues found |
| staff/start-washing.tsx | No issues found |
| staff/active.tsx | 1 — "Details" button navigates to `/orders/:id` (customer route), not a staff route |
| staff/layout.tsx | No issues found |
| staff/profile.tsx | No issues found |
| manager/orders.tsx | 1 — "View Details" button has no `onClick` handler and no `href` (dead button) |
| manager/payouts.tsx | 1 — "Process Payout" / "Process All Payouts" buttons fire only a toast, no real API call |
| manager/layout.tsx | 1 — Nav item labelled "Analytics" links to `/manager/payouts`, misleading but functional |

---

## DRIVER Pages

---

### `driver/dashboard.tsx`

**What it does:** Main driver home screen. Shows a greeting, today's performance stats (trips, earnings, rating), a tabbed list of active pickup/delivery routes, a "Completed Today" section, and quick-action shortcuts for Navigation and Messages.

**Issues:**

1. **Rules of Hooks violation (conditional return before hooks)** — Lines 73–76 perform a redirect and `return null` before the `useQuery` hooks on lines 81–130. React requires all hooks to be called unconditionally on every render. If `!isAuthenticated` the component returns early, causing React to call a different number of hooks on subsequent renders when the user becomes authenticated. This will throw a React Hooks error at runtime.

   ```tsx
   // Lines 73-76 — early return BEFORE multiple useQuery calls
   if (!isAuthenticated) {
     navigate("/login");
     return null;
   }
   // ...then useQuery, useQuery, useQuery below — hooks called conditionally
   ```

---

### `driver/earnings.tsx`

**What it does:** Earnings detail screen for drivers. Shows today's summary (trips, earned, tips), pending payout, a bar chart of last 7 days' earnings, lifetime stat cards, and a trip history list.

**Issues:**

1. **Rules of Hooks violation (conditional return before hooks)** — Same pattern as `dashboard.tsx`. The `if (!isAuthenticated)` guard on lines 116–119 returns early before the two `useQuery` calls on lines 123 and 134. This will trigger a React Hooks error at runtime.

---

### `driver/availability.tsx`

**What it does:** Lets a driver set their online/offline status, manage preferred ZIP code zones, configure a max-trips-per-day slider, and set weekly schedule preferences (active days and time range).

**Issues:**

1. **Rules of Hooks violation (conditional return before hooks)** — Same pattern: the `if (!isAuthenticated)` guard on lines 75–78 returns before `useQuery`, `useEffect`, and `useMutation` calls on lines 82–126.

2. **Schedule preferences (days / time range) are never saved to the API** — The `selectedDays`, `timeStart`, and `timeEnd` states (lines 98–100) are modified via UI controls but no mutation is ever fired with these values. The `updateMutation` is only called for `status`, `preferredZones`, and `maxTripsPerDay`. If a driver selects different active days or a time range, those preferences are silently discarded.

---

### `driver/route.tsx`

**What it does:** Shows the driver's optimized route for the day — a summary card with total time and distance, individual stop cards with navigate and mark-done buttons, and a "all complete" banner.

**Issues:**

1. **Rules of Hooks violation (conditional return before hooks)** — Same pattern. `if (!isAuthenticated)` guard on lines 179–182 returns before `useQuery` calls on lines 186 and 197.

2. **"Mark as Done" is purely client-side — no API call** — The `markComplete` function (line 213) only updates local `completedStops` state. No `PATCH` request is made to advance the order's status. The progress is lost on page reload and the backend never learns a stop was completed. This should call the order status API similarly to `driver/order-detail.tsx`.

---

### `driver/order-detail.tsx`

**What it does:** Detail view for a single driver order. Shows customer info, route details, a bag-count confirmation dialog, an order progress timeline, an order summary with bag types and pricing, and a primary action button that advances the order through its status lifecycle.

**Issues:**

1. **`bagCountConfirmed` state is set but never read** — `bagCountConfirmed` is set to `true` (line 374) when the driver confirms bag count in the dialog, but this variable is never used anywhere in the JSX or any condition. The `handleAction` guard already uses `showBagConfirm` to control flow. The `bagCountConfirmed` state is dead code and can cause confusion about the intended confirmation gate.

---

### `driver/navigation.tsx`

**What it does:** Full-screen navigation view with a simulated map, a bottom sheet showing the current destination address, scheduled time, a Google Maps deep-link button, and an action button to advance the order status (e.g., "Start Pickup", "Arrived at Laundromat").

**Issues:**

1. **Wrong address used for delivery navigation** — `getNavigationTarget` (lines 9–37) always returns `order.pickupAddress` as the address for every navigation step, including `ready_for_delivery` and `out_for_delivery` statuses (lines 28–33). For delivery stops the driver should be navigated to `order.deliveryAddress` (which exists in the schema), not back to the customer's pickup address. As written, the Google Maps link will direct the driver to the wrong address when delivering.

   ```tsx
   // Line 29-33 — delivery case incorrectly uses pickup address
   case "ready_for_delivery":
   case "out_for_delivery":
     return {
       address: pickup,   // BUG: should be order.deliveryAddress ?? order.pickupAddress
       label: "Delivery",
   ```

---

### `driver/layout.tsx`

**What it does:** Shared layout wrapper for all driver pages. Renders the page content and a fixed bottom navigation bar with 6 items: Home, Orders, Earnings, Route, Availability, Profile.

**Issues:**

1. **Dead nav link — `/driver/orders` route does not exist** — The navigation item on line 6 links to `/driver/orders`. No file at `pages/driver/orders.tsx` exists in the audited file list and this route does not match the dashboard at `/driver`. Tapping "Orders" in the bottom nav will likely show a 404/not-found page.

---

## STAFF Pages

---

### `staff/orders.tsx`

**What it does:** Main staff orders list. Shows quick stats (active, washing, ready counts) and a list of all non-cancelled orders with action buttons to weigh/photo, start washing, or view the order.

**Issues:**

1. **Broken route path for "Weigh & Photo" button** — Line 180 navigates to `/staff/weigh/${order.id}`. The `weigh-photo.tsx` page registers its route on line 12 of that file as `/staff/weigh/:id` — this matches. However, this is consistent. *(No mismatch here — confirmed correct.)*

2. **Broken route path for "Start Washing" button** — Line 191 navigates to `/staff/wash/${order.id}`. The `start-washing.tsx` page registers its route as `/staff/wash/:id` — this matches. *(No mismatch here — confirmed correct.)*

3. **"View" button navigates to `/orders/${order.id}` — a customer-facing route, not a staff route** — Line 201 calls `navigate(\`/orders/${order.id}\`)`. This is the customer order detail route, not a staff-specific page. Staff members clicking "View" will be routed to the customer-side order detail page (if it exists) or a 404. The correct staff destination would be a staff order detail route or at minimum `/staff/wash/${order.id}`.

---

### `staff/queue.tsx`

**What it does:** AI-prioritized queue view for staff. Shows a capacity bar, tab filters (All, Urgent, In Progress, Ready), and queue cards with SLA countdowns and action buttons to advance orders through the washing pipeline.

**No issues found.**

---

### `staff/quality.tsx`

**What it does:** Quality control page for staff. Shows personal quality scores vs. vendor average, a 7-day bar chart, a quality checklist, a star self-assessment, a simulated photo upload, and a submit button.

**Issues:**

1. **Quality check submit fires no API call** — `handleSubmit` (lines 165–191) only updates local state (`setSubmitted(true)`) and shows a toast. No `useMutation` or `apiRequest` is present. Quality check data (checklist state, self-rating, photo flag) is never persisted to the backend. The stats shown (`myScore`, `totalChecked`) will never reflect this submission.

---

### `staff/weigh-photo.tsx`

**What it does:** Workflow page for weighing individual bags at intake and optionally taking a photo. Submits weight to `/api/orders/:id/intake` and then advances status to `washing`.

**No issues found.**

---

### `staff/start-washing.tsx`

**What it does:** Multi-state page that handles the full washing workflow: starting a wash (with duration and separate-by-type options), recording output weight once washing is done, starting packing, and marking an order ready for delivery.

**No issues found.**

---

### `staff/active.tsx`

**What it does:** Live monitoring view for orders currently in `washing`, `wash_complete`, or `packing` states. Shows grouped sections for each state with advance-status buttons.

**Issues:**

1. **"Details" button navigates to `/orders/${order.id}` — a customer-facing route** — Line 146 calls `navigate(\`/orders/${order.id}\`)`. Same issue as `staff/orders.tsx`: this routes to the customer order detail page, not a staff-appropriate view. Staff should not be routed to a customer-facing page.

---

### `staff/layout.tsx`

**What it does:** Shared layout wrapper for all staff pages. Renders a bottom navigation bar with 5 items: Orders, Washing, AI Queue, Quality, Profile.

**No issues found.**

---

### `staff/profile.tsx`

**What it does:** Staff profile page with user info display (name, email, role badge), a theme toggle (light/dark), and a logout button.

**No issues found.**

---

## MANAGER Pages

---

### `manager/orders.tsx`

**What it does:** Manager-level orders overview with search, filter tabs (All, Active, Delivered, Cancelled), key metrics (total, active, completed), and order cards showing customer, status, bags, notes, and payment status.

**Issues:**

1. **"View Details" button has no `onClick` and no navigation** — Line 301–306 renders a `<button>` labelled "View Details" with no `onClick` handler and no wrapping `<Link>`. Clicking it does nothing. The button should navigate to an order detail page (e.g., `/manager/orders/${order.id}` or `/orders/${order.id}`).

   ```tsx
   // Lines 301-306 — dead button, no onClick, no Link
   <button
     data-testid={`btn-view-details-${order.id}`}
     className="w-full mt-2 py-2.5 rounded-full ..."
   >
     View Details
   </button>
   ```

---

### `manager/payouts.tsx`

**What it does:** Manager payouts screen. Shows a revenue overview (total revenue, platform revenue, vendor payouts, driver payouts) and a vendor breakdown table with per-vendor revenue/payout figures and "Process Payout" buttons.

**Issues:**

1. **"Process Payout" and "Process All Payouts" buttons are stub-only — no API call** — `handleProcessPayout` (line 66–70) only fires a toast notification. The "Process All Payouts" button inline handler on line 220–225 also only fires a toast. No `useMutation` or `apiRequest` is called for either action. Payouts are never actually submitted to the backend. This is a critical missing feature for a financial workflow page.

---

### `manager/layout.tsx`

**What it does:** Shared layout wrapper for manager pages with a 4-item bottom nav: Home, Orders, Analytics, Profile.

**Issues:**

1. **Nav label "Analytics" links to `/manager/payouts`** — Line 7 uses `icon: BarChart3` and label "Analytics" but the path is `/manager/payouts`. This is a cosmetic/labelling mismatch — the page is a payouts breakdown, not a general analytics page. It is functional (the link works), but the label is misleading. Low severity.

---

## Cross-Cutting Issues

### Rules of Hooks violations (4 files)

The most critical class of bug affects four driver pages: `dashboard.tsx`, `earnings.tsx`, `availability.tsx`, and `route.tsx`. All four share the same pattern:

```tsx
// WRONG — early return before hooks
if (!isAuthenticated) {
  navigate("/login");
  return null;
}

// These hooks are now called conditionally
const { data } = useQuery(...);
```

React enforces that hooks must be called in the same order on every render. Returning before hooks means hook call count varies between renders (authenticated vs. not). This produces the error: **"Rendered more hooks than during the previous render"** or **"Rendered fewer hooks than during the previous render"**.

**Fix:** Move authentication checks inside a `useEffect`, or restructure so all hooks are called unconditionally and the early return only happens after them. Example:

```tsx
// CORRECT
const { user, isAuthenticated } = useAuth();
const { data } = useQuery(...);  // always called

useEffect(() => {
  if (!isAuthenticated) navigate("/login");
}, [isAuthenticated]);

if (!isAuthenticated) return null;  // render guard, not a hooks guard
```

### "View" / "Details" buttons routing to customer-facing pages (2 files)

Both `staff/orders.tsx` (line 201) and `staff/active.tsx` (line 146) call `navigate(\`/orders/${order.id}\`)` — the customer order detail route. Staff members should not land on the customer-facing order page. A staff-specific route should be used.
