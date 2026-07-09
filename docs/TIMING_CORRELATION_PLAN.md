# Timing Capture & Correlation — High-Level Plan

Status: **PARKED** (created 2026-07-10). Revisit after a few clean data days.

## Motivation

We currently store *what* the brain decided and *whether it worked*, but only
a thin slice of *when*. The hypothesis: **timing is a first-class causal factor**
— when a decision happens relative to the session, the market state, and our own
pipeline latency materially affects the outcome, independent of the signal
itself. Capturing exact timing and correlating it with outcomes (and with new
enriching information) should expose factors like "entries in the first 15
minutes lose", "decisions made on stale data slip more", "slow decision→order
latency correlates with worse fills".

Today we have: `decided_at`, `entry_time`, `exit_time`, `decision_to_order_ms`,
and the MFE/MAE path. That's a start, not a timeline.

## Pillar 1 — Capture the full decision/trade timeline

Record a precise, stage-by-stage timeline (ms) for every decision and trade,
instead of a couple of endpoints:

- `t_snapshot` — market-data snapshot time the decision was computed against
- `t_signal` — signal generated
- `t_decision` — decision row written (`decided_at`, exists)
- `t_order` — order placed
- `t_fill` — entry fill (`entry_time`, exists)
- `t_exit_signal` — exit condition detected
- `t_exit_fill` — exit fill (`exit_time`, exists)

Derive per-stage deltas (signal→order, order→fill, decision→exit). Store as a
`timeline` jsonb on the decision/trade rather than many columns.

## Pillar 2 — Derive timing features at decision time

Compute and store, alongside the 35 existing features, timing-relative context
that's cheap to derive but currently absent:

- **minutes_since_open** (session phase: open / mid / close)
- **minutes_to_close** (end-of-day compression)
- **minutes_to_event** — weekly/monthly expiry, results day (we already have
  `event_calendar.py`; expose the distance, not just the policy)
- **data_age_ms** — age of the candle/quote used vs the decision timestamp
  (staleness; retail feed has no tick data, so this is a real risk)
- **cycle_position** — which cycle number of the session, and position within
  the per-cycle trade cap
- **concurrency** — open positions and decisions-in-flight at that instant

## Pillar 3 — Correlate timing with outcomes ("understand the factor")

Analysis surface (extend the Insights page + offline queries):

- Win-rate / expectancy **bucketed** by each timing dimension
  (minutes-since-open, minutes-to-expiry, latency bucket, staleness bucket) —
  same treatment as the existing time-of-day chart, generalized.
- **Correlation** of each timing feature vs `r_multiple` (and vs MFE/MAE, to
  separate entry timing from exit timing).
- **Latency → slippage** link: does slow decision→order correlate with worse
  realized fill vs the intended price? (needs the Tier-2 slippage decomposition.)
- **Staleness → outcome**: do decisions on older data underperform?

## Pillar 4 — Causal / factor attribution (later)

Once the linked dataset is large enough (decision features + timeline + outcome
via the `trade_id` link):

- Feature-importance model (gradient boosting / permutation importance) over
  {signal features + timing features} → outcome, to rank timing factors against
  signal factors.
- Guard against confounding (session, regime, universe cell as controls).
- Feed findings back as dark-flag candidates (e.g. an "avoid first-15-min"
  or "reject stale-data" gate), validated the same counterfactual way as the
  existing flags.

## Storage sketch

- `brain_decisions.timeline` jsonb + timing feature keys folded into
  `indicators` (same pattern as the current analytics blocks).
- `trades` gains exit-side timeline fields (or a `timeline` jsonb).
- No new tables strictly required for Pillars 1–3; Pillar 4 may want a
  materialized training view.

## Dependencies / sequencing

- Builds on the Tier-1 capture already shipped (decision↔trade link, MFE/MAE,
  candle archive) — see [[paper-trading-project]].
- Pillar 3's latency→slippage needs Tier-2 **slippage decomposition**
  (intended vs fill price/bps), still pending.
- Needs calendar time: correlations are meaningless until we have many clean
  days across both universe cells and varied regimes.

## Open questions

- Clock source: brain wall-clock is fine for deltas; absolute cross-service
  timing (dashboard/DB) less so — decide if that matters.
- Retail feed has no tick data → `data_age_ms` is coarse (5-min bar
  granularity). Is that resolution enough to see a staleness effect?
- How much timeline detail is worth the write cost per decision (900+/day)?
  Likely capture full timeline only on *entries*, lighter on HOLDs.
