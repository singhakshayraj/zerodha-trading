"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore, TradingConfig } from "@/lib/store";
import { Sidebar } from "@/components/layout/Sidebar";
import { Holding } from "@/lib/types";
import api from "@/lib/api";
import type { TradingSession, Trade } from "@/lib/db";
import { BrainStatus } from "@/components/BrainStatus";
import BrainActivityFeed from "@/components/BrainActivityFeed";
import { OpenPositions } from "@/components/OpenPositions";
import {
  Play, Square, AlertTriangle, CheckCircle2,
  Clock, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── helpers ────────────────────────────────────────────────────────────────

function isMarketOpen(): boolean {
  // QA stack rehearses off-hours against the sim project + QA-mode brain
  // (synthetic market) — the wall clock is meaningless there.
  if (process.env.NEXT_PUBLIC_QA_MODE === "true") return true;
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

const INTERVALS = [
  { label: "Every 1 min",  value: 1  },
  { label: "Every 5 min",  value: 5  },
  { label: "Every 15 min", value: 15 },
  { label: "Every 30 min", value: 30 },
];

function winRate(s: TradingSession): string {
  if (!s.total_trades_executed) return "—";
  return ((s.winning_trades / s.total_trades_executed) * 100).toFixed(0) + "%";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function TradingPage() {
  const router = useRouter();
  const { isConnected, hydrateFromStorage, session, startSession, stopSession, setDbSessionId, addBrainLog, resetSession, brainStatus } = useAppStore();

  const [config, setConfig] = useState<TradingConfig>({
    capital: 10000,
    maxProfitPct: 15,
    maxLossPct: 5,
    maxTrades: 10,
    mode: "market",
    intervalMinutes: 5,
  });

  // Form settings survive reloads/stops. Without this the mode toggle
  // silently reverted to the default after every page load while the
  // "(active)" chip made it look like the old selection was still set.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("trading_form_config");
      if (raw) setConfig((c) => ({ ...c, ...JSON.parse(raw) }));
    } catch { /* corrupt saved config — keep defaults */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("trading_form_config", JSON.stringify(config)); } catch { /* storage full/blocked */ }
  }, [config]);

  const [, setHoldings] = useState<Holding[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [elapsedTime, setElapsedTime] = useState("00:00");
  const [logPage, setLogPage] = useState(1);
  const LOGS_PER_PAGE = 20;

  // Live trades from DB (brain-placed trades)
  const [liveTrades, setLiveTrades] = useState<Trade[]>([]);
  const [liveSessionConfig, setLiveSessionConfig] = useState<Record<string, unknown> | null>(null);
  const [liveTradesCount, setLiveTradesCount] = useState(0);

  // Past sessions state
  const [pastSessions, setPastSessions] = useState<TradingSession[]>([]);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [sessionTrades, setSessionTrades] = useState<Record<string, Trade[]>>({});
  const [loadingTrades, setLoadingTrades] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const stopConfirmedRef = useRef(false);
  const lastKnownTradeCount = useRef(0);
  const sessionStartedAt = useRef<number | null>(null);

  // Hydration + the redirect check must happen in one effect. Split across
  // two effects, the redirect ran against the pre-hydration `isConnected`
  // closure (still false on a fresh mount) and fired router.push("/connect")
  // before hydrateFromStorage's setState had a chance to land — so any hard
  // load of /trading (new tab, bookmark, refresh) bounced to /connect even
  // with a valid stored token. Only masked because normal use always
  // arrives via client-side nav from /connect, where the store is already
  // hydrated in memory.
  useEffect(() => {
    hydrateFromStorage();
    const hasToken = Boolean(
      localStorage.getItem("enc_token") || sessionStorage.getItem("enc_token")
    );
    if (!hasToken) router.push("/connect");
  }, [hydrateFromStorage, router]);

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

  // Reset trade log when session changes (new session = fresh slate)
  useEffect(() => {
    setLiveTrades([]);
    setLiveTradesCount(0);
  }, [session.dbSessionId]);

  // Poll live trades from DB every 4 seconds. Single source of truth for
  // session state — also restores UI on page refresh and detects session end.
  useEffect(() => {
    let active = true;
    async function poll() {
      if (!active) return;
      try {
        const res = await api.get("/trades/live");
        if (!active) return;
        const r = res.data;

        // Trade count
        const count = r.tradesCount ?? 0;
        if (count > 0) lastKnownTradeCount.current = count;
        setLiveTradesCount(count);
        setLiveTrades(r.trades ?? []);
        setLiveSessionConfig(r.sessionConfig ?? null);

        // Session state sync
        const sessionId = r.sessionId ?? null;
        const sessionCfg = r.sessionConfig;
        const currentStatus = useAppStore.getState().session.status;

        // Always track the brain's session id. /api/trade/start no longer
        // returns one (the brain creates the session), and the idle-restore
        // branch below can't fire right after Start (status is already
        // "running") — without this sync Stop had no session to act on.
        if (sessionId && useAppStore.getState().session.dbSessionId !== sessionId) {
          setDbSessionId(sessionId);
        }

        // Restore: active session exists but UI is idle (e.g. after page refresh)
        if (sessionId && currentStatus === "idle") {
          console.log("[poll] Active session detected, restoring UI state");
          // session_config is written by /api/trade/start with the brain's
          // key names (capitalDeployed, maxLossPercent, …) — read those, not
          // the UI-side TradingConfig names.
          const restoredConfig: TradingConfig = sessionCfg
            ? {
                capital: (sessionCfg.capitalDeployed as number) ?? config.capital,
                maxProfitPct: (sessionCfg.maxProfitPercent as number) ?? config.maxProfitPct,
                maxLossPct: (sessionCfg.maxLossPercent as number) ?? config.maxLossPct,
                maxTrades: (sessionCfg.maxTrades as number) ?? config.maxTrades,
                mode: (sessionCfg.stockUniverse as string) === "HOLDINGS" ? "holdings" : config.mode,
                intervalMinutes: sessionCfg.tradeIntervalSeconds != null
                  ? Math.max(1, Math.round((sessionCfg.tradeIntervalSeconds as number) / 60))
                  : config.intervalMinutes,
              }
            : config;
          startSession(restoredConfig);
          setDbSessionId(sessionId);
        }

        // Stop: sessionId gone but UI still running.
        // Apply 60s grace period after start so brain has time to write
        // active_session_id to app_config (brain polls every ~30s + init).
        const secondsSinceStart = sessionStartedAt.current
          ? (Date.now() - sessionStartedAt.current) / 1000
          : 999;

        if (
          !sessionId &&
          currentStatus === "running" &&
          secondsSinceStart > 60
        ) {
          console.log("[poll] No active session after 60s grace → stopping");
          sessionStartedAt.current = null;
          stopSession("Session ended");
        }

        // If restore detected active session, mark start time so grace
        // logic works on subsequent polls without falsely stopping.
        if (sessionId && sessionStartedAt.current === null) {
          sessionStartedAt.current = Date.now();
        }
      } catch (e) {
        console.error("[poll] error:", e);
      }
    }
    poll();
    const t = setInterval(poll, 4000);
    return () => { active = false; clearInterval(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // No trading loop here — Railway brain handles all order execution.
  // This frontend only writes config to Supabase and polls brain heartbeat.

  async function handleStart() {
    if (!isMarketOpen()) {
      addBrainLog("Cannot start: market is closed (9:15 AM – 3:30 PM IST)", "error");
      setShowConfirm(false);
      return;
    }

    // Guard: refuse if brain already has an active session
    try {
      const tradesRes = await api.get("/trades/live");
      if (tradesRes.data?.sessionId) {
        addBrainLog("Brain already has an active session. Stop it first.", "error");
        setShowConfirm(false);
        return;
      }
    } catch { /* non-fatal, proceed */ }

    startSession(config);
    lastKnownTradeCount.current = 0;  // reset for new session
    sessionStartedAt.current = Date.now();  // grace period anchor
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

  async function confirmStop() {
    setShowStopConfirm(false);
    stopConfirmedRef.current = true;
    sessionStartedAt.current = null;
    stopSession("Manually stopped by user");

    // Stop is signal-only — the brain squares off, finalizes stats and
    // clears active_session_id itself. No session id needed to signal.
    try {
      await api.post("/trade/stop", {});
    } catch {
      // non-fatal
    }
    fetchPastSessions();
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

  // derived — use live DB data where available
  const maxLossAmt    = (config.capital * config.maxLossPct)   / 100;
  const maxProfitAmt  = (config.capital * config.maxProfitPct) / 100;
  const capitalPerTrade = config.capital / Math.max(config.maxTrades, 1);

  // Live DB trade count from /api/trades/live, but preserve final count
  // when session ends and active_session_id is cleared (count → 0).
  const displayTradeCount =
    liveTradesCount > 0
      ? liveTradesCount
      : lastKnownTradeCount.current;
  const displayMaxTrades  = (liveSessionConfig?.maxTrades as number | undefined) ?? config.maxTrades;
  const tradeProgress     = displayMaxTrades > 0 ? (displayTradeCount / displayMaxTrades) * 100 : 0;

  // Live session P&L from closed trades
  const livePnl   = liveTrades.filter((t) => t.status === "CLOSED").reduce((s, t) => s + (t.pnl ?? 0), 0);
  const displayPnl = liveTrades.length > 0 ? livePnl : session.sessionPnl;
  const pnlColor   = displayPnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]";

  // Use live trades for log display (newest first from API, show paginated)
  const pagedLogs  = liveTrades.slice((logPage - 1) * LOGS_PER_PAGE, logPage * LOGS_PER_PAGE);
  const totalPages = Math.ceil(liveTrades.length / LOGS_PER_PAGE);

  // Running universe from live session config
  const runningUniverse = (liveSessionConfig?.stockUniverse as string | undefined)?.toLowerCase() ?? null;

  function field<K extends keyof TradingConfig>(key: K, value: TradingConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row md:h-screen bg-[#0a0a0a] md:overflow-hidden pb-24 md:pb-0">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 md:overflow-y-auto">
        {/* Header */}
        <div className="min-h-14 border-b border-[#1f1f1f] flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-2 md:py-0 shrink-0 md:sticky md:top-0 bg-[#0a0a0a] z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-[#f5f5f5]">Auto Trade</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${STATUS_COLORS[session.status]}`}>
              {session.status}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <BrainStatus />
            <div className="flex items-center gap-1.5 text-xs text-[#444]">
              <Clock className="w-3 h-3" />
              {isMarketOpen()
                ? <span className="text-[#22c55e]">Market Open</span>
                : <span className="text-[#ef4444]">Market Closed</span>
              }
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row flex-1 md:overflow-hidden">

          {/* ── LEFT: Config panel ────────────────────────── */}
          <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-[#1f1f1f] flex flex-col md:overflow-y-auto shrink-0 p-4 md:p-5 space-y-4">
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
              {/* When a session is running show the brain's actual universe; otherwise use local config */}
              {runningUniverse ? (
                <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg px-3 py-2 text-xs text-[#f5f5f5] font-medium">
                  {runningUniverse === "holdings" ? "Holdings Only" :
                   runningUniverse === "both"     ? "Holdings + Market" : runningUniverse.toUpperCase()}
                  <span className="ml-2 text-[10px] text-[#22c55e]">(active)</span>
                </div>
              ) : (
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
              )}
              <p className="text-[10px] text-[#444] mt-1">
                {(runningUniverse ?? config.mode) === "holdings" ? "Trades only within your existing holdings" : "Can buy new positions from market"}
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

            {/* Session stats (derived from trade log) */}
            {session.tradeLogs.length > 0 && (() => {
              const sells = session.tradeLogs.filter((t) => t.action === "SELL");
              const wins  = sells.filter((t) => t.pnl > 0);
              const loss  = sells.filter((t) => t.pnl < 0);
              const winRatePct = sells.length ? (wins.length / sells.length) * 100 : 0;
              const avgWin  = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
              const avgLoss = loss.length ? loss.reduce((s, t) => s + t.pnl, 0) / loss.length : 0;
              const best    = sells.length ? Math.max(...sells.map((t) => t.pnl)) : 0;
              return (
                <div className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Session Stats</p>
                  <div className="flex justify-between text-xs"><span className="text-[#444]">Win Rate</span><span className="text-[#f5f5f5] font-medium">{winRatePct.toFixed(0)}%</span></div>
                  <div className="flex justify-between text-xs"><span className="text-[#444]">Avg Win</span><span className="text-[#22c55e] font-medium">+₹{avgWin.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-[#444]">Avg Loss</span><span className="text-[#ef4444] font-medium">₹{avgLoss.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-[#444]">Best Trade</span><span className="text-[#22c55e] font-medium">+₹{best.toFixed(2)}</span></div>
                </div>
              );
            })()}

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
                  {(() => {
                    const brainReady = brainStatus === "ONLINE" || brainStatus === "RUNNING";
                    return (
                      <div className="relative group">
                        <button
                          onClick={() => brainReady && setShowConfirm(true)}
                          disabled={!brainReady}
                          className="w-full py-3 rounded-lg text-sm font-semibold bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
                        >
                          <Play className="w-4 h-4" fill="white" />
                          Start Auto Trade
                        </button>
                        {!brainReady && (
                          <div className="absolute bottom-full left-0 right-0 mb-2 hidden group-hover:block z-20">
                            <div className="bg-[#1f1f1f] border border-[#333] rounded-lg p-2.5 text-[11px] text-[#f59e0b] text-center">
                              Brain server is offline. Check Railway deployment.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

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
                  onClick={() => setShowStopConfirm(true)}
                  className="w-full py-3 rounded-lg text-sm font-semibold bg-[#ef4444] hover:bg-[#dc2626] text-white transition-all flex items-center justify-center gap-2"
                >
                  <Square className="w-4 h-4" fill="white" />
                  Stop Trading
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT: Dashboard ──────────────────────────── */}
          <div className="flex-1 flex flex-col md:overflow-y-auto p-4 md:p-5 space-y-4">

            {/* Status bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
              {[
                {
                  label: "Status",
                  value: <span className={`text-sm font-semibold capitalize ${session.status === "running" ? "text-[#22c55e]" : session.status === "stopped" ? "text-[#ef4444]" : "text-[#666]"}`}>{session.status}</span>,
                },
                {
                  label: "Session P&L",
                  value: <span className={`text-sm font-semibold ${pnlColor}`}>{INR(displayPnl)}</span>,
                },
                {
                  label: "Trades",
                  value: <span className="text-sm font-semibold text-[#f5f5f5]">{displayTradeCount} / {displayMaxTrades}</span>,
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

            {/* Trade log table — reads live DB trades placed by Railway brain */}
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden shrink-0">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#1f1f1f]">
                <h2 className="text-xs font-semibold text-[#f5f5f5] uppercase tracking-wider">
                  Trade Log
                  <span className="ml-2 font-normal text-[#444]">{liveTrades.length} trades</span>
                </h2>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2 text-xs text-[#444]">
                    <button onClick={() => setLogPage((p) => Math.max(1, p - 1))} disabled={logPage === 1} className="hover:text-[#f5f5f5] disabled:opacity-30">←</button>
                    <span>{logPage}/{totalPages}</span>
                    <button onClick={() => setLogPage((p) => Math.min(totalPages, p + 1))} disabled={logPage === totalPages} className="hover:text-[#f5f5f5] disabled:opacity-30">→</button>
                  </div>
                )}
              </div>
              <div className="overflow-x-auto max-h-64 scroll-touch">
                <table className="w-full min-w-[640px] md:min-w-0 text-xs">
                  <thead className="sticky top-0 bg-[#111111]">
                    <tr className="border-b border-[#1a1a1a]">
                      {["Time", "Symbol", "Side", "Qty", "Entry ₹", "Exit ₹", "P&L", "Status", "Reason"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] text-[#444] font-medium uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLogs.map((t) => (
                      <tr key={t.id} className="border-b border-[#141414] hover:bg-[#151515] transition-colors">
                        <td className="px-4 py-2.5 text-[#444] font-mono whitespace-nowrap">
                          {t.entry_at ? new Date(t.entry_at).toLocaleTimeString("en-IN", { hour12: false }) : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-[#f5f5f5]">{t.symbol}</td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-[#f97316]">SHORT</span>
                        </td>
                        <td className="px-4 py-2.5 text-[#888]">{t.quantity}</td>
                        <td className="px-4 py-2.5 text-[#888]">{t.entry_price != null ? `₹${Number(t.entry_price).toFixed(2)}` : "—"}</td>
                        <td className="px-4 py-2.5 text-[#888]">{t.exit_price  != null ? `₹${Number(t.exit_price).toFixed(2)}`  : "—"}</td>
                        <td className="px-4 py-2.5">
                          {t.pnl != null ? (
                            <span className={t.pnl >= 0 ? "text-[#22c55e]" : "text-[#ef4444]"}>
                              {t.pnl >= 0 ? "+" : ""}₹{Number(t.pnl).toFixed(2)}
                            </span>
                          ) : <span className="text-[#444]">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            t.status === "OPEN"   ? "bg-[#f59e0b]/10 text-[#f59e0b]" :
                            t.status === "CLOSED" ? "bg-[#3b82f6]/10 text-[#3b82f6]" :
                            "bg-[#555]/10 text-[#555]"
                          }`}>{t.status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-[#555] max-w-xs truncate">{t.entry_reason ?? "—"}</td>
                      </tr>
                    ))}
                    {liveTrades.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-[#333] text-xs">
                          No trades yet for active session.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Brain Activity Feed (live from Supabase) */}
            {/* No sessionId — API reads active_session_id from app_config,
                which the brain keeps updated with its own session ID. */}
            <BrainActivityFeed />

            {/* Open Positions (live) */}
            <OpenPositions
              sessionId={session.dbSessionId}
              isRunning={session.status === "running"}
            />

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
                                {"—"}
                              </td>
                              <td className="px-4 py-2.5 text-[#f5f5f5]">{s.total_trades_executed ?? 0}</td>
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

      {/* ── Stop confirm modal ─────────────────────────────── */}
      {showStopConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-[#ef4444]/10 flex items-center justify-center shrink-0">
                <Square className="w-5 h-5 text-[#ef4444]" fill="#ef4444" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#f5f5f5]">Stop Trading?</h3>
                <p className="text-xs text-[#555] mt-1">
                  This will stop the brain and square off open positions. Are you sure?
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowStopConfirm(false)}
                className="flex-1 py-2.5 rounded-lg text-sm text-[#555] hover:text-[#f5f5f5] border border-[#1f1f1f] hover:border-[#333] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmStop}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-[#ef4444] hover:bg-[#dc2626] text-white transition-colors flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4" fill="white" />
                Stop & Square Off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
