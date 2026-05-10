import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// Called after a SELL order is confirmed — closes the trade and updates stock score.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { tradeId, exitData } = await req.json();
    if (!tradeId || !exitData)
      return NextResponse.json({ error: "tradeId and exitData are required" }, { status: 400 });

    await db.closeTrade(tradeId, exitData);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
