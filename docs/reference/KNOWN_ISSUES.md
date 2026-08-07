# Known Issues & Improvement Backlog

Living document. Full-application scans land findings here; fixes move items
to the Resolved log at the bottom. Re-scan cadence: after every major feature
ship, or when `/post-session-check` flags something new.

Last full scan: **2026-07-23** (advisor bug-list audit — see Resolved log).
**Backlog cleared 2026-07-14** — all P1–P6 resolved same day (brain `cf8a628`,
dashboard `1944f45`); details in the Resolved log. New findings start fresh
below.

---

## Parked — needs a decision or a design

### K7. Full-day sessions starve the advisor intraday refresh + timeline capture — RESOLVED 2026-08-04 (brain `9bd59ad`, [P-20])
Fix: `_maybe_run_advisor` + `_maybe_capture_timeline` now also fire once per cycle
inside the inner trading loop (`scheduler.py`), not only the outer idle loop.
Verify next full-day session that `portfolio_advice` keeps refreshing past midday.
**Original finding (2026-08-03 `/post-session-check`):** `_maybe_run_advisor` and
`_maybe_capture_timeline` are called only from the scheduler's **outer** (idle)
loop — never the **inner** trading loop (`scheduler.py` ~742+). Until 08-03,
sessions ended at −3R by ~11am, so the brain sat in the outer loop all afternoon
and the advisor refreshed hourly. Now that `ENFORCE_DAILY_STOP_3R=false` lets
sessions run 09:30→15:21, the brain is in the inner loop the whole session, so
**`portfolio_advice` stopped refreshing at 11:50 on 08-03** (the last outer-loop
moment before the 11:53 session) — no intraday advisor time series for the full
afternoon. **Why it matters:** the /advisor page shows a stale mid-morning read
all day, and the intraday advice dataset is empty on full-day-session days
(exactly the days we now run). **Fix sketch:** call `_maybe_run_advisor` +
`_maybe_capture_timeline` from inside the inner trading loop too (they're already
daemon-threaded + idempotent-gated, so it's low-risk), or move them onto the
heartbeat thread. Not a regression in the fixes — a surfaced consequence of the
−3R-soft change. See [[data-collection-mode]].

### K8. inplay_list not locked on 08-03 — RESOLVED 2026-08-07 (no fix needed)
Closed on evidence: it has locked on **every session since** — 08-05 06:17 UTC
(7 names), 08-06 04:26 UTC (10 names). The 08-03 gap was the legitimate
zero-lock path (nothing cleared `RVOL_THRESHOLD` on a quiet tape), not the
08-03 `db_stocks` split breaking `lock_inplay_list`. Now watched continuously by
VERIFY.md **I-4**, which warns only on two consecutive session days with no lock.
**Original finding:** `inplay_list` last locked 07-29; 08-03 sessions ran but no
lock. `maybe_lock_inplay` has a legit zero-lock path, so this was probably a
quiet-tape day, not a bug — but needed confirming on a day with RVOL qualifiers.

---

## Watchlist — monitor, no action yet

### W1. Cycle duration with all-day analysis — RESOLVED 2026-07-23 (measurable from DB)
Analysis no longer breaks at trade caps → every cycle analyzes ~46 stocks.
Prod budget is the 300s interval. Previously unverifiable (Railway log buffer
rotated before the check each time). **Resolved via `brain_activity`
CYCLE_START timestamps** — no new column needed: the gap between consecutive
CYCLE_START events is the full cycle cadence (analysis + the 300s inter-cycle
sleep). 2026-07-23 full session: 32 cycles, avg 459s / min 442s / max 486s —
tight and consistent, so analysis is ~160s (gap − 300s sleep), comfortably
under the 300s budget and NOT ballooning. Re-check any session with:
`select gap between consecutive CYCLE_START in brain_activity`. Only revisit
if the cadence starts drifting toward 600s+.

### W2. brain_decisions growth
38MB total DB size after 2 full-data-richness days (07-14, 07-22) — on pace
with the original ~50-100MB/month estimate, well inside free-tier's 500MB.
Fine for the month-long run; revisit retention (or strip bulky jsonb after
N days) if the run extends.

### W3. Advisor watch / bot restart semantics — accepted, not a pending bug
In-memory intraday-alert dedup may repeat one alert after a redeploy (safe
direction, accepted). Pacing counters (`_symbol_trades_today`, `_hour_trades`)
also reset on a mid-session restart — caps loosen slightly for the rest of
that day (accepted).

### W5. Telegram `getUpdates` 409 Conflict in logs (08-04)
`[telegram] get_updates failed: 409 Client Error: Conflict … /getUpdates` — two
pollers hitting the same bot token's long-poll (only one getUpdates consumer
allowed per bot). Benign to trading/data (advisor_bot only records taps, no order
path), but decision-recording taps may split/drop between consumers. Likely a
lingering poller from a prior deploy overlapping the new instance. No action until
the Telegram token is finalized ([P-04]); re-check after a clean single-instance
restart. Ties to [[rotation-advisor]].

