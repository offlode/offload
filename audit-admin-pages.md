# Admin Pages Audit — Offload

Audited files: all admin pages, `App.tsx`, and `error-boundary.tsx`.
Schema reference: `/home/user/workspace/offload/shared/schema.ts`

---

## 1. `admin/overview.tsx`

**Purpose:** Real-time admin dashboard displaying KPI metric cards, order pipeline breakdown, revenue-by-vendor bar chart, and a recent activity feed sourced from live order events.

### Issues Found

#### BUG 1 — Unsafe `.toFixed(2)` on potentially null `avgOrderValue`
**Line 209:**
```tsx
value={`$${metrics.avgOrderValue.toFixed(2)}`}
```
`avgOrderValue` in the `Metrics` interface is typed `number`, but if the API returns `null` or `0` for an empty platform (no orders), `.toFixed(2)` will throw on `null`/`undefined`. The field has no nullish fallback. Should be `(metrics.avgOrderValue ?? 0).toFixed(2)`.

#### BUG 2 — `queryKey` for the events query uses only the first order ID but fetches all recent order events
**Lines 113–130:**
```tsx
queryKey: ["/api/orders", recentOrderIds[0], "events"],
```
The query key references only `recentOrderIds[0]`, but the `queryFn` fetches events for up to 5 orders (`recentOrderIds`). When the first order changes but others in the list change too, React Query will serve stale cached data for the other orders. The key should include the full array, e.g. `["/api/orders", "recent-events", ...recentOrderIds]`.

#### BUG 3 — Missing error state for metrics query
When the `/api/admin/metrics` fetch fails (`isLoading = false`, `metrics = undefined`), the component renders nothing (the final `: null` branch). There is no error UI or message. The `useQuery` `isError`/`error` return values are not destructured or used.

#### BUG 4 — `revenue.toFixed(2)` inside Revenue by Vendor without null guard
**Line 323:**
```tsx
<p className="text-xs font-semibold">${revenue.toFixed(2)}</p>
```
`revenue` is a value from `Object.entries(metrics.revenueByVendor)` which is `Record<string, number>`. If the API ever returns a non-number here (e.g. `null`), this will throw. Low severity but worth guarding.

---

## 2. `admin/orders.tsx`

**Purpose:** Full order management table with expand-in-place detail panels, status transition controls, timeline view, date/status filters, multi-select, and CSV export.

### Issues Found

#### BUG 1 — `order.total?.toFixed(2)` renders `undefined` as a child when `total` is null
**Line 198:**
```tsx
<p className="text-sm font-semibold">${order.total?.toFixed(2)}</p>
```
When `order.total` is `null` or `undefined`, `order.total?.toFixed(2)` evaluates to `undefined`. React renders `undefined` as nothing, so the cell shows only `$` with no value — a silent display bug rather than a crash, but misleading. Should be `(order.total ?? 0).toFixed(2)`.

Same pattern appears at lines 257–260 for `subtotal`, `tax`, `deliveryFee`, and `total` in the expanded summary panel:
```tsx
<p>Subtotal: ${order.subtotal?.toFixed(2)}</p>
<p>Tax: ${order.tax?.toFixed(2)}</p>
<p>Fee: ${order.deliveryFee?.toFixed(2)}</p>
<p className="font-semibold text-foreground">Total: ${order.total?.toFixed(2)}</p>
```
All four use optional chaining that silently produces `$undefined` text in the DOM if the field is null.

#### BUG 2 — `order.createdAt` passed directly to `new Date()` without null guard
**Line 180:**
```tsx
{new Date(order.createdAt || "").toLocaleDateString()}
```
`createdAt` is typed `string` (NOT NULL in schema) so this is low risk — but the empty-string fallback `""` produces `Invalid Date` in the UI if the field is unexpectedly absent. The same pattern is used in the `OrderRow` timeline: `new Date(ev.timestamp || "")` (line 290).

#### BUG 3 — `JSON.parse(order.bags || "[]")` is unguarded against malformed JSON
**Line 108:**
```tsx
const bags = JSON.parse(order.bags || "[]");
```
If `order.bags` contains invalid JSON (e.g. a partially-written record from the server), `JSON.parse` will throw, crashing the `OrderRow` component and everything above it up to the nearest error boundary. Should be wrapped in a `try/catch`.

