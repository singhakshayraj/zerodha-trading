import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// Default rotation for the "market" (non-holdings) mode. Both cells trade
// the open market — the axis being varied is universe breadth, so every
// session still produces comparable, attributable data (real stop/target/
// capital stay whatever the user picked; only this one lever auto-rotates).
const DEFAULT_EXPERIMENT_MATRIX = ["NIFTY50", "BOTH"];

// Deterministic day-to-day rotation so the dataset accumulates sessions
// across universe cells without the user having to pick one each morning.
// Cursor only advances on a real start (not on page loads), so re-opening
// the dashboard before starting always shows the same suggested cell.
async function nextExperimentCell(): Promise<string> {
  const rawMatrix = await db.readConfig("experiment_matrix");
  let matrix: string[] = DEFAULT_EXPERIMENT_MATRIX;
  try {
    if (rawMatrix) {
      const parsed = JSON.parse(rawMatrix);
      if (Array.isArray(parsed) && parsed.length > 0) matrix = parsed;
    }
  } catch { /* malformed override — fall back to default matrix */ }

  const rawCursor = await db.readConfig("experiment_cursor");
  const cursor = Number.parseInt(rawCursor ?? "0", 10) || 0;
  const cell = matrix[cursor % matrix.length];

  await db.writeConfig("experiment_cursor", String(cursor + 1));
  return cell;
}

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
    // Explicit universe/stockUniverse from the client always wins (manual
    // override, QA scripts). Otherwise "market" mode gets its cell from the
    // daily rotation instead of always defaulting to NIFTY50 — this is the
    // one param the human no longer has to pick, and it's what gives the
    // paper-trading dataset universe-breadth diversity across sessions.
    let stockUniverse: string;
    if (c.universe ?? c.stockUniverse) {
      stockUniverse = String(c.universe ?? c.stockUniverse);
    } else if (c.mode === "holdings") {
      stockUniverse = "HOLDINGS";
    } else {
      stockUniverse = await nextExperimentCell();
    }

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
      experimentCell: stockUniverse,
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
