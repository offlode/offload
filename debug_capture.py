import asyncio, httpx
from playwright.async_api import async_playwright

API = "https://offload-api-sandbox.onrender.com"

async def main():
    # Login
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(f"{API}/api/auth/login", json={"email":"admin@offloadusa.com","password":"OffloadAdmin2026!"})
        token = r.cookies.get("offload_session")
        print("token:", token[:16], "...")

    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        # Add cookie correctly
        await ctx.add_cookies([{
            "name": "offload_session", "value": token,
            "domain": "offload-api-sandbox.onrender.com",
            "path": "/", "httpOnly": True, "secure": True, "sameSite": "None",
        }])
        page = await ctx.new_page()
        page.on("console", lambda msg: print(f"[console.{msg.type}] {msg.text[:200]}"))
        page.on("pageerror", lambda err: print(f"[pageerror] {err}"))
        # Go to root first, wait for auth-context to hydrate, then deep navigate
        await page.goto(f"{API}/", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(3000)
        # Check auth state
        snippet0 = await page.evaluate("() => document.body.innerText.slice(0, 200)")
        print("after /:", snippet0)
        await page.goto(f"{API}/admin/review", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(5000)
        # Dump body innerText length and snippet
        body_text = await page.evaluate("() => document.body.innerText.length")
        snippet = await page.evaluate("() => document.body.innerText.slice(0, 500)")
        url = page.url
        print("final URL:", url)
        print("body length:", body_text)
        print("snippet:", snippet)
        await page.screenshot(path="/tmp/debug_admin_review.png", full_page=True)
        # Also check if /api/auth/me works from the browser context
        api_check = await page.evaluate("""async () => {
            const r = await fetch('/api/auth/me', { credentials: 'include' });
            return { status: r.status, body: (await r.text()).slice(0, 200) };
        }""")
        print("browser /api/auth/me:", api_check)
        await b.close()

asyncio.run(main())
