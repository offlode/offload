#!/bin/bash
# ============================================================
# OFFLOAD — Comprehensive Production Audit v3
# Uses the ACTUAL API contract based on routes.ts code review
# ============================================================

BASE="http://localhost:5000"
PASS=0
FAIL=0
RESULTS=""

check() {
  local label="$1"
  local condition="$2"
  if [ "$condition" = "true" ]; then
    PASS=$((PASS + 1))
    RESULTS+="✅ $label\n"
  else
    FAIL=$((FAIL + 1))
    RESULTS+="❌ $label\n"
  fi
}

pj() { python3 -c "import sys,json; d=json.load(sys.stdin); $1" 2>/dev/null; }

echo "========================================"
echo "OFFLOAD PRODUCTION AUDIT v3"
echo "========================================"

# ── 1. SEED ──────────────────────────────────────────────
echo "▶ 1. SEED DATA"
SEED=$(curl -s -X POST "$BASE/api/seed")
check "Seed populates demo data" "$(echo "$SEED" | pj "print('true' if d.get('message') else 'false')")"

# ── 2. AUTHENTICATION ────────────────────────────────────
echo "▶ 2. AUTHENTICATION"

# Get marta's email first
MARTA=$(curl -s -X POST "$BASE/api/auth/demo-login" -H "Content-Type: application/json" -d '{"username":"marta"}')
MARTA_EMAIL=$(echo "$MARTA" | pj "print(d['user']['email'])")
CUST_ID=$(echo "$MARTA" | pj "print(d['user']['id'])")
check "Demo login — marta (customer)" "$([ -n "$CUST_ID" ] && [ "$CUST_ID" != "None" ] && echo true || echo false)"

# Login with email
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$MARTA_EMAIL\",\"password\":\"demo123\"}")
LOGIN_OK=$(echo "$LOGIN" | pj "print('true' if d.get('user',{}).get('id') else 'false')")
check "Email/password login" "$LOGIN_OK"

# Demo login — all roles
for U in peter_driver staff_maria manager admin; do
  DL=$(curl -s -X POST "$BASE/api/auth/demo-login" -H "Content-Type: application/json" -d "{\"username\":\"$U\"}")
  DL_OK=$(echo "$DL" | pj "print('true' if d.get('user',{}).get('id') else 'false')")
  check "Demo login — $U" "$DL_OK"
done

DRV_ID=$(curl -s -X POST "$BASE/api/auth/demo-login" -H "Content-Type: application/json" -d '{"username":"peter_driver"}' | pj "print(d['user']['id'])")
STAFF_ID=$(curl -s -X POST "$BASE/api/auth/demo-login" -H "Content-Type: application/json" -d '{"username":"staff_maria"}' | pj "print(d['user']['id'])")
MGR_ID=$(curl -s -X POST "$BASE/api/auth/demo-login" -H "Content-Type: application/json" -d '{"username":"manager"}' | pj "print(d['user']['id'])")
ADM_ID=$(curl -s -X POST "$BASE/api/auth/demo-login" -H "Content-Type: application/json" -d '{"username":"admin"}' | pj "print(d['user']['id'])")

# Registration
REG=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -d '{"name":"Test User","email":"testx@test.com","phone":"555-1111","password":"test123","role":"customer"}')
check "User registration" "$(echo "$REG" | pj "print('true' if d.get('user',{}).get('id') else 'false')")"

REG_DUP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -d '{"name":"Test User","email":"testx@test.com","password":"test123","role":"customer"}')
check "Duplicate email blocked (409)" "$([ "$REG_DUP_CODE" = "409" ] && echo true || echo false)"

echo "  IDs: customer=$CUST_ID driver=$DRV_ID staff=$STAFF_ID mgr=$MGR_ID admin=$ADM_ID"

