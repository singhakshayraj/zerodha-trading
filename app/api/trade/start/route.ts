import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// Frontend only writes config to Supabase. Railway brain does all order placement.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const body = await req.json();
    const c = body.config ?? body;

    const capital            = Number(c.capital ?? 0);
    const maxTrades          = Number(c.maxTrades ?? 10);
    const maxLossPercent     = Number(c.maxLossPct ?? c.maxLoss ?? 5);
    const maxProfitPercent   = Number(c.maxProfitPct ?? c.maxProfit ?? 15);
    const intervalSec        = Number(c.intervalMinutes ? c.intervalMinutes * 60 : c.interval ?? 300);
    const stockUniverse      = String(c.universe ?? c.stockUniverse ?? "BOTH");

    const session = await db.createSession({
      capital_deployed:       capital,
      max_trades:             maxTrades,
      max_loss_percent:       maxLossPercent,
      max_profit_percent:     maxProfitPercent,
      trade_interval_seconds: intervalSec,
      stock_universe:         stockUniverse,
    });

    await db.writeConfig("session_config", JSON.stringify({
      sessionId:            session.id,
      capitalDeployed:      capital,
      maxTrades,
      maxLossPercent,
      maxProfitPercent,
      tradeIntervalSeconds: intervalSec,
      stockUniverse,
    }));
    await db.writeConfig("brain_status",      "START");
    await db.writeConfig("active_session_id", session.id);

    return NextResponse.json({ success: true, sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
