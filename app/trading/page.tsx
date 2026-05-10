"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore, TradingConfig } from "@/lib/store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Holding } from "@/lib/types";
import { runTradingCycle } from "@/lib/tradingBrain";
import api from "@/lib/api";
import type { TradingSession, Trade } from "@/lib/db";
import {
  Play, Square, AlertTriangle, CheckCircle2,
  Clock, Zap, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────

function isMarketOpen(): boolean {
  const ist = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
}

function elapsed(start: Date | null): string {
  if (!start) return "00:00";
  const s = Math.floor((Date.now() - start.getTime()) / 1000);
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${m}:${ss}`;
}

const INR = (n: number) =>
  (n < 0 ? "-" : "+") + "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_COLORS = {
  idle:    "bg-[#1f1f1f] text-[#666]",
  running: "bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30",
  paused:  "bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30",
  stopped: "bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30",
};

const LOG_COLORS = {
  info:   "text-[#4ade80]",
  signal: "text-[#60a5fa]",
  order:  "text-[#fbbf24]",
  error:  "text-[#f87171]",
  stop:   "text-[#f87171] font-bold",
};

const INTERVALS = [
  { label: "Every 1 min",  value: 1  },
  { label: "Every 5 min",  value: 5  },
  { label: "Every 15 min", value: 15 },
  { label: "Every 30 min", value: 30 },
];

function winRate(s: TradingSession): string {
  if (!s.total_trades) return "—";
  return ((s.winning_trades / s.total_trades) * 100).toFixed(0) + "%";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function TradingPage() {
  const router = useRouter();
  const { isConnected, hydrateFromStorage, session, startSession, stopSession, setDbSessionId, addBrainLog, resetSession } = useAppStore();

  const [config, setConfig] = useState<TradingConfig>({
    capital: 10000,
    maxProfitPct: 15,
    maxLossPct: 5,
    maxTrades: 10,
    mode: "holdings",
    intervalMinutes: 5,
  });

  const [, setHoldings] = useState<Holding[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("00:00");
  const [logPage, setLogPage] = useState(1);
  const LOGS_PER_PAGE = 20;

  // Past sessions state
  const [pastSessions, setPastSessions] = useState<TradingSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionTrades, setSessionTrades] = useState<Record<string, Trade[]>>({});
  const [loadingTrades, setLoadingTrades] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const brainLogRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const contextIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (!isConnected) router.push("/connect"); }, [isConnected, router]);

  // fetch holdings once
  useEffect(() => {
    if (!isConnected) return;
    api.get("/portfolio/holdings").then((r) => setHoldings(r.data.holdings ?? [])).catch(() => {});
  }, [isConnected]);

  // fetch past sessions
  const fetchPastSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const r = await api.get("/sessions?limit=30");
      setPastSessions(r.data.sessions ?? []);
    } catch {
      // silently fail
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { if (isConnected) fetchPastSessions(); }, [isConnected, fetchPastSessions]);

  // elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsedTime(elapsed(session.startTime)), 1000);
    return () => clearInterval(t);
  }, [session.startTime]);

  // auto-scroll brain log
  useEffect(() => {
    if (brainLogRef.current) brainLogRef.current.scrollTop = brainLogRef.current.scrollHeight;
  }, [session.brainLogs]);

  // trading loop
  const runCycle = useCallback(async () => {
    const dbSessionId = useAppStore.getState().session.dbSessionId;
    try {
      const r = await api.get("/portfolio/holdings");
      const fresh = r.data.holdings ?? [];
      setHoldings(fresh);
      await runTradingCycle(fresh, config, dbSessionId);
    } catch {
      addBrainLog("Failed to fetch holdings for cycle", "error");
    }
  }, [config, addBrainLog]);

  // market context logger — fires every 15 min during session
  const logMarketContext = useCallback(async () => {
    const dbSessionId = useAppStore.getState().session.dbSessionId;
    if (!dbSessionId) return;
    try {
      await api.post("/market/context", {
        sessionId: dbSessionId,
        contextData: { market_direction: isMarketOpen() ? "SIDEWAYS" : "SIDEWAYS" },
      });
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (session.status === "running") {
      runCycle();
      intervalRef.current = setInterval(runCycle, config.intervalMinutes * 60 * 1000);

      // Log market context every 15 minutes
      logMarketContext();
      contextIntervalRef.current = setInterval(logMarketContext, 15 * 60 * 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (contextIntervalRef.current) clearInterval(contextIntervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (contextIntervalRef.current) clearInterval(contextIntervalRef.current);
    };
  }, [session.status, config.intervalMinutes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStart() {
    if (!isMarketOpen()) {
      addBrainLog("Cannot start: market is closed (9:15 AM – 3:30 PM IST)", "error");
      setShowConfirm(false);
      return;
    }

    startSession(config);
    setShowConfirm(false);

    // Create DB session
    try {
      const res = await api.post("/trade/start", { config });
      if (res.data.sessionId) {
        setDbSessionId(res.data.sessionId);
        addBrainLog(`DB session created: ${res.data.sessionId.slice(0, 8)}…`, "info");
      }
    } catch {
      addBrainLog("DB session creation failed — trades won't be persisted", "error");
    }
  }

  async function handleStop() {
    const dbSessionId = session.dbSessionId;
    stopSession("Manually stopped by user");

    if (dbSessionId) {
      try {
        await api.post("/trade/stop", {
          sessionId: dbSessionId,
          endReason: "Manually stopped by user",
        });
      } catch {
        // non-fatal
      }
      // Refresh past sessions list
      fetchPastSessions();
    }
  }

  async function handleExpandSession(id: string) {
    if (expandedSession === id) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(id);
    if (sessionTrades[id]) return;

    setLoadingTrades(id);
    try {
      const r = await api.get(`/sessions/${id}/trades`);
      setSessionTrades((prev) => ({ ...prev, [id]: r.data.trades ?? [] }));
    } catch {
      // silently fail
    } finally {
      setLoadingTrades(null);
    }
  }

  // derived
  const maxLossAmt    = (config.capital * config.maxLossPct)   / 100;
  const maxProfitAmt  = (config.capital * config.maxProfitPct) / 100;
  const capitalPerTrade = config.capital / Math.max(config.maxTrades, 1);
  const tradeProgress = config.maxTrades > 0 ? (session.tradesExecuted / config.maxTrades) * 100 : 0;
  const pnlColor = session.sessionPnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]";

  const pagedLogs = session.tradeLogs.slice((logPage - 1) * LOGS_PER_PAGE, logPage * LOGS_PER_PAGE);
  const totalPages = Math.ceil(session.tradeLogs.length / LOGS_PER_PAGE);

  function field<K extends keyof TradingConfig>(key: K, value: TradingConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#0a0a0a] overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header */}
        <div className="h-14 border-b border-[#1f1f1f] flex items-center justify-between px-6 shrink-0 sticky top-0 bg-[#0a0a0a] z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-[#f5f5f5]">Auto Trade</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${STATUS_COLORS[session.status]}`}>
              {session.status}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#444]">
            <Clock className="w-3 h-3" />
            {isMarketOpen()
              ? <span className="text-[#22c55e]">Market Open</span>
              : <span className="text-[#ef4444]">Market Closed</span>
            }
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* ── LEFT: Config panel ────────────────────────── */}
          <div className="w-72 border-r border-[#1f1f1f] flex flex-col overflow-y-auto shrink-0 p-5 space-y-4">
            <h2 className="text-xs font-semibold text-[#f5f5f5] uppercase tracking-wider">Configuration</h2>

            {/* Capital */}
            <div>
              <label className="block text-[10px] text-[#555] uppercase tracking-wider mb-1.5">
                Capital to Deploy (₹)
              </label>
              <input
                type="number" min={1000} step={1000}
                value={config.capital}
                onChange={(e) => field("capital", Number(e.target.value))}
                disabled={session.status === "running"}
                className="w-full bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6] disabled:opacity-40"
              />
            </div>

            {/* Max profit */}
            <div>
              <label className="block text-[10px] text-[#555] uppercase tracking-wider mb-1.5">
                Profit Target (%)
              </label>
              <input
                type="number" min={1} max={100} step={0.5}
                value={config.maxProfitPct}
                onChange={(e) => field("maxProfitPct", Number(e.target.value))}
                disabled={session.status === "running"}
                className="w-full bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6] disabled:opacity-40"
              />
              <p className="text-[10px] text-[#444] mt-1">Stop when session P&L reaches this %</p>
            </div>

            {/* Max loss */}
            <div>
              <label className="block text-[10px] text-[#555] uppercase tracking-wider mb-1.5">
                Max Loss Limit (%)
              </label>
              <input
                type="number" min={0.5} max={50} step={0.5}
                value={config.maxLossPct}
                onChange={(e) => field("maxLossPct", Number(e.target.value))}
                disabled={session.status === "running"}
                className="w-full bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6] disabled:opacity-40"
              />
              <p className="text-[10px] text-[#444] mt-1">Auto-stop when loss exceeds this %</p>
            </div>

            {/* Max trades */}
            <div>
              <label className="block text-[10px] text-[#555] uppercase tracking-wider mb-1.5">
                Max Number of Trades
              </label>
              <input
                type="number" min={1} max={100}
                value={config.maxTrades}
                onChange={(e) => field("maxTrades", Math.min(100, Number(e.target.value)))}
                disabled={session.status === "running"}
                className="w-full bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6] disabled:opacity-40"
              />
            </div>

            {/* Mode toggle */}
            <div>
              <label className="block text-[10px] text-[#555] uppercase tracking-wider mb-1.5">Trading Mode</label>
              <div className="flex rounded-lg overflow-hidden border border-[#1f1f1f]">
                {(["holdings", "market"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => field("mode", m)}
                    disabled={session.status === "running"}
                    className={`flex-1 py-2 text-xs font-medium transition-colors capitalize disabled:opacity-40
                      ${config.mode === m ? "bg-[#1f1f1f] text-[#f5f5f5]" : "bg-[#0d0d0d] text-[#444] hover:text-[#888]"}`}
                  >
                    {m === "holdings" ? "Holdings Only" : "Open Market"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#444] mt-1">
                {config.mode === "holdings" ? "Trades only within your existing holdings" : "Can buy new positions from market"}
              </p>
            </div>

            {/* Interval */}
            <div>
              <label className="block text-[10px] text-[#555] uppercase tracking-wider mb-1.5">Trade Interval</label>
              <select
                value={config.intervalMinutes}
                onChange={(e) => field("intervalMinutes", Number(e.target.value))}
                disabled={session.status === "running"}
                className="w-full bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg px-3 py-2 text-sm text-[#f5f5f5] focus:outline-none focus:border-[#3b82f6] disabled:opacity-40"
              >
                {INTERVALS.map((i) => (
                  <option key={i.value} value={i.value}>{i.label}</option>
                ))}
              </select>
            </div>

            {/* Computed values */}
            <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-3 space-y-1.5">
              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Computed</p>
              <div className="flex justify-between text-xs">
                <span className="text-[#444]">Max Loss Amount</span>
                <span className="text-[#ef4444] font-medium">-₹{maxLossAmt.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#444]">Profit Target</span>
                <span className="text-[#22c55e] font-medium">+₹{maxProfitAmt.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-[#444]">Capital / Trade</span>
                <span className="text-[#f5f5f5] font-medium">₹{capitalPerTrade.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            {/* Buttons */}
            <div className="space-y-2 pt-1">
              {session.status !== "running" ? (
                <>
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="w-full py-3 rounded-lg text-sm font-semibold bg-[#22c55e] hover:bg-[#16a34a] text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4" fill="white" />
                    Start Auto Trade
                  </button>
                  {session.status === "stopped" && (
                    <button
                      onClick={resetSession}
                      className="w-full py-2 rounded-lg text-xs text-[#555] hover:text-[#f5f5f5] border border-[#1f1f1f] hover:border-[#333] transition-colors"
                    >
                      Reset Session
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={handleStop}
                  className="w-full py-3 rounded-lg text-sm font-semibold bg-[#ef4444] hover:bg-[#dc2626] text-white transition-all flex items-center justify-center gap-2 animate-pulse"
                >
                  <Square className="w-4 h-4" fill="white" />
                  Stop Trading
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT: Dashboard ──────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-y-auto p-5 space-y-4">

            {/* Status bar */}
            <div className="grid grid-cols-5 gap-3 shrink-0">
              {[
                {
                  label: "Status",
                  value: <span className={`text-sm font-semibold capitalize ${session.status === "running" ? "text-[#22c55e]" : session.status === "stopped" ? "text-[#ef4444]" : "text-[#666]"}`}>{session.status}</span>,
                },
                {
                  label: "Session P&L",
                  value: <span className={`text-sm font-semibold ${pnlColor}`}>{INR(session.sessionPnl)}</span>,
                },
                {
                  label: "Trades",
                  value: <span className="text-sm font-semibold text-[#f5f5f5]">{session.tradesExecuted} / {config.maxTrades}</span>,
                },
                {
                  label: "Elapsed",
                  value: <span className="text-sm font-semibold text-[#f5f5f5] font-mono">{elapsedTime}</span>,
                },
                {
                  label: "Progress",
                  value: (
                    <div className="w-full bg-[#1a1a1a] rounded-full h-2 mt-1">
                      <div
                        className="h-2 rounded-full bg-[#3b82f6] transition-all"
                        style={{ width: `${Math.min(tradeProgress, 100)}%` }}
                      />
                    </div>
                  ),
                },
              ].map((c) => (
                <div key={c.label} className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-3">
                  <p className="text-[10px] text-[#444] uppercase tracking-wider mb-1">{c.label}</p>
                  {c.value}
                </div>
              ))}
            </div>

            {/* P&L Chart */}
            {session.pnlHistory.length > 1 && (
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 shrink-0">
                <p className="text-xs text-[#444] uppercase tracking-wider mb-3">Session P&L</p>
                <ResponsiveContainer width="100%" height={80}>
                  <LineChart data={session.pnlHistory}>
                    <XAxis dataKey="time" hide />
                    <YAxis hide domain={["auto", "auto"]} />
                    <ReferenceLine y={0} stroke="#333" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{ background: "#111", border: "1px solid #1f1f1f", borderRadius: 6, fontSize: 11, color: "#f5f5f5" }}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [`₹${Number(v).toFixed(2)}`, "P&L"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="pnl"
                      stroke={session.sessionPnl >= 0 ? "#22c55e" : "#ef4444"}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Trade log table */}
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden shrink-0">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f1f1f]">
                <h2 className="text-xs font-semibold text-[#f5f5f5] uppercase tracking-wider">
                  Trade Log
                  <span className="ml-2 font-normal text-[#444]">{session.tradeLogs.length} trades</span>
                </h2>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2 text-xs text-[#444]">
                    <button onClick={() => setLogPage((p) => Math.max(1, p - 1))} disabled={logPage === 1} className="hover:text-[#f5f5f5] disabled:opacity-30">←</button>
                    <span>{logPage}/{totalPages}</span>
                    <button onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))} disabled={logPage === totalPages} className="hover:text-[#f5f5f5] disabled:opacity-30">→</button>
                  </div>
                )}
              </div>
              <div className="overflow-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#111111]">
                    <tr className="border-b border-[#1a1a1a]">
                      {["Time", "Symbol", "Action", "Qty", "Price", "Value", "P&L", "Reason"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#444] font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLogs.map((t) => (
                      <tr key={t.id} className={`border-b border-[#141414] hover:bg-[#151515] transition-colors ${t.action === "BUY" ? "bg-[#3b82f6]/[0.03]" : "bg-[#f97316]/[0.03]"}`}>
                        <td className="px-4 py-2.5 text-[#444] font-mono">{t.time}</td>
                        <td className="px-4 py-2.5 font-medium text-[#f5f5f5]">{t.symbol}</td>
                        <td className="px-4 py-2.5">
                          <span className={`font-semibold ${t.action === "BUY" ? "text-[#22c55e]" : "text-[#f97316]"}`}>{t.action}</span>
                        </td>
                        <td className="px-4 py-2.5 text-[#888]">{t.qty}</td>
                        <td className="px-4 py-2.5 text-[#888]">₹{t.price.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-[#888]">₹{t.value.toFixed(2)}</td>
                        <td className="px-4 py-2.5">
                          {t.action === "SELL" ? (
                            <span className={t.pnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                              {t.pnl >= 0 ? "+" : ""}₹{t.pnl.toFixed(2)}
                            </span>
                          ) : <span className="text-[#444]">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[#555] max-w-xs truncate">{t.reason}</td>
                      </tr>
                    ))}
                    {session.tradeLogs.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-[#333] text-xs">
                          No trades yet. Start a session to begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Brain activity log */}
            <div className="bg-[#080808] border border-[#1a1a1a] rounded-xl overflow-hidden shrink-0" style={{ height: 180 }}>
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1a1a1a] bg-[#0d0d0d]">
                <Zap className="w-3 h-3 text-[#22c55e]" />
                <span className="text-[10px] font-semibold text-[#22c55e] uppercase tracking-wider">Brain Activity</span>
                <span className="text-[10px] text-[#333] ml-auto">{session.brainLogs.length} entries</span>
              </div>
              <div ref={brainLogRef} className="overflow-y-auto h-full p-3 space-y-0.5 pb-6">
                {session.brainLogs.length === 0 ? (
                  <p className="text-[11px] text-[#333] font-mono">Waiting for session to start...</p>
                ) : (
                  session.brainLogs.map((log, i) => (
                    <p key={i} className={`text-[11px] font-mono leading-5 ${LOG_COLORS[log.type]}`}>
                      <span className="text-[#333]">[{log.time}]</span> {log.message}
                    </p>
                  ))
                )}
              </div>
            </div>

            {/* ── Past Sessions ─────────────────────────────── */}
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f1f1f]">
                <h2 className="text-xs font-semibold text-[#f5f5f5] uppercase tracking-wider">
                  Past Sessions
                  <span className="ml-2 font-normal text-[#444]">{pastSessions.length}</span>
                </h2>
                <button
                  onClick={fetchPastSessions}
                  disabled={sessionsLoading}
                  className="text-[10px] text-[#444] hover:text-[#888] transition-colors disabled:opacity-30"
                >
                  {sessionsLoading ? "Loading…" : "Refresh"}
                </button>
              </div>

              {pastSessions.length === 0 ? (
                <p className="px-5 py-8 text-center text-[#333] text-xs">
                  {sessionsLoading ? "Loading sessions…" : "No past sessions yet."}
                </p>
              ) : (
                <div className="overflow-auto max-h-96">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-[#111111]">
                      <tr className="border-b border-[#1a1a1a]">
                        {["", "Date", "Duration", "Trades", "Win Rate", "P&L", "Status", "End Reason"].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#444] font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pastSessions.map((s) => {
                        const isExpanded = expandedSession === s.id;
                        const trades = sessionTrades[s.id];
                        return (
                          <>
                            <tr
                              key={s.id}
                              onClick={() => handleExpandSession(s.id)}
                              className="border-b border-[#141414] hover:bg-[#151515] cursor-pointer transition-colors"
                            >
                              <td className="px-3 py-2.5 text-[#444]">
                                {isExpanded
                                  ? <ChevronDown className="w-3 h-3" />
                                  : <ChevronRight className="w-3 h-3" />
                                }
                              </td>
                              <td className="px-4 py-2.5 text-[#888] whitespace-nowrap">{fmtDate(s.started_at)}</td>
                              <td className="px-4 py-2.5 text-[#888]">
                                {s.duration_minutes != null ? `${s.duration_minutes}m` : "—"}
                              </td>
                              <td className="px-4 py-2.5 text-[#f5f5f5]">{s.total_trades}</td>
                              <td className="px-4 py-2.5 text-[#888]">{winRate(s)}</td>
                              <td className="px-4 py-2.5">
                                <span className={s.total_pnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                                  {s.total_pnl >= 0 ? "+" : ""}₹{Math.abs(s.total_pnl).toFixed(2)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  s.status === "RUNNING"
                                    ? "bg-[#22c55e]/10 text-[#22c55e]"
                                    : s.status === "COMPLETED"
                                    ? "bg-[#3b82f6]/10 text-[#3b82f6]"
                                    : "bg-[#ef4444]/10 text-[#ef4444]"
                                }`}>
                                  {s.status}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-[#555] max-w-[160px] truncate">
                                {s.end_reason ?? "—"}
                              </td>
                            </tr>

                            {/* Expanded trades */}
                            {isExpanded && (
                              <tr key={`${s.id}-expanded`} className="border-b border-[#1a1a1a]">
                                <td colSpan={8} className="bg-[#0d0d0d] px-5 py-3">
                                  {loadingTrades === s.id ? (
                                    <p className="text-[11px] text-[#444]">Loading trades…</p>
                                  ) : !trades || trades.length === 0 ? (
                                    <p className="text-[11px] text-[#444]">No trades recorded for this session.</p>
                                  ) : (
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="border-b border-[#1a1a1a]">
                                          {["Symbol", "Entry", "Exit", "Qty", "Entry ₹", "Exit ₹", "P&L", "Status"].map((h) => (
                                            <th key={h} className="text-left pb-2 pr-6 text-[10px] text-[#444] font-medium uppercase">{h}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {trades.map((t) => (
                                          <tr key={t.id} className="border-b border-[#141414]">
                                            <td className="py-1.5 pr-6 font-medium text-[#f5f5f5]">{t.symbol}</td>
                                            <td className="py-1.5 pr-6 text-[#555]">{t.entry_at ? new Date(t.entry_at).toLocaleTimeString() : "—"}</td>
                                            <td className="py-1.5 pr-6 text-[#555]">{t.exit_at ? new Date(t.exit_at).toLocaleTimeString() : "—"}</td>
                                            <td className="py-1.5 pr-6 text-[#888]">{t.quantity}</td>
                                            <td className="py-1.5 pr-6 text-[#888]">{t.entry_price != null ? `₹${t.entry_price.toFixed(2)}` : "—"}</td>
                                            <td className="py-1.5 pr-6 text-[#888]">{t.exit_price != null ? `₹${t.exit_price.toFixed(2)}` : "—"}</td>
                                            <td className="py-1.5 pr-6">
                                              {t.pnl != null ? (
                                                <span className={t.pnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                                                  {t.pnl >= 0 ? "+" : ""}₹{t.pnl.toFixed(2)}
                                                </span>
                                              ) : <span className="text-[#444]">—</span>}
                                            </td>
                                            <td className="py-1.5">
                                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                                t.status === "OPEN"
                                                  ? "bg-[#f59e0b]/10 text-[#f59e0b]"
                                                  : t.status === "CLOSED"
                                                  ? "bg-[#3b82f6]/10 text-[#3b82f6]"
                                                  : "bg-[#555]/10 text-[#555]"
                                              }`}>
                                                {t.status}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ── Confirm modal ──────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-[#f59e0b]" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#f5f5f5]">Confirm Auto Trade</h3>
                <p className="text-xs text-[#555] mt-1">This will place real orders with your Zerodha account.</p>
              </div>
            </div>

            <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg p-3 mb-5 space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-[#555]">Capital</span><span className="text-[#f5f5f5] font-medium">₹{config.capital.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-[#555]">Max Loss</span><span className="text-[#ef4444] font-medium">-₹{maxLossAmt.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-[#555]">Profit Target</span><span className="text-[#22c55e] font-medium">+₹{maxProfitAmt.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-[#555]">Max Trades</span><span className="text-[#f5f5f5] font-medium">{config.maxTrades}</span></div>
              <div className="flex justify-between"><span className="text-[#555]">Mode</span><span className="text-[#f5f5f5] font-medium capitalize">{config.mode === "holdings" ? "Holdings Only" : "Open Market"}</span></div>
              {!isMarketOpen() && (
                <div className="mt-2 pt-2 border-t border-[#1f1f1f] flex items-center gap-2 text-[#ef4444]">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>Market is currently closed. Trades will be skipped until 9:15 AM IST.</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm text-[#555] hover:text-[#f5f5f5] border border-[#1f1f1f] hover:border-[#333] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStart}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-[#22c55e] hover:bg-[#16a34a] text-white transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm & Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