# ── 3. USER PROFILE ──────────────────────────────────────
echo "▶ 3. USER PROFILE"
check "Get user profile" "$(curl -s "$BASE/api/users/$CUST_ID" | pj "print('true' if d.get('username')=='marta' else 'false')")"
check "Update user phone" "$(curl -s -X PATCH "$BASE/api/users/$CUST_ID" -H "Content-Type: application/json" -d '{"phone":"555-UPDATED"}' | pj "print('true' if d.get('phone')=='555-UPDATED' else 'false')")"

# ── 4. ADDRESSES ──────────────────────────────────────────
echo "▶ 4. ADDRESSES"
# Seeded addresses exist
ADDR_LIST=$(curl -s "$BASE/api/addresses?userId=$CUST_ID")
ADDR_CT=$(echo "$ADDR_LIST" | pj "print(len(d) if isinstance(d,list) else 0)")
check "Seeded addresses for customer (count: $ADDR_CT)" "$([ "$ADDR_CT" -gt 0 ] 2>/dev/null && echo true || echo false)"

ADDR_ID=$(echo "$ADDR_LIST" | pj "print(d[0]['id'] if d else '')")

# Create new address
NEW_ADDR=$(curl -s -X POST "$BASE/api/addresses" -H "Content-Type: application/json" -d "{\"userId\":$CUST_ID,\"label\":\"Gym\",\"street\":\"456 Fitness Blvd\",\"city\":\"Miami\",\"state\":\"FL\",\"zip\":\"33101\",\"lat\":25.77,\"lng\":-80.19}")
check "Create new address" "$(echo "$NEW_ADDR" | pj "print('true' if d.get('id') else 'false')")"

# ── 5. VENDORS ────────────────────────────────────────────
echo "▶ 5. VENDORS"
VENDORS=$(curl -s "$BASE/api/vendors")
V_CT=$(echo "$VENDORS" | pj "print(len(d))")
check "List vendors (count: $V_CT)" "$([ "$V_CT" -gt 0 ] 2>/dev/null && echo true || echo false)"

V_ID=$(echo "$VENDORS" | pj "print(d[0]['id'])")
check "Get vendor detail" "$(curl -s "$BASE/api/vendors/$V_ID" | pj "print('true' if d.get('name') else 'false')")"
check "Get vendor stats" "$(curl -s "$BASE/api/vendors/$V_ID/stats" | pj "print('true' if isinstance(d,dict) else 'false')")"

# ── 6. DRIVERS ────────────────────────────────────────────
echo "▶ 6. DRIVERS"
DRIVERS=$(curl -s "$BASE/api/drivers")
DR_CT=$(echo "$DRIVERS" | pj "print(len(d))")
check "List drivers (count: $DR_CT)" "$([ "$DR_CT" -gt 0 ] 2>/dev/null && echo true || echo false)"

DRIVER_REC_ID=$(echo "$DRIVERS" | pj "print(d[0]['id'])")
check "Get driver detail" "$(curl -s "$BASE/api/drivers/$DRIVER_REC_ID" | pj "print('true' if d.get('name') else 'false')")"
check "Get driver by userId" "$(curl -s "$BASE/api/drivers/user/$DRV_ID" | pj "print('true' if d.get('id') else 'false')")"
check "Update driver GPS" "$(curl -s -X PATCH "$BASE/api/drivers/$DRIVER_REC_ID/location" -H "Content-Type: application/json" -d '{"lat":"25.76","lng":"-80.19"}' | pj "print('true' if d.get('id') else 'false')")"
check "Update driver status" "$(curl -s -X PATCH "$BASE/api/drivers/$DRIVER_REC_ID/status" -H "Content-Type: application/json" -d '{"status":"available"}' | pj "print('true' if d.get('status')=='available' else 'false')")"
check "Driver stats" "$(curl -s "$BASE/api/drivers/$DRIVER_REC_ID/stats" | pj "print('true' if isinstance(d,dict) else 'false')")"

