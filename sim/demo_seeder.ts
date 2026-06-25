/**
 * Demo seeder for the staging (zerodha-trading-sim) Supabase project.
 *
 * Writes fake "brain activity" so the dashboard can be tested end-to-end
 * without a real Kite session or live market hours.
 *
 * Fully isolated: does NOT import from lib/supabase.ts and creates its own
 * client from sim/.env.sim. Refuses to run unless the URL contains "sim".
 *
 *   npm run seed:sim          # seed one fake completed session
 *   npm run seed:sim:reset    # wipe sim data back to IDLE defaults, then exit
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, ".env.sim") });

const SIM_URL = process.env.SIM_SUPABASE_URL ?? "";
const SIM_KEY = process.env.SIM_SUPABASE_SERVICE_KEY ?? "";

// --- SAFETY: never point at production -------------------------------------
if (!SIM_URL.includes("sim")) {
  console.error(
    `[ABORT] SIM_SUPABASE_URL must contain the substring "sim" (got: "${SIM_URL}").\n` +
      "This guard prevents accidentally seeding/wiping production. Check sim/.env.sim."
  );
  process.exit(1);
}
if (!SIM_KEY) {
  console.error("[ABORT] SIM_SUPABASE_SERVICE_KEY is empty. Fill in sim/.env.sim.");
  process.exit(1);
}

const sim = createClient(SIM_URL, SIM_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

const SYMBOLS = ["RELIANCE", "INFY", "HINDALCO", "SBIN", "HINDUNILVR"] as const;
const ENTRY_PRICES: Record<string, number> = {
  RELIANCE: 1350,
  INFY: 1190,
  HINDALCO: 1090,
  SBIN: 950,
  HINDUNILVR: 2190,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// app_config is a key/value table (PK: key). Mirror production write shape.
async function setConfig(key: string, value: string) {
  await sim
    .from("app_config")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
}

// brain_heartbeat is a single row (id=1). last_ping MUST be fresh (<120s) or
// the status route reports OFFLINE regardless of `status`. Call every loop.
async function pingHeartbeat(cycle: number, message: string) {
  await sim.from("brain_heartbeat").upsert({
    id: 1,
    last_ping: new Date().toISOString(),
    status: "RUNNING",
    current_cycle: cycle,
    message,
  });
}

// --- reset -----------------------------------------------------------------
async function reset() {
  console.log(`Resetting sim project to IDLE defaults: ${SIM_URL}`);

  // Delete every row (match-all filters; UUID/text pk both impossible to equal).
  await sim.from("trades").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await sim.from("brain_activity").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await sim
    .from("trading_sessions")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  // Upsert keys (don't delete) — the routes expect these keys to always exist.
  await setConfig("active_session_id", "");
  await setConfig("brain_status", "IDLE");

  // Stale last_ping (1h ago) so isAlive evaluates false → OFFLINE.
  await sim.from("brain_heartbeat").upsert({
    id: 1,
    last_ping: new Date(Date.now() - 3600_000).toISOString(),
    status: "OFFLINE",
    current_cycle: 0,
    message: "Reset to defaults",
  });

  console.log("Reset complete.");
}

// --- seed ------------------------------------------------------------------
async function seed() {
  console.log(`Seeding fake session to: ${SIM_URL}`);

  const sessionId = randomUUID();

  // 3. trading_sessions
  const { data: session, error: sessionErr } = await sim
    .from("trading_sessions")
    .insert({
      id: sessionId,
      status: "RUNNING",
      capital_deployed: 10000,
      max_trades: 5,
      max_loss_percent: 3,
      max_profit_percent: 5,
      trade_interval_seconds: 300,
      stock_universe: "BOTH",
    })
    .select("id")
    .single();
  if (sessionErr) throw sessionErr;
  const sid = session.id as string;

  // 4. app_config (key/value)
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

  // 5. brain_heartbeat
  await pingHeartbeat(0, "Seeding fake session");

  const trades: { pnl: number; isWinner: boolean }[] = [];

  // 6. loop
  for (let i = 0; i < 5; i++) {
    const symbol = SYMBOLS[i % SYMBOLS.length];
    const positionType = i % 2 === 0 ? "LONG" : "SHORT";
    const side = positionType === "LONG" ? "BUY" : "SELL";
    const entryPrice = ENTRY_PRICES[symbol];

    // Keep last_ping fresh at the top of every iteration.
    await pingHeartbeat(i, `Analyzing ${symbol}`);

    // a/b ANALYZING
    await sim.from("brain_activity").insert({
      activity_type: "ANALYZING",
      symbol,
      message: `Analyzing ${symbol}`,
    });

    await sleep(1000); // c

    // e SIGNAL
    await sim.from("brain_activity").insert({
      activity_type: "SIGNAL",
      symbol,
      message: `${side} signal, confidence 75%`,
    });

    // f trades (OPEN)
    const tradeId = randomUUID();
    const { error: tradeErr } = await sim.from("trades").insert({
      id: tradeId,
      session_id: sid,
      symbol,
      status: "OPEN",
      position_type: positionType,
      entry_price: entryPrice,
      quantity: 1,
      entry_value: entryPrice,
      regime: "TRENDING",
      confidence_score: 75,
    });
    if (tradeErr) throw tradeErr;

    // g ORDER_PLACED
    await sim.from("brain_activity").insert({
      activity_type: "ORDER_PLACED",
      symbol,
      message: `${positionType} opened ${symbol} x1`,
    });

    await sleep(2000); // h

    // i pnl
    const pnl = round2(Math.random() * 20 - 8); // [-8, +12]
    const isWinner = pnl > 0;

    // exit price consistent with pnl sign.
    // LONG: profit when exit > entry. SHORT: profit when exit < entry.
    const exitPrice =
      positionType === "LONG"
        ? round2(entryPrice + pnl)
        : round2(entryPrice - pnl);

    // j UPDATE trade -> CLOSED
    const { error: closeErr } = await sim
      .from("trades")
      .update({
        status: "CLOSED",
        exit_price: exitPrice,
        pnl,
        is_winner: isWinner,
        exit_reason: "SIGNAL_EXIT",
        updated_at: nowIso(),
      })
      .eq("id", tradeId);
    if (closeErr) throw closeErr;

    // k POSITION_EXIT
    await sim.from("brain_activity").insert({
      activity_type: "POSITION_EXIT",
      symbol,
      message: `Closed ${symbol}, P&L: Rs${pnl}`,
    });

    // l heartbeat cycle += 1 (fresh last_ping)
    await pingHeartbeat(i + 1, `Closed ${symbol}`);

    trades.push({ pnl, isWinner });
    console.log(`Trade ${i + 1}/5 complete: ${symbol} ${pnl}`);

    if (i < 4) await sleep(4000); // every 4 seconds between trades
  }

  // 7. totals
  const winning = trades.filter((t) => t.isWinner).length;
  const losing = trades.length - winning;
  const totalPnl = round2(trades.reduce((s, t) => s + t.pnl, 0));

  await sim
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

  await sim.from("brain_heartbeat").upsert({
    id: 1,
    last_ping: new Date().toISOString(),
    status: "IDLE",
    current_cycle: 5,
    message: "Session ended",
  });

  await sim.from("brain_activity").insert({
    activity_type: "SESSION_END",
    message: "Session ended: MAX_TRADES_HIT",
  });

  console.log(`Seeding complete. Session ${sid} finished.`);
}

async function main() {
  const doReset = process.argv.includes("--reset");
  if (doReset) {
    await reset();
    return;
  }
  await seed();
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
