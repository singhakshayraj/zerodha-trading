# Exit-Policy Frontier (`/autopsy`)

**The question:** of the money this strategy lost, how much was the **entries**
being wrong, how much the **exit rule**, and how much plain **transaction
costs**?

Paper PF (≈0.31 cumulative) says the book loses. It does not say *which part*
loses, and that distinction decides what to do next: bad entries mean the
signal research was a dead end, bad exits mean the signal might be fine and the
harness is throwing it away, and dominant costs mean neither — it means the
trade frequency or the instrument is wrong.

Status: **shipped 2026-08-07** ([P-29], dashboard `a1997b0`). Phase 2 below is
designed and evidenced but not built.

---

## 1. The idea

Every closed trade already stores its path extremes in R:

- `mfe_r` — the best unrealized R the trade ever reached
- `mae_r` — the worst

That is enough to **replay any fixed exit policy** — take profit at +T, stop at
−S — against the paths the book really walked, without re-simulating the market
and **without the Kite historical data that gate #6 ([P-01]) is blocked on**.

Sweep T and S over a grid and you get a *surface* of expectancy. The surface
answers a question no single backtest does: **is there any exit rule at all
under which these entries make money?** If the answer is no, that is an
impossibility result about the entries — far stronger than "the current rule
loses".

> Note the direction of inference. Most tooling in this space searches the grid
> for the best parameters. This is built for the opposite purpose: to find out
> when **none** of them work, and to say so.

## 2. Method

For a policy (T, S), each trade falls into exactly one of four cases:

| `mfe_r` | `mae_r` | meaning | booked |
|---|---|---|---|
| ≥ T | > −S | only the target was reached | **+T** |
| < T | ≤ −S | only the stop was reached | **−S** |
| < T | > −S | neither was reached | its **real** exit |
| ≥ T | ≤ −S | **both** were reached | **ambiguous** — see below |

### The ambiguity, and why it is reported as two bounds

When a trade touched both levels, the extremes **do not record which came
first**. That is a genuine hole in the data, not a modelling choice, so the page
refuses to guess and reports both ends instead:

- **Optimistic** — every ambiguous trade is credited with hitting the target
  first. This is the most generous reading physically available.
- **Pessimistic** — every ambiguous trade is charged the stop.

The truth lies between them. This matters more than it sounds: because **even
the optimistic surface never crosses breakeven**, the headline verdict does not
depend on the one thing the data cannot tell us. No sequence of ticks could
have beaten it.

Per-cell ambiguity share is shown in the hover readout, so you can see exactly
how much of any given cell rests on the unknown.

### Costing

Counterfactual exits (+T, −S) are **gross**, so each is charged a round-trip
cost. Realized legs (the "neither" case) already carry their true costs, folded
into the paper fill price — they are not charged twice.

The cost is **per trade**, not a flat R: the book sizes by Kelly
(`risk_manager.calculate_position_size`), so there is no single ₹-per-R
constant. Each trade's charge is

```
cost_R = (cost_pct / 100) × entry_value / risk_rupees
```

where `risk_rupees = |pnl / r_multiple|`, recovered from the trade's own
arithmetic. The cost assumption is a **live dial** on the page (default 0.12%
round trip) rather than a baked-in guess, because the verdict is sensitive to
it — see below.

## 3. Results (2026-08-07, 541 trades / 12 sessions, 07-10 → 08-06)

At the default 0.12% round-trip cost:

| | per trade |
|---|---|
| Realized (net) | **−0.401R** |
| Best achievable exit policy (T 1.00R / S 0.25R) | **−0.219R** |
| Cost drag | **−0.239R** |
| Realized, gross of cost | **−0.162R** |

**None of the 180 policies clears breakeven** — under the *optimistic* bound.
Pessimistic best is −0.292R.

**Set the cost dial to 0 and 3 of 180 policies go positive**, best **+0.009R**.

That is the finding worth carrying:

> The entries are approximately a **coin flip**. Transaction costs are
> essentially the **entire** loss. The strategy is not mis-reading the market so
> much as paying to find that out 45 times a day.

**But do not read that as "just cut costs."** The round-trip cost at which the
best policy reaches breakeven is **≈0.0047%** (measured: +0.0013R at 0.004%,
−0.0025R at 0.006%) — about **1/25th** of the 0.12% actually paid, and a fifth
of the sell-side STT alone (0.025%). No achievable cost structure at this trade
frequency reaches it. A coin flip minus *any* real cost is still a loss; the
edge has to come from the entries.

Secondary reading: variation across the surface runs almost entirely **down the
rows** (stop width) and barely **across the columns** (target width). That is
the signature of no entry edge — when entries carry no directional information,
the only lever left is losing less per loss, and where you take profit stops
mattering.

