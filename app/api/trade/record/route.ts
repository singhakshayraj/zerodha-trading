import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// Called after a BUY order is confirmed — creates the trade row + records entry.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { sessionId, tradeData, orderData } = await req.json();
    if (!sessionId || !tradeData || !orderData)
      return NextResponse.json({ error: "sessionId, tradeData and orderData are required" }, { status: 400 });

    const trade = await db.createTrade(sessionId, tradeData);
    await db.updateTradeEntry(trade.id, orderData);

    return NextResponse.json({ tradeId: trade.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
