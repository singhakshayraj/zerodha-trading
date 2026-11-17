import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// [P-70] Strategy lab scoreboard. Read-only: the brain (lab.py) computes every
// statistic at 15:20 and writes it to lab_daily; this route only reads.
export async function GET() {
  try {
    const [strategies, latestDate] = await Promise.all([
      supabaseServer.from("lab_strategies").select("id, arch, params, rule, status, registered_at").order("id"),
      supabaseServer.from("lab_daily").select("trade_date").order("trade_date", { ascending: false }).limit(1),
    ]);
    for (const q of [strategies, latestDate]) if (q.error) throw q.error;
    const date: string | null = latestDate.data?.[0]?.trade_date ?? null;
    if (!date) return NextResponse.json({ date: null, strategies: strategies.data ?? [], latest: [], series: [], refusals: [] });

    const [latest, series, refusals] = await Promise.all([
      supabaseServer.from("lab_daily").select("*").eq("trade_date", date),
      supabaseServer.from("lab_daily").select("trade_date, strategy_id, cum_net_inr").order("trade_date").limit(20000),
      supabaseServer.from("lab_refusals").select("strategy_id, reason, count").eq("trade_date", date),
    ]);
    for (const q of [latest, series, refusals]) if (q.error) throw q.error;
    return NextResponse.json({
      date,
      strategies: strategies.data ?? [],
      latest: latest.data ?? [],
      series: series.data ?? [],
      refusals: refusals.data ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : (e as { message?: string })?.message ?? "lab read failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
