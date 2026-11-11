"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import api from "@/lib/api";
import { useRefreshOnVisible } from "@/lib/useRefreshOnVisible";
import { Sidebar } from "@/components/layout/Sidebar";
import { StockLookup } from "@/components/StockLookup";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Compass, ShieldAlert, TrendingDown, TrendingUp, Scissors, Hourglass, Layers, Receipt, Network, Gauge, History, ChevronDown, FlaskConical, Anchor, PieChart, ArrowRight, X, ChevronLeft, ChevronRight } from "lucide-react";

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
  /** [P-33] the case AGAINST this verdict. Null on rows written before 2026-08-10. */
  counter_case?: string | null;
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
  indicators: { rsi_14?: number; ema_50?: number; ema_200?: number; adx?: number; support?: number; resistance?: number; daily_bars?: number; calibrated_confidence?: number | null; calibration_low_n?: boolean; thesis?: Thesis | null } | null;
};

/** [P-47] Thesis engine — advisor v2 in SHADOW mode. 12-month action from
 * fundamentals + sizing + loss rules. Graded separately; never changes the
 * v1 verdict above it. */
type Thesis = {
  action: "HOLD" | "ADD" | "TRIM" | "EXIT";
  target_weight_pct: number;
  qty_delta: number;
  quality: number | null;
  fundamentals_asof: string | null;
  fundamentals_fresh: boolean;
  confidence: "low" | "normal";
  rule: string | null;
  reason: string;
  falsifier: string;
};
/** Hero picks — contrarian value sleeve (10–20% of money). Four gates: the
 *  market is against it, cash cushion, good business, not a falling knife.
 *  Produced by scripts/hero_picks.py; entry logged for 12-month grading. */
type HeroPick = { symbol: string; name?: string; sector: string; score?: number; dd_3y: number; rel_3y: number; rel_3m: number; low_age_days: number; pe: number | null; roce: number; piotroski: number; ev_ebitda?: number | null; net_cash_pct_mcap?: number; last_close?: number; failed?: string[] };
type HeroPicks = { asof: string; n_screened: number; picks: HeroPick[]; near_misses: HeroPick[] };
const GATE_LABEL: Record<string, string> = { market_against: "not hated enough", cash_cushion: "no cash cushion", good_business: "business too weak", not_falling_knife: "still falling" };
type SectorGroup = { group: string; names: number; my_weight_pct: number; index_weight_pct: number | null; trend_median: number | null; sell_pct: number | null; mix: { sell: number; trim: number; hold: number }; quality_median: number | null; gnpa_median: number | null; nnpa_median: number | null; held: { symbol: string; verdict: Advice["verdict"] | null; weight_pct: number | null }[] };
type SectorView = { run_date: string; scan_date: string | null; groups: SectorGroup[] };
type ThesisTrack = { graded_at: string; theses: number; first_run_date: string; threshold: number; h126?: { n: number; hit_rate: number | null; fm_t: number | null; clears: boolean }; h252?: { n: number; hit_rate: number | null; fm_t: number | null; clears: boolean } };

const GREEN = "#22c55e", RED = "#ef4444", AMBER = "#f59e0b", MUTE = "#71717a";
const INR = (n: number) => (n < 0 ? "-" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const THESIS_META: Record<Thesis["action"], { color: string; order: number }> = {
  EXIT: { color: RED, order: 0 }, TRIM: { color: AMBER, order: 1 }, ADD: { color: GREEN, order: 2 }, HOLD: { color: MUTE, order: 3 },
};

const VERDICT_META: Record<Advice["verdict"], { color: string; icon: React.ElementType; label: string; blurb: string }> = {
  SELL:           { color: RED,   icon: TrendingDown, label: "Sell",           blurb: "confirmed downtrend — cutting is right" },
  SELL_ON_BOUNCE: { color: RED,   icon: Hourglass,    label: "Sell on bounce", blurb: "oversold at support — sell into strength, not the low" },
  TRIM:           { color: AMBER, icon: Scissors,     label: "Trim",           blurb: "mixed structure — de-risk, book part" },
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

// ── small presentational atoms ───────────────────────────────────────────────

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-[#0d0d0d] border border-[#1c1c1c] px-3 py-2.5">
      <p className="text-[10px] text-[#7a7a7a] uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5 leading-none" style={{ color: color ?? "#f5f5f5" }}>{value}</p>
      {sub && <p className="text-[10px] text-[#5a5a5a] mt-1 leading-tight">{sub}</p>}
    </div>
  );
}

function Metric({ label, value, color, title }: { label: string; value: string; color?: string; title?: string }) {
  return (
    <span title={title} className="inline-flex items-baseline gap-1 px-2 py-1 rounded-md bg-[#0d0d0d] border border-[#1c1c1c]">
      <span className="text-[9px] text-[#7a7a7a] uppercase tracking-wide">{label}</span>
      <span className="text-[11px] font-medium tabular-nums" style={{ color: color ?? "#d5d5d5" }}>{value}</span>
    </span>
  );
}

function Section({ icon: Icon, title, note, children, defaultOpen = false }: { icon: React.ElementType; title: string; note?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-hidden">
      <summary className="flex items-center gap-2 p-4 cursor-pointer list-none select-none hover:bg-[#141414] transition-colors">
        <Icon className="w-4 h-4 text-[#888] shrink-0" />
        <h3 className="text-sm font-semibold text-[#f5f5f5]">{title}</h3>
        {note && <span className="text-[11px] text-[#6a6a6a] min-w-0 truncate">{note}</span>}
        <ChevronDown className="w-4 h-4 text-[#666] ml-auto shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

// ── decision-first layout atoms ─────────────────────────────────────────────
// v1 verdict and v2 thesis compared on one scale: sell / trim / hold.
type Bucket = "sell" | "trim" | "hold" | "none";
const v1Bucket = (v: Advice["verdict"]): Bucket => (v === "SELL" || v === "SELL_ON_BOUNCE" ? "sell" : v === "TRIM" ? "trim" : v === "HOLD" ? "hold" : "none");
const v2Bucket = (a?: Thesis["action"]): Bucket => (!a ? "none" : a === "EXIT" ? "sell" : a === "TRIM" ? "trim" : "hold");
const pct = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);
const isMove = (r: Advice) => v1Bucket(r.verdict) === "sell" || r.verdict === "TRIM";
// TRIM is a half-exit (same rule as the brain's size_rotation).
const sellQty = (r: Advice) => r.rotation_sell_qty ?? (r.verdict === "TRIM" ? Math.floor(r.quantity / 2) : r.quantity);
const freedInr = (r: Advice) => r.rotation_freed_inr ?? sellQty(r) * (r.last_price ?? 0);
const deployInr = (r: Advice) => (r.rotation_buy_qty != null && r.rotation_buy_price != null ? r.rotation_buy_qty * r.rotation_buy_price : 0);

function V2Mark({ r }: { r: Advice }) {
  const t = r.indicators?.thesis;
  if (!t) return null;
  const agree = v2Bucket(t.action) === v1Bucket(r.verdict);
  return (
    <span title={`Thesis engine (v2, shadow): ${t.action}${t.quality != null ? ` · quality ${t.quality}` : ""}`}
      className="inline-flex items-center gap-1 text-[10px] font-medium whitespace-nowrap" style={{ color: agree ? "#6a6a6a" : AMBER }}>
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: agree ? "#4a4a4a" : AMBER }} />
      {agree ? "v2 agrees" : `v2: ${t.action}`}
    </span>
  );
}

