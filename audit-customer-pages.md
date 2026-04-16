# Offload — Customer Pages Audit

**Audited:** 12 customer-facing pages  
**Scope:** Variables, API field mismatches, null/undefined safety, incorrect render types, error/loading states, route paths, Tailwind CSS, data-testid attributes

---

## 1. `home.tsx`

**Summary:** The main entry point for the app. Shows a landing page for logged-out users and a personalized dashboard for authenticated users — including a hero CTA, active order banner, top vendor card, wash style cards, quick action shortcuts, and a recent orders list.

### Issues Found

1. **Unused imports — `Bell` and `Zap`** (line 6)  
   Both `Bell` and `Zap` are imported from `lucide-react` but never used in any JSX. `NotificationBell` is used instead of `Bell`, and `Zap` is not referenced anywhere. These should be removed to avoid dead imports.

2. **Potential null render crash — `order.total?.toFixed(2)`** (line 361)  
   `order.total` uses optional chaining (`?.`), which means if `total` is `null` or `undefined`, the expression returns `undefined`. This renders as nothing (blank) rather than crashing, but the `$` prefix will still appear — resulting in `$` with no number. The same pattern exists in `orders.tsx`. A fallback like `(order.total ?? 0).toFixed(2)` is safer.

---

## 2. `orders.tsx`

**Summary:** Displays all orders for the authenticated user with filter tabs (All / Active / Done / Cancelled). Each order shows a progress bar, status badge, and action buttons. Supports in-list messaging via a bottom sheet and order cancellation via a confirmation dialog.

### Issues Found

1. **Unused imports — `Filter` and `ArrowDownCircle`** (line 6)  
   Both icons are imported but never used in JSX anywhere in the file. Dead imports.

2. **`CANCELLABLE` status list differs from `order-detail.tsx`** (line 41 vs order-detail line 70)  
   `orders.tsx` defines `CANCELLABLE = ["pending", "confirmed", "driver_assigned"]`, while `order-detail.tsx` includes `"pickup_in_progress"` in its list. This means the Cancel button appears on a `pickup_in_progress` order in the detail view but not in the list view — inconsistent UX.

3. **Potential null render — `order.total?.toFixed(2)`** (line 241)  
   Same issue as `home.tsx` — `undefined` result still prints a bare `$`.

4. **Message query `queryFn` returns early with `[]` if `messageSheet` is falsy** (line 87–88)  
   The `queryFn` has an early return for `if (!messageSheet) return []` but the query is already gated with `enabled: !!messageSheet`. The early-return guard is redundant but harmless; however, if the order `id` is `0` (falsy), messages would silently return an empty array even when the sheet is open.

---

## 3. `order-detail.tsx`

**Summary:** Full order detail view including timeline of events, vendor and driver info, order summary with pricing, weight info, consent requests, payment/SLA status cards, review prompts, and actions for cancellation, dispute filing, messaging, and support.

### Issues Found

1. **Support dialog submits no API request** (lines 853–862)  
   The "Contact Support" dialog collects a message and shows a success toast, but the `onClick` handler only closes the dialog and clears state — it never calls any API endpoint. The message is silently discarded. A real support submission mutation is missing.

2. **`event.details` rendered via `String(val)` without type check for objects** (line 629)  
   When expanding an event's JSON details, values are rendered with `{String(val)}`. If any detail value is a nested object, `String(val)` produces `"[object Object]"` in the UI. Should use `JSON.stringify(val, null, 2)` as a fallback for non-primitive values.

