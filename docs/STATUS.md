# STATUS — where the project is right now

**The single source of truth for current state.** Update this in place; do not
create dated `HANDOFF_*` snapshots (those are archived). For the "why" see
[VISION.md](VISION.md); for what's next see [ROADMAP.md](ROADMAP.md).

_Last updated: 2026-08-03 (post-session review)._

---

## One-paragraph state

Month-long **paper-trading** validation of an intraday auto-trader (brain =
`~/Desktop/GITHUB/zerodha-brain`, Python on Railway; dashboard = `zerodha-trading`,
Next.js on Vercel; data in Supabase prod `gilmuwmtdpjccibfhqtx`). **The strategy
has no proven edge** — paper PF ≈ 0.40 cumulative over 447 closed trades / 7
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

## Deployed versions
- **Brain:** `9e370ac719df` (git_sha stamped live on both 08-03 sessions —
  confirms the git_sha fix still holds). Chain since 07-29: `c177bae` (07-29) →
  `e81f706` (07-30, P-15/P-17) → `642ed94` (08-02, P-19) → `96dddf4` (P-05/P-07)
  → `9e370ac` (08-03, database split increment).
- **Dashboard:** auto-deploys from `main` on Vercel. CI gates both repos on push.

## Recent fixes — VERIFIED LIVE on today's 08-03 sessions
- **[P-15]** per-stock PRE_OPEN/POST_CLOSE capture — **confirmed**:
  `stock_observations` today shows PRE_OPEN 20 / POST_CLOSE 20 / INTRADAY 40
  (was 100% INTRADAY pre-fix).
- **[P-07]** trade-only-open dark flag — **confirmed live**: 24
  `OUTSIDE_OPEN_WOULD_BLOCK` counterfactual rows logged today, ready for
  `/counterfactual-audit` to rank.
- **[P-05]** stop-execution fill cap — **directionally confirmed**: today's
  `STOP_LOSS_HIT` bucket averaged **−1.34R** (11 trades), moved from the
  pre-fix −1.62R baseline toward the ≈−1.25R target. Not fully there yet and
  still a small sample — keep tracking each session.
- **[P-17]** advisor scheduler — no stall occurred today (both advisor runs
  completed normally, `advisor_calibration_latest`/`portfolio_risk_latest`
  refreshed 04:53 UTC), so the self-heal path itself remains unexercised.
- **[P-19]** git_sha fix reconfirmed (`9e370ac719df`, not `unknown`); LTP-spam
  absence not directly checked this pass (no log-table access to the 400 count).

## Implemented 08-02 — code + tests green (847), NOT yet committed/deployed
- **[P-05]** stop-execution fill cap — `PAPER_STOP_SLIPPAGE_CAP_R` (0.25) caps
  STOP_LOSS_HIT fills a bounded band past the stop (models a resting stop-market
  order vs the naive ~30s poll-and-sell that booked the poll-latency tail as
  loss). Worst stop ≈ −1.25R vs the measured −1.62R. Only STOP_LOSS_HIT capped;
  MAE stays honest. +8 tests.
- **[P-07]** trade-only-open DARK flag — `_open_window_gate` logs
  `OUTSIDE_OPEN_WOULD_BLOCK` per post-open entry (default window end 10:15 IST);
  enforces only under `TRADE_ONLY_OPEN_ENABLED`. +5 tests.
- **[P-16]** resolved as a no-op — `trades.regime` only ever = TRENDING/WEAK_TREND;
  SIDEWAYS/BEARISH can't tag a trade, so the "TRENDING is worse" premise is
  untestable. Docs-only, no code. See PIPELINE Done.
_Next: commit both repos + `deploy.sh`, then verify below._

## The 7 measured sessions (edge evidence)
| Date | Trades | P&L | PF | Expectancy |
|---|---|---|---|---|
| 07-22 | 66 | −₹1,277 | 0.39 | −0.44R |
| 07-23 | 51 | −₹1,582 | 0.33 | −0.52R |
| 07-24 | 8 (short) | −₹144 | 0.22 | −0.43R |
| 07-28 | 65 | −₹709 | 0.65 | −0.24R |
| 07-29 | 32 (short — daily stop) | −₹918 | 0.18 | −0.52R |
| 08-03 AM | 30 (daily stop, pre-flag-flip) | −₹4,037 | 0.23 | −0.51R |
| 08-03 PM | 47 (full day, soft stop) | −₹1,639 | 0.66 | −0.23R |

Cumulative (all-time, 447 closed trades) ≈ **−144.1R**, PF **0.405**,
expectancy **−0.394R avg** — measured directly from `trades.r_multiple` this
pass (supersedes the earlier approximate −91.3R figure). Today's two sessions
added 77 trades / −26.2R combined; no gate flip (still deep reject zone, PF
gate is >1.3 go / <1.1 reject). **Standing conclusion unchanged: no edge yet →
gate #6 is the priority.** Max drawdown (peak-to-trough equity, all-time) is
now **≈−₹13,668** (was ≈−₹6,697) — expected under the 08-03 config change
(soft daily-stop now lets a session bleed past −3R by design rather than
hard-cutting), not treated as a new regression. Trade-quality first read (T4):
the **opening hour is the only +EV window**; detail in
[ROADMAP.md](ROADMAP.md) T4.

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

## ⏳ Open — needs the USER (each unblocks work)
1. 🔴 **Manual-token SPOF still open (item 5, TOTP).** 08-03 had two sessions
   (token pasted manually twice — morning + afternoon), so the pipeline is no
   longer starved and the P-15/P-05/P-07 fixes got their first live verification
   today (see above). But 07-30/07-31 were still lost to missed manual pastes,
   and today required two manual interventions in one day — the SPOF risk is
   unchanged until TOTP (item 5) lands.
2. 🔴 **Rotate the Telegram bot token** (was exposed in logs; scrubbed in code
   but rotate via @BotFather) + consider rotating the **Supabase anon key**
   (was effectively public until the 07-27 RLS fix).
3. **Kite ₹500/mo historical** decision → unblocks **gate #6** (the edge verdict).
4. **Fundamentals data source** pick (screener/NSE vs paid) → unblocks agent P3.
5. **Zerodha TOTP/API setup** → lets me wire headless auto-login (SE3).

## ✅ Verified live on 08-03 (first real session since 07-29)
- `trading_sessions.git_sha` = `9e370ac719df` on both sessions (not `unknown`). ✅
- `stock_observations`: PRE_OPEN 20 / POST_CLOSE 20 / INTRADAY 40 today — was
  100% `INTRADAY`; **[P-15] confirmed.** ✅
- **[P-05]** `STOP_LOSS_HIT` bucket = −1.34R today (11 trades), moved from
  −1.62R toward the ≈−1.25R target — directionally confirmed, not yet fully
  there; re-check next session. 🟡
- **[P-07]** 24 `OUTSIDE_OPEN_WOULD_BLOCK` rows logged today — **confirmed**,
  ready for `/counterfactual-audit` to rank. ✅
- `app_config.portfolio_risk_latest` + `advisor_calibration_latest` both
  refreshed 04:53 UTC on today's advisor run. ✅ (calibration itself unchanged:
  still 22 graded calls / ECE 48.5% — no new gradeable outcomes yet, [P-18]
  stays watch-only.)
- **[P-17]** no stall occurred today — advisor ran cleanly both times, so the
  self-heal path is still unexercised (not falsified, just untested). 🟡
- **[P-19]** not directly checked this pass (no log-table access to the 400
  count from these tools); git_sha continuing to stamp correctly is an
  indirect signal the same deploy path is healthy.

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
