# STATUS — where the project is right now

**The single source of truth for current state.** Update this in place; do not
create dated `HANDOFF_*` snapshots (those are archived). For the "why" see
[VISION.md](VISION.md); for what's next see [ROADMAP.md](ROADMAP.md).

_Last updated: 2026-08-02._

---

## One-paragraph state

Month-long **paper-trading** validation of an intraday auto-trader (brain =
`~/Desktop/GITHUB/zerodha-brain`, Python on Railway; dashboard = `zerodha-trading`,
Next.js on Vercel; data in Supabase prod `gilmuwmtdpjccibfhqtx`). **The strategy
has no proven edge** — paper PF ≈ 0.35 avg over 5 measured sessions; that's a
valid outcome (VISION §7b), not a bug. The real edge verdict is **gate #6** (a
historical backtest), built but **blocked on Kite historical data (₹500/mo — a
user decision)**. Alongside the trader is a **portfolio advisor** (daily HOLD/SELL
on real holdings) which is where most recent work has gone.

## ⚙️ Live config change 2026-08-03 (read before interpreting today's sessions)
- **`ENFORCE_DAILY_STOP_3R=false`** set on Railway — the −3R daily stop is now a
  **soft counterfactual** (`LIMIT_WOULD_STOP`), not a hard cut, restoring true
  full-day data collection (user's stated goal). Reverts the 07-27 hard carve-out.
- Session params raised **25k→100k capital, 10→40 maxTrades**.
- **Two sessions today (08-03):** morning `3fe00787` 09:30–10:18 ended
  `DAILY_STOP_3R` (−₹4,037, 30 trades — this was BEFORE the flag flip); afternoon
  `1ef3f27f` started 11:53 manually, runs to EOD with −3R soft. Expect the
  afternoon to bleed **past −3R by design** — that's the full-day data, not a
  regression. All 08-02/08-03 fixes verified live (see PIPELINE Done / below).

## Deployed versions
- **Brain:** `642ed9415c02` (deployed 08-02 via `zerodha-brain/scripts/deploy.sh`;
  GIT_SHA env set to match). Chain since 07-29: `c177bae` (07-29 session) →
  `e81f706` (07-30, P-15/P-17 fixes) → `642ed94` (08-02, P-19 fix).
- **Dashboard:** auto-deploys from `main` on Vercel. CI gates both repos on push.

## Recent fixes — DEPLOYED but NOT yet verified live (no session since 07-29)
- **[P-15]** per-stock PRE_OPEN/POST_CLOSE capture — phase-aware dedup fix
  (POST_CLOSE was being hourly-deduped by the ~15:2X intraday refresh). `e81f706`.
- **[P-17]** advisor scheduler stall — staleness self-heal + gate logging. `e81f706`.
- **[P-19]** killed the `/quote/ltp` 400-InputException log spam on every paper
  fill (retail token can't use /quote; hint_price was always the real path). `642ed94`.
- **git_sha fix** — validated once (07-28/29 sessions stamped a real SHA, not
  `unknown`). Next session should stamp `642ed9415c02`.
_All three carry over to the next real session for verification (see below)._

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

## The 5 measured sessions (edge evidence)
| Date | Trades | P&L | PF | Expectancy |
|---|---|---|---|---|
| 07-22 | 66 | −₹1,277 | 0.39 | −0.44R |
| 07-23 | 51 | −₹1,582 | 0.33 | −0.52R |
| 07-24 | 8 (short) | −₹144 | 0.22 | −0.43R |
| 07-28 | 65 | −₹709 | 0.65 | −0.24R |
| 07-29 | 32 (short — daily stop) | −₹918 | 0.18 | −0.52R |

Cumulative ≈ −91.3R (was −74.6R); 07-29 tape tagged TRENDING throughout (32/32
trades), win rate 12.5% (4/32) vs 30.8% on 07-28 — **worst PF of the 5
measured sessions.** Session ended via `DAILY_STOP_3R`, the 2nd consecutive
session to hit the hard stop (07-28 also did) — the −3R cap is doing its job
capping losses, but two early cutoffs in a row is worth a regime-conditional
look (see [P-16]). **Standing conclusion unchanged: no edge yet → gate #6 is
the priority.** Trade-quality first read (T4): the **opening hour is the only
+EV window**; stops are blown through — 07-28's STOP_LOSS_HIT bucket (6 trades)
averaged **−1.87R** (07-29: 3 trades, −1.33R, small sample — session cut short),
worse than the T4 baseline of −1.59R, so [P-05] has not yet landed. Detail in
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
1. 🔴🔴 **THE binding constraint right now — no sessions are running.** Paste the
   enc_token before 09:15 IST to start a session (or set up TOTP, item 5). **Zero
   sessions since 07-29** — 07-30 + 07-31 were regular NSE trading days but no
   token was pasted, so nothing started (brain is ONLINE + heartbeating, stuck at
   `current_cycle=0, "Waiting for START command"`). Every code bug is fixed and
   deployed, but the whole pipeline (P-15/P-17/P-19 verification, P-05/P-07/P-16
   data, calibration accrual) is **starved because no sessions run.** This is 4
   sessions now degraded/lost to the manual-token SPOF (07-28 stall, 07-29 late,
   07-30/31 missed) — the strongest possible case for TOTP (item 5).
2. 🔴 **Rotate the Telegram bot token** (was exposed in logs; scrubbed in code
   but rotate via @BotFather) + consider rotating the **Supabase anon key**
   (was effectively public until the 07-27 RLS fix).
3. **Kite ₹500/mo historical** decision → unblocks **gate #6** (the edge verdict).
4. **Fundamentals data source** pick (screener/NSE vs paid) → unblocks agent P3.
5. **Zerodha TOTP/API setup** → lets me wire headless auto-login (SE3).

## ✅ Verify on the NEXT real session (the P-15/P-17/P-19 fixes are untested live)
- `trading_sessions.git_sha` = **`642ed9415c02`** (not `unknown`).
- `stock_observations` now shows **POST_CLOSE** rows (and PRE_OPEN if the token is
  live before 09:14) — was 100% `INTRADAY`; the [P-15] fix should change that.
- Session logs show no `[PAPER] LTP fetch failed … 400` spam ([P-19] fix).
- If the advisor ever stalls: logs show `[SCHEDULER] advisor gate → …` and it
  self-recovers within 10 min ([P-17]).
- `app_config.portfolio_risk_latest.correlation` + `advisor_calibration_latest`
  refresh on the advisor run.
- **[P-05]** re-measure the `STOP_LOSS_HIT` R bucket — should move from −1.62R
  toward ≈−1.25R; watch for `[stop_cap]` log lines on stop fills.
- **[P-07]** activity feed shows `OUTSIDE_OPEN_WOULD_BLOCK` rows for post-10:15
  entries → counterfactual-audit can rank the trade-only-open filter.

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
