"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Crosshair, TriangleAlert, Table2, Grid3x3, RefreshCw } from "lucide-react";
import { resolveOrder, type Ladder } from "@/lib/exit-replay";

// ── Exit-Policy Frontier ─────────────────────────────────────────────────────
// Replays every fixed (take-profit T, stop S) policy against the path extremes
// the strategy actually walked, and asks whether ANY of them turns a profit.
// See app/api/autopsy/route.ts for the method and the ambiguity treatment.

type Row = { r: number; mfe: number; mae: number; risk: number; value: number; side: "LONG" | "SHORT"; date: string; ladder: Ladder | null };
type Truth = { stopChecked: number; stopAgree: number; tgtChecked: number; tgtAgree: number; noData: number };
type Meta = {
  n: number; dropped: number; days: number; firstDate: string | null; lastDate: string | null;
  withBars: number; barCoveragePct: number; truth: Truth;
};

const TARGETS = Array.from({ length: 15 }, (_, i) => 0.5 + i * 0.25);   // 0.50 → 4.00 R
const STOPS   = Array.from({ length: 12 }, (_, i) => 0.25 + i * 0.25);  // 0.25 → 3.00 R

const R2 = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(3) + "R";
const PCT = (n: number) => n.toFixed(1) + "%";

/** How far the still-unresolved trades could move a cell, either way. After
 *  phase 2 this is usually a few thousandths of an R — say so as a width, not
 *  as two numbers, because the width is the thing that shrank. */
const BAND = (c: { exp: number; expOther: number }) => {
  const w = Math.abs(c.exp - c.expOther);
  return w < 0.0005 ? "exact" : "±" + (w / 2).toFixed(3) + "R";
};

// Colour follows the data's actual job. When the surface straddles breakeven the
// job is POLARITY → diverging, red↔blue with a neutral midpoint pinned to zero.
// When every policy loses (so far, always) there is no polarity to encode: the
// job is MAGNITUDE → one hue, light→dark across the observed range. Forcing a
// zero-anchored diverging scale onto an all-negative range renders a flat wall
// of red and hides which policies are less bad — the structure that makes the
// chart worth having. The missing polarity is stated in words instead, by the
// verdict banner and the legend, where it cannot be missed.
const MID = [0x3a, 0x3a, 0x38];
const NEG = [[0x8c, 0x2f, 0x2f], [0xd0, 0x3b, 0x3b], [0xe6, 0x67, 0x67]]; // pole → near-mid
const POS = [[0x1c, 0x5c, 0xab], [0x2a, 0x78, 0xd6], [0x86, 0xb6, 0xef]];

