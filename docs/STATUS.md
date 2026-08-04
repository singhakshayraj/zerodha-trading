# STATUS — where the project is right now

**The single source of truth for current state.** Update this in place; do not
create dated `HANDOFF_*` snapshots (those are archived). For the "why" see
[VISION.md](VISION.md); for what's next see [ROADMAP.md](ROADMAP.md).

_Last updated: 2026-08-04 close (post-session review: single full-day session, brain
`c689ed44cbf1` confirmed live, P-20 verified; merges earlier 08-04 verify pass)._

---

## One-paragraph state

Month-long **paper-trading** validation of an intraday auto-trader (brain =
`~/Desktop/GITHUB/zerodha-brain`, Python on Railway; dashboard = `zerodha-trading`,
Next.js on Vercel; data in Supabase prod `gilmuwmtdpjccibfhqtx`). **The strategy
has no proven edge** — paper PF ≈ 0.31 cumulative over 521 closed trades / 8
measured sessions; that's a valid outcome (VISION §7b), not a bug. The real
edge verdict is **gate #6** (a historical backtest), built but **blocked on
Kite historical data (₹500/mo — a user decision)**. Alongside the trader is a
**portfolio advisor** (daily HOLD/SELL on real holdings) which is where most
recent work has gone.

## ⚙️ Live config change 2026-08-03 — both sessions now COMPLETE, verified live
- **`ENFORCE_DAILY_STOP_3R=false`** set on Railway — the −3R daily stop is now a
  **soft counterfactual** (`LIMIT_WOULD_STOP`), not a hard cut, restoring true
  full-day data collection (user's stated goal). Reverts the 07-27 hard carve-out.
- Session params raised **25k→100k capital, 10→40 maxTrades**.
- **Two sessions ran 08-03, both COMPLETED:** morning `3fe00787` 04:00–04:48 UTC
  ended `DAILY_STOP_3R` (−₹4,037, 30 trades, PF 0.23, −0.51R — before the flag
  flip); afternoon `1ef3f27f` 06:23–09:51 UTC ended `MARKET_CLOSED` (−₹1,639, 47
  trades, PF 0.66, −0.23R) — **confirmed working as designed**: 11
  `LIMIT_WOULD_STOP` counterfactual fires logged (would've hard-stopped under
  the old flag) but the session ran the full day to close instead of cutting
  early. Combined today: 77 trades, −₹5,676, PF 0.44, −0.34R avg.

## 📈 2026-08-04 post-session — single full-day session, [P-20] verified live
Session `1042e121` 04:00–09:51 UTC, `COMPLETED`/`MARKET_CLOSED`, git_sha
`c689ed44cbf1` (first live run of the 08-04 night deploy). 90 trades, −₹10,827,
PF **0.158**, avg **−0.64R** — a weak day, inside the already-established
per-session PF range (0.04–1.03, see [P-16]). **[P-20] advisor-in-trading-loop
confirmed**: 42 advisor runs 04:23→09:45 UTC spanning the whole session, no
midday stall (was starving past ~11:50 pre-fix on 08-03). `stock_observations`
phases held: PRE_OPEN 20 / INTRADAY 120 / POST_CLOSE 20. Dark counterfactuals
fired: `REENTRY_WOULD_BLOCK` 56, `TIME_STOP_WOULD_FIRE` 40,
`OUTSIDE_OPEN_WOULD_BLOCK` 27, `LIMIT_WOULD_STOP` 7 (soft daily-stop fired but
the session still ran to `MARKET_CLOSED`, not `DAILY_STOP_3R` — soft-stop
still working as designed). Open-window (≤10:15 IST) vs after: **−0.63R
(n=10) vs −0.64R (n=80)** — converged, both negative; further dents the T4
open-window thesis (see FLAG log). `STOP_LOSS_HIT` **−1.40R** (13 trades) —
still above the ≈−1.25R [P-05] target, slightly worse than 08-03's −1.34R but
far below the −1.62R pre-fix baseline; small samples, keep watching.

## Deployed versions
- **Brain:** `c689ed44cbf1` (08-04 night: [P-20] advisor-in-trading-loop +
  database.py split to <600 + pa restored <600 — all behaviour-identical, suite
  855 green, deployed. **Confirmed live 08-04**: git_sha stamped on session
  `1042e121`, P-20 verified — see below). Prior:
- **Brain (08-03):** `9e370ac719df` (git_sha stamped live on both 08-03 sessions —
  confirms the git_sha fix still holds). Chain since 07-29: `c177bae` (07-29) →
  `e81f706` (07-30, P-15/P-17) → `642ed94` (08-02, P-19) → `96dddf4` (P-05/P-07)
  → `9e370ac` (08-03, database split increment).
- **Dashboard:** auto-deploys from `main` on Vercel. CI gates both repos on push.

## ✅ ALL fixes VERIFIED LIVE on the 08-03 sessions (brain `9e370ac`)
Two sessions ran 08-03 (autopilot 09:30 + a manual afternoon after the −3R-soft flip):
- **[P-05]** stop-fill cap — `STOP_LOSS_HIT` averaged **−1.34R** (11 trades) vs
  the pre-fix −1.62R baseline, worst −1.47R; short stops (COVER_SHORT) worst
  −1.39R. Blow-through gone; not fully at −1.25R + small sample, keep tracking.
- **[P-07]** trade-only-open — **24** `OUTSIDE_OPEN_WOULD_BLOCK` rows fired
  (still DARK). ⚠️ **counterfactual now says SKIP** — see FLAG log below.
- **[P-09]** rotation entry-quality — 9 well-formed `rotation_entry_quality`
  payloads on the official run; flags correctly quiet on UP/under-cap targets.
- **[P-15]** capture — PRE_OPEN 20 / INTRADAY 40 / **POST_CLOSE 20** (was 100%
  INTRADAY pre-fix). Both new phases land.
- **[P-17]** no stall (both advisor runs completed, calibration/risk refreshed) —
  self-heal path itself remains unexercised. **[P-19]** railway logs scanned
  clean, no `400`/LTP-spam; git_sha stamped `9e370ac719df`.
- **db_stocks split** — a full session's observation/universe/advice writes all
  succeeded (moved fns), no import errors.
- **−3R soft** (`ENFORCE_DAILY_STOP_3R=false`) — afternoon ran to `MARKET_CLOSED`
  full-day (not `DAILY_STOP_3R`), confirming full-day data collection restored.
- **[P-16]** stays a no-op (regime can't tag non-TRENDING). Docs-only.

## 🚩 FLAG ENABLEMENT LOG
- **Trade-only-open (P-07) → SKIP, keep DARK.** Counterfactual 08-03: the open
  window (≤10:15) was the *worst* bucket that day (−0.51R vs −0.23R after), and
  pooled across all clean days the open window is now **−0.23R (negative)** —
  degraded from T4's original +0.11R and **not directionally consistent** (08-03
  flipped the sign). The "open is the only +EV window" thesis no longer holds;
  do NOT enable. Re-measure as more full-day sessions accrue.
  _08-04: open (−0.63R, n=10) and after-open (−0.64R, n=80) converged — both
  negative, no exploitable spread either way. Reinforces SKIP, no new signal._
- Circuit-breaker (consec-loss): both 08-03 sessions lost more past it — WAIT
  (1 day; and data-collection intentionally logs-not-enforces it).

## The measured sessions (edge evidence)
| Date | Trades | P&L | PF | Expectancy |
|---|---|---|---|---|
| 07-22 | 66 | −₹1,277 | 0.39 | −0.44R |
| 07-23 | 51 | −₹1,582 | 0.33 | −0.52R |
| 07-24 | 8 (short) | −₹144 | 0.22 | −0.43R |
| 07-28 | 65 | −₹709 | 0.65 | −0.24R |
| 07-29 | 32 (short — daily stop) | −₹918 | 0.18 | −0.52R |
| 08-03 AM | 30 (−3R hard cut) | −₹4,037 | 0.23 | −0.51R |
| 08-03 PM | 47 (full-day, −3R soft) | −₹1,639 | 0.66 | −0.23R |
| 08-04 | 90 (full-day, −3R soft) | −₹10,827 | 0.16 | −0.64R |

_08-03 note: capital raised 25k→100k (so ₹ losses ~4× prior days; R is the
comparable unit). First full-day session (PM) since −3R went soft — PF 0.66,
still no edge. AM (in the "+EV" open window) was the **worst** bucket, PM (after
10:15) the best — inverting the T4 open-window thesis (see FLAG log)._

Cumulative (all-time, 521 closed trades) ≈ **−230.2R**, PF **0.310**,
expectancy **−0.442R avg** — measured directly from `trades.r_multiple` this
pass. 08-04's single full-day session added 90 trades / −₹10,827 (a weak day,
within the established per-session PF spread); no gate flip (still deep
reject zone, PF gate is >1.3 go / <1.1 reject). **Standing conclusion
unchanged: no edge yet → gate #6 is the priority.** Max drawdown (peak-to-
trough equity, all-time) is now **≈−₹23,200** (was ≈−₹13,668) — expected
under the soft daily-stop config (a session can bleed past −3R by design
rather than hard-cutting) plus today's weak session, not treated as a new
regression. Trade-quality note (T4): the "opening hour is the only +EV
window" thesis stays **dented** — 08-04's open vs after-open R (−0.63R vs
−0.64R) converged to both-negative, no spread left to exploit either way. See
the FLAG log; re-measure over more full-day sessions.

