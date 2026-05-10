import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { sessionId, endReason } = await req.json();
    if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

    // Signal brain to stop before ending session
    await db.writeConfig("brain_command", "STOP");

    await db.endSession(sessionId, endReason ?? "Manually stopped");

    const trades = await db.getSessionTrades(sessionId);
    const winning = trades.filter((t) => (t.pnl ?? 0) > 0).length;
    const losing  = trades.filter((t) => (t.pnl ?? 0) < 0).length;
    const totalPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0);

    await db.updateSession(sessionId, {
      total_trades:   trades.length,
      winning_trades: winning,
      losing_trades:  losing,
      total_pnl:      totalPnl,
    });

    return NextResponse.json({ ok: true, stats: { trades: trades.length, winning, losing, totalPnl } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
