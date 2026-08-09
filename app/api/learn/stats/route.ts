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

export async function GET() {
  try {
    // [P-36] Aggregated in Postgres. This route used to pull every closed trade
    // into Node to compute four numbers.
    const { data, error } = await supabaseServer.rpc("learn_stats");
    if (error) throw new Error(error.message);
    const stats = data as Stats;

    return NextResponse.json({ stats });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
