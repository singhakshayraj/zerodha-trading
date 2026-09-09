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
| **total** | **253** |

## The threshold

Harvey–Liu–Zhu style haircut (Bonferroni control across the count):

| trials | two-sided 5% z to clear |
|---|---|
| 1 | 1.96 |
| 50 | 3.29 |
| **253 (this project)** | **3.72** |

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
