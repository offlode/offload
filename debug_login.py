import asyncio
from playwright.async_api import async_playwright

API = "https://offload-api-sandbox.onrender.com"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        # Capture network responses for /api/auth/login
        page.on("response", lambda resp: (
            print(f"[net] {resp.status} {resp.request.method} {resp.url}")
            if "/auth/login" in resp.url or "/auth/me" in resp.url else None
        ))
        page.on("console", lambda m: print(f"[con.{m.type}] {m.text[:300]}"))
        await page.goto(f"{API}/login", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(1500)
        await page.fill('input[type="email"]', "admin@offloadusa.com")
        await page.fill('input[type="password"]', "OffloadAdmin2026!")
        # See all buttons
        btns = await page.evaluate("""() => Array.from(document.querySelectorAll('button')).map(b => ({text: b.innerText, type: b.type, dt: b.getAttribute('data-testid')}))""")
        print("buttons:", btns)
        # Click first submit
        await page.click('button[type="submit"]')
        await page.wait_for_timeout(6000)
        print("final URL:", page.url)
        print("body:", (await page.evaluate("() => document.body.innerText"))[:300])
        # Check cookie
        c = await ctx.cookies()
        print("cookies:", [(x['name'], x['domain'], x['secure'], x['sameSite']) for x in c])
        # Try fetching /api/auth/me in the page
        me = await page.evaluate("""async () => {
            const r = await fetch('/api/auth/me', {credentials:'include'});
            return {s: r.status, b: (await r.text()).slice(0,200)};
        }""")
        print("page /me:", me)
        await b.close()

asyncio.run(main())
