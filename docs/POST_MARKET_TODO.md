# Post-Market TODO — running tracker

Live list of open items + feature ideas to action **after market close
(15:30 IST)**. Started 2026-07-23. The automated session-health checks append
new observations here as they surface. Canonical detail lives in the linked
docs; this is the "come back to it" index.

---

## 🔴 Do post-close TODAY (2026-07-23, after 15:30 IST)

1. **Redeploy the brain** — it's running `cd92317`, one commit behind
   `f5e7858`. That means **portfolio-risk + tax-loss-harvest code is NOT
   live**, so today's advisor run did not write `portfolio_risk_latest` and
   the command-center / advisor risk panels stay empty. A post-close deploy
   pulls latest `main` (includes `f5e7858` + all later). Market-hours deploys
   are forbidden (VISION §3b.6), so this waits for close. **Verify after:**
   `portfolio_risk_latest` in `app_config` populates on the next advisor run.
2. **Run the post-session audits** — `/post-session-check` and
   `/counterfactual-audit` on today's session (first full session since the
   SELL-fix + weekly-confluence went live). Re-run `scripts/pacing_cost.py`
   for today too.

## 🟡 Do tomorrow (2026-07-24) — first graded data

3. **Run `scripts/grade_advice.py`** — the 07-12 advice batch hits its
   10-trading-day MICRO horizon ~07-24, so the first real grades land. Once
   ~30-50 calls accumulate, `factor_attribution` + advisor pillars 1
   (calibration) and 3 (regime-conditional weights) become buildable. This is
   the gating action for the rest of the advisor god-mode plan.

---

## 🟢 Observations from today's live session (2026-07-23)

- **SELL decision-log fix verified live** — all SELL decisions now log correct
  short orientation (stop > entry). ✅ working.
- **Weekly confluence verified live** — every advice row carries
  `weekly_trend` + `daily_weekly_alignment` (RVNL/NBCC/ITC = ALIGNED_DOWN
  high-conviction sells). ✅ working.
- **Candle archive healthy** — 138 candles by 11:14, no 0-row regression. ✅
- *(monitoring appends below)*

---

## 🔵 Feature ideas / backlog (revisit, not urgent)

- **Advisor pillar 1 — probability calibration**: make `confidence` a measured
  probability (score-bucket → empirical hit-rate). Blocked on graded data.
- **Advisor pillar 3 — regime-conditional factor weighting**: per-regime
  factor attribution → regime-aware weights (the self-improving flywheel).
  Blocked on graded data + days-per-regime.
- **Weekly confluence → promote into the score** once `factor_attribution`
  shows `daily_weekly_alignment` predicts (currently dark/logged only).
- **Advisor step 3 — earnings/event-risk flag** ("you report Thursday,
  lighten up"). Needs an earnings-calendar data source — pick one.
- **portfolio_risk v2 — true return-correlation matrix** (beyond the sector
  proxy shipped in `f5e7858`).
- **Weekly confluence on rotation candidates** — don't rotate INTO a name in a
  weekly downtrend (currently weekly runs holdings-only).
- **UI honorable mentions** (`docs/UI_GODMODE_PLAN.md`): brain "current stance"
  panel (explain idleness: regime + in-play + deferred count); advisor
  calibration/attribution surface once grading data lands.
- **W1 — cycle duration to a DB column** (`docs/KNOWN_ISSUES.md`) so it
  survives Railway log rotation; currently unverifiable each session.

## ⚫ Blocked on external / user action (tracked elsewhere)

- **Gate #6 historical data pull** (Kite Connect ₹500/mo) → run `backtest.py`
  for a real edge verdict. Parked on API keys. See `docs/VISION.md` decision
  log + `SESSION_HANDOFF.md`.
- **TOTP auto-login revival** — root cause of the token-gap risk; built but
  dormant. Needs Zerodha-side setup. Memory `enc-token-refresh`.
- **Counterfactual audit** — needs a genuinely trending (non-SIDEWAYS) day
  before `market-direction` becomes measurable at all.
