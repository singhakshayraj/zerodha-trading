"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Crosshair, TriangleAlert, Table2, Grid3x3, RefreshCw } from "lucide-react";

// ── Exit-Policy Frontier ─────────────────────────────────────────────────────
// Replays every fixed (take-profit T, stop S) policy against the path extremes
// the strategy actually walked, and asks whether ANY of them turns a profit.
// See app/api/autopsy/route.ts for the method and the ambiguity treatment.

type Row = { r: number; mfe: number; mae: number; risk: number; value: number; side: "LONG" | "SHORT"; date: string };
type Meta = { n: number; dropped: number; days: number; firstDate: string | null; lastDate: string | null };

const TARGETS = Array.from({ length: 15 }, (_, i) => 0.5 + i * 0.25);   // 0.50 → 4.00 R
const STOPS   = Array.from({ length: 12 }, (_, i) => 0.25 + i * 0.25);  // 0.25 → 3.00 R

const R2 = (n: number) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(3) + "R";
const PCT = (n: number) => n.toFixed(1) + "%";

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

type Cell = { tgt: number; stp: number; exp: number; ambigPct: number };

/** Replay one fixed exit policy across every trade. See route.ts for the cases. */
function simulate(rows: Row[], tgt: number, stp: number, costPct: number, optimistic: boolean) {
  let sum = 0, ambig = 0;
  for (const row of rows) {
    // Counterfactual exits are gross, so they must be charged. The realized
    // leg (neither level touched) already carries its real costs in `r`.
    const costR = ((costPct / 100) * row.value) / row.risk;
    const hitT = row.mfe >= tgt;
    const hitS = row.mae <= -stp;
    let r: number;
    if (hitT && hitS) { ambig++; r = (optimistic ? tgt : -stp) - costR; }
    else if (hitT)    { r = tgt - costR; }
    else if (hitS)    { r = -stp - costR; }
    else              { r = row.r; }
    sum += r;
  }
  return { exp: sum / rows.length, ambigPct: (100 * ambig) / rows.length };
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
        const { exp, ambigPct } = simulate(view, tgt, stp, costPct, optimistic);
        out.push({ tgt, stp, exp, ambigPct });
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
      <div className="flex min-h-dvh flex-col md:flex-row bg-[#0a0a0a] text-[#f5f5f5]">
        <Sidebar />
        <main className="flex-1 p-6"><p className="text-[#ef4444]">Failed to load: {err}</p></main>
      </div>
    );

  return (
    <div className="flex min-h-dvh flex-col md:flex-row bg-[#0a0a0a] text-[#f5f5f5]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">

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
                    {optimistic ? (
                      <>
                        This is the <strong className="text-[#f5f5f5]">optimistic</strong> bound — every trade that
                        touched both its target and its stop is credited with hitting the target first. The extremes
                        don&apos;t record which came first, so no ordering of ticks could beat this number.
                        {!stats.anyProfitable && " The result therefore does not depend on the one thing the data can't tell us."}
                      </>
                    ) : (
                      <>
                        This is the <strong className="text-[#f5f5f5]">pessimistic</strong> bound — every ambiguous
                        trade is charged the stop. The truth sits between this and the optimistic surface.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </section>

            {/* ── Decomposition ─────────────────────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Realized", value: R2(stats.actual), sub: "what actually happened, net", tone: "#e66767" },
                { label: "Best achievable exit", value: R2(best.exp), sub: `T ${best.tgt.toFixed(2)}R / S ${best.stp.toFixed(2)}R`, tone: best.exp > 0 ? "#0ca30c" : "#e66767" },
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
                                aria-label={`Target ${t.toFixed(2)}R, stop ${s.toFixed(2)}R: expectancy ${c.exp.toFixed(3)}R, ${c.ambigPct.toFixed(0)}% ambiguous`}
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
                      Ambiguous <strong className="text-[#f5f5f5]">{PCT(hover.ambigPct)}</strong>
                      <span className="text-[#71717a]"> of trades touched both levels</span>
                    </span>
                  </div>
                ) : (
                  <span className="text-[#71717a]">
                    Hover or tab through a cell for its expectancy and how much of it rests on ambiguous ordering.
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
                <strong className="text-[#f5f5f5]">The honest gap:</strong> when a trade touched both, the extremes
                don&apos;t say which came first — so the surface is reported as two bounds rather than one guess. Where
                the ambiguous share is small the bounds nearly coincide; the hover readout shows it per cell. Resolving
                it exactly needs intra-trade candle replay, which is the natural next step.
              </p>
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
