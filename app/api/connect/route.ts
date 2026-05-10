import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ success: false, error: "Token is required" }, { status: 400 });
    }

    const cleanToken = token.trim();

    const kiteRes = await fetch("https://api.kite.trade/user/profile", {
      method: "GET",
      headers: {
        Authorization: `enctoken ${cleanToken}`,
        Cookie: `enctoken=${cleanToken}`,
        "X-Kite-Version": "3",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
      },
    });

    const data = await kiteRes.json();

    if (!kiteRes.ok || data.status !== "success") {
      return NextResponse.json(
        { success: false, error: data.message || "Invalid token. Please check and try again." },
        { status: kiteRes.status }
      );
    }

    const { user_name, email, broker, user_id } = data.data;

    return NextResponse.json({
      success: true,
      profile: { name: user_name, email, broker, user_id },
    });
  } catch (err) {
    console.error("Connect error:", err);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
