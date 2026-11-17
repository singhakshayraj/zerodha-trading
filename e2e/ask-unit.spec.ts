import { test, expect } from "@playwright/test";
import { parseRoute, questionHints, ask } from "../lib/ask/agent";
import { TOOLS } from "../lib/ask/tools";
import { parseMoves, simulate } from "../lib/ask/whatif";

// [P-54] Deterministic parts of the in-browser chat — no browser, no model.

const T = new Date("2026-11-13T10:00:00+05:30");

test("question hints: account, month, symbol without false positives", () => {
  expect(questionHints("How did my account do in October 2026?", [], T)).toEqual({ month: "2026-10" });
  expect(questionHints("How is the market doing?", [], T)).toEqual({});              // 'market' is not March
  expect(questionHints("may I see ATGL?", ["ATGL"], T)).toEqual({ symbol: "ATGL" });  // 'may I' is not May
  expect(questionHints("P&L in May 2026", [], T)).toEqual({ month: "2026-05" });
  expect(questionHints("why is iob a trim for natwar", ["IOB"], T)).toEqual({ account: "natwar", symbol: "IOB" });
  expect(questionHints("Dec numbers", [], T)).toEqual({ month: "2025-12" });          // future month -> last year
});

test("company names resolve to symbols", () => {
  expect(questionHints("If I sell Adani Total Gas, where should the money go?", [], T)).toEqual({ symbol: "ATGL" });
  expect(questionHints("what about adani ports?", [], T)).toEqual({ symbol: "ADANIPORTS" });   // unique two-word prefix
  expect(questionHints("Tata Motors Passenger Vehicles view", [], T).symbol).toBe("TMPV");     // longest match wins
  expect(questionHints("how is my book doing", [], T)).toEqual({});                         // no false positive
  expect(questionHints("why is ATGL a sell", ["ATGL"], T)).toEqual({ symbol: "ATGL" });      // symbol still wins
});

test("route parsing accepts only real tools and survives junk", () => {
  expect(parseRoute('{"tool":"pnl","args":{"month":"2026-10"}}')).toEqual({ tool: "pnl", args: { month: "2026-10" } });
  expect(parseRoute('<think>hmm</think> sure: {"tool":"explain_call","args":{"symbol":"ATGL","x":""}}'))
    .toEqual({ tool: "explain_call", args: { symbol: "ATGL" } });
  expect(parseRoute('{"tool":"drop_table","args":{}}').tool).toBeNull();
  expect(parseRoute("not json at all").tool).toBeNull();
});

const ADV = { runDate: "2026-11-12", rows: [
  { symbol: "ATGL", verdict: "SELL", trend_score: -60, confidence: 80, quantity: 10, last_price: 500, pnl_percent: -20,
    rotation_target_symbol: "PETRONET", rotation_sell_qty: 10, rotation_freed_inr: 5000, rotation_buy_qty: 15 },
  { symbol: "INFY", verdict: "HOLD", trend_score: 20, confidence: 70, quantity: 5, last_price: 1500, pnl_percent: 3 },
] };
const fetcher = async (p: string) => {
  if (p === "/advisor") return ADV;
  if (p.startsWith("/pnl")) return { daily: [
    { date: "2026-10-30", pnl: -1000, nifty_pnl: 500 }, { date: "2026-11-02", pnl: 2000, nifty_pnl: 1000 }], ledger: [], statements: [] };
  throw new Error("unexpected " + p);
};
const run = (name: string, args: Record<string, string> = {}) =>
  TOOLS.find((t) => t.name === name)!.run(args, { account: "primary", fetch: fetcher }) as Promise<Record<string, unknown>>;

test("tool summaries carry the exact numbers the model must repeat", async () => {
  const m = await run("moves_today");
  expect(m.summary).toContain("1 SELL and 0 TRIM");
  expect(m.summary).toContain("ATGL → PETRONET");
  const e = await run("explain_call", { symbol: "infy" });
  expect(e.summary).toContain("HOLD (keep, don't add)");
  expect((await run("explain_call", { symbol: "XYZ" })).error).toContain("not held");
  const p = await run("pnl", { month: "2026-11" });
  expect(p.summary).toContain("made ₹2,000 in 2026-11");
  expect(p.summary).toContain("₹1,000 ahead of the Nifty");
});

test("a symbol in the question overrides the model's route; no invented month", async () => {
  // A model that routes to pnl with an invented month, and to nothing for a stock question.
  const replies = ['{"tool":"pnl","args":{"month":"2026-11"}}', "ok", '{"tool":"none","args":{}}', "ok"];
  const chat = async () => replies.shift()!;
  const a = await ask("what was my best day?", { account: "primary", fetch: fetcher, knownSymbols: ["ATGL"] }, chat);
  expect(a.tool).toBe("pnl");
  expect(a.args.month).toBeUndefined();                     // month not in the question -> dropped
  const b = await ask("should I buy more ATGL?", { account: "primary", fetch: fetcher, knownSymbols: ["ATGL"] }, chat);
  expect(b.tool).toBe("explain_call");
  expect(b.args.symbol).toBe("ATGL");
});