#### BUG 4 — CSV export uses `order.total?.toFixed(2)` — writes `"undefined"` string into CSV
**Line 420:**
```tsx
`"${o.orderNumber}","${o.status}","${o.total?.toFixed(2)}","${o.deliverySpeed}",...`
```
If `total` is null, the exported CSV cell will contain the literal string `"undefined"`. Should use `(o.total ?? 0).toFixed(2)`.

---

## 3. `admin/vendors.tsx`

**Purpose:** Vendor management page with per-vendor cards showing capacity, ratings, capabilities, revenue stats, and controls to toggle status (suspend/activate) or adjust capacity. Includes an "Add Vendor" creation dialog.

### Issues Found

#### BUG 1 — `vendor.capabilities` parsed with `JSON.parse` without try/catch
**Line 64:**
```tsx
const capabilities = vendor.capabilities ? JSON.parse(vendor.capabilities as string) : [];
```
If `vendor.capabilities` is a non-null but malformed JSON string, `JSON.parse` will throw and crash the `VendorCard`. Should be wrapped in a `try/catch` with a fallback of `[]`.

#### BUG 2 — `revenue.toFixed(2)` on stats-derived value without null guard
**Line 156:**
```tsx
<p className="text-sm font-bold">${revenue.toFixed(2)}</p>
```
`revenue` is `stats?.revenue ?? 0`, so it is always a number — this is actually fine. No bug here.

#### BUG 3 — Stale success toast references `form.name` after reset
**Lines 361–362:**
```tsx
setForm({ name: "", ... });
toast({ title: "Vendor created", description: `${form.name} has been added` });
```
`setForm` is called before the toast, but since React state updates are batched, at the time the toast description is evaluated `form.name` still holds the old value. This is typically benign (the name shows correctly) but relies on closure capture order. In strict mode or concurrent mode this could show a blank name. The name should be captured before resetting: `const createdName = form.name; setForm(...); toast({ description: \`${createdName} has been added\` })`.

#### BUG 4 — Missing error state for the main vendors query
If `/api/vendors` fails, `isLoading` becomes `false` and `vendors` is `undefined`, which falls through to the empty-state card ("No vendors found") — giving the admin a misleading "no vendors" message when in fact there was a network error. No `isError` check exists.

---

## 4. `admin/drivers.tsx`

**Purpose:** Driver management page with per-driver cards showing status, active assignments, stats (rating, trips, earnings), and status-change controls (Available / Busy / Offline). Includes an "Add Driver" creation dialog.

### Issues Found

#### BUG 1 — `earnings.toFixed(2)` unsafe when `deliveryFee` may be null
**Lines 60–61:**
```tsx
const earnings = stats?.earnings
  ?? driverOrders.filter(o => o.status === "delivered").reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
```
**Line 126:**
```tsx
<span className="text-sm font-bold">${earnings.toFixed(2)}</span>
```
The fallback computation uses `(o.deliveryFee || 0)` which is correct. But if `stats?.earnings` itself is returned from the API as `null` (rather than `undefined`), `?? ` will not activate (since `null ?? fallback` DOES activate in JS — this is fine). However if the API returns the wrong type (a string), `.toFixed()` would throw. Low severity.

#### BUG 2 — Missing error state for drivers query
Same issue as vendors: failed `/api/drivers` fetch silently shows the empty-state card with "No drivers found" rather than an error message.

#### BUG 3 — Stale toast uses `form.name` after reset
**Lines 281–282:**
```tsx
setForm({ name: "", phone: "", vehicleType: "SUV", licensePlate: "" });
toast({ title: "Driver added", description: `${form.name} has been registered` });
```
Same pattern as vendors.tsx — `form.name` is read from state that has just been scheduled to reset. Capture the name before calling `setForm`.

---

## 5. `admin/disputes.tsx`

**Purpose:** Dispute resolution page. Lists all disputes with status filters, per-dispute cards showing the related order, customer info, reason, a simple timeline, resolution notes form, and action buttons to begin investigation, resolve, or close.

### Issues Found