**Caveat that limits all of the above:** this is a diagnostic on entries
*already taken*. It cannot speak to regimes the book never traded. That remains
gate #6's job.

## 4. What is built

| Path | What |
|---|---|
| `app/api/autopsy/route.ts` | Ships per-trade primitives (`r`, `mfe`, `mae`, `risk`, `value`, side, date). Drops rows where `mfe < mae` (physically impossible) or risk is unrecoverable; returns the drop count. |
| `app/autopsy/page.tsx` | Sweeps the 15×12 grid client-side, so the cost dial recomputes instantly. Verdict banner, four decomposition tiles, heatmap, hover readout, table view. |
| `components/layout/Sidebar.tsx` | Nav entry "Exit Frontier" (mobile row went 8 → 9 columns). |

**Controls:** cost dial (0–0.30%), optimistic/pessimistic, side filter
(all/long/short), heatmap ⇄ table.

**Chart-form note.** Colour follows the data's job. When the surface straddles
breakeven the job is *polarity* → diverging red↔blue pinned to zero. When every
policy loses there is no polarity to encode; the job is *magnitude* → one hue,
light→dark across the observed range. The first render used a zero-anchored
diverging scale over an all-negative range and produced a flat wall of red that
hid which policies were less bad — the whole point of the chart. The scale now
picks its form from the data, and the absent polarity is stated in words in the
banner and legend, where it cannot be missed.

**Verification done:** numbers cross-checked against independent SQL; page
rendered and inspected at 1440px and 390px; all controls probed (pessimistic
−0.292R, zero-cost 3/180 positive, short-only −0.196R); zero console errors;
build + typecheck clean.

---

## 5. Phase 2 — resolving the ambiguous cells by intra-trade candle replay

### Why it is worth doing

At the decisive cell (T 1.00R / S 0.25R) the two bounds sit **−0.219R vs
−0.337R**. That gap is entirely the ambiguity. Closing it turns a range into a
number, and the same machinery makes every cell exact.

### The data is there, and it was measured

`candles` holds **21,079 rows, 46 symbols, 11 trading days, 07-10 → 08-06** —
the same window as the frontier trades. Interval is **`5minute`** (the only
value present).

Coverage against the 541 frontier trades' holding windows:

| | trades |
|---|---|
| ≥ 1 bar inside `[entry_time, exit_time]` | **479** (88.5%) |
| ≥ 2 bars | 411 (76%) |
| average bars per window | 11.0 |

And, measured directly on the ambiguous set at the best cell:

| of the 51 ambiguous trades | count |
|---|---|
| **fully resolved** by 5-minute replay | **48** |
| still ambiguous *within a single bar* | 1 |
| no candle data in window | 2 |

**5-minute replay collapses ~94% of the ambiguity at the cell that decides the
verdict.** That is the case for building it.

### The residual, stated honestly

**A 5-minute bar cannot resolve ordering inside itself.** If one bar's `high`
reached the target *and* its `low` reached the stop, which came first is still
unknown — the ambiguity is not eliminated, it is **narrowed from the whole
holding period (hours) to a single 5-minute window**. The correct treatment is
therefore the same as today's, applied to a far smaller set: keep both bounds,
but compute them over only the trades that remain genuinely ambiguous.

Do not report a single number and call it exact. Report: *resolved exactly: N;
intra-bar ambiguous: M; no data: K* — and keep the optimistic/pessimistic
toggle governing M and K only.

### The algorithm

For each trade and each policy (T, S):

1. **Convert R levels to prices**, using the trade's own risk-per-share:

   ```
   rps      = |entry_price − stop_loss_price|
   LONG :  target_px = entry_price + T×rps,   stop_px = entry_price − S×rps
   SHORT:  target_px = entry_price − T×rps,   stop_px = entry_price + S×rps
   ```

   Skip trades with `rps <= 0` (degenerate stop) — they already fail the
   frontier's own filters.

2. **Walk the bars in `[entry_time, exit_time]` in `ts` order.** For each bar:
   - LONG: `hitT = high >= target_px`, `hitS = low <= stop_px`
   - SHORT: `hitT = low <= target_px`, `hitS = high >= stop_px`
3. **First bar where either fires decides the trade:**
   - only `hitT` → books **+T**
   - only `hitS` → books **−S**
   - **both in that same bar** → *intra-bar ambiguous*; fall back to the bounds
4. **No bar fires** → the trade's real exit stands (same as today's case 3).

