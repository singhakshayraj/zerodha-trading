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

### P7. Full-day sessions starve the advisor intraday refresh + timeline capture — RESOLVED 2026-08-04 (brain `9bd59ad`, [P-20])
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

### P8. inplay_list not locked on 08-03 (likely benign — verify)
`inplay_list` last locked 07-29; 08-03 sessions ran but no lock. `maybe_lock_inplay`
has a legit zero-lock path (no candidate clears `RVOL_THRESHOLD`), so this is
probably a quiet-tape day, not a bug — but confirm on a day with RVOL qualifiers
that it locks (rules out the 08-03 db_stocks split touching `lock_inplay_list`).

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
- **P7** (advisor-starve, brain `9bd59ad`/[P-20]) verified fixed live on the 08-04
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

### A1 — Advisor paper MANAGEMENT book **double-counts realized P&L** 🔴
The 08-06 seed wrote every rotated-out holding **twice**, same entry, same
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
