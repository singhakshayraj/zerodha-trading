# Advisor Bugs — ALL RESOLVED 2026-07-13 (brain `00cc4df`)

Found 2026-07-13 in a full self-scan + DB deep-scan; fixed the same evening.
Kept for history. Suite 678 → 687, all pins in `tests/test_parked_fixes.py`
and `tests/test_advisor_upgrades.py`.

| # | Severity | Bug | Fix |
|---|----------|-----|-----|
| 1 | HIGH | `smoothed_last_price` fetched 3 *days* (not candles) and its `[-3:]` slice blended the prior session's close into the verdict price — worst exactly on gap days | Filters to today's bars only; no closed bar today → `None` → raw LTP fallback |
| 2 | MED | Stale Telegram tap could rewrite `user_decision` on an already-backtested row, retroactively moving it between accepted/declined track-record buckets | `record_advice_decision` update scoped to `evaluated_at IS NULL`; bot toast says "already judged" |
| 3 | LOW | Bot `getUpdates` offset was in-memory; a redeploy could replay processed taps | Offset persisted to `app_config 'advisor_bot_offset'`, loaded on start |
| 4 | COSMETIC | Preflight logged "alerting" even when Telegram creds unset (no alert sent) | Log line moved inside the creds guard |
| 5 | MED (capture gap) | `inplay_list` empty for 2026-07-13 with no way to tell bug vs quiet tape from logs | Root-caused: working as designed — 21 attempts, zero of 39 names cleared RVOL 2.0 (quiet Monday). Zero-lock days now log threshold + scanned count + top-3 RVOLs. Threshold stays 2.0 (env-tunable `RVOL_THRESHOLD`) |
| 6 | LOW (capture gap) | `stock_profile` 0 rows — weekly builder was a Mac cron that never got installed | Extracted into `data_jobs.build_weekly_profiles`; scheduler runs it on the first advisor pass of each ISO week (`app_config 'profiles_week'`). First population fires on the next advisor run |
