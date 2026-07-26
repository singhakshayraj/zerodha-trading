# Post-Market TODO — running tracker

Live list of open items + feature ideas to action **after market close
(15:30 IST)**. Started 2026-07-23. The automated session-health checks append
new observations here as they surface. Canonical detail lives in the linked
docs; this is the "come back to it" index.

---

## 🔴 Do post-close TODAY (2026-07-23, after 15:30 IST)

1. ~~**Redeploy the brain**~~ ✅ DONE 2026-07-23 23:58 IST. `railway up` from
   local `420eec7` (clean, `f5e7858` in history) → deployment `19b6ac0e`
   SUCCESS, new instance `88faa9af` started clean (both advisor daemons up,
   token preflight OK, no errors), brain ONLINE + heartbeating. Deploys here
   are manual `railway up` (service is NOT GitHub-connected), .git is in the
   tarball so `config.GIT_SHA` = deployed checkout = `420eec75826d`.
   **Note:** an earlier 02:08 auto-attempt FAILED, which is why the brain sat
   on `cd92317` all day. **Remaining verification is automatic tomorrow**
   (couldn't do tonight without corrupting today's advice): on 07-24's first
   session the `trading_sessions.git_sha` should read `420eec7...`, and on the
   09:45 advisor run `portfolio_risk_latest` should populate + the
   command-center / advisor risk panels light up. Did NOT trigger a manual
   advisor run tonight — it would overwrite today's official 11:09 advice with
   stale midnight prices.
2. ~~**Run the post-session audits**~~ ✅ DONE 2026-07-23 night — all clean
   (`/post-session-check` PASS, W1 resolved), `/counterfactual-audit` (n=131):
   nothing enables, strategy is net-losing (PF 0.33) so gate wins aren't edge;
   data-collection 3R-stop override now measurably costs money on losing days.
   `pacing_cost.py` run for 07-22/07-23. Full verdict in `SESSION_HANDOFF.md`
   current-state box.

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
- **Candle archive healthy** — 2,300 candles for the full day, no regression. ✅
- **Session closed clean** — COMPLETED/MARKET_CLOSED 15:21 IST, 51 trades, 0 stuck. ✅
- **First non-SIDEWAYS tape** — 07-23 logged BEARISH market_context (first since
  data-richness began); market-direction flag is closest it's been to measurable.
- **counterfactual-audit skill had stale SQL** — fixed (nested `indicators` paths). ✅
- **label_decisions full-day payload limit** — hit twice this week, needed a
  scratchpad workaround each time. Fixed properly (brain: paginate
  `get_directional_decisions_for_date` by hour); `label_decisions.py` now
  handles full days directly. ✅
- *(monitoring appends below)*

---

## 🔵 Feature ideas / backlog (revisit, not urgent)

- **Advisor pillar 1 — probability calibration**: ✅ INFRA BUILT 2026-07-26
  (brain `296f8c7`, DARK) — `calibration_curve` (confidence→empirical hit-rate
  reliability curve, Beta shrinkage, ECE + monotonicity) + `calibrated_confidence`
  lookup; daily run rebuilds/stores `advisor_calibration_latest` + dark-attaches
  to rows. Live confidence UNCHANGED. Real n=21: ECE 47.9pp, monotonic False,
  inverted — correctly shows the heuristic isn't usable yet. **Promotion still
  blocked on graded-data volume + a monotonic curve.** Follow-up: UI surface;
  measure calibrated-vs-raw as n grows.
- **Advisor pillar 3 — regime-conditional factor weighting**: per-regime
  factor attribution → regime-aware weights (the self-improving flywheel).
  Blocked on graded data + days-per-regime.
- **Weekly confluence → promote into the score** once `factor_attribution`
  shows `daily_weekly_alignment` predicts (currently dark/logged only).
- **Advisor step 3 — earnings/event-risk flag** ("you report Thursday,
  lighten up"). Needs an earnings-calendar data source — pick one.
- ~~**portfolio_risk v2 — true return-correlation matrix**~~ ✅ DONE 2026-07-26
  (brain `b919a84`, deployed + GIT_SHA set; correlation clusters +
  effective_bets, supersedes sector proxy). ✅ UI surfaced (dashboard
  `c77030d`, /advisor + command center). Lights up on Monday's first live
  advisor run. Dashboard commit local — push to Vercel is user's call.
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