test("what-if: parses plain moves and reports cash, sectors and caps", () => {
  const known = ["ATGL", "IOB", "UNIONBANK", "SBIN"];
  const { moves, errors } = parseMoves("sell 10 ATGL, buy ₹50k Petronet LNG in natwar; switch IOB to UNIONBANK", "primary", known);
  expect(errors).toEqual([]);
  expect(moves).toEqual([
    { account: "primary", action: "sell", symbol: "ATGL", qty: 10 },
    { account: "natwar", action: "buy", symbol: "PETRONET", inr: 50000 },
    { account: "primary", action: "sell", symbol: "IOB", all: true },
    { account: "primary", action: "buy", symbol: "UNIONBANK", all: true },
  ]);
  const books = {
    primary: [{ symbol: "ATGL", quantity: 100, last_price: 500 }, { symbol: "SBIN", quantity: 100, last_price: 800 }],
    natwar: [{ symbol: "IOB", quantity: 1000, last_price: 50 }, { symbol: "SBIN", quantity: 50, last_price: 800 }],
  };
  // Sell half of ATGL in primary, put it all into SBIN in natwar: PSU banks 70%->~85%, SBIN both accounts.
  const r = simulate([{ account: "primary", action: "sell", symbol: "ATGL", qty: 50 }, { account: "natwar", action: "buy", symbol: "SBIN", all: true }],
    books, { "PSU banks": 4.4 });
  expect(r.total_before).toBe(220000);
  expect(r.net_cash).toBe(0);
  const psu = r.sectors.find((l) => l.group === "PSU banks")!;
  expect(psu.before).toBe(77.3); expect(psu.after).toBe(88.6); expect(psu.breach).toBe(true);
  expect(r.breaches.some((b) => b.startsWith("PSU banks would be 88.6%"))).toBe(true);
  expect(r.breaches.some((b) => b.startsWith("SBIN would be"))).toBe(true);
  expect(r.summary).toContain("frees ₹0 net (sold ₹25,000, bought ₹25,000)");
  // Unknown symbol in a sell is reported, not silently dropped.
  expect(simulate([{ account: "primary", action: "sell", symbol: "XYZ", all: true }], books).errors[0]).toContain("XYZ is not held");
});

test("call_scores: one call's running score, or the lessons + day-20 scorecard", async () => {
  const call = { source: "advice", account: "primary", symbol: "ATGL", call: "SELL", entry: 612.5, days: 11,
    signed_alpha_pct: 8, mae_pct: -1, mfe_pct: 12, worst_day: 1, pair_pct: 9.7, target: "PETRONET", correct: true,
    early_wrong_days: 3, should_have_sold: false, path: [], context: { regime: null, trigger_type: null, confidence: null, reasons: [] } };
  const f = async (p: string) => {
    if (p === "/advisor/calls/days") return { days: [{ run_date: "2026-11-13", n: 9, scored_days: 1 }, { run_date: "2026-11-03", n: 9, scored_days: 11 }] };
    if (p.startsWith("/advisor/calls?date=2026-11-13")) return { run_date: "2026-11-13", calls: [] };
    if (p.startsWith("/advisor/calls?date=2026-11-03")) return { run_date: "2026-11-03", calls: [call] };
    if (p === "/advisor") return {
      lessons: { populations: { holdings: { lessons: [{ text: "SELL calls in CHOP: 10 of 40 right (25%) vs 53% overall, p=0.000" }] } } },
      scorecard: { by_source: { advice: { "20": { n: 50, hit_pct: 50, mean_alpha_pct: 0.2 } }, natwar: { "20": { n: 25, hit_pct: 48, mean_alpha_pct: -0.4 } } } } };
    throw new Error("unexpected " + p);
  };
  const tool = TOOLS.find((t) => t.name === "call_scores")!;
  const one = await tool.run({ symbol: "atgl" }, { account: "primary", fetch: f }) as Record<string, unknown>;
  expect(one.summary).toBe("SELL ATGL 2026-11-03: right, +8.0% vs Nifty after 11 days; worst point -1.0% on day 1 · switch +9.7% after costs");
  const all = await tool.run({}, { account: "primary", fetch: f }) as Record<string, unknown>;
  expect(all.summary).toBe("SELL calls in CHOP: 10 of 40 right (25%) vs 53% overall, p=0.000. Holdings calls: 49.3% right at day 20 over 75 calls, mean +0.0% vs Nifty.");
});

test("household: one-line summary of net worth, TWR vs Nifty, breaches, risk sources", async () => {
  const ret = { since: -6.1, start: "2026-08-10", bench_since: -5.2 };
  const f = async (p: string) => {
    if (p !== "/household") throw new Error("unexpected " + p);
    return { book: { net_worth: { total: 1000000 }, returns: { household: ret },
      xray: { sectors: [{ breach: true }, { breach: false }], sizes: [{ breach: false }], names: [{ breach: true }], etf_breach: false },
      risk: { effective_bets: 1.5 } } };
  };
  const tool = TOOLS.find((t) => t.name === "household")!;
  const r = await tool.run({}, { account: "primary", fetch: f }) as Record<string, unknown>;
  expect(r.summary).toBe("Household ₹10,00,000; since 2026-08-10 time-weighted -6.1% vs Nifty-equivalent -5.2%; 2 target breaches; independent risk sources 1.5.");
});
