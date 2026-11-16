import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// [P-60] Days with advisor calls, newest first, with how many trading days
// have been scored so far (0 = the call day itself / not yet scored).
export async function GET() {
  const { data, error } = await supabaseServer.rpc("call_days");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    days: (data ?? []).map((d: { run_date: string; n: number; scored_days: number }) =>
      ({ run_date: d.run_date, n: Number(d.n), scored_days: Number(d.scored_days) })),
  });
}
