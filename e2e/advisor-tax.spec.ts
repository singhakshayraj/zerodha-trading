import { test, expect } from "@playwright/test";

// [P-68 phase 1] tax-aware action chip on the move card + detail sheet lines.

const advice = (over: Record<string, unknown>) => ({
  quantity: 100, avg_price: 100, last_price: 90, pnl_percent: -10, breakeven_gain_pct: 11,
  verdict: "HOLD", confidence: 70, trend_score: 20, reasons: ["structure intact"], counter_case: null,
  stop_level: null, exit_target: null, market_regime: "AGGRESSIVE_BULL", trigger_type: "MACRO",
  indicators: {}, ...over,
});
const tax = (over: Record<string, unknown>) => ({
  action: null, ltcg_date: null, wait_days: null, tax_now_inr: 0, tax_after_inr: null, saving_inr: 0,
  wait_cost_inr: null, cost_inr: 0, lots: "known", unmatched_qty: 0, harvest_inr: 0, harvest_note: null, text: null, ...over,
});
const BODY = {
  runDate: "2026-11-17", runAt: "2026-11-17T04:20:00Z", isOfficial: true,
  rows: [
    advice({ symbol: "TSELL", verdict: "SELL", trend_score: -70, indicators: { tax: tax({
      action: "sell after 2027-01-07", ltcg_date: "2027-01-07", wait_days: 31, tax_now_inr: 6600, tax_after_inr: 2100, saving_inr: 4500,
      lots: "partial", unmatched_qty: 40,
      text: "after tax: sell after 2027-01-07 (31 days) · saves ₹4,500 vs ₹2,100 expected drift · lots: 60 of 100 dated" }) } }),
    advice({ symbol: "THOLD", indicators: { tax: tax({ ltcg_date: "2026-12-15" }) } }),
  ],
  portfolioRisk: null, calibration: null, thesisTrackRecord: null, heroPicks: null, sectorView: null,
  lessons: null, scorecard: null, priorRunDate: null, changes: [], newNames: [], brief: null, watchdog: null,
};

test("tax chip on move card, lines in sheet, HOLD unchanged", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("enc_token", "e2e"));
  await page.route(/\/api\/advisor\/track-record/, (r) => r.fulfill({ json: {} }));
  await page.route(/\/api\/advisor\/natwar$/, (r) => r.fulfill({ json: { ...BODY, rows: [] } }));
  await page.route(/\/api\/advisor$/, (r) => r.fulfill({ json: BODY }));
  await page.goto("/advisor");
  const sell = page.getByRole("button", { name: /TSELL/ });
  await expect(sell.getByText("after tax: sell after 2027-01-07 · saves ₹4.5k")).toBeVisible();
  await expect(page.getByRole("button", { name: /THOLD/ }).first()).not.toContainText("after tax");
  await sell.click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByText(/saves ₹4,500 vs ₹2,100 expected drift/)).toBeVisible();
  await expect(dlg.getByText("lots: 60 of 100 dated", { exact: true })).toBeVisible();
  await dlg.getByRole("button", { name: /close/i }).first().click();
  await page.getByRole("button", { name: /THOLD/ }).first().click();
  await expect(page.getByRole("dialog").getByText("LTCG from 2026-12-15")).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText("after tax");
});