3. **`CANCELLABLE` list includes `"pickup_in_progress"`** (line 70) — inconsistent with `orders.tsx` (see issue #2 in that file).

---

## 4. `loyalty.tsx`

**Summary:** Displays the user's loyalty tier, points balance, current perks, a points redemption slider, and a transaction history list. Supports redeeming points for account credit.

### Issues Found

**No issues found.** The component correctly uses optional chaining and null-coalescing throughout. API shape matches the `LoyaltyData` type definition. The `LOYALTY_TIERS` config used for perks is local and not dependent on API shape. Loading states are present.

---

## 5. `referrals.tsx`

**Summary:** Shows the user's referral code, sharing tools (copy code, copy link, native share), impact stats, and a list of past referrals with their statuses and earned rewards.

### Issues Found

**No issues found.** The `refereeName` field expected by the component is correctly computed and returned by the `/api/referrals/:userId` endpoint (the server enriches each referral with the referee's user name). `referrerReward.toFixed(2)` is only called after status check guards so it cannot be called on an undefined value.

---

## 6. `chat.tsx`

**Summary:** An AI chat interface with a message list, typing indicator, quick action buttons, and a message input form. Sends messages to `/api/chat/message` and renders responses as chat bubbles.

### Issues Found

**No issues found.** Error handling falls back gracefully to an in-chat error bubble rather than an uncaught crash. The component handles loading state (`isTyping`) and the auto-scroll effect is correctly wired. `data-testid` attributes are present on all interactive elements.

---

## 7. `profile.tsx`

**Summary:** Account hub page showing user info, stats (orders, spend, rating), quick navigation cards, and settings sections for account info, addresses, payments, notifications, wash preferences, help (FAQ accordion), and sign-out. Includes a light/dark theme toggle.

### Issues Found

1. **`useAuth` is never imported or used** — all data queries are hardcoded to `userId=1`  
   The page fetches `/api/users/1`, `/api/addresses?userId=1`, `/api/payment-methods?userId=1`, and `/api/orders?customerId=1`. It does not import `useAuth` or use the authenticated user's actual ID. This means every customer sees user #1's data regardless of who is logged in.

2. **Sign-out does not call `logout()` from auth context** (lines 581–590)  
   The "Sign Out" confirmation button only calls `navigate("/")` and shows a toast. It does not call the `logout()` function from `AuthContext`, so the user's session (`user` state) is never cleared. The user remains authenticated in memory and can navigate back to protected pages without re-logging-in.

3. **Mutation endpoint hardcoded to `/api/users/1`** (lines 118, 129)  
   `updateUserMutation` PATCHes `/api/users/1` regardless of the authenticated user, same root cause as issue #1.

4. **"Admin Dashboard" link exposed to all customers** (lines 336–341)  
   The Settings → Support section renders an "Admin Dashboard" link that navigates to `/admin` for any user. There is no role check to hide this from non-admin users.

---

## 8. `schedule.tsx`

**Summary:** Full order scheduling flow. Allows the user to pick up now or schedule for a future date. Includes address selection (with inline add), delivery speed, bag type/quantity selection, vendor search, payment method selection, wash notes, and a pricing summary. Submits a new order to `/api/orders`.

### Issues Found

1. **No validation that an address is selected before submitting** (lines 153–158)  
   The `createOrderMutation` validates that bags > 0 and (if scheduled) a date is chosen, but it does **not** validate that `selectedAddressId` is non-null. If a user has no saved addresses (or none was auto-selected), `pickupAddressId: selectedAddr?.id` becomes `undefined`, and `pickupAddress` becomes an empty string `""`. The server returns a 400 error (`"Missing required fields: ... pickupAddress"`), but the user sees a generic error toast with no clear prompt to add an address first.

2. **Unused `SheetTrigger` import** (line 17)  
   `SheetTrigger` is imported from `@/components/ui/sheet` and is used as a wrapper around the address card, so this is actually used. *(Withdrawn — no issue.)*

---

## 9. `addresses.tsx`

**Summary:** Manages saved delivery addresses. Supports adding, editing, deleting, and setting a default address. Uses a bottom sheet form and a delete confirmation dialog.

### Issues Found

1. **All queries and mutations hardcoded to `userId=1`** (lines 41, 48, 53, 66, 71, 85, 98, 103)  
   The page does not use `useAuth` or accept a prop for the user's ID. Every address operation uses `userId: 1`, meaning all authenticated customers will see and modify the same user's addresses. Same root cause as `profile.tsx`.

2. **Invalid Tailwind CSS class `ml-13`** (line 184)  
   `<div className="flex items-center gap-2 mt-3 ml-13">` — Tailwind's default spacing scale does not include `ml-13` (it jumps from `ml-12` to `ml-14`). This class will have no effect; the action buttons row will not be indented as intended. Should be `ml-14` or a custom value.

---

## 10. `payments.tsx`

**Summary:** Manages payment methods (cards, Apple Pay, Google Pay). Allows adding new methods via a bottom sheet form, deleting methods, and setting a default. Displays a security info card.

### Issues Found

1. **All queries and mutations hardcoded to `userId=1`** (lines 53, 59, 75, 89, 102, 107)  
   Same root cause as `profile.tsx` and `addresses.tsx`. The page does not use `useAuth`. Every customer sees and modifies user #1's payment methods.

2. **Edit button is a stub — no edit functionality** (lines 248–254)  
   The edit button (pencil icon) on each payment method calls `toast({ title: "Edit", description: ... })` as a placeholder. Editing a payment method is not implemented.

3. **Expiry date input has no format validation** (lines 370–376)  
   The expiry field accepts free-form text with placeholder `MM/YYYY`, and `isValid` only checks `newExpiry.length >= 4`. A user can enter `1111` (4 chars) and the card will be saved with an invalid expiry date.

---

## 11. `login.tsx`

**Summary:** Standard login form with email/password fields, a password visibility toggle, demo login shortcuts for each user role, a "Continue with Google" button, and a link to registration.

### Issues Found

1. **`apiRequest` is imported but never used** (line 4)  
   `apiRequest` is imported from `@/lib/queryClient` but all authentication is done via `login()` and `demoLogin()` from `useAuth`. The import is dead.

2. **"Forgot Password" button has no `onClick` handler** (lines 124–130)  
   The button renders with no action attached. Clicking it does nothing. Either a handler is missing or the button should be hidden until the feature is implemented.

3. **"Continue with Google" button has no `onClick` handler** (lines 159–183)  
   The Google sign-in button renders correctly but has no `onClick` handler — clicking it does nothing. The feature is either unimplemented or the handler was accidentally omitted.

4. **"Sign Up" link navigates to `/role-select`** (line 217)  
   The link text says "Sign Up" but routes to `/role-select` rather than `/register`. This is likely intentional (role selection comes before registration), but the route must exist or new users will land on a 404.

---

## 12. `register.tsx`

**Summary:** Registration form supporting name, email, phone, password, and confirm-password fields. The role (customer, driver, staff) is read from the URL query param. Submits via `authRegister` from the auth context and redirects based on role.

### Issues Found

1. **`apiRequest` is imported but never used** (line 4)  
   Same dead import as `login.tsx`. `apiRequest` is never called in this file.

2. **`setUser` is destructured from `useAuth` but never used** (line 10)  
   `const { register: authRegister, setUser } = useAuth()` — `setUser` is destructured but never referenced. The `authRegister` call from the context already handles setting the user internally. Dead destructuring.

3. **Phone number prefixed with `+1` in UI but stored without it** (lines 162–180)  
   The UI renders a `+1` country code prefix visually, but the `phone` state only captures what the user types in the plain input (no country code is prepended to the value). If the backend expects a fully-formatted number, this will result in phone numbers stored without the country code.

---

## Summary Table

| File | Critical | Moderate | Minor |
|------|----------|----------|-------|
| `home.tsx` | — | `$` prefix with blank amount | Unused imports (Bell, Zap) |
| `orders.tsx` | — | CANCELLABLE inconsistency, `$` blank | Unused imports (Filter, ArrowDownCircle) |
| `order-detail.tsx` | Support message silently dropped | `[object Object]` in event details | CANCELLABLE inconsistency |
| `loyalty.tsx` | — | — | — |
| `referrals.tsx` | — | — | — |
| `chat.tsx` | — | — | — |
| `profile.tsx` | Wrong user data (hardcoded userId=1), Sign-out broken | Admin link exposed to all users | — |
| `schedule.tsx` | — | No address selection validation | — |
| `addresses.tsx` | Wrong user data (hardcoded userId=1) | — | `ml-13` invalid Tailwind class |
| `payments.tsx` | Wrong user data (hardcoded userId=1) | Edit is unimplemented stub | Expiry has no format validation |
| `login.tsx` | — | Forgot Password & Google Login have no handlers | Unused `apiRequest` import |
| `register.tsx` | — | Phone missing country code prefix | Unused `apiRequest`, unused `setUser` |
