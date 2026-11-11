import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// [P-45 provisional] Natwar's advisor preview — the brain writes one JSON
// blob per run to app_config 'advisor_natwar_latest'. Same row shape as
// /api/advisor's rows (advise() output + indicators.thesis), so the /advisor
// page renders it with the same cards. Not graded; advisory only.
export async function GET() {
  try {
    const { data } = await supabaseServer
      .from("app_config").select("value").eq("key", "advisor_natwar_latest").single();
    if (!data?.value) {
      return NextResponse.json({ runDate: null, runAt: null, isOfficial: null, rows: [],
        portfolioRisk: null, calibration: null, thesisTrackRecord: null,
        priorRunDate: null, changes: [], newNames: [], preview: true,
        note: "No preview yet — paste Natwar's token on /connect; the brain runs his holdings after 09:45 IST on a trading day." });
    }
    const p = JSON.parse(data.value as string);
    return NextResponse.json({ runDate: p.run_date ?? null, runAt: p.run_at ?? null, isOfficial: false,
      rows: p.rows ?? [], portfolioRisk: p.portfolio_risk ?? null, calibration: null,
      thesisTrackRecord: null, priorRunDate: null, changes: [], newNames: [],
      preview: true, label: p.label ?? "Natwar" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
