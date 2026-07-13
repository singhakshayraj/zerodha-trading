# Known Issues & Improvement Backlog

Living document. Full-application scans land findings here; fixes move items
to the Resolved log at the bottom. Re-scan cadence: after every major feature
ship, or when `/post-session-check` flags something new.

Last full scan: **2026-07-14** (post data-richness ship, pre first full-day run).
**Backlog cleared 2026-07-14** — all P1–P6 resolved same day (brain `cf8a628`,
dashboard `1944f45`); details in the Resolved log. New findings start fresh
below.

---

## Parked — needs a decision or a design

*(empty — next scan or `/post-session-check` findings land here)*

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

**2026-07-13 scan:** 6 items (smoothing session-boundary, decision freeze
after evaluation, durable bot offset, preflight log, inplay diagnostics,
stock_profile dormancy) — all fixed same evening, brain `00cc4df`. Details:
`docs/ADVISOR_BUGS_PENDING.md`.
