/**
 * Single entry point for all Supabase operations.
 * Import and call only from API routes — never from client components.
 */

import { supabaseServer } from "@/lib/supabase";

// ─────────────────────────────────────────────
// Row types (mirror the DB schema exactly)
// ─────────────────────────────────────────────

export type SessionStatus = "RUNNING" | "COMPLETED" | "ABORTED";
export type TradeStatus = "OPEN" | "CLOSED" | "CANCELLED";
export type MarketDirection = "BULLISH" | "BEARISH" | "SIDEWAYS";
export type DecisionAction = "BUY" | "HOLD" | "SKIP";

export interface TradingSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: SessionStatus;
  end_reason: string | null;
  capital_deployed: number;
  max_trades: number;
  max_loss_percent: number;
  max_profit_percent: number;
  trade_interval_seconds: number;
  stock_universe: string;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  total_pnl: number;
  peak_pnl: number;
  max_drawdown: number;
  created_at: string;
}

export interface Trade {
  id: string;
  session_id: string;
  symbol: string;
  exchange: string;
  entry_order_id: string | null;
  exit_order_id: string | null;
  entry_price: number | null;
  exit_price: number | null;
  quantity: number;
  product: string;
  status: TradeStatus;
  pnl: number | null;
  pnl_percent: number | null;
  entry_at: string | null;
  exit_at: string | null;
  stop_loss: number | null;
  target: number | null;
  entry_reason: string | null;
  exit_reason: string | null;
  indicators_at_entry: Record<string, unknown> | null;
  created_at: string;
}

export interface BrainDecision {
  id: string;
  session_id: string;
  symbol: string;
  action: DecisionAction;
  confidence: number;
  reasoning: string | null;
  indicators: Record<string, unknown>;
  market_direction: MarketDirection | null;
  resulted_in_trade: boolean;
  trade_id: string | null;
  created_at: string;
}

export interface MarketContext {
  id: string;
  session_id: string;
  market_direction: MarketDirection;
  nifty_price: number | null;
  nifty_change_pct: number | null;
  advance_decline_ratio: number | null;
  vix: number | null;
  top_gainers: string[];
  top_losers: string[];
  sector_momentum: Record<string, unknown>;
  raw_context: Record<string, unknown>;
  captured_at: string;
  created_at: string;
}

export interface BrainActivity {
  id: string;
  session_id: string;
  activity_type: string;
  symbol: string | null;
  message: string | null;
  data: Record<string, unknown> | null;
  created_at: string;
}

export interface StockUniverse {
  id: string;
  symbol: string;
  exchange: string;
  is_nifty50: boolean;
  is_user_holding: boolean;
  brain_score: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number | null;
  avg_pnl_per_trade: number | null;
  last_traded_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────

export interface CreateSessionConfig {
  capital_deployed: number;
  max_trades: number;
  max_loss_percent: number;
  max_profit_percent: number;
  trade_interval_seconds: number;
  stock_universe: string;
}

export interface CreateTradeData {
  symbol: string;
  exchange: string;
  quantity: number;
  product?: string;
  stop_loss?: number;
  target?: number;
  entry_reason?: string;
  indicators_at_entry?: Record<string, unknown>;
}

export interface UpdateTradeEntryData {
  entry_order_id: string;
  entry_price: number;
  entry_at?: string;
}

export interface CloseTradeData {
  exit_order_id: string;
  exit_price: number;
  exit_reason?: string;
  exit_at?: string;
}

export interface LogDecisionData {
  symbol: string;
  action: DecisionAction;
  confidence: number;
  reasoning?: string;
  indicators: Record<string, unknown>;
  market_direction?: MarketDirection;
  resulted_in_trade?: boolean;
  trade_id?: string;
}

export interface LogMarketContextData {
  market_direction: MarketDirection;
  nifty_price?: number;
  nifty_change_pct?: number;
  advance_decline_ratio?: number;
  vix?: number;
  top_gainers?: string[];
  top_losers?: string[];
  sector_momentum?: Record<string, unknown>;
  raw_context?: Record<string, unknown>;
}

export interface HoldingForUniverse {
  tradingsymbol: string;
  exchange: string;
}

// ─────────────────────────────────────────────
// Analytics return types
// ─────────────────────────────────────────────

export interface WinRateByTimeOfDay {
  bucket: string;
  win_rate: number;
  total_trades: number;
}

export interface WinRateByStock {
  symbol: string;
  win_rate: number;
  avg_pnl: number;
}

export interface WinRateByMarketDirection {
  direction: MarketDirection;
  win_rate: number;
}

export interface IndicatorPattern {
  indicator_key: string;
  value_range: { min: number; max: number } | null;
  win_count: number;
  sample_values: unknown[];
}

export interface BrainHeartbeat {
  id: string;
  status: "ONLINE" | "RUNNING" | "OFFLINE" | "ERROR";
  last_ping: string;
  current_cycle: number | null;
  message: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────
// CONFIG (app_config table — brain reads/writes)
// ─────────────────────────────────────────────

export async function writeConfig(key: string, value: string): Promise<void> {
  const { error } = await supabaseServer
    .from("app_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) {
    console.error(`writeConfig failed for key '${key}':`, error);
    throw new Error(`writeConfig(${key}): ${error.message}`);
  }

  console.log(`writeConfig success: ${key} = ${value.slice(0, 200)}`);
}

export async function readConfig(key: string): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("app_config")
    .select("value")
    .eq("key", key)
    .single();

