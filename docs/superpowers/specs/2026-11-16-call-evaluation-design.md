# Call evaluation — daily forward scoring of every advisor suggestion

Date: 2026-11-16 · Status: draft for approval · Owner: Akshay (decides), Claude (builds)

## Intent

Every suggestion the advisor makes on a day — SELL / TRIM / HOLD on a holding,
the BUY it names as a rotation target, and every universe-scan call — is a
decision with a date. From that date on it is re-scored **every trading day**
for 60 trading days: how much it made or lost versus doing nothing, versus the
Nifty, and for a sell→buy switch, the pair as one trade. The scores roll up into
(a) a per-call running verdict ("right by +6.2% after 14 days, was wrong for the
first 5"), and (b) **lessons**: groups of calls that share something the advisor
saw on the day (regime, trigger, confidence, sector, thesis agreement, sector
rule) and lose money more often than the rest. Lessons are reported, never acted
on automatically — the operator decides whether to change the module.

Why now: the advisor has 401 graded calls since 2026-07-12, 1,438 universe calls
since 2026-11-11 and daily bars for 508 names since 2026-08-25. The current grade
is one number per call at one horizon (10 or 30 days), sign only. That cannot say
how wrong, whether the call was early or late, or which inputs produce the misses.

## Goals

1. A running score for every call, every trading day, up to 60 trading days,
   with magnitude (alpha %), path (worst and best point so far) and, for
   switches, the pair result after costs.
2. A lessons report: which day-of-call attributes predict bad calls, with the
   count behind each claim and a multiplicity haircut so a 20-bucket scan does
   not produce a lesson by chance.
3. A page where the operator can pick a day, see its calls and their paths, and
   read the current lessons. One line in the morning brief when a lesson appears
   or clears.
4. Everything token-free and non-fatal: it runs off stored bars after the
   morning bar sync, never touches verdicts, orders or the official grade.

## Non-goals

- Changing any advisor threshold, weight or verdict. The existing one-shot grade
  (`outcome_correct_alpha` at the MICRO/MACRO horizon) stays as the
  pre-registered record for the n=400 read and the trial ledger.
- Grading hero picks and the thesis engine (they have their own graders;
  `source` is left open so they can join later).
- Intraday paths. Daily closes only.

## Anti-goals (would make this a failure even if it works)

- A lesson that reads as true but is an artefact of few calls or many buckets.
  Every lesson shows n, the baseline it is compared to, and the haircut applied.
- A page that needs the operator to compute anything in their head: each call
  shows one sentence ("SELL ATGL 11-13: right, −4.1% vs Nifty after 12 days;
  worst point −6.8% on day 3").
- Any path from a lesson into the advisor's code without a human commit.

## Definitions (the operator's decisions, with my calls marked)

**Call.** Key (`source`, `account`, `run_date`, `symbol`). Sources:
- `advice` — `portfolio_advice` official rows, account `primary`; the verdict.
- `target` — the rotation target named on an `advice` or `natwar` row, scored
  as a BUY from the target's close that day (`rotation_buy_price`, else the
  universe row's `last_price`); symbol = the target. Also carries the pair.
- `natwar` — `account_calls`; the call is `sector_verdict` when set, else
  `verdict`. Where the two differ, a second source `natwar_v1` scores the v1
  verdict so the sector layer and v1 are compared on the same days.
- `universe` — `universe_calls`, account `universe`.
Entry price = the row's `last_price` (the close the advisor saw). INSUFFICIENT
rows are skipped. Day-of-call attributes for lessons are read from the same
row: regime (`market_regime` / `regime`), `trigger_type`, `confidence`,
`quality`, `sector`, `sector_rule`, `rotation_reason`, `indicators.thesis.action`.

**Trading-day calendar.** The Nifty 50 bar dates (`candles` symbol
`NIFTY 50`, interval day) define day 1..60. A symbol with no bar on a Nifty
day gets no row for that day (gap, not zero); the next day's row uses its own
close. `mae`/`mfe` run over the rows that exist.

**Daily score** (my call on the formulas):
- `ret_pct` = close(day d) / entry − 1; `nifty_pct` same for the Nifty 50 index
  bars; `alpha_pct` = ret − nifty.
- `direction` = −1 for SELL / SELL_ON_BOUNCE / TRIM, +1 for HOLD / BUY /
  rotation target. `signed_alpha` = direction × alpha_pct. Positive = the call
  is winning on day d.
- `mae_pct` / `mfe_pct` = min / max of signed_alpha over days 1..d (worst and
  best point so far).
- `correct` at day d = signed_alpha > 0.
- Pair (a SELL/TRIM row with a target): `pair_pct` = ret(target) − ret(sold) −
  `PAIR_COST_PCT` (0.3, STT + brokerage + slippage round trip; config, not a
  constant in code).
- HOLD gets an extra flag `should_have_sold` when mae_pct ≤ −10 at any point.
- `early_wrong_days` = number of days before the first day with signed_alpha > 0
  (how long the call looked wrong first).

**Horizon.** Scored daily to 60 trading days, then frozen. Checkpoints the
reports use: 5, 10, 20, 40, 60.

**Lesson buckets** (pre-registered; adding one is a doc change, not a code
tweak): verdict × market regime; trigger type; confidence band (<50, 50–69,
≥70); sector group (from `sector_view.group_of`); thesis action agrees /
disagrees with the verdict; sector rule applied (Natwar); call quality band
(<40, 40–69, ≥70); rotation reason (same vs cross sector); weekday of call.
Checkpoint for lessons: day 20 (my call: long enough for the sell thesis to
play, short enough to accrue n fast); day 60 reported beside it once available.

**Populations.** Lessons are computed separately for **holdings calls**
(`advice` + `natwar`, the book the operator acts on) and **universe calls**
(1,400+/day; it would otherwise drown the holdings record). `target` rows are
reported in the scorecard and the pair view, not bucketed on their own until
n ≥ 30.

**A lesson fires** when a bucket has n ≥ 30 scored calls at day 20 and its hit
rate is below the overall hit rate by at least 15 points **and** the one-sided
binomial p-value against the overall rate is ≤ 0.05 / (number of buckets
scanned) (Bonferroni; the haircut the trial ledger already uses). The same test
upward gives a "strength" (reported, lower emphasis). A lesson clears when the
test stops holding for two consecutive weekly runs.

## What the operator sees

`/advisor/calls` (new page, sidebar entry "Calls"):
1. **Day picker** (default: the most recent run with ≥ 5 scored days) and a
   population chip: Kanaklata · Natwar · Universe (default Kanaklata). For the
   day: one row per call — symbol, call, account, entry, today's signed alpha,
   day count, worst/best, pair result when there is a target, one-sentence
   verdict. Sort: worst first. Tap → the daily path as a small line vs the
   Nifty, with the day-of-call context (regime, trigger, confidence, reasons).
2. **Scorecard strip** above it: hit rate and mean signed alpha at 5/10/20/40/60
   for the whole record, split official / Natwar / universe.
3. **Lessons** panel: each firing lesson as one sentence with n, hit rate vs
   overall, p-value and checkpoint; strengths below in muted text; "nothing
   fires yet (need n ≥ 30 per bucket)" when empty.

Morning brief: a `lessons` line when the weekly run adds or clears a lesson.

Ask drawer: a `call_scores` tool ("how is the 11-13 ATGL sell doing?", "what
are the lessons?") over the same data; summary sentence computed in code.

## Data and jobs (my calls; the builder may change shapes, not meaning)

- Table `call_outcomes`: (`source`, `account`, `run_date`, `symbol`, `td`
  trading-day offset 1..60) → `date`, `close`, `ret_pct`, `nifty_pct`,
  `signed_alpha_pct`, `mae_pct`, `mfe_pct`, `pair_pct` (nullable),
  `computed_at`. Primary key on the five identity columns. Roughly 2,000 open
  calls × 1 row/day; prune nothing (≈ 500k rows/year is fine).
- Job `call_scoring.update(through_date)`: after the morning daily-bar sync
  (scheduler `_maybe_sync_daily_bars` success path, like reconcile and macro),
  for every call with run_date in the last 60 trading days and no row for the
  latest bar date, append the missing days. Idempotent; a missed morning is
  caught up the next. Reads bars from `candles` (interval day) via the existing
  `universe_calls._bars_since` shape. Backfills from 2026-08-25 on first run.
- Job `call_lessons.compute()`: weekly (Sunday 08:00 IST slot in the scheduler)
  and on demand; writes `app_config.call_lessons_latest` = {asof, checkpoint,
  overall: {n, hit, mean_alpha}, lessons: [...], strengths: [...], buckets
  scanned, haircut}. Also writes `call_scorecard_latest` (the strip).
- API: `/api/advisor/calls?date=` (rows + paths for a day), `/api/advisor/calls/days`
  (dates with counts), lessons and scorecard read from app_config through the
  existing `/api/advisor` config fetch.
- Tests: pure scoring from fixture bars (a SELL that is wrong for 3 days then
  right; a pair with costs; HOLD with a −12% drawdown → `should_have_sold`),
  the lesson test on synthetic buckets (one true lesson, one that fails the
  haircut), FakeSupabase for the update job's idempotence, mocked e2e for the
  page. VERIFY row: after the first morning run, every call from 11-11 has a
  row for every trading day through yesterday.

## Constraints

- Python 3.9, FakeSupabase for any DB-facing test, no production writes from
  tests (autouse guard exists). Dashboard: Next.js 14, Playwright mocked specs
  with `PW_CHANNEL=chrome`.
- No new dependencies on either side; `scipy` 1.9 is already in the brain's
  environment for the binomial test (`scipy.stats.binomtest`).
- The official grade columns on `portfolio_advice` are read, never written.
- Reply/report wording: plain English, rupees as ₹, no jargon on the page.

## Left to the builder

- Exact `call_outcomes` column types and indexes; whether `td` or `date` is the
  better primary key component.
- Sparkline implementation on the page (inline SVG is fine; no chart library).
- How the Natwar v1 vs sector-layer pair of scores is shown on the row (both,
  or sector-layer with v1 on tap).
- Whether the weekly lessons run also updates the morning brief directly or the
  brief reads `call_lessons_latest` on its own (the brief already reads config
  keys; prefer that).
