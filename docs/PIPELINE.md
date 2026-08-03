# PIPELINE — the execution board

**Where feedback becomes tracked work.** The live kanban: every finding (from a
review, an audit, or you) lands here as an item with a **measure-of-done**;
daily work pulls the top **Ready** item. Strategy/why-order lives in
[ROADMAP.md](ROADMAP.md); current reality in [STATUS.md](STATUS.md).

_Last updated: 2026-08-03 (post-session) · Burn-down this week: 5 shipped + verified live
+ 1 in-progress / 1 ready / 4 blocked. (P-19 + P-05 + P-07 shipped, P-15/P-05/P-07 got
their first live verification on 08-03's two sessions; P-16 resolved as no-op, P-06
scoring half done — see Done.)_

---

## 📊 Weekly gate re-measure (2026-08-02)

**No new trading data this week.** `trading_sessions` max `started_at` is still
07-29; `brain_heartbeat` shows `status=ONLINE, current_cycle=0, "Waiting for
START command"` as of 08-02 04:39 UTC — same stalled state STATUS flagged on
07-31. Zero sessions, zero trades, zero advisor runs since 07-29. All figures
below are therefore **unchanged from last review, not re-verified against new
data** — first-time cumulative baseline for future deltas:

| Metric | Value (370 closed trades, all-time) | Gate (VISION §6.1) |
|---|---|---|
| Profit factor | **0.376** | >1.3 go / <1.1 reject → **reject zone, no flip** |
| Expectancy | **−0.408R** avg | negative |
| Max drawdown | **≈−₹6,697** (peak-to-trough equity) | — |
| Advisor calibration ECE | **48.5%**, non-monotonic, 22 graded calls (most bins low-n) | DARK — not scored |

No go/no-go gate flipped. Paper PF confirms the standing conclusion (no edge
on paper data) but this is not the edge verdict — gate #6 is, and it's still
blocked on the Kite ₹500/mo decision ([P-01]).

**3-lens sanity:** trader — PF unchanged, deep reject zone, nothing new to
read since no new trades. advisor — calibration ECE 48.5%/non-monotonic is
the first hard number recorded for it; poor but DARK (no live weight), and
n=22 is too small to act on — watch, don't fix (new [P-18]). engineer — the
real story this week is operational, not statistical: the manual-token-paste
SPOF has now stalled the *entire* pipeline for a full week, which means none
of [P-05]/[P-07]/[P-16] can accumulate the fresh session data they need to be
tested. This sharpens [P-03]'s priority further; no new risk beyond what's
already tracked there.

## The feedback loop (how this board is fed + drained)

```
 REVIEW ─▶ TRIAGE ─▶ PIPELINE ─▶ DO (daily) ─▶ VERIFY ─▶ REVIEW
 cadence   finding→   item lands   pull top     next review
           solution   w/ measure   Ready, ship  re-measures
```

- **REVIEW (cadence):** per market session — `/post-session-check` +
  `/counterfactual-audit` (small findings, daily); **weekly** — a 3-lens eval +
  re-measure the gate metrics (big findings). Automated via the scheduled agents
  (see §Cadence at the bottom).
- **TRIAGE:** each finding → an item below with owner + a *measurable* done.
- **DO:** each working session, pull the top **Ready** item, ship it, move it to
  **Done**, add one line to STATUS.
- **VERIFY:** the next review checks whether shipped items moved their metric;
  ones that didn't come back to **Ready**.

Item format: `[ID] Title — owner · measure-of-done · source`
Owners: **[me]** buildable now · **[you]** decision/action · **[both]**.

---

## 🔴 BLOCKED — waiting on a decision/action (mostly [you])

- **[P-01] Gate #6 backtest — the edge verdict.** [you→me] · *done =*
  `backtest.py` outputs per-regime PF over ≥2yrs. · *blocked on:* Kite ₹500/mo.
  _The hinge — everything strategic waits on this._
