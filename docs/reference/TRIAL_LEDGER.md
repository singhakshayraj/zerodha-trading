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
| **total** | **258** |

## The threshold

Harvey–Liu–Zhu style haircut (Bonferroni control across the count):

| trials | two-sided 5% z to clear |
|---|---|
| 1 | 1.96 |
| 50 | 3.29 |
| **258 (this project)** | **3.73** |

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
