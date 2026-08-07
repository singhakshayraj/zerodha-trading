import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The advisor paper-portfolio accountability read (P-14 phase 3). Two virtual
// books that ACT on the advisor's verdicts — MANAGEMENT (holdings + HOLD/SELL/
// TRIM/rotation, baseline = holdings frozen) and PICKING (fixed cash → buys the
// rotation/scan targets, baseline = Nifty B&H). We surface each book's equity
// curve vs its baseline plus the realized win/loss record. Aggregated here (a
// few hundred rows) rather than a DB view so the convention lives in one place
// next to the brain's advisor_paper.py.

type EquityRow = {
  book: string;
  snapshot_date: string;
  cash: number | null;
  positions_value: number | null;
  total_equity: number | null;
  baseline_equity: number | null;
  nifty_level: number | null;
  open_positions: number | null;
};

type ExecutionRow = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number | null;
  price_is_estimated: boolean;
  detected_at: string;
  verdict_at_time: string | null;
  followed_advice: boolean | null;
  notes: string | null;
};

type PositionRow = {
  book: string;
  symbol: string;
  source: string | null;
  verdict: string | null;
  qty: number;
  entry_price: number;
  entry_date: string;
  exit_price: number | null;
  exit_date: string | null;
  exit_reason: string | null;
  realized_pnl: number | null;
  return_pct: number | null;
  is_open: boolean;
};

const BOOKS = ["MANAGEMENT", "PICKING"] as const;
const r2 = (v: number) => Math.round(v * 100) / 100;

function summarize(equity: EquityRow[], positions: PositionRow[]) {
  const curve = equity
    .slice()
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    .map((e) => ({
      date: e.snapshot_date,
      equity: e.total_equity,
      baseline: e.baseline_equity,
      nifty: e.nifty_level,
      openPositions: e.open_positions,
    }));

  const first = curve[0];
  const last = curve[curve.length - 1];
  const startEq = first?.equity ?? null;
  const endEq = last?.equity ?? null;
  const totalReturnPct =
    startEq && endEq ? r2(((endEq - startEq) / startEq) * 100) : null;
  const baseReturnPct =
    first?.baseline && last?.baseline
      ? r2(((last.baseline - first.baseline) / first.baseline) * 100)
      : null;
  const alphaVsBaselinePct =
    totalReturnPct !== null && baseReturnPct !== null
      ? r2(totalReturnPct - baseReturnPct)
      : null;

  const closed = positions.filter(
    (p) => !p.is_open && p.realized_pnl !== null
  );
  const wins = closed.filter((p) => (p.realized_pnl ?? 0) > 0);
  const losses = closed.filter((p) => (p.realized_pnl ?? 0) <= 0);
  const realizedPnl = r2(closed.reduce((a, p) => a + (p.realized_pnl ?? 0), 0));
  const avgReturnPct = closed.length
    ? r2(closed.reduce((a, p) => a + (p.return_pct ?? 0), 0) / closed.length)
    : null;

  const bucket = (key: keyof PositionRow) => {
    const out: Record<string, { n: number; wins: number; pnl: number }> = {};
    for (const p of closed) {
      const k = String(p[key] ?? "—");
      const s = (out[k] ??= { n: 0, wins: 0, pnl: 0 });
      s.n += 1;
      if ((p.realized_pnl ?? 0) > 0) s.wins += 1;
      s.pnl = r2(s.pnl + (p.realized_pnl ?? 0));
    }
    return out;
  };

  const bySorted = [...closed].sort(
    (a, b) => (b.realized_pnl ?? 0) - (a.realized_pnl ?? 0)
  );

  return {
    curve,
    startEquity: startEq,
    endEquity: endEq,
    totalReturnPct,
    baselineReturnPct: baseReturnPct,
    alphaVsBaselinePct,
    closedTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: closed.length
      ? r2((wins.length / closed.length) * 100)
      : null,
    realizedPnl,
    avgReturnPct,
    byVerdict: bucket("verdict"),
    bySource: bucket("source"),
    bestTrade: bySorted[0] ?? null,
    worstTrade: bySorted[bySorted.length - 1] ?? null,
    openPositions: positions
      .filter((p) => p.is_open)
      .map((p) => ({
        symbol: p.symbol,
        source: p.source,
        verdict: p.verdict,
        qty: p.qty,
        entryPrice: p.entry_price,
        entryDate: p.entry_date,
      })),
  };
}

export async function GET() {
  try {
    const [{ data: eq, error: eqErr }, { data: pos, error: posErr }, { data: execs }] =
      await Promise.all([
        supabaseServer
          .from("advisor_paper_equity")
          .select("*")
          .order("snapshot_date", { ascending: true }),
        supabaseServer.from("advisor_paper_positions").select("*"),
        // [P-25] What the user ACTUALLY did, inferred from consecutive
        // holdings snapshots. Distinct from the paper books above: those
        // simulate the advice, this records reality. A read failure here must
        // not blank the page, so it is deliberately not error-checked.
        supabaseServer
          .from("user_executions")
          .select("*")
          .order("detected_at", { ascending: false })
          .limit(50),
      ]);

    if (eqErr) return NextResponse.json({ error: eqErr.message }, { status: 500 });
    if (posErr) return NextResponse.json({ error: posErr.message }, { status: 500 });

    const equity = (eq ?? []) as EquityRow[];
    const positions = (pos ?? []) as PositionRow[];

    const books: Record<string, ReturnType<typeof summarize>> = {};
    for (const b of BOOKS) {
      books[b] = summarize(
        equity.filter((e) => e.book === b),
        positions.filter((p) => p.book === b)
      );
    }

    const updatedAt =
      equity.length > 0 ? equity[equity.length - 1].snapshot_date : null;

    const executions = (execs ?? []) as ExecutionRow[];
    const followed = executions.filter((e) => e.followed_advice === true).length;
    const diverged = executions.filter((e) => e.followed_advice === false).length;

    return NextResponse.json({
      books,
      updatedAt,
      hasData: equity.length > 0,
      real: {
        executions,
        followed,
        diverged,
        // Only count rows where the advisor actually had an opinion —
        // buying something it never mentioned is neither obeyed nor defied.
        rate: followed + diverged > 0 ? followed / (followed + diverged) : null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
