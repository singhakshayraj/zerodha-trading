import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// Signal-only: the brain owns session teardown. It squares off open
// positions, computes final stats via database.end_session, then clears
// active_session_id and sets brain_status IDLE (within ~10s — it polls
// commands in short slices). This route previously also ended the session
// and wrote stats itself, racing the brain: sessions got marked COMPLETED
// with positions still open and totals computed before square-off fills.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  // Same auth as /start: match against the stored enc_token when one
  // exists — presence-only made STOP callable by anyone with the URL.
  const stored = await db.readConfig("enc_token");
  if (stored && stored !== token) {
    return NextResponse.json({ error: "invalid token" }, { status: 403 });
  }

  try {
    await db.writeConfig("brain_status", "STOP");
    return NextResponse.json({
      success: true,
      message: "STOP signalled — brain squares off and finalizes the session",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
