# Advisor variant lab — offline scoring experiments

**Verdict (2026-08-26): reweighting the advisor's hand-picked factors is a
dead axis.** Eight pre-registered variants, 43,952 observations over 101
non-overlapping dates: none beats baseline (Holm p = 1.000 for all eight),
and the whole leaderboard spans an IC range of 0.004 — noise.

Scripts live in the brain repo: `scripts/pull_daily_history.py` (data) and
`scripts/advisor_lab.py` (experiments).

## Why it exists

The live track record is **98 graded calls across 21 holdings**, and those
holdings move together. That is not enough to choose between scoring
variants — it is the same shape of evidence that produced [P-35]/V-12's
`t = +3.0`, which converged to `+0.001` once more data arrived.

`advisor_scoring.advise()` is pure and daily bars are never revised, so a
variant can be **replayed over the past** instead of waited for. That turns
"run an experiment for a month" into "run it in four minutes", and it needs
no enc_token.

## Running it

```bash
python3 scripts/pull_daily_history.py     # once; resumable, ~7 min, needs a live token
python3 scripts/advisor_lab.py --selftest # equivalence guard, no data needed
python3 scripts/advisor_lab.py            # MICRO (10d) leaderboard
python3 scripts/advisor_lab.py --horizon 30
```

Every run appends to `data/advisor_lab_results.jsonl`, so results accumulate
across sessions rather than scrolling past once.

The cache holds **500 symbols, 0 failures, median 1291 bars (~5.2 years)**,
45 MB, gitignored.

## Method

Chosen to be hard to fool, because this is exactly where we have already
fooled ourselves once:

| Choice | Why |
|---|---|
| unit = (date, symbol), score vs forward alpha vs Nifty | the advisor ranks names; alpha strips the market move |
| per-**date** cross-sectional Spearman IC, then t-test across dates (Fama-MacBeth) | pooling would treat 500 names moving together on one day as 500 independent facts. They are roughly one. |
| non-overlapping windows (stride = horizon) | overlapping forward returns autocorrelate the IC series and inflate t |
| chronological explore → holdout split | a variant only counts if it survives data it was not chosen on |
| Holm correction across variants | testing 8 ideas at p<0.05 finds a "winner" from noise about a third of the time |
| variants **pre-registered** before any result was seen | adding a variant after seeing the board is fitting noise and calling it a finding |

**The guard that matters:** `--selftest` asserts the lab's parameterised
scorer reproduces production `trend_score` bit for bit at baseline, over 400
random series. It caught a real off-by-one in development — production
truncates *every term* to int before summing, so a float accumulator drifts a
point. Without that check the leaderboard would describe a scorer we do not
ship.

## Results — 10-day horizon, 43,952 obs, 101 dates

| variant | explore IC | holdout IC | holdout t | Holm p |
|---|---|---|---|---|
| rs_off | +0.0182 | −0.0242 | −1.11 | 1.000 |
| momentum_slow | +0.0204 | −0.0245 | −1.13 | 1.000 |
| anchor_heavy | +0.0179 | −0.0253 | −1.19 | 1.000 |
| adx_strict | +0.0174 | −0.0254 | −1.22 | 1.000 |
| **baseline** | +0.0163 | −0.0262 | −1.26 | 1.000 |
| consistency_off | +0.0139 | −0.0269 | −1.36 | 1.000 |
| rs_heavy | +0.0150 | −0.0273 | −1.33 | 1.000 |
| momentum_heavy | +0.0129 | −0.0283 | −1.40 | 1.000 |

The 30-day horizon agrees: same ordering-by-noise, nothing significant, no
winner.

### Not decay — absence

Baseline IC by calendar year: +0.026 (2022), +0.005, +0.007, −0.018, −0.019
(2026). It *looks* like decay, and **every year is insignificant**
(|t| ≤ 1.07). Read it as no detectable edge in any year. Claiming decay off
that sequence would repeat the V-12 mistake in the opposite direction.

## What this does NOT test

- **News sentiment** and **your own tradebook history** cannot be
  reconstructed for past dates, so both are held at 0 for every variant.
  They cancel in the comparison, but they are untested, not cleared.
- **Survivorship bias**: today's Nifty 500 membership applied to the past.
  It hits all variants equally, but it does bias the absolute level.
- **Held-position HOLD/SELL** is not identical to cross-sectional ranking.
  The score is used both ways (`score_universe` ranks the universe), so the
  result bears on rotation directly and on hold/sell by implication.
- **Power**: 101 dates detects an IC around 0.03+. A genuine but small edge
  (IC 0.01–0.02) would not show reliably here.

## What follows

Consistent with [P18_CALIBRATION.md](P18_CALIBRATION.md): the advisor's
confidence carried no information (AUC **0.4917**, market-neutral 0.5133), and now the trend score shows
no stable cross-sectional edge either. Two independent measurements of the
same thing.

So: **stop tuning weights.** The lab exists to keep that conclusion cheap to
re-test — when a new factor is proposed, add it as a variant and run it in
four minutes rather than shipping it on plausibility.
