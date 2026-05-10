import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ success: false, error: "Token is required" }, { status: 400 });
    }

    const kiteRes = await fetch("https://api.kite.trade/user/profile", {
      method: "GET",
      headers: {
        Authorization: `enctoken ${token.trim()}`,
        "X-Kite-Version": "3",
      },
    });

    const data = await kiteRes.json();

    if (!kiteRes.ok || data.status !== "success") {
      return NextResponse.json(
        { success: false, error: data.message || "Invalid token" },
        { status: kiteRes.status }
      );
    }

    const { user_name, email, broker, user_id } = data.data;

    return NextResponse.json({
      success: true,
      profile: { name: user_name, email, broker, user_id },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
