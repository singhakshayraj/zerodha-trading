import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Ask the brain to re-run the advisor now.
//
// `advisor_run_now` has existed in the brain since the advisor shipped and
// nothing ever set it — an on-demand refresh that could not be demanded. The
// brain's idle loop consumes the flag on its next tick (~30s) and clears it, so
// this is fire-and-forget: no job id, no polling, the page just reloads later.
//
// Trading days only: the brain gate applies to forced runs too, deliberately.
// A forced run writes an official advice batch stamped with that date, so a
// Saturday-dated batch would have its grading horizon measured from a Saturday.
// tests/test_advisor_trigger.py pins that, and it is the right call -- so this
// button refreshes on demand within a trading day, not on a weekend.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { error } = await supabaseServer
      .from("app_config")
      .upsert({ key: "advisor_run_now", value: "true", updated_at: new Date().toISOString() },
              { onConflict: "key" });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      queued: true,
      // Set expectations honestly: the brain must be ONLINE and hold a LIVE
      // token, and it picks the flag up on its own cadence.
      note: "Queued. Runs on a trading day once the brain sees a live token; the request is kept until then.",
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
