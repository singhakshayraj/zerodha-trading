import { NextRequest, NextResponse } from "next/server";
import { makeKiteRequest } from "@/lib/zerodha";
import { UserProfile, ZerodhaError } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "token is required" },
        { status: 400 }
      );
    }

    const profile = await makeKiteRequest<UserProfile>(
      token,
      "GET",
      "/user/profile"
    );

    return NextResponse.json({ profile });
  } catch (err) {
    if (err instanceof ZerodhaError) {
      return NextResponse.json(
        { error: err.message, error_type: err.errorType },
        { status: err.status }
      );
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
