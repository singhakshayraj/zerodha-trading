import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ── Live numbers for the Learn page ──────────────────────────────────────────
// The Learn page teaches from THIS system, not from generic theory — so the
// figures it quotes have to be the real ones. Hard-coding them would mean the
// teaching material quietly starts lying the first time a session runs, which
// is the exact failure the VERIFY ledger exists to prevent elsewhere.
//
// Everything here is a plain aggregate. Concepts and architecture stay as prose
// in the page (they change rarely, and by hand); only the numbers are live.

type Stats = {
  closedTrades: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  avgR: number | null;
  totalPnl: number | null;
  tradingDays: number;
  firstTrade: string | null;
  lastTrade: string | null;
  sessions: number;
  decisions: number;
  adviceRows: number;
  candleRows: number;
  symbolsTraded: number;
  profitFactor: number | null;
};

/** Row count without pulling the rows — head:true sends no body. */
async function count(table: string): Promise<number> {
  const { count: n, error } = await supabaseServer
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: ${error.message}`);
  return n ?? 0;
}

export async function GET() {
  try {
    // Trade-level aggregates need the rows themselves (Postgrest has no SUM),
    // but the closed book is small enough that one paged read is fine.
    const rows: { pnl: number | null; r_multiple: number | null; created_at: string; symbol: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseServer
        .from("trades")
        .select("pnl, r_multiple, created_at, symbol")
        .eq("status", "CLOSED")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as typeof rows));
      if ((data?.length ?? 0) < 1000) break;
    }

    const withPnl = rows.filter((r) => r.pnl !== null);
    const wins = withPnl.filter((r) => Number(r.pnl) > 0);
    const losses = withPnl.filter((r) => Number(r.pnl) <= 0);
    const rs = rows.map((r) => r.r_multiple).filter((v): v is number => v !== null && Number.isFinite(Number(v)));

    // Profit factor = gross wins / gross losses. >1 means the winners paid for
    // the losers; this book has never been close.
    const grossWin = wins.reduce((s, r) => s + Number(r.pnl), 0);
    const grossLoss = Math.abs(losses.reduce((s, r) => s + Number(r.pnl), 0));

    const dates = rows.map((r) => String(r.created_at).slice(0, 10)).sort();

    const stats: Stats = {
      closedTrades: rows.length,
      wins: wins.length,
      losses: losses.length,
      winRatePct: withPnl.length ? (100 * wins.length) / withPnl.length : null,
      avgR: rs.length ? rs.reduce((s, v) => s + Number(v), 0) / rs.length : null,
      totalPnl: withPnl.length ? withPnl.reduce((s, r) => s + Number(r.pnl), 0) : null,
      tradingDays: new Set(dates).size,
      firstTrade: dates[0] ?? null,
      lastTrade: dates[dates.length - 1] ?? null,
      symbolsTraded: new Set(rows.map((r) => r.symbol)).size,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
      sessions: await count("trading_sessions"),
      decisions: await count("brain_decisions"),
      adviceRows: await count("portfolio_advice"),
      candleRows: await count("candles"),
    };

    return NextResponse.json({ stats });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
