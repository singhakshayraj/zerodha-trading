"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import api from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { RefreshCw, Compass, ShieldAlert, TrendingDown, TrendingUp, Scissors, Hourglass, Layers, Receipt, Network, Gauge } from "lucide-react";

type Advice = {
  symbol: string;
  quantity: number;
  avg_price: number;
  last_price: number;
  pnl_percent: number | null;
  breakeven_gain_pct: number | null;
  verdict: "HOLD" | "TRIM" | "SELL_ON_BOUNCE" | "SELL" | "INSUFFICIENT";
  confidence: number;
  trend_score: number;
  reasons: string[];
  stop_level: number | null;
  exit_target: number | null;
  rotation_target_symbol?: string | null;
  rotation_target_score?: number | null;
  rotation_reason?: string | null;
  market_regime?: string | null;
  trigger_type?: "MACRO" | "MICRO" | null;
  rotation_sell_qty?: number | null;
  rotation_freed_inr?: number | null;
  rotation_buy_qty?: number | null;
  rotation_buy_price?: number | null;
  user_decision?: "accept" | "decline" | null;
  indicators: { rsi_14?: number; ema_50?: number; ema_200?: number; adx?: number; support?: number; resistance?: number; daily_bars?: number; calibrated_confidence?: number | null; calibration_low_n?: boolean } | null;
};

const GREEN = "#22c55e", RED = "#ef4444", AMBER = "#f59e0b", BLUE = "#3b82f6", MUTE = "#71717a";
const INR = (n: number) => (n < 0 ? "-" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });

const VERDICT_META: Record<Advice["verdict"], { color: string; icon: React.ElementType; label: string; blurb: string }> = {
  SELL:           { color: RED,   icon: TrendingDown, label: "Sell",           blurb: "confirmed downtrend — cutting is right" },
  SELL_ON_BOUNCE: { color: AMBER, icon: Hourglass,    label: "Sell on bounce", blurb: "oversold at support — sell into strength, not the low" },
  TRIM:           { color: BLUE,  icon: Scissors,     label: "Trim",           blurb: "mixed structure — de-risk, book part" },
  HOLD:           { color: GREEN, icon: TrendingUp,   label: "Hold",           blurb: "uptrend intact — hold above the stop line" },
  INSUFFICIENT:   { color: MUTE,  icon: ShieldAlert,  label: "No read",        blurb: "not enough daily history for an honest verdict" },
};

const REGIME_META: Record<string, { color: string; label: string; blurb: string }> = {
  AGGRESSIVE_BULL:       { color: GREEN, label: "Bull trend", blurb: "trending tape — momentum signals carry weight" },
  AGGRESSIVE_BEAR:       { color: RED,   label: "Bear trend", blurb: "trending down — exits get the benefit of the doubt" },
  CHOPPY_SIDEWAYS:       { color: MUTE,  label: "Choppy",     blurb: "trendless tape — rotation bar raised to 65pts to filter churn" },
  HIGH_VOLATILITY_PANIC: { color: AMBER, label: "Panic vol",  blurb: "wide-range tape — 200-day structure weighted over momentum" },
  NEUTRAL:               { color: MUTE,  label: "Neutral",    blurb: "no strong regime read" },
};

type TrackRecord = {
  evaluatedCalls: number;
  hitRatePct: number | null;
  avgReturnPct: number | null;
  avgAlphaPct: number | null;
  adviceValueInr: number;
};

type PortfolioRisk = {
  total_value: number;
  top_position: { symbol: string; weight_pct: number } | null;
  sector_weights: Record<string, number>;
  concentration_flags: string[];
  tax_loss_harvest: { symbol: string; unrealized_loss_inr: number; verdict: string; pnl_percent: number | null }[];
  harvestable_loss_inr: number;
  correlation: {
    lookback_days: number;
    window_returns: number;
    names_covered: number;
    effective_bets: number | null;
    clusters: { symbols: string[]; weight_pct: number; avg_corr: number }[];
    top_pairs: { symbols: string[]; corr: number }[];
  } | null;
};