## Live subsystems (all shipped + deployed)
- **Advisor** — daily HOLD/SELL on real holdings; `/advisor` + command center.
  - portfolio-risk **v2**: single-name + sector concentration + measured
    return-**correlation** (effective_bets, clusters) + tax-loss-harvest.
  - **Pillar-1 calibration** (DARK): confidence→hit-rate reliability curve.
  - **Weekly confluence** + **daily/weekly alignment** (DARK, logged not scored).
  - **Grading loop**: first 21 calls graded (42.9% hit); factor attribution live.
- **Per-stock agent** — 24/7 observation timeline per holding (P1 mechanical
  capture + P2 pre-open/hourly/post-close scheduler). Fundamentals slot = null.
- **Trader** — paper engine, full-day sessions, rich decision/trade/candle capture.
  −3R daily stop now HARD even in data-collection mode.
- **Dashboard** — command center (Edge strip + EDGE-UNVERIFIED banner), /insights
  (PF + max-DD gate tiles), /advisor (calibration, correlation, day-over-day diff),
  /trading (RiskMeter).

## ⏳ Open — needs the USER
1. **Rotate the Telegram bot token** (only real cred left — was in runtime logs).
   BotFather → revoke → `railway variables --set TELEGRAM_BOT_TOKEN=… --service
   zerodha-brain`. Anon-key rotation is **unnecessary** (RLS airtight) — see
   [reference/CRED_ROTATION.md](reference/CRED_ROTATION.md). [P-04]
