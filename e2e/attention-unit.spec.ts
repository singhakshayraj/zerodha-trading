import { test, expect } from "@playwright/test";
import { attentionItems, flaggedSplit, type HouseholdBook } from "../lib/attention";

// Home "Needs your attention" rules — pure, no server.
const book = {
  asof: "2026-11-18",
  net_worth: { total: 0, by_account: {}, by_asset_class: {} },
  returns: {},
  xray: {
    sectors: [],
    sizes: [
      { size: "mid", pct: 39, index_pct: 23.3, drift_pp: 15.65, breach: true },
      { size: "large", pct: 34.9, index_pct: 66, drift_pp: -31.09, breach: true },
      { size: "small", pct: 19, index_pct: 10.5, drift_pp: 8.6, breach: false },
    ],
  },
  risk: { effective_bets: 1.53, n_used: 51, clusters: [{ symbols: ["PNB", "BANKBARODA", "BANKINDIA"], weight_pct: 12.4 }] },
  tax: {
    fy_realised: {}, unrealised_stcg: 0, unrealised_ltcg: 0, harvest: [],
    ltcg_calendar: [
      { symbol: "SILVERBEES", account: "primary", date: "2027-02-12", qty: 95 },
      { symbol: "BEL", account: "natwar", date: "2027-01-17", qty: 35 },
      { symbol: "PNB", account: "natwar", date: "2027-01-18", qty: 10 },
      { symbol: "OLD", account: "primary", date: "2026-11-01", qty: 1 },
    ],
  },
  rebalance: [],
  funds_unconfirmed: [],
} as HouseholdBook;

test("empty input → nothing to flag", () => {
  expect(attentionItems({ today: "2026-11-19" })).toEqual([]);
});

test("ranks and words every rule from real-shaped data", () => {
  const items = attentionItems({
    today: "2026-11-19",
    advice: {
      primary: [{ verdict: "SELL" }, { verdict: "SELL_ON_BOUNCE" }, { verdict: "TRIM" }, { verdict: "HOLD" }],
      natwar: [{ verdict: "TRIM" }],
    },
    ledgers: {
      primary: [{ kind: "ignored_call", impact_inr: -4515 }, { kind: "followed_sell", impact_inr: 900 }],
      natwar: [{ kind: "ignored_call", impact_inr: -8123 }],
    },
    book,
    enbFloor: 6,
    brief: { lines: [{ kind: "stale", warn: true, text: "Stale: no FII/DII row" }, { kind: "tape", warn: false, text: "x" }] },
    watchdog: { fails: 0 },
  });
  expect(items.map((i) => i.level)).toEqual(["act", "act", "watch", "watch", "data", "info"]);
  expect(items[0].text).toBe("2 sells and 2 trims are waiting.");
  expect(items[0].detail).toBe("Kanaklata 2 sell, 1 trim · Natwar 0 sell, 1 trim");
  expect(items[1].text).toBe("Calls you skipped have cost ₹12,638 so far.");
  expect(items[2].text).toBe("51 names behave like 1.5 independent bets.");
  expect(items[2].detail).toBe("Floor is 6. PNB, BANKBARODA and BANKINDIA (12.4%) move as one.");
  expect(items[3].text).toBe("Large caps are 35% of the book; the index is 66%.");
  expect(items[4].detail).toBe("no FII/DII row");
  expect(items[5].text).toBe("BEL (Natwar, 35 sh) turns long-term on 17 Jan.");
  expect(items[5].detail).toBe("Selling before then counts as short-term. 1 more lot within 60 days.");
});

test("skipped calls that paid off are not flagged", () => {
  const items = attentionItems({ today: "2026-11-19", ledgers: { primary: [{ kind: "ignored_call", impact_inr: 300 }] } });
  expect(items).toEqual([]);
});

test("flagged split sums value by call across accounts, biggest flagged first", () => {
  const { sum, top } = flaggedSplit({
    primary: [
      { symbol: "ATGL", verdict: "SELL", quantity: 10, last_price: 100 },
      { symbol: "SILVERBEES", verdict: "SELL_ON_BOUNCE", quantity: 1, last_price: 50 },
      { symbol: "IREDA", verdict: "HOLD", quantity: 5, last_price: 100 },
    ],
    natwar: [{ symbol: "TATASTEEL", verdict: "TRIM", quantity: 2, last_price: 1000 }],
  });
  expect(sum).toEqual({ sell: 1050, trim: 2000, hold: 500 });
  expect(top.map((f) => `${f.symbol}:${f.account}`)).toEqual(["TATASTEEL:natwar", "ATGL:primary", "SILVERBEES:primary"]);
});
