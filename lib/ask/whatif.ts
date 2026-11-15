// [P-59] "What if" planner: a set of moves in plain text -> the household
// impact, computed in code (no model involved). Caps mirror brain
// household.py: sector 20%, a name held in both accounts 3%, any name 8%,
// ETF hedge sleeve 15% (reported only).

import SECTORS from "./sectors.json";
import { symbolFromName } from "./names";
import type { Account } from "./tools";

export type Position = { symbol: string; quantity: number; last_price: number };
export type Books = Record<Account, Position[]>;
export type Move = { account: Account; action: "sell" | "buy"; symbol: string; qty?: number; inr?: number; all?: boolean };

export const CAPS = { sector: 20, dup: 3, name: 8, etf: 15 };
const ETF = "ETFs (gold, silver, index)";
export const sectorOf = (s: string): string =>
  /BEES$|ETF|^HDFCSENSEX$/.test(s) ? ETF : ((SECTORS as Record<string, string>)[s] ?? "Outside Nifty 500");

const SYM = /\b[A-Z][A-Z0-9&-]{1,14}\b/;
const num = (t: string): number | null => {
  const m = t.replace(/,/g, "").match(/([\d.]+)\s*(k|l|lakh|lac|cr)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]), s = (m[2] ?? "").toLowerCase();
  return s === "k" ? n * 1e3 : s.startsWith("l") ? n * 1e5 : s === "cr" ? n * 1e7 : n;
};
const isInr = (t: string) => /₹|rs\.?|inr|k\b|lakh|lac\b|\bl\b|cr\b/i.test(t) || (num(t) ?? 0) >= 1000;

function sym(text: string, known: string[]): string | null {
  const up = text.toUpperCase();
  const t = up.match(new RegExp(SYM.source, "g"))?.find((x) => known.includes(x)) ?? null;
  if (t) return t;
  const byName = symbolFromName(text);
  if (byName) return byName;
  const any = up.replace(/\b(SELL|BUY|ALL|OF|IN|FOR|TO|AND|NATWAR|KANAKLATA|KANAK|SHARES|SH|SWITCH|MOVE)\b/g, " ").match(SYM);
  return any ? any[0] : null;
}

