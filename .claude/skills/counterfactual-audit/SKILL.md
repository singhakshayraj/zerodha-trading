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

```sql
select unnest(skip_reasons) reason, count(*) n
from brain_decisions
where created_at::date >= '2026-07-14'
  and skip_reasons::text like '%ENTRY_DEFERRED%'
group by 1 order by n desc;
```
For deferred BUY/SELL signals, estimate foregone outcome from the symbol's
same-day price path (candles table, 5minute) between decision time and close:
would the deferred entry have hit its stop or target first? Report rupees
foregone/saved per gate (HOURLY_PACE, SYMBOL_DAY_CAP, CONCURRENT_CAP,
DAILY_TRADE_BUDGET) — this prices what pacing costs in exchange for spread.

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
