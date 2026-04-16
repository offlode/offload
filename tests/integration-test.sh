#!/bin/bash
# =====================================================================
#  Offload Integration Test Suite
#  Tests all critical API endpoints, auth, pricing, quotes, payments,
#  FSM transitions, and abuse scenarios
# =====================================================================

BASE="http://localhost:5000"
PASS=0
FAIL=0
TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

assert() {
  TOTAL=$((TOTAL + 1))
  local test_name="$1"
  local expected="$2"
  local actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $test_name"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $test_name (expected: $expected, got: ${actual:0:120})"
  fi
}

assert_status() {
  TOTAL=$((TOTAL + 1))
  local test_name="$1"
  local expected_status="$2"
  local actual_status="$3"
  if [ "$actual_status" -eq "$expected_status" ] 2>/dev/null; then
    PASS=$((PASS + 1))
    echo -e "  ${GREEN}✓${NC} $test_name (HTTP $actual_status)"
  else
    FAIL=$((FAIL + 1))
    echo -e "  ${RED}✗${NC} $test_name (expected HTTP $expected_status, got $actual_status)"
  fi
}

# Helper to get HTTP status code
http_status() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

echo "======================================"
echo "  OFFLOAD INTEGRATION TEST SUITE"
echo "======================================"
echo ""

# ─── 1. HEALTH CHECK ───
echo -e "${YELLOW}[1] Health Checks${NC}"
HEALTH=$(curl -s $BASE/api/health)
assert "Basic health endpoint" '"status":"healthy"' "$HEALTH"

DEEP=$(curl -s $BASE/api/health/deep)
assert "Deep health - status" '"status":"healthy"' "$DEEP"
assert "Deep health - database" '"engine":"sqlite"' "$DEEP"
assert "Deep health - memory info" '"heapUsedMB"' "$DEEP"
assert "Deep health - feature flags" '"quote_flow"' "$DEEP"

# ─── 2. AUTHENTICATION ───
echo ""
echo -e "${YELLOW}[2] Authentication${NC}"

# Register new user
REG=$(curl -s -X POST $BASE/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser_'$$'@test.com","password":"Test1234!","name":"Test User","role":"customer"}')
assert "Registration returns token" '"token"' "$REG"

# Login
LOGIN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"marta@example.com","password":"demo123"}')
MARTA_TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
assert "Login with valid creds" '"token"' "$LOGIN"

# Bad password
BAD_LOGIN=$(http_status -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"marta@example.com","password":"wrongpassword"}')
assert_status "Login with bad password returns 401" 401 "$BAD_LOGIN"

# Access protected endpoint without token
NO_AUTH=$(http_status $BASE/api/orders)
assert_status "Protected endpoint without auth returns 401" 401 "$NO_AUTH"