#### BUG 1 — `order.total?.toFixed(2)` renders `$undefined` when total is null
**Line 132:**
```tsx
<span className="font-semibold ml-auto">${order.total?.toFixed(2)}</span>
```
Same pattern as `orders.tsx`. Optional chaining on `toFixed` produces `undefined` as a JSX text node, resulting in `$undefined` in the rendered output. Should be `(order.total ?? 0).toFixed(2)`.

#### BUG 2 — `dispute.creditAmount.toFixed(2)` — only guarded by `!= null && > 0`
**Line 179:**
```tsx
{dispute.creditAmount != null && dispute.creditAmount > 0 && (
  <span>${dispute.creditAmount.toFixed(2)} credit issued</span>
)}
```
This guard is correct and safe. No bug.

#### BUG 3 — Customer data is always fetched for every dispute card (no `enabled` guard)
**Lines 43–49:**
```tsx
const { data: customer } = useQuery<User>({
  queryKey: ["/api/users", dispute.customerId],
  queryFn: async () => { ... },
});
```
Unlike in `orders.tsx` (where customer is only fetched when expanded), every `DisputeCard` immediately fires a `/api/users/:id` request on mount, regardless of whether the dispute card is even visible. With many disputes, this creates a flood of requests on page load. Should add `enabled: false` and fetch on demand, or batch the requests.

#### BUG 4 — Missing error state for disputes query
Same pattern as vendors/drivers — no `isError` handling.

---

## 6. `admin/analytics.tsx`

**Purpose:** Analytics dashboard with KPI cards, a 7-day revenue bar chart (Recharts), order status pie chart, customer acquisition funnel, and top-vendor table. Falls back to simulated data when the API is unavailable.

### Issues Found

#### BUG 1 — `kpis.avgOrderValue.toFixed(2)` — no null guard on live API data
**Line 169:**
```tsx
value={`$${kpis.avgOrderValue.toFixed(2)}`}
```
`kpis` is either the live API `data.kpis` or `simulatedKpis`. If the API returns `avgOrderValue: null`, `.toFixed(2)` will throw. The simulated fallback is safe, but live data is not guarded.

#### BUG 2 — Trend indicators are hardcoded strings (`"+12%"`, `"+8%"`, etc.)
**Lines 158, 165, 172, 179:**
```tsx
trend="+12%"
trend="+8%"
trend="+3%"
trend="+15%"
```
These are always hardcoded regardless of actual data. This is a design/data integrity issue: trends shown to admins are fabricated and do not reflect actual period-over-period change. No crash, but potentially misleading.

#### BUG 3 — No error state when `/api/admin/analytics` fails
If the fetch fails, `data` is `undefined`, and the component silently falls back to simulated data without any indication to the user. While functional (simulated data renders), admins have no way to know the live API is down.

---

## 7. `admin/vendor-scoring.tsx`

**Purpose:** Vendor Health Scoring dashboard. Shows a sortable scoreboard table of all vendors with health scores, and a drill-down panel for the selected vendor showing score breakdown bars, AI recommendations, recent orders, and recent reviews.

### Issues Found

#### BUG 1 — `$${o.total}` renders an object or unformatted number without `.toFixed()`
**Line 352:**
```tsx
<span className="font-semibold">${o.total}</span>
```
`o.total` is typed `number` in the local `VendorHealth` interface. When rendered directly as `{o.total}`, React renders the raw number without formatting (e.g. `$68.5` instead of `$68.50`). More critically, if the live API were to return `o.total` as a string representation, it would render correctly but inconsistently. Should be `${o.total.toFixed(2)}`.

#### BUG 2 — `displayHealth` can be `null` and falls through to a blank panel
**Line 302:**
```tsx
) : displayHealth ? (
  ...
) : null}
```
If `selectedVendorId` is set but there is no matching entry in `simHealth` (e.g. vendor IDs 2, 3, or 5 are selected — only 1 and 4 have simulated health data), `displayHealth` is `null` and the right panel renders nothing. The user sees a blank area with no indication that the data is unavailable. This should show an error or "no detail available" state.

#### BUG 3 — No error state for the `/api/admin/vendor-scores` query
Same pattern as other pages — if the API fails, the page silently falls back to simulated data without showing an error.

