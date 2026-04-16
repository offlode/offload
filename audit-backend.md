# Offload Backend Audit Report

**Scope:** `server/routes.ts` (4,166 lines), `server/storage.ts` (340 lines), `shared/schema.ts` (486 lines)  
**Total endpoints:** 88 (all `/api/` prefixed)

---

## Table of Contents

1. [Critical Security Issues](#1-critical-security-issues)
2. [Authentication & Authorization](#2-authentication--authorization)
3. [Financial Engine Bugs](#3-financial-engine-bugs)
4. [Loyalty & Referral System Bugs](#4-loyalty--referral-system-bugs)
5. [Order Lifecycle Issues](#5-order-lifecycle-issues)
6. [Pricing Engine Issues](#6-pricing-engine-issues)
7. [Missing Error Handling / Crash Risk](#7-missing-error-handling--crash-risk)
8. [Route Conflicts](#8-route-conflicts)
9. [Data Integrity & Logic Bugs](#9-data-integrity--logic-bugs)
10. [Performance Issues](#10-performance-issues)
11. [Storage Layer Assessment](#11-storage-layer-assessment)
12. [Schema Assessment](#12-schema-assessment)
13. [Missing Endpoints](#13-missing-endpoints)
14. [Summary Table](#14-summary-table)

---

## 1. Critical Security Issues

### 1.1 — Plaintext Password Storage
**Location:** `storage.ts` createUser, `routes.ts` `/api/auth/register` and `/api/auth/login`  
**Severity:** Critical

Passwords are stored and compared as plaintext. No hashing (bcrypt, argon2, etc.) is applied anywhere. The login check is `user.password !== password` — a direct string comparison.

```ts
// routes.ts:1801
if (!user || user.password !== password) {
```

### 1.2 — No Authentication Middleware Used Anywhere
**Location:** All route handlers  
**Severity:** Critical

`requireAuth()` is defined (line 745) but **never called on any route**. Every single endpoint — including admin, financial, and payout routes — is completely unauthenticated. Any user can call `/api/admin/metrics`, `/api/admin/financial`, `/api/vendor-payouts`, or modify any other user's data.

### 1.3 — Unrestricted User Profile Read/Write
**Location:** `GET /api/users/:id` (line 1822), `PATCH /api/users/:id` (line 1828)  
**Severity:** Critical

Any caller can read any user's profile (phone, email, loyalty points, subscription tier, etc.) or update any user's data by providing an arbitrary `:id`. No ownership or role check.

### 1.4 — Unrestricted Order Data Access
**Location:** `GET /api/orders` (line 1948), `GET /api/orders/:id` (line 1964)  
**Severity:** Critical

`GET /api/orders?customerId=X` returns the full order history for any customer ID without verifying the caller is that customer. `GET /api/orders/:id` returns the enriched order object (including driver phone number, customer phone number) for any order ID.

### 1.5 — Unrestricted Address and Payment Method Deletion
**Location:** `DELETE /api/addresses/:id` (line 2610), `DELETE /api/payment-methods/:id` (line 2643)  
**Severity:** Critical

No ownership verification. Any caller can delete any address or payment method by ID.

```ts
app.delete("/api/addresses/:id", (req, res) => {
  storage.deleteAddress(Number(req.params.id));
  res.json({ success: true });
});
```

### 1.6 — Unrestricted Address Update
**Location:** `PATCH /api/addresses/:id` (line 2601)  
**Severity:** High

The endpoint reads `req.body.userId` to unset other default addresses but does not check whether the caller owns the address being updated. An attacker can update any user's address by address ID.

### 1.7 — Admin Endpoints Exposed Without Auth
**Location:** `/api/admin/*` routes (lines 3221–4006)  
**Severity:** Critical

All admin routes are public:
- `GET /api/admin/metrics` — full platform revenue and order statistics
- `GET /api/admin/financial` — vendor payout breakdown
- `GET /api/admin/users` — all user records (password field is stripped, but all other PII is exposed)
- `GET /api/admin/fraud-scan` — exposes internal fraud scoring for all active orders
- `POST /api/admin/promos` — any caller can create promo codes
- `DELETE /api/admin/promos/:id` — any caller can deactivate promo codes
- `PATCH /api/vendor-payouts/:id` — any caller can mark a payout "completed"

### 1.8 — Hardcoded Default Password for Driver Accounts
**Location:** `POST /api/drivers` (line 1887–1900)  
**Severity:** High

When an admin creates a driver via the API, the generated user account always has password `"driver123"`. There is no mechanism to force a password change on first login.

```ts
storage.createUser({
  username: req.body.name.toLowerCase().replace(/\s/g, "_") + "_driver",
  password: "driver123",
  ...
});
```

---

## 2. Authentication & Authorization

### 2.1 — Demo Login Endpoint in Production Code
**Location:** `POST /api/auth/demo-login` (line 1810)  
**Severity:** Medium

A login endpoint that authenticates by username only (no password) is registered unconditionally. It is intended for demo use but has no environment guard; it will be active in production.

### 2.2 — Role Escalation via PATCH /api/users/:id
**Location:** `PATCH /api/users/:id` (line 1828)  
**Severity:** Critical

The endpoint passes `req.body` directly to `storage.updateUser()`. Any caller can change their own (or any user's) `role` field from `"customer"` to `"admin"` with a single PATCH request.

### 2.3 — Referral Code Search Only Covers Customers
**Location:** `POST /api/auth/register` (line 1721), `POST /api/referrals/apply` (line 3105)  
**Severity:** Low

When validating a referral code during registration or via `/api/referrals/apply`, the code only searches `getUsersByRole("customer")`. If the referrer has role `"driver"`, `"laundromat"`, or `"manager"` (all of whom have referral codes assigned in seed data), their code will never be found.

---

## 3. Financial Engine Bugs

### 3.1 — Vendor Payout Rate Ignored (Hardcoded 65%)
**Location:** `calculatePayouts()` (line 203)  
**Severity:** High

Each vendor has a configurable `payoutRate` field in the schema (default 0.65, but overridable). `calculatePayouts()` hardcodes 0.65 regardless:

```ts
function calculatePayouts(order: Order) {
  const vendorPayout = Math.round((order.subtotal || 0) * 0.65 * 100) / 100; // always 65%
  const driverPayout = 8.50 * 2; // always $17
}
```

The `vendor.payoutRate` field is never used in payout calculations.

### 3.2 — Driver Payout Hardcoded, Ignores payoutPerTrip
**Location:** `calculatePayouts()` (line 204)  
**Severity:** Medium

Driver payout is always `8.50 * 2 = $17.00`, ignoring the `driver.payoutPerTrip` field. Drivers with a different rate will be incorrectly paid.

### 3.3 — processPaymentCapture Overwrites Previously Set vendorPayout/driverPayout
**Location:** `processPaymentCapture()` (line 208), called from `PATCH /api/orders/:id/status` on delivery (line 2238)  
**Severity:** High

When an order is delivered, `processPaymentCapture(order)` is called with the **original** order object (fetched before the `updateData` is applied). This function recalculates and overwrites `vendorPayout` and `driverPayout` on the order record, discarding any adjustments made via consent-based additional charges (which are only added to `subtotal`/`total` — not reflected in a payout recalc). The recalculated payout is based on a stale `order.subtotal`.

### 3.4 — Consent Approval Recalculates Total Without Discount or Tip
**Location:** `PATCH /api/consents/:id` (line 2691), charge approval block (line 2716)  
**Severity:** Medium

When a consent with `additionalCharge > 0` is approved, the new total is calculated as:

```ts
const newTotal = newSubtotal + newTax + (order.deliveryFee || 0);
```

This formula omits `order.discount` and `order.tip`, causing the new total to be inflated by the amount of any previously applied discount (promo code, loyalty redemption).

**Fix:** `newTotal = newSubtotal + newTax + (order.deliveryFee || 0) - (order.discount || 0) + (order.tip || 0)`

### 3.5 — Promo usedCount Incremented Before Order Is Confirmed
**Location:** `POST /api/orders` (line 2031)  
**Severity:** Medium

The promo code usage counter is incremented at line 2031 before the order is fully created. If `storage.createOrder()` subsequently throws, the promo usage count has been permanently incremented but no order was created. The customer effectively "burns" a use of a limited-use promo.

### 3.6 — Loyalty Points Deducted Before Order Is Confirmed
**Location:** `POST /api/orders` (line 2041–2050)  
**Severity:** Medium

Similarly, `storage.updateUser(customerId, { loyaltyPoints: ... })` is called to deduct redeemed points before the order creation succeeds. If order creation fails, the points are permanently lost.

### 3.7 — platformFee Field Never Populated on Order Record
**Location:** Schema `orders.platformFee` field; `processPaymentCapture()` (line 208)  
**Severity:** Low

The `orders` table has a `platformFee` column (line 202 of schema), but `processPaymentCapture()` never writes it. The financial report endpoint derives platform revenue by subtraction, but the per-order `platformFee` field stays at 0.

---

## 4. Loyalty & Referral System Bugs

### 4.1 — Subscription pointsBonus Multiplied on Top of Tier Multiplier (Double Multiply)
**Location:** `awardLoyaltyPoints()` (line 256)  
**Severity:** Medium

Points calculation is:

```ts
const pointsEarned = Math.floor(basePoints * tierMultiplier);
const finalPoints  = Math.floor(pointsEarned * subscriptionBonus);
```

The subscription bonus is a separate multiplier applied on top of the tier multiplier. For a Gold (1.5×) + Premium (2.0×) user, the effective multiplier is 3.0×. This compounds multiplicatively rather than additively, which may be intentional, but the transaction description only reports the tier multiplier (`× 1.5x tier multiplier`) — it does not mention the subscription bonus, making the ledger entry inaccurate.

### 4.2 — Referral Reward Inconsistency (100 pts vs 1,000 pts)
**Location:** Referral completion in `PATCH /api/orders/:id/status` (line 2261–2290)  
**Severity:** Medium

When a referred user completes their first order:
- The referrer is awarded **1,000 points** (worth $10)
- The referee is also awarded **1,000 points** (worth $10)

But the referral record has `referrerReward: 10` and `refereeReward: 10` (dollar amounts stored). The notification tells the referrer "you'll earn 1,000 points" (correct), but the schema field `referrerReward = 10` is misleading and inconsistent. The `referrals` table stores dollar amounts that are never used — actual rewards are always the hardcoded 1,000 points.

### 4.3 — loyaltyPointsRedeemed Set Twice in POST /api/orders
**Location:** `POST /api/orders` (lines 2084 and 2100)  
**Severity:** Low

`loyaltyPointsRedeemed` is set in the `createOrder()` call at line 2084, then `storage.updateOrder(order.id, { loyaltyPointsRedeemed })` is called again at line 2100. The second write is redundant but harmless.

### 4.4 — Referral Reward Only Triggers Once Per Customer, Not Per "First Order"
**Location:** `PATCH /api/orders/:id/status`, delivery handling (line 2241)  
**Severity:** Medium

The referral completion check looks for a referral where `r.refereeId === order.customerId && r.status === "pending"`. After completion it is set to `"rewarded"`. However, if the same customer is somehow entered into the referral system twice (e.g., via `/api/auth/register` and then `/api/referrals/apply`), duplicate referral records could be created and both could be rewarded on the same order delivery.

### 4.5 — Loyalty Tier Not Rechecked on Point Deduction
**Location:** `POST /api/loyalty/redeem` (line 3014), `POST /api/orders` (line 2041)  
**Severity:** Low

When loyalty points are redeemed (balance reduced), the user's `loyaltyTier` is not re-evaluated. A user who redeems enough points to fall below a tier threshold retains the higher tier indefinitely.

---

## 5. Order Lifecycle Issues

### 5.1 — `quality_check` Status in Schema But Not in validTransitions
**Location:** `validTransitions` (line 726); schema comment at line 168  
**Severity:** Medium

The schema comment documents `quality_check` as a valid order status between `wash_complete` and `packing`. It is absent from `validTransitions`:

```ts
wash_complete: ["packing"],  // quality_check is skipped entirely
```

Orders cannot be transitioned to `quality_check` via the status endpoint. The `qualityCheckedAt` timestamp column in the schema is effectively unreachable through normal order flow. Any frontend that renders a `quality_check` status step will show an order stuck with no valid transition.

### 5.2 — Driver Freed Twice on Order Delivery
**Location:** `PATCH /api/orders/:id/status`, delivery block (line 2353 and line 2366)  
**Severity:** Low (cosmetic)

When status transitions to `"delivered"`, the pickup driver (`order.driverId`) is freed via `storage.updateDriver(driver.id, { status: "available" })`. However, `processPaymentCapture()` was already called (line 2238) and it also increments `driver.completedTrips`. The driver status update itself is only done once (in the post-`delivered` block), but `completedTrips` is incremented inside `processPaymentCapture` while the driver is freed in the outer block — leading to an extra `+1` on `completedTrips` every time an order is delivered, regardless of whether the same driver did both pickup and delivery.

Specifically: the **return driver** (`order.returnDriverId`) is never freed when `status === "delivered"`. Only `order.driverId` (pickup driver) is freed. If they are different drivers, the return driver stays in `"busy"` status permanently.

### 5.3 — Cancel via PATCH /api/orders/:id/status Does Not Restore Resources
**Location:** `PATCH /api/orders/:id/status`, cancel block (line 2270)  
**Severity:** Medium

The `/api/orders/:id/status` endpoint handles the `"cancelled"` transition (which is allowed from `pending`, `confirmed`, and `driver_assigned` per `validTransitions`). This code sets `paymentStatus: "refunded"` and releases vendor capacity and driver status. However, it does **not** restore redeemed loyalty points, unlike `POST /api/orders/:id/cancel` (line 2399) which does restore them.

There are now two cancel paths with different behavior:
- `POST /api/orders/:id/cancel` — restores loyalty points, releases resources
- `PATCH /api/orders/:id/status` with `status: "cancelled"` — does NOT restore loyalty points

### 5.4 — Pending Order Has No vendorId, But Fraud Check Uses Order Fields
**Location:** `calculateFraudRisk()` (line 570), called at order creation  
**Severity:** Low

Fraud risk is computed immediately at order creation before vendor assignment. The `order.preferences` field is parsed inside `scoreVendor()` (which is called from `findBestVendor()`). If `order.preferences` is a malformed JSON string, `JSON.parse()` will throw inside the scoring loop with no try/catch, crashing the order creation flow.

### 5.5 — PATCH /api/orders/:id Allows Unrestricted Field Overwrites
**Location:** Line 2392  
**Severity:** High

```ts
app.patch("/api/orders/:id", (req, res) => {
  const updated = storage.updateOrder(Number(req.params.id), req.body);
  ...
});
```

Any caller can overwrite any field on any order — `total`, `paymentStatus`, `status`, `vendorPayout`, `loyaltyPointsEarned`, etc. — without any validation, auth, or field whitelist.

---

## 6. Pricing Engine Issues

### 6.1 — Surge Pricing Applied to Subtotal But Discount Applied to surgeTotal
**Location:** `POST /api/orders` (line 2003–2020)  
**Severity:** Low (correct behavior, but confusing)

The surge multiplier and demand multiplier are applied to the base subtotal to produce `surgeSubtotal`. The total before discount (`surgeTotal`) includes surged subtotal + surged tax + delivery fee. Promo percentage discounts are then applied to `surgeTotal` (the full surged amount), which means a 20% promo on a surge order discounts the surged price rather than the base price. This may or may not be the intended behavior, but it is undocumented.

### 6.2 — Promo validate Returns discountAmount = 0 for free_delivery
**Location:** `POST /api/promo/validate` (line 3169)  
**Severity:** Medium

For `free_delivery` type promo codes, `discountAmount` is calculated as 0 (no delivery fee lookup happens in the validate endpoint — it would require knowing the delivery speed). The frontend likely uses `discountAmount` to show a preview discount value. For free-delivery promos this will always show "$0.00 off", potentially confusing users. The actual discount is correctly applied during order creation (line 2037), but validation gives no dollar amount.

### 6.3 — Surge Pricing Holiday List Hardcoded to 2026
**Location:** `US_HOLIDAYS_2026` (line 332)  
**Severity:** Low

The holiday surge list is a hardcoded array of 2026 dates. It will silently stop applying holiday surges after December 2026 with no error or warning.

### 6.4 — calculatePricing Does Not Guard Against Empty Bags Array
**Location:** `calculatePricing()` (line 44)  
**Severity:** Low

If `bags` is an empty array `[]`, `subtotal` is 0 and the function returns a $0 order. There is no minimum order validation at the pricing or order creation level.

---

## 7. Missing Error Handling / Crash Risk

### 7.1 — JSON.parse Without try/catch in Hot Paths
**Location:** Multiple  
**Severity:** High

The following calls can throw `SyntaxError` if the stored or submitted value is malformed JSON:

| Line | Location | Field parsed |
|------|----------|-------------|
| 84 | `scoreVendor()` | `order.preferences` |
| 85 | `scoreVendor()` | `vendor.capabilities` |
| 615 | `calculateFraudRisk()` | `order.bags` |
| 2929 | `POST /api/pricing/calculate` | `bags` (from request body) |
| 2940 | `GET /api/pricing/estimate` | `bags` (from query string) |
| 3304 | `POST /api/chat/message` | `session.messagesJson` |

Lines 84 and 85 are called from `scoreVendor()` which is called from `findBestVendor()`, which is called from `POST /api/orders`. A malformed `capabilities` or `preferences` JSON in the database will crash every new order creation.

Line 615 in `calculateFraudRisk()` has a `try/catch` wrapper, but lines 84/85 above it do not.

### 7.2 — Unsafe Non-Null Assertion in calculatePredictiveETA
**Location:** `calculatePredictiveETA()` (line 658)  
**Severity:** Low

```ts
? distanceMiles(addr.lat, addr.lng!, vendor.lat, vendor.lng!)
```

`addr.lng` and `vendor.lng` are nullable `real` columns in the schema. The `!` assertion suppresses TypeScript's null check but will cause `distanceMiles` to receive `null` values at runtime if coordinates are missing, producing `NaN` in the ETA calculation. The ETA phases will contain `NaN` minutes and invalid `estimatedAt` timestamps.

### 7.3 — POST /api/pricing/calculate Has No Error Handling
**Location:** Line 2927  
**Severity:** Medium

```ts
app.post("/api/pricing/calculate", (req, res) => {
  const { bags, deliverySpeed } = req.body;
  const parsedBags = typeof bags === "string" ? JSON.parse(bags) : bags;
  res.json(calculatePricing(parsedBags, deliverySpeed));
});
```

If `bags` is a malformed JSON string, this crashes with an unhandled `SyntaxError`. No try/catch, no 400 response.

### 7.4 — GET /api/pricing/estimate Has No Validation
**Location:** Line 2937  
**Severity:** Medium

`bags` is taken directly from the query string and passed to `JSON.parse()` inside a try/catch (correct), but if `bags` is not provided, `parsedBags` defaults to `[{ type: "medium", quantity: 1 }]` — silently producing a pricing estimate for a default bag, which may not be what the frontend expects. No 400 is returned for missing required params.

### 7.5 — Only 4 try/catch Blocks for 88 Endpoints
The only routes with try/catch are:
- `POST /api/orders` (line 1987)
- `GET /api/pricing/estimate` (line 2937, partial)
- `POST /api/seed` (line 852)
- Fraud bag parsing (line 614)

All other endpoints — including status transitions, intake, output-weight, consent, disputes, etc. — have no error handling. A database failure or unexpected null dereference will return an Express 500 with a stack trace.

---

## 8. Route Conflicts

### 8.1 — GET /api/drivers/user/:userId Shadowed by GET /api/drivers/:id
**Location:** Lines 1871, 1877  
**Severity:** High

Routes are registered in this order:

```ts
app.get("/api/drivers/:id", ...)        // line 1871 — registered first
app.get("/api/drivers/user/:userId", ...)  // line 1877 — never reached
```

Express matches routes in registration order. A request to `GET /api/drivers/user/5` will be matched by `/api/drivers/:id` (with `req.params.id = "user"`), which calls `storage.getDriver(NaN)` and returns 404. The `/api/drivers/user/:userId` route is **completely unreachable**.

**Fix:** Register `GET /api/drivers/user/:userId` before `GET /api/drivers/:id`.

### 8.2 — GET /api/orders/active Is Safe (Registered After /api/orders)
**Location:** Lines 1948, 1960  
`GET /api/orders/active` is correctly registered after `GET /api/orders` (which has no `:id` segment), so there is no conflict here. However `GET /api/orders/active` is registered before `GET /api/orders/:id`, so this is fine.

---

## 9. Data Integrity & Logic Bugs

### 9.1 — updatedAt Not Maintained on Order Updates
**Location:** All `storage.updateOrder()` calls after initial creation  
**Severity:** Low

The `orders.updatedAt` field is set at creation time (line 2087) but none of the subsequent `storage.updateOrder()` calls (status transitions, intake, output, consent charge, etc.) include `updatedAt: now()`. This makes the `updatedAt` column unreliable as an audit field.

### 9.2 — POST /api/drivers Creates User Without Email Validation
**Location:** Line 1887  
**Severity:** Medium

The created user's email defaults to a synthetic value `name@offload.com` if not provided. No uniqueness check on the synthetic email is performed, so adding two drivers with the same name will fail with a database unique constraint error (unhandled, returns a 500).

### 9.3 — POST /api/drivers Passes Full req.body to createDriver (Mass Assignment)
**Location:** Line 1897  
**Severity:** Medium

```ts
const driver = storage.createDriver({
  ...req.body,  // spread of unvalidated request body
  userId: driverUser.id,
});
```

An attacker can set any driver field (e.g., `totalEarnings`, `payoutPerTrip`, `completedTrips`) to an arbitrary value through the request body.

### 9.4 — Subscription Cancel Sets subscriptionTier to null But Doesn't Clear startDate
**Location:** `DELETE /api/subscription/:userId` (line 3745)  
**Severity:** Low

The cancel endpoint sets `subscriptionTier: null` and `subscriptionEndDate: now()`. The `subscriptionStartDate` is not cleared. On re-subscribe, the start date won't reflect the new subscription period unless overwritten by `/api/subscription/upgrade`.

### 9.5 — Admin Analytics Uses Math.random() for Revenue-by-Day Data
**Location:** `GET /api/admin/analytics` (line 3863)  
**Severity:** Medium

The `revenueByDay` array is computed with `Math.random()`:

```ts
const factor = 0.5 + Math.random() * 1.0;
return {
  day,
  revenue: Math.round(totalRevenue * factor * 0.3 * 100) / 100,
  orders: Math.max(1, Math.round(allOrders.length * factor * 0.2)),
};
```

Every call to this endpoint returns different numbers. This is described as "simulated" in a comment, but the endpoint is live and being called by the analytics dashboard. Dashboard charts will flicker/change on every page load.

### 9.6 — Admin Financial monthlyTrend Also Uses Math.random()
**Location:** `GET /api/admin/financial` (line 3955)  
**Severity:** Medium

Same issue as 9.5. Monthly trend data uses `Math.random()` for simulation. Every load returns different historical revenue figures.

### 9.7 — Weight Discrepancy Consent Type Hardcoded as "overweight"
**Location:** `POST /api/orders/:id/output-weight` (line 2541)  
**Severity:** Low

The consent type is always `"overweight"` even when `output < intake` (i.e., items were lost). A weight loss discrepancy should generate a consent type like `"weight_loss"` or `"possible_missing_items"`, not `"overweight"`.

### 9.8 — Referral Apply Endpoint Calls updateUser Twice Sequentially
**Location:** `POST /api/referrals/apply` (lines 3141–3148)  
**Severity:** Low

```ts
storage.updateUser(Number(userId), { referredBy: referrer.id });
storage.updateUser(Number(userId), { loyaltyPoints: (user.loyaltyPoints || 0) + 100 });
```

The second call uses `user.loyaltyPoints` from the originally fetched user object, not the post-first-update state. These are two separate writes that could be a single call. If another concurrent request modifies `loyaltyPoints` between these two calls, the second write will overwrite the change.

---

## 10. Performance Issues

### 10.1 — GET /api/admin/fraud-alerts Is O(n²)
**Location:** Line 3599  
**Severity:** Medium

`calculateFraudRisk(order.id)` is called for **every order** in the database. Each call itself calls `storage.getOrdersByCustomer()`, `storage.getAddressesByUser()`, and `storage.getUser()` — three additional database queries per order. For 1,000 orders, this endpoint makes ~4,000 DB queries per request. No pagination is implemented.

### 10.2 — GET /api/admin/vendor-scores Writes to DB On Each Read
**Location:** Line 3387  
**Severity:** Medium

```ts
storage.updateVendor(vendor.id, { aiHealthScore: health.score });
```

The vendor score endpoint updates every vendor's `aiHealthScore` on every GET request. This is a side effect on a read endpoint.

### 10.3 — GET /api/admin/metrics Loads All Orders, Users, Vendors, Drivers
**Location:** Line 3775  
**Severity:** Medium

No filtering, pagination, or caching. All rows are loaded into memory on every dashboard refresh.

---

## 11. Storage Layer Assessment

`storage.ts` is a thin wrapper over Drizzle/better-sqlite3. Overall clean and functional. Issues:

### 11.1 — searchUsers Vulnerable to LIKE Injection
**Location:** `storage.ts` line 123  
**Severity:** Low (SQLite parameterized queries mitigate most risk, but)

```ts
or(like(schema.users.name, `%${query}%`), like(schema.users.email, `%${query}%`))
```

Drizzle's `like()` does not escape `%` or `_` wildcard characters in the user-supplied `query`. A query containing `%` will match everything; a query of `_` will match any single-character string. This is a wildcard injection, not SQL injection (Drizzle parameterizes values), but it can cause unintended data exposure.

### 11.2 — getDriverStats Uses Only driverId Orders (Misses returnDriverId)
**Location:** `storage.ts` line 167  
**Severity:** Low

`getDriverStats()` queries orders where `driverId = id`. It does not include orders where `returnDriverId = id` (delivery leg). However, `getOrdersByDriver()` does include both. Driver stats will undercount completed deliveries for return drivers.

### 11.3 — No Transactions Used Anywhere
**Location:** All multi-step operations  
**Severity:** Medium

Multi-step operations (order creation, payout processing, loyalty point adjustments) involve multiple separate `storage.*` calls with no wrapping database transaction. A crash or error mid-sequence will leave the database in a partial state (e.g., promo usage incremented but order not created; vendor load incremented but driver not assigned).

---

## 12. Schema Assessment

Schema is well-structured with appropriate types. Issues:

### 12.1 — orders.bags is text (JSON) with No Validation
The `bags` column stores raw JSON. No schema-level or application-level validation ensures it is valid JSON or has the expected shape before being stored. Bad data here would cascade to pricing, fraud, and ETA calculations.

### 12.2 — `quality_check` Status Is Documented But Unreachable
As noted in §5.1, `quality_check` is in the schema comment as a valid status but not in `validTransitions` and has no timestamp field (`qualityCheckedAt` exists). The field exists but is unreachable through API flow.

### 12.3 — Integer Boolean Fields (isDefault, certified, etc.)
The schema uses `integer` for boolean fields (`isDefault`, `certified`, `weightDiscrepancy`, `isReorder`, etc.) with values 0/1. This is correct for SQLite but TypeScript types expose these as `number` not `boolean`, requiring `=== 1` checks rather than truthy comparisons. Several route handlers use `if (order.certifiedOnly)` which would be truthy for any nonzero integer — but `vendor.certified` is compared as `vendor.certified === 1` in `findBestVendor()`. Inconsistent boolean comparison patterns throughout the codebase.

---

## 13. Missing Endpoints

All 88 endpoints referenced in the frontend grep list are implemented in `routes.ts`. No missing endpoints were found. However, two endpoint pairs have behavioral issues that may break frontend consumers:

- **`GET /api/drivers/user/:userId`** is unreachable due to the route conflict in §8.1. The frontend call to this endpoint will always return 404 (the `:id` route handles it as `NaN`).
- **`POST /api/admin/fraud-alerts/:alertId/clear`** and **`/escalate`** are stub endpoints that return `{ success: true }` without persisting any state. The frontend may show "cleared" or "escalated" status that disappears on next load.

---

## 14. Summary Table

| # | Issue | Severity | Category |
|---|-------|----------|----------|
| 1.1 | Plaintext password storage | **Critical** | Security |
| 1.2 | `requireAuth` defined but never used | **Critical** | Security |
| 1.3 | Unrestricted user profile read/write | **Critical** | Security |
| 1.4 | Unrestricted order data access | **Critical** | Security |
| 1.5 | Unrestricted address/payment deletion | **Critical** | Security |
| 1.6 | Address PATCH no ownership check | **High** | Security |
| 1.7 | All admin endpoints unauthenticated | **Critical** | Security |
| 1.8 | Hardcoded driver password `"driver123"` | **High** | Security |
| 2.1 | Demo login active in production | **Medium** | Security |
| 2.2 | Role escalation via PATCH /api/users/:id | **Critical** | Security |
| 2.3 | Referral code search only covers customers | **Low** | Logic |
| 3.1 | Vendor `payoutRate` field ignored | **High** | Finance |
| 3.2 | Driver `payoutPerTrip` field ignored | **Medium** | Finance |
| 3.3 | `processPaymentCapture` uses stale order data | **High** | Finance |
| 3.4 | Consent charge recalc omits discount/tip | **Medium** | Finance |
| 3.5 | Promo `usedCount` incremented before order creation | **Medium** | Finance |
| 3.6 | Loyalty points deducted before order creation | **Medium** | Finance |
| 3.7 | `platformFee` field never populated | **Low** | Finance |
| 4.1 | Subscription bonus compounds tier multiplier (undocumented) | **Medium** | Loyalty |
| 4.2 | Referral reward schema vs actual points inconsistency | **Medium** | Loyalty |
| 4.3 | `loyaltyPointsRedeemed` set twice in order creation | **Low** | Logic |
| 4.4 | Duplicate referral records could double-reward | **Medium** | Loyalty |
| 4.5 | Tier not downgraded when points are redeemed | **Low** | Loyalty |
| 5.1 | `quality_check` status unreachable in validTransitions | **Medium** | Order Flow |
| 5.2 | Return driver never freed on delivery | **Medium** | Order Flow |
| 5.3 | Cancel via status endpoint doesn't restore loyalty points | **Medium** | Order Flow |
| 5.4 | JSON.parse in `scoreVendor()` can crash order creation | **High** | Crash Risk |
| 5.5 | PATCH /api/orders/:id allows unrestricted field overwrites | **High** | Security |
| 6.1 | Surge applied before discount (may be intentional) | **Low** | Pricing |
| 6.2 | `free_delivery` promo shows $0 discount in validate | **Medium** | Pricing |
| 6.3 | Holiday list hardcoded to 2026 | **Low** | Pricing |
| 6.4 | No minimum order amount validation | **Low** | Pricing |
| 7.1 | JSON.parse without try/catch in `scoreVendor()` and `calculateFraudRisk()` | **High** | Crash Risk |
| 7.2 | Unsafe `!` non-null assertion in ETA calculation | **Low** | Crash Risk |
| 7.3 | `POST /api/pricing/calculate` no error handling | **Medium** | Crash Risk |
| 7.4 | `GET /api/pricing/estimate` no param validation | **Medium** | API |
| 7.5 | Only 4 try/catch blocks for 88 endpoints | **High** | Crash Risk |
| 8.1 | `GET /api/drivers/user/:userId` unreachable (shadowed by `:id`) | **High** | Route Conflict |
| 9.1 | `updatedAt` not maintained after order updates | **Low** | Data Integrity |
| 9.2 | Driver creation with duplicate synthetic email crashes | **Medium** | Data Integrity |
| 9.3 | Mass assignment in `POST /api/drivers` | **Medium** | Security |
| 9.4 | Subscription cancel doesn't clear startDate | **Low** | Data Integrity |
| 9.5 | Analytics `revenueByDay` uses `Math.random()` | **Medium** | Logic |
| 9.6 | Financial `monthlyTrend` uses `Math.random()` | **Medium** | Logic |
| 9.7 | Weight discrepancy always typed "overweight" | **Low** | Logic |
| 9.8 | `referrals/apply` calls `updateUser` twice sequentially | **Low** | Logic |
| 10.1 | Fraud-alerts endpoint is O(n²) in DB queries | **Medium** | Performance |
| 10.2 | `GET /api/admin/vendor-scores` writes DB on every read | **Medium** | Performance |
| 10.3 | Admin metrics loads all data with no pagination | **Medium** | Performance |
| 11.1 | `searchUsers` wildcard injection via `LIKE` | **Low** | Security |
| 11.2 | `getDriverStats` misses `returnDriverId` orders | **Low** | Logic |
| 11.3 | No database transactions on multi-step operations | **Medium** | Data Integrity |
| 13.1 | `GET /api/drivers/user/:userId` frontend call always 404s | **High** | API |
| 13.2 | Fraud alert clear/escalate are stubs (no persistence) | **Medium** | API |

**Total issues found: 52**  
- Critical: 6  
- High: 11  
- Medium: 22  
- Low: 13
