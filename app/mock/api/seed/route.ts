// MOCK-ONLY seed trigger. Lets the deployed app populate the staging (sim)
// Supabase project with a fake completed trading session, so /mock/trading can
// be demoed without running the local sim/demo_seeder.ts script.
//
// Server-side mirror of sim/demo_seeder.ts, but with NO artificial sleeps
// (serverless can't reliably hold a long-running request) — it writes the final
// completed-session state in one shot. Reads SIM_* via lib/supabase-sim.
//
//   POST /mock/api/seed?mode=batch → seed one fake completed session (default)
//   POST /mock/api/seed?mode=live  → start a RUNNING session with one OPEN
//                                    trade, then return; the browser advances
//                                    it via POST /mock/api/seed/tick
//   POST /mock/api/seed?reset=1    → wipe sim data back to IDLE/OFFLINE
//
// Token-protected (x-enc-token) like the other mock routes. Writes only ever
// touch the sim client — zero production impact.
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseSim } from "@/lib/supabase-sim";
import {
  PRICE_STATE_KEY,
  type PriceState,
  pickDirection,
  initialPrices,
  generateSignal,
  exitLevels,
  sizePosition,
  round2 as simRound2,
  UNIVERSE,
} from "@/app/mock/lib/market-sim";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYMBOLS = ["RELIANCE", "INFY", "HINDALCO", "SBIN", "HINDUNILVR"] as const;
const ENTRY_PRICES: Record<string, number> = {
  RELIANCE: 1350,
  INFY: 1190,
  HINDALCO: 1090,
  SBIN: 950,
  HINDUNILVR: 2190,
};

const nowIso = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;

async function setConfig(key: string, value: string) {
  // Must throw: a silently failed upsert here leaves active_session_id unset
  // while the route still reports ok:true (the exact bug seen in HAR traces).
  const { error } = await supabaseSim
    .from("app_config")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw new Error(`setConfig(${key}): ${error.message}${error.details ? ` — ${error.details}` : ""}`);
}

async function reset() {
  await supabaseSim.from("trades").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabaseSim.from("brain_activity").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await supabaseSim.from("trading_sessions").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  await setConfig("active_session_id", "");
  await setConfig("brain_status", "IDLE");
  await setConfig("session_config", "");

  await supabaseSim.from("brain_heartbeat").upsert({
    id: 1,
    last_ping: new Date(Date.now() - 3600_000).toISOString(),
    status: "OFFLINE",
    current_cycle: 0,
    message: "Reset to defaults",
  });
}

