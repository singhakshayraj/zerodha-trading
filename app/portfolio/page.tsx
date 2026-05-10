"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Holding, Position, Funds } from "@/lib/types";
import api from "@/lib/api";
import { TrendingUp, TrendingDown, Loader2, RefreshCw } from "lucide-react";

function PnlBadge({ value }: { value: number }) {
  const isPos = value >= 0;
  return (
    <span className={`flex items-center gap-1 text-sm font-medium ${isPos ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
      {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {isPos ? "+" : ""}₹{value.toFixed(2)}
    </span>
  );
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PortfolioPage() {
  const router = useRouter();
  const { isConnected, hydrateFromStorage } = useAppStore();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [funds, setFunds] = useState<Funds | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"holdings" | "positions">("holdings");

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (!isConnected) router.push("/connect");
  }, [isConnected, router]);

  async function fetchData() {
    setLoading(true);
    try {
      const [h, p, f] = await Promise.all([
        api.post("/portfolio/holdings"),
        api.post("/portfolio/positions"),
        api.post("/portfolio/funds"),
      ]);
      setHoldings(h.data.holdings || []);
      setPositions(p.data.positions?.net || []);
      setFunds(f.data.funds || null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isConnected) fetchData();
  }, [isConnected]);

  const totalPnl = holdings.reduce((sum, h) => sum + h.pnl, 0);
  const totalValue = holdings.reduce((sum, h) => sum + h.last_price * h.quantity, 0);

  return (
    <div className="flex h-screen bg-[#0a0a0a]">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Portfolio" />
        <main className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-6 h-6 animate-spin text-[#3b82f6]" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-4">
                  <p className="text-xs text-[#666666] mb-1">Portfolio Value</p>
                  <p className="text-xl font-semibold text-[#f5f5f5]">{fmt(totalValue)}</p>
                </div>
                <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-4">
                  <p className="text-xs text-[#666666] mb-1">Total P&L</p>
                  <PnlBadge value={totalPnl} />
                </div>
                {funds && (
                  <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-4">
                    <p className="text-xs text-[#666666] mb-1">Available Cash</p>
                    <p className="text-xl font-semibold text-[#f5f5f5]">
                      {fmt(funds.equity?.available?.live_balance ?? 0)}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  {(["holdings", "positions"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                        tab === t
                          ? "bg-[#1f1f1f] text-[#f5f5f5]"
                          : "text-[#666666] hover:text-[#f5f5f5]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button
                  onClick={fetchData}
                  className="flex items-center gap-1.5 text-xs text-[#666666] hover:text-[#f5f5f5] transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </button>
              </div>

              {tab === "holdings" && (
                <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1f1f1f]">
                        {["Symbol", "Qty", "Avg Price", "LTP", "P&L", "Day Change"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs text-[#666666] font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {holdings.map((h) => (
                        <tr key={h.tradingsymbol} className="border-b border-[#1f1f1f] hover:bg-[#1a1a1a] transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-[#f5f5f5]">{h.tradingsymbol}</p>
                            <p className="text-xs text-[#666666]">{h.exchange}</p>
                          </td>
                          <td className="px-4 py-3 text-[#f5f5f5]">{h.quantity}</td>
                          <td className="px-4 py-3 text-[#f5f5f5]">{fmt(h.average_price)}</td>
                          <td className="px-4 py-3 text-[#f5f5f5]">{fmt(h.last_price)}</td>
                          <td className="px-4 py-3"><PnlBadge value={h.pnl} /></td>
                          <td className="px-4 py-3">
                            <span className={h.day_change >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                              {h.day_change >= 0 ? "+" : ""}{h.day_change_percentage.toFixed(2)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                      {holdings.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-[#666666] text-sm">
                            No holdings found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "positions" && (
                <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1f1f1f]">
                        {["Symbol", "Product", "Qty", "Avg Price", "LTP", "P&L", "M2M"].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs text-[#666666] font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => (
                        <tr key={`${p.tradingsymbol}-${p.product}`} className="border-b border-[#1f1f1f] hover:bg-[#1a1a1a] transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-[#f5f5f5]">{p.tradingsymbol}</p>
                            <p className="text-xs text-[#666666]">{p.exchange}</p>
                          </td>
                          <td className="px-4 py-3 text-[#666666] text-xs">{p.product}</td>
                          <td className="px-4 py-3 text-[#f5f5f5]">{p.quantity}</td>
                          <td className="px-4 py-3 text-[#f5f5f5]">{fmt(p.average_price)}</td>
                          <td className="px-4 py-3 text-[#f5f5f5]">{fmt(p.last_price)}</td>
                          <td className="px-4 py-3"><PnlBadge value={p.pnl} /></td>
                          <td className="px-4 py-3"><PnlBadge value={p.m2m} /></td>
                        </tr>
                      ))}
                      {positions.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-[#666666] text-sm">
                            No open positions
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
