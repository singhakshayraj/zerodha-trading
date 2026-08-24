# [P-18] Advisor confidence — answered: it carries no information

_2026-08-25. The ≥50-graded gate opened on 08-24 (graded_calls 37 → 79), so the
question could finally be asked properly. Answer: **confidence must never be
promoted into a scored input.** Not "not yet" — the signal is empty._

## The measurement

n = **98** graded calls, base rate **48.0%**.

| test | value | what it means |
|---|---|---|
| corr(confidence, correct) | **0.0205** (t = **0.20**) | no relationship |
| AUC | **0.4556** | 0.5 is a coin flip; this is marginally *below* it |
| avg confidence when RIGHT | **70.3** | |
| avg confidence when WRONG | **69.8** | the two are 0.5pp apart |
| avg alpha vs Nifty | +0.04% | |

The calibration bins say the same thing, and the top one says it loudly:

| confidence bin | n | predicted | actual |
|---|---|---|---|
| 50–59 | 22 | 56.5% | 54.5% |
| 60–69 | 29 | 63.4% | **37.9%** |
| 70–79 | 11 | 76.1% | 45.5% |
| 80–89 | 10 | 83.8% | 60.0% |
| **90–100** | 7 | 90.0% | **28.6%** |

**The most confident calls are the worst calls.** The 90–100 bucket hits 28.6%
against a 48% base rate — you would do better ignoring the advisor entirely on
exactly the calls it is most sure about. (n=7, so that specific bin is not
significant on its own; it is consistent with the overall AUC, not evidence
beyond it.)

## The methodological finding, which matters more

**[P-18]'s own success criterion was the wrong test.** The item was written to
re-check **ECE and monotonicity** once graded_calls ≥ 50. ECE measures
*calibration* — whether a stated 70% comes true 70% of the time. It does not
measure *discrimination* — whether the number separates right calls from wrong
ones at all.

Those come apart exactly here. A signal that always predicts the base rate is
**perfectly calibrated and completely useless**. So ECE falling 30.3% → 22.6%
looked like progress and was not: it is the calibration mapping compressing
toward the base rate, which is what a non-informative input does as its sample
grows.

Had we waited for ECE to reach some threshold, we would have waited forever for
a number that was never going to answer the question. **AUC and the
correlation answer it in one query.**

## What to do

1. **Never feed `confidence` into a scored decision.** It is currently
   advisory-display only; keep it that way. This is now evidence, not caution.
2. **Do not re-open on a better ECE.** Re-open only if AUC moves materially
   above 0.5 on a larger sample. Recorded as the replacement criterion.
3. **Consider de-emphasising it in the UI.** A number shown next to a verdict
   implies it means something. It does not. Not changed here — that is a
   product call, and the display is honest as long as this page exists.

## Reproduce

```sql
with g as (
  select confidence::numeric c, (outcome_correct)::int y
  from portfolio_advice where outcome_correct is not null and confidence is not null
), r as (select c, y, rank() over (order by c) rk from g)
select count(*) filter (where y=1) pos, count(*) filter (where y=0) neg,
       round(((sum(rk) filter (where y=1)
               - (count(*) filter (where y=1))*((count(*) filter (where y=1))+1)/2.0)
              / ((count(*) filter (where y=1)) * (count(*) filter (where y=0))))::numeric, 4) auc
from r;
```
