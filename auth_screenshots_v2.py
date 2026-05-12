"""
Wave 5b Part 26 — Authenticated screenshot capture v2.

This time we log in via the SPA's own /login form (so the auth-context fully
hydrates inside the React app) and then navigate to deep routes.
"""
import os, json, sys, asyncio, re
from pathlib import Path
from playwright.async_api import async_playwright

API = "https://offload-api-sandbox.onrender.com"
ADMIN = "https://offload-admin-sandbox.onrender.com"
OUT = Path("/home/user/workspace/screenshots/v3")
OUT.mkdir(parents=True, exist_ok=True)

ACCOUNTS = {
    "customer": ("appreview@offloadusa.com", "AppReview2026!"),
    "admin":    ("admin@offloadusa.com",     "OffloadAdmin2026!"),
    "vendor":   ("vendor@offloadusa.com",    "OffloadVendor2026!"),
    "driver":   ("driver@offloadusa.com",    "OffloadDriver2026!"),
}

ROUTES = {
    "customer": [(API, "/"), (API, "/schedule"), (API, "/orders"), (API, "/profile")],
    "admin":    [(API, "/admin"), (API, "/admin/orders"), (API, "/admin/vendors"),
                 (API, "/admin/drivers"), (API, "/admin/financial"), (API, "/admin/analytics"),
                 (API, "/admin/review")],
    "driver":   [(API, "/driver"), (API, "/driver/earnings"), (API, "/driver/trips")],
    "vendor":   [(API, "/staff"), (API, "/staff/queue"), (API, "/staff/orders")],
}

VIEWPORTS = [("desktop", 1440, 900), ("mobile", 390, 844)]

def slug(path):
    s = path.strip("/").replace("/", "-") or "home"
    return re.sub(r"[^a-zA-Z0-9_-]", "", s)

async def spa_login(page, host, email, pw):
    """Log in via the SPA's own /login form. Uses networkidle to ensure JS is hydrated."""
    try:
        await page.goto(f"{host}/login", wait_until="networkidle", timeout=60000)
    except Exception as e:
        print(f"   goto exception: {e}")
    await page.wait_for_timeout(2000)
    cnt = await page.locator('input[type="email"]').count()
    if cnt == 0:
        print(f"   no email input found on {host}")
        # Try to get body for debugging
        body = (await page.evaluate("() => document.body ? document.body.innerText.slice(0,200) : 'no body'"))
        print(f"   body: {body}")
        return False
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', pw)
    await page.click('button[type="submit"]')
    await page.wait_for_timeout(7000)
    me = await page.evaluate("""async () => {
        try { const r = await fetch('/api/auth/me', {credentials:'include'}); return r.status; } catch(e) { return 0; }
    }""")
    print(f"   /api/auth/me => {me}")
    return me == 200

async def capture():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for role, (email, pw) in ACCOUNTS.items():
            print(f"\n=== {role} ===")
            (OUT / role).mkdir(exist_ok=True)
            for label, w, h in VIEWPORTS:
                ctx = await browser.new_context(viewport={"width": w, "height": h})
                page = await ctx.new_page()
                ok = await spa_login(page, API, email, pw)
                if not ok:
                    print(f"  [{label}] login failed")
                    await ctx.close(); continue
                final = page.url
                print(f"  [{label}] post-login URL: {final}")
                for host, route in ROUTES.get(role, []):
                    url = host + route
                    fname = OUT / role / f"{slug(route)}_{label}.png"
                    try:
                        await page.goto(url, wait_until="networkidle", timeout=45000)
                        await page.wait_for_timeout(3500)
                        await page.screenshot(path=str(fname), full_page=True)
                        body_len = await page.evaluate("() => document.body.innerText.length")
                        print(f"  [{label}] {route} -> body_chars={body_len}, file={fname.name}")
                    except Exception as e:
                        print(f"  [{label}] {route} FAIL: {e}")
                await ctx.close()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(capture())
    files = list(OUT.rglob("*.png"))
    print(f"\nTOTAL: {len(files)} screenshots in {OUT}")
