import { test, expect, type Page } from "@playwright/test";

// /household against a mocked API. All numbers are synthetic.

const series = Array.from({ length: 12 }, (_, i) => ({ date: `2026-08-${String(10 + i).padStart(2, "0")}`, index: 100 - i * 0.5 }));
const ret = (since: number) => ({ "1m": -2, "3m": -4, since, start: "2026-08-10", series, bench_1m: -1, bench_3m: -3, bench_since: -5,
  bench_start: "2026-08-10", bench_series: series.map((p) => ({ ...p, index: p.index + 1 })),
  max_drawdown: { pct: -8, peak: "2026-08-10", trough: "2026-10-20" }, xirr: -24.2, xirr_partial: true, xirr_note: "", xirr_since: "2026-08-10" });
const BOOK = {
  asof: "2026-11-01",
  net_worth: { total: 1000000, by_account: { primary: 600000, natwar: 400000, unknown: 0 }, by_asset_class: { equity: 900000, etf_gold_silver: 100000, fund_unconfirmed: 0 }, unpriced: [] },
  returns: { primary: ret(-6), natwar: ret(-6), household: ret(-6) },
  xray: {
    sectors: [{ name: "Banks", pct: 40, index_pct: 30, target_pct: 30, drift_pp: 10, breach: true }, { name: "IT", pct: 10, index_pct: 10, target_pct: 10, drift_pp: 0, breach: false }],
    sizes: [{ size: "large", pct: 80, index_pct: 70, drift_pp: 10, breach: false }],
    names: [{ symbol: "AAA", pct: 12, accounts: ["primary", "natwar"], breach: false }], etf_pct: 5, etf_breach: false },
  risk: { effective_bets: 1.5, top_contributors: [{ symbol: "AAA", risk_pct: 30, value_pct: 12 }], clusters: [{ symbols: ["AAA", "BBB"], weight_pct: 20, avg_corr: 0.8 }], n_used: 20, excluded: [] },
  tax: { fy_realised: { primary: 1000, natwar: null }, unrealised_stcg: 2000, unrealised_ltcg: 3000, by_account: {}, ltcg_calendar: [], harvest: [], unmatched: { primary: ["AAA"], natwar: [] } },
  rebalance: [{ kind: "trim", symbol: "AAA", account: "primary", qty: 10, freed_inr: 5000, tax_inr: 100, cost_inr: 10, reason: "Banks is 10pp over target" }, { kind: "underweight", sector: "Pharma", gap_pp: 4 }],
  funds_unconfirmed: ["Fund One", "Fund Two", "Fund Three"], targets_source: "default",
  sections_asof: { positions: "2026-11-01", returns: "2026-11-01", xirr_since: "2026-08-10", tax: "2026-11-01", risk: "2026-10-31" },
};
const LEDGER = [
  { account: "primary", symbol: "KANROW", trade_type: "buy", quantity: 5, price: 100, trade_date: "2026-10-30" },
  { account: "natwar", symbol: "NATROW", trade_type: "sell", quantity: 3, price: 200, trade_date: "2026-10-29" },
];

async function mock(page: Page, book: unknown = BOOK) {
  await page.addInitScript(() => localStorage.setItem("enc_token", "e2e"));
  await page.route(/\/api\/household$/, (r) => r.fulfill({ json: { book, targets: { source: "default" }, ledger: LEDGER } }));
}

test("household page: sections, no XIRR number under a year, breach, ledger filter", async ({ page }) => {
  await mock(page);
  await page.goto("/household");
  await expect(page.getByTestId("net-total")).toContainText("10,00,000");
  const ret1 = page.getByTestId("returns");
  await expect(ret1).toContainText("−6.0%");
  await expect(ret1).toContainText("Money-weighted return (XIRR) appears from 2027-08-10");
  await expect(ret1).not.toContainText("24.2");
  await expect(page.getByTestId("returns-chart")).toBeVisible();
  await expect(page.getByTestId("chart-legend")).toContainText("Household");
  await expect(page.getByTestId("chart-legend")).toContainText("Nifty-equivalent");
  await expect(page.getByTestId("risk")).toContainText("Most of the book moves together");
  await expect(page.getByTestId("breach-Banks")).toBeVisible();
  await expect(page.getByTestId("rebalance")).toContainText("Banks is 10pp over target");
  await expect(page.getByTestId("risk")).toContainText("Independent risk sources: 1.5 (of 20 holdings)");
  await expect(page.getByText("targets: default")).toBeVisible();
  await expect(page.getByText("KANROW")).toBeVisible();
  await page.getByTestId("ledger-filter").getByRole("button", { name: "Natwar" }).click();
  await expect(page.getByText("KANROW")).toHaveCount(0);
  await expect(page.getByText("NATROW")).toBeVisible();
  await expect(page.getByTestId("funds")).toContainText("3 funds unconfirmed");
});

