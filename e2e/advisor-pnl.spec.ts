import { test, expect, type Page, type Route } from "@playwright/test";

// /advisor and /pnl against mocked APIs (no database): pins the decision-
// first layout, the household note, per-account labels, the statement badge
// and the stale-response guard on fast account toggling.

const advice = (over: Record<string, unknown>) => ({
  quantity: 10, avg_price: 100, last_price: 90, pnl_percent: -10, breakeven_gain_pct: 11,
  verdict: "HOLD", confidence: 70, trend_score: 20, reasons: ["structure intact"], counter_case: null,
  stop_level: null, exit_target: null, market_regime: "AGGRESSIVE_BULL", trigger_type: "MACRO",
  indicators: {}, ...over,
});

const PRIMARY = {
  runDate: "2026-11-12", runAt: "2026-11-12T04:20:00Z", isOfficial: true,
  rows: [
    advice({ symbol: "KSELL", verdict: "SELL", trend_score: -70, rotation_target_symbol: "KBUY",
      rotation_target_score: 90, rotation_sell_qty: 10, rotation_freed_inr: 900, rotation_buy_qty: 8, rotation_buy_price: 100 }),
    advice({ symbol: "KNOPLAN", verdict: "SELL", trend_score: -60,
      indicators: { household: "skipped LTTS: LTTS already 6.6% across accounts" } }),
    advice({ symbol: "KHOLD" }),
  ],
  portfolioRisk: null, calibration: null, thesisTrackRecord: null, heroPicks: null,
  sectorView: { run_date: "2026-11-12", scan_date: "2026-11-12", groups: [
    { group: "PSU banks", names: 11, my_weight_pct: 9, index_weight_pct: 4.4, trend_median: 48, sell_pct: 9,
      mix: { sell: 1, trim: 3, hold: 7 }, quality_median: 73, gnpa_median: null, nnpa_median: null,
      held: [{ symbol: "KHOLD", verdict: "HOLD", weight_pct: 9 }] }] },
  priorRunDate: null, changes: [], newNames: [],
};
const NATWAR = {
  ...PRIMARY, isOfficial: null, preview: true, label: "Natwar",
  rows: [advice({ symbol: "NONLY", verdict: "TRIM", v1_verdict: "SELL", sector_trend: 46, sector_rule: "strong_sector_softens_sell" })],
};

async function mockAdvisor(page: Page, natwarDelayMs = 0) {
  await page.addInitScript(() => localStorage.setItem("enc_token", "e2e"));
  await page.route(/\/api\/advisor\/track-record/, (r) => r.fulfill({ json: {} }));
  await page.route(/\/api\/advisor\/natwar$/, async (r: Route) => {
    if (natwarDelayMs) await new Promise((res) => setTimeout(res, natwarDelayMs));
    await r.fulfill({ json: NATWAR });
  });
  await page.route(/\/api\/advisor$/, (r) => r.fulfill({ json: PRIMARY }));
}

test.describe("advisor (mocked)", () => {
  test("move card pairs sell with its buy; tile grid holds the rest", async ({ page }) => {
    await mockAdvisor(page);
    await page.goto("/advisor");
    const card = page.getByRole("button", { name: /KSELL.*KBUY/ });
    await expect(card).toBeVisible();
    await expect(page.getByRole("button", { name: /KHOLD/ }).first()).toBeVisible();
  });

  test("household note shows even when the row has no plan", async ({ page }) => {
    await mockAdvisor(page);
    await page.goto("/advisor");
    await page.getByRole("button", { name: /KNOPLAN/ }).click();
    await expect(page.getByRole("dialog")).toContainText("Both accounts as one book");
    await expect(page.getByRole("dialog")).toContainText("LTTS already 6.6% across accounts");
  });

  test("sector footer and run label are honest per account", async ({ page }) => {
    await mockAdvisor(page);
    await page.goto("/advisor");
    await expect(page.getByText(/does not change any verdict on this account/)).toBeVisible();
    await page.getByRole("button", { name: /^Natwar/ }).click();
    await expect(page.getByText(/sector layer \(under test\) adjusts calls/)).toBeVisible();
    await expect(page.getByText("v1: Sell")).toBeVisible();
    await expect(page.getByText("(intraday refresh)")).toHaveCount(0);
  });

  test("a slow Natwar response never lands under the Kanaklata tab", async ({ page }) => {
    await mockAdvisor(page, 2500);
    await page.goto("/advisor");
    await expect(page.getByRole("button", { name: /KSELL/ })).toBeVisible();
    await page.getByRole("button", { name: /^Natwar/ }).click();
    await page.getByRole("button", { name: /^Kanaklata/ }).click();
    await page.waitForTimeout(3500);                         // let the slow response arrive
    await expect(page.getByRole("button", { name: /KSELL/ })).toBeVisible();
    await expect(page.getByText("NONLY")).toHaveCount(0);
  });
});

const day = (date: string, pnl: number) => ({ date, pnl, value_open: 100000, value_close: 100000 + pnl,
  nifty_pnl: 100, buys_inr: 0, sells_inr: 0, fills: 0, missing_prices: null });
const PNL_PRIMARY = {
  account: "primary", firstFillDate: "2026-02-11",
  daily: [day("2026-11-11", 6527), day("2026-11-12", -1375)],
  ledger: [],
  statements: [
    { period_from: "2026-04-01", period_to: "2026-11-12", uploaded_at: "", summary: { "Realized P&L": -47479 },
      check_result: { sell_symbols: 36, sell_matched: 36, sell_mismatches: [], open_checked: true, open_mismatches: [],
        pending: [], fills_on_record_from: "2026-02-11", covers_period: true } },
    { period_from: "2025-04-01", period_to: "2026-03-31", uploaded_at: "", summary: {}, check_result: null },
  ],
};
const PNL_NATWAR = { ...PNL_PRIMARY, account: "natwar", statements: [], daily: [day("2026-11-12", 3726)] };

test.describe("pnl (mocked)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("enc_token", "e2e"));
    await page.route(/\/api\/pnl\?account=natwar/, async (r) => {
      await new Promise((res) => setTimeout(res, 2500));
      await r.fulfill({ json: PNL_NATWAR });
    });
    await page.route(/\/api\/pnl\?account=primary/, (r) => r.fulfill({ json: PNL_PRIMARY }));
  });

  test("statement badges: reconciled vs not checked", async ({ page }) => {
    await page.goto("/pnl");
    await expect(page.getByText("✓ reconciled")).toBeVisible();
    await expect(page.getByText("not checked")).toBeVisible();
    await expect(page.getByText(/✗ 0 differ/)).toHaveCount(0);
  });

  test("a slow Natwar response never replaces Kanaklata's P&L", async ({ page }) => {
    await page.goto("/pnl");
    await expect(page.getByText("✓ reconciled")).toBeVisible();
    await page.getByRole("button", { name: /^Natwar/ }).click();
    await page.getByRole("button", { name: /^Kanaklata/ }).click();
    await page.waitForTimeout(3500);
    await expect(page.getByText("✓ reconciled")).toBeVisible();   // still Kanaklata's statements
  });
});
