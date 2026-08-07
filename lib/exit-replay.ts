// ── Exit-frontier phase 2: intra-trade candle replay ─────────────────────────
// [P-30]. Phase 1 (see app/api/autopsy/route.ts) replays exit policies against
// mfe_r/mae_r — the best and worst unrealized R each trade reached. Those are
// EXTREMES, so when a policy's target AND stop were both touched they cannot
// say which came first, and the cell has to be reported as a range.
//
// The 5-minute `candles` archive can order those touches. This module turns a
// trade's bar window into a LADDER: for each R level, the index of the first
// bar that touched it. Two trades' ladders answer any (T, S) policy by a single
// integer comparison, which is what keeps the page's grid sweep instant — the
// alternative is re-walking ~1M bar-comparisons on every move of the cost dial.
//
// What this does NOT do: resolve ordering INSIDE one bar. If a single bar's
// high reached the target and its low reached the stop, the sequence within
// those five minutes is unknowable. The ambiguity is narrowed from hours to one
// bar, not eliminated — those trades stay on the optimistic/pessimistic bounds.
// See docs/reference/EXIT_FRONTIER.md §5.

/** R levels the ladder records: 0.25 → 4.00, the union of the grid's axes
 *  (TARGETS 0.50–4.00, STOPS 0.25–3.00). 16 levels ⇒ 4 small int arrays/trade. */
export const LEVELS = Array.from({ length: 16 }, (_, i) => (i + 1) * 0.25);

/** Level → ladder index. Levels are a 0.25 grid, so this is exact. */
export function levelIndex(r: number): number {
  return Math.round(r / 0.25) - 1;
}

export type Bar = { ts: number; o: number; h: number; l: number; c: number };

export type Ladder = {
  bars: number;
  /** first bar index whose range touched the favorable (target-side) level */
  up: (number | null)[];
  /** first bar index whose range touched the adverse (stop-side) level */
  dn: (number | null)[];
  /** first bar index whose OPEN alone was already at/through the level */
  upOpen: (number | null)[];
  dnOpen: (number | null)[];
};

export type Order = "TARGET" | "STOP" | "INTRABAR" | "NODATA";

/**
 * Build the first-touch ladder for one trade.
 *
 * `rps` is risk-per-share = |entry_price − stop_loss_price|, the trade's own R
 * denominator. The book sizes by Kelly, so there is no shared constant.
 * `bars` must be the trade's holding window, oldest first.
 */
export function buildLadder(
  side: "LONG" | "SHORT",
  entryPrice: number,
  rps: number,
  bars: Bar[]
): Ladder {
  const n = LEVELS.length;
  const mk = () => Array<number | null>(n).fill(null);
  const ladder: Ladder = { bars: bars.length, up: mk(), dn: mk(), upOpen: mk(), dnOpen: mk() };
  if (!(rps > 0) || !Number.isFinite(entryPrice)) return ladder;

  const long = side === "LONG";
  for (let b = 0; b < bars.length; b++) {
    const bar = bars[b];
    for (let k = 0; k < n; k++) {
      const off = LEVELS[k] * rps;
      const tgtPx = long ? entryPrice + off : entryPrice - off;
      const stpPx = long ? entryPrice - off : entryPrice + off;

      // Favorable side: LONG needs the high up to the target, SHORT the low down.
      if (ladder.up[k] === null && (long ? bar.h >= tgtPx : bar.l <= tgtPx)) ladder.up[k] = b;
      if (ladder.upOpen[k] === null && (long ? bar.o >= tgtPx : bar.o <= tgtPx)) ladder.upOpen[k] = b;

      // Adverse side, mirrored.
      if (ladder.dn[k] === null && (long ? bar.l <= stpPx : bar.h >= stpPx)) ladder.dn[k] = b;
      if (ladder.dnOpen[k] === null && (long ? bar.o <= stpPx : bar.o >= stpPx)) ladder.dnOpen[k] = b;
    }
  }
  return ladder;
}

/**
 * For a trade whose EXTREMES say policy (T, S) touched both levels, decide
 * which was reached first.
 *
 * Deliberately consulted only for that ambiguous case. mfe_r/mae_r are tracked
 * tick-by-tick by the brain and are the authority on WHETHER a level was
 * touched; the bars are a sampled, sometimes-incomplete view of the same path
 * (88.5% window coverage) and are used only to ORDER two touches already known
 * to have happened. That layering is why phase 2 cannot move a cell by
 * "discovering" or "losing" a touch — it can only split the ambiguous bucket.
 */
export function resolveOrder(ladder: Ladder | null | undefined, tgt: number, stp: number): Order {
  if (!ladder || ladder.bars === 0) return "NODATA";
  const it = ladder.up[levelIndex(tgt)];
  const is = ladder.dn[levelIndex(stp)];

  // The bars fail to show a touch the extremes recorded — the window is
  // partially covered, so this is missing evidence, not evidence of absence.
  if (it === null || is === null) return "NODATA";

  if (it < is) return "TARGET";
  if (is < it) return "STOP";

  // Same bar. One free refinement before giving up: if the bar OPENED already
  // through one level, that level was reached on its first tick.
  const openTgt = ladder.upOpen[levelIndex(tgt)] === it;
  const openStp = ladder.dnOpen[levelIndex(stp)] === it;
  if (openTgt && !openStp) return "TARGET";
  if (openStp && !openTgt) return "STOP";

  return "INTRABAR";
}