---

## 8. `admin/promos.tsx`

**Purpose:** Promo code management page. Displays a stats row (total, active, redemptions, unlimited codes), a full promos table with toggle and edit actions, and dialogs for creating and editing promo codes using `react-hook-form` + Zod.

### Issues Found

#### BUG 1 — `displayPromos.filter(p => p.isActive).length` — `isActive` is an integer (0 or 1), not a boolean
**Lines 341, 358:**
```tsx
displayPromos.filter(p => p.isActive).length
```
`PromoCode.isActive` is `integer | null` per the schema (SQLite integer, Drizzle infers it as `number | null`). In JavaScript, `0` and `null` are falsy, and `1` is truthy, so `filter(p => p.isActive)` does work correctly in practice. However it is fragile — any non-zero integer would be treated as active. Strictly, the filter should be `p.isActive === 1`. This is a latent correctness bug.

#### BUG 2 — `form.reset()` called from inside `createMutation.onSuccess` where `form` is defined after the mutation
**Lines 97, 116:**
```tsx
onSuccess: () => {
  ...
  form.reset();   // line 97 in createMutation
  ...
  editForm.reset(); // line 116 in updateMutation
}
```
`form` and `editForm` are defined with `useForm` after the mutations are defined (lines 136–158). This works because the mutation's `onSuccess` is only called asynchronously after the component renders, by which time the `form` variable is in scope via closure. No crash — but the code ordering is fragile and should be reorganized to define forms before mutations for clarity.

#### BUG 3 — Edit dialog uses `defaultValue` on Select (not `value`), so switching between promos may not update the type dropdown
**Line 231:**
```tsx
<Select onValueChange={field.onChange} defaultValue={field.value}>
```
Using `defaultValue` (uncontrolled) means the Select is initialized once and won't re-render when `editForm.reset(...)` is called with a different promo's `type`. When the admin opens the edit dialog for a second promo, the `type` Select may still show the previous promo's type visually, even though `editForm`'s internal value was reset. Should use `value={field.value}` (controlled) instead. This is a definite UI bug.

#### BUG 4 — No error state for `/api/admin/promos` query
If the fetch fails, `promos` is `undefined`, the component falls back to `simPromos`, and there is no error indication.

---

## 9. `admin/financial.tsx`

**Purpose:** Financial reports page with revenue/payout summary cards, a multi-series monthly trend area chart (Recharts), and a per-vendor revenue breakdown table with payout status and margin calculations. Falls back to simulated data.

### Issues Found

#### BUG 1 — Division by zero possible in the vendor breakdown totals footer
**Lines 332–334:**
```tsx
(displayData.vendorBreakdown.reduce((s, v) => s + v.platformFee, 0) /
  displayData.vendorBreakdown.reduce((s, v) => s + v.grossRevenue, 0)) * 100
).toFixed(1)
```
If `vendorBreakdown` is empty (or all `grossRevenue` values are 0), this expression produces `NaN` or `Infinity`, which React renders as an empty string, producing `%` with no number. Should guard: `grossRevenue > 0 ? ... : "0.0"`.

#### BUG 2 — `driverPayouts` area is plotted in the chart (line 236–242) but omitted from the chart legend
**Lines 255–264 (legend):**
```tsx
{ color: "#7C5CFC", label: "Revenue" },
{ color: "#2BB5A0", label: "Vendor Payouts" },
{ color: "#F59E0B", label: "Platform Revenue" },
```
Three legend entries are shown, but the `AreaChart` renders **four** series: `revenue`, `vendorPayouts`, `driverPayouts`, and `platformRevenue`. The `driverPayouts` area (stroke `#2BB5A0`) is rendered in the chart but has no legend entry. The `#2BB5A0` color is also reused by "Vendor Payouts" in the legend, making the chart ambiguous.

Wait — re-examining: the three `Area` components are for `revenue`, `vendorPayouts`, and `platformRevenue` (lines 229–249). `driverPayouts` is NOT plotted. The legend correctly shows 3 items. No bug here — this note is withdrawn.

#### BUG 3 — No error state for `/api/admin/financial` query
Same pattern — silent fallback to simulated data with no error indicator.