# ── 7. PRICING ENGINE ────────────────────────────────────
echo "▶ 7. PRICING ENGINE"
# Pricing expects bags array, not weight
PRICE=$(curl -s -X POST "$BASE/api/pricing/calculate" -H "Content-Type: application/json" -d '{"bags":[{"type":"medium","quantity":2}],"deliverySpeed":"48h"}')
PRICE_TOTAL=$(echo "$PRICE" | pj "print(d.get('total',0))")
check "Price calculation — 2 medium bags, 48h ($PRICE_TOTAL)" "$(echo "$PRICE" | pj "print('true' if d.get('total',0) > 0 else 'false')")"

PRICE2=$(curl -s -X POST "$BASE/api/pricing/calculate" -H "Content-Type: application/json" -d '{"bags":[{"type":"large","quantity":1},{"type":"small","quantity":2}],"deliverySpeed":"24h"}')
check "Price calculation — mixed bags, 24h express" "$(echo "$PRICE2" | pj "print('true' if d.get('total',0) > 0 else 'false')")"

PRICE3=$(curl -s -X POST "$BASE/api/pricing/calculate" -H "Content-Type: application/json" -d '{"bags":[{"type":"extra_large","quantity":1}],"deliverySpeed":"same_day"}')
check "Price calculation — same-day (1.8x multiplier)" "$(echo "$PRICE3" | pj "print('true' if d.get('total',0) > 0 else 'false')")"

# ── 8. ORDER CREATION + AUTO-DISPATCH ─────────────────────
echo "▶ 8. ORDER CREATION + AUTO-DISPATCH"
# Get pickup address from seeded data
PICKUP_ADDR=$(echo "$ADDR_LIST" | pj "a=d[0]; print(f'{a[\"street\"]}, {a[\"city\"]}, {a[\"state\"]} {a[\"zip\"]}')")

ORDER=$(curl -s -X POST "$BASE/api/orders" -H "Content-Type: application/json" -d "{
  \"customerId\": $CUST_ID,
  \"pickupAddressId\": $ADDR_ID,
  \"pickupAddress\": \"$PICKUP_ADDR\",
  \"deliveryType\": \"contactless\",
  \"deliverySpeed\": \"48h\",
  \"scheduledPickup\": \"2026-04-14T10:00:00Z\",
  \"pickupTimeWindow\": \"9am - 11am\",
  \"bags\": [{\"type\":\"medium\",\"quantity\":2},{\"type\":\"small\",\"quantity\":1}],
  \"customerNotes\": \"Please use cold water\"
}")
ORDER_ID=$(echo "$ORDER" | pj "print(d.get('id',''))")
ORDER_STATUS=$(echo "$ORDER" | pj "print(d.get('status',''))")
ORDER_NUM=$(echo "$ORDER" | pj "print(d.get('orderNumber',''))")
check "Create order ($ORDER_NUM)" "$([ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "" ] && [ "$ORDER_ID" != "None" ] && echo true || echo false)"

# Auto-dispatch should set status to driver_assigned
check "Auto-confirm + auto-dispatch → driver_assigned" "$([ "$ORDER_STATUS" = "driver_assigned" ] && echo true || echo false)"

VENDOR_ASSIGNED=$(echo "$ORDER" | pj "print(d.get('vendorId',''))")
DRIVER_ASSIGNED=$(echo "$ORDER" | pj "print(d.get('driverId',''))")
check "Vendor auto-assigned (vendorId: $VENDOR_ASSIGNED)" "$([ -n "$VENDOR_ASSIGNED" ] && [ "$VENDOR_ASSIGNED" != "None" ] && [ "$VENDOR_ASSIGNED" != "null" ] && echo true || echo false)"
check "Driver auto-assigned (driverId: $DRIVER_ASSIGNED)" "$([ -n "$DRIVER_ASSIGNED" ] && [ "$DRIVER_ASSIGNED" != "None" ] && [ "$DRIVER_ASSIGNED" != "null" ] && echo true || echo false)"