---

## Resolved log

**2026-08-04 post-session (brain `b09904fe55fb`):**
- **P-05 double-counted slippage on STOP_LOSS_HIT fills.** The resting-stop cap
  clamped the stop-exit *hint* to −1.25R (`execution.exit.reference_price`), but
  `PaperBroker._fill` re-applied `PAPER_SLIPPAGE_PCT`+charges on top, re-widening
  realized fills to −1.40R avg / −1.60R worst (short stops hid the same under
  `COVER_SHORT`). Fix: `model_stop` flag threaded from both exit paths into the
  broker skips the double slippage on stop exits; charges kept. +3 test assertions,
  suite 856 green. **Verify next session's `STOP_LOSS_HIT` bucket ≈ −1.25R − charges.**
- **K7** (advisor-starve, brain `9bd59ad`/[P-20]) verified fixed live on the 08-04
  session — advisor refreshed to 15:15 IST, timeline PRE 20 / INTRA 120 / POST 20.

**2026-07-14 backlog clear (brain `cf8a628`, dashboard `1944f45`):**
- P1: `DATA_MAX_CONCURRENT_POSITIONS=8` joined the entry gate (data mode
  only) — bounded open book, exits never gated.
- P2: pagination everywhere growth would have silently truncated at
  PostgREST's 1000-row default — `db._fetch_all()` (brain) + `fetchAll()`
  (insights route). Was ~4 weeks from corrupting insights.
- P3: advisor indicators use completed daily bars only (`completed_bars`),
  applied to holdings, universe scan AND the Nifty benchmark — no more
  partial-bar jitter, relative strength compares like with like.
- P4: deferred entries stamp `ENTRY_DEFERRED:<reason>` onto the decision
  row (`append_decision_skip`) — pacing cost queryable without joins.
- P5: in-play capture-first fallback (data mode): quiet days lock top-3
  below-bar names with true RVOLs (`INPLAY_FALLBACK_TOP_N`); strict
  semantics preserved via stored or_rvol re-filtering. Plain mode unchanged.
- P6: root-caused local build failure — a literal `<placeholder>` in
  `.env.local` was truthy, dodged the `||` fallback, threw in
  `createClient` at import. Both supabase clients now shape-validate the
  URL. Local `next build` passes.

**2026-07-14 scan (fixed same day, brain commit after `f67f82d`):**
- Weekly profile builder ran unpaced (~100 burst historical fetches) and was
  scheduled to fire mid-market Monday 09:50 on the shared Kite session →
  now paced at 350ms, refuses market hours, and runs from a post-close
  scheduler slot (15:40–17:00 IST). (Got lucky once: first run happened
  overnight because the deploy landed at 00:45.)
- `advisor_bot` long-poll loop spun hot (no sleep) whenever Telegram was
  unreachable, because `get_updates` swallows errors and returns instantly →
  instant-return now sleeps the poll interval.
- Telegram digest could exceed the 4096-char message limit on a heavy day
  (send fails → whole digest silently lost) → capped at the worst 12 calls +
  "…and K more on /advisor"; decision keyboard mirrors the cap.

**2026-07-13 scan:** 6 items, all fixed same evening (brain `00cc4df`),
**re-verified against current code 2026-07-23** (all still present, no
regressions — file the details lived in (`ADVISOR_BUGS_PENDING.md`) removed
as redundant, folded in here):
- `smoothed_last_price` blended a prior session's close into the verdict
  price (worst on gap days) → strictly filters to today's bars now
  (`portfolio_advisor.py::smoothed_last_price`).
- A stale Telegram tap could rewrite `user_decision` on an already-backtested
  row, moving it between accepted/declined track-record buckets after the
  fact → `record_advice_decision` scoped to `evaluated_at IS NULL`.
