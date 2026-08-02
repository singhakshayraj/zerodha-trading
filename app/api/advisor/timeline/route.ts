import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Per-stock observation timeline (agent P4 / [P-12]). The brain's per-stock
// agent writes one stock_observations row per holding per capture (pre-open /
// hourly / post-close), each carrying the price, trend_score and verdict at
// that moment. This data has been collected since the agent shipped but was
// never surfaced — this endpoint groups it per symbol into a verdict/price
// path the /advisor/timeline page renders. ADVISORY ONLY: observations never
// drive orders.

type Row = {
  symbol: string;
  observed_at: string;
  phase: string | null;
  price: number | null;
  trend_score: number | null;
  verdict: string | null;
};

const MAX_POINTS = 60; // per symbol; the tail is what matters as sessions add up

export async function GET() {
  try {
    // Pull the most recent observations, newest first, then regroup. A wide
    // cap keeps every active holding represented without an unbounded scan.
    const { data, error } = await supabaseServer
      .from("stock_observations")
      .select("symbol, observed_at, phase, price, trend_score, verdict")
      .order("observed_at", { ascending: false })
      .limit(2000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as Row[];
    const bySymbol = new Map<string, Row[]>();
    for (const r of rows) {
      const list = bySymbol.get(r.symbol) ?? [];
      if (list.length < MAX_POINTS) list.push(r);
      bySymbol.set(r.symbol, list);
    }

    const symbols = Array.from(bySymbol.entries()).map(([symbol, list]) => {
      // list is newest-first; the chart wants oldest-first.
      const points = list.slice().reverse().map((r) => ({
        observed_at: r.observed_at,
        price: r.price,
        trend_score: r.trend_score,
        verdict: r.verdict,
        phase: r.phase,
      }));
      const latest = list[0]; // newest
      return {
        symbol,
        latest_at: latest?.observed_at ?? null,
        latest_price: latest?.price ?? null,
        latest_score: latest?.trend_score ?? null,
        latest_verdict: latest?.verdict ?? null,
        count: points.length,
        points,
      };
    });

    // Freshest-observed symbols first — those are the ones with live reads.
    symbols.sort((a, b) => (b.latest_at ?? "").localeCompare(a.latest_at ?? ""));

    const updatedAt = symbols[0]?.latest_at ?? null;
    return NextResponse.json({ updatedAt, symbols });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "timeline fetch failed" },
      { status: 500 },
    );
  }
}