---

## 10. `admin/fraud.tsx`

**Purpose:** Fraud detection dashboard. Shows summary KPIs (total flagged, high risk, medium risk, cleared), a table of flagged orders with risk score bars, expandable detail panels showing triggered flags and recommended actions, and Clear/Escalate buttons.

### Issues Found

#### BUG 1 — `isPending` conflation: clearing one alert disables buttons for ALL alerts simultaneously
**Line 253:**
```tsx
const isPending = clearMutation.isPending || escalateMutation.isPending;
```
This `isPending` flag is computed once per render in the outer map, so when any single alert is being processed, every row's action buttons are disabled simultaneously. This prevents the admin from acting on other independent alerts in parallel. Each row should track its own pending state, e.g. by passing the in-flight `alertId` to compare.

#### BUG 2 — Expand toggle button does not call `e.stopPropagation()`
**Lines 298–305:**
```tsx
<button
  className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
  data-testid={`button-expand-alert-${alert.id}`}
>
  {isExpanded ? <ChevronUp /> : <ChevronDown />}
</button>
```
This button has no `onClick` handler. The expand/collapse behavior is controlled by the parent `<div onClick={() => setExpandedId(...)}>`. Clicking this button triggers the parent's onClick, which works — but the button itself is dead markup that does nothing. The expand icon button should have `onClick={() => setExpandedId(isExpanded ? null : alert.id)}` to make it keyboard-focusable and independently interactive. As-is, it is a visual affordance with no own handler, which is slightly misleading but not a crash.

#### BUG 3 — No error state for `/api/admin/fraud-alerts` query
Same pattern — silent fallback to simulated data.

---

## 11. `admin/layout.tsx`

**Purpose:** Persistent admin layout shell with a collapsible sidebar (10 nav items in two groups), breadcrumb header, notification bell, and user info/logout section.

### Issues Found

#### BUG 1 — `useRoute` exact-match for `/admin` will not highlight Overview when on sub-pages
**Line 29:**
```tsx
const [isActive] = useRoute(item.path);
```
`useRoute` in Wouter performs an **exact** match. When the user navigates to `/admin/orders`, the "Overview" link (`path: "/admin"`) is NOT highlighted — which is correct. But since the app uses hash-based routing (`useHashLocation`), and `useRoute` may behave differently under hash routing, this should be verified. This is a low-risk note.

#### BUG 2 — `user?.role` displayed raw without formatting
**Line 135:**
```tsx
<p className="text-[10px] text-muted-foreground capitalize">
  {user?.role || "Operations"}
</p>
```
`user.role` for admins is the string `"admin"`. With `capitalize` CSS, it displays as "Admin" — which is fine. No bug.

#### BUG 3 — No mobile/responsive sidebar handling
The sidebar is either 240px wide or 64px collapsed, but there is no mobile breakpoint behavior (no hamburger menu, no off-canvas drawer). On small screens, the sidebar and main content will be squeezed side by side. This is a layout/CSS issue: no `md:hidden` or `lg:flex` guards exist. Not a code crash, but a significant UX problem on mobile viewports.

---

## 12. `App.tsx`

**Purpose:** Root application file. Configures React Query, theme, auth, tooltip, routing (wouter hash-based), and the error boundary. Routes are split by role with `RequireAuth` guards.

### Issues Found

#### BUG 1 — `navigate` is declared but never used in `RequireAuth`
**Line 58:**
```tsx
const [, navigate] = useLocation();
```
`navigate` is destructured from `useLocation()` but never called anywhere in `RequireAuth`. The redirects all use `<Redirect to="..." />` components instead. This is a dead variable — no crash, but unused code.

#### BUG 2 — `/driver/orders` route renders `DriverDashboard` (not a dedicated orders page)
**Lines 146–148:**
```tsx
<Route path="/driver/orders">
  {() => <RequireAuth allowedRoles={["driver"]}><DriverDashboard /></RequireAuth>}
</Route>
```
The `/driver/orders` path renders the same `DriverDashboard` component as `/driver`. If there is supposed to be a separate orders list view for drivers, this is a routing bug. If intentional (dashboard handles both), the route is redundant.