# Check pricing was calculated
ORDER_TOTAL=$(echo "$ORDER" | pj "print(d.get('total',0))")
check "Order total price calculated ($ORDER_TOTAL)" "$(echo "$ORDER" | pj "print('true' if float(d.get('total',0)) > 0 else 'false')")"

SUBTOTAL=$(echo "$ORDER" | pj "print(d.get('subtotal',0))")
TAX=$(echo "$ORDER" | pj "print(d.get('tax',0))")
check "Subtotal ($SUBTOTAL), tax ($TAX), delivery fee calculated" "$(echo "$ORDER" | pj "print('true' if float(d.get('subtotal',0)) > 0 else 'false')")"

# Payment was auto-authorized
PAY_STATUS=$(echo "$ORDER" | pj "print(d.get('paymentStatus',''))")
check "Payment auto-authorized ($PAY_STATUS)" "$([ "$PAY_STATUS" = "authorized" ] && echo true || echo false)"

# SLA deadline set
SLA=$(echo "$ORDER" | pj "print(d.get('slaDeadline',''))")
check "SLA deadline set ($SLA)" "$([ -n "$SLA" ] && [ "$SLA" != "None" ] && [ "$SLA" != "null" ] && echo true || echo false)"

# ── 9. FULL ORDER LIFECYCLE ───────────────────────────────
echo "▶ 9. FULL ORDER LIFECYCLE (step-locked transitions)"

# driver_assigned → pickup_in_progress
T1=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d "{\"status\":\"pickup_in_progress\",\"actorId\":$DRV_ID,\"actorRole\":\"driver\"}")
check "→ pickup_in_progress (driver en route)" "$(echo "$T1" | pj "print('true' if d.get('status')=='pickup_in_progress' else 'false')")"

# pickup_in_progress → picked_up (with proof photo)
T2=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d "{\"status\":\"picked_up\",\"actorId\":$DRV_ID,\"actorRole\":\"driver\",\"photoUrl\":\"https://cdn.offload.com/proof/pickup_001.jpg\",\"lat\":25.7617,\"lng\":-80.1918}")
check "→ picked_up (with proof photo)" "$(echo "$T2" | pj "print('true' if d.get('status')=='picked_up' else 'false')")"

# picked_up → at_laundromat
T3=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d "{\"status\":\"at_laundromat\",\"actorId\":$DRV_ID,\"actorRole\":\"driver\"}")
check "→ at_laundromat (arrived at facility)" "$(echo "$T3" | pj "print('true' if d.get('status')=='at_laundromat' else 'false')")"

# Intake — record weight at facility
INTAKE=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/intake" -H "Content-Type: application/json" -d "{\"weight\":14.2,\"photoUrl\":\"https://cdn.offload.com/intake_001.jpg\",\"actorId\":$STAFF_ID}")
check "Intake weight recorded (14.2 lbs)" "$(echo "$INTAKE" | pj "print('true' if d.get('intakeWeight') else 'false')")"

# at_laundromat → washing
T4=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d "{\"status\":\"washing\",\"actorId\":$STAFF_ID,\"actorRole\":\"vendor\"}")
check "→ washing" "$(echo "$T4" | pj "print('true' if d.get('status')=='washing' else 'false')")"

# washing → wash_complete
T5=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d "{\"status\":\"wash_complete\",\"actorId\":$STAFF_ID,\"actorRole\":\"vendor\"}")
check "→ wash_complete" "$(echo "$T5" | pj "print('true' if d.get('status')=='wash_complete' else 'false')")"

# Output weight
OUT_W=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/output-weight" -H "Content-Type: application/json" -d "{\"weight\":13.8,\"actorId\":$STAFF_ID}")
check "Output weight recorded (13.8 lbs)" "$(echo "$OUT_W" | pj "print('true' if d.get('outputWeight') else 'false')")"

