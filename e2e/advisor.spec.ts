import { test, expect, type Page } from "@playwright/test";

// [P-68 phase 2] Risk construction card, shadow risk-based sizing on the move
// card, and the PICKING_RP paper book — all against mocked APIs.

const advice = (over: Record<string, unknown>) => ({
  quantity: 10, avg_price: 100, last_price: 90, pnl_percent: -10, breakeven_gain_pct: 11,
  verdict: "HOLD", confidence: 70, trend_score: 20, reasons: ["x"], counter_case: null,
  stop_level: null, exit_target: null, market_regime: "AGGRESSIVE_BULL", trigger_type: "MACRO",
  indicators: {}, ...over,
});
const t = (symbol: string, drift: number) => ({ symbol, current_pct: 10, target_pct: 10 - drift, drift_pp: drift, risk_pct: 5 });
const RT = {
  asof: "2026-11-18", enb_now: 3.2, enb_target: 7.4, enb_floor: 6, below_floor: true, step: 0.25,
  regime: { drifted: true, corr_full: 0.3, corr_recent: 0.5 }, excluded: [], caps_infeasible: [],
  targets: [t("OV1", 9), t("OV2", 8), t("OV3", 7), t("OV4", 6), t("OV5", 5), t("OV6", 4), t("UN1", -9), t("UN2", -8), t("UN3", -7), t("UN4", -6), t("UN5", -5), t("UN6", -4)],
};
const base = (riskTargets: unknown) => ({
  runDate: "2026-11-18", runAt: "2026-11-18T04:20:00Z", isOfficial: true,
  rows: [
    advice({ symbol: "KSELL", verdict: "SELL", trend_score: -70, indicators: { risk_size: { target_pct: 4.2, current_pct: 9, sell_qty_to_target: 7 } } }),
    advice({ symbol: "KZERO", verdict: "SELL", trend_score: -60, indicators: { risk_size: { target_pct: 9, current_pct: 4, sell_qty_to_target: 0 } } }),
  ],
  portfolioRisk: null, calibration: null, thesisTrackRecord: null, heroPicks: null, sectorView: null,
  priorRunDate: null, changes: [], newNames: [], riskTargets,
});

async function mock(page: Page, riskTargets: unknown) {
  await page.addInitScript(() => localStorage.setItem("enc_token", "e2e"));
  await page.route(/\/api\/advisor\/track-record/, (r) => r.fulfill({ json: {} }));
  await page.route(/\/api\/advisor$/, (r) => r.fulfill({ json: base(riskTargets) }));
}

test("risk card: ENB, below-floor line, step, top over/under, as-of", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await mock(page, RT);
  await page.goto("/advisor");
  const c = page.getByTestId("risk-construction");
  await expect(c).toContainText("3.2");
  await expect(c).toContainText("7.4");
  await expect(c).toContainText("floor 6");
  await expect(c).toContainText("You hold 12 names but they act like ~3 independent bets");
  await expect(c).toContainText("correlations drifted: 25%");
  await expect(c).toContainText("OV1");
  await expect(c).toContainText("OV5");
  await expect(c).not.toContainText("OV6");
  await expect(c).toContainText("UN1");
  await expect(c).not.toContainText("UN6");
  await expect(c).toContainText("2026-11-18");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("risk card: calm step, no red line above floor", async ({ page }) => {
  await mock(page, { ...RT, below_floor: false, step: 0.5, regime: null });
  await page.goto("/advisor");
  const c = page.getByTestId("risk-construction");
  await expect(c).toContainText("calm: close 50% of the gap");
  await expect(c).not.toContainText("independent bets");
});

test("risk card absent when key missing", async ({ page }) => {
  await mock(page, null);
  await page.goto("/advisor");
  await expect(page.getByRole("button", { name: /KSELL/ }).first()).toBeVisible();
  await expect(page.getByTestId("risk-construction")).toHaveCount(0);
});

test("move card shows shadow risk-based sizing", async ({ page }) => {
  await mock(page, RT);
  await page.goto("/advisor");
  await page.getByRole("button", { name: /KSELL/ }).first().click();
  await expect(page.getByTestId("risk-size")).toContainText("risk-based (shadow): sell 7 to reach 4.2%");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /KZERO/ }).first().click();
  await expect(page.getByTestId("risk-size").first()).toContainText("at or below target");
});

test("accountability: PICKING_RP card, empty book graceful", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("enc_token", "e2e"));
  const empty = { curve: [], startEquity: null, endEquity: null, totalReturnPct: null, baselineReturnPct: null, alphaVsBaselinePct: null,
    closedTrades: 0, wins: 0, losses: 0, winRatePct: null, realizedPnl: 0, avgReturnPct: null, byVerdict: {}, bySource: {}, bestTrade: null, worstTrade: null, openPositions: [] };
  const withCurve = { ...empty, curve: [{ date: "2026-11-17", equity: 100000, baseline: 100000, nifty: 1, openPositions: 8 }, { date: "2026-11-18", equity: 101000, baseline: 100500, nifty: 1, openPositions: 8 }] };
  await page.route(/\/api\/advisor\/accountability/, (r) => r.fulfill({ json: { hasData: true, updatedAt: "2026-11-18", real: null,
    books: { MANAGEMENT: withCurve, PICKING: withCurve, PICKING_RP: empty } } }));
  await page.goto("/advisor/accountability");
  await expect(page.getByText("monthly rebalance to capped HRP weights vs the same money in Nifty 500")).toBeVisible();
  await expect(page.getByText(/not yet seeded/i)).toBeVisible();
});
