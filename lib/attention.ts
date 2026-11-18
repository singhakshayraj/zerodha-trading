// Home "Needs your attention" list. Pure (no fetch, no React) so the rules are
// unit-tested in e2e/attention-unit.spec.ts. Most urgent first.
import { inr } from "@/lib/format";

export const ACCOUNT_NAME: Record<string, string> = { primary: "Kanaklata", natwar: "Natwar" };

/** Fields of the brain's household_book_latest that the Home page reads. */
export type HouseholdBook = {
  asof: string;
  net_worth: { total: number; by_account: Record<string, number>; by_asset_class: Record<string, number> };
  returns: Record<string, {
    "1m": number | null; since: number | null; start: string;
    bench_1m: number | null; bench_since: number | null;
    max_drawdown?: { pct: number; peak: string; trough: string } | null;
  }>;
  xray: {
    sectors: { name: string; pct: number; index_pct: number }[];
    sizes: { size: string; pct: number; index_pct: number; drift_pp: number; breach: boolean }[];
  };
  risk: { effective_bets: number | null; n_used: number; clusters: { symbols: string[]; weight_pct: number }[] };
  tax: {
    fy_realised: Record<string, number | null>;
    unrealised_stcg: number; unrealised_ltcg: number;
    ltcg_calendar: { symbol: string; account: string; date: string; qty: number }[];
    harvest: { symbol: string; account: string; loss_inr: number }[];
  };
  rebalance: { kind: string; sector: string; gap_pp: number }[];
  funds_unconfirmed: unknown[];
};

export type Level = "act" | "watch" | "data" | "info";
export type AttentionItem = { level: Level; text: string; detail: string; href: string; link: string };

type Ledger = { kind: string; impact_inr: number | null }[];
export type AttentionInput = {
  today: string; // YYYY-MM-DD
  advice?: Record<string, { verdict: string }[] | null>; // by account
  ledgers?: Record<string, Ledger | null>;               // /pnl decision ledger, by account
  book?: HouseholdBook | null;
  enbFloor?: number | null;
  brief?: { lines: { kind: string; warn: boolean; text: string }[] } | null;
  watchdog?: { fails: number } | null;
};

const RANK: Record<Level, number> = { act: 0, watch: 1, data: 2, info: 3 };
const s = (n: number) => (n === 1 ? "" : "s");
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);
export const shortDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const andList = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function attentionItems(x: AttentionInput): AttentionItem[] {
  const out: AttentionItem[] = [];

  // 1. advisor moves waiting, both accounts
  const moves = Object.entries(x.advice ?? {}).flatMap(([acct, rows]) => {
    const sell = (rows ?? []).filter((r) => r.verdict === "SELL" || r.verdict === "SELL_ON_BOUNCE").length;
    const trim = (rows ?? []).filter((r) => r.verdict === "TRIM").length;
    return sell + trim > 0 ? [{ acct, sell, trim }] : [];
  });
  const sells = moves.reduce((a, m) => a + m.sell, 0), trims = moves.reduce((a, m) => a + m.trim, 0);
  if (sells + trims > 0) {
    const parts = [sells && `${sells} sell${s(sells)}`, trims && `${trims} trim${s(trims)}`].filter(Boolean);
    out.push({
      level: "act", href: "/advisor", link: "Advisor",
      text: `${parts.join(" and ")} ${sells + trims === 1 ? "is" : "are"} waiting.`,
      detail: moves.map((m) => `${ACCOUNT_NAME[m.acct] ?? m.acct} ${m.sell} sell, ${m.trim} trim`).join(" · "),
    });
  }

  // 2. what ignoring sell calls has cost (negative impact = holding lost money)
  const skipped = Object.entries(x.ledgers ?? {}).map(([acct, l]) => ({
    acct, inr: (l ?? []).filter((r) => r.kind === "ignored_call").reduce((a, r) => a + (r.impact_inr ?? 0), 0),
  })).filter((r) => r.inr !== 0);
  const skippedTotal = skipped.reduce((a, r) => a + r.inr, 0);
  if (skippedTotal < 0) {
    out.push({
      level: "act", href: "/pnl", link: "P&L",
      text: `Calls you skipped have cost ${inr(-skippedTotal)} so far.`,
      detail: skipped.map((r) => `${ACCOUNT_NAME[r.acct] ?? r.acct} ${inr(r.inr, { signed: true })}`).join(" · ") + ", marked to market",
    });
  }

  // 3. data checks that failed outright
  if (x.watchdog && x.watchdog.fails > 0) {
    out.push({ level: "watch", href: "/advisor", link: "Data checks",
      text: `${x.watchdog.fails} data check${s(x.watchdog.fails)} failed.`, detail: "Advice built on this data may be wrong." });
  }

  const b = x.book;
  if (b) {
    // 4. diversification below the floor
    const floor = x.enbFloor ?? 6, eb = b.risk.effective_bets;
    if (eb != null && eb < floor) {
      const c = b.risk.clusters[0];
      out.push({
        level: "watch", href: "/household", link: "Household",
        text: `${b.risk.n_used} names behave like ${eb.toFixed(1)} independent bets.`,
        detail: `Floor is ${floor}.` + (c ? ` ${andList(c.symbols)} (${c.weight_pct}%) move as one.` : ""),
      });
    }
    // 5. market-cap mix outside its band
    const breaches = b.xray.sizes.filter((z) => z.breach).sort((p, q) => Math.abs(q.drift_pp) - Math.abs(p.drift_pp));
    if (breaches.length) {
      const [f, ...rest] = breaches;
      const cap = (z: string) => z[0].toUpperCase() + z.slice(1);
      out.push({
        level: "watch", href: "/household", link: "Household",
        text: `${cap(f.size)} caps are ${Math.round(f.pct)}% of the book; the index is ${Math.round(f.index_pct)}%.`,
        detail: rest.map((z) => `${cap(z.size)} caps ${Math.round(z.pct)}% vs ${Math.round(z.index_pct)}%.`).concat("Outside the allowed band.").join(" "),
      });
    }
  }

  // 6. stale inputs the morning brief flagged
  for (const l of x.brief?.lines ?? []) {
    if (l.kind === "stale" && l.warn) {
      out.push({ level: "data", href: "/advisor", link: "Data checks", text: "Some data is stale.", detail: l.text.replace(/^Stale:\s*/, "") });
    }
  }
  if (b && b.funds_unconfirmed.length) {
    const n = b.funds_unconfirmed.length;
    out.push({ level: "data", href: "/household", link: "Household", text: `${n} fund holding${s(n)} need${n === 1 ? "s" : ""} confirming.`, detail: "Values may be off until confirmed." });
  }

  // 7. lots turning long-term within 60 days
  if (b) {
    const soon = b.tax.ltcg_calendar
      .filter((l) => days(x.today, l.date) >= 0 && days(x.today, l.date) <= 60)
      .sort((p, q) => p.date.localeCompare(q.date));
    if (soon.length) {
      const f = soon[0], more = soon.length - 1;
      out.push({
        level: "info", href: "/household", link: "Tax",
        text: `${f.symbol} (${ACCOUNT_NAME[f.account] ?? f.account}, ${f.qty} sh) turns long-term on ${shortDate(f.date)}.`,
        detail: "Selling before then counts as short-term." + (more ? ` ${more} more lot${s(more)} within 60 days.` : ""),
      });
    }
  }

  return out.sort((p, q) => RANK[p.level] - RANK[q.level]);
}
