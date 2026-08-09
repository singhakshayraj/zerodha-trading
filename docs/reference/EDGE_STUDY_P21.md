# [P-21] Edge study — what the collected data says predicts winners

> ⚠️ **The conclusion below ("the edge does NOT hold") was REVERSED on
> 2026-08-10 by [P-35]** — see [EDGE_STUDY_P35.md](EDGE_STUDY_P35.md).
> Nothing here was wrong at the time; the limitation this study named in its own
> first paragraph (SHORT labels on only 2 days) simply expired as the sample
> grew 1,597 → 5,481 decisions across 10 days. Re-tested with walk-forward
> validation, the frozen rule holds out-of-sample at **+0.097R net** and beats
> plain SHORT on 9 of 9 days. Read this page for the method and the honest
> starting point; read P-35 for the current verdict.

_2026-08-06. Feature→outcome mining on the walk-forward decision labels
(`decision_outcomes`) joined to their full feature context (`brain_decisions`).
The point of the whole data-collection effort: let the data reveal the edge (or
prove there isn't one) instead of hand-tuning. VISION §7._

## Data
- **1,597** walk-forward-labeled decisions with a realized `r_multiple`
  (`decision_outcomes` ⋈ `brain_decisions` on `decision_id`), outcome ∈ WIN/LOSS.
- These are **hypothetical** stop/target labels simulated forward on *every*
  decision (not just taken trades) — a bigger, cleaner sample than the ~450
  taken trades, but not real fills.
- **Coverage is the key limitation: only 2 days carry SHORT labels (07-22,
  07-23)** — both bearish/losing days for the live strategy. Track C labeling
  is sparse after 07-23. So everything below is an *in-sample candidate*, not a
  validated edge.

## Ranked separators (by realized-R spread)

| Rank | Feature | Split | Spread | Note |
|---|---|---|---|---|
| 1 | **Time of day** (SHORT) | morning <13h **+0.37R** vs afternoon ≥13h **−0.29R** | **0.66R** | near-monotonic; 11h best (+0.68R), 13h worst (−0.38R) |
| 2 | **Direction** | SHORT **+0.09R** vs LONG **−0.50R** | 0.59R | LONGs bleed on every hour bucket |
| 3 | **Trend strength / regime** | STRONG **+0.15R** vs WEAK **−0.16R** | 0.30R | real; STRONG already implies ADX≥25 |
| 4 | ADX | 25–30 **+0.20R** vs 20–25 **−0.16R** | 0.36R | subsumed by trend_strength |
| — | confidence_score | non-monotonic (<60 −0.24 / 60-69 +0.07 / 70-79 −0.03 / 80+ +0.20) | — | **weak, unreliable** — matches the broken advisor calibration |
| — | `trend_tells.permits_entry` | gate=true **−0.13R** vs gate=false **+0.19R** | 0.32R | **ANTI-predictive here + sign-flips vs the 08-04 audit → noise/harmful, do NOT enable** |
| — | market_bias, RSI | flat / tiny-n | — | no usable signal |

## The edge candidate

Filters stack cleanly (SHORT):

| Rule | n | avg R | win |
|---|---|---|---|
| ALL decisions | 1576 | +0.02R | 43% |
| LONG | 165 | −0.50R | 27% |
| SHORT, afternoon (≥13h) | 603 | −0.29R | 31% |
| SHORT, morning (<13h) | 808 | +0.37R | 55% |
| **SHORT + morning + STRONG trend** | **655** | **+0.44R** | **57%** |

**Derived rule:** take **SHORT, before 13:00 IST, in a STRONG trend** →
+0.44R / 57% on n=655. Everything it drops (LONG, afternoon, weak-trend) is
negative. Holds on both labeled days (07-22 +0.35R, 07-23 +0.65R).

## OUT-OF-SAMPLE TEST → the edge does NOT hold (the decisive result)

Backfilled the labels for 4 days the rule was NOT derived from (07-24, 07-28,
07-29, 08-03) and re-ran it. The in-sample separation **collapses**:

| Bucket | In-sample (07-22/23) | Out-of-sample (07-24/28/29, 08-03) |
|---|---|---|
| Rule: SHORT+morning+STRONG | **+0.44R** | +0.26R |
| SHORT afternoon | −0.29R | +0.13R |
| LONG | −0.50R | +0.24R |
| ALL | +0.02R | +0.19R |

Out-of-sample every bucket converges to ~+0.2R / 54% — **no exploitable spread**.
Per-day it's inconsistent: 07-28 LONG (+0.35) ≈ the rule; 08-03 afternoon (+0.36)
> the rule (+0.17); 07-29 the rule is **negative** (−0.14). (The uniform ~+0.2R
level is the counterfactual labeler's known optimism — R:R>1 targets, no
slippage/costs — so only *relative* separation is meaningful, and there is none.)

## Verdict — no data-derived entry edge
- **The apparent edge was regime luck.** short≫long and morning≫afternoon held
  only on the two in-sample down-trend days (07-22/23); they do not generalize.
  The strategy's per-session PF swing (0.04→1.03) is **not** predictable from any
  logged decision feature.
- This is P-21 doing its job: it set out to *find the edge or prove there isn't
  one* — decisively, **the collected decision features do not carry a persistent
  entry edge.** Do NOT ship any feature-based entry score live.
- **Firm negative results (equally valuable):** `confidence_score` does not
  predict; the `trend_tells` permit gate is anti-predictive + sign-unstable.
  Keep both out of any live weight; keep the gate dark/off.
- **Strategic redirect:** the honest edge verdict still rests on **gate #6**
  (multi-regime historical backtest, blocked on Kite ₹500) — not on tuning the
  live features. Confirms the standing "no proven edge" conclusion at the
  feature level.

## What was shipped anyway (keeps the door open)
Decision labeling was starving (manual `label_decisions.py`, unrun since 07-23).
Now auto-runs every session (`scheduler._label_decisions_catchup`, brain
`c5fd525`) + backfilled 07-24→08-05. So if a genuinely new signal source appears
later, the labeled dataset keeps growing and this study can be re-run for free —
no hand-tuning, evidence-first (VISION §7).
