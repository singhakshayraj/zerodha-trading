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
import { Sidebar } from "@/components/layout/Sidebar";
import { BrainStatus } from "@/components/BrainStatus";
import { RiskMeter } from "@/components/RiskMeter";
import { Activity, Briefcase, Compass, ArrowRight, TrendingUp, TrendingDown, Scissors, Hourglass, ShieldAlert, Layers } from "lucide-react";

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
  const { isConnected, hydrateFromStorage } = useAppStore();

  const [sess, setSess] = useState<{ pnl: number; trades: number; active: boolean; config: Record<string, unknown> | null } | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [advice, setAdvice] = useState<Advice[] | null>(null);
  const [risk, setRisk] = useState<PortfolioRisk | null>(null);
  const [runDate, setRunDate] = useState<string | null>(null);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (!isConnected) router.push("/connect"); }, [isConnected, router]);

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
    } catch { /* */ }
  }, []);
  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);

  // portfolio health
  const totalCurrent = (holdings ?? []).reduce((s, h) => s + h.last_price * h.quantity, 0);
  const totalInvested = (holdings ?? []).reduce((s, h) => s + h.average_price * h.quantity, 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const dayPnl = (holdings ?? []).reduce((s, h) => s + h.day_change * h.quantity, 0);

  // advisor top action: worst actionable call today
  const topAction = (advice ?? [])
    .filter((r) => ACTIONABLE.has(r.verdict) || r.rotation_target_symbol)
    .sort((a, b) => (a.trend_score ?? 0) - (b.trend_score ?? 0))[0];

  const cfg = sess?.config ?? {};
  const capital = (cfg.capitalDeployed as number) ?? 25000;
  const maxLossPct = (cfg.maxLossPercent as number) ?? 5;
  const maxProfitPct = (cfg.maxProfitPercent as number) ?? 7;

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

  return (
    <div className="flex flex-col md:flex-row md:h-screen bg-[#0a0a0a] md:overflow-hidden pb-24 md:pb-0">
      <Sidebar />
      <main className="flex-1 md:overflow-y-auto p-4 md:p-6">
        <div className="max-w-[1100px] w-full mx-auto">
          {/* header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-[#f5f5f5]">Command Center</h1>
              <p className="text-[12px] text-[#666] mt-0.5">{today}</p>
            </div>
            <BrainStatus />
          </div>

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
                <p className="text-[11px] text-[#444]">Loading…</p>
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
                <p className="text-[11px] text-[#444]">Loading…</p>
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
            </div>
          </div>

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