- **[P-02] Fundamentals provider (agent P3).** [you→me] · *done =*
  `stock_observations.payload.fundamentals` non-null. · *blocked on:* source pick.
- **[P-03] TOTP headless auto-login (SE3).** [you→me] · *done =* a session starts
  with no manual token paste. · *blocked on:* Zerodha API/TOTP setup.
  _07-31 review: the manual-paste dependency just cost 2 consecutive trading
  days (07-30, 07-31 — both regular NSE sessions) — brain online + heartbeating
  but no START command, zero sessions/trades/advisor runs either day. Sharpens
  priority on this item once unblocked._
  _08-02 review: unresolved — still zero sessions since 07-29 (heartbeat
  confirms brain ONLINE, `current_cycle=0`, "Waiting for START command" as of
  08-02 04:39 UTC). No new trading weekday has passed since the 07-31 flag
  (08-01/08-02 are weekend), so the day-count hasn't grown, but the pipeline
  has now produced zero fresh data for a full calendar week — blocking VERIFY
  on [P-05], [P-07], [P-16] and the P-15/P-17 fixes below alike._
- **[P-04] Rotate Telegram bot token (+ anon key = unnecessary).** [you] · *done
  =* new Telegram token live, old dead. · *source:* Sprint 0 security fix.
  _08-03 audit ([reference/CRED_ROTATION.md](reference/CRED_ROTATION.md)):
  repos + full git history are clean (no secret ever committed); RLS verified
  airtight (sensitive tables service_role-only, rest deny-all, no rls_disabled
  errors). So the anon key is safe-by-design → **skip rotating it** (rotation
  would force a JWT-secret regen that also breaks service_role, for ~zero gain).
  The ONE real action is the **Telegram token** (was in Railway logs pre-scrub):
  BotFather → revoke → `railway variables --set TELEGRAM_BOT_TOKEN=… --service
  zerodha-brain`. Runbook has exact steps. Reduced from a 2-cred task to 1._

## 🟢 READY — pull these now (no blocker, [me])

- **[P-06] Module split part 2 — IN PROGRESS (scoring half done).** [me] · *done
  =* no file >600 lines, suite green. · *source:* SE4.
  _08-02–03 shipped: the **entire advisor family is now split and all <600** —
  `advisor_scoring.py` 554 (scoring/`advise`, brain `4cb62ce`) + `advisor_rotation.py`
  59 (rotation helpers, brain `a89b82d`), on top of part-1's advisor_risk/digest.
  **portfolio_advisor 1155 → 587**, behaviour-identical, suite 847 green, F-lint
  clean throughout. Patch-namespace hazards handled per split (weekly_trend
  repointed to advisor_scoring; rotation/news_sentiment untouched-safe).
  **Recommendation (08-03): cap the "<600" measure at the advisor family and
  treat the 3 core files as exempt.** Investigated each — all are high-risk /
  cosmetic-reward teardowns of the LIVE engine, not clean splits:
  • brain.py 2211 — one monolithic `TradingBrain` class; methods share `self`,
    so a split needs mixins/surgery on the trade engine.
  • database.py 1359 → **905** (08-03, brain `9e370ac`): first increment done —
    stock/observation/universe/level/advice-snapshot access (28 fns) extracted →
    `db_stocks.py` 479, referencing `database.supabase`/`_now_iso` at call time
    so the 33 `patch('database.supabase')` sites still bite (verified); facade
    re-export keeps all `db.<name>` callers unchanged. Suite 852, cov 88%. To
    reach <600 the CORE itself (client + sessions + trades + decisions, still
    >600) needs a further session/trade/candle split — safe via the same pattern,
    its own increment.
  • scheduler.py 854 — 64 `patch('scheduler.db')` + dense monkeypatching → any
    extraction risks mass patch-repointing.
  • config.py 632 — flat flag declarations, exempt.
  _Verdict: the advisor split delivered the maintainability value; forcing the
  engine/data-layer under 600 is disproportionate risk for a line count. Do them
  only if a genuine need arises (e.g. a file becomes a real merge-conflict/nav
  pain), one carefully-verified pass at a time._
