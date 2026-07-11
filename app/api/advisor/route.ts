import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Latest portfolio-advisory run. ADVISORY ONLY — this data never drives
// orders; the brain writes one row per holding per day (portfolio_advice).

export async function GET() {
  try {
    const { data: latest } = await supabaseServer
      .from("portfolio_advice")
      .select("run_date")
      .order("run_date", { ascending: false })
      .limit(1);

    const runDate = latest?.[0]?.run_date ?? null;
    if (!runDate) return NextResponse.json({ runDate: null, rows: [] });

    const { data: rows, error } = await supabaseServer
      .from("portfolio_advice")
      .select("*")
      .eq("run_date", runDate)
      .order("trend_score", { ascending: true }); // worst first — act on those

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ runDate, rows: rows ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
