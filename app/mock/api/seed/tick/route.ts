// MOCK-ONLY live-session ticker. Companion to POST /mock/api/seed?mode=live.
// Each POST advances the live staging session one step: closes the current
// OPEN trade and either opens the next one or finalizes the session. The
// browser calls this on an interval so no serverless function ever has to
// hold a long-running timer. Writes only ever touch the sim client.
//
//   POST /mock/api/seed/tick → { ok, done, tradeCount? }
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseSim } from "@/lib/supabase-sim";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SYMBOLS = ["RELIANCE", "INFY", "HINDALCO", "SBIN", "HINDUNILVR"] as const;
const ENTRY_PRICES: Record<string, number> = {
  RELIANCE: 1350,
  INFY: 1190,
  HINDALCO: 1090,
  SBIN: 950,
  HINDUNILVR: 2190,
};
const MAX_TRADES = 5;

const nowIso = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;

async function setConfig(key: string, value: string) {
  await supabaseSim
    .from("app_config")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
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

  // Heartbeat: fresh ping, cycle += 1.
  const { data: hb } = await supabaseSim
    .from("brain_heartbeat")
    .select("current_cycle")
    .eq("id", 1)
    .maybeSingle();
  const cycle = ((hb?.current_cycle as number | null) ?? 0) + 1;
  await supabaseSim.from("brain_heartbeat").upsert({
    id: 1,
    last_ping: nowIso(),
    status: "RUNNING",
    current_cycle: cycle,
    message: `Cycle ${cycle}`,
  });

  // Close the most recent OPEN trade.
  const { data: openTrades, error: openErr } = await supabaseSim
    .from("trades")
    .select("id, symbol, position_type, entry_price")
    .eq("session_id", sid)
    .eq("status", "OPEN")
    .order("created_at", { ascending: false })
    .limit(1);
  if (openErr) throw openErr;

  const open = openTrades?.[0];
  if (open) {
    const pnl = round2(Math.random() * 20 - 8); // [-8, +12]
    const isWinner = pnl > 0;
    const entryPrice = (open.entry_price as number) ?? 0;
    const exitPrice =
      open.position_type === "SHORT"
        ? round2(entryPrice - pnl)
        : round2(entryPrice + pnl);

    const { error: closeErr } = await supabaseSim
      .from("trades")
      .update({
        status: "CLOSED",
        exit_price: exitPrice,
        pnl,
        is_winner: isWinner,
        exit_reason: "SIGNAL_EXIT",
        updated_at: nowIso(),
      })
      .eq("id", open.id);
    if (closeErr) throw closeErr;

    await supabaseSim.from("brain_activity").insert({
      session_id: sid,
      activity_type: "POSITION_EXIT",
      symbol: open.symbol,
      message: `Closed ${open.symbol}, P&L: Rs${pnl}`,
    });
  }

  // How many trades so far?
  const { data: allTrades, error: allErr } = await supabaseSim
    .from("trades")
    .select("id, pnl, is_winner")
    .eq("session_id", sid);
  if (allErr) throw allErr;

  const tradeCount = allTrades?.length ?? 0;

  if (tradeCount < MAX_TRADES) {
    // Open the next trade: rotating symbol, alternating LONG/SHORT.
    const i = tradeCount;
    const symbol = SYMBOLS[i % SYMBOLS.length];
    const positionType = i % 2 === 0 ? "LONG" : "SHORT";
    const side = positionType === "LONG" ? "BUY" : "SELL";
    const entryPrice = ENTRY_PRICES[symbol];

    await supabaseSim.from("brain_activity").insert([
      { session_id: sid, activity_type: "ANALYZING", symbol, message: `Analyzing ${symbol}` },
      { session_id: sid, activity_type: "SIGNAL", symbol, message: `${side} signal, confidence 75%` },
      { session_id: sid, activity_type: "ORDER_PLACED", symbol, message: `${positionType} opened ${symbol} x1` },
    ]);

    const { error: insErr } = await supabaseSim.from("trades").insert({
      id: randomUUID(),
      session_id: sid,
      symbol,
      status: "OPEN",
      position_type: positionType,
      entry_price: entryPrice,
      quantity: 1,
      entry_value: entryPrice,
      regime: "TRENDING",
      confidence_score: 75,
      updated_at: nowIso(),
    });
    if (insErr) throw insErr;

    return { done: false as const, tradeCount: tradeCount + 1 };
  }

  // All trades placed and now closed → finalize the session.
  const winning = (allTrades ?? []).filter((t) => t.is_winner).length;
  const losing = tradeCount - winning;
  const totalPnl = round2(
    (allTrades ?? []).reduce((s, t) => s + ((t.pnl as number) ?? 0), 0)
  );

  await supabaseSim
    .from("trading_sessions")
    .update({
      status: "COMPLETED",
      ended_at: nowIso(),
      total_trades_executed: tradeCount,
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
    current_cycle: cycle,
    message: "Session ended",
  });

  await supabaseSim.from("brain_activity").insert({
    session_id: sid,
    activity_type: "SESSION_END",
    message: "Session ended: MAX_TRADES_HIT",
  });

  return { done: true as const };
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
