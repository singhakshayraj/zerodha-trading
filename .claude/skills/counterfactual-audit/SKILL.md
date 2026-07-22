---
name: counterfactual-audit
description: Measure whether each dark flag (trend-tells gate, market direction, time-stop, re-entry cooldown) and the data-collection pacing would have helped or hurt, using real linked decision→trade outcomes. Run after each clean full-day session; output ranks flags by measured effect and says which (if any) is ready to enable.
---

# Counterfactual Audit — would the dark flags have made money?

Every decision row carries counterfactual annotations computed at decision
time (trend_tells, market_context, orb, level_snapshot, timing) and every
paced-out signal carries `ENTRY_DEFERRED:*` skip reasons. This audit joins
them to realized trade outcomes and answers: **which flag, if it had been ON,
would have improved the day — and is the effect stable enough to enable it?**

Prod project: `gilmuwmtdpjccibfhqtx`. Use `mcp__supabase__execute_sql`.
Restrict to clean data: `created_at::date >= '2026-07-14'` (first full-day
data-richness session) unless told otherwise.

## 1. Sample size gate

```sql
select count(*) closed, count(distinct created_at::date) days
from trades where status='CLOSED' and pnl is not null
and created_at::date >= '2026-07-14';
```
Under ~30 closed trades or <2 days: report the numbers, label every finding
LOW-CONFIDENCE, and do NOT recommend enabling anything.

## 2. Trend-tells gate effect

```sql
select (d.trend_tells->>'would_permit') permit,
       count(*) n, sum(t.pnl) pnl, avg(t.r_multiple) avg_r,
       sum(case when t.pnl > 0 then 1 else 0 end) wins
from brain_decisions d join trades t on t.id = d.trade_id
where t.status='CLOSED' and t.pnl is not null
  and d.trend_tells is not null
  and d.created_at::date >= '2026-07-14'
group by 1;
```
Gate helps if the `false` bucket (entries it would have BLOCKED) has clearly
negative pnl/avg_r. Compute: blocked-loser pnl saved vs blocked-winner pnl
missed.

## 3. Market-direction effect (strongest prior candidate)

```sql
select t.position_type,
       d.market_context->>'direction' mkt_dir,
       count(*) n, sum(t.pnl) pnl, avg(t.r_multiple) avg_r
from brain_decisions d join trades t on t.id = d.trade_id
where t.status='CLOSED' and t.pnl is not null
  and d.created_at::date >= '2026-07-14'
group by 1, 2 order by 1, 2;
```
The flag suppresses counter-direction entries (shorts in BULLISH tape,
longs in BEARISH). Sum the pnl of the trades it would have suppressed.

## 4. Time-stop counterfactual

```sql
select exit_reason, count(*) n, sum(pnl) pnl, avg(r_multiple) avg_r,
       avg(extract(epoch from (exit_time::timestamptz - entry_time::timestamptz))/60) avg_mins
from trades where status='CLOSED' and pnl is not null
  and created_at::date >= '2026-07-14'
group by 1 order by pnl;
```
Long-held losers (SESSION_END exits with negative pnl, high avg_mins) are
what a time-stop would cut. Note MFE: `mfe_r` high + pnl low = gave it back
(supports time-stop/trailing).

## 5. Pacing cost (data-richness gates)

`python3 scripts/pacing_cost.py <date> [<date> ...]` (zerodha-brain repo,
needs a venv with `requirements.txt` installed — no live token needed,
reads only `brain_decisions`/`decision_outcomes`/`trades`). For each
`ENTRY_DEFERRED:<reason>` decision, joins its Track C `decision_outcomes`
row (stop/target walked forward through the candle archive from decision
time to close — see `decision_outcomes.py`) and sums R by reason. Needs
`scripts/label_decisions.py <date>` run first if that date isn't labeled
yet (full-day queries there and here paginate around a PostgREST 1000-row
/ payload-size cap — don't drop the pagination if you touch either
script). Dates before the candle-archive fix (< 2026-07-15) label
NO_DATA and are excluded, reported separately.

**Known trap (fixed 2026-07-23, brain `6948767`):** for SELL decisions,
`brain_decisions.indicators.stop_loss/target` used to be logged in LONG
orientation (signal_engine's raw output) instead of the SHORT orientation
`_open_short` actually trades — corrupting every SHORT counterfactual
label since Track C shipped (07-15) into an auto-win. Real trades were
never affected, only the logged decision snapshot. If a future date's
SELL-side `decision_outcomes` looks too clean (~all `STOP_HIT`/`WIN` at
exactly `+1.000R`), that bug (or a regression of it) is back — check
`brain.py::_invert_for_short` is still wired into the decision-log path,
not just `_open_short`.

Rupee conversion is approximate: this system sizes via Kelly
(`risk_manager.calculate_position_size`), not a flat 1% of capital, so
there's no fixed ₹-per-R. The script uses each date's own realized avg
risk/trade (from `trades`) as the closest available estimate — R-multiples
are the exact number, ₹ is a rough overlay.

## 6. LIMIT_WOULD_STOP counterfactual

```sql
select data->>'marker' marker, data->>'trades' trades_at,
       data->>'total_pnl' pnl_at, created_at
from brain_activity
where activity_type='LIMIT_WOULD_STOP'
  and created_at::date >= '2026-07-14'
order by created_at;
```
Compare session P&L at each would-stop marker vs the session's final P&L:
did continuing past the old cap add or lose money? This is the direct
verdict on data-collection mode's trading effect (its DATA value is a given).

## 7. Report format

Table: flag/gate | trades affected | ₹ effect | avg R effect | verdict
(ENABLE / WAIT-more-data / SKIP). Only recommend ENABLE when the effect is
directionally consistent across ≥2 days AND ≥15 affected trades. Enablement
order on wins: MARKET_DIRECTION_ENABLED → trend-tells → TIME_STOP_ENABLED →
REENTRY_COOLDOWN_ENABLED — one flag at a time, one day of measurement
between flips (set env post-close only; brain redeploys mid-market are
forbidden). Append the day's verdict to docs/KNOWN_ISSUES.md watchlist or a
FLAG_ENABLEMENT_LOG section in docs/SESSION_HANDOFF.md.
