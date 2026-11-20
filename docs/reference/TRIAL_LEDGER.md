# Trial ledger — multiplicity haircut (Part C.5)

**The direct defence against this project's recorded failure mode:** selecting
on in-sample performance is measurably harmful (amihud: explore t = +4.18,
holdout −0.0109; the entry filter: nominal t = +3.0 across nine correlated
days, collapsed to −0.003R on the tenth). Every hypothesis this project has
ever tested is counted here, and the significance bar is raised for the count.

## The count

| trial family | count |
|---|---|
| entry edge study (P-21 original) | 1 |
| entry edge re-test (P-35) | 1 |
| short / pre-13:00 / trending entry filter | 1 |
| exit frontier — take-profit × stop-width pairings | 180 |
| advisor 7-factor reweighting variants | 8 |
| cross-sectional factors (12 × 4 cuts + 2 composites × 4) | 56 |
| advisor confidence discrimination (AUC) | 1 |
| open-window 09:30–10:30 cell | 1 |
| mom_12_1 dark-flag candidate | 1 |
| Part B verdict replay (MICRO + MACRO) | 2 |
| interim 0.631 alpha read | 1 |
| buy-call (rotation target) alpha vs Nifty 50 — 10d + 30d, registered 2026-11-11 before grading | 2 |
| thesis engine (advisor v2, shadow) — 126d + 252d alpha, registered 2026-11-11 before any row exists | 2 |
| hero picks (contrarian sleeve) — 252d alpha of the entry log, registered 2026-11-11 at first publish | 1 |
| universe calls (daily Nifty-500 scan verdicts, shadow) — 10d/30d alpha label, registered 2026-11-11 before any grade | 1 |
| second-account (Natwar) calls — 10d/30d alpha label, registered 2026-11-11 before any grade | 1 |
| sector layer on top of v1 — exposure-weighted edge vs v1, registered 2026-11-11 before any grade | 1 |
| S1 monthly momentum (CNC) + S1-T 200-DMA variant — pre-registered 2026-11-18, tested same day, failed | 2 |
| S5 live paper (S1-T re-registered, judged 2028-12-31) — registered 2026-11-19 before any output | 1 |
| advisor v1 cumulative read — all calls since 07-12, FM t ≥ 3.90 (2-look) at ≥ 60 dates, registered 2026-11-20 | 1 |
| P-70 intraday lab — 54 frozen variants (live paper + 2018–25 replay; all failed 2026-11-19) | 54 |
| P-70 lab experiments — [LAB_EXPERIMENTS.md](LAB_EXPERIMENTS.md) (X01–X03 registered 2026-11-20 before running) | 3 |
| **total** | **322** |

## The threshold

Harvey–Liu–Zhu style haircut (Bonferroni control across the count):

| trials | two-sided 5% z to clear |
|---|---|
| 1 | 1.96 |
| 50 | 3.29 |
| 265 | 3.73 |
| **322 (this project, 2026-11-20)** | **3.78** |

`advisor_eval.deflated_threshold(n_trials)` computes it. **Any new experiment
adds to the count and raises the bar; register it here before it runs.**

## Re-scoring the closed avenues under FM + the haircut

The deciding number is the **Fama–MacBeth across-date t**, compared to **3.72**.

| avenue | nominal | correct SE (FM) | vs 3.72 | status |
|---|---|---|---|---|
| entry filter (short/pre-13:00/trending) | t = +3.0 (9 corr. days) | converged to ≈0 (V-12) | fail | **closed, firmer** |
| exit frontier (180 pairings) | best still a loss at zero cost | — | fail | closed |
| advisor 7-factor reweighting (8) | Holm p = 1.000 | IC range 0.004 | fail | closed |
| cross-sectional factors (56) | nothing clears Holm OOS | — | fail | closed |
| advisor confidence (AUC) | 0.4917 | — | fail | closed |
| open-window cell | −0.410R, t = −4.70 | — | fail | closed (negative) |
| **interim 0.631 alpha hit** | Wilson CI excl. 0.50 | **FM t = 1.55 (17 dates)** | fail | **not a result** |
| **Part B verdict replay** | pooled ≈0.51 | **MICRO t=+1.56 (123d), MACRO t=−0.03 (41d)** | fail | **null, OOS** |

