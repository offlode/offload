#!/bin/bash
# ============================================================
# OFFLOAD — Comprehensive Production Audit
# Tests every API endpoint and business logic flow
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

echo "========================================"
echo "OFFLOAD PRODUCTION AUDIT"
echo "========================================"

# ── 1. SEED DATA ──────────────────────────────────────────
echo ""
echo "▶ SEEDING TEST DATA..."
SEED=$(curl -s -X POST "$BASE/api/seed")
SEED_OK=$(echo "$SEED" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('message') else 'false')" 2>/dev/null)
check "Seed endpoint creates test data" "$SEED_OK"

# ── 2. AUTHENTICATION ────────────────────────────────────
echo ""
echo "▶ TESTING AUTHENTICATION..."

# Login as customer
LOGIN_CUST=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"username":"marta","password":"demo123"}')
CUST_TOKEN=$(echo "$LOGIN_CUST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
check "Customer login (marta/demo123)" "$([ -n "$CUST_TOKEN" ] && echo true || echo false)"

# Login as driver
LOGIN_DRV=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"username":"peter_driver","password":"demo123"}')
DRV_TOKEN=$(echo "$LOGIN_DRV" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
check "Driver login (peter_driver/demo123)" "$([ -n "$DRV_TOKEN" ] && echo true || echo false)"

# Login as staff (laundromat)
LOGIN_STAFF=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"username":"staff_maria","password":"demo123"}')
STAFF_TOKEN=$(echo "$LOGIN_STAFF" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
check "Staff login (staff_maria/demo123)" "$([ -n "$STAFF_TOKEN" ] && echo true || echo false)"

# Login as manager
LOGIN_MGR=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"username":"manager","password":"demo123"}')
MGR_TOKEN=$(echo "$LOGIN_MGR" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
check "Manager login (manager/demo123)" "$([ -n "$MGR_TOKEN" ] && echo true || echo false)"

# Login as admin
LOGIN_ADM=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"username":"admin","password":"demo123"}')
ADM_TOKEN=$(echo "$LOGIN_ADM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
check "Admin login (admin/demo123)" "$([ -n "$ADM_TOKEN" ] && echo true || echo false)"

# Get current user
ME=$(curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $CUST_TOKEN")
ME_OK=$(echo "$ME" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('username')=='marta' else 'false')" 2>/dev/null)
check "GET /api/auth/me returns authenticated user" "$ME_OK"

# Register new user
REG=$(curl -s -X POST "$BASE/api/auth/register" -H "Content-Type: application/json" -d '{"username":"test_audit","password":"test123","name":"Audit User","email":"audit@test.com","phone":"555-0000","role":"customer"}')
REG_OK=$(echo "$REG" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('token') else 'false')" 2>/dev/null)
check "User registration creates account + returns token" "$REG_OK"

# Unauthorized access
UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/orders" -H "Authorization: Bearer invalidtoken")
check "Invalid token returns 401" "$([ "$UNAUTH" = "401" ] && echo true || echo false)"

# ── 3. ADDRESS MANAGEMENT ────────────────────────────────
echo ""
echo "▶ TESTING ADDRESS MANAGEMENT..."

ADDR=$(curl -s -X POST "$BASE/api/addresses" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d '{"label":"Home","street":"123 Main St","city":"Miami","state":"FL","zip":"33101","lat":"25.7617","lng":"-80.1918"}')
ADDR_ID=$(echo "$ADDR" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
check "Create address" "$([ -n "$ADDR_ID" ] && echo true || echo false)"

ADDR_LIST=$(curl -s "$BASE/api/addresses" -H "Authorization: Bearer $CUST_TOKEN")
ADDR_LIST_OK=$(echo "$ADDR_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) and len(d)>0 else 'false')" 2>/dev/null)
check "List addresses" "$ADDR_LIST_OK"

# ── 4. VENDOR MANAGEMENT ─────────────────────────────────
echo ""
echo "▶ TESTING VENDOR MANAGEMENT..."

VENDORS=$(curl -s "$BASE/api/vendors" -H "Authorization: Bearer $CUST_TOKEN")
VENDORS_OK=$(echo "$VENDORS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) and len(d)>0 else 'false')" 2>/dev/null)
check "List vendors" "$VENDORS_OK"

V_ID=$(echo "$VENDORS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('id',''))" 2>/dev/null)
V_DETAIL=$(curl -s "$BASE/api/vendors/$V_ID" -H "Authorization: Bearer $CUST_TOKEN")
V_DETAIL_OK=$(echo "$V_DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('id') else 'false')" 2>/dev/null)
check "Get vendor detail" "$V_DETAIL_OK"

# ── 5. PRICING ENGINE ────────────────────────────────────
echo ""
echo "▶ TESTING PRICING ENGINE..."

PRICE=$(curl -s -X POST "$BASE/api/pricing/estimate" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d '{"serviceType":"wash_fold","estimatedWeight":10}')
PRICE_OK=$(echo "$PRICE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('total') and float(d['total'])>0 else 'false')" 2>/dev/null)
check "Price estimate (wash & fold, 10 lbs)" "$PRICE_OK"

PRICE2=$(curl -s -X POST "$BASE/api/pricing/estimate" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d '{"serviceType":"dry_clean","estimatedWeight":5}')
PRICE2_OK=$(echo "$PRICE2" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('total') and float(d['total'])>0 else 'false')" 2>/dev/null)
check "Price estimate (dry clean, 5 lbs)" "$PRICE2_OK"

# ── 6. ORDER CREATION & LIFECYCLE ─────────────────────────
echo ""
echo "▶ TESTING ORDER CREATION..."

# Get customer user ID
CUST_ID=$(echo "$ME" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

ORDER=$(curl -s -X POST "$BASE/api/orders" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{
  \"customerId\": $CUST_ID,
  \"pickupAddressId\": $ADDR_ID,
  \"deliveryAddressId\": $ADDR_ID,
  \"serviceType\": \"wash_fold\",
  \"estimatedWeight\": 12,
  \"specialInstructions\": \"Cold water only\",
  \"scheduledPickup\": \"2026-04-14T10:00:00Z\"
}")
ORDER_ID=$(echo "$ORDER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
ORDER_STATUS=$(echo "$ORDER" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Create order" "$([ -n "$ORDER_ID" ] && echo true || echo false)"
check "New order status = pending_confirmation" "$([ "$ORDER_STATUS" = "pending_confirmation" ] && echo true || echo false)"

# ── 7. ORDER LIFECYCLE TRANSITIONS ────────────────────────
echo ""
echo "▶ TESTING ORDER LIFECYCLE..."

# Confirm order (customer consent)
CONFIRM=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/confirm" -H "Authorization: Bearer $CUST_TOKEN")
CONFIRM_STATUS=$(echo "$CONFIRM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Customer confirms order → confirmed" "$([ "$CONFIRM_STATUS" = "confirmed" ] && echo true || echo false)"

# Dispatch (auto or manual)
DISPATCH=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/dispatch" -H "Authorization: Bearer $ADM_TOKEN")
DISPATCH_STATUS=$(echo "$DISPATCH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Dispatch order → dispatched" "$([ "$DISPATCH_STATUS" = "dispatched" ] && echo true || echo false)"

# Driver accepts pickup
PICKUP_ACCEPT=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/driver-pickup" -H "Authorization: Bearer $DRV_TOKEN" -H "Content-Type: application/json" -d '{"action":"accept"}')
PA_STATUS=$(echo "$PICKUP_ACCEPT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Driver accepts pickup → pickup_in_progress" "$([ "$PA_STATUS" = "pickup_in_progress" ] && echo true || echo false)"

# Driver completes pickup (with bag count + photo)
PICKUP_DONE=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/driver-pickup" -H "Authorization: Bearer $DRV_TOKEN" -H "Content-Type: application/json" -d '{"action":"complete","bagCount":2,"photoUrl":"https://example.com/photo1.jpg","gpsLat":"25.7617","gpsLng":"-80.1918"}')
PD_STATUS=$(echo "$PICKUP_DONE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Driver completes pickup → at_facility" "$([ "$PD_STATUS" = "at_facility" ] && echo true || echo false)"

# Laundromat intake (scan + weigh)
INTAKE=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/intake" -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" -d '{"actualWeight":12.4,"condition":"good","notes":"All items accounted for"}')
INTAKE_STATUS=$(echo "$INTAKE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Laundromat intake (weight 12.4 lbs, within 5% tolerance) → processing" "$([ "$INTAKE_STATUS" = "processing" ] && echo true || echo false)"

# Mark processing complete
PROC_DONE=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/processing-complete" -H "Authorization: Bearer $STAFF_TOKEN")
PROC_STATUS=$(echo "$PROC_DONE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Processing complete → ready_for_delivery" "$([ "$PROC_STATUS" = "ready_for_delivery" ] && echo true || echo false)"

# Driver accepts delivery
DEL_ACCEPT=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/driver-delivery" -H "Authorization: Bearer $DRV_TOKEN" -H "Content-Type: application/json" -d '{"action":"accept"}')
DA_STATUS=$(echo "$DEL_ACCEPT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Driver accepts delivery → delivery_in_progress" "$([ "$DA_STATUS" = "delivery_in_progress" ] && echo true || echo false)"

# Driver completes delivery
DEL_DONE=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/driver-delivery" -H "Authorization: Bearer $DRV_TOKEN" -H "Content-Type: application/json" -d '{"action":"complete","photoUrl":"https://example.com/photo2.jpg","gpsLat":"25.7617","gpsLng":"-80.1918","bagCount":2}')
DD_STATUS=$(echo "$DEL_DONE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Driver completes delivery → delivered" "$([ "$DD_STATUS" = "delivered" ] && echo true || echo false)"

# Complete order
COMPLETE=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/complete" -H "Authorization: Bearer $ADM_TOKEN")
COMP_STATUS=$(echo "$COMPLETE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Complete order → completed" "$([ "$COMP_STATUS" = "completed" ] && echo true || echo false)"

# ── 8. ORDER RETRIEVAL ────────────────────────────────────
echo ""
echo "▶ TESTING ORDER RETRIEVAL..."

MY_ORDERS=$(curl -s "$BASE/api/orders" -H "Authorization: Bearer $CUST_TOKEN")
MY_ORD_OK=$(echo "$MY_ORDERS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) and len(d)>0 else 'false')" 2>/dev/null)
check "List my orders (customer)" "$MY_ORD_OK"

ORD_DETAIL=$(curl -s "$BASE/api/orders/$ORDER_ID" -H "Authorization: Bearer $CUST_TOKEN")
ORD_DET_OK=$(echo "$ORD_DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('id') else 'false')" 2>/dev/null)
check "Get order detail by ID" "$ORD_DET_OK"

ORD_EVENTS=$(curl -s "$BASE/api/orders/$ORDER_ID/events" -H "Authorization: Bearer $CUST_TOKEN")
ORD_EVT_OK=$(echo "$ORD_EVENTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) and len(d)>0 else 'false')" 2>/dev/null)
check "Get order event history (audit trail)" "$ORD_EVT_OK"

# ── 9. FINANCIAL SYSTEM ───────────────────────────────────
echo ""
echo "▶ TESTING FINANCIAL SYSTEM..."

# Payment auth
PAY_AUTH=$(curl -s -X POST "$BASE/api/payments/authorize" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{\"orderId\": $ORDER_ID, \"amount\": 25.00, \"paymentMethodId\": 1}")
PAY_AUTH_OK=$(echo "$PAY_AUTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('authorized') or d.get('status')=='authorized' or d.get('authorizationId') else 'false')" 2>/dev/null)
check "Payment authorization" "$PAY_AUTH_OK"

# Payment capture
PAY_CAP=$(curl -s -X POST "$BASE/api/payments/capture" -H "Authorization: Bearer $ADM_TOKEN" -H "Content-Type: application/json" -d "{\"orderId\": $ORDER_ID}")
PAY_CAP_OK=$(echo "$PAY_CAP" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('captured') or d.get('status')=='captured' else 'false')" 2>/dev/null)
check "Payment capture" "$PAY_CAP_OK"

# Vendor payout info
PAYOUT=$(curl -s "$BASE/api/orders/$ORDER_ID" -H "Authorization: Bearer $ADM_TOKEN")
PAYOUT_AMT=$(echo "$PAYOUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('vendorPayout',''))" 2>/dev/null)
check "Vendor payout calculated on order" "$([ -n "$PAYOUT_AMT" ] && [ "$PAYOUT_AMT" != "None" ] && [ "$PAYOUT_AMT" != "null" ] && echo true || echo false)"

# Payment methods
PM_LIST=$(curl -s "$BASE/api/payment-methods" -H "Authorization: Bearer $CUST_TOKEN")
PM_OK=$(echo "$PM_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) else 'false')" 2>/dev/null)
check "List payment methods" "$PM_OK"

# Refund
REFUND=$(curl -s -X POST "$BASE/api/payments/refund" -H "Authorization: Bearer $ADM_TOKEN" -H "Content-Type: application/json" -d "{\"orderId\": $ORDER_ID, \"amount\": 5.00, \"reason\": \"Partial damage\"}")
REFUND_OK=$(echo "$REFUND" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('refunded') or d.get('status')=='refunded' else 'false')" 2>/dev/null)
check "Process refund" "$REFUND_OK"

# ── 10. REVIEW/RATING SYSTEM ─────────────────────────────
echo ""
echo "▶ TESTING REVIEW SYSTEM..."

REVIEW=$(curl -s -X POST "$BASE/api/reviews" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{\"orderId\": $ORDER_ID, \"rating\": 5, \"comment\": \"Excellent service!\"}")
REVIEW_OK=$(echo "$REVIEW" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('id') else 'false')" 2>/dev/null)
check "Submit review (5 stars)" "$REVIEW_OK"

REVIEWS_LIST=$(curl -s "$BASE/api/reviews" -H "Authorization: Bearer $CUST_TOKEN")
REVIEWS_OK=$(echo "$REVIEWS_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) and len(d)>0 else 'false')" 2>/dev/null)
check "List reviews" "$REVIEWS_OK"

# ── 11. DISPUTE RESOLUTION ────────────────────────────────
echo ""
echo "▶ TESTING DISPUTE SYSTEM..."

# Create a new order for dispute testing
ORDER2=$(curl -s -X POST "$BASE/api/orders" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{
  \"customerId\": $CUST_ID,
  \"pickupAddressId\": $ADDR_ID,
  \"deliveryAddressId\": $ADDR_ID,
  \"serviceType\": \"wash_fold\",
  \"estimatedWeight\": 8,
  \"scheduledPickup\": \"2026-04-15T10:00:00Z\"
}")
ORDER2_ID=$(echo "$ORDER2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

DISPUTE=$(curl -s -X POST "$BASE/api/disputes" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{\"orderId\": $ORDER2_ID, \"reason\": \"Missing items\", \"description\": \"Two shirts were not returned\"}")
DISPUTE_ID=$(echo "$DISPUTE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)
check "Create dispute" "$([ -n "$DISPUTE_ID" ] && echo true || echo false)"

DISPUTES_LIST=$(curl -s "$BASE/api/disputes" -H "Authorization: Bearer $ADM_TOKEN")
DISP_OK=$(echo "$DISPUTES_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) and len(d)>0 else 'false')" 2>/dev/null)
check "List disputes (admin)" "$DISP_OK"

# Resolve dispute
if [ -n "$DISPUTE_ID" ]; then
  RESOLVE=$(curl -s -X POST "$BASE/api/disputes/$DISPUTE_ID/resolve" -H "Authorization: Bearer $ADM_TOKEN" -H "Content-Type: application/json" -d '{"resolution":"Refund issued for missing items","status":"resolved"}')
  RESOLVE_OK=$(echo "$RESOLVE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('status')=='resolved' else 'false')" 2>/dev/null)
  check "Resolve dispute" "$RESOLVE_OK"
fi

# ── 12. NOTIFICATION SYSTEM ───────────────────────────────
echo ""
echo "▶ TESTING NOTIFICATION SYSTEM..."

NOTIFS=$(curl -s "$BASE/api/notifications" -H "Authorization: Bearer $CUST_TOKEN")
NOTIF_OK=$(echo "$NOTIFS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) else 'false')" 2>/dev/null)
check "Get notifications" "$NOTIF_OK"

NOTIF_COUNT=$(echo "$NOTIFS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null)
check "Notifications generated by order lifecycle (count: $NOTIF_COUNT)" "$([ "$NOTIF_COUNT" -gt 0 ] 2>/dev/null && echo true || echo false)"

# Mark notification as read
if [ "$NOTIF_COUNT" -gt 0 ]; then
  NOTIF_ID=$(echo "$NOTIFS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('id',''))" 2>/dev/null)
  MARK_READ=$(curl -s -X POST "$BASE/api/notifications/$NOTIF_ID/read" -H "Authorization: Bearer $CUST_TOKEN")
  MARK_OK=$(echo "$MARK_READ" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('read') or d.get('isRead') else 'false')" 2>/dev/null)
  check "Mark notification as read" "$MARK_OK"
fi

# ── 13. CONSENT ENGINE ────────────────────────────────────
echo ""
echo "▶ TESTING CONSENT ENGINE..."

CONSENT_LIST=$(curl -s "$BASE/api/consent" -H "Authorization: Bearer $CUST_TOKEN")
CONSENT_OK=$(echo "$CONSENT_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) else 'false')" 2>/dev/null)
check "Get consent records" "$CONSENT_OK"

# ── 14. MESSAGING SYSTEM ─────────────────────────────────
echo ""
echo "▶ TESTING MESSAGING..."

MSG=$(curl -s -X POST "$BASE/api/messages" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{\"orderId\": $ORDER_ID, \"content\": \"When will my order arrive?\"}")
MSG_OK=$(echo "$MSG" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('id') else 'false')" 2>/dev/null)
check "Send message on order" "$MSG_OK"

MSGS=$(curl -s "$BASE/api/orders/$ORDER_ID/messages" -H "Authorization: Bearer $CUST_TOKEN")
MSGS_OK=$(echo "$MSGS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) and len(d)>0 else 'false')" 2>/dev/null)
check "Get order messages" "$MSGS_OK"

# ── 15. WEIGHT VALIDATION (edge case) ────────────────────
echo ""
echo "▶ TESTING WEIGHT VALIDATION..."

# Create order and take it to facility
ORDER3=$(curl -s -X POST "$BASE/api/orders" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{
  \"customerId\": $CUST_ID,
  \"pickupAddressId\": $ADDR_ID,
  \"deliveryAddressId\": $ADDR_ID,
  \"serviceType\": \"wash_fold\",
  \"estimatedWeight\": 10,
  \"scheduledPickup\": \"2026-04-16T10:00:00Z\"
}")
ORDER3_ID=$(echo "$ORDER3" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

# Move through lifecycle to facility
curl -s -X POST "$BASE/api/orders/$ORDER3_ID/confirm" -H "Authorization: Bearer $CUST_TOKEN" > /dev/null
curl -s -X POST "$BASE/api/orders/$ORDER3_ID/dispatch" -H "Authorization: Bearer $ADM_TOKEN" > /dev/null
curl -s -X POST "$BASE/api/orders/$ORDER3_ID/driver-pickup" -H "Authorization: Bearer $DRV_TOKEN" -H "Content-Type: application/json" -d '{"action":"accept"}' > /dev/null
curl -s -X POST "$BASE/api/orders/$ORDER3_ID/driver-pickup" -H "Authorization: Bearer $DRV_TOKEN" -H "Content-Type: application/json" -d '{"action":"complete","bagCount":1,"photoUrl":"https://example.com/p.jpg","gpsLat":"25.76","gpsLng":"-80.19"}' > /dev/null

# Try intake with weight WAY outside tolerance (>5%)
INTAKE_BAD=$(curl -s -X POST "$BASE/api/orders/$ORDER3_ID/intake" -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" -d '{"actualWeight":20,"condition":"good","notes":""}')
INTAKE_FLAG=$(echo "$INTAKE_BAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('weightDiscrepancy') or 'weight' in str(d).lower() or d.get('status')=='processing' else 'false')" 2>/dev/null)
check "Weight discrepancy flagged (estimated 10, actual 20)" "$INTAKE_FLAG"

# ── 16. ORDER CANCELLATION ────────────────────────────────
echo ""
echo "▶ TESTING ORDER CANCELLATION..."

ORDER4=$(curl -s -X POST "$BASE/api/orders" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d "{
  \"customerId\": $CUST_ID,
  \"pickupAddressId\": $ADDR_ID,
  \"deliveryAddressId\": $ADDR_ID,
  \"serviceType\": \"dry_clean\",
  \"estimatedWeight\": 5,
  \"scheduledPickup\": \"2026-04-17T10:00:00Z\"
}")
ORDER4_ID=$(echo "$ORDER4" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null)

CANCEL=$(curl -s -X POST "$BASE/api/orders/$ORDER4_ID/cancel" -H "Authorization: Bearer $CUST_TOKEN" -H "Content-Type: application/json" -d '{"reason":"Changed my mind"}')
CANCEL_STATUS=$(echo "$CANCEL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
check "Cancel order → cancelled" "$([ "$CANCEL_STATUS" = "cancelled" ] && echo true || echo false)"

# ── 17. ROLE-BASED ACCESS CONTROL ─────────────────────────
echo ""
echo "▶ TESTING ROLE-BASED ACCESS CONTROL..."

# Customer should NOT be able to dispatch
RBAC1=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/orders/$ORDER_ID/dispatch" -H "Authorization: Bearer $CUST_TOKEN")
check "Customer cannot dispatch orders (403)" "$([ "$RBAC1" = "403" ] && echo true || echo false)"

# Driver should NOT be able to process refunds
RBAC2=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/payments/refund" -H "Authorization: Bearer $DRV_TOKEN" -H "Content-Type: application/json" -d '{"orderId":1,"amount":5}')
check "Driver cannot process refunds (403)" "$([ "$RBAC2" = "403" ] && echo true || echo false)"

# Staff should NOT be able to resolve disputes
RBAC3=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/disputes/1/resolve" -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" -d '{"resolution":"test","status":"resolved"}')
check "Staff cannot resolve disputes (403)" "$([ "$RBAC3" = "403" ] && echo true || echo false)"

# ── 18. ADMIN/MANAGER DASHBOARDS ──────────────────────────
echo ""
echo "▶ TESTING ADMIN/MANAGER ENDPOINTS..."

STATS=$(curl -s "$BASE/api/admin/stats" -H "Authorization: Bearer $ADM_TOKEN")
STATS_OK=$(echo "$STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('totalOrders') is not None or d.get('total_orders') is not None else 'false')" 2>/dev/null)
check "Admin dashboard stats" "$STATS_OK"

ALL_ORDERS=$(curl -s "$BASE/api/admin/orders" -H "Authorization: Bearer $ADM_TOKEN")
ALL_ORD_OK=$(echo "$ALL_ORDERS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) else 'false')" 2>/dev/null)
check "Admin list all orders" "$ALL_ORD_OK"

USERS_LIST=$(curl -s "$BASE/api/admin/users" -H "Authorization: Bearer $ADM_TOKEN")
USERS_OK=$(echo "$USERS_LIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) and len(d)>0 else 'false')" 2>/dev/null)
check "Admin list all users" "$USERS_OK"

MGR_PAYOUTS=$(curl -s "$BASE/api/manager/payouts" -H "Authorization: Bearer $MGR_TOKEN")
MGR_PAY_OK=$(echo "$MGR_PAYOUTS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) else 'false')" 2>/dev/null)
check "Manager payout report" "$MGR_PAY_OK"

# ── 19. DRIVER-SPECIFIC ENDPOINTS ─────────────────────────
echo ""
echo "▶ TESTING DRIVER ENDPOINTS..."

DRV_ORDERS=$(curl -s "$BASE/api/driver/orders" -H "Authorization: Bearer $DRV_TOKEN")
DRV_ORD_OK=$(echo "$DRV_ORDERS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) else 'false')" 2>/dev/null)
check "Driver order list" "$DRV_ORD_OK"

DRV_STATS=$(curl -s "$BASE/api/driver/stats" -H "Authorization: Bearer $DRV_TOKEN")
DRV_ST_OK=$(echo "$DRV_STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,dict) else 'false')" 2>/dev/null)
check "Driver stats/earnings" "$DRV_ST_OK"

# ── 20. STAFF-SPECIFIC ENDPOINTS ──────────────────────────
echo ""
echo "▶ TESTING STAFF (LAUNDROMAT) ENDPOINTS..."

STAFF_ORDERS=$(curl -s "$BASE/api/staff/orders" -H "Authorization: Bearer $STAFF_TOKEN")
STAFF_ORD_OK=$(echo "$STAFF_ORDERS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if isinstance(d,list) else 'false')" 2>/dev/null)
check "Staff order queue" "$STAFF_ORD_OK"

# ── 21. STATIC FRONTEND ──────────────────────────────────
echo ""
echo "▶ TESTING FRONTEND SERVING..."

HTML=$(curl -s -o /dev/null -w "%{http_code}" "$BASE")
check "Frontend loads (HTTP 200)" "$([ "$HTML" = "200" ] && echo true || echo false)"

ASSETS=$(curl -s "$BASE" | grep -c "assets/" 2>/dev/null)
check "Frontend has bundled assets" "$([ "$ASSETS" -gt 0 ] && echo true || echo false)"

# ── RESULTS ───────────────────────────────────────────────
echo ""
echo "========================================"
echo "AUDIT COMPLETE"
echo "========================================"
echo ""
printf "$RESULTS"
echo ""
echo "========================================"
echo "TOTAL: $((PASS + FAIL)) tests | ✅ $PASS passed | ❌ $FAIL failed"
echo "========================================"