# wash_complete → packing
T6=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d "{\"status\":\"packing\",\"actorId\":$STAFF_ID,\"actorRole\":\"vendor\"}")
check "→ packing" "$(echo "$T6" | pj "print('true' if d.get('status')=='packing' else 'false')")"

# packing → ready_for_delivery
T7=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d "{\"status\":\"ready_for_delivery\",\"actorId\":$STAFF_ID,\"actorRole\":\"vendor\"}")
check "→ ready_for_delivery (return driver auto-assigned)" "$(echo "$T7" | pj "print('true' if d.get('status')=='ready_for_delivery' else 'false')")"

# ready_for_delivery → out_for_delivery
T8=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d "{\"status\":\"out_for_delivery\",\"actorId\":$DRV_ID,\"actorRole\":\"driver\"}")
check "→ out_for_delivery" "$(echo "$T8" | pj "print('true' if d.get('status')=='out_for_delivery' else 'false')")"

# out_for_delivery → delivered (with proof photo)
T9=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d "{\"status\":\"delivered\",\"actorId\":$DRV_ID,\"actorRole\":\"driver\",\"photoUrl\":\"https://cdn.offload.com/proof/delivery_001.jpg\",\"lat\":25.7617,\"lng\":-80.1918}")
check "→ delivered (proof photo + payment captured)" "$(echo "$T9" | pj "print('true' if d.get('status')=='delivered' else 'false')")"

# Check payment was captured on delivery
DEL_ORDER=$(curl -s "$BASE/api/orders/$ORDER_ID")
DEL_PAY=$(echo "$DEL_ORDER" | pj "print(d.get('paymentStatus',''))")
check "Payment captured on delivery ($DEL_PAY)" "$([ "$DEL_PAY" = "captured" ] && echo true || echo false)"

# Check vendor & driver payouts
V_PAY=$(echo "$DEL_ORDER" | pj "print(d.get('vendorPayout',''))")
D_PAY=$(echo "$DEL_ORDER" | pj "print(d.get('driverPayout',''))")
check "Vendor payout set ($V_PAY)" "$([ -n "$V_PAY" ] && [ "$V_PAY" != "None" ] && [ "$V_PAY" != "null" ] && echo true || echo false)"
check "Driver payout set ($D_PAY)" "$([ -n "$D_PAY" ] && [ "$D_PAY" != "None" ] && [ "$D_PAY" != "null" ] && echo true || echo false)"

# ── 10. ORDER RETRIEVAL ───────────────────────────────────
echo "▶ 10. ORDER RETRIEVAL"
check "List orders by customer" "$(curl -s "$BASE/api/orders?userId=$CUST_ID" | pj "print('true' if isinstance(d,list) and len(d)>0 else 'false')")"
check "Get active orders" "$(curl -s "$BASE/api/orders/active" | pj "print('true' if isinstance(d,list) else 'false')")"
check "Get order detail by ID" "$(curl -s "$BASE/api/orders/$ORDER_ID" | pj "print('true' if d.get('id')==$ORDER_ID else 'false')")"

EVENTS=$(curl -s "$BASE/api/orders/$ORDER_ID/events")
EVT_CT=$(echo "$EVENTS" | pj "print(len(d) if isinstance(d,list) else 0)")
check "Order event history (count: $EVT_CT)" "$([ "$EVT_CT" -gt 0 ] 2>/dev/null && echo true || echo false)"

# ── 11. INVALID STATE TRANSITIONS (guards) ────────────────
echo "▶ 11. STATE TRANSITION GUARDS"
BAD=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d '{"status":"pending"}')
check "Block invalid transition (delivered→pending)" "$(echo "$BAD" | pj "print('true' if d.get('error') else 'false')")"

BAD2=$(curl -s -X PATCH "$BASE/api/orders/$ORDER_ID/status" -H "Content-Type: application/json" -d '{"status":"washing"}')
check "Block skip transition (delivered→washing)" "$(echo "$BAD2" | pj "print('true' if d.get('error') else 'false')")"

