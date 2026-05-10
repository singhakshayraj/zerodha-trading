import { Holding } from "./types";
import { TradingConfig, TradeLogEntry, useAppStore } from "./store";
import api from "./api";

export interface Signal {
  symbol: string;
  exchange: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  reason: string;
  confidence: number;
  indicators: Record<string, number>;
}

interface AnalysisResult {
  signal: "BUY" | "SELL" | "HOLD";
  reason: string;
  confidence: number;
  indicators: Record<string, number>;
}

function isMarketOpen(): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const h = ist.getHours();
  const m = ist.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
}

function calcPnlPct(holding: Holding): number {
  if (holding.average_price <= 0) return 0;
  return ((holding.last_price - holding.average_price) / holding.average_price) * 100;
}

export function analyzeHolding(holding: Holding): AnalysisResult {
  const pnlPct = calcPnlPct(holding);
  const dayChangePct = holding.day_change_percentage;

  const indicators: Record<string, number> = {
    pnl_pct: pnlPct,
    day_change_pct: dayChangePct,
    last_price: holding.last_price,
    average_price: holding.average_price,
    quantity: holding.quantity,
  };

  if (pnlPct > 15)
    return { signal: "SELL", reason: `Profit target hit: +${pnlPct.toFixed(1)}%`, confidence: 95, indicators };
  if (dayChangePct < -3)
    return { signal: "SELL", reason: `Sharp day decline: ${dayChangePct.toFixed(1)}%`, confidence: 85, indicators };
  if (pnlPct < -8)
    return { signal: "SELL", reason: `Stop-loss trigger: ${pnlPct.toFixed(1)}%`, confidence: 90, indicators };
  if (pnlPct > 10 && dayChangePct < -1)
    return { signal: "SELL", reason: `Booking profit at ${pnlPct.toFixed(1)}% (reversal signal)`, confidence: 75, indicators };
  if (dayChangePct < -2 && pnlPct > -5)
    return { signal: "BUY", reason: `Dip buying: day change ${dayChangePct.toFixed(1)}%, fundamentally sound`, confidence: 70, indicators };
  if (pnlPct < -3 && pnlPct > -8 && dayChangePct > 0)
    return { signal: "BUY", reason: `Recovery signal: recovering from ${pnlPct.toFixed(1)}%`, confidence: 65, indicators };

  return { signal: "HOLD", reason: `No clear signal (P&L: ${pnlPct.toFixed(1)}%, Day: ${dayChangePct.toFixed(1)}%)`, confidence: 50, indicators };
}

async function logDecisionToDB(
  sessionId: string,
  symbol: string,
  analysis: AnalysisResult,
  tradeId?: string
): Promise<void> {
  try {
    await api.post("/brain/decision", {
      sessionId,
      decisionData: {
        symbol,
        action: analysis.signal === "HOLD" ? "HOLD" : analysis.signal === "BUY" ? "BUY" : "SKIP",
        confidence: analysis.confidence,
        reasoning: analysis.reason,
        indicators: analysis.indicators,
        resulted_in_trade: analysis.signal !== "HOLD",
        ...(tradeId && { trade_id: tradeId }),
      },
    });
  } catch {
    // non-fatal — brain keeps running even if logging fails
  }
}

export function generateSignals(holdings: Holding[], config: TradingConfig): {
  signals: Signal[];
  allAnalyses: { holding: Holding; analysis: AnalysisResult }[];
} {
  const { addBrainLog } = useAppStore.getState();
  const signals: Signal[] = [];
  const allAnalyses: { holding: Holding; analysis: AnalysisResult }[] = [];
  const capitalPerTrade = config.capital / Math.max(config.maxTrades, 1);

  for (const h of holdings) {
    addBrainLog(`Analyzing ${h.tradingsymbol} — LTP: ₹${h.last_price}, Day: ${h.day_change_percentage.toFixed(2)}%, P&L: ${h.pnl.toFixed(0)}`, "info");

    const analysis = analyzeHolding(h);
    allAnalyses.push({ holding: h, analysis });

    if (analysis.signal === "HOLD") continue;

    const qty = analysis.signal === "SELL"
      ? h.quantity
      : Math.max(1, Math.floor(capitalPerTrade / h.last_price));

    if (qty <= 0) continue;

    addBrainLog(`Signal: ${analysis.signal} ${h.tradingsymbol} × ${qty} @ ₹${h.last_price} — ${analysis.reason}`, "signal");

    signals.push({
      symbol: h.tradingsymbol,
      exchange: h.exchange,
      action: analysis.signal,
      quantity: qty,
      price: h.last_price,
      reason: analysis.reason,
      confidence: analysis.confidence,
      indicators: analysis.indicators,
    });
  }

  return { signals, allAnalyses };
}