- Bot `getUpdates` offset was in-memory, a redeploy could replay processed
  taps → persisted to `app_config 'advisor_bot_offset'`.
- Preflight logged "alerting" even with no Telegram creds set → log line
  moved inside the creds guard (`advisor_watch.py::start_advisor_watch`).
- Zero-lock in-play days were unexplainable from logs → now log threshold +
  scanned count + top-3 RVOLs; root-caused as working-as-designed (quiet
  tape, not a bug).
- `stock_profile` never populated (Mac cron never installed) → extracted
  into `data_jobs.build_weekly_profiles`, scheduler runs it on the first
  advisor pass of each ISO week.

**2026-07-23 audit (this session):** closed W4 — two real official advisor
runs since (07-14, 07-22) both show 20/20 holdings, zero `INSUFFICIENT`,
sane price ranges (₹2358.60, ₹2307.72 avg) — the smoothed-run fix is
validated in production, not just in theory.

---

## 2026-08-06 mid-session audit — advisor/live-portfolio accountability

_Found while validating the live session `16f23213`. All three are
**PARKED for post-market implementation** at the user's instruction; this
section is the root-cause record, not a fix._

### A1 — Advisor paper MANAGEMENT book **double-counts realized P&L** — CODE FIXED 2026-08-07 (brain `f645ff3`); **DB repair not yet run**
Root cause: a name can carry a SELL/TRIM verdict **and** a rotation target in
the same run, and the legs in `_apply_management` each acted on the original
position independently — so the rotation booked a second full exit of shares the
SELL had already realized, then its `qty` update zeroed the closed SELL row.
`remaining` now carries across the legs (SELL zeroes it, TRIM decrements it, the
rotation OUT sells only `min(intended, remaining)` and is skipped when nothing
is left); the rotation BUY still runs, since the proceeds are real.
**Correction to the finding below: TRIM was never wrong.** `ITC` 40 open + 40
closed and `SILVERBEES` 213 open + 212 closed are honest half-trims of 80 and
425 — the identical `return_pct` on both halves is per-share by construction,
not a full exit. The `-25.786%` reads as "the whole position" but the row's
`realized_pnl` is the trimmed lot only. (A second, smaller bug *was* here: the
rotation leg read the **pre-trim** qty and overwrote the trim's shrink, so a
10-share holding could shed 15. Also fixed.)
**➡️ Still to do:** run `scripts/repair_p24_paper_books.sql` (brain repo)
against prod — it keeps the `SELL_VERDICT` row with its real closed qty and
drops the 7 `ROTATION_OUT` duplicates. Verify: closed MANAGEMENT SEED rows
= **9 rows / −₹39,983.84**. The prod write was blocked from this session and
needs a human to run it.

**Original finding (08-06):** The 08-06 seed wrote every rotated-out holding **twice**, same entry, same
exit, same `realized_pnl` counted twice:
- `04:31:06` — `qty=0`, `exit_reason=SELL_VERDICT`
- `04:31:13` — `qty=<real>`, `exit_reason=ROTATION_OUT`

Arithmetic proof: the 16 closed `SEED` rows sum to **−₹71,512.79**, but the
9 *distinct* names sum to **−₹39,983.84**; the 7 duplicated pairs (ATGL,
IREDA, ITCHOTELS, MAZDOCK, NBCC, NTPC, RVNL) sum to **exactly −₹31,528.95**
— the difference to the rupee. The `qty=0` copy is separately wrong (a
closed row should carry the closed quantity).

**Also: TRIM is modeled as a full exit.** `ITC` has an OPEN row (qty 40) *and*
a closed `TRIM` row (qty 40) booking the **entire** position's −₹3,963.66
(−25.8%) — so the position is both fully closed and fully open. Same shape on
`SILVERBEES` (open 213 + closed `TRIM` 212).

Impact: `/advisor/accountability`'s realized record, win-rate and
per-verdict/per-source breakdowns are wrong from day one. Equity/alpha are
less affected (baseline is frozen holdings), but the scorecard is the point.
**Cheap to fix now** — the books seeded today, so there is almost no history
to migrate. Owner: `advisor_paper.py` (brain `a2d9881`).