  if (error) return null;
  return (data?.value as string) ?? null;
}

// ─────────────────────────────────────────────
// BRAIN HEARTBEAT
// ─────────────────────────────────────────────

export async function getBrainHeartbeat(): Promise<BrainHeartbeat | null> {
  const { data, error } = await supabaseServer
    .from("brain_heartbeat")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return null;
  return data as BrainHeartbeat;
}

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────

export async function ping(): Promise<boolean> {
  const { error } = await supabaseServer
    .from("trading_sessions")
    .select("id")
    .limit(1);
  return !error;
}

// ─────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────

export async function createSession(
  config: CreateSessionConfig
): Promise<TradingSession> {
  const { data, error } = await supabaseServer
    .from("trading_sessions")
    .insert({
      status: "RUNNING",
      capital_deployed: config.capital_deployed,
      max_trades: config.max_trades,
      max_loss_percent: config.max_loss_percent,
      max_profit_percent: config.max_profit_percent,
      trade_interval_seconds: config.trade_interval_seconds,
      stock_universe: config.stock_universe,
    })
    .select()
    .single();

  if (error) throw new Error(`createSession: ${error.message}`);
  return data as TradingSession;
}

export async function updateSession(
  id: string,
  updates: Partial<
    Pick<
      TradingSession,
      | "total_trades"
      | "winning_trades"
      | "losing_trades"
      | "total_pnl"
      | "peak_pnl"
      | "max_drawdown"
      | "status"
    >
  >
): Promise<void> {
  const { error } = await supabaseServer
    .from("trading_sessions")
    .update(updates)
    .eq("id", id);

  if (error) throw new Error(`updateSession: ${error.message}`);
}

export async function endSession(
  id: string,
  endReason: string
): Promise<void> {
  const { error } = await supabaseServer
    .from("trading_sessions")
    .update({
      status: "STOPPED",
      ended_at: new Date().toISOString(),
      end_reason: endReason,
    })
    .eq("id", id);

  if (error) throw new Error(`endSession: ${error.message}`);
}

export async function getLatestSession(): Promise<TradingSession> {
  const { data, error } = await supabaseServer
    .from("trading_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) throw new Error(`getLatestSession: ${error.message}`);
  return data as TradingSession;
}

export async function getSessionHistory(
  limit = 30
): Promise<TradingSession[]> {
  const { data, error } = await supabaseServer
    .from("trading_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getSessionHistory: ${error.message}`);
  return (data ?? []) as TradingSession[];
}

// ─────────────────────────────────────────────
// TRADES
// ─────────────────────────────────────────────

export async function createTrade(
  sessionId: string,
  tradeData: CreateTradeData
): Promise<Trade> {
  const { data, error } = await supabaseServer
    .from("trades")
    .insert({
      session_id: sessionId,
      symbol: tradeData.symbol,
      exchange: tradeData.exchange,
      quantity: tradeData.quantity,
      product: tradeData.product ?? "CNC",
      status: "OPEN",
      stop_loss: tradeData.stop_loss ?? null,
      target: tradeData.target ?? null,
      entry_reason: tradeData.entry_reason ?? null,
      indicators_at_entry: tradeData.indicators_at_entry ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`createTrade: ${error.message}`);
  return data as Trade;
}

export async function updateTradeEntry(
  tradeId: string,
  orderData: UpdateTradeEntryData
): Promise<void> {
  const { error } = await supabaseServer
    .from("trades")
    .update({
      entry_order_id: orderData.entry_order_id,
      entry_price: orderData.entry_price,
      entry_at: orderData.entry_at ?? new Date().toISOString(),
    })
    .eq("id", tradeId);

  if (error) throw new Error(`updateTradeEntry: ${error.message}`);
}

export async function closeTrade(
  tradeId: string,
  exitData: CloseTradeData
): Promise<void> {
  // Fetch trade to calculate pnl
  const { data: trade, error: fetchErr } = await supabaseServer
    .from("trades")
    .select("entry_price, quantity, symbol")
    .eq("id", tradeId)
    .single();

  if (fetchErr) throw new Error(`closeTrade fetch: ${fetchErr.message}`);

  const entryPrice = trade.entry_price as number;
  const quantity = trade.quantity as number;
  const pnl = (exitData.exit_price - entryPrice) * quantity;
  const pnlPercent =
    entryPrice > 0 ? ((exitData.exit_price - entryPrice) / entryPrice) * 100 : 0;

  const { error } = await supabaseServer
    .from("trades")
    .update({
      exit_order_id: exitData.exit_order_id,
      exit_price: exitData.exit_price,
      exit_at: exitData.exit_at ?? new Date().toISOString(),
      exit_reason: exitData.exit_reason ?? null,
      pnl,
      pnl_percent: pnlPercent,
      status: "CLOSED",
    })
    .eq("id", tradeId);

  if (error) throw new Error(`closeTrade update: ${error.message}`);

  // Update stock universe stats after close
  await updateStockScore(trade.symbol as string, { pnl, pnlPercent });
}

export async function getOpenTrades(sessionId: string): Promise<Trade[]> {
  const { data, error } = await supabaseServer
    .from("trades")
    .select("*")
    .eq("session_id", sessionId)
    .eq("status", "OPEN");

  if (error) throw new Error(`getOpenTrades: ${error.message}`);
  return (data ?? []) as Trade[];
}

export async function getOpenPositions(sessionId: string): Promise<Trade[]> {
  return getOpenTrades(sessionId);
}

export async function getBrainActivity(
  sessionId: string | null,
  limit: number = 50
): Promise<BrainActivity[]> {
  let q = supabaseServer.from("brain_activity").select("*");
  if (sessionId) q = q.eq("session_id", sessionId);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getBrainActivity: ${error.message}`);
  return (data ?? []) as BrainActivity[];
}

export async function getSessionTrades(sessionId: string): Promise<Trade[]> {
  const { data, error } = await supabaseServer
    .from("trades")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`getSessionTrades: ${error.message}`);
  return (data ?? []) as Trade[];
}

// ─────────────────────────────────────────────
// BRAIN DECISIONS
// ─────────────────────────────────────────────

export async function logDecision(
  sessionId: string,
  decisionData: LogDecisionData
): Promise<BrainDecision> {
  const { data, error } = await supabaseServer
    .from("brain_decisions")
    .insert({
      session_id: sessionId,
      symbol: decisionData.symbol,
      action: decisionData.action,
      confidence: decisionData.confidence,
      reasoning: decisionData.reasoning ?? null,
      indicators: decisionData.indicators,
      market_direction: decisionData.market_direction ?? null,
      resulted_in_trade: decisionData.resulted_in_trade ?? false,
      trade_id: decisionData.trade_id ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`logDecision: ${error.message}`);
  return data as BrainDecision;
}

export async function getDecisionHistory(
  symbol: string,
  limit = 100
): Promise<BrainDecision[]> {
  const { data, error } = await supabaseServer
    .from("brain_decisions")
    .select("*")
    .eq("symbol", symbol)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getDecisionHistory: ${error.message}`);
  return (data ?? []) as BrainDecision[];
}

// ─────────────────────────────────────────────
// MARKET CONTEXT
// ─────────────────────────────────────────────

export async function logMarketContext(
  sessionId: string,
  contextData: LogMarketContextData
): Promise<void> {
  const { error } = await supabaseServer.from("market_context").insert({
    session_id: sessionId,
    market_direction: contextData.market_direction,
    nifty_price: contextData.nifty_price ?? null,
    nifty_change_pct: contextData.nifty_change_pct ?? null,
    advance_decline_ratio: contextData.advance_decline_ratio ?? null,
    vix: contextData.vix ?? null,
    top_gainers: contextData.top_gainers ?? [],
    top_losers: contextData.top_losers ?? [],
    sector_momentum: contextData.sector_momentum ?? {},
    raw_context: contextData.raw_context ?? {},
    captured_at: new Date().toISOString(),
  });

  if (error) throw new Error(`logMarketContext: ${error.message}`);
}

export async function getLatestContext(): Promise<MarketContext> {
  const { data, error } = await supabaseServer
    .from("market_context")
    .select("*")
    .order("captured_at", { ascending: false })
    .limit(1)
    .single();

  if (error) throw new Error(`getLatestContext: ${error.message}`);
  return data as MarketContext;
}

// ─────────────────────────────────────────────
// STOCK UNIVERSE
// ─────────────────────────────────────────────

export async function getStockUniverse(
  filter: "ALL" | "NIFTY50" | "HOLDINGS" = "ALL"
): Promise<StockUniverse[]> {
  let query = supabaseServer.from("stock_universe").select("*");

  if (filter === "NIFTY50") query = query.eq("is_nifty50", true);
  else if (filter === "HOLDINGS") query = query.eq("is_user_holding", true);

  const { data, error } = await query.order("brain_score", { ascending: false });
  if (error) throw new Error(`getStockUniverse: ${error.message}`);
  return (data ?? []) as StockUniverse[];
}

export async function updateStockScore(
  symbol: string,
  tradeResult: { pnl: number; pnlPercent: number }
): Promise<void> {
  // Fetch current row
  const { data: existing, error: fetchErr } = await supabaseServer
    .from("stock_universe")
    .select("brain_score, total_trades, winning_trades, losing_trades, avg_pnl_per_trade")
    .eq("symbol", symbol)
    .single();

  if (fetchErr) throw new Error(`updateStockScore fetch: ${fetchErr.message}`);

  const isWinner = tradeResult.pnl > 0;
  const rawScore =
    (existing.brain_score as number) + (isWinner ? 2 : -3);
  const newScore = Math.min(100, Math.max(0, rawScore));

  const totalTrades = (existing.total_trades as number) + 1;
  const winningTrades =
    (existing.winning_trades as number) + (isWinner ? 1 : 0);
  const losingTrades =
    (existing.losing_trades as number) + (isWinner ? 0 : 1);
  const winRate = (winningTrades / totalTrades) * 100;

  const prevAvg = (existing.avg_pnl_per_trade as number) ?? 0;
  const prevTotal = totalTrades - 1;
  const avgPnlPerTrade =
    prevTotal === 0
      ? tradeResult.pnlPercent
      : (prevAvg * prevTotal + tradeResult.pnlPercent) / totalTrades;

  const { error } = await supabaseServer
    .from("stock_universe")
    .update({
      brain_score: newScore,
      total_trades: totalTrades,
      winning_trades: winningTrades,
      losing_trades: losingTrades,
      win_rate: winRate,
      avg_pnl_per_trade: avgPnlPerTrade,
      last_traded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("symbol", symbol);

  if (error) throw new Error(`updateStockScore update: ${error.message}`);
}

export async function addHoldingsToUniverse(
  holdings: HoldingForUniverse[]
): Promise<void> {
  if (holdings.length === 0) return;

  // Fetch existing symbols to avoid duplicates
  const symbols = holdings.map((h) => h.tradingsymbol);
  const { data: existing, error: fetchErr } = await supabaseServer
    .from("stock_universe")
    .select("symbol")
    .in("symbol", symbols);

  if (fetchErr) throw new Error(`addHoldingsToUniverse fetch: ${fetchErr.message}`);

  const existingSet = new Set((existing ?? []).map((r: { symbol: string }) => r.symbol));

  const newRows = holdings
    .filter((h) => !existingSet.has(h.tradingsymbol))
    .map((h) => ({
      symbol: h.tradingsymbol,
      exchange: h.exchange,
      is_nifty50: false,
      is_user_holding: true,
      brain_score: 50,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: null,
      avg_pnl_per_trade: null,
      last_traded_at: null,
    }));

  if (newRows.length === 0) {
    // Mark existing holdings as is_user_holding = true
    const { error } = await supabaseServer
      .from("stock_universe")
      .update({ is_user_holding: true })
      .in("symbol", symbols);
    if (error) throw new Error(`addHoldingsToUniverse mark: ${error.message}`);
    return;
  }

  const { error: insertErr } = await supabaseServer
    .from("stock_universe")
    .insert(newRows);

  if (insertErr) throw new Error(`addHoldingsToUniverse insert: ${insertErr.message}`);

  // Mark already-existing ones as holdings too
  const alreadyExisting = symbols.filter((s) => existingSet.has(s));
  if (alreadyExisting.length > 0) {
    const { error } = await supabaseServer
      .from("stock_universe")
      .update({ is_user_holding: true })
      .in("symbol", alreadyExisting);
    if (error) throw new Error(`addHoldingsToUniverse mark existing: ${error.message}`);
  }
}

export async function getTopScoredStocks(
  limit = 10
): Promise<StockUniverse[]> {
  const { data, error } = await supabaseServer
    .from("stock_universe")
    .select("*")
    .order("brain_score", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getTopScoredStocks: ${error.message}`);
  return (data ?? []) as StockUniverse[];
}

// ─────────────────────────────────────────────
// ANALYTICS (Phase 2)
// ─────────────────────────────────────────────

export async function getWinRateByTimeOfDay(): Promise<WinRateByTimeOfDay[]> {
  // Group closed winning trades by hour bucket using entry_at
  const { data, error } = await supabaseServer
    .from("trades")
    .select("entry_at, pnl")
    .eq("status", "CLOSED")
    .not("entry_at", "is", null)
    .not("pnl", "is", null);

  if (error) throw new Error(`getWinRateByTimeOfDay: ${error.message}`);

  const buckets: Record<string, { wins: number; total: number }> = {};
  for (const row of data ?? []) {
    const hour = new Date(row.entry_at as string).getUTCHours();
    // IST = UTC+5:30; adjust for display
    const istHour = (hour + 5) % 24;
    const bucket = `${String(istHour).padStart(2, "0")}:00`;
    if (!buckets[bucket]) buckets[bucket] = { wins: 0, total: 0 };
    buckets[bucket].total++;
    if ((row.pnl as number) > 0) buckets[bucket].wins++;
  }

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, { wins, total }]) => ({
      bucket,
      win_rate: total > 0 ? (wins / total) * 100 : 0,
      total_trades: total,
    }));
}

export async function getWinRateByStock(): Promise<WinRateByStock[]> {
  const { data, error } = await supabaseServer
    .from("stock_universe")
    .select("symbol, win_rate, avg_pnl_per_trade")
    .not("win_rate", "is", null)
    .order("win_rate", { ascending: false });

  if (error) throw new Error(`getWinRateByStock: ${error.message}`);
  return (data ?? []).map((r) => ({
    symbol: r.symbol as string,
    win_rate: r.win_rate as number,
    avg_pnl: r.avg_pnl_per_trade as number,
  }));
}

export async function getWinRateByMarketDirection(): Promise<
  WinRateByMarketDirection[]
> {
  const { data, error } = await supabaseServer
    .from("trades")
    .select("pnl, session_id")
    .eq("status", "CLOSED")
    .not("pnl", "is", null);

  if (error) throw new Error(`getWinRateByMarketDirection fetch trades: ${error.message}`);

  // Fetch last market context per session
  const sessionIds = Array.from(new Set((data ?? []).map((r) => r.session_id as string)));
  const { data: contexts, error: ctxErr } = await supabaseServer
    .from("market_context")
    .select("session_id, market_direction")
    .in("session_id", sessionIds)
    .order("captured_at", { ascending: true });

  if (ctxErr) throw new Error(`getWinRateByMarketDirection fetch context: ${ctxErr.message}`);

  // Map session → most recent direction
  const sessionDirection: Record<string, MarketDirection> = {};
  for (const ctx of contexts ?? []) {
    sessionDirection[ctx.session_id as string] = ctx.market_direction as MarketDirection;
  }

  const buckets: Record<string, { wins: number; total: number }> = {};
  for (const trade of data ?? []) {
    const dir = sessionDirection[trade.session_id as string];
    if (!dir) continue;
    if (!buckets[dir]) buckets[dir] = { wins: 0, total: 0 };
    buckets[dir].total++;
    if ((trade.pnl as number) > 0) buckets[dir].wins++;
  }

  return Object.entries(buckets).map(([direction, { wins, total }]) => ({
    direction: direction as MarketDirection,
    win_rate: total > 0 ? (wins / total) * 100 : 0,
  }));
}

export async function getBestIndicatorCombinations(): Promise<
  IndicatorPattern[]
> {
  // Pull winning trade decisions
  const { data, error } = await supabaseServer
    .from("brain_decisions")
    .select("indicators, trade_id")
    .eq("resulted_in_trade", true)
    .not("trade_id", "is", null);

  if (error) throw new Error(`getBestIndicatorCombinations fetch decisions: ${error.message}`);

  const tradeIds = (data ?? []).map((d) => d.trade_id as string);
  if (tradeIds.length === 0) return [];

  const { data: trades, error: tradeErr } = await supabaseServer
    .from("trades")
    .select("id, pnl")
    .in("id", tradeIds)
    .gt("pnl", 0); // winners only

  if (tradeErr) throw new Error(`getBestIndicatorCombinations fetch trades: ${tradeErr.message}`);

  const winnerTradeIds = new Set((trades ?? []).map((t) => t.id as string));
  const winnerDecisions = (data ?? []).filter((d) =>
    winnerTradeIds.has(d.trade_id as string)
  );

  // Aggregate per top-level indicator key
  const patterns: Record<
    string,
    { values: unknown[]; count: number }
  > = {};

  for (const decision of winnerDecisions) {
    const indicators = decision.indicators as Record<string, unknown>;
    for (const [key, value] of Object.entries(indicators)) {
      if (!patterns[key]) patterns[key] = { values: [], count: 0 };
      patterns[key].values.push(value);
      patterns[key].count++;
    }
  }

  return Object.entries(patterns)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([key, { values, count }]) => {
      const numericValues = values.filter(
        (v): v is number => typeof v === "number"
      );
      const valueRange =
        numericValues.length > 0
          ? {
              min: Math.min(...numericValues),
              max: Math.max(...numericValues),
            }
          : null;

      return {
        indicator_key: key,
        value_range: valueRange,
        win_count: count,
        sample_values: values.slice(0, 5),
      };
    });
}
