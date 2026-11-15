import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// [P-45 provisional] Natwar's advisor preview — the brain writes one JSON
// blob per run to app_config 'advisor_natwar_latest'. Same row shape as
// /api/advisor's rows (advise() output + indicators.thesis), so the /advisor
// page renders it with the same cards. Not graded; advisory only.
export async function GET() {
  try {
    const { data: cfg } = await supabaseServer
      .from("app_config").select("key, value").in("key", ["advisor_natwar_latest", "morning_brief_latest", "watchdog_latest"]);
    const data = cfg?.find((c) => c.key === "advisor_natwar_latest") ?? null;
    const briefRaw = cfg?.find((c) => c.key === "morning_brief_latest")?.value ?? null;
    const brief = briefRaw ? JSON.parse(briefRaw as string) : null;   // P-55, household-level
    const wdRaw = cfg?.find((c) => c.key === "watchdog_latest")?.value ?? null;
    const watchdog = wdRaw ? JSON.parse(wdRaw as string) : null;   // P-56
    if (!data?.value) {
      return NextResponse.json({ runDate: null, runAt: null, isOfficial: null, rows: [],
        portfolioRisk: null, calibration: null, thesisTrackRecord: null,
        priorRunDate: null, changes: [], newNames: [], preview: true, brief, watchdog,
        note: "No preview yet — paste Natwar's token on /connect; the brain runs his holdings after 09:45 IST on a trading day." });
    }
    const p = JSON.parse(data.value as string);
    return NextResponse.json({ runDate: p.run_date ?? null, runAt: p.run_at ?? null, isOfficial: null,
      rows: p.rows ?? [], portfolioRisk: p.portfolio_risk ?? null, calibration: null,
      thesisTrackRecord: null, priorRunDate: null, changes: [], newNames: [],
      preview: true, label: p.label ?? "Natwar", sectorView: p.sector_view ?? null, brief, watchdog });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
