# Known Issues & Improvement Backlog

Living document. Full-application scans land findings here; fixes move items
to the Resolved log at the bottom. Re-scan cadence: after every major feature
ship, or when `/post-session-check` flags something new.

Last full scan: **2026-07-14** (post data-richness ship, pre first full-day run).

---

## Parked — needs a decision or a design (ordered by impact on the vision)

### P1. Concurrent exposure unbounded in data-collection mode
**Where:** `brain.py` position opening; no cap on open positions.
**Why it matters:** with the 40-entry/day budget, MIS positions can stack far
beyond `capitalDeployed` (₹25k) — 15 concurrent × ₹10k notional = ₹150k
"deployed" on a ₹25k session. Paper fills tolerate it, but the dataset drifts
from anything replicable with real capital: pnl% divides by capital, Kelly
sizing reads a distorted history, and the eventual go-live calibration
inherits fantasy numbers.
**Options:** `MAX_CONCURRENT_POSITIONS` (simple), or a notional cap
(Σ open qty×price ≤ k × capital). Entry gate already exists
(`_entry_block`) — one more clause.
**Decide by:** after 2–3 full-day sessions show real concurrency numbers.

### P2. Supabase 1000-row default limit — silent truncation time bombs
**Where:** every un-paginated `.select()` on growing tables.
**Blast radius & ETA at 40 trades/day, ~2–3k decisions/day:**
- `/api/analytics/insights` closed-trades select + `sizedRows` (turnover):
  truncates at ~25 more trading days (~mid-Aug 2026) — insights silently
  compute on the OLDEST 1000 rows.
- `database.get_evaluated_advice()`: ~50 days away.
- `database.get_tradebook()`: slow growth, months away.
**Fix pattern:** `.range()` pagination loop, or aggregate server-side (RPC).
**Decide by:** before 2026-08-01.

### P3. Advisor indicators include today's forming daily bar
**Where:** `portfolio_advisor.advise()` — `run_all_indicators(daily_candles)`
at 09:45 includes today's 30-minute-old "daily" candle.
**Why it matters:** EMA/momentum/consistency get a partial bar that will look
different by close — verdicts drift by run time. The smoothing fix handled the
verdict *price*; the indicator inputs still see the partial bar.
**Fix sketch:** drop the last bar when its date == today for indicator
computation; keep smoothed LTP for price-vs-level checks.
**Impact:** small score jitter, not wrongness. Do with the next advisor pass.

### P4. Deferred-entry reason not stamped on the decision row
**Where:** `brain._log_entry_deferred` logs to `brain_activity` only; the
decision row (already written before the gate) keeps its original
skip_reasons.
**Why it matters:** analyzing "what did pacing cost us" requires joining
activities→decisions instead of filtering decisions directly.
**Fix sketch:** `db.update_decision_skip(decision_id, reason)` after the gate.

### P5. In-play list: quiet days capture nothing
**Where:** `data_jobs.maybe_lock_inplay`, RVOL_THRESHOLD=2.0.
2026-07-13: 21 attempts, 0 of 39 names cleared, day recorded nothing.
Diagnostics now log top-3 RVOLs, but for the data-collection phase an empty
day is a lost sample.
**Fix sketch:** capture-first fallback — lock top-N by RVOL regardless (rvol
stored per row; downstream can re-filter to ≥2.0). Semantics change: decide
whether "in-play" means "cleared the bar" or "best available that day".

### P6. Local `next build` fails on mock API route
**Where:** `app/mock/api/*` (pre-existing; needs env at build).
Vercel builds fine. Annoyance for local verification only — typecheck
(`npx tsc --noEmit`) is the local gate meanwhile.

---

## Watchlist — monitor, no action yet

### W1. Cycle duration with all-day analysis
Analysis no longer breaks at trade caps → every cycle analyzes ~39 stocks
(0.5s pacing + candle fetches each). QA: 27 stocks ≈ 42s. Prod budget is the
300s interval. **Check the first full day's `Cycle N complete in Xs` lines**
— if X approaches 300, drop per-stock sleep or thin the universe.

### W2. brain_decisions growth
~5.5k rows = 7.3MB today; full-day analysis ≈ 2–3k rows/day → ~50–100MB/month
(indicators jsonb dominates). Free-tier DB is 500MB. Fine for the month-long
run; revisit retention (or strip bulky jsonb after N days) if the run extends.

### W3. Advisor watch / bot restart semantics
In-memory intraday-alert dedup may repeat one alert after a redeploy (safe
direction, accepted). Pacing counters (`_symbol_trades_today`, `_hour_trades`)
also reset on a mid-session restart — caps loosen slightly for the rest of
that day (accepted).

### W4. First live validation of 09:45 smoothed run
The session-boundary smoothing fix ships before its first 09:45 production
run. Verify on the first trading morning: `[advisor]` logs shouldn't show
absurd verdict prices vs the Kite app, and `INSUFFICIENT`/bars counts should
match prior days.

---

## Resolved log

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

**2026-07-13 scan:** 6 items (smoothing session-boundary, decision freeze
after evaluation, durable bot offset, preflight log, inplay diagnostics,
stock_profile dormancy) — all fixed same evening, brain `00cc4df`. Details:
`docs/ADVISOR_BUGS_PENDING.md`.
