# Post-Close Action Plan — 2026-07-10

Consolidated to-do after market close. **Deploy gate:** brain (Railway) deploys
only after **15:30 IST** (auto-deploy = mid-session restart). Dashboard (Vercel)
anytime. Verification/DB work anytime.

Legend: `[verify]` no deploy · `[dash]` dashboard · `[brain]` needs post-close
brain deploy · `[user]` on your Kite account · `[plan]` parked, not now.

---

## P0 — Verify today's session (do first, `[verify]`)
- [x] Confirm `r_multiple` populated ✅ ongoing — verified daily by
      `/post-session-check` (trade-row integrity) + /insights R-distribution.
- [x] Confirm `mfe_r` / `mae_r` populated ✅ ongoing — /insights MFE/MAE
      scatter live since 2026-07-11.
- [x] Full session audit ✅ automated — `/post-session-check` skill
      (2026-07-13) runs the full scorecard after every close.
- [x] Session result capture ✅ automated (same).
- [ ] **Re-run the counterfactual audit** on rich full-day data — tooling:
      `/counterfactual-audit` skill (2026-07-14); run after each clean day — the first
      fully-clean day (confident market_context ~45 samples, decision↔trade
      link live). Measure: trend-tells gate effect, market-direction, time-stop,
      re-entry cooldown, over REAL linked outcomes (not n=1 07-09 garbage).

## P0.5 — Data-collection mode ✅ SHIPPED 2026-07-10 (commit 2c0be75)
Built + tested (+12, suite 496→508) + pushed. `DATA_COLLECTION_MODE` env flag,
default off, paper-only interlock. Soft stops → LIMIT_WOULD_STOP counterfactuals,
MARKET_CLOSED stays hard, circuit breaker logs-not-ends under the flag.
**To enable for tomorrow: set `DATA_COLLECTION_MODE=true` on Railway (post-close).**

<details><summary>original design (reference)</summary>

### P0.5 — Data-collection mode (`[brain]`, TOP feature — user's active priority)
Goal: stop throttling the dataset at a fixed trade count; let the system run the
full day to enrich diverse data. Decided approach: **counterfactual stops** —
soft limits become logged-not-enforced in paper mode.

Design:
- New flag `DATA_COLLECTION_MODE` (env, default **false**). Hard safety: force
  off unless `PAPER_TRADING=true` (never relax risk in real mode — add to
  `assert_safe_boot` / guard).
- `risk_manager.check_session_limits`: when the flag is on, the **soft** stops —
  MAX_TRADES, DAILY_STOP_3R, MAX_LOSS, MAX_PROFIT — return `can_trade=True` but
  attach a `would_stop` reason. **MARKET_CLOSED stays enforced** (hard).
- `brain.run_cycle`: on a `would_stop` marker, log it once (deduped per
  session+reason) instead of `end_session`. Real hard stop (market close) still
  ends.
- `brain._evaluate_exit` circuit breaker: gate `end_session` behind
  `not DATA_COLLECTION_MODE`; log CIRCUIT_BREAKER_WOULD_FIRE once.
- Capture the markers: new activity `LIMIT_WOULD_STOP` with
  `{reason, trades, pnl_pct, consecutive_losses}` so analysis can reconstruct
  "where a 10-trade / -3R / 3-loss capped run would have ended" AND study
  full-day behavior. Best of both.
- Note: with many concurrent positions, per-trade sizing can over-deploy vs
  `capitalDeployed` (paper only, simulated fills — acceptable; pnl% still divides
  by capital). Decide if we cap concurrent exposure or allow it.
- Tests: flag off → normal enforcement (existing); on → limits log once + keep
  trading; circuit breaker logs, no end; safety → ignored if not PAPER_TRADING.
- Deploy after 15:30, default off, validate in QA, enable via env for tomorrow.
- This is the 8th dark flag (same compute-log-counterfactual pattern).

</details>

## P1 — Small fixes (from parked findings)
- [x] `[dash]` Trade-log SHORT/LONG display bug ✅ FIXED 2026-07-11 (dashboard
      e9e1ca2) — Side column was hardcoded "SHORT"; now renders `position_type`.
