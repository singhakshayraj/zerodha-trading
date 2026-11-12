// [P-54 spike] Fixed, read-only tools for the in-browser "Ask your book"
// chat. Each tool fetches from an existing API route (or a fixture in the
// eval) and returns a SMALL JSON slice — small models reason badly over big
// payloads, so the slicing here is the real work.

export type Account = "primary" | "natwar";
export type Fetcher = (path: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

type Row = {
  symbol: string; verdict: string; v1_verdict?: string | null; trend_score: number; confidence: number;
  quantity: number; last_price: number; pnl_percent: number | null; reasons?: string[]; counter_case?: string | null;
  rotation_target_symbol?: string | null; rotation_sell_qty?: number | null; rotation_freed_inr?: number | null;
  rotation_buy_qty?: number | null; rotation_buy_price?: number | null; sector_rule?: string | null;
  indicators?: { thesis?: { action: string; quality: number | null; reason: string; falsifier: string } | null; household?: string | null } | null;
};

export const ACCOUNT_LABEL: Record<Account, string> = { primary: "Kanaklata", natwar: "Natwar" };

const advisorPath = (a: Account) => (a === "natwar" ? "/advisor/natwar" : "/advisor");
const round = (n: number | null | undefined, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
const SELLISH = new Set(["SELL", "SELL_ON_BOUNCE", "TRIM"]);

export type ToolSpec = {
  name: string;
  description: string;
  args: Record<string, string>;          // arg -> description (all optional strings)
  run: (args: Record<string, string>, ctx: { account: Account; fetch: Fetcher }) => Promise<unknown>;
};

const acct = (args: Record<string, string>, ctx: { account: Account }): Account =>
  /natwar/i.test(args.account ?? "") ? "natwar" : /kanak|primary|mine|my/i.test(args.account ?? "") ? "primary" : ctx.account;

export const TOOLS: ToolSpec[] = [
  {
    name: "moves_today",
    description: "Today's SELL/TRIM calls with where the freed money should go (rotation target), shares and rupees.",
    args: { account: "kanaklata or natwar (default: the one on screen)" },
    async run(args, ctx) {
      const a = acct(args, ctx);
      const r = await ctx.fetch(advisorPath(a));
      const rows: Row[] = r.rows ?? [];
      const mv = rows.filter((x) => SELLISH.has(x.verdict));
      const nSell = mv.filter((x) => x.verdict !== "TRIM").length, nTrim = mv.length - nSell;
      const pairs = mv.filter((x) => x.rotation_target_symbol).map((x) => `${x.symbol} → ${x.rotation_target_symbol}`);
      return { account: ACCOUNT_LABEL[a], run_date: r.runDate,
        summary: `${ACCOUNT_LABEL[a]} has ${nSell} SELL and ${nTrim} TRIM calls today: ${mv.map((x) => x.symbol).join(", ") || "none"}.` +
          (pairs.length ? ` Suggested switches: ${pairs.join(", ")}.` : ""),
        moves: mv.map((x) => ({
          symbol: x.symbol, call: x.verdict, sell_qty: x.rotation_sell_qty ?? null,
          frees_inr: round(x.rotation_freed_inr, 0), buy_instead: x.rotation_target_symbol ?? null,
          buy_qty: x.rotation_buy_qty ?? null })) };
    },
  },
  {
    name: "explain_call",
    description: "Why one stock has its call: verdict, trend, reasons, the case against, 12-month thesis, sector layer, household note.",
    args: { symbol: "NSE symbol, e.g. ATGL (required)", account: "kanaklata or natwar" },
    async run(args, ctx) {
      const a = acct(args, ctx);
      const sym = (args.symbol ?? "").toUpperCase().replace(/[^A-Z0-9&-]/g, "");
      const r = await ctx.fetch(advisorPath(a));
      const x: Row | undefined = (r.rows ?? []).find((y: Row) => y.symbol === sym);
      if (!x) return { error: `${sym || "(no symbol)"} is not held in ${ACCOUNT_LABEL[a]}'s account` };
      const t = x.indicators?.thesis;
      const callWord: Record<string, string> = { SELL: "SELL", SELL_ON_BOUNCE: "SELL on a bounce", TRIM: "TRIM (sell part)", HOLD: "HOLD (keep, don't add)", INSUFFICIENT: "no call (not enough history)" };
      const summary = `The advisor's call on ${x.symbol} in ${ACCOUNT_LABEL[a]}'s account is ${callWord[x.verdict] ?? x.verdict}` +
        (x.v1_verdict && x.v1_verdict !== x.verdict ? ` (the base model said ${x.v1_verdict}; the sector layer changed it)` : "") +
        `. Trend score ${x.trend_score}, P&L ${round(x.pnl_percent)}%.` +
        (x.rotation_target_symbol ? ` Suggested switch: sell ${x.symbol}, buy ${x.rotation_target_symbol}.` : "") +
        (t ? ` 12-month view: ${t.action}.` : "");
      return { account: ACCOUNT_LABEL[a], summary, symbol: x.symbol, call: x.verdict, v1_call: x.v1_verdict ?? null,
        sector_rule: x.sector_rule ?? null, trend_score: x.trend_score, confidence: x.confidence,
        pnl_pct: round(x.pnl_percent), reasons: (x.reasons ?? []).slice(0, 3), case_against: x.counter_case ?? null,
        buy_instead: x.rotation_target_symbol ?? null, household_note: x.indicators?.household ?? null,
        thesis_12m: t ? { action: t.action, quality: t.quality, reason: t.reason, flips_if: t.falsifier } : null };
    },
  },
  {
    name: "holdings_summary",
    description: "Counts of SELL/TRIM/HOLD, biggest positions, best and worst P&L % in one account.",
    args: { account: "kanaklata or natwar" },
    async run(args, ctx) {
      const a = acct(args, ctx);
      const rows: Row[] = (await ctx.fetch(advisorPath(a))).rows ?? [];
      const val = (x: Row) => x.quantity * x.last_price;
      const tot = rows.reduce((s, x) => s + val(x), 0) || 1;
      const by = [...rows].sort((p, q) => (q.pnl_percent ?? 0) - (p.pnl_percent ?? 0));
      const counts: Record<string, number> = {};
      rows.forEach((x) => { counts[x.verdict] = (counts[x.verdict] ?? 0) + 1; });
      const big = [...rows].sort((p, q) => val(q) - val(p))[0];
      return { account: ACCOUNT_LABEL[a],
        summary: `${ACCOUNT_LABEL[a]} holds ${rows.length} stocks worth ₹${Math.round(tot).toLocaleString("en-IN")}. Today: ${(counts.SELL ?? 0) + (counts.SELL_ON_BOUNCE ?? 0)} SELL, ${counts.TRIM ?? 0} TRIM, ${counts.HOLD ?? 0} HOLD calls.` +
          (big ? ` Biggest position: ${big.symbol} (${round(val(big) / tot * 100)}%).` : ""),
        holdings: rows.length, value_inr: Math.round(tot), calls_by_type: counts,
        sell_calls: (counts.SELL ?? 0) + (counts.SELL_ON_BOUNCE ?? 0), trim_calls: counts.TRIM ?? 0,
        biggest: [...rows].sort((p, q) => val(q) - val(p)).slice(0, 5).map((x) => ({ symbol: x.symbol, weight_pct: round(val(x) / tot * 100) })),
        best_pnl: by.slice(0, 3).map((x) => ({ symbol: x.symbol, pnl_pct: round(x.pnl_percent) })),
        worst_pnl: by.slice(-3).reverse().map((x) => ({ symbol: x.symbol, pnl_pct: round(x.pnl_percent) })) };
    },
  },
  {
    name: "sector_weights",
    description: "Sector exposure: the account's weight vs the Nifty-500 weight, sector trend, overweight/underweight.",
    args: { account: "kanaklata or natwar", sector: "optional sector name to focus on, e.g. PSU banks" },
    async run(args, ctx) {
      const a = acct(args, ctx);
      const groups = ((await ctx.fetch(advisorPath(a))).sectorView?.groups ?? []) as {
        group: string; my_weight_pct: number; index_weight_pct: number | null; trend_median: number | null; held: { symbol: string }[] }[];
      const want = (args.sector ?? "").toLowerCase();
      const pick = want ? groups.filter((g) => g.group.toLowerCase().includes(want.replace(/s$/, ""))) : groups.filter((g) => g.my_weight_pct > 0);
      return { account: ACCOUNT_LABEL[a], sectors: pick.slice(0, 8).map((g) => ({ sector: g.group,
        you_pct: g.my_weight_pct, index_pct: g.index_weight_pct, trend: g.trend_median,
        tilt: g.index_weight_pct == null ? null : g.my_weight_pct - g.index_weight_pct >= 3 ? "overweight" : g.my_weight_pct - g.index_weight_pct <= -3 ? "underweight" : "in line",
        stocks: g.held.map((h) => h.symbol) })) };
    },
  },
  {
    name: "pnl",
    description: "Real-money profit/loss vs Nifty for a month or overall, plus best and worst day.",
    args: { account: "kanaklata or natwar", month: "optional YYYY-MM (default: all months)" },
    async run(args, ctx) {
      const a = acct(args, ctx);
      const r = await ctx.fetch(`/pnl?account=${a}`);
      const days = ((r.daily ?? []) as { date: string; pnl: number; nifty_pnl: number | null }[])
        .filter((d) => !args.month || d.date.startsWith(args.month));
      if (!days.length) return { account: ACCOUNT_LABEL[a], error: "no P&L days for that period" };
      const sum = (f: (d: (typeof days)[number]) => number) => Math.round(days.reduce((s, d) => s + f(d), 0));
      const best = days.reduce((p, d) => (d.pnl > p.pnl ? d : p)), worst = days.reduce((p, d) => (d.pnl < p.pnl ? d : p));
      const pl = sum((d) => d.pnl), nf = sum((d) => d.nifty_pnl ?? 0), period = args.month || `${days[0].date} to ${days[days.length - 1].date}`;
      const inr = (n: number) => `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN")}`;
      return { account: ACCOUNT_LABEL[a], period,
        summary: `${ACCOUNT_LABEL[a]}'s account ${pl >= 0 ? "made" : "lost"} ${inr(Math.abs(pl))} in ${period}. The Nifty on the same money would have ${nf >= 0 ? "made" : "lost"} ${inr(Math.abs(nf))}, so the account was ${inr(Math.abs(pl - nf))} ${pl - nf >= 0 ? "ahead of" : "behind"} the Nifty. Best day ${best.date} (${inr(Math.round(best.pnl))}), worst day ${worst.date} (${inr(Math.round(worst.pnl))}).`,
        account_profit_or_loss_inr: pl,
        what_nifty_would_have_made_inr: sum((d) => d.nifty_pnl ?? 0),
        account_minus_nifty_inr: sum((d) => d.pnl - (d.nifty_pnl ?? 0)), trading_days: days.length,
        best_day: { date: best.date, inr: Math.round(best.pnl) }, worst_day: { date: worst.date, inr: Math.round(worst.pnl) } };
    },
  },
  {
    name: "decisions",
    description: "How following or ignoring the advisor's calls worked out in rupees (followed / ignored / own trades).",
    args: { account: "kanaklata or natwar", kind: "optional: followed, ignored or own" },
    async run(args, ctx) {
      const a = acct(args, ctx);
      const led = ((await ctx.fetch(`/pnl?account=${a}`)).ledger ?? []) as { kind: string; symbol: string; date: string; impact_inr: number | null }[];
      const k = (args.kind ?? "").toLowerCase();
      const f = led.filter((x) => !k || x.kind.startsWith(k.startsWith("ignor") ? "ignored" : k));
      const total = (pre: string) => Math.round(led.filter((x) => x.kind.startsWith(pre)).reduce((s, x) => s + (x.impact_inr ?? 0), 0));
      const fo = total("followed"), ig = total("ignored");
      return { account: ACCOUNT_LABEL[a],
        summary: `Trades that followed the advisor's calls are ${fo >= 0 ? "ahead" : "behind"} by ₹${Math.abs(fo).toLocaleString("en-IN")} versus not trading. Sell calls that were ignored: holding on instead ${ig >= 0 ? "made" : "lost"} ₹${Math.abs(ig).toLocaleString("en-IN")} (so ignoring them ${ig >= 0 ? "was the better choice" : "cost money"}).`,
        followed_inr: fo, ignored_inr: ig, own_inr: total("own"),
        meaning: "followed: + means the trade beat staying put; ignored: + means holding paid",
        recent: f.slice(0, 6).map((x) => ({ date: x.date, kind: x.kind, symbol: x.symbol, impact_inr: x.impact_inr == null ? null : Math.round(x.impact_inr) })) };
    },
  },
  {
    name: "zerodha_statement",
    description: "Whether Zerodha's own P&L statement matches our records, and Zerodha's realized/unrealized P&L and charges.",
    args: { account: "kanaklata or natwar" },
    async run(args, ctx) {
      const a = acct(args, ctx);
      const st = ((await ctx.fetch(`/pnl?account=${a}`)).statements ?? []) as {
        period_from: string; period_to: string; summary: Record<string, number>;
        check_result: { sell_matched: number; sell_symbols: number; sell_mismatches: unknown[]; open_mismatches: unknown[] } | null }[];
      if (!st.length) return { account: ACCOUNT_LABEL[a], error: "no Zerodha statement uploaded" };
      return { account: ACCOUNT_LABEL[a], statements: st.map((s) => ({ period: `${s.period_from} to ${s.period_to}`,
        reconciled: s.check_result ? s.check_result.sell_mismatches.length + s.check_result.open_mismatches.length === 0 : null,
        sells_matched: s.check_result ? `${s.check_result.sell_matched}/${s.check_result.sell_symbols}` : null,
        realized_inr: s.summary["Realized P&L"] ?? null, unrealized_inr: s.summary["Unrealized P&L"] ?? null,
        charges_inr: s.summary["Charges"] ?? null })) };
    },
  },
  {
    name: "contrarian_picks",
    description: "Contrarian / hero picks: strong businesses the market is against, with the four gate numbers.",
    args: {},
    async run(_args, ctx) {
      const h = (await ctx.fetch("/advisor")).heroPicks;
      if (!h) return { error: "no contrarian picks published" };
      const slim = (p: { symbol: string; sector: string; dd_3y: number; pe: number | null; roce: number; net_cash_pct_mcap?: number; failed?: string[] }) =>
        ({ symbol: p.symbol, sector: p.sector, off_3y_high_pct: round(p.dd_3y * 100, 0), pe: p.pe, roce: p.roce, net_cash_pct: p.net_cash_pct_mcap ?? null, failed: p.failed?.[0] ?? null });
      return { asof: h.asof, picks: (h.picks ?? []).map(slim), near_misses: (h.near_misses ?? []).slice(0, 5).map(slim) };
    },
  },
];

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);
