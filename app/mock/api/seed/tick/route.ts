// MOCK-ONLY live-session ticker. Companion to POST /mock/api/seed?mode=live.
// Each POST advances the market simulation one step: random-walks all symbol
// prices, exits OPEN positions whose stop-loss/target got hit (or on aged
// discretionary signals), and opens new sized positions until maxTrades.
// After maxTrades it keeps the session RUNNING indefinitely (fresh heartbeat
// every tick) so the dashboard can be observed and refresh-tested. It NEVER
// finalizes — that's the explicit POST /mock/api/seed/end. The browser calls
// this on an interval so no serverless function ever has to hold a
// long-running timer. Writes only ever touch the sim client.
//
//   POST /mock/api/seed/tick → { ok, done, tradeCount?, openCount?, atMax? }
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseSim } from "@/lib/supabase-sim";
import {
  PRICE_STATE_KEY,
  type PriceState,
  UNIVERSE,
  stepPrices,
  initialPrices,
  generateSignal,
  exitLevels,
  sizePosition,
  checkExit,
  tradePnl,
  round2,
} from "@/app/mock/lib/market-sim";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_TRADES = 5;
const MAX_CONCURRENT = 2;
const ALLOCATION = 2000; // ₹ per position (10k capital / 5 trades)

const nowIso = () => new Date().toISOString();

async function setConfig(key: string, value: string) {
  // Must throw: silent config-write failures make ticks claim success while
  // the dashboard reads stale state.
  const { error } = await supabaseSim
    .from("app_config")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw new Error(`setConfig(${key}): ${error.message}${error.details ? ` — ${error.details}` : ""}`);
}

async function loadPriceState(): Promise<PriceState> {
  const { data } = await supabaseSim
    .from("app_config")
    .select("value")
    .eq("key", PRICE_STATE_KEY)
    .maybeSingle();
  try {
    const parsed = JSON.parse((data?.value as string) ?? "");
    if (parsed && parsed.prices) return parsed as PriceState;
  } catch { /* fall through to fresh state */ }
  return { direction: "SIDEWAYS", cycle: 0, prices: initialPrices(), openMeta: {} };
}

