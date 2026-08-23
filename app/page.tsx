"use client";

// Command center — the one-glance system view (UI god-mode task 3).
// Answers "what's happening and what should I do" without visiting
// /trading, /portfolio and /advisor separately: paper-engine state + live
// daily risk, real portfolio health, and the advisor's single top action.
// Reuses RiskMeter (task 1) and BrainStatus.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import api from "@/lib/api";
import { useRefreshOnVisible } from "@/lib/useRefreshOnVisible";
import { Sidebar } from "@/components/layout/Sidebar";
import { BrainStatus } from "@/components/BrainStatus";
import { RiskMeter } from "@/components/RiskMeter";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Briefcase, Compass, ArrowRight, TrendingUp, TrendingDown, Scissors, Hourglass, ShieldAlert, Layers, Gauge, History } from "lucide-react";

const GREEN = "#22c55e", RED = "#ef4444", AMBER = "#f59e0b", BLUE = "#3b82f6", MUTE = "#71717a";
const INR = (n: number) => (n < 0 ? "-" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

type Trade = { status: string; pnl: number | null };
type Holding = { quantity: number; average_price: number; last_price: number; day_change: number };
type Advice = {
  symbol: string; verdict: string; trend_score: number; pnl_percent: number | null;
  rotation_target_symbol?: string | null;
};
type PortfolioRisk = {
  concentration_flags: string[];
  tax_loss_harvest: { symbol: string }[];
  harvestable_loss_inr: number;
  correlation?: { effective_bets: number | null; names_covered: number } | null;
};

const VERDICT_META: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  SELL:           { color: RED,   icon: TrendingDown, label: "Sell" },
  SELL_ON_BOUNCE: { color: AMBER, icon: Hourglass,    label: "Sell on bounce" },
  TRIM:           { color: BLUE,  icon: Scissors,     label: "Trim" },
  HOLD:           { color: GREEN, icon: TrendingUp,   label: "Hold" },
};
const ACTIONABLE = new Set(["SELL", "SELL_ON_BOUNCE", "TRIM"]);