type Calibration = {
  graded_calls: number;
  base_rate_pct: number | null;
  ece_pct: number | null;
  monotonic: boolean | null;
  bins: {
    label: string; n: number; predicted_pct: number;
    empirical_hit_pct: number; calibrated_pct: number; low_n: boolean;
  }[];
};

export default function AdvisorPage() {
  const router = useRouter();
  const { isConnected, hydrateFromStorage } = useAppStore();
  const [rows, setRows] = useState<Advice[] | null>(null);
  const [runDate, setRunDate] = useState<string | null>(null);
  const [runAt, setRunAt] = useState<string | null>(null);
  const [isOfficial, setIsOfficial] = useState<boolean | null>(null);
  const [track, setTrack] = useState<TrackRecord | null>(null);
  const [risk, setRisk] = useState<PortfolioRisk | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [filterVerdict, setFilterVerdict] = useState<Advice["verdict"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (!isConnected) router.push("/connect"); }, [isConnected, router]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = (await api.get("/advisor")).data;
      setRows(r.rows ?? []); setRunDate(r.runDate ?? null);
      setRunAt(r.runAt ?? null); setIsOfficial(r.isOfficial ?? null);
      setRisk(r.portfolioRisk ?? null);
      setCalibration(r.calibration ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load advice"); }
    finally { setLoading(false); }
    try {
      const t = (await api.get("/advisor/track-record")).data;
      if (typeof t?.evaluatedCalls === "number") setTrack(t);
    } catch { /* track record is additive — never blocks the page */ }
  }, []);
  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);

  const counts = (rows ?? []).reduce<Record<string, number>>((acc, r) => { acc[r.verdict] = (acc[r.verdict] ?? 0) + 1; return acc; }, {});

  return (
    <div className="flex flex-col md:flex-row md:h-screen bg-[#0a0a0a] md:overflow-hidden pb-24 md:pb-0">
      <Sidebar />
      <main className="flex-1 md:overflow-auto p-5 md:p-8">
        <div className="max-w-[1100px] w-full mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-semibold text-[#f5f5f5]">Portfolio Advisor</h1>
              <p className="text-xs text-[#555] mt-1">
                Daily hold/sell read on your long-term holdings — direction first, entry price is sunk cost
                {runAt ? (
                  <> · updated <span className="text-[#888]">
                    {new Date(runAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST
                  </span>
                  {isOfficial === false ? <span className="text-[#666]"> (intraday refresh)</span> : null}</>
                ) : runDate ? <> · run <span className="text-[#888]">{runDate}</span></> : null}
              </p>
            </div>
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#888] bg-[#111111] border border-[#1f1f1f] hover:text-[#f5f5f5] transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          <p className="text-[11px] text-[#4a4a4a] mb-6">Advisory only — nothing here places orders. Generated from daily-timeframe structure (EMA stack, momentum, ADX, swing levels) + your position economics.</p>

          {error && <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-sm rounded-xl p-4 mb-6">{error}</div>}
          {!rows && loading && <p className="text-sm text-[#555]">Loading…</p>}

          {rows && rows.length === 0 && (
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-2"><Compass className="w-4 h-4 text-[#888]" /><h3 className="text-sm font-semibold text-[#f5f5f5]">No advice yet</h3></div>
              <p className="text-[12px] text-[#888] leading-relaxed">
                The advisor runs automatically once per day after <span className="text-[#f5f5f5] font-mono">09:45 IST</span> (past the opening-bell noise) whenever a live enctoken exists — independent of trading sessions. Paste today&apos;s token and the analysis appears here within a few minutes.
              </p>
            </div>
          )}

          {track && track.evaluatedCalls > 0 && (
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 mb-6 flex flex-wrap items-center gap-x-8 gap-y-2">
              <div>
                <p className="text-[10px] text-[#666] uppercase tracking-wide">Track record</p>
                <p className="text-[11px] text-[#555]">{track.evaluatedCalls} calls judged vs what actually happened next</p>
              </div>
              <div>
                <p className="text-[10px] text-[#666] uppercase tracking-wide">Hit rate</p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: (track.hitRatePct ?? 0) >= 50 ? GREEN : RED }}>{track.hitRatePct?.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-[10px] text-[#666] uppercase tracking-wide">Avg alpha vs Nifty</p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: (track.avgAlphaPct ?? 0) >= 0 ? GREEN : RED }}>{track.avgAlphaPct !== null ? `${track.avgAlphaPct >= 0 ? "+" : ""}${track.avgAlphaPct.toFixed(2)}pp` : "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#666] uppercase tracking-wide">Exit calls saved you</p>
                <p className="text-lg font-semibold tabular-nums" style={{ color: track.adviceValueInr >= 0 ? GREEN : RED }}>{INR(track.adviceValueInr)}</p>
              </div>
            </div>
          )}

          {rows && rows.length > 0 && rows[0].market_regime && REGIME_META[rows[0].market_regime] && (
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl px-4 py-3 mb-6 flex items-center gap-3">
              <span className="text-[10px] text-[#666] uppercase tracking-wide">Market regime</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
                    style={{ background: `${REGIME_META[rows[0].market_regime].color}1a`, color: REGIME_META[rows[0].market_regime].color }}>
                {REGIME_META[rows[0].market_regime].label}
              </span>
              <span className="text-[11px] text-[#666]">{REGIME_META[rows[0].market_regime].blurb}</span>
            </div>
          )}

          {risk && (risk.concentration_flags.length > 0 || risk.tax_loss_harvest.length > 0 || risk.correlation) && (
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="w-4 h-4 text-[#888]" />
                <h3 className="text-sm font-semibold text-[#f5f5f5]">Portfolio-level risk</h3>
                <span className="text-[11px] text-[#555]">the whole book, not one name at a time</span>
              </div>
              {risk.concentration_flags.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {risk.concentration_flags.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] text-[#f59e0b] leading-relaxed">
                      <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
              {risk.correlation && risk.correlation.effective_bets != null && (
                <div className="border-t border-[#1f1f1f] pt-3 mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Network className="w-3.5 h-3.5 text-[#888]" />
                    <span className="text-[12px] text-[#f5f5f5] font-medium">
                      Effective bets: {risk.correlation.effective_bets} of {risk.correlation.names_covered}
                    </span>
                    <span className="text-[11px] text-[#555]">{risk.correlation.lookback_days}-day return correlation</span>
                  </div>
                  <p className="text-[11px] text-[#888] leading-relaxed mb-2">
                    Correlation-adjusted count of independent positions — names that move together collapse toward one bet, so the book is less diversified than the raw count suggests.
                  </p>
                  {risk.correlation.clusters.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {risk.correlation.clusters.map((c, i) => (
                        <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-[#f59e0b0d] text-[#e5e5e5]">
                          {c.symbols.join(" + ")}
                          <span className="text-[#666]"> · corr {c.avg_corr.toFixed(2)} · {c.weight_pct}%</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {risk.tax_loss_harvest.length > 0 && (
                <div className="border-t border-[#1f1f1f] pt-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Receipt className="w-3.5 h-3.5 text-[#22c55e]" />
                    <span className="text-[12px] text-[#f5f5f5] font-medium">
                      Tax-loss harvest: {INR(risk.harvestable_loss_inr)} in realizable losses
                    </span>
                  </div>
                  <p className="text-[11px] text-[#888] leading-relaxed mb-2">
                    Weak names already flagged to exit — selling books these losses to offset capital gains elsewhere. Short- vs long-term treatment depends on how long you&apos;ve held.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {risk.tax_loss_harvest.map((h) => (
                      <span key={h.symbol} className="text-[11px] px-2 py-0.5 rounded-md bg-[#22c55e0d] text-[#e5e5e5]">
                        {h.symbol} <span className="text-[#ef4444]">{INR(-Math.abs(h.unrealized_loss_inr))}</span>
                        <span className="text-[#666]"> · {h.verdict}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {calibration && calibration.graded_calls > 0 && (
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <Gauge className="w-4 h-4 text-[#888]" />
                <h3 className="text-sm font-semibold text-[#f5f5f5]">Confidence calibration</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b0d] text-[#f59e0b] uppercase tracking-wide">Dark · not used for decisions</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] mb-3">
                <span className="text-[#888]">Base rate <span className="text-[#e5e5e5]">{calibration.base_rate_pct}%</span></span>
                <span className="text-[#888]">Calibration error <span className="text-[#e5e5e5]">{calibration.ece_pct}pp</span></span>
                <span className="text-[#888]">Reliable? {calibration.monotonic
                  ? <span className="text-[#22c55e]">monotonic ✓</span>
                  : <span className="text-[#f59e0b]">not monotonic — unusable yet</span>}</span>
                <span className="text-[#555]">n={calibration.graded_calls}</span>
              </div>
              <div className="space-y-1.5">
                {calibration.bins.map((b) => (
                  <div key={b.label} className="flex items-center gap-2 text-[11px]">
                    <span className="w-12 text-[#888] tabular-nums">{b.label}</span>
                    <span className="w-9 text-[#666] tabular-nums">n={b.n}</span>
                    <span className="w-20 text-[#888] tabular-nums">pred {b.predicted_pct}%</span>
                    <div className="flex-1 h-1.5 rounded bg-[#1f1f1f] overflow-hidden min-w-[40px]">
                      <div className="h-full bg-[#3b82f6]" style={{ width: `${Math.min(100, Math.max(0, b.empirical_hit_pct))}%` }} />
                    </div>
                    <span className="w-16 text-right text-[#e5e5e5] tabular-nums">emp {b.empirical_hit_pct}%</span>
                    <span className="w-24 text-right text-[#888] tabular-nums">calib {b.calibrated_pct}%{b.low_n ? " ·low-n" : ""}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#888] leading-relaxed mt-3">
                A usable confidence needs the empirical hit-rate (bar) to rise with predicted confidence (monotonic) on enough calls. <span className="text-[#e5e5e5]">Calibrated</span> is the empirical rate shrunk toward the base rate so small buckets don&apos;t mislead. Logged only — it never changes a verdict until it earns promotion.
              </p>
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="space-y-6">
              {/* summary strip — click a verdict to filter the cards below */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {(Object.keys(VERDICT_META) as Advice["verdict"][]).map((v) => {
                  const m = VERDICT_META[v]; const Icon = m.icon;
                  const n = counts[v] ?? 0;
                  const active = filterVerdict === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      disabled={n === 0}
                      onClick={() => setFilterVerdict(active ? null : v)}
                      aria-pressed={active}
                      title={n === 0 ? `No ${m.label} calls` : active ? "Show all" : `Show only ${m.label}`}
                      className={`text-left bg-[#111111] border rounded-xl p-4 transition-colors ${n === 0 ? "opacity-40 cursor-default" : "cursor-pointer hover:border-[#333]"}`}
                      style={{ borderColor: active ? m.color : "#1f1f1f" }}
                    >
                      <div className="flex items-center gap-2 mb-1"><Icon className="w-4 h-4" style={{ color: m.color }} /><span className="text-[11px] text-[#666] uppercase tracking-wide">{m.label}</span></div>
                      <p className="text-2xl font-semibold tabular-nums" style={{ color: n ? m.color : "#333" }}>{n}</p>
                    </button>
                  );
                })}
              </div>
              {filterVerdict && (
                <div className="flex items-center gap-2 text-[11px] text-[#888]">
                  <span>Showing {counts[filterVerdict] ?? 0} {VERDICT_META[filterVerdict].label} call{(counts[filterVerdict] ?? 0) === 1 ? "" : "s"}</span>
                  <button type="button" onClick={() => setFilterVerdict(null)} className="text-[#60a5fa] hover:underline">clear filter</button>
                </div>
              )}

              {/* cards, worst-first (API sorts by trend_score asc) */}
              <div className="space-y-3">
                {(filterVerdict ? rows.filter((r) => r.verdict === filterVerdict) : rows).map((r) => {
                  const m = VERDICT_META[r.verdict]; const Icon = m.icon;
                  const pnl = r.pnl_percent ?? 0;
                  return (
                    <div key={r.symbol} className="bg-[#111111] border rounded-xl p-5" style={{ borderColor: `${m.color}33` }}>
                      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                        <div className="lg:w-56 shrink-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[15px] font-semibold text-[#f5f5f5]">{r.symbol}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" style={{ background: `${m.color}1a`, color: m.color }}>
                              <Icon className="w-3 h-3 inline mr-1 -mt-0.5" />{m.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#555] mt-1">{m.blurb}</p>
                          <div className="mt-3 space-y-1 text-[11px] text-[#888]">
                            <p>{r.quantity} × avg {INR(r.avg_price)} → now {INR(r.last_price)}</p>
                            <p style={{ color: pnl >= 0 ? GREEN : RED }}>{pnl >= 0 ? "+" : ""}{pnl?.toFixed(1)}%{(r.breakeven_gain_pct ?? 0) > 0 ? <span className="text-[#666]"> · needs +{r.breakeven_gain_pct?.toFixed(0)}% to break even</span> : null}</p>
                            <p className="text-[#555]">
                              trend {r.trend_score > 0 ? "+" : ""}{r.trend_score} · confidence {r.confidence}%
                              {r.indicators?.calibrated_confidence != null && (
                                <span className="text-[#666]" title="Measured hit-rate for this confidence bucket from the graded track record — DARK, not used for the verdict yet">
                                  {" "}· calib ~{Math.round(r.indicators.calibrated_confidence)}%{r.indicators.calibration_low_n ? " (low-n)" : ""}
                                </span>
                              )}
                              {r.trigger_type && (
                                <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide align-middle"
                                      style={{ background: "#ffffff0d", color: r.trigger_type === "MACRO" ? "#a78bfa" : "#60a5fa" }}
                                      title={r.trigger_type === "MACRO" ? "Long-term structure call — judged at 30 trading days" : "Short-term signal call — judged at 10 trading days"}>
                                  {r.trigger_type}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <ul className="space-y-1.5">
                            {(r.reasons ?? []).map((reason, i) => (
                              <li key={i} className="text-[12px] text-[#bbb] leading-relaxed flex gap-2">
                                <span className="mt-1.5 h-1 w-1 rounded-full bg-[#444] shrink-0" />{reason}
                              </li>
                            ))}
                          </ul>
                          {(r.stop_level || r.exit_target || r.rotation_target_symbol) && (
                            <div className="flex flex-wrap gap-2 mt-3 text-[11px]">
                              {r.exit_target && <span className="px-2 py-1 rounded bg-[#0d0d0d] border border-[#1f1f1f] text-[#f5f5f5]">sell near <span style={{ color: AMBER }}>{INR(r.exit_target)}</span></span>}
                              {r.stop_level && <span className="px-2 py-1 rounded bg-[#0d0d0d] border border-[#1f1f1f] text-[#f5f5f5]">exit below <span style={{ color: RED }}>{INR(r.stop_level)}</span></span>}
                              {r.rotation_target_symbol && (
                                <span className="px-2 py-1 rounded bg-[#0d0d0d] border text-[#f5f5f5]" style={{ borderColor: `${GREEN}44` }}>
                                  rotate into <span style={{ color: GREEN }} className="font-semibold">{r.rotation_target_symbol}</span>
                                  <span className="text-[#666]"> · score {r.rotation_target_score}{r.rotation_reason === "same_sector" ? " · same sector" : ""}</span>
                                </span>
                              )}
                              {r.rotation_buy_qty != null && r.rotation_freed_inr != null && (
                                <span className="px-2 py-1 rounded bg-[#0d0d0d] border border-[#1f1f1f] text-[#f5f5f5]">
                                  sell {r.rotation_sell_qty} → <span style={{ color: GREEN }}>{INR(r.rotation_freed_inr)}</span> frees ~{r.rotation_buy_qty} @ {INR(r.rotation_buy_price ?? 0)}
                                </span>
                              )}
                              {r.user_decision && (
                                <span className="px-2 py-1 rounded bg-[#0d0d0d] border border-[#1f1f1f] font-semibold uppercase tracking-wide text-[10px]" style={{ color: r.user_decision === "accept" ? GREEN : RED }}>
                                  you {r.user_decision === "accept" ? "accepted ✓" : "declined ✗"}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
