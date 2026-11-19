import { test, expect } from "@playwright/test";

// Phone layout guard: no page may scroll sideways at a 360px Android width.
// Uses the real local APIs (needs .env.local), so run against a local server:
//   E2E_BASE_URL=http://localhost:3100 PW_CHANNEL=chrome npx playwright test e2e/mobile-layout.spec.ts
const PAGES = ["/", "/trading", "/insights", "/lab", "/autopsy", "/advisor", "/advisor/timeline",
  "/advisor/accountability", "/advisor/calls", "/portfolio", "/pnl", "/household", "/connect", "/learn"];

test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });

for (const url of PAGES) {
  test(`no sideways scroll at 360px: ${url}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("enc_token", "layout-check"));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const w = await page.evaluate(() => {
      const m = document.querySelector("main");
      return { doc: document.documentElement.scrollWidth, main: m ? m.scrollWidth - m.clientWidth : 0 };
    });
    expect(w.doc, "page wider than the phone").toBeLessThanOrEqual(360);
    expect(w.main, "main scrolls sideways").toBeLessThanOrEqual(0);
  });
}

// Swipe rows (.card-row) must open on their first card. A card inserted in front
// of an already-snapped one after data loads makes the browser re-snap past it.
test("swipe rows open on their first card", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("enc_token", "layout-check"));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const lefts = await page.evaluate(() => Array.from(document.querySelectorAll(".card-row"), (r) => r.scrollLeft));
  expect(lefts.length).toBeGreaterThan(0);
  expect(lefts.every((l) => l === 0), `scrollLeft per row: ${lefts}`).toBe(true);
});
