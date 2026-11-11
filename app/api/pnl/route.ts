import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// [P-51] Real-money P&L: daily mark-to-market rows + decision ledger written
// by the brain's reconcile.py. Read-only.
export async function GET(req: NextRequest) {
  const account = req.nextUrl.searchParams.get("account") === "natwar" ? "natwar" : "primary";
  try {
    const [daily, ledger, firstFill] = await Promise.all([
      supabaseServer.from("pnl_daily")
        .select("date, pnl, value_open, value_close, nifty_pnl, buys_inr, sells_inr, fills, missing_prices, computed_at")
        .eq("account", account).order("date", { ascending: true }),
      supabaseServer.from("decision_ledger")
        .select("kind, symbol, date, side, qty, price, call_run_date, call_verdict, rotation_from, impact_inr, impact_days, impact_asof")
        .eq("account", account).order("date", { ascending: false }),
      supabaseServer.from("tradebook").select("trade_date")
        .eq("account", account).order("trade_date", { ascending: true }).limit(1),
    ]);
    if (daily.error) throw daily.error;
    return NextResponse.json({
      account,
      daily: daily.data ?? [],
      ledger: ledger.data ?? [],
      firstFillDate: firstFill.data?.[0]?.trade_date ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
