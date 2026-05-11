"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import type { Trade } from "@/lib/db";

interface Props {
  sessionId: string | null;
  isRunning: boolean;
}

interface QuotePayload {
  [symbol: string]: { last_price: number };
}

function timeHeld(entryAt: string | null): string {
  if (!entryAt) return "—";
  const s = Math.floor((Date.now() - new Date(entryAt).getTime()) / 1000);
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function progressPct(entry: number, current: number, sl: number, target: number): number {
  // Percentage along the [SL → target] range. 0 = at SL, 100 = at target.
  if (target === sl) return 50;
  const pct = ((current - sl) / (target - sl)) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function OpenPositions({ sessionId, isRunning }: Props) {
  const [positions, setPositions] = useState<Trade[]>([]);
  const [quotes, setQuotes] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const tickRef = useRef<NodeJS.Timeout | null>(null);
  const stopRef = useRef(false);

  // Poll positions
  useEffect(() => {
    stopRef.current = false;

    async function poll() {
      if (stopRef.current || !sessionId) return;
      try {
        const r = await api.get<{ positions: Trade[] }>(
          `/trade/open-positions?sessionId=${sessionId}`
        );
        if (stopRef.current) return;
        setPositions(r.data.positions ?? []);
      } catch {
        // non-fatal
      }
    }

    poll();
    if (isRunning && sessionId) {
      pollRef.current = setInterval(poll, 5000);
    }
    return () => {
      stopRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isRunning, sessionId]);

  // Poll live LTP for symbols in positions
  useEffect(() => {
    async function fetchQuotes() {
      if (positions.length === 0) return;
      try {
        const symbols = positions.map((p) => `${p.exchange}:${p.symbol}`);
        const params = new URLSearchParams();
        symbols.forEach((s) => params.append("i", s));
        const r = await api.get<{ quotes: QuotePayload }>(`/portfolio/holdings`);
        // Quotes endpoint isn't built — try to read LTP from holdings as fallback.
        const map: Record<string, number> = {};
        const holdings = (r.data as unknown as { holdings?: Array<{ tradingsymbol: string; last_price: number }> }).holdings ?? [];
        for (const h of holdings) map[h.tradingsymbol] = h.last_price;
        setQuotes(map);
      } catch {
        // non-fatal — P&L stays at entry
      }
    }

    fetchQuotes();
    if (isRunning) {
      tickRef.current = setInterval(() => {
        setTick((t) => t + 1);
        fetchQuotes();
      }, 5000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [positions, isRunning]);

  // Force re-render every second so "time held" updates
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f1f1f]">
        <h2 className="text-xs font-semibold text-[#f5f5f5] uppercase tracking-wider">
          Open Positions
          <span className="ml-2 font-normal text-[#444]">{positions.length}</span>
        </h2>
        {isRunning && (
          <span className="flex items-center gap-1 text-[10px] text-[#22c55e]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      {positions.length === 0 ? (
        <p className="px-5 py-8 text-center text-[#333] text-xs">No open positions.</p>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#0d0d0d]">
              <tr className="border-b border-[#1a1a1a]">
                {["Symbol", "Side", "Qty", "Entry", "Current", "P&L", "Stop / Target", "Held"].map((h) => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] text-[#444] font-medium uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const entry   = p.entry_price ?? 0;
                const current = quotes[p.symbol] ?? entry;
                const pnl     = (current - entry) * p.quantity;
                const sl      = p.stop_loss ?? entry * 0.95;
                const target  = p.target    ?? entry * 1.05;
                const pct     = progressPct(entry, current, sl, target);
                const profit  = pnl >= 0;

                return (
                  <tr key={p.id} className="border-b border-[#141414] hover:bg-[#151515]">
                    <td className="px-3 py-2.5 font-medium text-[#f5f5f5]">{p.symbol}</td>
                    <td className="px-3 py-2.5 text-[#22c55e] font-semibold">BUY</td>
                    <td className="px-3 py-2.5 text-[#888]">{p.quantity}</td>
                    <td className="px-3 py-2.5 text-[#888]">₹{entry.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-[#f5f5f5]">₹{current.toFixed(2)}</td>
                    <td className={`px-3 py-2.5 font-semibold ${profit ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                      {profit ? "+" : ""}₹{pnl.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 min-w-[160px]">
                      <div className="flex items-center justify-between text-[10px] text-[#555] mb-1">
                        <span className="text-[#ef4444]">₹{sl.toFixed(0)}</span>
                        <span className="text-[#22c55e]">₹{target.toFixed(0)}</span>
                      </div>
                      <div className="w-full bg-[#1a1a1a] rounded-full h-1.5 relative">
                        <div
                          className={`h-1.5 rounded-full ${profit ? "bg-[#22c55e]" : "bg-[#ef4444]"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[#888] font-mono" data-tick={tick}>{timeHeld(p.entry_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
