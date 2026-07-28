# STATUS — where the project is right now

**The single source of truth for current state.** Update this in place; do not
create dated `HANDOFF_*` snapshots (those are archived). For the "why" see
[VISION.md](VISION.md); for what's next see [ROADMAP.md](ROADMAP.md).

_Last updated: 2026-07-28._

---

## One-paragraph state

Month-long **paper-trading** validation of an intraday auto-trader (brain =
`~/Desktop/GITHUB/zerodha-brain`, Python on Railway; dashboard = `zerodha-trading`,
Next.js on Vercel; data in Supabase prod `gilmuwmtdpjccibfhqtx`). **The strategy
has no proven edge** — paper PF ≈ 0.4 avg over 4 measured sessions; that's a
valid outcome (VISION §7b), not a bug. The real edge verdict is **gate #6** (a
historical backtest), built but **blocked on Kite historical data (₹500/mo — a
user decision)**. Alongside the trader is a **portfolio advisor** (daily HOLD/SELL
on real holdings) which is where most recent work has gone.

## Deployed versions
- **Brain:** `c177baeb157f` (seen live in the 07-28 session; STATUS previously
  tracked `4e2230113d7a` — redeployed between sessions, brain-repo commits not
  visible from this repo's `git log`).
- **Dashboard:** auto-deploys from `main` on Vercel. CI gates both repos on push.

## The 4 measured sessions (edge evidence)
| Date | Trades | P&L | PF | Expectancy |
|---|---|---|---|---|
| 07-22 | 66 | −₹1,277 | 0.39 | −0.44R |
| 07-23 | 51 | −₹1,582 | 0.33 | −0.52R |
| 07-24 | 8 (short) | −₹144 | 0.22 | −0.43R |
| 07-28 | 65 | −₹709 | 0.65 | −0.24R |

Cumulative ≈ −74.6R (was −58.9R); tape SIDEWAYS→BEARISH. 07-28 is the best PF
yet but still <1 — **standing conclusion unchanged: no edge yet → gate #6 is
the priority.** Trade-quality first read (T4): the **opening hour is the only
+EV window**; stops are blown through — 07-28's STOP_LOSS_HIT bucket (6 trades)
averaged **−1.87R**, worse than the T4 baseline of −1.59R, so [P-05] has not
yet landed. Detail in [ROADMAP.md](ROADMAP.md) T4.

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
1. **Paste enc_token before 09:15 IST** each session (daily; TOTP auto-login is
   built-but-dormant — see [ROADMAP.md](ROADMAP.md) SE3).
2. 🔴 **Rotate the Telegram bot token** (was exposed in logs; scrubbed in code
   but rotate via @BotFather) + consider rotating the **Supabase anon key**
   (was effectively public until the 07-27 RLS fix).
3. **Kite ₹500/mo historical** decision → unblocks **gate #6** (the edge verdict).
4. **Fundamentals data source** pick (screener/NSE vs paid) → unblocks agent P3.
5. **Zerodha TOTP/API setup** → lets me wire headless auto-login (SE3).

## ✅ Verify next session (after the ~09:20 advisor run)
- `trading_sessions.git_sha` populated (not `unknown`) — ✅ 07-28 (`c177baeb157f`).
- `app_config.portfolio_risk_latest.correlation` + `advisor_calibration_latest`
  populated — ✅ 07-28.
- `stock_observations` filling — incl a PRE_OPEN + POST_CLOSE row/day — ❌
  07-28: all 20 rows (100% all-time) are `phase='INTRADAY'`; zero PRE_OPEN or
  POST_CLOSE despite P2 scheduler marked shipped. See [P-15] in
  [PIPELINE.md](PIPELINE.md).
- `/advisor` renders calibration card, correlation, "What changed" diff —
  not verified this run (dashboard API host unreachable from this session's
  network policy; underlying data confirmed populated via Supabase directly).

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
