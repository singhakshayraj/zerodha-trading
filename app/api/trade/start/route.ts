import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// Frontend only writes config to Supabase. Railway brain does all order placement.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const body = await req.json();
    const c = body.config ?? body;

    const capital          = Number(c.capital          ?? c.capitalDeployed   ?? 0);
    const maxTrades        = Number(c.maxTrades                                ?? 10);
    const maxLossPercent   = Number(c.maxLossPct       ?? c.maxLoss            ?? 5);
    const maxProfitPercent = Number(c.maxProfitPct     ?? c.maxProfit          ?? 15);
    const intervalSec      = Number(c.intervalMinutes != null ? c.intervalMinutes * 60 : (c.interval ?? 300));
    const stockUniverse    = String(c.universe         ?? c.stockUniverse      ?? "BOTH");

    const session = await db.createSession({
      capital_deployed:       capital,
      max_trades:             maxTrades,
      max_loss_percent:       maxLossPercent,
      max_profit_percent:     maxProfitPercent,
      trade_interval_seconds: intervalSec,
      stock_universe:         stockUniverse,
    });

    const sessionId = session.id;
    console.log("Session created:", sessionId);

    // Write 1 — session config for brain
    const configPayload = JSON.stringify({
      sessionId,
      capitalDeployed:      capital,
      maxTrades,
      maxLossPercent,
      maxProfitPercent,
      tradeIntervalSeconds: intervalSec,
      stockUniverse,
    });
    console.log("Writing session_config:", configPayload);
    await db.writeConfig("session_config", configPayload);
    console.log("session_config written");

    // Write 2 — active session id
    console.log("Writing active_session_id:", sessionId);
    await db.writeConfig("active_session_id", sessionId);
    console.log("active_session_id written");

    // Write 3 — START command LAST.
    // Brain reads this and immediately looks for session_config.
    console.log("Writing brain_status: START");
    await db.writeConfig("brain_status", "START");
    console.log("brain_status START written");

    return NextResponse.json({
      success: true,
      sessionId,
      message: "Brain command sent",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("/api/trade/start failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
