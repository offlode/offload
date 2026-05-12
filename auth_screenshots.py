"""
Wave 5b Part 26 — Authenticated screenshot capture.

Logs into each role via /api/auth/login on the API, extracts the session cookie,
then uses Playwright to inject the cookie into the browser context BEFORE navigating
to protected routes. Captures desktop (1440x900) and mobile (390x844) variants.

Output: /home/user/workspace/screenshots/v3/<role>/<route-slug>_<viewport>.png
"""
import os, json, sys, asyncio, re
from pathlib import Path
import httpx
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

# Routes per role; (host, path)
ROUTES = {
    "customer": [(API, "/"), (API, "/schedule"), (API, "/orders"), (API, "/profile")],
    "admin":    [(API, "/admin"), (API, "/admin/orders"), (API, "/admin/vendors"),
                 (API, "/admin/drivers"), (API, "/admin/financial"), (API, "/admin/analytics"),
                 (API, "/admin/review"),  # the new owner review
                 (ADMIN, "/admin"), (ADMIN, "/admin/orders")],
    "driver":   [(API, "/driver"), (API, "/driver/earnings"), (API, "/driver/trips")],
    "vendor":   [(API, "/staff"), (API, "/staff/queue"), (API, "/staff/orders")],
}

VIEWPORTS = [("desktop", 1440, 900), ("mobile", 390, 844)]

def slug(path: str) -> str:
    s = path.strip("/").replace("/", "-") or "home"
    return re.sub(r"[^a-zA-Z0-9_-]", "", s)

async def login_and_get_cookies(role: str, email: str, password: str):
    """Log in via API and return cookie dict and which hosts to apply it to."""
    cookies = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
        r = await client.post(f"{API}/api/auth/login", json={"email": email, "password": password})
        if r.status_code != 200:
            print(f"  [!] {role} login {r.status_code}: {r.text[:200]}")
            return []
        for k, v in r.cookies.items():
            cookies.append({"name": k, "value": v})
        print(f"  [{role}] logged in: cookies={[c['name'] for c in cookies]}")
    return cookies

async def capture():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for role, (email, pw) in ACCOUNTS.items():
            print(f"\n=== {role} ===")
            cookie_kv = await login_and_get_cookies(role, email, pw)
            if not cookie_kv:
                continue
            (OUT / role).mkdir(exist_ok=True)
            for label, w, h in VIEWPORTS:
                ctx = await browser.new_context(viewport={"width": w, "height": h})
                # Apply cookies to BOTH hosts (api + admin) so we cover cross-host links
                for host in [API, ADMIN]:
                    domain = host.replace("https://", "")
                    apply = [{
                        "name": c["name"], "value": c["value"],
                        "domain": domain, "path": "/",
                        "httpOnly": True, "secure": True, "sameSite": "None",
                    } for c in cookie_kv]
                    try:
                        await ctx.add_cookies(apply)
                    except Exception as e:
                        print(f"   cookie set on {domain} failed: {e}")
                page = await ctx.new_page()
                for host, route in ROUTES.get(role, []):
                    url = host + route
                    fname = OUT / role / f"{slug(route)}_{'admspan' if host==ADMIN else 'api'}_{label}.png"
                    try:
                        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                        await page.wait_for_timeout(2500)  # let SPA hydrate
                        await page.screenshot(path=str(fname), full_page=True)
                        title = await page.title()
                        print(f"  [{label}] {url} -> {fname.name} (title='{title[:50]}')")
                    except Exception as e:
                        print(f"  [{label}] {url} FAIL: {e}")
                await page.close()
                await ctx.close()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(capture())
    files = list(OUT.rglob("*.png"))
    print(f"\nTOTAL: {len(files)} screenshots in {OUT}")