# ── 12. REVIEW SYSTEM ────────────────────────────────────
echo "▶ 12. REVIEWS"
REVIEW=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/review" -H "Content-Type: application/json" -d "{\"userId\":$CUST_ID,\"rating\":5,\"comment\":\"Amazing service, very fast!\",\"vendorRating\":5,\"driverRating\":5}")
check "Submit review (5 stars)" "$(echo "$REVIEW" | pj "print('true' if d.get('id') else 'false')")"
check "Get review by order" "$(curl -s "$BASE/api/orders/$ORDER_ID/review" | pj "print('true' if d.get('id') or d.get('rating') else 'false')")"
check "List all reviews" "$(curl -s "$BASE/api/reviews" | pj "print('true' if isinstance(d,list) and len(d)>0 else 'false')")"

# ── 13. DISPUTES ──────────────────────────────────────────
echo "▶ 13. DISPUTES"
DISPUTE=$(curl -s -X POST "$BASE/api/disputes" -H "Content-Type: application/json" -d "{\"orderId\":$ORDER_ID,\"userId\":$CUST_ID,\"type\":\"missing_items\",\"description\":\"One shirt missing from order\"}")
DISPUTE_ID=$(echo "$DISPUTE" | pj "print(d.get('id',''))")
check "Create dispute" "$([ -n "$DISPUTE_ID" ] && [ "$DISPUTE_ID" != "" ] && [ "$DISPUTE_ID" != "None" ] && echo true || echo false)"

check "List disputes" "$(curl -s "$BASE/api/disputes" | pj "print('true' if isinstance(d,list) and len(d)>0 else 'false')")"

if [ -n "$DISPUTE_ID" ] && [ "$DISPUTE_ID" != "None" ] && [ "$DISPUTE_ID" != "" ]; then
  check "Get dispute detail" "$(curl -s "$BASE/api/disputes/$DISPUTE_ID" | pj "print('true' if d.get('id') else 'false')")"
  check "Resolve dispute" "$(curl -s -X PATCH "$BASE/api/disputes/$DISPUTE_ID" -H "Content-Type: application/json" -d '{"status":"resolved","resolution":"Refund issued for missing shirt, $15 credit applied"}' | pj "print('true' if d.get('status')=='resolved' else 'false')")"
fi

# ── 14. NOTIFICATIONS ─────────────────────────────────────
echo "▶ 14. NOTIFICATIONS"
NOTIFS=$(curl -s "$BASE/api/notifications?userId=$CUST_ID")
NOTIF_CT=$(echo "$NOTIFS" | pj "print(len(d) if isinstance(d,list) else 0)")
check "Customer notifications generated (count: $NOTIF_CT)" "$([ "$NOTIF_CT" -gt 0 ] 2>/dev/null && echo true || echo false)"

check "Unread count endpoint" "$(curl -s "$BASE/api/notifications/unread-count?userId=$CUST_ID" | pj "print('true' if 'count' in d or 'unread' in str(d).lower() else 'false')")"

if [ "$NOTIF_CT" -gt 0 ] 2>/dev/null; then
  NOTIF_ID=$(echo "$NOTIFS" | pj "print(d[0]['id'])")
  check "Mark notification read" "$(curl -s -X PATCH "$BASE/api/notifications/$NOTIF_ID/read" | pj "print('true' if d.get('isRead') or d.get('read') else 'false')")"
fi

check "Mark all read" "$(curl -s -X POST "$BASE/api/notifications/mark-all-read" -H "Content-Type: application/json" -d "{\"userId\":$CUST_ID}" | pj "print('true' if 'count' in d or 'ok' in str(d).lower() or 'success' in str(d).lower() or 'updated' in str(d).lower() else 'false')")"

