import { test, expect } from "@playwright/test";
import { parseRoute, questionHints, ask } from "../lib/ask/agent";
import { TOOLS } from "../lib/ask/tools";

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
