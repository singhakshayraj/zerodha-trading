// MOCK-ONLY explicit session finisher. Companion to /mock/api/seed?mode=live
// and /mock/api/seed/tick — tick never finalizes; this route is the only way
// a live staging session ends. Closes any leftover OPEN trades, computes
// totals, marks the session COMPLETED and returns config/heartbeat to IDLE.
// Writes only ever touch the sim client.
//
//   POST /mock/api/seed/end → { ok, done:true, sessionId?, totals? }
import { NextResponse } from "next/server";
import { supabaseSim } from "@/lib/supabase-sim";
import {
  PRICE_STATE_KEY,
  type PriceState,
  tradePnl,
} from "@/app/mock/lib/market-sim";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const nowIso = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;

async function setConfig(key: string, value: string) {
  // Must throw: silent config-write failures leave the dashboard reading
  // stale state while this route claims success.
  const { error } = await supabaseSim
    .from("app_config")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (error) throw new Error(`setConfig(${key}): ${error.message}${error.details ? ` — ${error.details}` : ""}`);
}

async function endSession() {
  const { data: cfgRow } = await supabaseSim
    .from("app_config")
    .select("value")
    .eq("key", "active_session_id")
    .maybeSingle();

  const sid = cfgRow?.value as string | undefined;
  if (!sid || sid === "" || sid === "none") return { done: true as const };

  // Close any leftover OPEN trades at the simulated last-traded price so
  // exits are consistent with the price walk, not random.
  const { data: stateRow } = await supabaseSim
    .from("app_config")
    .select("value")
    .eq("key", PRICE_STATE_KEY)
    .maybeSingle();
  let priceState: PriceState | null = null;
  try { priceState = JSON.parse((stateRow?.value as string) ?? ""); } catch { /* no state */ }

  const { data: openTrades, error: openErr } = await supabaseSim
    .from("trades")
    .select("id, symbol, position_type, entry_price, quantity")
    .eq("session_id", sid)
    .eq("status", "OPEN");
  if (openErr) throw openErr;

  for (const open of openTrades ?? []) {
    const entryPrice = (open.entry_price as number) ?? 0;
    const qty = (open.quantity as number) ?? 1;
    const positionType = (open.position_type as "LONG" | "SHORT") ?? "LONG";
    const ltp = priceState?.prices?.[open.symbol as string] ?? entryPrice;
    const { pnl, pnlPercent } = tradePnl(entryPrice, ltp, qty, positionType);

    const { error: closeErr } = await supabaseSim
      .from("trades")
      .update({
        status: "CLOSED",
        exit_price: ltp,
        pnl,
        is_winner: pnl > 0,
        exit_reason: "SESSION_END",
        updated_at: nowIso(),
      })
      .eq("id", open.id);
    if (closeErr) throw closeErr;

    await supabaseSim.from("brain_activity").insert({
      session_id: sid,
      activity_type: "POSITION_EXIT",
      symbol: open.symbol,
      message: `SESSION_END: closed ${positionType} ${open.symbol} x${qty} @ ₹${ltp} — P&L ₹${pnl} (${pnlPercent}%)`,
    });
  }

  // Drop sim price state so the next live seed starts a fresh walk.
  await setConfig(PRICE_STATE_KEY, "");

  // Totals from all trades in the session.
  const { data: allTrades, error: allErr } = await supabaseSim
    .from("trades")
    .select("id, pnl, is_winner")
    .eq("session_id", sid);
  if (allErr) throw allErr;

  const tradeCount = allTrades?.length ?? 0;
  const winning = (allTrades ?? []).filter((t) => t.is_winner).length;
  const losing = tradeCount - winning;
  const totalPnl = round2(
    (allTrades ?? []).reduce((s, t) => s + ((t.pnl as number) ?? 0), 0)
  );

  const { error: sessErr } = await supabaseSim
    .from("trading_sessions")
    .update({
      status: "COMPLETED",
      ended_at: nowIso(),
      total_trades_executed: tradeCount,
      winning_trades: winning,
      losing_trades: losing,
      total_pnl: totalPnl,
      end_reason: "USER_ENDED",
    })
    .eq("id", sid);
  if (sessErr) throw sessErr;

  await setConfig("active_session_id", "");
  await setConfig("brain_status", "IDLE");

  await supabaseSim.from("brain_heartbeat").upsert({
    id: 1,
    last_ping: nowIso(),
    status: "IDLE",
    current_cycle: 0,
    message: "Session ended by user",
  });

  await supabaseSim.from("brain_activity").insert({
    session_id: sid,
    activity_type: "SESSION_END",
    message: "Session ended: USER_ENDED",
  });

  return {
    done: true as const,
    sessionId: sid,
    totals: { trades: tradeCount, winning, losing, totalPnl },
  };
}

export async function POST() {
  console.log(
    "[mock/seed/end] invoked. SIM_URL present:",
    !!process.env.SIM_SUPABASE_URL,
    "SIM_KEY present:",
    !!process.env.SIM_SUPABASE_SERVICE_KEY
  );
  try {
    const result = await endSession();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const e = err as { message?: string; stack?: string; details?: string; hint?: string; code?: string };
    const detail =
      e?.message ||
      (typeof err === "object" ? JSON.stringify(err) : String(err)) ||
      "no message";
    const stack = e?.stack || "no stack";
    console.error("[mock/seed/end] FAILED:", detail, stack, {
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
