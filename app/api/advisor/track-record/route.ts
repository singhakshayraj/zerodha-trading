import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// The advisor's accountability read: every evaluated verdict vs what the
// stock actually did over the backtest horizon. Aggregated here (few hundred
// rows at most) rather than a DB view so the scoring convention lives in one
// reviewable place alongside the brain's advisor_backtest.py.

const EXIT_WEIGHT: Record<string, number> = { SELL: 1, SELL_ON_BOUNCE: 1, TRIM: 0.5 };

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("portfolio_advice")
      .select(
        "run_date, symbol, verdict, quantity, last_price, outcome_return_pct, outcome_vs_nifty_pct, outcome_correct"
      )
      // is_official: the 2026-07-14 intraday refresh writes extra snapshot
      // rows per symbol/day that are never backtest-evaluated (evaluated_at
      // stays null on those), so this filter is redundant in practice — kept
      // explicit so this query's intent doesn't depend on that invariant.
      .eq("is_official", true)
      .not("evaluated_at", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const judged = (data ?? []).filter((r) => r.outcome_correct !== null);
    if (judged.length === 0) {
      return NextResponse.json({
        evaluatedCalls: 0, hitRatePct: null, avgReturnPct: null,
        avgAlphaPct: null, adviceValueInr: 0, byVerdict: {},
      });
    }

    const hits = judged.filter((r) => r.outcome_correct).length;
    const rets = judged.map((r) => r.outcome_return_pct).filter((v): v is number => v !== null);
    const alphas = judged.map((r) => r.outcome_vs_nifty_pct).filter((v): v is number => v !== null);

    let value = 0;
    const byVerdict: Record<string, { calls: number; hits: number }> = {};
    for (const r of judged) {
      const s = (byVerdict[r.verdict] ??= { calls: 0, hits: 0 });
      s.calls += 1;
      if (r.outcome_correct) s.hits += 1;
      const w = EXIT_WEIGHT[r.verdict];
      if (w && r.outcome_return_pct !== null) {
        // exit call: rupees saved = what the kept position would have lost
        value += w * (r.quantity ?? 0) * (r.last_price ?? 0) * (-r.outcome_return_pct / 100);
      }
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    return NextResponse.json({
      evaluatedCalls: judged.length,
      hitRatePct: Math.round((hits / judged.length) * 1000) / 10,
      avgReturnPct: avg(rets) !== null ? Math.round(avg(rets)! * 100) / 100 : null,
      avgAlphaPct: avg(alphas) !== null ? Math.round(avg(alphas)! * 100) / 100 : null,
      adviceValueInr: Math.round(value * 100) / 100,
      byVerdict,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