- **[P-18] Advisor calibration is poor and non-monotonic.** [me] · *done =*
  ECE recomputed once graded_calls ≥ 50 (currently 22, most bins low-n);
  re-check monotonicity then — don't promote confidence into a scored input
  before it holds. · *source:* weekly review 08-02 gate re-measure — first
  recorded baseline: ECE 48.5%, `monotonic=false`, `built_at=2026-07-29`
  (unchanged since, no new advisor runs this week). DARK signal, no live
  impact yet — watch only.

## 🔨 IN PROGRESS

- _(none — Sprint 0/2 just shipped)_

## 🗓️ BACKLOG — after gate #6 / decisions

- **[P-08] FA1 client-profile layer** (horizon/risk/tax → advice conditioned on
  the person). [both]
- **[P-09] FA4 entry-quality on rotation targets — DARK, shipped 08-03** (brain,
  see Done). Weekly-downtrend refusal + single-name weight cap live as dark
  counterfactuals; correlated-cluster lever deferred (no cluster membership for
  non-held names yet). [me]
- **[P-10] FA3 regime-conditional factor weights (Pillar 3).** [me] · needs graded
  data across regimes.
- **[P-11] Promote daily/weekly alignment into the score** once it's gradeable
  (~early Aug) AND attribution shows it predicts. [me]
- ~~**[P-12] Agent P4 — per-stock timeline UI**~~ ✅ SHIPPED 08-03 (see Done).
- **[P-13] Activate Marketaux news key** → `news.sentiment` populates. [you→me]

## ⏸️ PARKED — explicitly deferred, revisit when raised

- **[P-14] Advisor active-testing "enhancer".** [both] · parked 2026-07-28 by user
  — "build a system to actively test the advisor page." Not scoped yet: does
  "test" mean (a) synthetic/adversarial holdings to probe `advise()` edge cases,
  (b) a live shadow-mode harness that re-runs the advisor against historical
  price paths to check verdicts hold up, (c) UI/E2E test coverage for
  `/advisor`, or (d) something else. **Do not build until re-raised** —
  surface it next time the advisor is discussed.

## ✅ DONE (recent — for burn-down + verify)

_2026-08-03_ (post-session review — first live verification since 07-29):
Two sessions ran today (morning `3fe00787` DAILY_STOP_3R, afternoon `1ef3f27f`
MARKET_CLOSED under the new soft-stop config), giving the pending fixes their
first real data:
- **[P-15]** confirmed — `stock_observations` today: PRE_OPEN 20 / POST_CLOSE
  20 / INTRADAY 40 (was 100% INTRADAY).
- **[P-07]** confirmed — 24 `OUTSIDE_OPEN_WOULD_BLOCK` rows logged.
- **[P-05]** directionally confirmed — `STOP_LOSS_HIT` −1.34R (11 trades),
  moved from −1.62R toward the ≈−1.25R target; small sample, keep watching.
- **Soft daily-stop config change** confirmed working as designed — 11
  `LIMIT_WOULD_STOP` counterfactual fires in the afternoon session, which ran
  to `MARKET_CLOSED` instead of cutting at `DAILY_STOP_3R`.
- git_sha stamped `9e370ac719df` on both sessions (not `unknown`).
- Gate metrics re-based on 447 closed trades (up from 370): PF 0.376→0.405,
  expectancy −0.408R→−0.394R, max drawdown ≈−₹6,697→≈−₹13,668 (expected — the
  soft-stop change lets sessions bleed further by design). No gate flip.
- **[P-17]** and **[P-19]** not falsified but also not exercised/checked this
  pass (no stall occurred; no log-table access to the LTP-400 count) — carry
  over.
- **[P-18]** unchanged — advisor recomputed today but still 22 graded calls /
  ECE 48.5%; stays watch-only per its measure-of-done (≥50 graded calls).

