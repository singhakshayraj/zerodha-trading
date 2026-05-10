import { NextRequest, NextResponse } from "next/server";
import { makeKiteRequest } from "@/lib/zerodha";
import { Funds, ZerodhaError } from "@/lib/types";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const funds = await makeKiteRequest<Funds>(token, "GET", "/user/margins");
    return NextResponse.json({ funds });
  } catch (err) {
    if (err instanceof ZerodhaError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