function ChangeTag({ note }: { note: string | null }) {
  if (!note) return null;
  return <span className="text-[10px] font-medium text-[#60a5fa] whitespace-nowrap">{note}</span>;
}

function MoveCard({ r, note, onOpen }: { r: Advice; note: string | null; onOpen: () => void }) {
  const m = VERDICT_META[r.verdict];
  return (
    <button type="button" onClick={onOpen}
      className="w-full text-left bg-[#111111] border rounded-xl p-3 hover:border-[#3a3a3a] transition-colors grid grid-cols-[1fr_auto_1fr] items-center gap-2"
      style={{ borderColor: `${m.color}40` }}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: m.color }}>{m.label}</span>
          <V2Mark r={r} /><ChangeTag note={note} />
        </div>
        <p className="text-[15px] font-semibold text-[#f5f5f5] truncate">{r.symbol}</p>
        <p className="text-[11px] text-[#8a8a8a] tabular-nums truncate">
          {sellQty(r)} sh · {INR(Math.round(freedInr(r)))} · <span style={{ color: (r.pnl_percent ?? 0) >= 0 ? GREEN : RED }}>{pct(r.pnl_percent)}</span>
        </p>
      </div>
      <ArrowRight className="w-4 h-4 text-[#555] shrink-0" />
      {r.rotation_target_symbol ? (
        <div className="min-w-0 text-right">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: GREEN }}>Buy</span>
          <p className="text-[15px] font-semibold text-[#f5f5f5] truncate">{r.rotation_target_symbol}</p>
          <p className="text-[11px] text-[#8a8a8a] tabular-nums truncate">
            {r.rotation_buy_qty != null ? `~${r.rotation_buy_qty} @ ${INR(r.rotation_buy_price ?? 0)}` : `score ${r.rotation_target_score}`}
          </p>
        </div>
      ) : (
        <p className="text-right text-[11px] text-[#6a6a6a]">{r.verdict === "TRIM" ? "keep the rest" : "no stronger home — hold cash"}</p>
      )}
    </button>
  );
}

function HoldingTile({ r, note, onOpen }: { r: Advice; note: string | null; onOpen: () => void }) {
  const m = VERDICT_META[r.verdict];
  const q = r.indicators?.thesis?.quality;
  return (
    <button type="button" onClick={onOpen}
      className="text-left rounded-xl border p-3 hover:border-[#4a4a4a] transition-colors min-h-[96px] flex flex-col"
      style={{ borderColor: `${m.color}40`, background: `${m.color}0d` }}>
      <div className="flex items-start justify-between gap-1">
        <span className="text-[13px] font-semibold text-[#f5f5f5] truncate">{r.symbol}</span>
        <span className="text-[12px] font-semibold tabular-nums shrink-0" style={{ color: (r.pnl_percent ?? 0) >= 0 ? GREEN : RED }}>{pct(r.pnl_percent)}</span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: m.color }}>{m.label}</span>
      <ChangeTag note={note} />
      <div className="mt-auto pt-2 flex items-center justify-between gap-1">
        <V2Mark r={r} />
        {q != null && <span className="text-[10px] text-[#7a7a7a] tabular-nums">q {q}</span>}
      </div>
    </button>
  );
}