async function seed() {
  const sid = randomUUID();

  const { error: sessionErr } = await supabaseSim.from("trading_sessions").insert({
    id: sid,
    status: "RUNNING",
    capital_deployed: 10000,
    max_trades: 5,
    max_loss_percent: 3,
    max_profit_percent: 5,
    trade_interval_seconds: 300,
    stock_universe: "BOTH",
  });
  if (sessionErr) throw sessionErr;

  await setConfig("active_session_id", sid);
  await setConfig("brain_status", "RUNNING");
  await setConfig(
    "session_config",
    JSON.stringify({
      sessionId: sid,
      capitalDeployed: 10000,
      maxTrades: 5,
      maxLossPercent: 3,
      maxProfitPercent: 5,
      tradeIntervalSeconds: 300,
      stockUniverse: "BOTH",
    })
  );

  const trades: { pnl: number; isWinner: boolean }[] = [];

  for (let i = 0; i < 5; i++) {
    const symbol = SYMBOLS[i % SYMBOLS.length];
    const positionType = i % 2 === 0 ? "LONG" : "SHORT";
    const side = positionType === "LONG" ? "BUY" : "SELL";
    const entryPrice = ENTRY_PRICES[symbol];
    const tradeId = randomUUID();

    const pnl = round2(Math.random() * 20 - 8); // [-8, +12]
    const isWinner = pnl > 0;
    const exitPrice =
      positionType === "LONG" ? round2(entryPrice + pnl) : round2(entryPrice - pnl);

    // Activity trail (session-scoped so the activity route can read it).
    await supabaseSim.from("brain_activity").insert([
      { session_id: sid, activity_type: "ANALYZING", symbol, message: `Analyzing ${symbol}` },
      { session_id: sid, activity_type: "SIGNAL", symbol, message: `${side} signal, confidence 75%` },
      { session_id: sid, activity_type: "ORDER_PLACED", symbol, message: `${positionType} opened ${symbol} x1` },
      { session_id: sid, activity_type: "POSITION_EXIT", symbol, message: `Closed ${symbol}, P&L: Rs${pnl}` },
    ]);

    const { error: tradeErr } = await supabaseSim.from("trades").insert({
      id: tradeId,
      session_id: sid,
      symbol,
      status: "CLOSED",
      position_type: positionType,
      entry_price: entryPrice,
      exit_price: exitPrice,
      quantity: 1,
      entry_value: entryPrice,
      pnl,
      is_winner: isWinner,
      regime: "TRENDING",
      confidence_score: 75,
      exit_reason: "SIGNAL_EXIT",
      updated_at: nowIso(),
    });
    if (tradeErr) throw tradeErr;

    trades.push({ pnl, isWinner });
  }

  const winning = trades.filter((t) => t.isWinner).length;
  const losing = trades.length - winning;
  const totalPnl = round2(trades.reduce((s, t) => s + t.pnl, 0));

  await supabaseSim
    .from("trading_sessions")
    .update({
      status: "COMPLETED",
      ended_at: nowIso(),
      total_trades_executed: 5,
      winning_trades: winning,
      losing_trades: losing,
      total_pnl: totalPnl,
      end_reason: "MAX_TRADES_HIT",
    })
    .eq("id", sid);

  await setConfig("active_session_id", "");
  await setConfig("brain_status", "IDLE");

  await supabaseSim.from("brain_heartbeat").upsert({
    id: 1,
    last_ping: nowIso(),
    status: "IDLE",
    current_cycle: 5,
    message: "Session ended",
  });

  await supabaseSim.from("brain_activity").insert({
    session_id: sid,
    activity_type: "SESSION_END",
    message: "Session ended: MAX_TRADES_HIT",
  });

  return { sessionId: sid, trades: 5, winning, losing, totalPnl };
}

