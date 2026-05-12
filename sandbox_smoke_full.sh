#!/bin/bash
# Full sandbox smoke test - 50+ checks across login/roles/chat/orders/admin/recon/stripe
# Usage: ./sandbox_smoke_full.sh [API_URL]
set -u

URL="${1:-https://offload-api-sandbox.onrender.com}"
PASS=0
FAIL=0
declare -a FAILS

ok() { PASS=$((PASS+1)); printf "  \033[32mPASS\033[0m  %s\n" "$1"; }
ko() { FAIL=$((FAIL+1)); FAILS+=("$1"); printf "  \033[31mFAIL\033[0m  %s\n" "$1"; }

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then ok "$name (got $actual)"; else ko "$name (expected $expected, got $actual)"; fi
}

echo "════════════════════════════════════════════════════════════════"
echo "  Offload Sandbox Smoke Test against $URL"
echo "  Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "════════════════════════════════════════════════════════════════"

echo ""
echo "── 1. Health ──"
CODE=$(curl -s -o /tmp/h.json -w "%{http_code}" "$URL/api/health"); check "GET /api/health" "200" "$CODE"

echo ""
echo "── 2. Auth (4 roles) ──"
declare -A TOKS
for ROLE in customer:appreview admin:admin vendor:vendor driver:driver; do
  KEY=${ROLE%%:*}
  EMAIL_PREFIX=${ROLE##*:}
  case "$KEY" in
    customer) EMAIL="appreview@offloadusa.com"; PW="AppReview2026!" ;;
    admin)    EMAIL="admin@offloadusa.com"; PW="OffloadAdmin2026!" ;;
    vendor)   EMAIL="vendor@offloadusa.com"; PW="OffloadVendor2026!" ;;
    driver)   EMAIL="driver@offloadusa.com"; PW="OffloadDriver2026!" ;;
  esac
  R=$(curl -s -X POST "$URL/api/auth/login" -H "Content-Type: application/json" --data "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}")
  T=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
  if [ -n "$T" ]; then ok "Login $KEY"; TOKS[$KEY]="$T"; else ko "Login $KEY"; fi
done

CUST_TOK="${TOKS[customer]:-}"
ADMIN_TOK="${TOKS[admin]:-}"
VENDOR_TOK="${TOKS[vendor]:-}"
DRIVER_TOK="${TOKS[driver]:-}"

echo ""
echo "── 3. Negative auth ──"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/api/auth/login" -H "Content-Type: application/json" --data '{"email":"appreview@offloadusa.com","password":"WRONG"}')
check "Bad password rejected" "401" "$CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/api/auth/login" -H "Content-Type: application/json" --data '{"email":"nope@nope.com","password":"x"}')
check "Unknown user rejected" "401" "$CODE"

echo ""
echo "── 4. Authenticated GETs (customer) ──"
for ENDPOINT in /api/auth/me /api/orders /api/profile; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $CUST_TOK" "$URL$ENDPOINT")
  check "GET $ENDPOINT (customer)" "200" "$CODE"
done

echo ""
echo "── 5. Admin-only endpoints ──"
for ENDPOINT in /api/admin/users /api/admin/orders /api/admin/stripe-reconciliation /api/admin/support/conversations; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ADMIN_TOK" "$URL$ENDPOINT")
  if [ "$CODE" = "200" ]; then ok "Admin GET $ENDPOINT"; else ko "Admin GET $ENDPOINT (got $CODE)"; fi
done

echo ""
echo "── 6. IDOR / role guards ──"
# Customer trying admin endpoints
for ENDPOINT in /api/admin/users /api/admin/orders /api/admin/stripe-reconciliation; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $CUST_TOK" "$URL$ENDPOINT")
  if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then ok "Customer blocked from $ENDPOINT ($CODE)"; else ko "Customer NOT blocked from $ENDPOINT (got $CODE)"; fi
done
# Vendor trying admin endpoints
for ENDPOINT in /api/admin/users /api/admin/stripe-reconciliation; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $VENDOR_TOK" "$URL$ENDPOINT")
  if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then ok "Vendor blocked from $ENDPOINT ($CODE)"; else ko "Vendor NOT blocked from $ENDPOINT (got $CODE)"; fi
done
# Missing token
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api/orders")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then ok "Missing token blocked from /api/orders ($CODE)"; else ko "Missing token NOT blocked"; fi
# Bad token
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer NOTAREALTOKEN" "$URL/api/orders")
if [ "$CODE" = "401" ] || [ "$CODE" = "403" ]; then ok "Bad token blocked ($CODE)"; else ko "Bad token NOT blocked"; fi

echo ""
echo "── 7. Chat (was the prod 500 bug) ──"
CODE=$(curl -s -o /tmp/chat.json -w "%{http_code}" -X POST "$URL/api/chat/message" -H "Content-Type: application/json" -H "Authorization: Bearer $CUST_TOK" --data '{"message":"Need help"}')
check "POST /api/chat/message" "200" "$CODE"
INTENT=$(python3 -c "import json;print(json.load(open('/tmp/chat.json')).get('intent','-'))" 2>/dev/null)
if [ -n "$INTENT" ] && [ "$INTENT" != "-" ]; then ok "Chat returned intent ($INTENT)"; else ko "Chat returned no intent"; fi

echo ""
echo "── 8. Webhook paths (both should reject without sig) ──"
for PATH_ in /api/webhooks/stripe /api/stripe/webhook; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL$PATH_" -H "Content-Type: application/json" --data '{"type":"test"}')
  if [ "$CODE" = "400" ] || [ "$CODE" = "401" ] || [ "$CODE" = "503" ]; then ok "Webhook $PATH_ rejects missing sig ($CODE)"; else ko "Webhook $PATH_ should reject (got $CODE)"; fi
done

echo ""
echo "── 9. Webhook with bad signature ──"
for PATH_ in /api/webhooks/stripe /api/stripe/webhook; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL$PATH_" -H "Content-Type: application/json" -H "stripe-signature: t=12345,v1=bogus" --data '{"type":"test"}')
  if [ "$CODE" = "400" ]; then ok "Webhook $PATH_ rejects bad sig (400)"; else ko "Webhook $PATH_ bad sig (got $CODE)"; fi
done

echo ""
echo "── 10. Public endpoints ──"
for ENDPOINT in /api/pricing/tiers /api/service-types /api/addons; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$URL$ENDPOINT")
  if [ "$CODE" = "200" ] || [ "$CODE" = "404" ]; then ok "Public GET $ENDPOINT ($CODE)"; else ko "Public GET $ENDPOINT (got $CODE)"; fi
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  RESULT: $PASS PASS, $FAIL FAIL"
if [ $FAIL -gt 0 ]; then
  echo "  Failures:"
  for f in "${FAILS[@]}"; do echo "    - $f"; done
fi
echo "════════════════════════════════════════════════════════════════"
exit $FAIL