export async function executeTrade(
  signal: Signal,
  sessionId: string | null
): Promise<{ success: boolean; orderId?: string; tradeId?: string; error?: string }> {
  const { addBrainLog } = useAppStore.getState();

  if (!isMarketOpen()) {
    addBrainLog("Market is closed (9:15 AM – 3:30 PM IST only). Skipping trade.", "error");
    return { success: false, error: "Market closed" };
  }

  try {
    const res = await api.post("/trade/place", {
      tradingsymbol: signal.symbol,
      exchange: signal.exchange,
      transaction_type: signal.action,
      quantity: signal.quantity,
      order_type: "MARKET",
      product: "CNC",
      validity: "DAY",
    });

    const orderId = res.data.order_id as string;
    addBrainLog(`Order placed. ID: ${orderId}`, "order");

    // Record in DB
    let tradeId: string | undefined;
    if (sessionId) {
      try {
        if (signal.action === "BUY") {
          const rec = await api.post("/trade/record", {
            sessionId,
            tradeData: {
              symbol: signal.symbol,
              exchange: signal.exchange,
              quantity: signal.quantity,
              product: "CNC",
              entry_reason: signal.reason,
              indicators_at_entry: signal.indicators,
            },
            orderData: {
              entry_order_id: orderId,
              entry_price: signal.price,
            },
          });
          tradeId = rec.data.tradeId as string;
        } else {
          // SELL path: tradeId comes from the BUY phase via runTradingCycle.
        }
      } catch {
        // non-fatal
      }
    }

    return { success: true, orderId, tradeId };
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || String(err);
    addBrainLog(`Order failed: ${msg}`, "error");
    return { success: false, error: msg };
  }
}

export async function runTradingCycle(
  holdings: Holding[],
  config: TradingConfig,
  sessionId: string | null
): Promise<void> {
  const store = useAppStore.getState();
  const { session, addBrainLog, addTradeLog, updateSessionPnl, stopSession } = store;

  if (session.status !== "running") return;
  if (!isMarketOpen()) {
    addBrainLog("Market closed — skipping this cycle.", "error");
    return;
  }

  const remaining = config.maxTrades - session.tradesExecuted;
  if (remaining <= 0) {
    stopSession("Max trades reached");
    return;
  }

  addBrainLog(`--- Cycle start. Trades remaining: ${remaining} ---`, "info");

  const { signals, allAnalyses } = generateSignals(holdings, config);

  // Log ALL decisions (including HOLDs) to DB
  if (sessionId) {
    for (const { holding, analysis } of allAnalyses) {
      // Fire-and-forget — don't await to keep the cycle fast
      logDecisionToDB(sessionId, holding.tradingsymbol, analysis);
    }
  }

  const toExecute = signals.slice(0, remaining);

  for (const sig of toExecute) {
    if (useAppStore.getState().session.status !== "running") break;

    const result = await executeTrade(sig, sessionId);

    if (result.success) {
      const value = sig.quantity * sig.price;
      const avgPrice = holdings.find((h) => h.tradingsymbol === sig.symbol)?.average_price ?? sig.price;
      const pnl = sig.action === "SELL" ? sig.quantity * (sig.price - avgPrice) : 0;



      const entry: TradeLogEntry = {
        id: result.orderId ?? Date.now().toString(),
        time: new Date().toLocaleTimeString(),
        symbol: sig.symbol,
        action: sig.action,
        qty: sig.quantity,
        price: sig.price,
        value,
        pnl,
        reason: sig.reason,
        orderId: result.orderId,
      };

      addTradeLog(entry);
      if (sig.action === "SELL") updateSessionPnl(pnl);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  addBrainLog(`--- Cycle end. Total trades: ${useAppStore.getState().session.tradesExecuted} ---`, "info");
}