// LIVE mode: establish a RUNNING session with ONE OPEN trade, then return.
// No server-side loop — serverless can't hold a timer reliably. The browser
// drives progression by POSTing /mock/api/seed/tick every few seconds.
async function seedLive() {
  // Clear prior state: close orphan OPEN trades from previous runs.
  await supabaseSim
    .from("trades")
    .update({ status: "CLOSED", exit_reason: "ORPHAN_CLEANUP", updated_at: nowIso() })
    .eq("status", "OPEN");
  await setConfig("active_session_id", "");

  const sid = randomUUID();

  const { error: sessionErr } = await supabaseSim.from("trading_sessions").insert({
    id: sid,
    status: "RUNNING",
    capital_deployed: 10000,
    max_trades: 5,
    max_loss_percent: 3,
    max_profit_percent: 5,
    trade_interval_seconds: 300,
    stock_universe: "BOTH",
  });
  if (sessionErr) throw sessionErr;

  await setConfig("active_session_id", sid);
  await setConfig("brain_status", "RUNNING");
  await setConfig(
    "session_config",
    JSON.stringify({
      sessionId: sid,
      capitalDeployed: 10000,
      maxTrades: 5,
      maxLossPercent: 3,
      maxProfitPercent: 5,
      tradeIntervalSeconds: 300,
      stockUniverse: "BOTH",
    })
  );

  await supabaseSim.from("brain_heartbeat").upsert({
    id: 1,
    last_ping: nowIso(),
    status: "RUNNING",
    current_cycle: 0,
    message: "Live session started — scanning universe",
  });

  // Market simulation state: direction + random-walk starting prices,
  // persisted so /seed/tick continues the same walk statelessly.
  const direction = pickDirection();
  const state: PriceState = {
    direction,
    cycle: 0,
    prices: initialPrices(),
    openMeta: {},
  };

  // First entry: signal-driven symbol/side, capital-based sizing (10k capital
  // / 5 max trades = ~2k allocation), bracket exit levels kept in sim state.
  const symbol = UNIVERSE[Math.floor(Math.random() * UNIVERSE.length)].symbol;
  const entryPrice = state.prices[symbol];
  const signal = generateSignal(direction);
  const qty = sizePosition(2000, entryPrice);
  const brackets = exitLevels(entryPrice, signal.positionType);
  const tradeId = randomUUID();
  state.openMeta[tradeId] = { openedCycle: 0, ...brackets };

  await supabaseSim.from("brain_activity").insert([
    {
      session_id: sid,
      activity_type: "MARKET_SCAN",
      message: `Market read: ${direction} — scanning ${UNIVERSE.length} symbols`,
    },
    {
      session_id: sid,
      activity_type: "ANALYZING",
      symbol,
      message: `Analyzing ${symbol} @ ₹${entryPrice} — RSI ${signal.rsi}, VWAP dist ${signal.vwapDist}%`,
    },
    {
      session_id: sid,
      activity_type: "SIGNAL",
      symbol,
      message: `${signal.positionType === "LONG" ? "BUY" : "SELL"} signal, confidence ${signal.confidence}%`,
    },
    {
      session_id: sid,
      activity_type: "ORDER_PLACED",
      symbol,
      message: `${signal.positionType} ${symbol} x${qty} @ ₹${entryPrice} | SL ₹${brackets.stopLoss} · Target ₹${brackets.target}`,
    },
  ]);

  const { error: tradeErr } = await supabaseSim.from("trades").insert({
    id: tradeId,
    session_id: sid,
    symbol,
    status: "OPEN",
    position_type: signal.positionType,
    entry_price: entryPrice,
    quantity: qty,
    entry_value: simRound2(entryPrice * qty),
    regime: direction === "SIDEWAYS" ? "CHOPPY" : "TRENDING",
    confidence_score: signal.confidence,
    updated_at: nowIso(),
  });
  if (tradeErr) throw tradeErr;

  await setConfig(PRICE_STATE_KEY, JSON.stringify(state));

  // Verify the config row actually landed — read it back the same way
  // /mock/api/trades/live does, so a schema/constraint mismatch surfaces
  // here instead of as a silently-idle dashboard.
  const { data: check, error: checkErr } = await supabaseSim
    .from("app_config")
    .select("value")
    .eq("key", "active_session_id")
    .maybeSingle();
  if (checkErr) throw new Error(`verify read failed: ${checkErr.message}`);
  if (check?.value !== sid) {
    throw new Error(
      `active_session_id verify mismatch: wrote '${sid}', read back '${check?.value ?? "<missing>"}'`
    );
  }

  return { sessionId: sid, verified: true };
}

// MOCK: no token gate — staging seeder must work without a Kite login.
async function handle(req: NextRequest) {
  console.log(
    "[mock/seed] invoked. SIM_URL present:",
    !!process.env.SIM_SUPABASE_URL,
    "SIM_KEY present:",
    !!process.env.SIM_SUPABASE_SERVICE_KEY,
    "supabase host:",
    (process.env.SIM_SUPABASE_URL || "MISSING").slice(8, 28)
  );
  try {
    const params = new URL(req.url).searchParams;
    const doReset = params.get("reset");
    if (doReset === "1" || doReset === "true") {
      await reset();
      return NextResponse.json({ ok: true, action: "reset" });
    }
    if (params.get("mode") === "live") {
      const result = await seedLive();
      return NextResponse.json({ ok: true, mode: "live", ...result });
    }
    const result = await seed();
    return NextResponse.json({ ok: true, action: "seed", mode: "batch", ...result });
  } catch (err) {
    // Supabase PostgrestError is a plain object (not instanceof Error), so
    // pull message/details defensively and serialize the whole thing.
    const e = err as { message?: string; stack?: string; details?: string; hint?: string; code?: string };
    const detail =
      e?.message ||
      (typeof err === "object" ? JSON.stringify(err) : String(err)) ||
      "no message";
    const stack = e?.stack || "no stack";
    console.error("[mock/seed] FAILED:", detail, stack, {
      details: e?.details,
      hint: e?.hint,
      code: e?.code,
    });
    return NextResponse.json(
      { ok: false, error: detail, stack, details: e?.details, hint: e?.hint, code: e?.code },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// GET allowed too, for easy manual triggering from a browser/curl.
export async function GET(req: NextRequest) {
  return handle(req);
}