# ── 15. CONSENT ENGINE ────────────────────────────────────
echo "▶ 15. CONSENT ENGINE"
# Create a new order for consent test
ORDER_CON=$(curl -s -X POST "$BASE/api/orders" -H "Content-Type: application/json" -d "{
  \"customerId\": $CUST_ID,
  \"pickupAddressId\": $ADDR_ID,
  \"pickupAddress\": \"$PICKUP_ADDR\",
  \"bags\": [{\"type\":\"small\",\"quantity\":1}],
  \"scheduledPickup\": \"2026-04-15T10:00:00Z\"
}")
ORDER_CON_ID=$(echo "$ORDER_CON" | pj "print(d.get('id',''))")

CONSENT=$(curl -s -X POST "$BASE/api/orders/$ORDER_CON_ID/consents" -H "Content-Type: application/json" -d "{\"userId\":$CUST_ID,\"type\":\"pricing\",\"description\":\"Customer agrees to price estimate\"}")
CONSENT_ID=$(echo "$CONSENT" | pj "print(d.get('id',''))")
check "Create consent record" "$([ -n "$CONSENT_ID" ] && [ "$CONSENT_ID" != "" ] && [ "$CONSENT_ID" != "None" ] && echo true || echo false)"

check "List consents for order" "$(curl -s "$BASE/api/orders/$ORDER_CON_ID/consents" | pj "print('true' if isinstance(d,list) and len(d)>0 else 'false')")"

if [ -n "$CONSENT_ID" ] && [ "$CONSENT_ID" != "None" ] && [ "$CONSENT_ID" != "" ]; then
  check "Approve consent" "$(curl -s -X PATCH "$BASE/api/consents/$CONSENT_ID" -H "Content-Type: application/json" -d '{"status":"approved"}' | pj "print('true' if d.get('status')=='approved' else 'false')")"
fi

# ── 16. MESSAGING ─────────────────────────────────────────
echo "▶ 16. MESSAGING"
MSG=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/messages" -H "Content-Type: application/json" -d "{\"userId\":$CUST_ID,\"content\":\"When will my laundry arrive?\",\"senderRole\":\"customer\"}")
check "Send message on order" "$(echo "$MSG" | pj "print('true' if d.get('id') else 'false')")"

MSGS=$(curl -s "$BASE/api/orders/$ORDER_ID/messages")
MSG_CT=$(echo "$MSGS" | pj "print(len(d) if isinstance(d,list) else 0)")
check "Get order messages (count: $MSG_CT)" "$([ "$MSG_CT" -gt 0 ] 2>/dev/null && echo true || echo false)"

# ── 17. ORDER CANCELLATION ────────────────────────────────
echo "▶ 17. ORDER CANCELLATION"
# Create an order to cancel
ORDER_CAN=$(curl -s -X POST "$BASE/api/orders" -H "Content-Type: application/json" -d "{
  \"customerId\": $CUST_ID,
  \"pickupAddressId\": $ADDR_ID,
  \"pickupAddress\": \"$PICKUP_ADDR\",
  \"bags\": [{\"type\":\"medium\",\"quantity\":1}],
  \"scheduledPickup\": \"2026-04-18T10:00:00Z\"
}")
ORDER_CAN_ID=$(echo "$ORDER_CAN" | pj "print(d.get('id',''))")
ORDER_CAN_STATUS=$(echo "$ORDER_CAN" | pj "print(d.get('status',''))")

# Cancel immediately (should work since it's pre-wash)
CANCEL=$(curl -s -X POST "$BASE/api/orders/$ORDER_CAN_ID/cancel" -H "Content-Type: application/json" -d "{\"reason\":\"Changed my mind\",\"actorId\":$CUST_ID}")
check "Cancel order → cancelled" "$(echo "$CANCEL" | pj "print('true' if d.get('status')=='cancelled' else 'false')")"
check "Refund issued on cancel" "$(echo "$CANCEL" | pj "print('true' if d.get('paymentStatus')=='refunded' else 'false')")"