// Side panel on laptop, bottom sheet on phone. ←/→ step through, Esc closes.
function DetailPanel({ r, pos, total, onClose, onPrev, onNext }: { r: Advice; pos: number; total: number; onClose: () => void; onPrev: () => void; onNext: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowRight") onNext(); else if (e.key === "ArrowLeft") onPrev(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose, onPrev, onNext]);
  const m = VERDICT_META[r.verdict]; const Icon = m.icon;
  const t = r.indicators?.thesis ?? null;
  const agree = t ? v2Bucket(t.action) === v1Bucket(r.verdict) : true;
  const pnl = r.pnl_percent ?? 0;
  const hasPlan = !!(r.exit_target || r.stop_level || r.rotation_target_symbol || (r.rotation_buy_qty != null && r.rotation_freed_inr != null) || r.user_decision);
  const navBtn = "p-2 rounded-lg text-[#aaa] hover:text-[#f5f5f5] hover:bg-[#1a1a1a] disabled:opacity-30";
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${r.symbol} details`}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t md:inset-y-0 md:left-auto md:right-0 md:w-[460px] md:max-h-none md:rounded-none md:border-t-0 md:border-l bg-[#0f0f0f] border-[#262626] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-[#0f0f0f] border-b border-[#1f1f1f] px-4 py-3 flex items-center gap-2">
          <span className="text-[16px] font-semibold text-[#f5f5f5] truncate min-w-0">{r.symbol}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide shrink-0" style={{ background: `${m.color}1a`, color: m.color }}>
            <Icon className="w-3 h-3 inline mr-1 -mt-0.5" />{m.label}
          </span>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: pnl >= 0 ? GREEN : RED }}>{pct(r.pnl_percent)}</span>
          <div className="ml-auto flex items-center shrink-0 -mr-2">
            <button type="button" className={navBtn} onClick={onPrev} disabled={pos <= 0} aria-label="Previous"><ChevronLeft className="w-4 h-4" /></button>
            <span className="hidden sm:inline text-[10px] text-[#6a6a6a] tabular-nums w-10 text-center">{pos + 1}/{total}</span>
            <button type="button" className={navBtn} onClick={onNext} disabled={pos >= total - 1} aria-label="Next"><ChevronRight className="w-4 h-4" /></button>
            <button type="button" className={navBtn} onClick={onClose} aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">
          <p className="text-[13px] text-[#e5e5e5] leading-relaxed">{(r.reasons ?? [])[0] ?? m.blurb}</p>
          <p className="text-[11px] text-[#9a9a9a] tabular-nums">
            {r.quantity} × avg {INR(r.avg_price)} → <span className="text-[#d5d5d5]">now {INR(r.last_price)}</span>
            {(r.breakeven_gain_pct ?? 0) > 0 && <span className="text-[#6a6a6a]"> · needs +{r.breakeven_gain_pct?.toFixed(0)}% to break even</span>}
          </p>

          {hasPlan && (
            <div className="rounded-lg border border-[#1f1f1f] bg-[#111] p-3">
              <p className="text-[9px] text-[#6a6a6a] uppercase tracking-wide mb-2">Plan</p>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {r.exit_target && <span className="px-2 py-1 rounded bg-[#0d0d0d] border border-[#1f1f1f] text-[#d5d5d5]">sell near <span style={{ color: AMBER }}>{INR(r.exit_target)}</span></span>}
                {r.stop_level && <span className="px-2 py-1 rounded bg-[#0d0d0d] border border-[#1f1f1f] text-[#d5d5d5]">exit below <span style={{ color: RED }}>{INR(r.stop_level)}</span></span>}
                {r.rotation_target_symbol && (
                  <span className="px-2 py-1 rounded bg-[#0d0d0d] border text-[#d5d5d5]" style={{ borderColor: `${GREEN}44` }}>
                    rotate into <span style={{ color: GREEN }} className="font-semibold">{r.rotation_target_symbol}</span>
                    <span className="text-[#6a6a6a]"> · score {r.rotation_target_score}{r.rotation_reason === "same_sector" ? " · same sector" : ""}</span>
                  </span>
                )}
                {r.rotation_buy_qty != null && r.rotation_freed_inr != null && (
                  <span className="px-2 py-1 rounded bg-[#0d0d0d] border border-[#1f1f1f] text-[#d5d5d5]">
                    sell {r.rotation_sell_qty} → <span style={{ color: GREEN }}>{INR(r.rotation_freed_inr)}</span> → buy ~{r.rotation_buy_qty} @ {INR(r.rotation_buy_price ?? 0)}
                  </span>
                )}
                {r.user_decision && (
                  <span className="px-2 py-1 rounded bg-[#0d0d0d] border border-[#1f1f1f] font-semibold uppercase tracking-wide text-[10px]" style={{ color: r.user_decision === "accept" ? GREEN : RED }}>
                    you {r.user_decision === "accept" ? "accepted ✓" : "declined ✗"}
                  </span>
                )}
              </div>
            </div>
          )}

          {t && (
            <div className="rounded-lg border p-3" style={{ borderColor: agree ? "#1f1f1f" : `${AMBER}55`, background: agree ? "#111" : `${AMBER}0a` }}>
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-[9px] text-[#6a6a6a] uppercase tracking-wide">v2 thesis · 12-month · shadow</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: THESIS_META[t.action].color }}>{t.action}</span>
                <span className="text-[11px] text-[#8a8a8a]">quality <span className="text-[#e5e5e5] tabular-nums">{t.quality ?? "—"}</span></span>
                {!agree && <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: AMBER }}>disagrees with v1</span>}
              </div>
              {t.qty_delta !== 0 && <p className="text-[12px] text-[#d5d5d5] mb-1">{t.qty_delta > 0 ? "Buy" : "Sell"} {Math.abs(t.qty_delta)} of {r.quantity} → {t.target_weight_pct}% of book</p>}
              <p className="text-[12px] text-[#c5c5c5] leading-relaxed">{t.reason}.</p>
              <p className="text-[11px] text-[#c5b898] leading-relaxed mt-1"><span className="text-[#8a8a8a]">Flips if: </span>{t.falsifier}.</p>
            </div>
          )}

          {r.counter_case && (
            <div className="rounded border border-[#3a3320] bg-[#17140c] px-3 py-2">
              <p className="text-[9px] uppercase tracking-wide mb-1" style={{ color: AMBER }}>
                {v1Bucket(r.verdict) === "sell" ? "Bull case — what would make this sell wrong" : "Bear case — what would make this call wrong"}
              </p>
              <p className="text-[12px] text-[#c5b898] leading-relaxed">{r.counter_case}</p>
            </div>
          )}

          <details className="group">
            <summary className="text-[11px] text-[#8a8a8a] cursor-pointer list-none select-none flex items-center gap-1 hover:text-[#d5d5d5]">
              <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" /> Full reasoning &amp; indicators
            </summary>
            <ul className="space-y-1.5 mt-2">
              {(r.reasons ?? []).map((reason, i) => (
                <li key={i} className="text-[12px] text-[#c5c5c5] leading-relaxed flex gap-2">
                  <span className="mt-1.5 h-1 w-1 rounded-full bg-[#555] shrink-0" />{reason}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1.5 mt-3">
              <Metric label="trend" value={`${r.trend_score > 0 ? "+" : ""}${r.trend_score}`} color={r.trend_score > 0 ? GREEN : r.trend_score < 0 ? RED : MUTE} />
              <Metric label="conf" value={`${r.confidence}%`} />
              {r.indicators?.calibrated_confidence != null && (
                <Metric label="calib" value={`~${Math.round(r.indicators.calibrated_confidence)}%${r.indicators.calibration_low_n ? " ·low-n" : ""}`}
                  title="Measured hit-rate for this confidence bucket — DARK, not used for the verdict" />
              )}
              {r.trigger_type && <Metric label="type" value={r.trigger_type} color={r.trigger_type === "MACRO" ? "#a78bfa" : "#60a5fa"} />}
              {r.indicators?.rsi_14 != null && <Metric label="rsi" value={r.indicators.rsi_14.toFixed(0)} />}
              {r.indicators?.adx != null && <Metric label="adx" value={r.indicators.adx.toFixed(0)} />}
            </div>
            <p className="text-[11px] text-[#6a6a6a] mt-2">{m.blurb}</p>
          </details>
        </div>
      </div>
    </div>
  );
}

function SectorCard({ g, onOpen }: { g: SectorGroup; onOpen: (sym: string) => void }) {
  const diff = g.index_weight_pct != null ? g.my_weight_pct - g.index_weight_pct : null;
  const tilt = diff == null || g.my_weight_pct === 0 ? null : diff >= 3 ? "overweight" : diff <= -3 ? "underweight" : "in line";
  const n = g.mix.sell + g.mix.trim + g.mix.hold;
  const scale = Math.max(g.my_weight_pct, g.index_weight_pct ?? 0, 1);
  const trendColor = g.trend_median == null ? MUTE : g.trend_median > 15 ? GREEN : g.trend_median < -15 ? RED : AMBER;
  return (
    <div className="rounded-xl bg-[#111111] border border-[#1f1f1f] p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[13px] font-semibold text-[#f5f5f5]">{g.group}</span>
        {tilt && <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: tilt === "overweight" ? AMBER : tilt === "underweight" ? "#60a5fa" : MUTE }}>{tilt}</span>}
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: trendColor }}>trend {g.trend_median != null ? (g.trend_median > 0 ? "+" : "") + g.trend_median : "—"}</span>
      </div>
      <div className="mt-2 space-y-1 text-[10px] text-[#8a8a8a] tabular-nums">
        {[["you", g.my_weight_pct, "#e5e5e5"], ["index", g.index_weight_pct ?? 0, "#4a4a4a"]].map(([label, v, c]) => (
          <div key={label as string} className="flex items-center gap-2">
            <span className="w-9">{label}</span>
            <div className="flex-1 h-1.5 rounded bg-[#1a1a1a] overflow-hidden"><div className="h-full rounded" style={{ width: `${((v as number) / scale) * 100}%`, background: c as string }} /></div>
            <span className="w-10 text-right text-[#c5c5c5]">{(v as number).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      {n > 0 && (
        <div className="mt-2.5">
          <div className="flex h-1.5 rounded overflow-hidden">
            <div style={{ width: `${(g.mix.sell / n) * 100}%`, background: RED }} />
            <div style={{ width: `${(g.mix.trim / n) * 100}%`, background: AMBER }} />
            <div style={{ width: `${(g.mix.hold / n) * 100}%`, background: GREEN }} />
          </div>
          <p className="text-[10px] text-[#7a7a7a] mt-1 tabular-nums">
            {n} names: <span style={{ color: RED }}>{g.mix.sell} sell</span> · <span style={{ color: AMBER }}>{g.mix.trim} trim</span> · <span style={{ color: GREEN }}>{g.mix.hold} hold</span>
            {g.quality_median != null && <> · quality {g.quality_median}</>}
            {g.gnpa_median != null && <> · GNPA {g.gnpa_median}%</>}
            {g.nnpa_median != null && <> · NNPA {g.nnpa_median}%</>}
          </p>
        </div>
      )}
      {g.held.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {g.held.map((h) => (
            <button key={h.symbol} type="button" onClick={() => onOpen(h.symbol)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[#0d0d0d] border hover:border-[#444]"
              style={{ borderColor: `${h.verdict ? VERDICT_META[h.verdict]?.color ?? MUTE : MUTE}55` }}>
              <span className="text-[#e5e5e5] font-medium">{h.symbol}</span>
              {h.verdict && <span style={{ color: VERDICT_META[h.verdict]?.color ?? MUTE }}> {VERDICT_META[h.verdict]?.label ?? h.verdict}</span>}
              {h.weight_pct != null && <span className="text-[#6a6a6a]"> {h.weight_pct}%</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdvisorPage() {
  const router = useRouter();
  const { isConnected, hydrated, hydrateFromStorage } = useAppStore();
  const [rows, setRows] = useState<Advice[] | null>(null);
  const [runDate, setRunDate] = useState<string | null>(null);
  const [runAt, setRunAt] = useState<string | null>(null);
  const [isOfficial, setIsOfficial] = useState<boolean | null>(null);
  const [track, setTrack] = useState<TrackRecord | null>(null);
  const [risk, setRisk] = useState<PortfolioRisk | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [thesisTrack, setThesisTrack] = useState<ThesisTrack | null>(null);
  const [heroPicks, setHeroPicks] = useState<HeroPicks | null>(null);
  const [sectorView, setSectorView] = useState<SectorView | null>(null);
  const [showAllSectors, setShowAllSectors] = useState(false);
  // [P-45 provisional] which account's advice to show. Natwar's is a preview
  // blob from the brain (own token); Kanaklata's is the official record.
  const [account, setAccount] = useState<"primary" | "natwar">("primary");
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAllHolds, setShowAllHolds] = useState(false);
  const [diff, setDiff] = useState<{ priorRunDate: string | null; changes: { symbol: string; from: Advice["verdict"]; to: Advice["verdict"] }[]; newNames: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (hydrated && !isConnected) router.push("/connect"); }, [hydrated, isConnected, router]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = (await api.get(account === "natwar" ? "/advisor/natwar" : "/advisor")).data;
      setPreviewNote(r.preview ? (r.note ?? null) : null);
      setRows(r.rows ?? []); setRunDate(r.runDate ?? null);
      setRunAt(r.runAt ?? null); setIsOfficial(r.isOfficial ?? null);
      setRisk(r.portfolioRisk ?? null);
      setCalibration(r.calibration ?? null);
      setThesisTrack(r.thesisTrackRecord ?? null);
      setHeroPicks(r.heroPicks ?? null);
      setSectorView(r.sectorView ?? null);
      setDiff({ priorRunDate: r.priorRunDate ?? null, changes: r.changes ?? [], newNames: r.newNames ?? [] });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load advice"); }
    finally { setLoading(false); }
    if (account !== "primary") { setTrack(null); return; }
    try {
      const t = (await api.get("/advisor/track-record")).data;
      if (typeof t?.evaluatedCalls === "number") setTrack(t);
    } catch { /* track record is additive — never blocks the page */ }
  }, [account]);
  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);
  useRefreshOnVisible(load);

  const regimeKey = rows && rows.length > 0 ? rows[0].market_regime ?? null : null;
  const regime = regimeKey ? REGIME_META[regimeKey] : null;
  // Decision-first ordering: moves (sell/trim, biggest ₹ first), then the
  // rest of the book. Every holding appears exactly once.
  const changeNote = useCallback((sym: string): string | null => {
    if (!diff?.priorRunDate) return null;
    if (diff.newNames.includes(sym)) return "new";
    const c = diff.changes.find((x) => x.symbol === sym);
    return c ? `was ${VERDICT_META[c.from]?.label ?? c.from}` : null;
  }, [diff]);
  const { moves, holdsChanged, holdsSame } = useMemo(() => {
    const all = rows ?? [];
    const rank = (r: Advice) => (r.verdict === "SELL" ? 0 : r.verdict === "SELL_ON_BOUNCE" ? 1 : 2);
    const moves = all.filter(isMove).sort((a, b) => rank(a) - rank(b) || freedInr(b) - freedInr(a));
    const rest = all.filter((r) => !isMove(r)).sort((a, b) => (a.pnl_percent ?? 0) - (b.pnl_percent ?? 0));
    const changed = (r: Advice) => !diff?.priorRunDate || changeNote(r.symbol) != null || r.verdict === "INSUFFICIENT";
    return { moves, holdsChanged: rest.filter(changed), holdsSame: rest.filter((r) => !changed(r)) };
  }, [rows, diff, changeNote]);
  const order = useMemo(() => [...moves, ...holdsChanged, ...holdsSame], [moves, holdsChanged, holdsSame]);
  const selPos = selected ? order.findIndex((r) => r.symbol === selected) : -1;
  const selRow = selPos >= 0 ? order[selPos] : null;
  const closePanel = useCallback(() => setSelected(null), []);
  const prevPanel = useCallback(() => { if (selPos > 0) setSelected(order[selPos - 1].symbol); }, [order, selPos]);
  const nextPanel = useCallback(() => { if (selPos >= 0 && selPos < order.length - 1) setSelected(order[selPos + 1].symbol); }, [order, selPos]);
  const sellCount = moves.filter((r) => v1Bucket(r.verdict) === "sell").length;
  const trimCount = moves.length - sellCount;
  const freeTotal = moves.reduce((a, r) => a + freedInr(r), 0);
  const deployTotal = moves.reduce((a, r) => a + deployInr(r), 0);
  const buyCount = moves.filter((r) => r.rotation_target_symbol).length;
  const flipCount = diff?.priorRunDate ? diff.changes.length + diff.newNames.length : 0;
  const theses = (rows ?? [])
    .filter((r) => r.indicators?.thesis?.action)
    .map((r) => ({ symbol: r.symbol, qty: r.quantity, t: r.indicators!.thesis as Thesis }))
    .sort((a, b) => THESIS_META[a.t.action].order - THESIS_META[b.t.action].order || (a.t.quality ?? 0) - (b.t.quality ?? 0));
  const thesisCounts = theses.reduce<Record<string, number>>((acc, x) => { acc[x.t.action] = (acc[x.t.action] ?? 0) + 1; return acc; }, {});
  const thesisAsof = theses.map((x) => x.t.fundamentals_asof).filter(Boolean).sort().pop() ?? null;
  // Fundamentals older than 30 days (or results season passed) → nudge a refresh.
  const fundAgeDays = thesisAsof ? Math.floor((Date.now() - new Date(thesisAsof).getTime()) / 86_400_000) : null;

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] text-[#f5f5f5] overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 md:p-8">
        <div className="max-w-[1100px] w-full mx-auto">

          {/* ── header ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-[#f5f5f5]">Portfolio Advisor</h1>
              <p className="text-xs text-[#8a8a8a] mt-1">
                <span className="hidden sm:inline">Daily hold/sell read on your long-term holdings — direction first, entry price is sunk cost</span>
                {runAt ? (
                  <><span className="hidden sm:inline"> · </span>updated <span className="text-[#c5c5c5]">
                    {new Date(runAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST
                  </span>
                  {isOfficial === false ? <span className="text-[#6a6a6a]"> (intraday refresh)</span> : null}</>
                ) : runDate ? <><span className="hidden sm:inline"> · </span>run <span className="text-[#c5c5c5]">{runDate}</span></> : null}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex rounded-lg border border-[#1f1f1f] bg-[#111111] overflow-hidden text-xs min-h-[40px]">
                {([["primary", "Kanaklata"], ["natwar", "Natwar"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setAccount(k)}
                    className={`px-3 ${account === k ? "bg-[#1f1f1f] text-[#f5f5f5]" : "text-[#8a8a8a] hover:text-[#f5f5f5]"} transition-colors`}>
                    {label}{k === "natwar" && <span className="ml-1 text-[9px] text-[#f59e0b]">preview</span>}
                  </button>
                ))}
              </div>
              <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#aaa] bg-[#111111] border border-[#1f1f1f] hover:text-[#f5f5f5] hover:border-[#333] transition-colors min-h-[40px]">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>
          {account === "natwar" && (
            <div className="mb-3 p-3 rounded-lg border border-[#f59e0b]/20 bg-[#f59e0b]/5 text-[11px] text-[#f59e0b] leading-relaxed">
              Natwar&apos;s account — preview only: same advisor on his holdings, under his own token, kept apart from the main record. Not graded, no Telegram digest.
              {previewNote ? <> {previewNote}</> : null}
            </div>
          )}
          <div className="mb-4" />

          {error && <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-sm rounded-xl p-4 mb-6">{error}</div>}
          {!rows && loading && (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl bg-[#111]" />
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl bg-[#111]" />)}
            </div>
          )}

          {rows && rows.length === 0 && <StockLookup />}
          {rows && rows.length === 0 && (
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6">
              <div className="flex items-center gap-2 mb-2"><Compass className="w-4 h-4 text-[#888]" /><h3 className="text-sm font-semibold text-[#f5f5f5]">No advice yet</h3></div>
              <p className="text-[12px] text-[#8a8a8a] leading-relaxed">
                The advisor runs automatically once per day after <span className="text-[#f5f5f5] font-mono">09:45 IST</span> (past the opening-bell noise) whenever a live enctoken exists — independent of trading sessions. Paste today&apos;s token and the analysis appears here within a few minutes.
              </p>
            </div>
          )}

          {rows && rows.length > 0 && (
            <div className="space-y-5">

              {/* ── DECISION SUMMARY ─────────────────────────────────── */}
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <StatTile label="Sell" value={String(sellCount)} sub={trimCount ? `+ ${trimCount} trim` : "no trims"} color={sellCount ? RED : "#5a5a5a"} />
                  <StatTile label="Buy" value={String(buyCount)} sub="rotation targets" color={buyCount ? GREEN : "#5a5a5a"} />
                  <StatTile label="Free → deploy" value={INR(Math.round(freeTotal / 1000)) + "k"} sub={`→ ${INR(Math.round(deployTotal / 1000))}k into buys`} />
                  <StatTile label="Changed" value={String(flipCount)} sub={diff?.priorRunDate ? `vs ${diff.priorRunDate}` : "no prior run"} color={flipCount ? "#60a5fa" : "#5a5a5a"} />
                </div>
                {fundAgeDays != null && fundAgeDays > 30 && (
                  <p className="text-[11px] mt-3" style={{ color: AMBER }}>
                    Fundamentals are {fundAgeDays} days old (as of {thesisAsof}) — paste fresh Screener exports and run scripts/ingest_fundamentals.py. Quality scores go stale at 45 days.
                  </p>
                )}
                {regime && (
                  <p className="text-[11px] text-[#8a8a8a] mt-3 flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" style={{ background: `${regime.color}1a`, color: regime.color }}>{regime.label}</span>
                    {regime.blurb}
                  </p>
                )}
              </div>

              {/* ── MOVES TODAY: sell → buy pairs ─────────────────────── */}
              {moves.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#7a7a7a] uppercase tracking-wide mb-2">Moves today · tap for why</p>
                  <div className="grid gap-2.5 md:grid-cols-2">
                    {moves.map((r) => <MoveCard key={r.symbol} r={r} note={changeNote(r.symbol)} onOpen={() => setSelected(r.symbol)} />)}
                  </div>
                  {account === "primary" && heroPicks && heroPicks.picks.length > 0 && (
                    <p className="text-[11px] text-[#8a8a8a] mt-2.5">
                      Spare cash? Contrarian ideas:{" "}
                      {heroPicks.picks.map((p, i) => (
                        <span key={p.symbol}>{i > 0 && " · "}<a href="#contrarian" className="text-[#22c55e] font-semibold hover:underline">{p.symbol}</a></span>
                      ))}
                    </p>
                  )}
                </div>
              )}

              {/* ── REST OF BOOK: tile grid ──────────────────────────── */}
              {(holdsChanged.length > 0 || holdsSame.length > 0) && (
                <div>
                  <p className="text-[10px] text-[#7a7a7a] uppercase tracking-wide mb-2">{moves.length ? "Rest of book" : "Holdings"} · tap a tile</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
                    {[...holdsChanged, ...(showAllHolds ? holdsSame : [])].map((r) => (
                      <HoldingTile key={r.symbol} r={r} note={changeNote(r.symbol)} onOpen={() => setSelected(r.symbol)} />
                    ))}
                  </div>
                  {holdsSame.length > 0 && (
                    <button type="button" onClick={() => setShowAllHolds((v) => !v)}
                      className="mt-2.5 w-full text-[12px] text-[#8a8a8a] hover:text-[#e5e5e5] bg-[#111111] border border-[#1f1f1f] rounded-xl py-2.5 flex items-center justify-center gap-1.5">
                      {showAllHolds ? "Hide unchanged holds" : `${holdsSame.length} holds, no change`}
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllHolds ? "rotate-180" : ""}`} />
                    </button>
                  )}
                </div>
              )}

              {/* ── SECTORS: your weight vs index, trend, mix ─────────── */}
              {sectorView && sectorView.groups.length > 0 && (() => {
                const held = sectorView.groups.filter((g) => g.my_weight_pct > 0);
                const shownGroups = showAllSectors ? sectorView.groups : held;
                return (
                  <div>
                    <p className="text-[10px] text-[#7a7a7a] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <PieChart className="w-3 h-3" /> Sectors · you vs Nifty-500 · {sectorView.scan_date ? `scan ${sectorView.scan_date}` : "holdings only"}
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {shownGroups.map((g) => (
                        <SectorCard key={g.group} g={g} onOpen={(sym) => { if (order.some((r) => r.symbol === sym)) setSelected(sym); }} />
                      ))}
                    </div>
                    {sectorView.groups.length > held.length && (
                      <button type="button" onClick={() => setShowAllSectors((v) => !v)}
                        className="mt-2.5 w-full text-[12px] text-[#8a8a8a] hover:text-[#e5e5e5] bg-[#111111] border border-[#1f1f1f] rounded-xl py-2.5 flex items-center justify-center gap-1.5">
                        {showAllSectors ? "Only sectors you hold" : `All ${sectorView.groups.length} sectors`}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllSectors ? "rotate-180" : ""}`} />
                      </button>
                    )}
                    <p className="text-[10px] text-[#5a5a5a] mt-2">Display only — sector strength does not change any verdict yet. Index weight = share of Nifty-500 market cap. Trend = median advisor trend score of the sector&apos;s names.</p>
                  </div>
                );
              })()}

              <StockLookup />

              {/* ── THESIS ENGINE (shadow, P-47) ─────────────────────── */}
              {theses.length > 0 && (
                <Section icon={FlaskConical} title="Thesis engine · shadow · 12-month"
                  note={`${["EXIT", "TRIM", "ADD", "HOLD"].filter((a) => thesisCounts[a]).map((a) => `${thesisCounts[a]} ${a.toLowerCase()}`).join(" · ")} · fundamentals ${thesisAsof ? `as of ${thesisAsof}` : "not pasted yet"}`}>
                  <p className="text-[11px] text-[#8a8a8a] leading-relaxed mb-3">
                    Advisor v2, running <span className="text-[#e5e5e5]">beside</span> the verdicts above, not instead of them. One 12-month action per holding from business quality (Screener fundamentals), position size and a loss budget:
                    max <span className="text-[#e5e5e5]">−20%</span> from cost unless the business is intact · max <span className="text-[#e5e5e5]">10%</span> in one name · max <span className="text-[#e5e5e5]">25%</span> in one sector. Graded on its own at 6 and 12 months; it earns promotion only by clearing the pre-registered bar.
                  </p>
                  <div className="space-y-2">
                    {theses.map(({ symbol, qty, t }) => (
                      <div key={symbol} className="rounded-lg bg-[#0d0d0d] border border-[#1f1f1f] p-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                          <span className="font-semibold text-[#f5f5f5] w-24">{symbol}</span>
                          <span className="font-semibold uppercase tracking-wide text-[11px]" style={{ color: THESIS_META[t.action].color }}>{t.action}</span>
                          {t.qty_delta !== 0 && (
                            <span className="text-[#d5d5d5]">{t.qty_delta > 0 ? "buy" : "sell"} <span className="tabular-nums">{Math.abs(t.qty_delta)}</span> of {qty} → {t.target_weight_pct}% of book</span>
                          )}
                          <span className="text-[#8a8a8a]">quality <span className="text-[#e5e5e5] tabular-nums">{t.quality ?? "—"}</span></span>
                          {t.confidence === "low" && <span className="text-[10px] uppercase tracking-wide" style={{ color: AMBER }}>no fundamentals</span>}
                          {t.fundamentals_asof && !t.fundamentals_fresh && <span className="text-[10px] uppercase tracking-wide" style={{ color: AMBER }}>stale data</span>}
                        </div>
                        <p className="text-[12px] text-[#c5c5c5] leading-relaxed mt-1.5">{t.reason}.</p>
                        <p className="text-[11px] text-[#c5b898] leading-relaxed mt-1"><span className="text-[#8a8a8a]">Flips if: </span>{t.falsifier}.</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#8a8a8a] leading-relaxed mt-3">
                    {thesisTrack?.h126?.n || thesisTrack?.h252?.n ? (
                      <>Track record (graded {thesisTrack.graded_at}): 6-month {thesisTrack.h126?.n ?? 0} calls, hit {thesisTrack.h126?.hit_rate != null ? Math.round(thesisTrack.h126.hit_rate * 100) : "—"}%, t {thesisTrack.h126?.fm_t ?? "—"} · 12-month {thesisTrack.h252?.n ?? 0} calls, hit {thesisTrack.h252?.hit_rate != null ? Math.round(thesisTrack.h252.hit_rate * 100) : "—"}%, t {thesisTrack.h252?.fm_t ?? "—"} · bar |t| ≥ {thesisTrack.threshold}.</>
                    ) : (
                      <>No thesis has matured yet — the first 6-month read lands ~May 2027. Fundamentals come from a Screener.in paste (<span className="text-[#e5e5e5]">scripts/ingest_fundamentals.py</span>); names without one are judged on price and the loss budget alone.</>
                    )}
                  </p>
                </Section>
              )}

              {/* ── HERO PICKS (contrarian sleeve) ──────────────────── */}
              {account === "primary" && heroPicks && (
                <div id="contrarian" className="scroll-mt-4">
                <Section icon={Anchor} title="Contrarian picks · 10–20% sleeve"
                  note={`${heroPicks.picks.length} pass all four gates · ${heroPicks.near_misses.length} miss one · screened ${heroPicks.n_screened} · as of ${heroPicks.asof}`}>
                  <p className="text-[11px] text-[#8a8a8a] leading-relaxed mb-3">
                    Separate from the holdings above: names the market is <span className="text-[#e5e5e5]">against</span> (≥35% off the 3-yr high or ≥25pt behind Nifty) whose balance sheet says it is overdone — net cash, ROCE ≥ 15 / Piotroski ≥ 6, no pledge — and that have stopped making new lows. Ranked by earnings yield, net cash and EV/EBITDA; max 2 per sector. Not graded yet; entries are logged for a 12-month read.
                  </p>
                  <div className="space-y-2">
                    {[...heroPicks.picks, ...heroPicks.near_misses].map((p, i) => {
                      const pass = !p.failed || p.failed.length === 0;
                      const netCash = p.net_cash_pct_mcap ?? null;
                      return (
                        <div key={p.symbol} className="rounded-lg bg-[#0d0d0d] border border-[#1f1f1f] p-3" style={{ opacity: pass ? 1 : 0.75 }}>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                            <span className="font-semibold text-[#f5f5f5] w-28">{p.symbol}</span>
                            <span className="font-semibold uppercase tracking-wide text-[11px]" style={{ color: pass ? GREEN : AMBER }}>{pass ? "pick" : GATE_LABEL[p.failed![0]] ?? p.failed![0]}</span>
                            <span className="text-[#8a8a8a]">{p.sector}</span>
                            {i === heroPicks.picks.length && heroPicks.picks.length > 0 && <span className="ml-auto text-[10px] uppercase tracking-wide text-[#666]">near misses ↓</span>}
                          </div>
                          <p className="text-[12px] text-[#c5c5c5] leading-relaxed mt-1.5 tabular-nums">
                            <span className="text-[#8a8a8a]">off 3-yr high </span>{Math.round(p.dd_3y * 100)}%<span className="text-[#8a8a8a]"> · vs Nifty 3y </span>{p.rel_3y > 0 ? "+" : ""}{Math.round(p.rel_3y * 100)}pt<span className="text-[#8a8a8a]"> · 3m </span>{p.rel_3m > 0 ? "+" : ""}{Math.round(p.rel_3m * 100)}pt<span className="text-[#8a8a8a]"> · low </span>{p.low_age_days}d ago
                            <span className="text-[#8a8a8a]"> · P/E </span>{p.pe ?? "—"}<span className="text-[#8a8a8a]"> · net cash </span>{netCash != null ? `${netCash}%` : "—"}<span className="text-[#8a8a8a]"> of mcap · ROCE </span>{p.roce}<span className="text-[#8a8a8a]"> · Piotroski </span>{p.piotroski}{p.ev_ebitda != null && <><span className="text-[#8a8a8a]"> · EV/EBITDA </span>{p.ev_ebitda}</>}
                            {p.last_close != null && <><span className="text-[#8a8a8a]"> · last </span>{INR(p.last_close)}</>}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[#8a8a8a] leading-relaxed mt-3">
                    Refresh: monthly Screener paste → <span className="text-[#e5e5e5]">scripts/ingest_fundamentals.py</span> → <span className="text-[#e5e5e5]">scripts/hero_picks.py</span>. A pick is an idea for the contrarian sleeve, sized under the 10% single-name cap — not a verdict on anything you hold.
                  </p>
                </Section>
                </div>
              )}

              {track && track.evaluatedCalls > 0 && (
                <Section icon={History} title="Track record" note={`${track.evaluatedCalls} calls judged vs what happened next`}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <StatTile label="Hit rate" value={track.hitRatePct != null ? `${track.hitRatePct.toFixed(1)}%` : "—"} color={(track.hitRatePct ?? 0) >= 50 ? GREEN : RED} />
                    <StatTile label="Avg alpha vs Nifty" value={track.avgAlphaPct != null ? `${track.avgAlphaPct >= 0 ? "+" : ""}${track.avgAlphaPct.toFixed(2)}pp` : "—"} color={(track.avgAlphaPct ?? 0) >= 0 ? GREEN : RED} />
                    <StatTile label="Exit calls saved you" value={INR(track.adviceValueInr)} color={track.adviceValueInr >= 0 ? GREEN : RED} />
                  </div>
                </Section>
              )}

              {/* ── DEEPER ANALYTICS (collapsible) ──────────────────── */}
              {risk && (risk.concentration_flags.length > 0 || risk.tax_loss_harvest.length > 0 || risk.correlation) && (
                <Section icon={Layers} title="Portfolio-level risk" note="the whole book, not one name at a time">
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
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Network className="w-3.5 h-3.5 text-[#888]" />
                        <span className="text-[12px] text-[#f5f5f5] font-medium">
                          Effective bets: {risk.correlation.effective_bets} of {risk.correlation.names_covered}
                        </span>
                        <span className="text-[11px] text-[#6a6a6a]">{risk.correlation.lookback_days}-day return correlation</span>
                      </div>
                      <p className="text-[11px] text-[#8a8a8a] leading-relaxed mb-2">
                        Correlation-adjusted count of independent positions — names that move together collapse toward one bet, so the book is less diversified than the raw count suggests.
                      </p>
                      {risk.correlation.clusters.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {risk.correlation.clusters.map((c, i) => (
                            <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-[#f59e0b0d] text-[#e5e5e5]">
                              {c.symbols.join(" + ")}
                              <span className="text-[#6a6a6a]"> · corr {c.avg_corr.toFixed(2)} · {c.weight_pct}%</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {risk.tax_loss_harvest.length > 0 && (
                    <div className="border-t border-[#1f1f1f] pt-3">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Receipt className="w-3.5 h-3.5 text-[#22c55e]" />
                        <span className="text-[12px] text-[#f5f5f5] font-medium">
                          Tax-loss harvest: {INR(risk.harvestable_loss_inr)} in realizable losses
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8a8a8a] leading-relaxed mb-2">
                        Weak names already flagged to exit — selling books these losses to offset capital gains elsewhere. Short- vs long-term treatment depends on how long you&apos;ve held.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {risk.tax_loss_harvest.map((h) => (
                          <span key={h.symbol} className="text-[11px] px-2 py-0.5 rounded-md bg-[#22c55e0d] text-[#e5e5e5]">
                            {h.symbol} <span className="text-[#ef4444]">{INR(-Math.abs(h.unrealized_loss_inr))}</span>
                            <span className="text-[#6a6a6a]"> · {h.verdict}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>
              )}

              {calibration && calibration.graded_calls > 0 && (
                <Section icon={Gauge} title="Confidence calibration" note={<span className="text-[10px] px-1.5 py-0.5 rounded bg-[#f59e0b0d] text-[#f59e0b] uppercase tracking-wide">Dark · not used</span>}>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] mb-3">
                    <span className="text-[#8a8a8a]">Base rate <span className="text-[#e5e5e5]">{calibration.base_rate_pct}%</span></span>
                    <span className="text-[#8a8a8a]">Calibration error <span className="text-[#e5e5e5]">{calibration.ece_pct}pp</span></span>
                    <span className="text-[#8a8a8a]">Reliable? {calibration.monotonic
                      ? <span className="text-[#22c55e]">monotonic ✓</span>
                      : <span className="text-[#f59e0b]">not monotonic — unusable yet</span>}</span>
                    <span className="text-[#6a6a6a]">n={calibration.graded_calls}</span>
                  </div>
                  {/* mobile-safe reliability rows: label + n on top, bar + numbers below */}
                  <div className="space-y-2.5">
                    {calibration.bins.map((b) => (
                      <div key={b.label}>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-[#c5c5c5] tabular-nums font-medium">{b.label} <span className="text-[#6a6a6a] font-normal">· n={b.n}{b.low_n ? " · low-n" : ""}</span></span>
                          <span className="text-[#8a8a8a] tabular-nums">pred {b.predicted_pct}% · <span className="text-[#e5e5e5]">emp {b.empirical_hit_pct}%</span> · calib {b.calibrated_pct}%</span>
                        </div>
                        <div className="relative h-2 rounded bg-[#1a1a1a] overflow-hidden">
                          <div className="h-full bg-[#3b82f6]" style={{ width: `${Math.min(100, Math.max(0, b.empirical_hit_pct))}%` }} />
                          {/* predicted marker */}
                          <span className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[#e5e5e5]/70" style={{ left: `calc(${Math.min(100, Math.max(0, b.predicted_pct))}% - 1px)` }} title={`predicted ${b.predicted_pct}%`} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#8a8a8a] leading-relaxed mt-3">
                    Bar = empirical hit-rate; the light tick = predicted confidence. A usable confidence needs the bar to rise with the tick (monotonic) on enough calls. <span className="text-[#e5e5e5]">Calibrated</span> is the empirical rate shrunk toward the base rate so small buckets don&apos;t mislead. Logged only — it never changes a verdict until it earns promotion.
                  </p>
                </Section>
              )}
            </div>
          )}
          <p className="text-[11px] text-[#5a5a5a] mt-6">Advisory only — nothing here places orders. Generated from daily-timeframe structure (EMA stack, momentum, ADX, swing levels) + your position economics.</p>
        </div>
      </main>
      {selRow && <DetailPanel r={selRow} pos={selPos} total={order.length} onClose={closePanel} onPrev={prevPanel} onNext={nextPanel} />}
    </div>
  );
}