async function tick() {
  // Which session is live?
  const { data: cfgRow } = await supabaseSim
    .from("app_config")
    .select("value")
    .eq("key", "active_session_id")
    .maybeSingle();

  const sid = cfgRow?.value as string | undefined;
  if (!sid || sid === "" || sid === "none") return { done: true as const };

  const { data: session } = await supabaseSim
    .from("trading_sessions")
    .select("id, status")
    .eq("id", sid)
    .maybeSingle();

  if (!session || session.status !== "RUNNING") return { done: true as const };

  // Advance the market one step.
  const state = await loadPriceState();
  state.cycle += 1;
  stepPrices(state);

  // Heartbeat: fresh ping every tick so brainStatus never goes stale.
  await supabaseSim.from("brain_heartbeat").upsert({
    id: 1,
    last_ping: nowIso(),
    status: "RUNNING",
    current_cycle: state.cycle,
    message: `Cycle ${state.cycle}: scanning ${UNIVERSE.length} symbols (${state.direction})`,
  });

  // Evaluate every OPEN position against current prices.
  const { data: openTrades, error: openErr } = await supabaseSim
    .from("trades")
    .select("id, symbol, position_type, entry_price, quantity")
    .eq("session_id", sid)
    .eq("status", "OPEN");
  if (openErr) throw openErr;

  for (const open of openTrades ?? []) {
    const symbol = open.symbol as string;
    const positionType = (open.position_type as "LONG" | "SHORT") ?? "LONG";
    const entryPrice = (open.entry_price as number) ?? 0;
    const qty = (open.quantity as number) ?? 1;
    const ltp = state.prices[symbol] ?? entryPrice;
    const meta = state.openMeta[open.id as string] ?? {
      openedCycle: state.cycle - 1,
      ...exitLevels(entryPrice, positionType),
    };

    const exit = checkExit(ltp, positionType, meta, state.cycle);
    if (!exit.shouldExit) continue;

    const { pnl, pnlPercent } = tradePnl(entryPrice, ltp, qty, positionType);
    const { error: closeErr } = await supabaseSim
      .from("trades")
      .update({
        status: "CLOSED",
        exit_price: ltp,
        pnl,
        is_winner: pnl > 0,
        exit_reason: exit.reason,
        updated_at: nowIso(),
      })
      .eq("id", open.id);
    if (closeErr) throw closeErr;

    delete state.openMeta[open.id as string];

    await supabaseSim.from("brain_activity").insert({
      session_id: sid,
      activity_type: "POSITION_EXIT",
      symbol,
      message: `${exit.reason}: closed ${positionType} ${symbol} x${qty} @ ₹${ltp} — P&L ₹${pnl} (${pnlPercent}%)`,
    });
  }

  // Current book after exits.
  const { data: allTrades, error: allErr } = await supabaseSim
    .from("trades")
    .select("id, status")
    .eq("session_id", sid);
  if (allErr) throw allErr;

  const tradeCount = allTrades?.length ?? 0;
  let openCount = (allTrades ?? []).filter((t) => t.status === "OPEN").length;

  // Open a new position while there's room in the book.
  if (tradeCount < MAX_TRADES && openCount < MAX_CONCURRENT) {
    // Pick a symbol we don't already hold.
    const { data: heldRows } = await supabaseSim
      .from("trades")
      .select("symbol")
      .eq("session_id", sid)
      .eq("status", "OPEN");
    const held = new Set((heldRows ?? []).map((r) => r.symbol as string));
    const candidates = UNIVERSE.filter((s) => !held.has(s.symbol));
    const pick = candidates[Math.floor(Math.random() * candidates.length)];

    const entryPrice = state.prices[pick.symbol];
    const signal = generateSignal(state.direction);
    const qty = sizePosition(ALLOCATION, entryPrice);
    const brackets = exitLevels(entryPrice, signal.positionType);
    const tradeId = randomUUID();
    state.openMeta[tradeId] = { openedCycle: state.cycle, ...brackets };

    await supabaseSim.from("brain_activity").insert([
      {
        session_id: sid,
        activity_type: "ANALYZING",
        symbol: pick.symbol,
        message: `Analyzing ${pick.symbol} @ ₹${entryPrice} — RSI ${signal.rsi}, VWAP dist ${signal.vwapDist}%`,
      },
      {
        session_id: sid,
        activity_type: "SIGNAL",
        symbol: pick.symbol,
        message: `${signal.positionType === "LONG" ? "BUY" : "SELL"} signal, confidence ${signal.confidence}%`,
      },
      {
        session_id: sid,
        activity_type: "ORDER_PLACED",
        symbol: pick.symbol,
        message: `${signal.positionType} ${pick.symbol} x${qty} @ ₹${entryPrice} | SL ₹${brackets.stopLoss} · Target ₹${brackets.target}`,
      },
    ]);

    const { error: insErr } = await supabaseSim.from("trades").insert({
      id: tradeId,
      session_id: sid,
      symbol: pick.symbol,
      status: "OPEN",
      position_type: signal.positionType,
      entry_price: entryPrice,
      quantity: qty,
      entry_value: round2(entryPrice * qty),
      regime: state.direction === "SIDEWAYS" ? "CHOPPY" : "TRENDING",
      confidence_score: signal.confidence,
      updated_at: nowIso(),
    });
    if (insErr) throw insErr;

    openCount += 1;
    await setConfig(PRICE_STATE_KEY, JSON.stringify(state));
    return { done: false as const, tradeCount: tradeCount + 1, openCount };
  }

  // Occasionally log a considered-and-skipped symbol so the feed shows the
  // brain thinking even when the book is full.
  if (Math.random() < 0.4) {
    const skip = UNIVERSE[Math.floor(Math.random() * UNIVERSE.length)];
    await supabaseSim.from("brain_activity").insert({
      session_id: sid,
      activity_type: "SKIPPED",
      symbol: skip.symbol,
      message: `Skipped ${skip.symbol} @ ₹${state.prices[skip.symbol]} — confidence below threshold`,
    });
  }

  await setConfig(PRICE_STATE_KEY, JSON.stringify(state));

  // At maxTrades (or book full): do NOT finalize. Session stays RUNNING with
  // a fresh heartbeat until POST /mock/api/seed/end.
  return {
    done: false as const,
    tradeCount,
    openCount,
    atMax: tradeCount >= MAX_TRADES,
  };
}

export async function POST() {
  console.log(
    "[mock/seed/tick] invoked. SIM_URL present:",
    !!process.env.SIM_SUPABASE_URL,
    "SIM_KEY present:",
    !!process.env.SIM_SUPABASE_SERVICE_KEY
  );
  try {
    const result = await tick();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const e = err as { message?: string; stack?: string; details?: string; hint?: string; code?: string };
    const detail =
      e?.message ||
      (typeof err === "object" ? JSON.stringify(err) : String(err)) ||
      "no message";
    const stack = e?.stack || "no stack";
    console.error("[mock/seed/tick] FAILED:", detail, stack, {
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