/** "sell 10 ATGL, buy ₹50k PETRONET in natwar; switch IOB to UNIONBANK" */
export function parseMoves(text: string, defaultAccount: Account, known: string[] = []): { moves: Move[]; errors: string[] } {
  const moves: Move[] = [], errors: string[] = [];
  for (const raw of text.split(/[,;\n]|\band\b|\bthen\b/i).map((s) => s.trim()).filter(Boolean)) {
    const account: Account = /natwar/i.test(raw) ? "natwar" : /kanak/i.test(raw) ? "primary" : defaultAccount;
    const item = raw.replace(/\b(in|for)\s+(natwar|kanak\w*)\b|\b(natwar|kanak\w*)'?s?\b:?/gi, " ").trim();
    const sw = item.match(/^(?:switch|move|rotate)?\s*(.+?)\s*(?:->|→|to|into)\s*(.+)$/i);
    if (sw && !/^(sell|buy)\b/i.test(item)) {
      const a = sym(sw[1], known), b = sym(sw[2], known);
      if (a && b) { moves.push({ account, action: "sell", symbol: a, all: true }, { account, action: "buy", symbol: b, all: true }); continue; }
    }
    const m = item.match(/^(sell|buy|add|exit)\s+(.*)$/i);
    if (!m) { errors.push(`couldn't read "${raw}"`); continue; }
    const action = /sell|exit/i.test(m[1]) ? "sell" : "buy";
    const rest = m[2];
    const s = sym(rest, known);
    if (!s) { errors.push(`no symbol in "${raw}"`); continue; }
    const amt = rest.replace(new RegExp(`\\b${s}\\b`, "i"), " ").replace(/\b(shares?|sh|of|worth)\b/gi, " ");
    const mv: Move = { account, action, symbol: s };
    if (/\ball\b/i.test(amt) || (action === "sell" && num(amt) == null)) mv.all = true;
    else if (num(amt) != null) { if (isInr(amt)) mv.inr = num(amt)!; else mv.qty = num(amt)!; }
    if (action === "buy" && mv.qty == null && mv.inr == null) mv.all = true;   // "buy X" after a sell = spend what was freed
    moves.push(mv);
  }
  return { moves, errors };
}

type Line = { group: string; before: number; after: number; index: number | null; breach: boolean };
export type WhatIf = {
  total_before: number; total_after: number; cash_freed: number; cash_deployed: number; net_cash: number;
  sectors: Line[]; names: { symbol: string; before: number; after: number; accounts: Account[]; breach: string | null }[];
  etf_pct: number; breaches: string[]; errors: string[]; summary: string;
};

export function simulate(moves: Move[], books: Books, indexWeights: Record<string, number | null> = {}): WhatIf {
  const errors: string[] = [];
  const price: Record<string, number> = {};
  const pos: Record<Account, Record<string, number>> = { primary: {}, natwar: {} };
  for (const a of ["primary", "natwar"] as const) for (const p of books[a] ?? []) { pos[a][p.symbol] = p.quantity; price[p.symbol] = p.last_price; }
  const value = () => Object.entries(pos).reduce((t, [, b]) => t + Object.entries(b).reduce((s, [k, q]) => s + q * (price[k] ?? 0), 0), 0);
  const total_before = value();
  let freed = 0, deployed = 0;
  for (const m of moves) {
    const px = price[m.symbol];
    if (m.action === "sell") {
      const held = pos[m.account][m.symbol] ?? 0;
      if (!held) { errors.push(`${m.symbol} is not held in ${m.account === "natwar" ? "Natwar" : "Kanaklata"}'s account`); continue; }
      const q = m.all ? held : m.inr != null ? Math.min(held, Math.floor(m.inr / px)) : Math.min(held, m.qty ?? 0);
      pos[m.account][m.symbol] = held - q;
      freed += q * px;
    } else {
      let inr = m.inr ?? (m.all ? Math.max(0, freed - deployed) : null);
      if (inr == null && m.qty != null) { if (!px) { errors.push(`no price on file for ${m.symbol} — give a ₹ amount`); continue; } inr = m.qty * px; }
      if (!inr) { errors.push(`how much ${m.symbol}? give shares or a ₹ amount`); continue; }
      const q = px ? inr / px : 0;
      if (px) pos[m.account][m.symbol] = (pos[m.account][m.symbol] ?? 0) + q;
      else { price[m.symbol] = 1; pos[m.account][m.symbol] = (pos[m.account][m.symbol] ?? 0) + inr; }   // unknown price: track by rupees
      deployed += inr;
    }
  }
  const total_after = value();
  const weights = (snapshot: Record<Account, Record<string, number>>, total: number) => {
    const sec: Record<string, number> = {}, nm: Record<string, { v: number; accts: Set<Account> }> = {};
    for (const a of ["primary", "natwar"] as const) for (const [k, q] of Object.entries(snapshot[a])) {
      const v = q * (price[k] ?? 0); if (v <= 0) continue;
      sec[sectorOf(k)] = (sec[sectorOf(k)] ?? 0) + v;
      (nm[k] ??= { v: 0, accts: new Set() }).v += v; nm[k].accts.add(a);
    }
    const pct = (v: number) => (total ? Math.round((v / total) * 1000) / 10 : 0);
    return { sec: Object.fromEntries(Object.entries(sec).map(([k, v]) => [k, pct(v)])),
      nm: Object.fromEntries(Object.entries(nm).map(([k, x]) => [k, { pct: pct(x.v), accts: Array.from(x.accts) }])) };
  };
  const before = weights(Object.fromEntries((["primary", "natwar"] as const).map((a) => [a, Object.fromEntries((books[a] ?? []).map((p) => [p.symbol, p.quantity]))])) as Books extends infer _ ? Record<Account, Record<string, number>> : never, total_before);
  const after = weights(pos, total_after);
  const touched = new Set(moves.map((m) => m.symbol));
  const sectors: Line[] = Object.keys({ ...before.sec, ...after.sec })
    .map((g) => ({ group: g, before: before.sec[g] ?? 0, after: after.sec[g] ?? 0, index: indexWeights[g] ?? null,
      breach: g !== ETF && g !== "Outside Nifty 500" && (after.sec[g] ?? 0) > CAPS.sector }))
    .filter((l) => l.before !== l.after || l.breach).sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  const names = Array.from(touched).map((s) => {
    const a = after.nm[s] ?? { pct: 0, accts: [] as Account[] }, b = before.nm[s]?.pct ?? 0;
    const breach = a.pct > CAPS.name ? `${s} would be ${a.pct}% of the household (cap ${CAPS.name}%)`
      : a.accts.length > 1 && a.pct > CAPS.dup ? `${s} held in both accounts at ${a.pct}% (duplicate cap ${CAPS.dup}%)` : null;
    return { symbol: s, before: b, after: a.pct, accounts: a.accts, breach };
  });
  const etf_pct = after.sec[ETF] ?? 0;
  const breaches = [...sectors.filter((l) => l.breach).map((l) => `${l.group} would be ${l.after}% (cap ${CAPS.sector}%)`),
    ...names.map((n) => n.breach).filter((x): x is string => !!x),
    ...(etf_pct > CAPS.etf ? [`ETF sleeve ${etf_pct}% (guide ${CAPS.etf}%)`] : [])];
  const net = freed - deployed;
  const fmt = (n: number) => "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");
  const secTxt = sectors.slice(0, 3).map((l) => `${l.group} ${l.before}%→${l.after}%${l.index != null ? ` (index ${l.index}%)` : ""}`).join(", ");
  const summary = (moves.length ? `After these moves: ${net >= 0 ? "frees" : "needs"} ${fmt(net)} net (sold ${fmt(freed)}, bought ${fmt(deployed)}). ` : "No moves understood. ")
    + (secTxt ? `Sectors: ${secTxt}. ` : "") + (breaches.length ? `Breaks: ${breaches.join("; ")}.` : moves.length ? "No caps broken." : "")
    + (errors.length ? ` Problems: ${errors.join("; ")}.` : "");
  return { total_before, total_after, cash_freed: freed, cash_deployed: deployed, net_cash: net, sectors, names, etf_pct, breaches, errors, summary };
}

/** Everything the planner needs from the two advisor payloads. */
export function booksFrom(primary: { rows?: Position[]; sectorView?: { groups?: { group: string; index_weight_pct: number | null }[] } } | null,
                          natwar: { rows?: Position[] } | null): { books: Books; indexWeights: Record<string, number | null>; known: string[] } {
  const books: Books = { primary: primary?.rows ?? [], natwar: natwar?.rows ?? [] };
  const indexWeights = Object.fromEntries((primary?.sectorView?.groups ?? []).map((g) => [g.group, g.index_weight_pct]));
  return { books, indexWeights, known: [...books.primary, ...books.natwar].map((p) => p.symbol) };
}