### A2 — Design question: day-0 seed books **legacy** P&L as advisor results 🟡
Seeding MANAGEMENT at the holdings' **cost basis** and immediately closing
SELL-verdict names books returns that predate the advisor entirely (RVNL
−46.3%, NBCC +73.0%) into its realized record. Alpha stays honest (both sides
carry it), but "realized win/loss record + win-rate" will read as advisor
skill when it is really the user's pre-existing position history. Decide:
seed at cost basis (current) vs. seed at **seed-day price** (advisor only
owns what happened after it spoke). Recommend the latter.

### A3 — A real executed trade is **never linked back to the advice** 🔴
_This is the user's actual ask (08-06): "I sold NBCC and rotated into the
suggested stock — it should record that movement so we can later judge
whether the suggestion was a win or a loss."_

`portfolio_advice.user_decision` / `decided_at` exist but are written **only**
by the Telegram bot (`advisor_bot.py`), which is blocked on the bot creds
([P-04]) — **8 rows out of 2,378** ever set. Nothing infers that the user
actually executed. So there is no real-money accountability loop at all; the
paper books are a *simulation* of advice, not a record of what was done.

**Proposed design (no new capture needed):** `portfolio_advice` already
snapshots `symbol` + `quantity` + `avg_price` for every holding on every run
(~6-min cadence) — that is an implicit holdings time series. Diffing
consecutive runs recovers real executions at ~6-min resolution: NBCC
`qty 115 → absent` = sold; the rotation buy shows up as a **new** symbol with
a fresh `avg_price`. Stamp `user_decision='accept'` on the advice row that
recommended it and write the real fill to a new `user_executions` table
(symbol, side, qty, price, detected_at, linked advice_id, inferred=true).
Then grading can score **what the user actually did**, not just the paper book.

### A4 — Advisor page "not immediate" — latency, **not** a staleness bug 🟢
Verified: `app/api/advisor/route.ts:16-20` already reads the **freshest**
batch by `created_at`, official or not. On 08-06 the official run (04:30:58)
carried `NBCC qty 115`, and both intraday refreshes (04:36:35, 04:44:39)
dropped it — 19 symbols, no NBCC. The sale was picked up in **under 6
minutes** and the page does show it. The perceived lag is the intraday
refresh interval (~6–8 min) plus needing the page to re-fetch. Options if it
still annoys: shorten the interval, or add a "refresh holdings now" control.
Low severity — no data is lost.

---

## 2026-08-07 mid-session findings — handle POST-MARKET

_Session `2ddadca7` (RUNNING at time of writing, started 07:10 UTC). Recorded
live; none of these were actioned during the session because every remedy
restarts the brain and would truncate the day's collection._

### C1 — Session started 12:40 IST, ~3h25m after the open 🔴
Market opens 09:15 IST; the session row `started_at` is **07:10 UTC = 12:40
IST**, leaving only ~2h50m of tape. That alone caps today's volume regardless
of any pacing change, and it is the second-order cost of the manual
enc_token + START dependency ([P-03], deprioritised).
**ROOT-CAUSED 2026-08-07 post-close — they were genuine failed attempts, and
there were far more than 20.**

`AUTOPILOT=true` **is set on Railway**, so `_should_autostart()` fired on
schedule at 09:30 IST. The blocker was authentication, not the start path:

1. autostart writes `brain_status='START'`, sets `_is_trading=True`
   (`scheduler.py:610-630`) and logs `START command received`;
2. `db.get_enc_token()` returns nothing — the token had not been pasted;
3. `token_refresher.refresh_enc_token()` cannot self-heal because TOTP
   auto-login is **shipped but dormant** ([P-03]);
4. → `_set_heartbeat('ERROR', 0, 'No token — reconnect from app')`,
   `sleep(30)`, `continue`. The `continue` sits inside the `try` whose
   `finally` (line 902) resets `_is_trading=False`, so the gate reopens and
   **the whole thing repeats every 30 seconds**.

From 09:30 → 12:40 IST that is roughly **380 retries**, not 20 — the log
buffer only held the last slice, which is what made it look like ~20. It
matches the silence elsewhere: `brain_activity` has **zero rows** between
03:30 and 07:11 UTC, because the failure path writes to `brain_heartbeat`,
never to `brain_activity`.

**Cost: ~3h25m of a 6h15m session — about 55% of the day's tape.** Autopilot
worked exactly as designed; it simply had nothing to authenticate with. So
this is not a scheduler bug and needs no scheduler fix — it is the manual
enc_token dependency, and today it was by far the largest single source of
lost data, dwarfing every pacing cap. Recorded as a measured cost, not a
re-opening of the [P-03] decision.