#### BUG 3 — `SeedInitializer` runs on every app mount and resets all React Query cache
**Lines 254–263:**
```tsx
function SeedInitializer() {
  useEffect(() => {
    apiRequest("/api/seed", { method: "POST" })
      .then(r => r.json())
      .then(() => { queryClient.resetQueries(); })
      .catch(() => {});
  }, []);
  return null;
}
```
`queryClient.resetQueries()` clears and re-fetches ALL active queries every time the app loads (including on browser refresh). This may cause unnecessary data re-fetching and briefly flash loading states across every page after initial load. Additionally, if any page was mid-mutation, the reset could discard in-flight data. The seed endpoint is intended for development setup, not production resets.

#### BUG 4 — `ErrorBoundary` wraps `AppContent` inside `Router`, but `Router` is outside — this is correct
No issue here. The placement is valid.

---

## 13. `components/error-boundary.tsx`

**Purpose:** Class-based React error boundary that catches render errors across the component tree and displays a friendly "Something went wrong" UI with a "Try Again" reset button.

### Issues Found

#### BUG 1 — `handleReset` only clears error state; it does not retry the failed data fetch
**Lines 28–30:**
```tsx
handleReset = () => {
  this.setState({ hasError: false, error: null });
};
```
Clicking "Try Again" resets the error state and re-renders the children, but if the error was caused by a failed React Query fetch (e.g., a component immediately calls `.toFixed()` on undefined API data), the re-render will hit the same cached `undefined` value and throw again immediately, resulting in an infinite error loop. The handler should also call `queryClient.resetQueries()` or the component causing the error should be fixed to not throw on undefined data.

#### No other issues found. The boundary correctly implements `getDerivedStateFromError` and `componentDidCatch`.

---

## Summary Table

| File | Bugs Found | Severity |
|------|-----------|----------|
| `overview.tsx` | 4 | Medium, Low, Low, Low |
| `orders.tsx` | 4 | Medium, Medium, High, Medium |
| `vendors.tsx` | 4 | High, Low, Low, Low |
| `drivers.tsx` | 3 | Medium, Low, Low |
| `disputes.tsx` | 4 | Medium, Medium, Low, Low |
| `analytics.tsx` | 3 | Medium, Low, Low |
| `vendor-scoring.tsx` | 3 | Medium, Medium, Low |
| `promos.tsx` | 4 | Medium, **High** (UI bug), Low, Low |
| `financial.tsx` | 2 | Medium, Low |
| `fraud.tsx` | 3 | Medium, Low, Low |
| `layout.tsx` | 2 | Low, Medium (mobile) |
| `App.tsx` | 3 | Low, Low, Medium |
| `error-boundary.tsx` | 1 | Medium |

---

## Top Priority Fixes

1. **`orders.tsx` line 108** — `JSON.parse(order.bags || "[]")` with no try/catch. A malformed JSON string from the DB will crash every order row in the list. Wrap in try/catch.

2. **`promos.tsx` line 231** — Edit dialog uses `defaultValue` (uncontrolled) on the promo type `<Select>`. When switching between promos in the edit dialog, the type dropdown visually freezes on the first promo's type. Change to `value={field.value}`.

3. **`overview.tsx` / `orders.tsx` / `disputes.tsx`** — Repeated pattern of calling `.toFixed(2)` via optional chaining (`order.total?.toFixed(2)`), which yields the string `"undefined"` or renders nothing instead of `"$0.00"`. Replace with `(value ?? 0).toFixed(2)` throughout.

4. **`orders.tsx` line 420** — CSV export writes literal `"undefined"` for null `total` values into exported files. Use `(o.total ?? 0).toFixed(2)`.

5. **`error-boundary.tsx`** — "Try Again" re-renders children without invalidating the React Query cache, potentially immediately re-throwing the same error. Add `queryClient.resetQueries()` in `handleReset`.

6. **`fraud.tsx`** — `isPending` flag shared across all alert rows means processing one alert disables all others. Track the in-flight alert ID per mutation.

7. **`vendors.tsx` / `disputes.tsx`** — Missing error states across all data-fetching pages. Failed API calls silently show "no data" states instead of error messages.
