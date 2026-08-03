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

---

## Resolved log

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