**Cheap mitigation that does not touch [P-03]:** the brain knows at 09:30 that
it is a trading day with no token and is about to burn the session. It
currently says so only in a heartbeat field. Have it emit one
`log_brain_activity('NO_TOKEN_AT_OPEN', …)` on the first failed autostart of
the day (and/or a Telegram ping once creds land, [P-04]) so the situation
surfaces where it will actually be seen instead of silently costing hours.

✅ **REVISED 2026-08-08 — the alert is already built; it is [P-04] that is
missing, not code.** `scheduler._maybe_token_preflight()` (scheduler.py:84)
already runs **once per market day at 09:16 IST**, skips weekends and
`NSE_HOLIDAYS`, live-checks the token, and on failure sends:

> ⚠️ Kite session expired/missing. Paste a fresh enc_token before the … IST
> advisor run!

It fires **14 minutes before** the 09:30 autostart — early enough to save the
session. It did nothing on 08-07 for one reason: its **only** channel is
Telegram, gated on `ADVISOR_TELEGRAM_BOT_TOKEN`, which [P-04] has never set.

So the highest-value action here is **[P-04] — a ~3-minute BotFather rotation
plus one `railway variables --set`** — not new code. It activates a working
alert that has been sitting dormant.

Writing `NO_TOKEN_AT_OPEN` to the DB is still worth doing eventually, for the
**post-mortem** trace (on 08-07 `brain_activity` had zero rows 03:30→07:11 UTC,
so the loss was invisible afterwards too). But it is second-best and should not
be mistaken for the fix. ⚠️ If implemented, note `log_brain_activity` takes a
required `session_id` and every existing caller passes a real one — a no-session
insert may be rejected, and the function **swallows exceptions**, so it would
look shipped while doing nothing. Use a channel known to be writable
(`db.write_config`) or verify the row actually lands.

### C2 — Advisor universe scan: `invalid token` 400 on JBCHEPHARM 🟡
`[market_data._get_historical] failed: 400 on
/instruments/historical/441857/day: invalid token`. Token `441857` is
**JBCHEPHARM** (`data/nifty500.csv:255`).
**Not** a regression from the [P-31] universe rotation: JBCHEPHARM is not in
today's rotated slice, and the `/day` interval is the **advisor's** daily-bar
scan, not the trading loop's 5-minute path. So this is pre-existing behaviour
in the Nifty-500 rotation scan, surfaced by reading the logs closely.
Isolated (1 occurrence in 3,000 log lines). Likely a stale instrument token
from the pinned CSV. Check whether other Nifty-500 names fail the same way
across a full session, and if so regenerate via
`scripts/build_nifty500_tokens.py`.

### C3 — Cycle log mislabels rotated names as `nifty50` — FIXED 2026-08-07 (brain, post-close)
`CYCLE_START  Cycle 1 — Scanning 87 stocks (20 holdings, 67 nifty50)` — the
67 is 27 Nifty-50 **plus** the 40 `nifty500_rot` names lumped in. Cosmetic,
but it would mislead exactly the future audit that tries to attribute breadth.
**Fixed:** the CYCLE_START message now breaks the mix out by source
(`20 holdings, 27 nifty50, 40 nifty500_rot`) instead of lumping everything
non-holdings under one label. Universe
construction itself logs correctly (`Added 40 nifty500_rot stocks…`).

### C4 — `CYCLE_LIMIT` is now the binding cap, not `HOURLY_PACE` 🟡
The [P-31] breadth change moved the constraint. Pre-breadth (08-06, 46
symbols) the tally was HOURLY_PACE 44 / CYCLE_LIMIT 13. Post-breadth, cycle 1
alone already deferred **3 on CYCLE_LIMIT and zero on HOURLY_PACE** — with 87
symbols each cycle surfaces more qualifying signals, so the per-cycle cap of 8
binds first. The pre-market runbook raises it 8→12; given this, **12 may be
too timid** — re-derive from the full-session deferral tally after close
before setting it.

