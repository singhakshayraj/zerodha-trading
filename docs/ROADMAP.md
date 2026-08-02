# ROADMAP — what's next

**The single forward plan.** Priorities, sprints, gates. Current state lives in
[STATUS.md](STATUS.md); the "why" and go/no-go gate definitions in
[VISION.md](VISION.md). Full three-lens system evaluation (2026-07-27) that
seeded this plan: [archive/SYSTEM_EVALUATION_2026-07-27.md](archive/SYSTEM_EVALUATION_2026-07-27.md).

_Last updated: 2026-08-02._

---

## 🎯 The hinge: run gate #6

Everything else is secondary to one question — **does the strategy have an
edge?** Paper PF ≈ 0.33 over 3 recent days is real but tiny-sample and
single-regime. The decisive test is **gate #6**: replay the production pipeline
over 2020–2022 historical data (bull/bear/chop). The harness (`backtest.py`) is
built; it is **blocked only on Kite Connect historical data (₹500/mo — a user
decision)**. Verdict thresholds (VISION §6.1): **PF > 1.3 = go, < 1.1 = reject.**

> Until gate #6 runs, the dashboard shows an **EDGE UNVERIFIED** banner and this
> roadmap treats every other item as enrichment.

## Sprint status

**Sprint 0 — safety + truth — ✅ DONE (2026-07-27).**
- Telegram token scrubbed from logs; RLS hole closed (8 tables incl
  `app_config`/enc_token were public read/write — rescoped to service_role).
- EDGE-UNVERIFIED banner. −3R daily stop now HARD in data-collection mode.
- _User follow-up: rotate Telegram bot token + Supabase anon key (STATUS §Open)._

**Sprint 1 — answer the question — ⏳ BLOCKED on the ₹500 Kite call.**
- Subscribe Kite historical → I build the chunked puller (interval caps + rate
  limits) → local Parquet → run `backtest.py` per regime. ~1 day once keys exist.

**Sprint 2 — de-risk the ops — ✅ DONE (2026-07-27), except SE3.**
- CI on both repos (brain py3.11 + coverage gate; dashboard tsc/lint/build).
- `zerodha-brain/scripts/deploy.sh` — `railway up` + GIT_SHA in one command.
- Module split part 1: `advisor_risk.py` + `advisor_digest.py` extracted.
- ⏳ **SE3 TOTP auto-login (P-03)** — built-but-dormant; needs user's Zerodha
  setup, then I wire + test headless daily token refresh. **Now the single
  highest-leverage unblock**: the manual-paste SPOF has cost 4+ sessions
  (07-28 stall, 07-29 late, 07-30/31 missed) and starved the whole pipeline.
- ⏳ **Module split part 2 (P-06)** — IN PROGRESS. **Advisor family fully split
  + all <600** (08-02–03): `advisor_scoring.py` 554 + `advisor_rotation.py` 59;
  portfolio_advisor 1155 → 587, behaviour-identical, 847 green. Remaining files
  are large structural refactors of the LIVE engine/data layer — deliberate
  passes only: brain.py 2211 (monolithic class), database.py 1359 (shared-client
  restructure), scheduler.py 854. config.py 632 = flat declarations, exempt.

**T4 hypotheses — 2 of 3 now landed (2026-08-02, dark/execution):**
- ✅ **fix stop execution (P-05)** — resting-stop fill cap, worst ≈−1.25R vs
  measured −1.62R. Deployed brain `96dddf4`; verify the bucket next session.
- ✅ **trade only the open (P-07)** — dark-flagged (`OUTSIDE_OPEN_WOULD_BLOCK`),
  logged-not-enforced; counterfactual-audit ranks it before any enable.
- ⏳ **suppress LONGs / afternoon** — not yet dark-flagged; lower priority than
  the two above, and gate #6 should confirm the direction/time effects first.
- Note [P-16] (regime-conditional read) came back a **no-op**: `trades.regime`
  is only ever TRENDING/WEAK_TREND, so there's no non-trending group to compare
  — a real regime test needs market-level labels + multi-regime history (= gate #6).

**Sprint 3 — make the advisor genuinely advisory (after the edge verdict):**
- **FA2 fundamentals provider** (agent P3) — needs the source pick, then P/E,
  earnings, results-delta, debt, promoter-holding as a DARK factor first.
- **FA1 client-profile layer** — income/goals/horizon/tax/cash-needs → verdicts
  conditioned on the person, not just the chart.
- **FA4 position-sizing / entry-quality** — cap single-name + correlated-cluster
  weight on rotation *into* names; refuse weekly-downtrend entries.
- **T4 trade-quality gate** — dark-flag → grade → enable on evidence (see below).
- **FA3 regime-conditional factor weights** (Pillar 3) — as graded calls accrue.

**Sprint 4 — god-mode polish:** agent P4 timeline UI; fused multi-factor
per-stock scoring; goal-based advice; activate the Marketaux news key.

## T4 — trade-quality first read (2026-07-27, LOW-CONF, one regime)
192 closed trades bucketed by hour/direction/regime/exit. Findings:
- ⭐ **Opening hour (09:xx) is the ONLY +EV bucket** (+0.11R, PF 1.22); expectancy
  falls monotonically through the day (13:00 = −0.59R). The edge (if any) is at
  the open.
- **LONG −0.58R worse than SHORT −0.37R**; **WEAK_TREND regime −0.84R** worst.
- 🔴 **STOP_LOSS_HIT averages −1.59R** (stops blown through — slippage/gap). An
  **execution bug fixable independent of edge** (stop-limit vs market / size down).

Testable hypotheses (confirm via gate #6, then dark-flag → grade → enable per
VISION §7): trade only the open; suppress LONGs/afternoon; fix stop execution.

## Standing principle
Change weights/gates **on evidence, never by hand** (VISION §7). New signals ship
DARK (logged + graded) and only earn a live weight once the grading shows they
predict. Applies to weekly confluence, daily/weekly alignment, calibration, and
every T4 hypothesis above.

## Done this arc (2026-07-25 → 27), for reference
Advisor: portfolio-risk v2 (correlation), Telegram digest line, Pillar-1
calibration infra. Per-stock agent P1 + P2. UI: command-center Edge strip +
EDGE-UNVERIFIED banner, /advisor calibration + correlation + day-over-day diff,
loading skeletons. Ops: security fixes, CI, deploy.sh, module split part 1.