export default function CommandCenter() {
  const router = useRouter();
  const { isConnected, hydrated, hydrateFromStorage } = useAppStore();

  const [sess, setSess] = useState<{ pnl: number; trades: number; active: boolean; config: Record<string, unknown> | null } | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [advice, setAdvice] = useState<Advice[] | null>(null);
  const [risk, setRisk] = useState<PortfolioRisk | null>(null);
  const [runDate, setRunDate] = useState<string | null>(null);
  const [changeCount, setChangeCount] = useState(0);
  const [edge, setEdge] = useState<{ profitFactor: number | null; maxDrawdownR: number; expectancyR: number; label: string; closed: number } | null>(null);
  const [edgeVerified, setEdgeVerified] = useState<boolean | null>(null); // null=loading, false=gate #6 not run, true=run
  // [DESIGN_REVIEW 2026-08-23] Acquisition is the system's only real failure
  // mode — 45% uptime since 07-10, every lost day a token nobody pasted. The
  // brain already wrote a durable token_incident; nothing read it.
  const [tokenStale, setTokenStale] = useState(false);

  useEffect(() => {
    // api.get carries the auth token this route requires; a bare fetch 401s.
    api.get<{ tokenStale?: boolean }>("/brain/status")
      .then((r) => setTokenStale(Boolean(r.data?.tokenStale)))
      .catch(() => {});
  }, []);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (hydrated && !isConnected) router.push("/connect"); }, [hydrated, isConnected, router]);

  const load = useCallback(async () => {
    try {
      const t = (await api.get("/trades/live")).data;
      const trades: Trade[] = t.trades ?? [];
      const pnl = trades.filter((x) => x.status === "CLOSED").reduce((s, x) => s + (x.pnl ?? 0), 0);
      setSess({ pnl, trades: t.tradesCount ?? 0, active: !!t.isSessionActive, config: t.sessionConfig ?? null });
    } catch { /* card degrades to empty */ }
    try { setHoldings((await api.get("/portfolio/holdings")).data?.holdings ?? []); } catch { /* */ }
    try {
      const a = (await api.get("/advisor")).data;
      setAdvice(a.rows ?? []); setRisk(a.portfolioRisk ?? null); setRunDate(a.runDate ?? null);
      setChangeCount((a.changes ?? []).length);
    } catch { /* */ }
    try {
      const ins = (await api.get("/analytics/insights")).data;
      const v = ins?.verdict;
      if (v) setEdge({ profitFactor: v.profitFactor ?? null, maxDrawdownR: v.maxDrawdownR ?? 0, expectancyR: v.expectancyR ?? 0, label: v.label ?? "", closed: v.closed ?? 0 });
      setEdgeVerified(ins?.gate6 ? true : false);
    } catch { /* edge strip degrades to empty */ }
  }, []);
  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);
  useRefreshOnVisible(load);

  // portfolio health
  const totalCurrent = (holdings ?? []).reduce((s, h) => s + h.last_price * h.quantity, 0);
  const totalInvested = (holdings ?? []).reduce((s, h) => s + h.average_price * h.quantity, 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const dayPnl = (holdings ?? []).reduce((s, h) => s + h.day_change * h.quantity, 0);

  // advisor top action: worst actionable call today
  const actionable = (advice ?? []).filter((r) => ACTIONABLE.has(r.verdict) || r.rotation_target_symbol);
  const topAction = [...actionable].sort((a, b) => (a.trend_score ?? 0) - (b.trend_score ?? 0))[0];

  const cfg = sess?.config ?? {};
  const capital = (cfg.capitalDeployed as number) ?? 25000;
  const maxLossPct = (cfg.maxLossPercent as number) ?? 5;
  const maxProfitPct = (cfg.maxProfitPercent as number) ?? 7;

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="max-w-[1100px] w-full mx-auto">
          {/* header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-[#f5f5f5]">Command Center</h1>
              <p className="text-[12px] text-[#666] mt-0.5">{today}</p>
            </div>
            <BrainStatus />
          </div>

          {/* Token nag. Deliberately ABOVE the edge nag and louder: this one is
              time-critical and actionable in 30 seconds, and missing it costs a
              whole day of data. Measured flush is ~04:34 IST ([C6]). */}
          {tokenStale && (
            <div className="mb-4 rounded-xl border px-4 py-3 flex items-start gap-3"
                 style={{ borderColor: "#ef444488", background: "#ef44441a" }}>
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#ef4444" }} />
              <p className="text-[12px] leading-relaxed text-[#ddd]">
                <span className="font-semibold" style={{ color: "#ef4444" }}>NO LIVE TOKEN</span>
                {" — the enctoken is missing or was last set before today's ~04:34 IST flush, so the brain cannot start a session. "}
                <span className="text-[#e5e5e5]">Paste a fresh one before 09:15</span>
                {" or today produces no data. "}
                <Link href="/connect" className="text-[#60a5fa] hover:underline">connect →</Link>
              </p>
            </div>
          )}

          {/* EDGE UNVERIFIED nag — clears only when gate #6 (historical
              backtest) has run. Keeps us honest: paper metrics are not a verdict. */}
          {edgeVerified === false && (
            <div className="mb-4 rounded-xl border px-4 py-3 flex items-start gap-3"
                 style={{ borderColor: `${AMBER}55`, background: `${AMBER}0d` }}>
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: AMBER }} />
              <p className="text-[12px] leading-relaxed text-[#bbb]">
                <span className="font-semibold" style={{ color: AMBER }}>EDGE UNVERIFIED</span>
                {" — the historical backtest (gate #6) hasn't run. The paper metrics here are a small, single-regime sample, "}
                <span className="text-[#e5e5e5]">not an edge verdict</span>
                {". Treat every result as provisional until gate #6 has a number. "}
                <Link href="/insights" className="text-[#60a5fa] hover:underline">why this matters →</Link>
              </p>
            </div>
          )}

          {/* top row: paper engine · portfolio · advisor action */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">

            {/* Paper engine */}
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4 text-[#888]" />
                <h3 className="text-sm font-semibold text-[#f5f5f5]">Paper engine</h3>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{ background: sess?.active ? `${GREEN}1a` : "#ffffff08", color: sess?.active ? GREEN : MUTE }}>
                  {sess?.active ? "ACTIVE" : "IDLE"}
                </span>
              </div>
              <div className="flex items-baseline gap-4 mb-2">
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wide">Today P&L</p>
                  <p className="text-xl font-semibold tabular-nums" style={{ color: (sess?.pnl ?? 0) >= 0 ? GREEN : RED }}>
                    {sess ? INR(sess.pnl) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wide">Trades</p>
                  <p className="text-xl font-semibold tabular-nums text-[#f5f5f5]">{sess?.trades ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Real portfolio */}
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Briefcase className="w-4 h-4 text-[#888]" />
                <h3 className="text-sm font-semibold text-[#f5f5f5]">Portfolio</h3>
                <Link href="/portfolio" className="ml-auto text-[10px] text-[#555] hover:text-[#888]">open →</Link>
              </div>
              {holdings === null ? (
                <div className="flex gap-4"><Skeleton className="h-7 w-20" /><Skeleton className="h-7 w-16" /><Skeleton className="h-7 w-12" /></div>
              ) : holdings.length === 0 ? (
                <p className="text-[11px] text-[#444]">No holdings found.</p>
              ) : (
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-[10px] text-[#555] uppercase tracking-wide">Value</p>
                    <p className="text-xl font-semibold tabular-nums text-[#f5f5f5]">{INR(totalCurrent)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#555] uppercase tracking-wide">Total P&L</p>
                    <p className="text-xl font-semibold tabular-nums" style={{ color: totalPnl >= 0 ? GREEN : RED }}>
                      {totalPnl >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#555] uppercase tracking-wide">Day</p>
                    <p className="text-sm font-semibold tabular-nums" style={{ color: dayPnl >= 0 ? GREEN : RED }}>
                      {dayPnl >= 0 ? "+" : ""}{INR(dayPnl)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Advisor top action */}
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Compass className="w-4 h-4 text-[#888]" />
                <h3 className="text-sm font-semibold text-[#f5f5f5]">Advisor</h3>
                <Link href="/advisor" className="ml-auto text-[10px] text-[#555] hover:text-[#888]">open →</Link>
              </div>
              {advice === null ? (
                <div className="space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-40" /></div>
              ) : !topAction ? (
                <p className="text-[12px] text-[#888]">No action needed{runDate ? ` · ${runDate}` : ""} — holdings all clear.</p>
              ) : (() => {
                const m = VERDICT_META[topAction.verdict] ?? VERDICT_META.HOLD;
                const Icon = m.icon;
                return (
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" style={{ color: m.color }} />
                      <span className="text-sm font-semibold text-[#f5f5f5]">{topAction.symbol}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${m.color}1a`, color: m.color }}>{m.label}</span>
                    </div>
                    <p className="text-[11px] text-[#888] mt-1.5">
                      trend {topAction.trend_score}
                      {topAction.pnl_percent != null && ` · ${topAction.pnl_percent >= 0 ? "+" : ""}${topAction.pnl_percent}%`}
                      {topAction.rotation_target_symbol && ` · rotate → ${topAction.rotation_target_symbol}`}
                    </p>
                  </div>
                );
              })()}
              {advice !== null && advice.length > 0 && (actionable.length > 1 || changeCount > 0) && (
                <p className="text-[10px] text-[#555] mt-2 flex items-center gap-1.5">
                  <span>{actionable.length} action{actionable.length === 1 ? "" : "s"} today</span>
                  {changeCount > 0 && (
                    <span className="flex items-center gap-1 text-[#60a5fa]"><History className="w-3 h-3" />{changeCount} changed</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Edge (paper) — the go/no-go metric (VISION §6.1), the whole point */}
          {edge && edge.closed > 0 && (
            <Link href="/insights" className="group flex flex-wrap items-center gap-x-6 gap-y-2 bg-[#111111] border border-[#1f1f1f] hover:border-[#333] rounded-xl p-4 mb-4 transition-colors">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-[#888]" />
                <span className="text-sm font-semibold text-[#f5f5f5]">Edge (paper)</span>
                <span className="text-[10px] text-[#555]">{edge.closed} closed trades</span>
              </div>
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wide">Profit factor</p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: edge.profitFactor == null ? MUTE : edge.profitFactor >= 1.3 ? GREEN : edge.profitFactor >= 1.1 ? AMBER : RED }}>
                  {edge.profitFactor == null ? "—" : edge.profitFactor.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wide">Max drawdown</p>
                <p className="text-lg font-semibold tabular-nums text-[#f5f5f5]">{edge.maxDrawdownR.toFixed(1)}R</p>
              </div>
              <div>
                <p className="text-[10px] text-[#555] uppercase tracking-wide">Expectancy</p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: edge.expectancyR >= 0 ? GREEN : RED }}>
                  {edge.expectancyR >= 0 ? "+" : ""}{edge.expectancyR.toFixed(2)}R
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2 text-[11px] text-[#888]">
                <span className="px-2 py-0.5 rounded-full bg-[#ffffff08]">{edge.label}</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#444] group-hover:text-[#888] transition-colors" />
              </div>
            </Link>
          )}

          {/* daily risk meter (full width) */}
          <div className="mb-4">
            <RiskMeter pnl={sess?.pnl ?? 0} capital={capital} maxLossPct={maxLossPct} maxProfitPct={maxProfitPct} />
          </div>

          {/* portfolio-level risk flags, if any */}
          {risk && (risk.concentration_flags.length > 0 || risk.tax_loss_harvest.length > 0 || risk.correlation) && (
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-[#888]" />
                <h3 className="text-sm font-semibold text-[#f5f5f5]">Portfolio-level risk</h3>
                <Link href="/advisor" className="ml-auto text-[10px] text-[#555] hover:text-[#888]">detail →</Link>
              </div>
              {risk.concentration_flags.slice(0, 2).map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px] text-[#f59e0b] leading-relaxed mb-1">
                  <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{f}</span>
                </div>
              ))}
              {risk.correlation && risk.correlation.effective_bets != null && (
                <p className="text-[11px] text-[#888] mt-1">
                  🎯 Effective bets: {risk.correlation.effective_bets} of {risk.correlation.names_covered} <span className="text-[#555]">(correlation-adjusted)</span>
                </p>
              )}
              {risk.tax_loss_harvest.length > 0 && (
                <p className="text-[11px] text-[#22c55e] mt-1">
                  🧾 {INR(risk.harvestable_loss_inr)} in tax-loss harvest available across {risk.tax_loss_harvest.length} names
                </p>
              )}
            </div>
          )}

          {/* quick nav */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { href: "/trading", label: "Auto Trade", desc: "run the paper engine" },
              { href: "/portfolio", label: "Portfolio", desc: "your real holdings" },
              { href: "/advisor", label: "Advisor", desc: "hold / sell guidance" },
              { href: "/insights", label: "Insights", desc: "is the edge real?" },
            ].map((l) => (
              <Link key={l.href} href={l.href}
                    className="group bg-[#111111] border border-[#1f1f1f] hover:border-[#333] rounded-xl p-4 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#f5f5f5]">{l.label}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#444] group-hover:text-[#888] transition-colors" />
                </div>
                <p className="text-[11px] text-[#555] mt-1">{l.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
