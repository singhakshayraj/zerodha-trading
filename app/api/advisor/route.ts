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

    // Portfolio-level risk view (concentration + tax-loss harvest), written
    // by the brain's official run to app_config as JSON. Only surface it when
    // it belongs to the run being shown — a stale read from an earlier day
    // must not render against today's rows.
    let portfolioRisk = null;
    const runDate = latest?.[0]?.run_date ?? null;
    try {
      const { data: cfg } = await supabaseServer
        .from("app_config")
        .select("value")
        .eq("key", "portfolio_risk_latest")
        .single();
      if (cfg?.value) {
        const parsed = JSON.parse(cfg.value as string);
        if (parsed?.run_date === runDate) portfolioRisk = parsed;
      }
    } catch {
      /* risk view is additive — never blocks the advice payload */
    }

    // Confidence calibration reliability curve (DARK diagnostic — the advisor
    // does NOT use it for decisions yet). A rolling read over the graded track
    // record, valid regardless of today's run, so it's surfaced whenever set.
    let calibration = null;
    try {
      const { data: cal } = await supabaseServer
        .from("app_config")
        .select("value")
        .eq("key", "advisor_calibration_latest")
        .single();
      if (cal?.value) calibration = JSON.parse(cal.value as string);
    } catch {
      /* diagnostic — never blocks the advice payload */
    }

    // Day-over-day verdict diff: what changed vs the last run on an earlier
    // date. A daily user cares about the flips (ATGL HOLD->TRIM) and new
    // names, not re-reading 20 unchanged cards. Additive — never blocks.
    let priorRunDate: string | null = null;
    const changes: { symbol: string; from: string; to: string }[] = [];
    const newNames: string[] = [];
    try {
      const { data: prior } = await supabaseServer
        .from("portfolio_advice")
        .select("run_id, run_date")
        .lt("run_date", runDate)
        .order("run_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      const priorRunId = prior?.[0]?.run_id ?? null;
      priorRunDate = prior?.[0]?.run_date ?? null;
      if (priorRunId) {
        const { data: priorRows } = await supabaseServer
          .from("portfolio_advice")
          .select("symbol, verdict")
          .eq("run_id", priorRunId);
        const prev = new Map((priorRows ?? []).map((r) => [r.symbol as string, r.verdict as string]));
        for (const r of rows ?? []) {
          const was = prev.get(r.symbol);
          if (was === undefined) newNames.push(r.symbol);
          else if (was !== r.verdict) changes.push({ symbol: r.symbol, from: was, to: r.verdict });
        }
      }
    } catch {
      /* diff is additive — never blocks the advice payload */
    }

    return NextResponse.json({
      runDate,
      runAt: latest?.[0]?.created_at ?? null,
      isOfficial: latest?.[0]?.is_official ?? null,
      rows: rows ?? [],
      portfolioRisk,
      calibration,
      priorRunDate,
      changes,
      newNames,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
