---
name: post-session-check
description: End-of-day data-quality audit for the portfolio advisor (advisor-only mode — the intraday trading engine was decommissioned 2026-09-09). Run after a market day to verify the advisor ran, grading moved, paper books updated, and every open VERIFY check got a reading. Reports a pass/fail scorecard and writes results back to the docs.
---

# Post-Session Check (advisor-only)

Prod Supabase project `gilmuwmtdpjccibfhqtx` ("zerodha-trader"), Railway
service `zerodha-brain`. Use `mcp__supabase__execute_sql` for queries.

**Timestamps are UTC; `current_date` is UTC.** After 18:30 UTC substitute the
IST session date explicitly.

## −1. Before anything: `git pull`

The scheduled review commits to `origin/main` from elsewhere. Reading STATUS
from a stale checkout reports a wrong picture (happened 2026-11-09). Pull both
repos first:

```bash
git -C ~/Desktop/GITHUB/zerodha-trading pull --ff-only
git -C ~/Desktop/GITHUB/zerodha-brain pull --ff-only
```

## 0. The VERIFY ledger — run this FIRST

[docs/reference/VERIFY.md](../../../docs/reference/VERIFY.md) holds the open
checks shipped fixes registered. Run every **🔵 OPEN** check and every
**♾️ STANDING INVARIANT**; skip the **⚰️ MOOT** section (trading-era).
Report each **PASS / FAIL / NOT-YET** with the proving number, then:

- PASS → move to **✅ PASSED** with date + evidence; close the PIPELINE item.
- FAIL → leave OPEN with the failing number; PIPELINE item back to Ready.
- NOT-YET → leave it, say why.

**V-20 rule: no interim peek.** Do not compute hit rates on the graded pool
(overall or by group — verdict, followed/ignored, sector) until
`graded_calls ≥ 400`. Counts are fine; outcomes are not.

## 1. Token + advisor ran

```sql
select key, (updated_at at time zone 'Asia/Kolkata')::text ist,
       case when key='enc_token' then length(value::text)::text
            else left(value::text,160) end v
from app_config
where key in ('enc_token','brain_status','grading_incident',
              'advisor_digest_date','token_incident');

select run_date::text, count(*) filter (where is_official) official, count(*) n
from portfolio_advice where run_date >= current_date - 7
group by 1 order by 1 desc;
```

PASS = `enc_token` pasted today (IST) and an official run for today with
rows ≈ holdings count. No token today = **NOT-YET, not a failure** (pull-mode;
the advisor legitimately idles). Note the paste time: pastes before ~06:00 IST
die at the flush (KNOWN_ISSUES [D2]).

## 2. Advisor row quality

```sql
select count(*) rows_today,
  count(*) filter (where market_regime is null) null_regime,
  count(*) filter (where verdict is null or trend_score is null) null_core,
  count(*) filter (where verdict <> 'INSUFFICIENT' and coalesce(counter_case,'') = '') no_bear_case,
  count(*) filter (where indicators = '{}'::jsonb and verdict <> 'INSUFFICIENT') empty_indicators,
  count(*) filter (where rotation_target_symbol is not null and rotation_sell_qty is null) rotation_unsized
from portfolio_advice where run_date = current_date and is_official;
```

PASS = every count except `rows_today` is 0.

## 3. Grading — read the Railway line, not just `grading_incident`

```sql
select count(*) filter (where outcome_correct_alpha is not null) graded,
       count(*) filter (where evaluated_at is null) queued,
       max(evaluated_at)::text last_eval
from portfolio_advice where is_official;

select run_date::text, trigger_type, count(*) n
from portfolio_advice where is_official and evaluated_at is null
group by 1,2 order by 1;
```

Then the pass line from the log (§6): `[backtest] pass: queued=… graded=…
not_due=… token_expired=…`.

⚠️ **[D4]: with a dead token, `grading_incident` calls every queued row
"due"** — it counts them as `token_expired` before checking maturity. Only a
pass with a live token (`token_expired=0`) tells you what is really due.
MICRO matures 10 trading days after `run_date`, MACRO 30. Report the date the
next batch matures and whether `graded` will cross 400 then.

## 4. Paper books + real executions

```sql
select book, count(*) n, count(*) filter (where is_open) open_n
from advisor_paper_positions group by 1;

select symbol, side, quantity, price, detected_at::text, followed_advice,
       advice_id is not null linked
from user_executions where detected_at::date = current_date;
```

Plus the log's `[paper] … snapshot` lines. I-1 (duplicate exits) and I-5
(phantom executions) cover the failure shapes.

## 5. Freshness + size

```sql
select (select max(nav_date)::text from amfi_nav) last_nav,
       (select max(captured_at)::text from holdings_snapshot) last_snapshot,
       pg_size_pretty(pg_database_size(current_database())) db_size;
```

PASS = `last_nav` within 1 trading day. Holdings snapshots are CLI-only
(`python3 scripts/capture_holdings.py` in the brain repo, needs a live token)
— stale is expected, not a failure. DB size vs the 500 MB free tier ([P-38]).

## 6. Railway logs

```bash
cd ~/Desktop/GITHUB/zerodha-brain && railway logs --service zerodha-brain -n 3000 2>/dev/null \
  | grep -vE "get_config\] key=|heartbeat|\[kite\] GET" \
  | grep -iE "error|failed|exception|traceback|no instrument token|SCHEDULER|backtest|paper\]|GRADING" | tail -30
```

If `Unauthorized`: ask the user to run `railway login` (you cannot).
Known-benign: `non-fatal` lines while the token is dead; a single Telegram
`getUpdates 409 Conflict` right after a deploy. `no instrument token for
NSE:<sym>` for a **sold** non-Nifty-500 name = [D3] (its calls never grade).
`advisor_watch` no longer exists — it was removed by the decommission; do not
expect its startup line.

## 7. Known items (don't re-flag)

Read section headers in
[KNOWN_ISSUES.md](../../../docs/reference/KNOWN_ISSUES.md) and the register in
[OPEN_ITEMS.md](../../../docs/OPEN_ITEMS.md). Anything already listed is
**known**. New findings get a dated entry in KNOWN_ISSUES (where, why it
matters, fix sketch) and, if worth fixing, a `P-nn` in PIPELINE.

## Report + writes

Two tables: **VERIFY** (check | PASS/FAIL/NOT-YET | evidence) first, then the
**Scorecard** (§1–§6). One-line verdict.

| What | Goes to |
|---|---|
| VERIFY results | `docs/reference/VERIFY.md` |
| Items closed/reopened | `docs/PIPELINE.md` |
| New findings | `docs/reference/KNOWN_ISSUES.md` |
| State + START HERE block | `docs/STATUS.md` |
| Problem register (by owner) | `docs/OPEN_ITEMS.md` |

Commit + push as `chore(review): …`. Do **not** restart or recommend
restarting the trading engine — that needs an explicit decision against
POST_MORTEM §6.
