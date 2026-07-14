import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Latest portfolio-advisory run. ADVISORY ONLY — this data never drives
// orders; the brain writes one row per holding per day (portfolio_advice).

export async function GET() {
  try {
    // Latest batch by wall-clock time, not just latest calendar date — the
    // 2026-07-14 intraday refresh writes a new snapshot batch every few
    // minutes through the trading day, each sharing one run_id. This always
    // shows the freshest read, whether that's the once-daily official run
    // (rotation scan + digest-eligible) or a later lite refresh.
    const { data: latest } = await supabaseServer
      .from("portfolio_advice")
      .select("run_id, run_date, created_at, is_official")
      .order("created_at", { ascending: false })
      .limit(1);

    const runId = latest?.[0]?.run_id ?? null;
    if (!runId) return NextResponse.json({ runDate: null, runAt: null, isOfficial: null, rows: [] });

    const { data: rows, error } = await supabaseServer
      .from("portfolio_advice")
      .select("*")
      .eq("run_id", runId)
      .order("trend_score", { ascending: true }); // worst first — act on those

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      runDate: latest?.[0]?.run_date ?? null,
      runAt: latest?.[0]?.created_at ?? null,
      isOfficial: latest?.[0]?.is_official ?? null,
      rows: rows ?? [],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