test("household page: empty state when book is absent", async ({ page }) => {
  await mock(page, null);
  await page.goto("/household");
  await expect(page.getByText("The household book hasn't been built yet")).toBeVisible();
});

test("household page: sparse tax.unmatched and null effective bets do not crash", async ({ page }) => {
  await mock(page, { ...BOOK, tax: { ...BOOK.tax, unmatched: {} }, risk: { ...BOOK.risk, effective_bets: null } });
  await page.goto("/household");
  await expect(page.getByTestId("tax")).toBeVisible();
  await expect(page.getByText("undated lots")).toHaveCount(0);
  await expect(page.getByTestId("risk")).toContainText("Not enough shared price history to measure.");
});

test("household page: no-trims copy, size-mix note, underweight label", async ({ page }) => {
  await mock(page, { ...BOOK,
    xray: { ...BOOK.xray, sizes: [{ size: "large", pct: 80, index_pct: 60, drift_pp: 20, breach: true }] },
    rebalance: [{ kind: "underweight", sector: "Pharma", gap_pp: 4 }] });
  await page.goto("/household");
  const r = page.getByTestId("rebalance");
  await expect(r).toContainText("No trims proposed — no name or sector is over its cap.");
  await expect(r).toContainText("Size mix drifts from the index; that is shown above, not traded here.");
  await expect(r).not.toContainText("Nothing breaches your targets");
  await expect(r).toContainText("4.0pp under index weight");
});

test("household page: unknown tax, per-account positions date, short-window dash; older books tolerated", async ({ page }) => {
  await mock(page, { ...BOOK,
    returns: { ...BOOK.returns, household: { ...ret(-6), "1m": null, "3m": null } },
    rebalance: [{ kind: "trim", symbol: "AAA", account: "natwar", qty: 10, freed_inr: 5000, tax_inr: 0, cost_inr: 10, tax_known: false, unmatched_qty: 10, reason: "AAA 12% > 8% name cap" }],
    sections_asof: { ...BOOK.sections_asof, positions: "2026-10-30", positions_primary: "2026-11-01", positions_natwar: "2026-10-30" } });
  await page.goto("/household");
  await expect(page.getByTestId("rebalance")).toContainText("tax unknown (undated lots)");
  await expect(page.getByTestId("net")).toContainText("(Natwar as of 2026-10-30)");
  await expect(page.getByTestId("returns").locator("tr").last()).toContainText("—");
});

test("household page: older book without the new fields renders", async ({ page }) => {
  await mock(page);
  await page.goto("/household");
  await expect(page.getByTestId("rebalance")).toContainText("₹110");
  await expect(page.getByTestId("net")).not.toContainText("Natwar as of");
});

test("household page: underweight sector names a funded buy, or says why not", async ({ page }) => {
  await mock(page, { ...BOOK, rebalance: [
    { kind: "underweight", sector: "Healthcare", gap_pp: 6.4, gap_inr: 37000,
      buy: { symbol: "SAILIFE", score: 94, account: "natwar", qty: 21, price: 1751.5, inr: 36781.5 },
      note: null, ideas: ["SAILIFE", "PPLPHARMA"] },
    { kind: "underweight", sector: "Auto", gap_pp: 6.2, gap_inr: 84000, buy: null,
      note: "no sell proceeds left today — needs new money", ideas: ["ASAHIINDIA"] }] });
  await page.goto("/household");
  const r = page.getByTestId("rebalance-buys");
  await expect(r).toContainText("Buy 21 SAILIFE in Natwar");
  await expect(r).toContainText("Also scoring well: PPLPHARMA");
  await expect(r).toContainText("no sell proceeds left today — needs new money");
});
