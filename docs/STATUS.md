# STATUS — where the project is right now

**The single source of truth for current state.** Update this in place; do not
create dated `HANDOFF_*` snapshots (those are archived). For the "why" see
[VISION.md](VISION.md); for what's next see [ROADMAP.md](ROADMAP.md).

_Last updated: 2026-08-06 (mid-session VERIFY pass — git_sha `c5fd525` confirmed
live and paper books seeded, closing [P-22] + [P-23]; the "grading backlog" was
a false alarm (MACRO 30d horizon, not starvation); P-05 sample + both audits
still pending market close)._

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
still above the ≈−1.25R [P-05] target, slightly worse than 08-03's −1.34R.
**Root-caused + re-fixed post-session:** the cap correctly clamped the stop
*reference/hint* to −1.25R (`execution.exit.reference_price`), but the paper
broker then re-applied `PAPER_SLIPPAGE_PCT`+charges on top of it, re-widening
the realized fill to −1.4/−1.6R (short stops hid the same under `COVER_SHORT`).
Fixed brain `b09904fe55fb` (`model_stop` flag skips the double slippage on
STOP_LOSS_HIT exits, charges kept). **Re-verify next session** → ≈−1.25R − charges.

## 📈 2026-08-05 post-session — normal-range day, P-05 re-fix STILL unverified
Session `3903c7e1` 06:16–09:51 UTC, `COMPLETED`. 41 trades, **−₹1,604**, PF
**0.554**, avg **−0.230R** — back inside the established per-session PF range
(0.04–1.03), a rebound from 08-04's weak 0.158. **⚠️ git_sha stamped
`c689ed44cbf1`** — same build as 08-04, **not** `b09904fe55fb` (the P-05
double-slippage re-fix STATUS recorded as deployed post-08-04). Either the
Railway deploy didn't actually go live or the stamp is stale — either way
the re-fix is **still unverified**: only 1 `STOP_LOSS_HIT` fired today
(−1.157R, n=1 — too small to read either way). Re-check the Railway deploy
before next session ([P-23]). Advisor ran normally: 540 advice rows, last
09:45 UTC (no stall, [P-20] still holding). Grading: 28 graded calls (was
21), 39.3% hit (was 42.9%) — still DARK/small-n, [P-18] watch-only.
⚠️ **New gap:** `advisor_paper_equity`/`advisor_paper_positions` are **0
rows** — today was the first official session since [P-14] Phase 2 shipped,
which should have seeded/snapshotted both books ([P-22]).

## 🛠️ 2026-08-06 — deploy incident root-caused + fixed, P-21 edge study, fixes
- **Deploy pipeline was broken (root cause of the 08-05 git_sha mismatch).** The
  brain service **auto-deploys from GitHub**, but `deploy.sh` only did `railway
  up` (local tarball) and never pushed — so a GitHub rebuild reverted to
  `c689ed4` and the P-05 + paper commits ran nowhere ([P-23]). **Fixed:** pushed
  (git_sha confirmed `a2d9881` live mid-session), then `deploy.sh` reworked to
  push-based + hard-abort on unpushed/dirty/non-main. **Deploy = `git push` now.**
- **Grading was starving on a real bug, not just cadence.** The session-start
  catch-up built a **cold** MarketData → `get_candles` fell back to `/quote`
  (400s on a retail token) → no candles → rows wrongly "not-due". **Fixed** by
  warming holdings (`489d6b5`); backfill drains next session.
- **[P-21] edge study — decisive NO-edge** (needs no token). In-sample a strong
  rule appeared (SHORT+morning+STRONG +0.44R) but **collapsed out-of-sample** —
  no feature-based entry edge; `confidence_score` + `trend_tells` gate don't
  predict. Edge verdict still rests on gate #6.
  [reference/EDGE_STUDY_P21.md](reference/EDGE_STUDY_P21.md).
- **Track C labeling unstarved** — was manual/unrun since 07-23; now auto-runs
  each session (`c5fd525`) + backfilled 07-24→08-05.
