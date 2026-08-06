---
name: post-session-check
description: End-of-day data-quality audit for the paper-trading brain + portfolio advisor. Run after every market session to verify every intended datapoint was captured, at the right quality, across both the trading engine and the advisor. Reports a pass/fail scorecard.
---

# Post-Session Data-Quality Check

Audit today's captured data in the prod Supabase project (`gilmuwmtdpjccibfhqtx`,
"zerodha-trader") and Railway logs (`zerodha-brain` service). Report a scorecard:
one row per check, PASS / WARN / FAIL, with the number that proves it.

Use `mcp__supabase__execute_sql` for queries. "Today" = `current_date` in IST —
if run after midnight IST, substitute the session date explicitly.

**Run this only AFTER market close (~10:00 UTC / 15:30 IST).** Auditing a live
session misreports — half the day's rows do not exist yet.

## 0. The VERIFY ledger — run this FIRST

[docs/reference/VERIFY.md](../../../docs/reference/VERIFY.md) is the list of
open checks that shipped fixes registered. **This is the point of the audit** —
the rest of the scorecard is standing hygiene, but these are the questions
someone is actually waiting on an answer to.

1. Run every check under **🔵 OPEN**, plus every **♾️ STANDING INVARIANT**.
2. Report each as **PASS / FAIL / NOT-YET** (no data to judge on) with the
   number that proves it.
3. Write the result back into VERIFY.md:
   - PASS → move it to **✅ PASSED** with the date + evidence, and move the
     matching item to Done in [PIPELINE.md](../../../docs/PIPELINE.md).
   - FAIL → leave it OPEN, record the failing number, and move the PIPELINE
     item back to **🟢 READY** with that number in the item.
   - NOT-YET → leave it, note why (e.g. zero stop-outs today).
4. Record the session's reading for each **👁️ WATCH** line. Never act on a
   single reading — the thresholds are written into each watch item.

A fix that shipped without a row in VERIFY.md is a gap: add one, or state
explicitly why it can't be checked from data.

## 1. Table freshness sweep

```sql
select 'trading_sessions' t, count(*) n, max(created_at)::text last from trading_sessions
union all select 'trades', count(*), max(created_at)::text from trades
union all select 'brain_decisions', count(*), max(created_at)::text from brain_decisions
union all select 'market_context', count(*), max(created_at)::text from market_context
union all select 'stock_universe', count(*), max(advisor_score_updated_at)::text from stock_universe
union all select 'brain_activity', count(*), max(created_at)::text from brain_activity
union all select 'quote_snapshots', count(*), max(captured_at)::text from quote_snapshots
union all select 'level_pack', count(*), max(computed_at)::text from level_pack
union all select 'candles', count(*), max(ts)::text from candles
union all select 'news_events', count(*), max(fetched_at)::text from news_events
union all select 'portfolio_advice', count(*), max(created_at)::text from portfolio_advice
union all select 'tradebook', count(*), max(executed_at)::text from tradebook
union all select 'inplay_list', count(*), max(locked_at)::text from inplay_list
union all select 'stock_profile', count(*), max(computed_at)::text from stock_profile;
```

PASS when every table the session touches has a `last` timestamp from today:
trading_sessions, trades, brain_decisions, market_context, brain_activity,
quote_snapshots, level_pack, candles, news_events (if collector keyed),
stock_universe (advisor scan), portfolio_advice.
Known-stale allowed (see §7): `tradebook` (only updates when REAL account
trades happen), `stock_profile` (dormant, 0 rows until activated).

## 2. Session outcome

```sql
select id, status, total_trades_executed, total_pnl, winning_trades,
       losing_trades, created_at
from trading_sessions order by created_at desc limit 1;
```

Record trades/P&L/W-L in the report. WARN if status is still RUNNING long
after 15:30 IST (EOD auto-close should have ended it).

## 3. Trade-row integrity

```sql
select count(*) total,
  count(*) filter (where entry_price is null and coalesce(exit_reason,'') <> 'ORDER_FAILED') bad_null_entry,
  count(*) filter (where status='OPEN' and stop_loss_price is null) open_null_stop,
  count(*) filter (where status='CLOSED' and exit_price is null and coalesce(exit_reason,'') <> 'ORDER_FAILED') bad_null_exit,
  count(*) filter (where status='CLOSED' and pnl is null) closed_null_pnl,
  count(*) filter (where status='OPEN') still_open
from trades where created_at::date = current_date;
```

PASS = all `bad_*` and `closed_null_pnl` are 0. `ORDER_FAILED` rows with
nulls are expected (order never filled). WARN if `still_open` > 0 after EOD
(shorts/longs should auto-close by 15:25).

## 4. Decision-log completeness

