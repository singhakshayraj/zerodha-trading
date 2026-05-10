import { NextRequest, NextResponse } from "next/server";
import { makeKiteRequest } from "@/lib/zerodha";
import { Position, ZerodhaError } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const data = await makeKiteRequest<{ net: Position[]; day: Position[] }>(
      token,
      "GET",
      "/portfolio/positions"
    );

    return NextResponse.json({ positions: data });
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
