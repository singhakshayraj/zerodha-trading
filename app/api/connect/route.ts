import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token } = body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ success: false, error: "Token is required" }, { status: 400 });
    }

    const cleanToken = token.trim();

    const kiteRes = await fetch("https://api.kite.trade/user/profile", {
      method: "GET",
      headers: {
        Authorization: `enctoken ${cleanToken}`,
        "X-Kite-Version": "3",
      },
    });

    const kiteStatus = kiteRes.status;
    let data: Record<string, unknown>;

    try {
      data = await kiteRes.json();
    } catch {
      return NextResponse.json({
        success: false,
        error: "Zerodha returned non-JSON response",
        debug: { kiteStatus },
      }, { status: 502 });
    }

    if (!kiteRes.ok || data.status !== "success") {
      return NextResponse.json({
        success: false,
        error: (data.message as string) || "Invalid token",
        debug: {
          kiteStatus,
          kiteStatusText: kiteRes.statusText,
          kiteBody: data,
        },
      }, { status: kiteStatus });
    }

    const profile = data.data as { user_name: string; email: string; broker: string; user_id: string };

    return NextResponse.json({
      success: true,
      profile: {
        name: profile.user_name,
        email: profile.email,
        broker: profile.broker,
        user_id: profile.user_id,
      },
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: "Internal server error",
      debug: { message: String(err) },
    }, { status: 500 });
  }
}
