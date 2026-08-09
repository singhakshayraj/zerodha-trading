# [P-35] Entry edge, re-tested — the first candidate that survives

_2026-08-10. Supersedes the conclusion of [EDGE_STUDY_P21.md](EDGE_STUDY_P21.md)
on a 3.4× larger sample with walk-forward validation.
Reproduce: `python3 scripts/edge_study.py` (brain repo)._

## Why this was re-run

Everything else was settled. [P-29] and [P-30] showed **no exit policy rescues
the book, and none clears breakeven even at zero transaction cost.** So the
edge, if one exists, has to be in the **entries**.

[P-21] asked that on 2026-08-06 and answered *no* — while naming its own
limitation in the first paragraph:

> *"Coverage is the key limitation: only 2 days carry SHORT labels (07-22,
> 07-23)... everything below is an in-sample candidate, not a validated edge."*

Since then the labeled sample grew from **1,597 → 5,481 usable decisions**, and
now carries SHORT labels on **ten days** rather than two. Nobody re-ran the
study. That is the whole of this work: the blocking limitation had quietly
expired.

## The data

**5,481 usable labeled decisions over 10 days** (07-22 → 08-07).

`decision_outcomes` walks *every* directional decision forward through the
5-minute candle archive using its own logged stop and target, whether or not it
became a real trade. That matters twice over: it is ~8× the taken-trade book,
and it is free of the pacing caps' selection effect — which decisions became
trades is not random.

Three properties of the label to keep in view:

- **It is gross.** Unlike `trades.r_multiple`, it ignores costs entirely. A
  positive gross R is not a profit. This study charges every decision its own
  exact cost, `(0.12% × entry) ÷ |entry − stop|`, which is better than a flat
  average because cost-in-R depends on that trade's stop width.
- **Same-bar ambiguity resolves stop-first** — conservative, so any edge found
  is if anything understated.
- **07-14's 571 labels are 100% `NO_DATA`** (the candle archive was empty then)
  and are excluded. Anyone re-running this must exclude them too.

## Headline

| | gross | cost | **net** |
|---|---|---|---|
| All 5,481 decisions | +0.105R | 0.310R | **−0.205R** |
| [P-21]'s frozen rule — SHORT + before 13:00 + STRONG trend | **+0.374R** | 0.291R | **+0.083R** |

**Walk-forward out-of-sample: +0.097R net** (n=1,383, t=+3.0), derived only on
prior days and scored on the next. The rule beat that day's own baseline on
**7 of 9** days.

## The two boring explanations, ruled out

An apparent entry edge here has two obvious non-explanations. Both were tested,
and both checks are now built into the script so they re-run with the data.

**(a) Is it just selecting cheaper, wider-stop trades?** No. Cost per decision
is essentially flat across every rule (0.291–0.332R). The rule's advantage
appears in **gross** R — +0.374R against a +0.105R baseline, 3.6× — not in
avoided cost.

**(b) Is it just shorting a falling market?** No, and this is the stronger
result. Plain `SHORT` *is* the pure directional bet, so it is the right control.
The rule beat plain SHORT on **9 of 9 days**:

| day | rule | plain SHORT | edge |
|---|---|---|---|
| 07-22 | +0.037R | −0.231R | +0.268 |
| 07-23 | +0.329R | −0.271R | +0.600 |
| 07-28 | +0.157R | −0.024R | +0.182 |
| 07-29 | −0.355R | −0.421R | +0.066 |
| 08-03 | −0.032R | −0.042R | +0.010 |
| 08-04 | −0.025R | −0.140R | +0.114 |
| 08-05 | +0.219R | +0.015R | +0.204 |
| 08-06 | +0.191R | −0.002R | +0.194 |
| 08-07 | +0.438R | −0.402R | +0.840 |

Direction alone loses on 8 of those 9 days. The morning-plus-trend-strength
filter adds value *on top of* direction, every single day.

_(A third control — correlating with the day's Nifty drift — could not be run:
`brain_decisions.nifty_level_at_decision` is null throughout. The plain-SHORT
comparison is the better control anyway, but the null column is worth fixing.)_

## What this does and does not mean

**It is the first entry-edge candidate this project has found that survives
out-of-sample testing.** That is genuinely new, and it reverses [P-21].

It is **not** evidence of profitability. Five reasons to hold it loosely:

1. **Counterfactual, not filled.** These are simulated entries. They ignore the
   pacing caps, concurrent-position limits and real fill quality that the live
   book is subject to. The actually-traded book still runs at **−0.4155R**.
2. **Economically thin.** +0.097R net, against an average cost of 0.310R. The
   margin is roughly a third of the cost being paid to obtain it.
3. **One market period.** Ten days in late July / early August 2026. [P-21]
   died precisely because a two-day result did not generalise; ten days is
   better, not sufficient.
4. **4 of 7 out-of-sample days positive** on the frozen rule. Positive, but not
   overwhelming.
5. **The walk-forward selected the same rule every day**, so it is really a
   confirmatory test of one pre-registered hypothesis, not evidence that the
   selection *procedure* generalises.

Note also that `trend_strength == 'STRONG'` and `ADX ≥ 25` are the same
population (n=4,546 vs 4,547) — the rule is really *SHORT + morning + ADX ≥ 25*.

## What happens next

**Do not enable anything.** This project's rule is that ideas run dark and are
measured before they act, and a result this thin is exactly what that rule
exists for.

**No new code is needed to keep measuring it.** The counterfactual is already
captured: every decision records its direction, hour and `trend_strength`, and
`decision_outcomes` labels the forward path. So the dark flag would be
redundant — the requirement is simply to **run the labeler and this study after
each session** and watch whether the out-of-sample number holds up as days
accumulate. Registered as **V-12**.

The decision worth revisiting once it has more days: this rule qualifies ~33%
of decisions (1,801 of 5,481). Trading fewer, better-selected entries is also
the only lever that reduces the cost drag that [P-30] showed dominates
everything — fewer trades, same edge, less cost paid.