**Revised 14:51 IST on live evidence — the first read was misleading.** Across
17 cycles the tally is still only `CYCLE_LIMIT 3`, all of them in cycle 1 and
none since. So CYCLE_LIMIT does **not** dominate; it fired once during the
opening burst and went quiet. What is actually binding is the hourly cap, and
it only just engaged — entries per IST hour are **12:00 → 11** (in 20 minutes,
an open-of-session burst), **13:00 → 8**, **14:00 → 15**, and 15 is exactly
`DATA_MAX_NEW_TRADES_PER_HOUR`. The hour is capped with ~9 minutes still to
run, so HOURLY_PACE deferrals should begin appearing.
**Consequence for the post-market tuning:** the runbook's hourly 15→25 is the
change that matters; the cycle 8→12 is close to irrelevant on today's
evidence. Note also that a 2h50m session is too short to settle this — decide
from a full session before committing to numbers. The deeper constraint today
was **session length, not pacing** ([C1]).

### C5 — `candles` misses the tail of a trade's window 🟡
_Found 2026-08-08 by [P-30]'s ground-truth check, which is exactly the kind of
thing that check exists to surface._

Of 118 trades that exited on a clean `STOP_LOSS_HIT`/`TARGET_HIT`, **10 exited
past the last bar the archive holds for that symbol**, and 8 of those 10 show
no bar reaching the level the trade demonstrably exited at. The extremes
(`mfe_r`/`mae_r`, tick-tracked) prove the touch happened; the bars just aren't
there.

**Mechanism.** `db_records.candle_rows` archives only the trailing `tail=3`
bars, and only for symbols analyzed in that cycle. A position that closes
*between* analysis cycles never gets its final bars re-archived — the exit is
the last thing to happen to that symbol, and nothing revisits it afterwards.

**Impact is bounded and currently benign.** [P-30] consults the bars only to
*order* two touches the extremes already recorded, so a missing tail degrades to
"unresolved" (the trade falls back to the optimistic/pessimistic band) rather
than to a wrong answer. It costs resolution, not correctness. It would matter
more to any future work that treats `candles` as a complete price path — a
backtest harness especially.

🔴 **CORRECTED 2026-08-08 (same day) — do NOT implement the fix as first
written.** The original note here said "archive the trailing bars once more at
exit, in the close path". **That would reintroduce a regression this codebase
has already paid for.** Two independent warnings say so:

- `db_records.upsert_candles` docstring: the per-symbol archive version "added
  ~7s/cycle in prod, **slowing stop detection**".
- `brain._exit_state` docstring: the exit path "runs on a ~30s cadence and must
  stay fast — **cf. the archive_candles latency regression**".

And the cost of a slow exit path is measured: cycle-boundary-only stop checks
filled stops at **−2.78R instead of ≈−1R** (2026-07-08). The close path is the
single most latency-sensitive code in the system — it is the worst possible
place to add an I/O call.

**Correct fix, if it becomes worth doing: archive the tail POST-CLOSE, off the
hot path** — a job over the day's traded symbols after the session ends
(`data_jobs.py` is the right home; it already owns `maybe_build_level_pack`,
`maybe_lock_inplay`, `maybe_weekly_profiles`). Latency there is irrelevant.

Still not proposed as work — recorded so the next person to lean on `candles`
knows both its edges and where the fix does *not* go.

---

## 2026-08-06 post-session check — new findings

Session `16f23213` 04:25:53→09:51:48 UTC, `COMPLETED`/`MARKET_CLOSED`,
git_sha `c5fd5254f157`. 77 trades, −₹5,051.92, PF 0.489, −0.344R avg.

### B1 — `execution.exit.model_stop` is never persisted (0 of 77 closed trades) — FIXED 2026-08-07 (brain `8c875df`)
Root cause: `model_stop` was passed *into* `PaperBroker._fill` but never returned
in the fill dict, and `brain._fill_leg` only copies `reference_price` /
`fill_price` / `slippage_bps` — so the flag could not reach the `execution` blob.
The broker now returns `model_stop`, `_fill_leg` persists it on the exit leg, and
a new `charges_bps` splits the charge component out of `slippage_bps` (the
~6.4 bps residue on a capped stop fill is charges, not slippage — that
conflation is what made the fix look inert). **Verify next session:** every
`STOP_LOSS_HIT` trade has `execution.exit.model_stop = true`, and its
`slippage_bps == charges_bps`.

**Original finding (08-06):** The [P-05] double-slippage re-fix (brain `b09904`) added a `model_stop` flag so
the paper broker skips re-applying `PAPER_SLIPPAGE_PCT` on stop exits. The key is
**absent from the `execution.exit` JSON on every single closed trade today**, and
stop fills still show ~6.3–6.4 bps of adverse slippage past the stop reference
(AXISBANK: reference 1249.76 → fill 1248.96). Either the flag never reaches the
broker or it is dropped before the execution blob is written.
Consequence: **[P-05] is not verifiable from the data as it stands** — the fix
leaves no observable trace. Check the write path in `paper_broker`/`brain` exit
handling. _Note the session mean did land on target (−1.252R), so the effect may
be present without the flag; the point is it cannot be confirmed either way._

