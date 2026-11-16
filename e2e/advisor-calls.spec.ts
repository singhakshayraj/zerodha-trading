import { test, expect, type Page } from "@playwright/test";

// [P-60] /advisor/calls against mocked APIs: day rows with the one-sentence
// verdict, the path on tap, the lessons panel and the unscored-day copy.

const path = [-1, -1, -1, 8, 9.5, 12, 12, 12, 12, 12, 8].map((a, i) => ({
  date: `2026-11-${String(4 + i).padStart(2, "0")}`, td: i + 1, signed_alpha_pct: a, nifty_pct: i + 1 }));
const ATGL = {
  source: "advice", account: "primary", symbol: "ATGL", call: "SELL", entry: 612.5, days: 11,
  signed_alpha_pct: 8, mae_pct: -1, mfe_pct: 12, worst_day: 1, pair_pct: 9.7, target: "PETRONET",
  correct: true, early_wrong_days: 3, should_have_sold: false, sector_alpha_pct: 6.5, size_alpha_pct: 2.1, path,
  context: { regime: "AGGRESSIVE_BULL", trigger_type: "MACRO", confidence: 72, reasons: ["below 50-DMA"] },
};
const HOLDER = { ...ATGL, symbol: "KHOLD", call: "HOLD", signed_alpha_pct: -12.4, mae_pct: -12.4, worst_day: 11, sector_alpha_pct: null,
  pair_pct: null, target: null, correct: false, should_have_sold: true };
const NATCALL = { ...ATGL, symbol: "NONLY", account: "natwar", pair_pct: null, target: null };

async function mockCalls(page: Page) {
  await page.addInitScript(() => localStorage.setItem("enc_token", "e2e"));
  await page.route(/\/api\/advisor$/, (r) => r.fulfill({ json: {
    lessons: { asof: "2026-11-15", checkpoint: 20, new: [], cleared: [], populations: {
      holdings: { overall: { n: 271, hit_pct: 53.1, mean_alpha_pct: 0.4 }, buckets_scanned: 7, haircut: 0.007,
        lessons: [{ bucket: "verdict_regime", key: "SELL×CHOP", n: 40, hit_pct: 25, overall_hit_pct: 53.1, p: 0.0001,
          text: "SELL calls in CHOP: 10 of 40 right (25%) vs 53% overall, p=0.000" }], strengths: [], clearing: [] },
      universe: { overall: { n: 0, hit_pct: null, mean_alpha_pct: null }, buckets_scanned: 0, haircut: 0.05, lessons: [], strengths: [], clearing: [] } } },
    scorecard: { asof: "2026-11-15", by_source: { advice: { "5": { n: 120, hit_pct: 51.7, mean_alpha_pct: 0.3 },
      "20": { n: 75, hit_pct: 49.3, mean_alpha_pct: -0.2, hit_ci: [38.2, 60.9], alpha_ci: [-2.1, 1.6],
        sector: { n: 70, hit_pct: 55.7, mean_alpha_pct: 0.5, hit_ci: [44.0, 67.1], alpha_ci: [-1.0, 2.0] }, size: null } } } },
  } }));
  await page.route(/\/api\/advisor\/calls\/days/, (r) => r.fulfill({ json: { days: [
    { run_date: "2026-11-13", n: 530, scored_days: 0 }, { run_date: "2026-11-03", n: 50, scored_days: 11 }] } }));
  await page.route(/\/api\/advisor\/calls\?/, (r) => {
    const u = new URL(r.request().url());
    const calls = u.searchParams.get("date") === "2026-11-03" && u.searchParams.get("population") === "holdings" ? [HOLDER, ATGL, NATCALL] : [];
    return r.fulfill({ json: { run_date: u.searchParams.get("date"), calls } });
  });
}

test("calls page: day rows, path on tap, lessons, unscored day copy", async ({ page }) => {
  await mockCalls(page);
  await page.goto("/advisor/calls");
  await expect(page.getByText("SELL ATGL 2026-11-03: right, +8.0% vs Nifty after 11 days; worst point -1.0% on day 1 (vs sector +6.5%) · switch +9.7% after costs")).toBeVisible();
  await expect(page.getByText("HOLD KHOLD 2026-11-03: wrong, -12.4% vs Nifty after 11 days; worst point -12.4% on day 11 — should have sold")).toBeVisible();
  await expect(page.getByText(/NONLY/)).toHaveCount(0);                  // Natwar's call is under his chip
  await page.getByText("SELL ATGL 2026-11-03").click();
  await expect(page.getByTestId("call-path")).toBeVisible();
  await expect(page.getByTestId("lessons")).toContainText("SELL calls in CHOP: 10 of 40 right (25%) vs 53% overall, p=0.000");
  await expect(page.getByTestId("scorecard")).toContainText("49.3% [38–61]");
  await page.getByTestId("bench-toggle").getByRole("button", { name: "vs sector" }).click();
  await expect(page.getByTestId("scorecard")).toContainText("55.7% [44–67]");
  await page.getByTestId("bench-toggle").getByRole("button", { name: "vs Nifty" }).click();
  await page.getByRole("button", { name: "Natwar" }).click();
  await expect(page.getByText(/SELL NONLY 2026-11-03/)).toBeVisible();
  await page.getByRole("button", { name: "2026-11-13" }).click();
  await expect(page.getByText("No scored days yet — scores start the morning after the call.")).toBeVisible();
});