_2026-08-03_ (brain — code + suite green at 852; **pending deploy + live verify**):
- **[P-09] FA4 rotation entry-quality (DARK).** A rotation into a stronger score
  still needs to be a quality ENTRY. `rotation_entry_quality()` computes, per
  chosen target: weekly-downtrend (countertrend entry → `would_block`) + single-
  name weight vs `ROTATION_MAX_SINGLE_NAME_PCT` (over-concentration →
  `would_resize`). Plumbed `weekly` through score_universe → find_rotation_candidate
  → target. Flags stash on `indicators.rotation_entry_quality` (jsonb, migration-
  free, gradeable) + logged; only refuse/resize when `ROTATION_QUALITY_ENABLED`
  (default off — measure first, VISION §7). Correlated-cluster lever deferred
  (no cluster membership for non-held names). +5 tests.

_2026-08-03_ (dashboard, auto-deploys from main on Vercel):
- **[P-12] Per-stock timeline UI.** The agent's `stock_observations` (price /
  trend_score / verdict per capture) were collected since P1/P2 shipped but
  never surfaced. New `/advisor/timeline` page + `/api/advisor/timeline` route:
  per-holding card with an inline-SVG price sparkline + a verdict-dot path
  (oldest→newest, same verdict palette as /advisor), sorted freshest-observed
  first. Sidebar nav link added. No new deps; tsc + lint + `next build` clean;
  data-shape verified against prod (every symbol has price+verdict+score points).

_2026-08-02_ (code written + suite green locally at 847; **pending commit + deploy + live verify**):
- **[P-05] Stop-execution fill cap.** Root cause of the −1.62R STOP_LOSS_HIT
  bucket = poll latency: the ~30s exit checker fills at whatever price the poll
  caught, already drifted past the stop. Fix models a resting broker-side
  stop-market order: `config.PAPER_STOP_SLIPPAGE_CAP_R` (default 0.25) caps the
  stop-exit fill a bounded band past the stop → worst STOP_LOSS_HIT ≈ −1.25R,
  genuine slippage inside the band kept, no fill ever better than the stop, MAE
  stays honest (real low recorded before the capped fill). Only STOP_LOSS_HIT
  is capped (target/time-stop/cover untouched). +8 tests (`test_stop_fill_cap.py`),
  2 exit-latency tests updated to pin cap=0. _VERIFY next session: re-measure
  the STOP_LOSS_HIT R bucket — should move from −1.62R toward ≈−1.25R._
- **[P-07] Trade-only-open dark flag.** `_open_window_gate` mirrors the
  cooldown dark-flag pattern: every entry after the open window (default 10:15
  IST, `OPEN_WINDOW_END_*`) logs an `OUTSIDE_OPEN_WOULD_BLOCK` counterfactual
  (deduped per symbol); only blocks when `TRADE_ONLY_OPEN_ENABLED`. Wired into
  both BUY + SHORT entry paths. +5 tests. _VERIFY: next session's activity feed
  shows WOULD_BLOCK rows; counterfactual-audit can then rank it._
