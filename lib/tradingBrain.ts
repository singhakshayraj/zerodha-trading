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
  confidence: number; // 0-100
}

function isMarketOpen(): boolean {
  const now = new Date();
  // IST = UTC+5:30
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

export function analyzeHolding(holding: Holding): {
  signal: "BUY" | "SELL" | "HOLD";
  reason: string;
  confidence: number;
} {
  const pnlPct = calcPnlPct(holding);
  const dayChangePct = holding.day_change_percentage;

  // Strong sell signals
  if (pnlPct > 15) return { signal: "SELL", reason: `Profit target hit: +${pnlPct.toFixed(1)}%`, confidence: 95 };
  if (dayChangePct < -3) return { signal: "SELL", reason: `Sharp day decline: ${dayChangePct.toFixed(1)}%`, confidence: 85 };
  if (pnlPct < -8) return { signal: "SELL", reason: `Stop-loss trigger: ${pnlPct.toFixed(1)}%`, confidence: 90 };

  // Moderate sell
  if (pnlPct > 10 && dayChangePct < -1) return { signal: "SELL", reason: `Booking profit at ${pnlPct.toFixed(1)}% (reversal signal)`, confidence: 75 };

  // Strong buy signals (only in Holdings mode)
  if (dayChangePct < -2 && pnlPct > -5) return { signal: "BUY", reason: `Dip buying: day change ${dayChangePct.toFixed(1)}%, fundamentally sound`, confidence: 70 };
  if (pnlPct < -3 && pnlPct > -8 && dayChangePct > 0) return { signal: "BUY", reason: `Recovery signal: recovering from ${pnlPct.toFixed(1)}%`, confidence: 65 };

  return { signal: "HOLD", reason: `No clear signal (P&L: ${pnlPct.toFixed(1)}%, Day: ${dayChangePct.toFixed(1)}%)`, confidence: 50 };
}

export function generateSignals(holdings: Holding[], config: TradingConfig): Signal[] {
  const { addBrainLog } = useAppStore.getState();
  const signals: Signal[] = [];
  const capitalPerTrade = config.capital / Math.max(config.maxTrades, 1);

  for (const h of holdings) {
    addBrainLog(`Analyzing ${h.tradingsymbol} — LTP: ₹${h.last_price}, Day: ${h.day_change_percentage.toFixed(2)}%, P&L: ${h.pnl.toFixed(0)}`, "info");

    const { signal, reason, confidence } = analyzeHolding(h);
    if (signal === "HOLD") continue;

    const qty = signal === "SELL"
      ? h.quantity  // sell all
      : Math.max(1, Math.floor(capitalPerTrade / h.last_price));

    if (qty <= 0) continue;

    addBrainLog(`Signal: ${signal} ${h.tradingsymbol} × ${qty} @ ₹${h.last_price} — ${reason}`, "signal");

    signals.push({
      symbol: h.tradingsymbol,
      exchange: h.exchange,
      action: signal,
      quantity: qty,
      price: h.last_price,
      reason,
      confidence,
    });
  }

  return signals;
}

export async function executeTrade(signal: Signal): Promise<{ success: boolean; orderId?: string; error?: string }> {
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

    const orderId = res.data.order_id;
    addBrainLog(`Order placed. ID: ${orderId}`, "order");
    return { success: true, orderId };
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || String(err);
    addBrainLog(`Order failed: ${msg}`, "error");
    return { success: false, error: msg };
  }
}

export async function runTradingCycle(holdings: Holding[], config: TradingConfig): Promise<void> {
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

  const signals = generateSignals(holdings, config).slice(0, remaining);

  for (const sig of signals) {
    // re-check status before each trade (might have been stopped)
    if (useAppStore.getState().session.status !== "running") break;

    const result = await executeTrade(sig);

    if (result.success) {
      const value = sig.quantity * sig.price;
      const pnl = sig.action === "SELL"
        ? sig.quantity * (sig.price - (holdings.find((h) => h.tradingsymbol === sig.symbol)?.average_price ?? sig.price))
        : 0;

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

    // small delay between orders
    await new Promise((r) => setTimeout(r, 500));
  }

  addBrainLog(`--- Cycle end. Total trades: ${useAppStore.getState().session.tradesExecuted} ---`, "info");
}