2. **Fundamentals data source** pick (screener/NSE vs paid) → unblocks agent P3. [P-02]

_Deprioritized by the user (do not foreground): **P-01** Kite ₹500 historical
(gate #6) and **P-03** TOTP auto-login. Sessions now run daily via autopilot
(token paste before 09:15, or the manual afternoon restart pattern) — the
"no sessions" constraint is resolved for now._

## ✅ Verify list — ALL CLEARED 2026-08-03
Every deployed fix verified live against the 08-03 sessions (see the VERIFIED
LIVE section at the top). Nothing pending verification. Calibration itself
unchanged (still 22 graded calls / ECE 48.5% — no new gradeable outcomes yet,
[P-18] stays watch-only). New findings from the 08-03 audit: **P7** (full-day
sessions starve advisor refresh) + **P8** (inplay) in
[reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md); trade-only-open ruled
SKIP (FLAG log above).

## Feedback loop (live)
Project-level flywheel (mirrors VISION §7): REVIEW → TRIAGE → [PIPELINE.md](PIPELINE.md)
→ DO daily → VERIFY. Two scheduled cloud agents keep it timely:
- **Post-session review** — weekdays 16:30 IST — drains shipped items, adds findings.
- **Weekly review** — Sundays 10:00 IST — re-measures gate metrics + verifies impact.

The board is [PIPELINE.md](PIPELINE.md): pull the top **Ready** item each session.

## Routine
- Post-session audits: `/post-session-check`, `/counterfactual-audit` skills.
- Advisor grading: `zerodha-brain/scripts/grade_advice.py [--attrib-only]`.
- Prod Supabase `gilmuwmtdpjccibfhqtx`; timestamps are **UTC** (IST = UTC+5:30).
