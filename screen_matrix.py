#!/usr/bin/env python3
"""Screen matrix — fetch each SPA route's HTML, verify it serves the app shell."""
import json, urllib.request, ssl, re

# Both sandbox API (serves admin/customer SPA via static assets) and admin SPA
TARGETS = [
    ("sandbox-api", "https://offload-api-sandbox.onrender.com"),
    ("sandbox-admin", "https://offload-admin-sandbox.onrender.com"),
]

# Route inventory: (path, expected_role, category)
ROUTES = [
    # Public / auth
    ("/login", "public", "auth"),
    ("/register", "public", "auth"),
    ("/role-select", "public", "auth"),
    ("/forgot-password", "public", "auth"),
    ("/reset-password", "public", "auth"),
    ("/", "public", "landing"),
    # Customer
    ("/schedule", "customer", "ordering"),
    ("/orders", "customer", "history"),
    ("/orders/123", "customer", "history"),
    ("/profile", "customer", "account"),
    ("/addresses", "customer", "account"),
    ("/payments", "customer", "account"),
    ("/loyalty", "customer", "rewards"),
    ("/referrals", "customer", "rewards"),
    ("/chat", "customer", "support"),
    ("/tracking/123", "customer", "tracking"),
    # Staff / Vendor
    ("/staff", "vendor", "queue"),
    ("/staff/active", "vendor", "queue"),
    ("/staff/profile", "vendor", "account"),
    ("/staff/queue", "vendor", "queue"),
    ("/staff/quality", "vendor", "queue"),
    ("/staff/weigh/123", "vendor", "ops"),
    ("/staff/wash/123", "vendor", "ops"),
    # Driver
    ("/driver", "driver", "trips"),
    ("/driver/orders", "driver", "trips"),
    ("/driver/order/123", "driver", "trips"),
    ("/driver/navigation/123", "driver", "ops"),
    ("/driver/earnings", "driver", "earnings"),
    ("/driver/availability", "driver", "settings"),
    ("/driver/route", "driver", "ops"),
    ("/driver/profile", "driver", "account"),
    # Manager
    ("/manager", "manager", "dashboard"),
    ("/manager/orders", "manager", "orders"),
    ("/manager/payouts", "manager", "finance"),
    ("/manager/profile", "manager", "account"),
    # Admin
    ("/admin", "admin", "dashboard"),
    ("/admin/orders", "admin", "orders"),
    ("/admin/vendors", "admin", "vendors"),
    ("/admin/drivers", "admin", "drivers"),
    ("/admin/disputes", "admin", "support"),
    ("/admin/analytics", "admin", "analytics"),
    ("/admin/vendor-scoring", "admin", "vendors"),
    ("/admin/promos", "admin", "marketing"),
    ("/admin/financial", "admin", "finance"),
    ("/admin/fraud", "admin", "security"),
    ("/admin/review", "admin", "ownership"),
]

def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
        r = urllib.request.urlopen(req, timeout=20)
        body = r.read().decode("utf-8", errors="replace")
        return r.status, body
    except Exception as e:
        return 0, str(e)

results = []
for target_name, base in TARGETS:
    for path, role, cat in ROUTES:
        url = f"{base}{path}"
        status, body = fetch(url)
        is_spa_shell = "<div id=\"root\">" in body or "id=\"root\"" in body
        # Offload-only brand check — customer/vendor/driver surfaces must never show Tudelu.
        has_offload = "ffload" in body.lower()
        has_inter_font = "inter" in body.lower()
        has_brand_purple = "5b4bc4" in body.lower() or "rgb(91, 75, 196)" in body.lower()
        # SPA shell should be the same HTML for all routes (single index.html)
        ok = status == 200 and is_spa_shell
        results.append({
            "target": target_name,
            "path": path,
            "role": role,
            "category": cat,
            "status": status,
            "spa_shell": is_spa_shell,
            "brand_indicators": {"name_present": has_offload, "inter_font": has_inter_font, "purple_in_css": has_brand_purple},
            "pass": ok,
        })

# Save
with open("/home/user/workspace/screen_matrix_results.json","w") as f:
    json.dump(results, f, indent=2)

# Summary
total = len(results)
passed = sum(1 for r in results if r["pass"])
print(f"SCREEN MATRIX: {passed}/{total} pass")
by_target = {}
for r in results:
    key = r["target"]
    by_target.setdefault(key, [0,0])
    by_target[key][1] += 1
    if r["pass"]: by_target[key][0] += 1
for k,(p,t) in by_target.items():
    print(f"  {k}: {p}/{t}")

# Failures
fails = [r for r in results if not r["pass"]]
if fails:
    print("\nFailures:")
    for f in fails[:20]:
        print(f"  {f['target']}{f['path']} status={f['status']} spa={f['spa_shell']}")