### B2 — `STOP_LOSS_HIT` measures LONG stops only; SHORT stops are masked — FIXED 2026-08-07 (brain `8c875df`)
Root cause was broader than the stop bucket: `_cover_short` **hardcoded**
`exit_reason='COVER_SHORT'`, so *every* short exit — stop, target, time-stop,
EOD, session-end — collapsed into one reason. Every `exit_reason` bucket in the
08-06 table therefore measured LONGs only. `_cover_short` now takes the reason
from its caller (`STOP_LOSS_HIT`/`TARGET_HIT`/`TIME_STOP`/`BRAIN_SIGNAL`/
`EOD_CLOSE`/`SESSION_END`); the side is already carried by `position_type`, so
the reason is free to say *why*. `COVER_SHORT` remains only as the default.
**Verify next session:** `STOP_LOSS_HIT` and `TARGET_HIT` both contain SHORT
rows, and re-judge [P-05] on the pooled bucket. Note this **breaks comparison
with pre-08-07 sessions** — old short exits are all `COVER_SHORT`.

**Original finding (08-06)** — full-session breakdown by side:

| exit_reason | side | n | avg R | worst |
|---|---|---|---|---|
| COVER_SHORT | SHORT | 30 | −0.318 | **−1.356** |
| BRAIN_SIGNAL | LONG | 22 | −0.658 | −1.189 |
| STOP_LOSS_HIT | LONG | 12 | **−1.252** | **−1.420** |
| TARGET_HIT | LONG | 8 | +1.626 | +1.150 |
| SESSION_END | LONG | 5 | −0.095 | −0.516 |

`STOP_LOSS_HIT` is **100% LONG**. Every short stop-out exits as `COVER_SHORT` and
is pooled with ordinary covers, so it never enters the bucket [P-05] is judged on.
The headline "−1.252R, on target" therefore describes **half the book**. The worst
short cover (−1.356R) is past the cap and invisible to the metric.
**Fix the measurement before re-judging the fix** — either tag stop-triggered
covers distinctly, or compute the [P-05] bucket as "stop-triggered exits, both
sides". Same masking was noted after 08-04 but not quantified until now.

### B3 — Phantom trade row from a failed square-off — FIXED 2026-08-07 (brain `8c875df`)
The row never entered (null `entry_price`, null `quantity` — the entry path
failed or threw before `update_trade_entry`), so `_execute_sell_by_trade` bailed
on `qty <= 0`, `trade_still_open` stayed True, and the force-close branch wrote
`SQUARE_OFF_FAILED` with a fabricated exit price. That branch now checks for a
missing `entry_price` first and closes as `ORDER_FAILED` with zeros and no exit
price — true, and already exempt from the `bad_null_entry` check.
**Verify next session:** `trades` count == `total_trades_executed` == the
`ORDER_PLACED` count (the standing +1 gap should be gone).

**Original finding (08-06):** One row (`bd5e88ec`, INFY, LONG, `SQUARE_OFF_FAILED`) has **null
`entry_price`/`entry_time`/`entry_order_id`** but `exit_price` 1165.50 and
`pnl` 0.00, created 04:27:49 — two minutes after session start. This is the
source of the persistent **+1 discrepancy** tracked all session (`trades` 78 vs
`total_trades_executed` 77 vs `ORDER_PLACED` 77). Harmless for P&L (0.00) and
excluded from R stats (`r_multiple` null), but it inflates raw trade counts and
trips the `bad_null_entry` integrity check. Likely a session-start cleanup
squaring off a position that no longer existed. Either don't write a trade row
when the square-off has no entry, or give it its own `ORDER_FAILED`-style
exemption.

### B4 — Heartbeat write errors while idle (watch) 🟢
45 × `[database.update_heartbeat] ERROR cycle=0` in the pre-session window, plus
a handful of transient `Server disconnected` blips (`get_open_trades`,
`create_trade`, `get_directional_decisions_for_date`). All pre-session or
isolated; the session itself ran clean and no data is missing. Watch for growth —
if a `create_trade` blip ever lands mid-session it would silently drop a trade.