**No avenue changes from closed to open.** Several are now *more* firmly closed:
the bar is 3.72, and the best number this project ever produced (the entry
filter's nominal t = 3.0) fails even the un-haircut |t| ≥ 2 once the correct
Fama–MacBeth standard error is applied. The one thing that recently *looked*
open — the interim 0.631 — is confirmed a null by Part B's out-of-sample replay.

The most useful line: **nothing survives, and that costs the project nothing,
because it never traded on any of it.**

## Registered 2026-11-11 — buy-call grading (trials 254–255)

Written **before any result was computed**. Every official advisor row with a
`rotation_target_symbol` (189 rows, 2026-07-12 → 2026-11-09) is a BUY call
on the target. Label: target's close-to-close return over **10** and **30**
trading days from `run_date` minus Nifty 50's over the same bars; hit =
alpha > 0. Deciding statistic: Fama–MacBeth across-date t on the hit
indicator vs **0.50**, against **3.72**. The subset the operator actually
bought (`user_executions.followed_advice`) is reported descriptively only
(n is tiny). Separate from V-20 — the n=400 pool is untouched.
Tool: brain `scripts/grade_buy_calls.py`.

## Registered 2026-11-11 — thesis engine, shadow (trials 256–257)

Written **before any thesis row exists**. Spec:
`docs/superpowers/specs/2026-11-11-thesis-engine-design.md` [P-47]. Unit:
one (run_date, holding) thesis with action ∈ {HOLD, ADD, TRIM, EXIT}. Label:
the holding's close-to-close alpha vs Nifty 50 over **126** and **252**
trading days from `run_date`; hit = (action ∈ {HOLD, ADD}) == (alpha > 0).
Deciding statistic: Fama–MacBeth across-date t on (hit − 0.5) against the
then-current threshold. **Promotion** (v2 replaces v1 on the dashboard and
digest) requires the 252d t to clear it. Descriptive only: the equal-weight
HOLD/ADD basket minus Nifty at 252d. Tool: brain `scripts/grade_thesis.py`.
Not graded at 10/30 days, ever — that is the horizon already shown null.

## Registered 2026-11-11 — hero picks, contrarian sleeve (trial 258)

Written at the first publish (2 picks logged, none matured). Tool: brain
`scripts/hero_picks.py` → `app_config hero_picks_log` (symbol, entry_date,
entry_price). Unit: one first-seen pick. Label: close-to-close alpha vs
Nifty 50 over **252** trading days from `entry_date`; hit = alpha > 0.
Deciding statistic: Fama–MacBeth across-entry-date t on (hit − 0.5) against
the then-current threshold; with ≤ 8 picks a month this will take > 1 year to
mean anything, and the read is recorded either way. Descriptive only: the
equal-weight pick basket minus Nifty at 252d. No 10/30-day read, ever.

## Registered 2026-11-11 — universe calls (trial 259)

Written before any universe call is graded. Brain `universe_calls.py`; table
`universe_calls` (run_date, symbol). Unit: the advisor's verdict on every
Nifty-500 name the official run scans (~480/day), NOT just holdings. Label:
the holdings grader's market-neutral rule (`advisor_backtest.evaluate_verdict`,
`outcome_correct_alpha`) at 10d MICRO / 30d MACRO. Deciding statistic:
Fama–MacBeth across-date t on (hit − 0.5) against the then-current threshold;
**dates are the unit of independence**, not rows — 480 rows on one date are
one observation. First read at ≥ 60 graded dates. Purpose is breadth (sectors,
regimes, fundamentals quality alongside price), not a second shot at the
n = 400 read: the 164-date V-18 replay of the same scorer is null, and a
positive here is an anomaly to explain under V-20's rule, not a discovery.

## Registered 2026-11-11 — second-account calls (trial 260)

Brain `account_preview.log_calls` → table `account_calls` (account, run_date,
symbol); first preview of the day is the call. Label and statistic as the
holdings read (market-neutral `outcome_correct_alpha`, 10d MICRO / 30d MACRO;
Fama–MacBeth across dates vs the then-current threshold). Same algorithm on a
different book: a read here tests generalisation, not a new signal. First
read at ≥ 60 graded dates; never pooled into the primary n = 400.

