# Advisor Bugs — Parked for Post-Session Fix

Found 2026-07-13 during a full scan of the advisor upgrades (regime filter,
rotation sizing, Telegram decisions). None are live-blocking; all fail safe
(wrong/stale data, not a crash or an order). Fix after today's session closes.

## 1. Price-smoothing blends across the session boundary (HIGH)

**File:** `portfolio_advisor.py:188`, `smoothed_last_price()`

```python
candles = market_data.get_candles(instrument_key, '15minute', 3) or []
```

Third positional arg is `days`, not candle count — fetches **3 calendar
days** of 15-min candles, then slices `[-3:]`. At 09:45 IST (the run time)
only 1-2 of *today's* 15-min bars have closed, so the slice pulls in 1-2
bars from the **previous session** to fill out. After a weekend gap
(Friday close → Monday open), the "smoothed" verdict price blends
yesterday's close into today's read — the opposite of what the feature is
for (filtering same-day opening noise).

**Fix:** filter candles to today's date before slicing, or fetch by
explicit candle count if `market_data` supports it; fall back to raw LTP
if today has zero completed bars yet.

## 2. Decision can be rewritten after the row is already judged (MEDIUM)

**File:** `database.py:773`, `record_advice_decision()`

No guard against `evaluated_at` already being set. Telegram buttons never
expire or get disabled. A stale tap on an old digest message (scrolled back
to weeks later, or a double-tap) silently overwrites `user_decision` /
`decided_at` on a row the backtest has already scored — retroactively
moving it between the accepted/declined buckets in
`get_track_record_summary()`'s `by_decision` split, corrupting the exact
number the feature exists to produce.

**Fix:** reject (or log-and-ignore) a decision write when `evaluated_at`
is already set on that row; optionally edit the Telegram message to strip
the keyboard once a decision is recorded.

## 3. Bot's getUpdates offset isn't durable (LOW)

**File:** `advisor_bot.py:26`, module-level `_offset`

In-memory only, resets on every process restart (e.g. a Railway redeploy).
Telegram retains unconfirmed updates briefly; a redeploy shortly after a
tap can redeliver it, silently reverting a decision the user changed in
between. Every other durable dedup marker in this codebase (e.g.
`advisor_digest_date`) lives in `app_config` — this one doesn't.

**Fix:** persist `_offset` to `app_config` after each successful poll.

## 4. Misleading preflight log line (COSMETIC)

**File:** `scheduler.py:101`

```python
print("[SCHEDULER] token preflight FAILED — alerting")
if config.ADVISOR_TELEGRAM_BOT_TOKEN and config.ADVISOR_TELEGRAM_CHAT_ID:
```

Logs "alerting" even when Telegram creds are unset and no message actually
sends. No functional impact — just misleads anyone reading logs.

**Fix:** move the log line inside the `if`, or branch the message.

---

# Data-Capture Gaps (from DB deep-scan, 2026-07-13)

Not advisor bugs — found while auditing whether the whole DB is capturing
the right data. Parked here too since they're also post-session fixes.

## 5. `inplay_list` missing today's row (MEDIUM)

**File:** `data_jobs.py:86`, `maybe_lock_inplay()`, called from `brain.py:432`

Last locked row is 2026-07-10. Today (07-13, a live trading day, session
well past cycle 3) has no row despite being well past the 09:30 lock gate.
Fails silently (`except Exception: print(...)` — non-fatal by design) so
nothing crashed; the paper engine doesn't depend on this list
("non-gating — not enforced"), but the daily in-play dataset this feeds
(M4/M5 candidate ranking) now has a gap. Need to check today's full log
history (not just the last 3000 lines, which may have scrolled past the
~09:30 attempt) to see whether it's throwing an exception or silently
never firing.

## 6. `stock_profile` never populated (LOW)

**File:** `stock_profile.py` / `scripts/build_profiles.py`

0 rows. Dormant weekly behavioral-fingerprint pipeline (Kaufman efficiency
ratio, gap-follow rate) — docstring says "runs on the Mac," never wired
into the scheduler, never run. Not blocking anything currently reading it
(nothing does), but a capability that's built and silently inert.
