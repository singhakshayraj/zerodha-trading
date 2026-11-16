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

    const runDate = latest?.[0]?.run_date ?? null;

    // Everything below depends only on runId/runDate, so it runs in one
    // parallel round instead of seven serial ones (the API runs far from the
    // database; serial trips pushed this past the client's 15 s timeout).
    const CFG_KEYS = ["portfolio_risk_latest", "advisor_calibration_latest", "thesis_track_record",
      "hero_picks_latest", "sector_view_latest", "morning_brief_latest", "watchdog_latest"];
    const [rowsRes, cfgRes, priorRes] = await Promise.all([
      supabaseServer.from("portfolio_advice").select("*").eq("run_id", runId)
        .order("trend_score", { ascending: true }),                // worst first — act on those
      supabaseServer.from("app_config").select("key, value").in("key", CFG_KEYS),
      supabaseServer.from("portfolio_advice").select("run_id, run_date").lt("run_date", runDate)
        .order("run_date", { ascending: false }).order("created_at", { ascending: false }).limit(1),
    ]);
    const { data: rows, error } = rowsRes;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // app_config reads are additive — a bad value never blocks the payload.
    const cfg: Record<string, unknown> = {};
    for (const c of cfgRes.data ?? []) {
      if (!c.value) continue;
      try { cfg[c.key as string] = JSON.parse(c.value as string); } catch { /* skip */ }
    }
    // Risk view only when it belongs to the run being shown.
    const risk = cfg.portfolio_risk_latest as { run_date?: string } | undefined;
    const portfolioRisk = risk?.run_date === runDate ? risk : null;
    const calibration = cfg.advisor_calibration_latest ?? null;      // DARK diagnostic
    const thesisTrackRecord = cfg.thesis_track_record ?? null;      // P-47 shadow
    const heroPicks = cfg.hero_picks_latest ?? null;
    const sectorView = cfg.sector_view_latest ?? null;
    const brief = cfg.morning_brief_latest ?? null;                 // P-55
    const watchdog = cfg.watchdog_latest ?? null;                   // P-56

    // Day-over-day verdict diff vs the last run on an earlier date. Additive.
    const priorRunId = priorRes.data?.[0]?.run_id ?? null;
    const priorRunDate: string | null = priorRes.data?.[0]?.run_date ?? null;
    const changes: { symbol: string; from: string; to: string }[] = [];
    const newNames: string[] = [];
    if (priorRunId) {
      const { data: priorRows } = await supabaseServer
        .from("portfolio_advice").select("symbol, verdict").eq("run_id", priorRunId);
      const prev = new Map((priorRows ?? []).map((r) => [r.symbol as string, r.verdict as string]));
      for (const r of rows ?? []) {
        const was = prev.get(r.symbol);
        if (was === undefined) newNames.push(r.symbol);
        else if (was !== r.verdict) changes.push({ symbol: r.symbol, from: was, to: r.verdict });
      }
    }

    return NextResponse.json({
      runDate,
      runAt: latest?.[0]?.created_at ?? null,
      isOfficial: latest?.[0]?.is_official ?? null,
      rows: rows ?? [],
      portfolioRisk,
      calibration,
      thesisTrackRecord,
      heroPicks,
      sectorView,
      brief,
      watchdog,
      priorRunDate,
      changes,
      newNames,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