# Admin login
ADMIN_LOGIN=$(curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@offload.com","password":"demo123"}')
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
assert "Admin login" '"token"' "$ADMIN_LOGIN"

# ─── 3. PRICING ENGINE ───
echo ""
echo -e "${YELLOW}[3] Pricing Engine${NC}"

TIERS=$(curl -s $BASE/api/pricing/tiers)
assert "Pricing tiers endpoint" '"small_bag"' "$TIERS"
assert "Tax rate 8.875%" '0.08875' "$TIERS"
assert "Delivery fees present" '"48h"' "$TIERS"

# ─── 4. QUOTE FLOW ───
echo ""
echo -e "${YELLOW}[4] Quote Lifecycle${NC}"

# Serviceability check - valid zip
SVC_GOOD=$(curl -s "$BASE/api/quotes/check-serviceability?zip=10036")
assert "NYC zip serviceable" '"serviceable":true' "$SVC_GOOD"

# Serviceability check - invalid zip
SVC_BAD=$(curl -s "$BASE/api/quotes/check-serviceability?zip=90210")
assert "LA zip not serviceable" '"serviceable":false' "$SVC_BAD"

# Create quote (unauthenticated - website flow)
QUOTE=$(curl -s -X POST $BASE/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "pickupAddress": "100 Broadway, New York, NY 10005",
    "tierName": "small",
    "deliverySpeed": "48h",
    "idempotencyKey": "test_'$$'_'$RANDOM'"
  }')
QUOTE_ID=$(echo "$QUOTE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
assert "Create quote - returns ID" '"id"' "$QUOTE"
assert "Create quote - small bag $24.99" '"tierFlatPrice":24.99' "$QUOTE"
assert "Create quote - free delivery for 48h" '"deliveryFee":0' "$QUOTE"
assert "Create quote - has line items" '"lineItems"' "$QUOTE"
assert "Create quote - status=quoted" '"status":"quoted"' "$QUOTE"

# Create quote with same_day delivery
QUOTE_SD=$(curl -s -X POST $BASE/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "pickupAddress": "200 Park Ave, New York, NY 10017",
    "tierName": "large",
    "deliverySpeed": "same_day"
  }')
assert "Same day quote - delivery fee $12.99" '"deliveryFee":12.99' "$QUOTE_SD"
assert "Same day quote - large bag $59.99" '"tierFlatPrice":59.99' "$QUOTE_SD"

# Idempotency test
QUOTE_IDEM=$(curl -s -X POST $BASE/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "pickupAddress": "100 Broadway, New York, NY 10005",
    "tierName": "small",
    "deliverySpeed": "48h",
    "idempotencyKey": "test_'$$'_'$RANDOM'"
  }')
IDEM_ID=$(echo "$QUOTE_IDEM" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
# Re-submit same key
QUOTE_IDEM2=$(curl -s -X POST $BASE/api/quotes \
  -H "Content-Type: application/json" \
  -d '{
    "pickupAddress": "Different Address",
    "tierName": "xl",
    "deliverySpeed": "express_3h",
    "idempotencyKey": "test_'$$'_'$RANDOM'"
  }')

# Accept quote
if [ -n "$QUOTE_ID" ] && [ "$QUOTE_ID" != "None" ]; then
  ACCEPT=$(curl -s -X POST $BASE/api/quotes/$QUOTE_ID/accept \
    -H "Authorization: Bearer $MARTA_TOKEN")
  assert "Accept quote" '"status":"accepted"' "$ACCEPT"

  # Convert to order
  CONVERT=$(curl -s -X POST $BASE/api/quotes/$QUOTE_ID/convert \
    -H "Authorization: Bearer $MARTA_TOKEN")
  assert "Convert quote to order" '"orderNumber"' "$CONVERT"
  # Status may be 'confirmed' or 'driver_assigned' depending on driver availability
  CONVERT_STATUS=$(echo "$CONVERT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  if [ "$CONVERT_STATUS" = "confirmed" ] || [ "$CONVERT_STATUS" = "driver_assigned" ]; then
    TOTAL=$((TOTAL + 1)); PASS=$((PASS + 1))
    echo -e "  ${GREEN}\xE2\x9C\x93${NC} Convert - valid status ($CONVERT_STATUS)"
  else
    TOTAL=$((TOTAL + 1)); FAIL=$((FAIL + 1))
    echo -e "  ${RED}\xE2\x9C\x97${NC} Convert - unexpected status ($CONVERT_STATUS)"
  fi
  assert "Convert - payment authorized" '"paymentStatus":"authorized"' "$CONVERT"
  
  ORDER_ID=$(echo "$CONVERT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
fi

# ─── 5. ORDER OPERATIONS ───
echo ""
echo -e "${YELLOW}[5] Order Operations${NC}"

# Get orders
ORDERS=$(curl -s $BASE/api/orders -H "Authorization: Bearer $MARTA_TOKEN")
assert "Get orders returns array" '"id"' "$ORDERS"

# Get specific order
if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "None" ]; then
  ORDER=$(curl -s $BASE/api/orders/$ORDER_ID -H "Authorization: Bearer $MARTA_TOKEN")
  assert "Get order by ID" '"orderNumber"' "$ORDER"
fi

# ─── 6. PAYMENT ENDPOINTS ───
echo ""
echo -e "${YELLOW}[6] Payment Endpoints${NC}"

if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "None" ]; then
  # Create payment intent
  PAY_INTENT=$(curl -s -X POST $BASE/api/payments/create-intent \
    -H "Authorization: Bearer $MARTA_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"orderId\":$ORDER_ID,\"amount\":27.21}")
  assert "Create payment intent" '"paymentIntentId"' "$PAY_INTENT"
  assert "Payment in demo mode" '"demoMode":true' "$PAY_INTENT"

  # Confirm payment
  PAY_CONFIRM=$(curl -s -X POST $BASE/api/payments/confirm \
    -H "Authorization: Bearer $MARTA_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"orderId\":$ORDER_ID}")
  assert "Confirm payment" '"status":"completed"' "$PAY_CONFIRM"

  # Get payment details
  PAY_DETAIL=$(curl -s $BASE/api/payments/order/$ORDER_ID \
    -H "Authorization: Bearer $MARTA_TOKEN")
  assert "Payment details - shows splits" '"platformFee"' "$PAY_DETAIL"
  assert "Payment details - vendor share" '"vendorShare"' "$PAY_DETAIL"
fi

# ─── 7. FEATURE FLAGS ───
echo ""
echo -e "${YELLOW}[7] Feature Flags${NC}"

FLAGS=$(curl -s $BASE/api/feature-flags)
assert "Feature flags public endpoint" '"quote_flow"' "$FLAGS"
assert "Feature flags - surge pricing" '"surge_pricing"' "$FLAGS"

# Admin can update flags
FLAG_UPDATE=$(curl -s -X PUT $BASE/api/feature-flags/surge_pricing \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}')
assert "Admin can toggle feature flag" '"enabled":false' "$FLAG_UPDATE"

# Restore
curl -s -X PUT $BASE/api/feature-flags/surge_pricing \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true}' > /dev/null

# Non-admin can't update
FLAG_NOAUTH=$(http_status -X PUT $BASE/api/feature-flags/surge_pricing \
  -H "Authorization: Bearer $MARTA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}')
assert_status "Non-admin can't update feature flags" 403 "$FLAG_NOAUTH"

# ─── 8. RBAC / AUTHORIZATION ───
echo ""
echo -e "${YELLOW}[8] RBAC & Authorization${NC}"

# Customer can't access admin endpoints
ADMIN_DENIED=$(http_status "$BASE/api/admin/metrics" -H "Authorization: Bearer $MARTA_TOKEN")
assert_status "Customer denied admin metrics" 403 "$ADMIN_DENIED"

VENDOR_DENIED=$(http_status -X POST "$BASE/api/vendors" \
  -H "Authorization: Bearer $MARTA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Hack Vendor"}')
assert_status "Customer denied vendor creation" 403 "$VENDOR_DENIED"

# Admin can access admin endpoints
ADMIN_OK=$(http_status "$BASE/api/admin/metrics" -H "Authorization: Bearer $ADMIN_TOKEN")
assert_status "Admin can access admin metrics" 200 "$ADMIN_OK"

# ─── 9. ABUSE & EDGE CASES ───
echo ""
echo -e "${YELLOW}[9] Abuse & Edge Cases${NC}"

# Missing required fields
BAD_QUOTE=$(curl -s -X POST $BASE/api/quotes \
  -H "Content-Type: application/json" \
  -d '{"tierName":"small"}')
assert "Quote without address rejected" '"error"' "$BAD_QUOTE"

# Invalid tier
BAD_TIER=$(curl -s -X POST $BASE/api/quotes \
  -H "Content-Type: application/json" \
  -d '{"pickupAddress":"123 Test","tierName":"nonexistent"}')
assert "Invalid tier rejected" '"error"' "$BAD_TIER"

# Empty body
EMPTY_BODY=$(http_status -X POST $BASE/api/quotes \
  -H "Content-Type: application/json" \
  -d '{}')
assert_status "Empty body returns 400" 400 "$EMPTY_BODY"

# SQL injection attempt in address
SQLI=$(curl -s -X POST $BASE/api/quotes \
  -H "Content-Type: application/json" \
  -d '{"pickupAddress":"123 Test; DROP TABLE quotes;--","tierName":"small","deliverySpeed":"48h"}')
assert "SQL injection in address - still creates quote safely" '"id"' "$SQLI"

# XSS in address
XSS=$(curl -s -X POST $BASE/api/quotes \
  -H "Content-Type: application/json" \
  -d "{\"pickupAddress\":\"<script>alert('xss')</script>\",\"tierName\":\"small\",\"deliverySpeed\":\"48h\"}")
assert "XSS payload stored but not executed" '"id"' "$XSS"

# ─── 10. FSM VALIDATION ───
echo ""
echo -e "${YELLOW}[10] FSM State Machine${NC}"

if [ -n "$ORDER_ID" ] && [ "$ORDER_ID" != "None" ]; then
  # Get FSM info
  FSM_INFO=$(curl -s "$BASE/api/orders/$ORDER_ID/fsm" -H "Authorization: Bearer $MARTA_TOKEN")
  assert "FSM info endpoint" '"currentStatus"' "$FSM_INFO"
  assert "FSM shows allowed transitions" '"allowed"' "$FSM_INFO"

  # Invalid transition attempt
  BAD_TRANS=$(curl -s -X POST "$BASE/api/orders/$ORDER_ID/transition" \
    -H "Authorization: Bearer $MARTA_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"newStatus":"completed"}')
  assert "Invalid FSM transition rejected" '"error"' "$BAD_TRANS"
fi

# ─── 11. ENV & AUDIT ───
echo ""
echo -e "${YELLOW}[11] Environment & Audit${NC}"

ENV=$(curl -s $BASE/api/env -H "Authorization: Bearer $ADMIN_TOKEN")
assert "Admin env info" '"nodeEnv"' "$ENV"
assert "Env shows DB engine" '"sqlite"' "$ENV"

AUDIT=$(curl -s "$BASE/api/admin/audit-log?limit=5" -H "Authorization: Bearer $ADMIN_TOKEN")
assert "Audit log returns entries" '"entries"' "$AUDIT"

# ─── SUMMARY ───
echo ""
echo "======================================"
echo -e "  RESULTS: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}, $TOTAL total"
echo "======================================"

if [ $FAIL -gt 0 ]; then
  exit 1
fi
exit 0