A useful refinement for step 3: if the bar's `open` is already beyond one level,
that level was reached first — an open above the target (LONG) means the target
was hit at the bar's first tick. This resolves a further slice of the intra-bar
cases at zero cost. Apply it before falling back to bounds.

### Where it should live

**Precompute in the brain, not in the browser.** The grid is 180 policies × 541
trades × ~11 bars ≈ 1M bar-comparisons — fine as a batch job, too much to ship
to a phone on every dial change.

Suggested shape, matching existing conventions:

- A script `scripts/replay_exits.py` in the brain repo (alongside
  `label_decisions.py`, `pacing_cost.py`), run post-close.
- Write one row per (trade, T, S) resolution — or, far cheaper, one row per
  trade holding the **first-touch outcome per policy** as a compact jsonb, since
  most trades resolve identically across neighbouring cells.
- Cheapest viable version: store per trade the **first bar index at which each
  R level was first touched**, for a fixed ladder of levels (±0.25R … ±4.00R).
  That is ~30 small integers per trade and lets *any* (T, S) policy be resolved
  by comparison, with no re-replay. This is the recommended design — it makes
  the grid exact and keeps the page's instant recompute.
- The API route then serves those touch-indices alongside today's primitives,
  and the page prefers exact resolution wherever present, falling back to
  bounds only for intra-bar and no-data trades.

### Acceptance criteria

Phase 2 is done when:

1. The page reports, per cell, `resolved / intra-bar ambiguous / no data` counts.
2. The optimistic and pessimistic bounds are computed **only** over the
   unresolved remainder, so they visibly converge (expect the −0.219/−0.337 gap
   at the best cell to shrink to a few thousandths of an R).
3. The headline verdict is restated as an exact number plus a residual band, and
   whether it still holds is **re-checked, not assumed** — if exact resolution
   moves any cell above breakeven, that is a finding, and it goes to
   [PIPELINE.md](../PIPELINE.md) as an item.
4. A row is registered in [VERIFY.md](VERIFY.md) with the query that proves the
   replay agrees with the realized outcome on trades whose actual exit was a
   clean `STOP_LOSS_HIT` or `TARGET_HIT` — that is a free ground-truth check,
   and if the replay disagrees there, it is wrong.

Criterion 4 is the one that matters most: **the replay has a ground truth
available and must be held to it.** Trades that really did stop out or hit
target are cases where the answer is already known.

---

## 6. Beyond phase 2

Ordered by value, not effort:

- **Time-conditional exits.** The grid is fixed (T, S). The obvious extension is
  a time axis — does a stop that tightens after N minutes beat a fixed one?
  `TIME_STOP_WOULD_FIRE` counterfactuals already log where a time-stop would
  have cut, so the two analyses should be merged rather than built twice.
- **Per-regime surfaces.** Facet by `regime` / `market_context`. A book with no
  aggregate edge can still have one in a subset — though [P-21] already looked
  for exactly that in the entry features and found nothing that held
  out-of-sample, so treat a positive result here with matching suspicion and
  demand out-of-sample confirmation before believing it.
- **Cost sensitivity as a first-class readout.** The zero-cost result is the
  single most decision-relevant number on the page and is currently reachable
  only by dragging a slider. A small "breakeven cost" figure — *the round-trip
  cost at which the best policy hits zero* — would say it directly.

  **Measured on the current data: ≈0.0047%** (best expectancy is +0.0013R at
  0.004% and −0.0025R at 0.006%). That is roughly **1/25th of the 0.12%
  round-trip cost actually being paid**. The implication is much harsher than
  "trim costs": there is no realistic Indian intraday cost structure at this
  trade frequency that gets there — STT alone on the sell leg is 0.025%, five
  times the entire budget. **Nothing about the exit rule or the cost structure
  rescues this book; only a genuinely predictive entry would.**
- **Feed it back into live config.** If a policy is ever both profitable and
  stable across sessions, it becomes a `tunables` change ([REQ-030], live
  without redeploy) — but under the flag-enablement discipline in
  [VERIFY.md](VERIFY.md) §W: consistent across ≥2 sessions and ≥15 affected
  trades before anything flips.

## 7. What this page will never answer

It replays the trades the strategy **actually took**. It cannot tell you how
these signals behave in regimes the book never traded, and it cannot
manufacture entries that were never attempted. Selection is baked in: these are
the setups the signal engine chose to trade, on the days it ran.

That is gate #6's job ([P-01], blocked on the Kite ₹500 decision), and nothing
here substitutes for it. What this page does is make the gate-#6 question
sharper — because we now know the entries are ≈ break-even gross, the thing to
test historically is whether that holds up, and whether costs can be brought
under the ~0.115% threshold that makes any of it viable.