- **[P-16] Regime read — RESOLVED as a no-op (premise false).** Ran the
  breakdown: `trades.regime` comes from `regime_detector.py`, whose vocabulary
  is only TRENDING/WEAK_TREND/UNKNOWN — **SIDEWAYS/BEARISH can never tag a
  trade** (that's the separate market-level `market_regime.py`). So "TRENDING
  vs SIDEWAYS/BEARISH" is untestable: the strategy enters on ADX>threshold =
  TRENDING by construction (268/289 trades TRENDING, 21 WEAK_TREND, 0 other).
  TRENDING PF 0.42 / −0.384R vs WEAK_TREND PF 0.17 / −0.712R (n=21, small).
  The 07-28 (PF 0.65) vs 07-29 (PF 0.18) gap that seeded this is **both
  TRENDING** — within-regime variance (per-session PF spans 0.04→1.03), not a
  regime effect. DAILY_STOP_3R firing on consecutive TRENDING sessions is the
  base case, not a signal. No live action; a real regime-conditional test needs
  the market-level labels + multi-regime history = gate #6 ([P-01]).

_2026-08-02_ (brain `642ed94`, deployed):
- **[P-19] Killed the `/quote/ltp` 400-InputException spam.** The paper broker
  called `/quote/ltp` on every fill, but that endpoint 400s on a retail enctoken
  (same reason as `TRADING_MODE_FORCE=HOLDINGS_ONLY`) — so it always failed and
  the fill fell back to `hint_price` anyway, leaving a guaranteed-failing HTTP
  call + a `[PAPER] LTP fetch failed … 400` log line per fill flooding session
  logs. Fix: `config.PAPER_QUOTE_LTP_ENABLED` (default off) skips the doomed
  call; zero behaviour change (hint_price was already the effective path). +2
  tests, suite 834 green. _source: live log investigation 07-28._

_2026-07-30_ (brain `e81f706`, deployed):
- **[P-15] pre/post timeline capture fixed** — root cause: `_capture_stock_timeline`
  deduped on a rolling 1h window, so the 15:35 POST_CLOSE snapshot was deduped
  against the ~15:2X intraday refresh and never inserted. Fix = phase-aware dedup
  (INTRADAY hourly; PRE_OPEN/POST_CLOSE once-per-phase-per-day). _VERIFY next
  session: `stock_observations` shows POST_CLOSE rows (+ PRE_OPEN when the token
  is live before 09:14)._
  _08-02: still can't verify — `stock_observations` is still 100% `INTRADAY`
  (80 rows, unchanged from 07-29) because zero sessions have run since the fix
  deployed (see [P-03] above). Not a regression, just untested — carries over
  to next actual session._
- **[P-17] advisor stall hardened** — staleness self-heal (reset `_advisor_running`
  after >10min) + gate-decision logging (running / skip:no-token). _VERIFY: a
  future stall shows `[SCHEDULER] advisor gate → …` in logs + self-recovers._
  Note: PRE_OPEN still needs the token live before 09:14 — the real cure is the
  daily-token dependency ([P-03] TOTP), which both 07-28/07-29 incidents argue for.
  _08-02: no stall to observe either way — the advisor hasn't run at all since
  07-29 (no session, no token). Verify carries over to the next real run._

_2026-07-27:_ Sprint 0 (token scrub, RLS hole closed, EDGE-UNVERIFIED banner,
−3R hard stop) · Sprint 2 (CI both repos, `deploy.sh`, module split part 1) ·
T4 trade-quality first read · docs reorg (both repos).
_2026-07-26:_ advisor portfolio-risk v2 (correlation) · Telegram digest line ·
Pillar-1 calibration infra · per-stock agent P1 + P2 · 4 UI enhancements.

---

## Cadence (the scheduled loop)

- **Per session (weekdays post-close):** an agent runs the audit skills, appends
  any findings here as new items, moves shipped items to Done, updates STATUS.
- **Weekly (weekend):** an agent runs a deeper review — re-measures PF /
  expectancy / drawdown + advisor calibration ECE, checks whether Done items
  moved their metric (VERIFY), refreshes the burn-down, and flags anything that
  regressed back to Ready.
**Live routines** (managed via `/schedule`; edit at claude.ai/code/routines):
- **Post-session review** — `trig_01SfvoCZ5tb7kecKwU6koDrY`, weekdays 16:30 IST
  (`0 11 * * 1-5` UTC). Reads the day's metrics, drains shipped items to Done,
  adds findings, updates STATUS + this board.
- **Weekly review** — `trig_01KWSXfHW5Q2r4sYbzNiqUtR`, Sundays 10:00 IST
  (`30 4 * * 0` UTC). Re-measures gate metrics, VERIFIES Done items moved their
  measure, refreshes the burn-down.

Both are docs-only (never edit code) and evidence-based (no invented findings).
They commit `chore(review): …` to main.