```sql
select count(*) total,
  count(*) filter (where price_at_decision is null) null_price,
  count(*) filter (where confidence_score is null) null_conf,
  count(*) filter (where indicators is null) null_ind,
  count(*) filter (where nifty_level_at_decision is null) null_nifty
from brain_decisions where created_at::date = current_date;
```

PASS = zero nulls on all four (every decision carries full context).
Note: BUY/SELL rows with null `trade_id` are fine — no-op signals log
without a trade.

## 5. Advisor capture (the /advisor page's data)

```sql
select count(*) rows_today,
  count(*) filter (where market_regime is null) null_regime,
  count(*) filter (where trigger_type is null and verdict <> 'INSUFFICIENT') null_trigger,
  count(*) filter (where verdict is null or trend_score is null) null_core,
  count(*) filter (where rotation_target_symbol is not null) rotations,
  count(*) filter (where rotation_target_symbol is not null and rotation_sell_qty is null) rotation_unsized,
  count(*) filter (where user_decision is not null) decisions_recorded,
  count(*) filter (where indicators = '{}'::jsonb and verdict <> 'INSUFFICIENT') empty_indicators
from portfolio_advice where run_date = current_date;
```

PASS = rows_today ≈ holdings count (currently 20), all null_*/unsized/empty
counts 0. `rotations` > 0 only when holdings are weak — 0 is not a failure.
Also confirm digest went out: `select value from app_config where
key='advisor_digest_date'` = today (only expected when something was
actionable). Cross-check the /advisor page loads these same rows (API reads
`portfolio_advice` directly, so DB-clean = page-clean; spot-open the page
if in doubt).

## 6. Backtest queue movement

```sql
select count(*) filter (where evaluated_at is null) queued,
       count(*) filter (where evaluated_at::date = current_date) judged_today
from portfolio_advice;
```

Informational: `queued` grows daily until rows hit their horizon (MICRO 10
trading days, MACRO 30). `judged_today` > 0 expected only once horizons
start maturing (~late July 2026 for MICRO, ~late Aug for MACRO).

## 7. Known items (don't re-flag)

[docs/reference/KNOWN_ISSUES.md](../../../docs/reference/KNOWN_ISSUES.md) is the
living backlog. Read its section headers rather than trusting a list hard-coded
here — the sets change. As of 2026-08-07: **Parked** `K7`–`K8`, **Watchlist**
`W1`–`W3`/`W5`, plus dated finding batches (`A1`–`A4` = 08-06 mid-session,
`B1`–`B4` = 08-06 post-session). Anything already there is reported as
**known**, not as a new finding.

Note the two ID namespaces are deliberately distinct: `K`/`W`/`A`/`B` are
KNOWN_ISSUES findings; `P-01`…`P-28` are PIPELINE work items. A finding gets a
`P-nn` only when it becomes tracked work.

NEW findings get appended to KNOWN_ISSUES in the same format (where, why it
matters, fix sketch). If a parked item stops reproducing, move it to the
Resolved log. Watchlist items carrying a check (W1 cycle duration) get checked
during this audit; anything with a *pass condition* belongs in VERIFY.md §0
instead, not here.

## 8. Railway log errors

```bash
cd ~/Desktop/GITHUB/zerodha-brain && railway logs --service zerodha-brain -n 3000 2>/dev/null | grep -iE "error|failed|exception|traceback" | grep -viE "non-fatal|skipped|no-op|LTP fetch failed" | tail -20
```

PASS = nothing beyond known-benign lines. Anything new/repeating → list it.
Also confirm the three advisor daemons logged startup since last deploy:
`advisor_watch] started`, `advisor_bot] started`, and (mornings) `token
preflight OK`.

## Report format + where output lands

End with **two** tables:

1. **VERIFY** (from §0) — check | PASS/FAIL/NOT-YET | evidence. Put this
   first; it is what the board is waiting on.
2. **Scorecard** (§1–§8) — check | PASS/WARN/FAIL | the number that proves it.

Then a one-line overall verdict.

**Writes — do all of these, then commit + push (`chore(review): …`):**

| What | Goes to |
|---|---|
| VERIFY results (PASS/FAIL/NOT-YET, watch readings) | `docs/reference/VERIFY.md` |
| Items closed or reopened by those results | `docs/PIPELINE.md` |
| NEW findings (root cause, why it matters, fix sketch) | `docs/reference/KNOWN_ISSUES.md` |
| One-paragraph state + the START HERE block | `docs/STATUS.md` |

A finding that lands in KNOWN_ISSUES but nowhere else is untracked work —
if it deserves a fix, give it a `P-nn` in PIPELINE. If a fix ships, it owes
VERIFY a row. That cycle is the whole point; don't skip a leg.

Do **not** write to `docs/ADVISOR_BUGS_PENDING.md` — that file was removed on
2026-07-23 and folded into KNOWN_ISSUES.

Update memory only if something structural changed.