## Registered 2026-11-11 — sector layer vs v1 (trial 261)

Rules fixed in brain `sector_tilt.py` (STRONG +30, WEAK −30, MIN_NAMES 5);
not to be tuned on outcomes. Live as the shown call on the second account
only; shadow on universe_calls. Unit: a graded call where the layer's
verdict differs from v1. Statistic: per-call edge = (keep(layer) − keep(v1))
× alpha vs Nifty, keep = HOLD 1 / TRIM 0.5 / SELL 0; Fama–MacBeth t across
run_dates of the per-date mean, vs the then-current threshold. Universe and
second-account read separately, never pooled. Hit-rate is descriptive (the
binary label cannot see SELL→TRIM). First read at ≥ 60 dates with a
differing graded call. Tool: `scripts/compare_sector_tilt.py`.

## Tested 2026-11-18 — S1 monthly momentum, CNC (trials 262–263)

Pre-registered and hashed before any backtest output (outside chat session,
kit `s1_momentum_kit.zip`): [s1_momentum/PREREG.md](s1_momentum/PREREG.md),
sha256 `c251d8e2…5e5158`, 2026-11-18T09:33:56Z. Results:
[s1_momentum/RESULTS.md](s1_momentum/RESULTS.md). Top 10 of the top-200
liquid names by 6/12-month vol-scaled momentum, monthly at 15:25, ₹50k,
Zerodha CNC costs. Data: ganeshbiyer/nse_historical_data (today's Nifty 500,
survivor-biased), 2019–23 in-sample, 2024–25 holdout.

- **262 S1:** holdout −3.1%/yr vs Nifty +9.7% → fails its own rule
  (needed > 4.7%). In-sample t = +3.30, below 3.72. **Closed.**
- **263 S1-T** (+ Nifty 200-DMA filter): drawdown cut 9.9 pts (rule ≥ 10),
  CAGR −9.5 pts (rule ≤ 2) → not adopted. Its better holdout has been seen;
  any re-run is a new trial judged only on data from 2026-12-31 on.

## Registered 2026-11-19 — S5 live paper (trial 265; 264 reserved for S2)

[s1_momentum/PREREG_S5.md](s1_momentum/PREREG_S5.md), sha256 `ba48a683…059ee2`,
frozen 2026-11-18T23:10:26Z, before any S5 output (first rebalance 2026-12-31).
Addendum C (code-review corrections to the live adaptations, still pre-output) re-hashed it
`bf958988…aee7023` at 2026-11-18T23:56:00Z.
S1-T rules plus Addendum B (live adaptations). ₹50k paper book `S5` in
`advisor_paper_*` (brain `s5_momentum.py`). One read on **2028-12-31**: adopt only
if net CAGR beats the Nifty200 Momentum 30 price index **and** max drawdown is
smaller. Not a significance test: at ~60 trades a year, 24 months cannot clear
3.73. The read decides fund vs code, not whether the edge is real. Number 264 is
held for S2 (post-results drift), which is counted when its pre-registration file
is filed.

## Registered 2026-11-20 — advisor v1 cumulative read (trial 266)

Context: the n = 400 read (V-20, 2026-11-19) gave hit 0.5995, Wilson [0.551, 0.646],
but a Fama–MacBeth t of only 1.98 over 22 dates. That is an anomaly, not a result.
**Operator 2026-11-20:** continue on the existing pool rather than fresh-only.

- **Pool:** all official `portfolio_advice` rows from 2026-07-12 on, including the
  402 already read.
- **Label:** `outcome_correct_alpha` (10d MICRO / 30d MACRO).
- **Statistic:** the Fama–MacBeth across-date t of the per-date mean (hit − 0.5).
- **One more read only,** at **≥ 60 distinct graded run_dates** (about Feb 2027). It is
  a two-look sequential test, because 11-19 was look 1, so the bar is the deflated
  threshold at α/2: **z ≥ 3.90** (265 trials). This bar is fixed now.
- **Pass** → the advisor's verdicts count as an edge. **Miss** → grading shuts off
  (POST_MORTEM §6).
- **No interim peeking:** counts only until the read.
- Grader fixes waiting on V-20 (branch `fix/grader-d3-d4`) may merge now.