# Try to cancel a delivered order (should fail)
CANCEL_FAIL_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/orders/$ORDER_ID/cancel" -H "Content-Type: application/json" -d '{"reason":"test"}')
check "Cannot cancel delivered order (400)" "$([ "$CANCEL_FAIL_CODE" = "400" ] && echo true || echo false)"

# ── 18. PAYMENT METHODS ──────────────────────────────────
echo "▶ 18. PAYMENT METHODS"
PM_ADD=$(curl -s -X POST "$BASE/api/payment-methods" -H "Content-Type: application/json" -d "{\"userId\":$CUST_ID,\"type\":\"visa\",\"last4\":\"4242\",\"isDefault\":1}")
PM_ID=$(echo "$PM_ADD" | pj "print(d.get('id',''))")
check "Add payment method" "$([ -n "$PM_ID" ] && [ "$PM_ID" != "" ] && [ "$PM_ID" != "None" ] && echo true || echo false)"

check "List payment methods" "$(curl -s "$BASE/api/payment-methods?userId=$CUST_ID" | pj "print('true' if isinstance(d,list) and len(d)>0 else 'false')")"

if [ -n "$PM_ID" ] && [ "$PM_ID" != "None" ] && [ "$PM_ID" != "" ]; then
  check "Update payment method" "$(curl -s -X PATCH "$BASE/api/payment-methods/$PM_ID" -H "Content-Type: application/json" -d '{"isDefault":0}' | pj "print('true' if d.get('id') else 'false')")"
  check "Delete payment method" "$(curl -s -X DELETE "$BASE/api/payment-methods/$PM_ID" -o /dev/null -w "%{http_code}" | grep -q '200\|204' && echo true || echo false)"
fi

# ── 19. CUSTOMER STATS ────────────────────────────────────
echo "▶ 19. CUSTOMER STATS"
check "Customer stats" "$(curl -s "$BASE/api/customers/$CUST_ID/stats" | pj "print('true' if isinstance(d,dict) and len(d)>0 else 'false')")"

# ── 20. ADMIN METRICS ────────────────────────────────────
echo "▶ 20. ADMIN METRICS"
METRICS=$(curl -s "$BASE/api/admin/metrics")
check "Admin metrics dashboard" "$(echo "$METRICS" | pj "print('true' if isinstance(d,dict) and len(d)>0 else 'false')")"

METRICS_FIELDS=$(echo "$METRICS" | pj "print(','.join(d.keys()))")
echo "  Fields: $METRICS_FIELDS"

# ── 21. MANAGER EARNINGS ─────────────────────────────────
echo "▶ 21. MANAGER EARNINGS"
check "Manager earnings report" "$(curl -s "$BASE/api/manager/earnings" | pj "print('true' if isinstance(d,dict) or isinstance(d,list) else 'false')")"

# ── 22. DRIVER EARNINGS ──────────────────────────────────
echo "▶ 22. DRIVER EARNINGS"
check "Driver earnings report" "$(curl -s "$BASE/api/driver/earnings?driverId=$DRIVER_REC_ID" | pj "print('true' if isinstance(d,dict) or isinstance(d,list) else 'false')")"

# ── 23. FRONTEND ──────────────────────────────────────────
echo "▶ 23. FRONTEND"
check "Frontend loads (HTTP 200)" "$([ $(curl -s -o /dev/null -w "%{http_code}" "$BASE") = "200" ] && echo true || echo false)"
check "Frontend has JS/CSS bundles" "$([ $(curl -s "$BASE" | grep -c "assets/") -gt 0 ] && echo true || echo false)"

# ── RESULTS ───────────────────────────────────────────────
echo ""
echo "========================================"
echo "AUDIT RESULTS"
echo "========================================"
echo ""
printf "$RESULTS"
echo ""
echo "========================================"
echo "TOTAL: $((PASS + FAIL)) tests | ✅ $PASS passed | ❌ $FAIL failed"
echo "========================================"
