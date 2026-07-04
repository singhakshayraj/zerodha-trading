// MOCK-ONLY market simulator. Gives the staging seed/tick routes realistic
// price action so the dashboard mimics real trading: per-symbol random-walk
// prices with volatility + market-direction drift, capital-based position
// sizing, stop-loss/target exit logic and varied signal confidence.
//
// Price state persists across serverless invocations in the sim app_config
// row "sim_price_state" — each tick advances the walk from the stored prices.

export type MarketDirection = "BULLISH" | "BEARISH" | "SIDEWAYS";
export type PositionType = "LONG" | "SHORT";

export interface SymbolDef {
  symbol: string;
  basePrice: number;
  volatility: number; // per-tick stddev as fraction of price
}

// NIFTY-ish universe. Base prices roughly realistic; volatility varies so
// some names chop harder than others.
export const UNIVERSE: SymbolDef[] = [
  { symbol: "RELIANCE",   basePrice: 1352.4,  volatility: 0.0035 },
  { symbol: "INFY",       basePrice: 1188.75, volatility: 0.0045 },
  { symbol: "HDFCBANK",   basePrice: 1712.3,  volatility: 0.0030 },
  { symbol: "TATAMOTORS", basePrice: 991.15,  volatility: 0.0065 },
  { symbol: "SBIN",       basePrice: 948.6,   volatility: 0.0050 },
  { symbol: "HINDALCO",   basePrice: 1087.9,  volatility: 0.0060 },
  { symbol: "ICICIBANK",  basePrice: 1288.45, volatility: 0.0035 },
  { symbol: "TCS",        basePrice: 3421.8,  volatility: 0.0030 },
  { symbol: "HINDUNILVR", basePrice: 2193.25, volatility: 0.0025 },
  { symbol: "AXISBANK",   basePrice: 1146.7,  volatility: 0.0045 },
];

export const PRICE_STATE_KEY = "sim_price_state";

export interface OpenTradeMeta {
  openedCycle: number;
  stopLoss: number;
  target: number;
}

export interface PriceState {
  direction: MarketDirection;
  cycle: number;
  prices: Record<string, number>;
  // trade id → exit levels + entry cycle (sim trades table has no SL/target
  // columns, so exit logic lives here)
  openMeta: Record<string, OpenTradeMeta>;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Box–Muller standard normal — uniform noise looks fake on a P&L curve.
function gaussian(): number {
  const u = Math.random() || 1e-9;
  const v = Math.random() || 1e-9;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pickDirection(): MarketDirection {
  const r = Math.random();
  return r < 0.4 ? "BULLISH" : r < 0.7 ? "SIDEWAYS" : "BEARISH";
}

export function initialPrices(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of UNIVERSE) {
    // Start slightly off base so every session opens at different levels.
    out[s.symbol] = round2(s.basePrice * (1 + gaussian() * 0.004));
  }
  return out;
}

// Advance every symbol one step: volatility noise + small drift from the
// session's market direction.
export function stepPrices(state: PriceState): void {
  const drift =
    state.direction === "BULLISH" ? 0.0008 :
    state.direction === "BEARISH" ? -0.0008 : 0;
  for (const s of UNIVERSE) {
    const p = state.prices[s.symbol] ?? s.basePrice;
    state.prices[s.symbol] = round2(p * (1 + drift + gaussian() * s.volatility));
  }
}

// Position sizing: fixed rupee allocation per trade, like a real capital-
// divided-by-max-trades book. Never less than 1 share.
export function sizePosition(allocation: number, price: number): number {
  return Math.max(1, Math.floor(allocation / price));
}

// Signal generation for a new entry: side follows the market direction most
// of the time (trend-following brain), confidence varies.
export function generateSignal(direction: MarketDirection): {
  positionType: PositionType;
  confidence: number;
  rsi: number;
  vwapDist: number;
} {
  const withTrend = Math.random() < 0.75;
  const positionType: PositionType =
    direction === "BULLISH" ? (withTrend ? "LONG" : "SHORT") :
    direction === "BEARISH" ? (withTrend ? "SHORT" : "LONG") :
    Math.random() < 0.5 ? "LONG" : "SHORT";
  const confidence = Math.round(62 + Math.random() * 33); // 62–95
  const rsi = round2(positionType === "LONG" ? 55 + Math.random() * 18 : 27 + Math.random() * 18);
  const vwapDist = round2((Math.random() * 0.9 + 0.05) * (positionType === "LONG" ? 1 : -1));
  return { positionType, confidence, rsi, vwapDist };
}

// Exit levels: tight intraday brackets — SL ~0.8%, target ~1.5%.
export function exitLevels(entry: number, positionType: PositionType): { stopLoss: number; target: number } {
  const slPct = 0.008 + Math.random() * 0.004;
  const tgtPct = 0.012 + Math.random() * 0.008;
  return positionType === "LONG"
    ? { stopLoss: round2(entry * (1 - slPct)), target: round2(entry * (1 + tgtPct)) }
    : { stopLoss: round2(entry * (1 + slPct)), target: round2(entry * (1 - tgtPct)) };
}

export interface ExitCheck {
  shouldExit: boolean;
  reason: "TARGET_HIT" | "STOP_LOSS" | "SIGNAL_EXIT" | null;
}

// Exit when price crosses the bracket, or a discretionary signal exit after
// the position has aged a few cycles.
export function checkExit(
  ltp: number,
  positionType: PositionType,
  meta: OpenTradeMeta,
  currentCycle: number
): ExitCheck {
  if (positionType === "LONG") {
    if (ltp >= meta.target) return { shouldExit: true, reason: "TARGET_HIT" };
    if (ltp <= meta.stopLoss) return { shouldExit: true, reason: "STOP_LOSS" };
  } else {
    if (ltp <= meta.target) return { shouldExit: true, reason: "TARGET_HIT" };
    if (ltp >= meta.stopLoss) return { shouldExit: true, reason: "STOP_LOSS" };
  }
  const age = currentCycle - meta.openedCycle;
  if (age >= 3 && Math.random() < 0.5) return { shouldExit: true, reason: "SIGNAL_EXIT" };
  return { shouldExit: false, reason: null };
}

export function tradePnl(
  entry: number,
  exit: number,
  qty: number,
  positionType: PositionType
): { pnl: number; pnlPercent: number } {
  const perShare = positionType === "LONG" ? exit - entry : entry - exit;
  return {
    pnl: round2(perShare * qty),
    pnlPercent: round2(entry > 0 ? (perShare / entry) * 100 : 0),
  };
}
