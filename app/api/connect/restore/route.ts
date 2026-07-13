import { NextResponse } from "next/server";
import * as db from "@/lib/db";

// A device that never pasted today's token can adopt the one already in
// Supabase (written by whichever browser did the morning paste), as long as
// it still validates against Zerodha. Morning flow stays: paste once, on
// any device — every other device then just works.
export async function GET() {
  try {
    const token = await db.readConfig("enc_token");
    if (!token || !token.trim()) {
      return NextResponse.json({ success: false, error: "No token stored" }, { status: 404 });
    }
    const cleanToken = token.trim();

    // Validate before handing it out — a stale token should send the user
    // to the paste form, not into a half-broken dashboard.
    const kiteRes = await fetch("https://kite.zerodha.com/oms/user/profile", {
      method: "GET",
      headers: {
        Authorization: `enctoken ${cleanToken}`,
        Cookie: `enctoken=${cleanToken}`,
        "X-Kite-Version": "3",
      },
    });

    let data: Record<string, unknown>;
    try {
      data = await kiteRes.json();
    } catch {
      return NextResponse.json({ success: false, error: "Zerodha returned non-JSON response" }, { status: 502 });
    }

    if (!kiteRes.ok || data.status !== "success") {
      return NextResponse.json({ success: false, error: "Stored token is expired" }, { status: 401 });
    }

    const profile = data.data as { user_name: string; email: string; broker: string; user_id: string };
    return NextResponse.json({
      success: true,
      token: cleanToken,
      profile: {
        name: profile.user_name,
        email: profile.email,
        broker: profile.broker,
        user_id: profile.user_id,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Internal server error", debug: { message: String(err) } }, { status: 500 });
  }
}