- [x] `[brain]` "Token expired" banner flash ✅ FIXED 2026-07-11 (brain ec64a12)
      — incident now cleared right after the liveness probe, before initialize.
- [x] Autopilot behavior ✅ DECIDED 2026-07-12: keep `AUTOPILOT=true`
      (hands-off month run). See SESSION_HANDOFF #3.

## P2 — CNC rejected-orders source (`[user]`)
- [ ] Check **Kite → Console → connected apps** + any other running bots/scripts
      for the external CNC BUY INFY orders (08:58 IST). Proven NOT our system
      (PAPER mode, MIS-only not CNC, brain idle, `PAPER-` fills). Nothing to fix
      in our code — source is another app/manual on the account.

## P3 — Dark-flag validation & enablement (the strategic goal)
- [ ] Accumulate 2–3 clean days, re-run the counterfactual each time.
- [ ] If the effect holds, enable flags in order, one at a time, measuring each:
      1. trend-tells gate (Insights already shows it would cut ~68% of entries)
      2. market-direction (`MARKET_DIRECTION_ENABLED`) — tempers the short-lean
      3. time-stop (`TIME_STOP_ENABLED`)
      4. re-entry cooldown (`REENTRY_COOLDOWN_ENABLED`)
      Each `[brain]`, flipped post-close, validated on the next day's data.

## P4 — Data-capture Tier 2 (`[brain]`, extends what's built)
- [x] Exit-state feature snapshot ✅ SHIPPED 2026-07-14 (brain `92c99a9`) —
      `trades.exit_state` jsonb reuses the symbol's last analysis-cycle
      snapshot (zero recompute in the exit path; staleness explicit via
      cycle/at).
- [x] Slippage decomposition ✅ SHIPPED 2026-07-11 (brain f054ea0) — broker
      returns reference_price + slippage_bps; `trades.execution` jsonb
      {entry,exit}. Paper path only. Unblocks the timing latency→slippage link.
- [x] Real volatility ✅ SHIPPED 2026-07-11 (brain f054ea0) — `realized_vol`
      (cross-sectional day-change stdev) replaces the dead india_vix=15;
      `market_context.realized_vol` column, bucket derived from it.

## P5 — Bigger builds
- [ ] M5 replay/backtest harness — **BLOCKED on data depth** (2026-07-11): the
      candle archive has only ~1 partial day; indicator warmup needs 35+ 15-min
      bars (~9h > one session). generate_signal is pure (candles+price+nifty →
      decision), so the engine IS tractable once weeks of 5-min bars accrue.
      Revisit after the archive fills.
- [x] REQ-030 config cleanup ✅ SHIPPED 2026-07-11 (brain 0e22ba9) — SIGNAL
      knobs (MIN_BUY_CONFIDENCE, MIN_SELL_CONFIDENCE, MIN_RISK_REWARD_RATIO,
      ADX_TRENDING/WEAK) now live-tunable via app_config 'tunables' JSON key,
      no redeploy. `config.get_tunable()`, 60s cache, fail-safe to defaults.
      Risk-sizing/stop knobs deliberately excluded (money path stays code-only).
      **To override:** set app_config key `tunables` = e.g.
      `{"MIN_BUY_CONFIDENCE": 75}` — picked up within 60s, no restart.

## P6 — Timing + news
- [~] Timing capture & correlation — `docs/TIMING_CORRELATION_PLAN.md`.
      **Pillars 1–2 SHIPPED** 2026-07-11 (brain 46652f8): `timing` block on every
      decision. Pillars 3–4 (correlation surface + factor model) await data days.
- [x] News / financial-news correlation ✅ FULLY LIVE 2026-07-12 —
      keyed + capturing (`.NSE`→`.NS` fix, brain 72221c4); poll loop
      (`brain._maybe_collect_news`), per-decision `news_context`, and the
      Insights news section all shipped. Plan doc is now reference-only.

---
No code pushed today beyond what was already shipped (session running on
git_sha ac2d8fa). See memory: parked-postclose-2026-07-10, paper-trading-project.
