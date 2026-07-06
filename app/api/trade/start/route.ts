import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// Frontend only writes config to Supabase. Railway brain does all order placement.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  // Presence-only check made this endpoint effectively public: any value
  // passed. Require the header to match the stored enc_token when one
  // exists (prod always has one via /connect; the QA sim DB has none).
  const stored = await db.readConfig("enc_token");
  if (stored && stored !== token) {
    return NextResponse.json({ error: "invalid token" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const c = body.config ?? body;

    const capital          = Number(c.capital          ?? c.capitalDeployed   ?? 0);
    const maxTrades        = Number(c.maxTrades                                ?? 10);
    const maxLossPercent   = Number(c.maxLossPct       ?? c.maxLoss            ?? 5);
    const maxProfitPercent = Number(c.maxProfitPct     ?? c.maxProfit          ?? 15);
    const intervalSec      = Number(c.intervalMinutes != null ? c.intervalMinutes * 60 : (c.interval ?? 300));
    // The dashboard sends `mode` ("holdings" | "market") — map it to the
    // brain's universe names. Before this mapping existed the value fell
    // through to "BOTH" and the UI toggle was silently ignored.
    const modeUniverse =
      c.mode === "holdings" ? "HOLDINGS" :
      c.mode === "market"   ? "NIFTY50"  : undefined;
    const stockUniverse    = String(c.universe ?? c.stockUniverse ?? modeUniverse ?? "BOTH");

    // The brain creates the trading_sessions row itself when it handles
    // START (scheduler.run) and writes active_session_id. Creating another
    // one here produced a duplicate orphaned RUNNING session on every start.
    const configPayload = JSON.stringify({
      capitalDeployed:      capital,
      maxTrades,
      maxLossPercent,
      maxProfitPercent,
      tradeIntervalSeconds: intervalSec,
      stockUniverse,
    });
    console.log("Writing session_config:", configPayload);
    await db.writeConfig("session_config", configPayload);

    // START command LAST — brain reads this and immediately looks for
    // session_config, then creates the session and active_session_id.
    console.log("Writing brain_status: START");
    await db.writeConfig("brain_status", "START");

    return NextResponse.json({
      success: true,
      message: "Brain command sent — session id appears once the brain starts",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("/api/trade/start failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