- **Dashboard — mobile overhaul + UX polish (all shipped, Vercel auto-deploys):**
  - **Mobile app-shell (`5c169f4`)** — root cause of the Android-Chrome scroll
    jank + hidden content was `position:fixed` bars over a scrolling `<body>`
    (URL-bar hide/show → jump) and a 2-row nav taller than the padding. Now the
    app is `h-dvh overflow-hidden`, `<main>` is the sole scroll container
    (`flex-1 min-h-0 overflow-y-auto`), and the mobile header/nav are normal-flow
    (`order-first`/`order-last`, not fixed). Body never scrolls → URL bar stays
    put → no jank; nav in flow → nothing hidden. **⚠️ user to re-confirm on a
    real Android device** (emulation never reproduced it).
  - Bottom nav slimmed to a **single row** of 8 (short labels, `45199b9`).
  - Advisor page redesigned for scannability/mobile (collapsible analytics,
    mobile-safe calibration bars). Hard-refresh `/connect` bounce fixed
    (`hydrated` gate, `edf72d7`).
  - UX: per-section browser-tab titles; refresh-on-tab-focus (home/advisor/
    insights); confirm-before-disconnect; tap-active-tab-to-scroll-top;
    overscroll containment; `aria-current`; Android `text-size-adjust`.

## ✅ 2026-08-06 VERIFY pass — 2 of 4 cleared, 1 was a false alarm
Session `16f23213` started 04:25:53 UTC (09:55 IST), **still RUNNING** at the
time of this pass (mid-session read, not a post-close audit).
1. **git_sha ✅ CLEARED** — session stamps **`c5fd5254f157`**. The whole 08-06
   brain chain is live; the deploy-pipeline fix ([P-23]) holds. **Closes [P-23].**
2. **[P-14 P2] paper books ✅ CLEARED** — both books seeded at 04:31 UTC on the
   official advisor run. `[paper] seeded MANAGEMENT: 20 holdings` + `seeded
   PICKING: ₹100,000 cash`, then same-minute snapshots. `advisor_paper_positions`
   42 rows (MANAGEMENT 29 = 13 open SEED + 16 closed SEED + 7 open ROTATION;
   PICKING 6 open SCAN), `advisor_paper_equity` 2 rows:
   **MANAGEMENT ₹618,714 vs baseline ₹620,695** (−0.32% alpha), **PICKING
   ₹99,400 vs ₹100,000** (−0.60%). Nifty 24,627.15. **Closes [P-22]** —
   `/advisor/accountability` now has real data instead of empty-state.
3. **Advisor grading — ❌ premise was WRONG, there is no backlog bug.** Graded
   went 28→31 (+3), not the predicted jump. Root cause of the *expectation*, not
   of a defect: **~85% of advice rows are `trigger_type=MACRO`, which
   `horizon_for()` puts on a 30-trading-day horizon, not 10.** Measured across
   every official run: **every due MICRO row is graded, 100%, with zero
   misses** — 07-12 1/1, 07-14 1/1, 07-22 2/2, 07-23 4/4, 07-24 3/3. Every
   remaining "matured" row is MACRO and genuinely not due yet. Live pass log
   confirms a clean mechanism: `queued=192 graded=3 not_due=189 errors=0`, no
   `no instrument token`, one unrelated 400. So the "~38 matured rows" figure in
   the 08-05/08-06 notes counted MACRO rows at a MICRO horizon. **Grading is
   healthy; the cold-cache fix (`489d6b5`) is not falsified — it just wasn't the
   binding constraint.** Expect the first MACRO wave ~**08-24** (the 07-12 batch,
   19 rows) and 07-22's ~**09-02**; MICRO adds ~3/session. Practical effect:
   **[P-18]'s ≥50-graded gate lands late August, not this week.** Diagnostic
   hardened so this can't recur — the pass log now splits `not_due` by horizon
   (`[10d=… 30d=…]`, brain `054f2c6`, suite 867 green, **committed not pushed**).
4. **[P-05] STOP_LOSS_HIT ≈ −1.25R — ⏳ still pending.** Session was ~40 min old
   with 7 trades and no closed `r_multiple` rows yet. Carry to post-close.
5. `/post-session-check` + `/counterfactual-audit` — ⏳ pending market close
   (10:00 UTC). Not run: auditing a live session would misreport.

⚠️ **Deploy note:** brain `054f2c6` is committed but **deliberately unpushed** —
push auto-deploys, which would restart the brain and truncate the running
session. Push after close.

⏳ **Still unverified — [me→you]:** the Android mobile scroll/hidden-content fix
(`5c169f4`). User hasn't checked on a real device yet (asked 08-06). Re-ask; if
still broken, get a screenshot + the specific page/symptom **before** changing
anything — emulation never reproduced the original bug.

