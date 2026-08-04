"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Holding, Position, Funds } from "@/lib/types";
import api from "@/lib/api";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Wallet,
  BarChart3,
  Activity,
  DollarSign,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── helpers ───────────────────────────────────────────────────────────────

const INR = (n: number) =>
  "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Pnl({ value, showIcon = true }: { value: number; showIcon?: boolean }) {
  const pos = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${pos ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
      {showIcon && (pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
      {pos ? "+" : "-"}{INR(value)}
    </span>
  );
}

function PnlPct({ value }: { value: number }) {
  const pos = value >= 0;
  return (
    <span className={`text-xs ${pos ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
      {pos ? "▲" : "▼"} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-[#1a1a1a]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-[#1f1f1f] rounded animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  );
}

type SortDir = "asc" | "desc" | null;

const CHART_COLORS = [
  "#3b82f6","#22c55e","#f59e0b","#8b5cf6",
  "#ef4444","#06b6d4","#ec4899","#84cc16","#f97316","#14b8a6",
];

const REFRESH_INTERVAL = 30;

// ─── page ──────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const router = useRouter();
  const { isConnected, hydrateFromStorage } = useAppStore();

  const [holdings, setHoldings]   = useState<Holding[]>([]);
  const [positions, setPositions] = useState<{ net: Position[]; day: Position[] }>({ net: [], day: [] });
  const [funds, setFunds]         = useState<Funds | null>(null);
  const [loading, setLoading]     = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [refreshing, setRefreshing] = useState(false);
  const [secsAgo, setSecsAgo]     = useState(0);

  const [search, setSearch]   = useState("");
  const [sortKey, setSortKey] = useState<keyof Holding | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (!isConnected) router.push("/connect"); }, [isConnected, router]);

  const fetchAll = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [h, p, f] = await Promise.all([
        api.get("/portfolio/holdings"),
        api.get("/portfolio/positions"),
        api.get("/portfolio/funds"),
      ]);
      setHoldings(h.data.holdings ?? []);
      setPositions(p.data.positions ?? { net: [], day: [] });
      setFunds(f.data.funds ?? null);
      setLastUpdated(new Date());
      setCountdown(REFRESH_INTERVAL);
    } catch {
      // 401/403 handled by interceptor
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected) fetchAll();
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  // auto-refresh countdown
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { fetchAll(); return REFRESH_INTERVAL; }
        return c - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [fetchAll]);

  // "X seconds ago" ticker
  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setSecsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  // ── derived ───────────────────────────────────────────────────────────────

  const totalInvested = holdings.reduce((s, h) => s + h.average_price * h.quantity, 0);
  const totalCurrent  = holdings.reduce((s, h) => s + h.last_price * h.quantity, 0);
  const totalPnl      = totalCurrent - totalInvested;
  const totalPnlPct   = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const dayPnl        = holdings.reduce((s, h) => s + h.day_change * h.quantity, 0);
  const availableCash = funds?.equity?.available?.live_balance ?? 0;

  const openPositions = positions.day.filter((p) => p.quantity !== 0);

  // ── sort/filter holdings ──────────────────────────────────────────────────

  function toggleSort(key: keyof Holding) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortDir("desc"); return; }
    setSortKey(null); setSortDir(null);
  }

  function SortIcon({ col }: { col: keyof Holding }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 text-[#333]" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-[#3b82f6]" />
      : <ChevronDown className="w-3 h-3 text-[#3b82f6]" />;
  }

  const filteredHoldings = holdings
    .filter((h) => h.tradingsymbol.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (!sortKey || !sortDir) return 0;
      return sortDir === "asc"
        ? (a[sortKey] as number) - (b[sortKey] as number)
        : (b[sortKey] as number) - (a[sortKey] as number);
    });

  // ── donut chart ───────────────────────────────────────────────────────────

  const chartData = holdings
    .map((h) => ({ name: h.tradingsymbol, value: +(h.last_price * h.quantity).toFixed(2) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // ── summary cards config ──────────────────────────────────────────────────

  const summaryCards = [
    {
      label: "Portfolio Value",
      value: INR(totalCurrent),
      icon: <BarChart3 className="w-4 h-4 text-[#3b82f6]" />,
      color: "text-[#f5f5f5]",
      sub: null,
    },
    {
      label: "Invested",
      value: INR(totalInvested),
      icon: <DollarSign className="w-4 h-4 text-[#555]" />,
      color: "text-[#f5f5f5]",
      sub: null,
    },
    {
      label: "Total P&L",
      value: (totalPnl >= 0 ? "+" : "") + INR(totalPnl) ,
      icon: totalPnl >= 0
        ? <TrendingUp className="w-4 h-4 text-[#22c55e]" />
        : <TrendingDown className="w-4 h-4 text-[#ef4444]" />,
      color: totalPnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]",
      sub: `${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%`,
    },
    {
      label: "Day's P&L",
      value: (dayPnl >= 0 ? "+" : "") + INR(dayPnl),
      icon: <Activity className="w-4 h-4 text-[#f59e0b]" />,
      color: dayPnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]",
      sub: null,
    },
    {
      label: "Available Cash",
      value: INR(availableCash),
      icon: <Wallet className="w-4 h-4 text-[#22c55e]" />,
      color: "text-[#f5f5f5]",
      sub: null,
    },
  ];

  const HOLDING_COLS: { label: string; key: keyof Holding; sortable: boolean }[] = [
    { label: "Stock",    key: "tradingsymbol",        sortable: false },
    { label: "Qty",      key: "quantity",             sortable: true  },
    { label: "Avg",      key: "average_price",        sortable: true  },
    { label: "LTP",      key: "last_price",           sortable: true  },
    { label: "Value",    key: "last_price",           sortable: false },
    { label: "P&L",     key: "pnl",                  sortable: true  },
    { label: "P&L %",   key: "pnl",                  sortable: false },
    { label: "Day Chg", key: "day_change_percentage", sortable: true  },
  ];

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col md:flex-row md:h-dvh bg-[#0a0a0a] md:overflow-hidden pb-24 md:pb-0">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="min-h-14 border-b border-[#1f1f1f] flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-2 md:py-0 shrink-0">
          <h1 className="text-sm font-semibold text-[#f5f5f5]">Portfolio</h1>
          <div className="flex items-center gap-3 md:gap-5 text-xs text-[#444] flex-wrap">
            {lastUpdated && <span>Updated {secsAgo}s ago</span>}
            <span>Refresh in <span className="text-[#666]">{countdown}s</span></span>
            <button
              onClick={() => fetchAll(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-[#555] hover:text-[#f5f5f5] transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        <main className="flex-1 md:overflow-auto p-4 md:p-6 space-y-5">

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {summaryCards.map((c) => (
              <div key={c.label} className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#444]">{c.label}</p>
                  {c.icon}
                </div>
                {loading ? (
                  <div className="h-5 w-24 bg-[#1f1f1f] rounded animate-pulse" />
                ) : (
                  <>
                    <p className={`text-base font-semibold ${c.color}`}>{c.value}</p>
                    {c.sub && <p className={`text-xs mt-0.5 ${c.color}`}>{c.sub}</p>}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Holdings table */}
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f1f1f]">
              <h2 className="text-sm font-semibold text-[#f5f5f5]">
                Holdings
                {!loading && (
                  <span className="ml-2 text-xs font-normal text-[#444]">
                    {filteredHoldings.length} stocks
                  </span>
                )}
              </h2>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#444]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol..."
                  className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#3b82f6] w-44 transition-colors"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1a1a1a]">
                    {HOLDING_COLS.map((col) => (
                      <th
                        key={col.label}
                        onClick={() => col.sortable && toggleSort(col.key)}
                        className={`text-left px-4 py-3 text-[10px] uppercase tracking-wider text-[#444] font-medium whitespace-nowrap
                          ${col.sortable ? "cursor-pointer hover:text-[#888] select-none" : ""}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {col.sortable && <SortIcon col={col.key} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
                    : filteredHoldings.map((h) => {
                        const curValue = h.last_price * h.quantity;
                        const pnlPct = h.average_price > 0
                          ? ((h.last_price - h.average_price) / h.average_price) * 100
                          : 0;
                        return (
                          <tr key={h.tradingsymbol} className="border-b border-[#141414] hover:bg-[#151515] transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-[#f5f5f5]">{h.tradingsymbol}</p>
                              <p className="text-[10px] text-[#444]">{h.exchange}</p>
                            </td>
                            <td className="px-4 py-3 text-[#888]">{h.quantity}</td>
                            <td className="px-4 py-3 text-[#888]">{INR(h.average_price)}</td>
                            <td className="px-4 py-3 text-[#f5f5f5] font-medium">{INR(h.last_price)}</td>
                            <td className="px-4 py-3 text-[#888]">{INR(curValue)}</td>
                            <td className="px-4 py-3"><Pnl value={h.pnl} /></td>
                            <td className="px-4 py-3"><PnlPct value={pnlPct} /></td>
                            <td className="px-4 py-3">
                              <span className={`text-xs ${h.day_change_percentage >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                                {h.day_change_percentage >= 0 ? "▲" : "▼"}{" "}
                                {Math.abs(h.day_change_percentage).toFixed(2)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })
                  }
                  {!loading && filteredHoldings.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-[#444] text-sm">
                        {search ? `No results for "${search}"` : "No holdings found"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Positions + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Positions */}
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1f1f1f]">
                <h2 className="text-sm font-semibold text-[#f5f5f5]">
                  Intraday Positions
                  {!loading && (
                    <span className="ml-2 text-xs font-normal text-[#444]">
                      {openPositions.length} open
                    </span>
                  )}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1a1a1a]">
                      {["Symbol", "Qty", "Avg", "LTP", "P&L", "M2M"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-[#444] font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading
                      ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                      : openPositions.map((p) => (
                          <tr key={`${p.tradingsymbol}-${p.product}`} className="border-b border-[#141414] hover:bg-[#151515] transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-[#f5f5f5]">{p.tradingsymbol}</p>
                              <p className="text-[10px] text-[#444]">{p.product}</p>
                            </td>
                            <td className={`px-4 py-3 font-medium text-sm ${p.quantity > 0 ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
                              {p.quantity > 0 ? "+" : ""}{p.quantity}
                            </td>
                            <td className="px-4 py-3 text-[#888]">{INR(p.average_price)}</td>
                            <td className="px-4 py-3 text-[#f5f5f5]">{INR(p.last_price)}</td>
                            <td className="px-4 py-3"><Pnl value={p.pnl} /></td>
                            <td className="px-4 py-3"><Pnl value={p.m2m} showIcon={false} /></td>
                          </tr>
                        ))
                    }
                    {!loading && openPositions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-[#444] text-sm">
                          No open positions
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Donut */}
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-5">
              <h2 className="text-sm font-semibold text-[#f5f5f5] mb-1">Allocation</h2>
              <p className="text-xs text-[#444] mb-4">Top 10 holdings by value</p>
              {loading ? (
                <div className="h-56 flex items-center justify-center">
                  <div className="w-36 h-36 rounded-full border-8 border-[#1f1f1f] animate-pulse" />
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-[#444] text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 8, fontSize: 12, color: "#f5f5f5" }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [INR(Number(v)), "Value"]}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: "#555" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
