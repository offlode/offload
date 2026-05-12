"""
v3 — Mirror exactly what worked in debug_login.py: login, then NAVIGATE within same context.
Key insight from debug: after login, the next page.goto() to a deep route renders correctly.
"""
import asyncio, re
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://offload-api-sandbox.onrender.com"
OUT = Path("/home/user/workspace/screenshots/v3")
OUT.mkdir(parents=True, exist_ok=True)

ACCOUNTS = {
    "customer": ("appreview@offloadusa.com", "AppReview2026!", ["/", "/schedule", "/orders", "/profile"]),
    "admin":    ("admin@offloadusa.com",     "OffloadAdmin2026!", ["/admin", "/admin/orders", "/admin/vendors", "/admin/drivers", "/admin/financial", "/admin/analytics", "/admin/review"]),
    "vendor":   ("vendor@offloadusa.com",    "OffloadVendor2026!", ["/staff", "/staff/queue", "/staff/orders"]),
    "driver":   ("driver@offloadusa.com",    "OffloadDriver2026!", ["/driver", "/driver/earnings", "/driver/trips"]),
}

VIEWPORTS = [("desktop", 1440, 900), ("mobile", 390, 844)]

def slug(p):
    s = p.strip("/").replace("/", "-") or "home"
    return re.sub(r"[^a-zA-Z0-9_-]", "", s)

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for role, (email, pw, routes) in ACCOUNTS.items():
            print(f"\n=== {role} ===")
            (OUT / role).mkdir(exist_ok=True)
            for label, w, h in VIEWPORTS:
                ctx = await browser.new_context(viewport={"width": w, "height": h})
                page = await ctx.new_page()
                # Login form
                await page.goto(f"{API}/login", wait_until="networkidle", timeout=60000)
                await page.wait_for_timeout(1500)
                await page.fill('input[type="email"]', email)
                await page.fill('input[type="password"]', pw)
                # Use button:has-text instead of submit, because submit might also be on register
                await page.locator('button:has-text("Log In"), button:has-text("Login"), button:has-text("Sign In")').first.click()
                await page.wait_for_timeout(6000)
                # Confirm session active
                me = await page.evaluate("""async () => { const r = await fetch('/api/auth/me', {credentials:'include'}); return r.status; }""")
                print(f"  [{label}] post-login /me = {me}, url = {page.url}")
                if me != 200:
                    print(f"  [{label}] LOGIN FAILED");
                    await ctx.close()
                    continue
                # Now navigate to each route via client-side history push to avoid auth race
                for route in routes:
                    fname = OUT / role / f"{slug(route)}_{label}.png"
                    try:
                        # Use SPA's wouter/history navigation — dispatch popstate after pushState
                        await page.evaluate(f"""() => {{
                            window.history.pushState(null, '', '{route}');
                            window.dispatchEvent(new PopStateEvent('popstate'));
                        }}""")
                        await page.wait_for_timeout(4500)
                        bl = await page.evaluate("() => document.body.innerText.length")
                        await page.screenshot(path=str(fname), full_page=True)
                        print(f"  [{label}] {route} -> body_chars={bl}, url={page.url[-50:]}")
                    except Exception as e:
                        print(f"  [{label}] {route} FAIL: {e}")
                await ctx.close()
        await browser.close()
    # report uniqueness
    import hashlib
    seen = {}
    for f in OUT.rglob("*.png"):
        h = hashlib.md5(f.read_bytes()).hexdigest()
        seen.setdefault(h, []).append(f.name)
    print(f"\nTotal files: {sum(len(v) for v in seen.values())}, unique: {len(seen)}")
    for h, names in seen.items():
        if len(names) > 1:
            print(f"  DUPE x{len(names)}: {names[:3]}")

asyncio.run(run())