## Deployed versions
- **Brain:** `c5fd525` (08-06: auto-label decisions each session — Track C
  unstarve). Chain today: `b09904` (P-05 re-fix) → `91a4836` (grade-on-session-
  start) → `a2d9881` (paper-portfolio P-14·2) → `489d6b5` (holdings-warm grading
  fix) → `5b910a2` (deploy.sh push-based) → `c5fd525`. **All confirmed live** via
  git_sha `a2d9881` on the 08-05 session (later commits deployed same day, brain
  idle). Prior:
- **Brain:** `b09904fe55fb` (08-04 post-session: **P-05 double-slippage fix** —
  `model_stop` flag skips the broker's re-applied slippage on STOP_LOSS_HIT exits
  (the resting-stop cap already models it), charges kept. Suite 856 green). Prior:
- **Brain:** `c689ed44cbf1` (08-04 night: [P-20] advisor-in-trading-loop +
  database.py split to <600 + pa restored <600 — all behaviour-identical, suite
  855 green. **Confirmed live 08-04**: git_sha stamped on session
  `1042e121`, P-20 verified). Prior:
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
- **Full counterfactual audit 2026-08-06 (444 closed trades / 9 days):**
  - **Trend-tells gate → WAIT (strongest, but defensive-only).** The trades it
    would BLOCK (`permits_entry=false`) average −0.456R vs the KEEP bucket
    (`true`) −0.264R, **directionally consistent 8 of 9 days** (only 07-23
    inverts) — a real, stable loss-separator on live trades. BUT the kept bucket
    is **still negative** almost every day (only 08-05 +0.13R) → it *reduces
    bleed, doesn't create edge*, and enabling blocks **81%** (358/444) of trades,
    blinding the data collection that's the current mode's whole purpose. #1
    filter to enable for a live-money phase / once data-collection ends; **not
    now.** (Note: this sign is opposite [P-21]'s walk-forward-label result —
    real-taken-trades vs all-hypothetical-decisions are different populations.)
  - **Market-direction → SKIP (no-op).** The tape is ~all `SIDEWAYS` (no BULLISH;
    only 6 BEARISH shorts), so there's nothing counter-direction to suppress —
    same dead-end as [P-16].
  - **Time-stop → SKIP.** The cleanly time-cuttable bucket (`SESSION_END` losers,
    n=50) is small + mild (−₹1,097, −0.21R, mfe +0.33); the real losers are
    `BRAIN_SIGNAL` (−0.63R, mfe +0.04 — wrong from entry) + `STOP_LOSS_HIT`
    (−1.43R, the pre-P-05-fix double-slippage), neither time-cuttable.
  - **Soft −3R:** continuing past the −3R marker **lost more every day** (07-22
    −₹474, 07-23 −₹695, 08-04 −₹7,809 after the marker) — the hard stop has real
    trading value, but soft is the deliberate DATA choice. No flag flip.
  - **Net: no flag earns ENABLE.** Reinforces [P-21] — no feature *creates* edge;
    trend-tells only *reduces* loss. The edge verdict stays on gate #6.

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
| 08-05 | 41 (full-day, −3R soft) | −₹1,604 | 0.55 | −0.23R |

_08-03 note: capital raised 25k→100k (so ₹ losses ~4× prior days; R is the
comparable unit). First full-day session (PM) since −3R went soft — PF 0.66,
still no edge. AM (in the "+EV" open window) was the **worst** bucket, PM (after
10:15) the best — inverting the T4 open-window thesis (see FLAG log)._

Cumulative (all-time, 562 closed trades) ≈ PF **0.334**, expectancy
**−0.424R avg** — measured directly from `trades.r_multiple` this pass.
08-05 added 41 trades / −₹1,604 (PF 0.554, back in-range after 08-04's weak
day); no gate flip (still deep reject zone, PF gate is >1.3 go / <1.1
reject). **Standing conclusion unchanged: no edge yet → gate #6 is the
priority.** Max drawdown (peak-to-trough equity, all-time) is now
**≈−₹24,879** (was ≈−₹23,200) — deeper, consistent with the soft daily-stop
design (a session can bleed past −3R rather than hard-cutting), not treated
as a new regression. Trade-quality note (T4): the "opening hour is the only
+EV window" thesis stays **dented** — 08-04's open vs after-open R (−0.63R
vs −0.64R) converged to both-negative, no spread left to exploit either way.
See the FLAG log; re-measure over more full-day sessions.

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