function lerp(stops: number[][], a: number): string {
  const seg = Math.min(stops.length - 2, Math.floor(a * (stops.length - 1)));
  const f = a * (stops.length - 1) - seg;
  const c0 = stops[seg], c1 = stops[seg + 1];
  const ch = (i: number) => Math.round(c0[i] + (c1[i] - c0[i]) * f);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/** Diverging, t in [-1, 1], 0 = neutral midpoint. Used only when data straddles 0. */
function diverging(t: number): string {
  const arm = t < 0 ? NEG : POS;
  return lerp([MID, arm[2], arm[1], arm[0]], Math.min(1, Math.abs(t)));
}

/** Sequential red, a in [0, 1]: 0 = least bad (light), 1 = worst (dark). */
function sequential(a: number): string {
  return lerp([[0xf0, 0xa0, 0xa0], NEG[2], NEG[1], NEG[0]], Math.max(0, Math.min(1, a)));
}

type Cell = {
  tgt: number; stp: number; exp: number; ambigPct: number;
  /** trades where BOTH levels were touched — the population phase 2 works on */
  both: number;
  /** of those, ordered exactly by the 5-minute replay */
  resolved: number;
  /** one bar touched both levels; the sequence inside it is unknowable */
  intrabar: number;
  /** no archived bar covers the holding window */
  nodata: number;
  /** expectancy under the opposite assumption for the unresolved remainder */
  expOther: number;
};

/**
 * Replay one fixed exit policy across every trade. See route.ts for the four
 * cases. Phase 2 ([P-30]) splits the fourth: the extremes say both levels were
 * touched, and the 5-minute bars say which came first. Only the trades the
 * bars cannot order still ride on the optimistic/pessimistic assumption.
 */
function simulate(rows: Row[], tgt: number, stp: number, costPct: number, optimistic: boolean) {
  let sum = 0, sumOther = 0, both = 0, resolved = 0, intrabar = 0, nodata = 0;
  for (const row of rows) {
    // Counterfactual exits are gross, so they must be charged. The realized
    // leg (neither level touched) already carries its real costs in `r`.
    const costR = ((costPct / 100) * row.value) / row.risk;
    const hitT = row.mfe >= tgt;
    const hitS = row.mae <= -stp;
    let r: number, rOther: number;
    if (hitT && hitS) {
      both++;
      const order = resolveOrder(row.ladder, tgt, stp);
      if (order === "TARGET")      { resolved++; r = rOther = tgt - costR; }
      else if (order === "STOP")   { resolved++; r = rOther = -stp - costR; }
      else {
        if (order === "INTRABAR") intrabar++; else nodata++;
        r      = (optimistic ? tgt : -stp) - costR;
        rOther = (optimistic ? -stp : tgt) - costR;
      }
    }
    else if (hitT) { r = rOther = tgt - costR; }
    else if (hitS) { r = rOther = -stp - costR; }
    else           { r = rOther = row.r; }
    sum += r;
    sumOther += rOther;
  }
  const n = rows.length;
  return {
    exp: sum / n,
    expOther: sumOther / n,
    ambigPct: (100 * (intrabar + nodata)) / n,
    both, resolved, intrabar, nodata,
  };
}

export default function AutopsyPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [costPct, setCostPct] = useState(0.12);
  const [optimistic, setOptimistic] = useState(true);
  const [side, setSide] = useState<"ALL" | "LONG" | "SHORT">("ALL");
  const [asTable, setAsTable] = useState(false);
  const [hover, setHover] = useState<Cell | null>(null);

  useEffect(() => {
    fetch("/api/autopsy")
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else { setRows(d.rows); setMeta(d.meta); } })
      .catch((e) => setErr(String(e)));
  }, []);

  const view = useMemo(
    () => (rows ?? []).filter((r) => side === "ALL" || r.side === side),
    [rows, side]
  );

  const surface = useMemo<Cell[]>(() => {
    if (!view.length) return [];
    const out: Cell[] = [];
    for (const stp of STOPS)
      for (const tgt of TARGETS) {
        out.push({ tgt, stp, ...simulate(view, tgt, stp, costPct, optimistic) });
      }
    return out;
  }, [view, costPct, optimistic]);

  const best = useMemo(
    () => surface.reduce<Cell | null>((b, c) => (!b || c.exp > b.exp ? c : b), null),
    [surface]
  );

  const stats = useMemo(() => {
    if (!view.length) return null;
    const actual = view.reduce((s, r) => s + r.r, 0) / view.length;
    const cost = view.reduce((s, r) => s + ((costPct / 100) * r.value) / r.risk, 0) / view.length;
    const anyProfitable = surface.some((c) => c.exp > 0);
    return { actual, cost, grossActual: actual + cost, anyProfitable };
  }, [view, costPct, surface]);

  // The scale picks its own form from the data: diverging if breakeven is
  // actually inside the range, sequential magnitude if it isn't.
  const scale = useMemo(() => {
    if (!surface.length) return null;
    const vals = surface.map((c) => c.exp);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const straddles = hi > 0;
    const m = Math.max(Math.abs(lo), Math.abs(hi), 0.05);
    return {
      lo, hi, straddles,
      color: (v: number) =>
        straddles ? diverging(v / m) : sequential(hi === lo ? 0.5 : (hi - v) / (hi - lo)),
      // legend swatches, low → high
      swatch: (i: number, n: number) =>
        straddles ? diverging((-1 + (i / (n - 1)) * 2)) : sequential(1 - i / (n - 1)),
      leftLabel: straddles ? R2(-m) : R2(lo),
      rightLabel: straddles ? R2(m) : R2(hi),
    };
  }, [surface]);

  if (err)
    return (
      <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] text-[#f5f5f5] overflow-hidden">
        <Sidebar />
        <main className="flex-1 min-h-0 overflow-y-auto p-6"><p className="text-[#ef4444]">Failed to load: {err}</p></main>
      </div>
    );

  return (
    // The app shell scrolls inside <main>, never the body (see globals.css).
    // That needs BOTH halves of the contract, and this page had neither:
    //   h-dvh + overflow-hidden — pins the shell to the viewport. With
    //     min-h-dvh the container just grew with the content instead.
    //   min-h-0 on <main> — a flex item defaults to min-height:auto, so it
    //     refuses to shrink below its content and overflow-y-auto never
    //     activates. The page then ran past the viewport with nothing able to
    //     scroll it, so the bottom was unreachable.
    <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] text-[#f5f5f5] overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-5">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-[#3b82f6]" />
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">Exit-Policy Frontier</h1>
          </div>
          <p className="text-sm text-[#a1a1aa] max-w-3xl leading-relaxed">
            Of the money this strategy lost, how much was the <strong className="text-[#f5f5f5]">entries</strong> being
            wrong, how much the <strong className="text-[#f5f5f5]">exit rule</strong>, and how much
            plain <strong className="text-[#f5f5f5]">transaction costs</strong>? Every closed trade stores the best and
            worst unrealized R it ever reached, so every fixed take-profit/stop policy can be replayed against the paths
            the book actually walked — no historical data purchase required.
          </p>
        </header>

        {!rows || !stats || !best || !scale ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-[420px] w-full" />
          </div>
        ) : (
          <>
            {/* ── Verdict ───────────────────────────────────────────── */}
            <section
              className={`rounded-lg border p-4 ${
                stats.anyProfitable
                  ? "border-[#0ca30c]/40 bg-[#0ca30c]/5"
                  : "border-[#d03b3b]/40 bg-[#d03b3b]/5"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <TriangleAlert
                  className={`w-4 h-4 mt-0.5 shrink-0 ${stats.anyProfitable ? "text-[#0ca30c]" : "text-[#e66767]"}`}
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {stats.anyProfitable
                      ? `${surface.filter((c) => c.exp > 0).length} of ${surface.length} exit policies clear breakeven.`
                      : `None of the ${surface.length} exit policies clears breakeven.`}
                  </p>
                  <p className="text-xs text-[#a1a1aa] leading-relaxed">
                    At the best cell (T {best.tgt.toFixed(2)}R / S {best.stp.toFixed(2)}R) the 5-minute candle replay
                    orders <strong className="text-[#f5f5f5]">{best.resolved} of {best.both}</strong> trades that touched
                    both levels exactly, leaving {best.intrabar} intra-bar and {best.nodata} without bars. The remaining
                    assumption is worth <strong className="text-[#f5f5f5]">{BAND(best)}</strong> — so this is
                    an <strong className="text-[#f5f5f5]">{optimistic ? "optimistic" : "pessimistic"}</strong> reading of
                    a residual that small, not of the whole ambiguous bucket.
                    {!stats.anyProfitable && " The verdict does not turn on it."}
                  </p>
                </div>
              </div>
            </section>

            {/* ── Decomposition ─────────────────────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Realized", value: R2(stats.actual), sub: "what actually happened, net", tone: "#e66767" },
                { label: "Best achievable exit", value: R2(best.exp), sub: `T ${best.tgt.toFixed(2)}R / S ${best.stp.toFixed(2)}R · ${BAND(best)}`, tone: best.exp > 0 ? "#0ca30c" : "#e66767" },
                { label: "Cost drag", value: "−" + stats.cost.toFixed(3) + "R", sub: `${costPct}% round trip, per trade`, tone: "#eda100" },
                { label: "Realized, gross of cost", value: R2(stats.grossActual), sub: "the entries alone", tone: stats.grossActual > 0 ? "#0ca30c" : "#e66767" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-[#1f1f1f] bg-[#111111] p-3">
                  <p className="text-[11px] uppercase tracking-wide text-[#71717a]">{s.label}</p>
                  <p className="text-xl font-semibold tabular-nums mt-1" style={{ color: s.tone }}>{s.value}</p>
                  <p className="text-[11px] text-[#71717a] mt-0.5">{s.sub}</p>
                </div>
              ))}
            </section>

            {/* ── Controls ──────────────────────────────────────────── */}
            <section className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-[#1f1f1f] bg-[#111111] p-3">
              <label className="flex items-center gap-2.5 text-xs">
                <span className="text-[#a1a1aa] whitespace-nowrap">Round-trip cost</span>
                <input
                  type="range" min={0} max={0.3} step={0.01} value={costPct}
                  onChange={(e) => setCostPct(Number(e.target.value))}
                  className="w-32 accent-[#3b82f6]"
                  aria-label="Round-trip transaction cost, percent of position value"
                />
                <span className="tabular-nums w-10 text-[#f5f5f5]">{costPct.toFixed(2)}%</span>
              </label>

              <div className="flex items-center gap-1.5 text-xs" role="group" aria-label="Ambiguity resolution">
                <span className="text-[#a1a1aa]">Ambiguity</span>
                {([["Optimistic", true], ["Pessimistic", false]] as const).map(([l, v]) => (
                  <button
                    key={l} onClick={() => setOptimistic(v)} aria-pressed={optimistic === v}
                    className={`px-2 py-1 rounded border ${optimistic === v ? "border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10" : "border-[#1f1f1f] text-[#71717a]"}`}
                  >{l}</button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 text-xs" role="group" aria-label="Side filter">
                <span className="text-[#a1a1aa]">Side</span>
                {(["ALL", "LONG", "SHORT"] as const).map((s) => (
                  <button
                    key={s} onClick={() => setSide(s)} aria-pressed={side === s}
                    className={`px-2 py-1 rounded border ${side === s ? "border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10" : "border-[#1f1f1f] text-[#71717a]"}`}
                  >{s === "ALL" ? "All" : s === "LONG" ? "Long" : "Short"}</button>
                ))}
              </div>

              <button
                onClick={() => setAsTable((v) => !v)}
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#1f1f1f] text-[#71717a] text-xs ml-auto"
              >
                {asTable ? <Grid3x3 className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
                {asTable ? "Heatmap" : "Table"}
              </button>
            </section>

            {/* ── The surface ───────────────────────────────────────── */}
            <section className="rounded-lg border border-[#1f1f1f] bg-[#111111] p-4">
              <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-medium">
                  Expectancy per trade, by exit policy
                  <span className="text-[#71717a] font-normal"> — {view.length} trades over {meta?.days} sessions</span>
                </h2>
                {/* Legend: always present. The positive arm stays on screen even
                    when empty — its emptiness is the result. */}
                <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[10px] text-[#71717a]">
                  <span className="tabular-nums">{scale!.leftLabel}</span>
                  <div className="flex h-3 rounded overflow-hidden" aria-hidden>
                    {Array.from({ length: 21 }, (_, i) => (
                      <div key={i} className="w-2.5 h-full" style={{ background: scale!.swatch(i, 21) }} />
                    ))}
                  </div>
                  <span className="tabular-nums">{scale!.rightLabel}</span>
                  <span className="whitespace-nowrap sm:ml-1.5 sm:pl-1.5 sm:border-l border-[#1f1f1f]">
                    {scale!.straddles
                      ? "0 = breakeven · blue clears it"
                      : "whole range is below breakeven"}
                  </span>
                </div>
              </div>

              {asTable ? (
                <div className="overflow-x-auto">
                  <table className="text-xs tabular-nums border-collapse">
                    <caption className="sr-only">
                      Expectancy in R for each take-profit and stop combination
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="sticky left-0 bg-[#111111] text-left p-1.5 text-[#71717a] font-normal">Stop \ Target</th>
                        {TARGETS.map((t) => (
                          <th scope="col" key={t} className="p-1.5 text-[#71717a] font-normal">{t.toFixed(2)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {STOPS.map((s) => (
                        <tr key={s}>
                          <th scope="row" className="sticky left-0 bg-[#111111] text-left p-1.5 text-[#71717a] font-normal">{s.toFixed(2)}</th>
                          {TARGETS.map((t) => {
                            const c = surface.find((x) => x.tgt === t && x.stp === s)!;
                            return (
                              <td key={t} className={`p-1.5 text-right ${c === best ? "text-[#f5f5f5] font-semibold" : "text-[#a1a1aa]"}`}>
                                {c.exp.toFixed(3)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="inline-block min-w-full">
                    <div className="flex">
                      <div className="w-14 shrink-0" />
                      <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${TARGETS.length}, minmax(30px, 1fr))` }}>
                        {TARGETS.map((t) => (
                          <div key={t} className="text-[10px] text-[#71717a] text-center pb-1 tabular-nums">
                            {t % 1 === 0 || t % 0.5 === 0 ? t.toFixed(1) : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                    {STOPS.map((s) => (
                      <div key={s} className="flex items-stretch">
                        <div className="w-14 shrink-0 text-[10px] text-[#71717a] flex items-center justify-end pr-2 tabular-nums">
                          {s.toFixed(2)}
                        </div>
                        <div className="flex-1 grid" style={{ gridTemplateColumns: `repeat(${TARGETS.length}, minmax(30px, 1fr))` }}>
                          {TARGETS.map((t) => {
                            const c = surface.find((x) => x.tgt === t && x.stp === s)!;
                            const isBest = c === best;
                            return (
                              <div
                                key={t}
                                onMouseEnter={() => setHover(c)}
                                onMouseLeave={() => setHover(null)}
                                tabIndex={0}
                                onFocus={() => setHover(c)}
                                onBlur={() => setHover(null)}
                                role="img"
                                aria-label={`Target ${t.toFixed(2)}R, stop ${s.toFixed(2)}R: expectancy ${c.exp.toFixed(3)}R, ${c.resolved} of ${c.both} ambiguous trades resolved exactly, residual band ${BAND(c)}`}
                                className="relative h-7 outline-none"
                                style={{
                                  background: scale!.color(c.exp),
                                  // 2px surface gap between fills
                                  boxShadow: `inset 0 0 0 1px #111111${isBest ? ", 0 0 0 2px #f5f5f5" : ""}`,
                                  zIndex: isBest ? 2 : undefined,
                                }}
                              >
                                {isBest && (
                                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-[#f5f5f5] tabular-nums">
                                    {c.exp.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex mt-1.5">
                      <div className="w-14 shrink-0 text-[10px] text-[#71717a] text-right pr-2">stop R</div>
                      <div className="flex-1 text-[10px] text-[#71717a] text-center">take-profit R</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Hover readout — a fixed slot, so the grid never reflows on hover. */}
              <div className="mt-3 pt-3 border-t border-[#1f1f1f] text-xs min-h-[36px]">
                {hover ? (
                  <div className="flex flex-wrap gap-x-5 gap-y-1 tabular-nums">
                    <span className="text-[#a1a1aa]">Target <strong className="text-[#f5f5f5]">{hover.tgt.toFixed(2)}R</strong></span>
                    <span className="text-[#a1a1aa]">Stop <strong className="text-[#f5f5f5]">{hover.stp.toFixed(2)}R</strong></span>
                    <span className="text-[#a1a1aa]">Expectancy <strong style={{ color: hover.exp > 0 ? "#0ca30c" : "#e66767" }}>{R2(hover.exp)}</strong></span>
                    <span className="text-[#a1a1aa]">
                      Band <strong className="text-[#f5f5f5]">{BAND(hover)}</strong>
                      <span className="text-[#71717a]"> what the unresolved remainder can still move</span>
                    </span>
                    <span className="text-[#a1a1aa]">
                      Both levels touched <strong className="text-[#f5f5f5]">{hover.both}</strong>
                      {" → "}
                      <strong className="text-[#f5f5f5]">{hover.resolved}</strong> resolved
                      {" · "}
                      <strong className="text-[#f5f5f5]">{hover.intrabar}</strong> intra-bar
                      {" · "}
                      <strong className="text-[#f5f5f5]">{hover.nodata}</strong> no data
                    </span>
                  </div>
                ) : (
                  <span className="text-[#71717a]">
                    Hover or tab through a cell for its expectancy, how many trades the candle replay ordered exactly,
                    and how much the unresolved remainder can still move the number.
                    The outlined cell is the best policy on this surface.
                  </span>
                )}
              </div>
            </section>

            {/* ── Method ────────────────────────────────────────────── */}
            <section className="rounded-lg border border-[#1f1f1f] bg-[#111111] p-4 text-xs text-[#a1a1aa] space-y-2 leading-relaxed">
              <h2 className="text-sm font-medium text-[#f5f5f5] flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> How this is computed, and what it can&apos;t tell you
              </h2>
              <p>
                Each trade records <code className="text-[#f5f5f5]">mfe_r</code> (best unrealized R reached) and{" "}
                <code className="text-[#f5f5f5]">mae_r</code> (worst). For a policy (T, S): if only the target was
                reached the trade books <strong className="text-[#f5f5f5]">+T</strong>; if only the stop,{" "}
                <strong className="text-[#f5f5f5]">&minus;S</strong>; if neither, its real exit stands.
              </p>
              <p>
                <strong className="text-[#f5f5f5]">When a trade touched both</strong>, the extremes don&apos;t say which
                came first. The archived <strong className="text-[#f5f5f5]">5-minute candles</strong> do: whichever level
                a bar reaches first decides the trade, and a bar that already <em>opened</em> through a level reached it
                on its first tick.{" "}
                {meta && <><strong className="text-[#f5f5f5]">{meta.withBars}</strong> of {meta.n} trades ({PCT(meta.barCoveragePct)}) have
                bars covering their holding window.</>} The extremes stay the authority on <em>whether</em> a level was
                touched — bars only ever order two touches already known to have happened, so the replay can split the
                ambiguous bucket but never create or destroy one.
              </p>
              <p>
                <strong className="text-[#f5f5f5]">What is still unresolved,</strong> and why the bounds have not gone
                away: a single 5-minute bar whose high reached the target <em>and</em> whose low reached the stop cannot
                be ordered at this resolution, and some windows have no archived bar at all. The ambiguity is narrowed
                from hours to one bar, not eliminated. The optimistic/pessimistic toggle now governs only that
                remainder, and the hover readout reports it per cell as a band.
              </p>
              {meta?.truth && (meta.truth.stopChecked > 0 || meta.truth.tgtChecked > 0) && (
                <p>
                  <strong className="text-[#f5f5f5]">Ground truth:</strong> trades whose real exit was a clean stop or
                  target already know the answer, so the replay is held to them. Of{" "}
                  <strong className="text-[#f5f5f5]">{meta.truth.stopChecked}</strong> real{" "}
                  <code className="text-[#f5f5f5]">STOP_LOSS_HIT</code> trades with bars, the replay finds the 1.00R stop
                  touched in <strong className="text-[#f5f5f5]">{meta.truth.stopAgree}</strong>; of{" "}
                  <strong className="text-[#f5f5f5]">{meta.truth.tgtChecked}</strong> real{" "}
                  <code className="text-[#f5f5f5]">TARGET_HIT</code> trades, it finds the target touched in{" "}
                  <strong className="text-[#f5f5f5]">{meta.truth.tgtAgree}</strong>.
                  {!!meta.truth.noData && <> {meta.truth.noData} more had no bars and cannot be judged.</>}
                </p>
              )}
              <p>
                Counterfactual exits are <strong className="text-[#f5f5f5]">gross</strong>, so each is charged the
                round-trip cost above, scaled by that trade&apos;s own rupee risk (the book sizes by Kelly, so there is
                no single ₹-per-R). Realized legs already carry their true costs. Sample:{" "}
                <strong className="text-[#f5f5f5]">{meta?.n}</strong> closed trades with excursion data over{" "}
                <strong className="text-[#f5f5f5]">{meta?.days}</strong> sessions
                {meta?.firstDate && <> ({meta.firstDate} → {meta.lastDate})</>}
                {!!meta?.dropped && <>; {meta.dropped} dropped as unusable</>}.
              </p>
              <p className="text-[#71717a]">
                This is a diagnostic on the entries already taken. It is not gate #6 — it cannot tell you how these
                signals behave in regimes the book never traded.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
