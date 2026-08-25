# Factor lab — standard cross-sectional factors, tested locally

**Verdict (2026-08-26): nothing survives.** Twelve pre-registered factors from
the equity literature, plus two composites, across four cuts
(10d/30d × plain/sector-neutral). Not one clears Holm correction in the
holdout. Script: `scripts/factor_lab.py` in the brain repo.

This is the follow-up to [ADVISOR_LAB.md](ADVISOR_LAB.md), which showed that
reweighting the advisor's seven hand-picked factors changes nothing. Those
seven are **one family** — every one is a trend/EMA read of the same price
series — so no weighting of them adds information. This tested a different
family.

## What was structurally wrong, independent of which factors

1. **`trend_score` is absolute, not cross-sectional.** "Price above EMA200"
   scores +20 whether the entire market is above its EMA200 or nothing is.
   Ranking what to hold is a *relative* question — strong compared to what
   else I could own today — so factors here are z-scored across the universe
   each date and winsorised at 3σ.
2. **The advisor's momentum term is 20 days**, which in the literature is
   short-term **reversal** territory (Jegadeesh 1990), not momentum. The
   robust anomaly is **12-1**: the 12-month return skipping the most recent
   month (Jegadeesh & Titman 1993).

Both were fixed *in the lab* and still did not produce a winner — which is
the useful part. The problem is not that the advisor weighted good factors
badly.

## The factors (pre-registered, from published work)

`mom_12_1`, `mom_6_1`, `rev_1m`, `prox_52w` (52-week-high proximity,
George & Hwang), `low_vol` (Ang et al.), `low_beta` (BAB,
Frazzini–Pedersen), `low_ivol`, `low_max` (lottery effect, Bali),
`low_skew`, `amihud` (illiquidity), `trend_ma` (time-series momentum, kept
as the control closest to the current advisor), `vol_growth`.

Plus `combo_ew` (equal-weight z of all twelve — no fitting at all) and
`combo_explore_sel` (factors chosen on explore, scored only on holdout).

Optional sector neutralisation demeans each factor within its NSE sector, so
a factor cannot just be a bet on banks.

## Results — 10d horizon, 101 dates

| factor | explore IC | holdout IC | holdout t | Holm p |
|---|---|---|---|---|
| low_ivol | −0.0322 | +0.0356 | 1.48 | 1.000 |
| combo_ew | +0.0018 | +0.0347 | 1.31 | 1.000 |
| low_vol | −0.0306 | +0.0307 | 1.10 | 1.000 |
| low_skew | −0.0207 | +0.0268 | 2.12 | 0.567 |
| **mom_12_1** | **+0.0387** | **+0.0254** | 1.29 | 1.000 |
| trend_ma | +0.0359 | +0.0002 | 0.01 | 1.000 |
| amihud | +0.0400 | −0.0224 | −1.24 | 1.000 |
| combo_explore_sel | — | −0.0099 | −0.52 | 1.000 |

## The two findings that matter more than the leaderboard

**1. The low-risk family flips sign together, in all four cuts.**
`low_vol`, `low_ivol`, `low_max`, `low_skew` are all negative in explore
(2021-06 → ~2024) and all positive in holdout (~2024 → 2026), every time.
That is a regime signature, not per-factor noise — the whole risk dimension
reversed. It is **one split**, so it is recorded as an observation, not a
result.

**2. "Keep what worked" is measurably harmful here.** `combo_explore_sel`
selects factors on explore and scores them on holdout, and it is **negative
in every cut**. The clearest case is `amihud`: explore t = **+4.18** at 30d,
holdout −0.0109. Anything selected on in-sample significance would have
shipped that.

This is the same lesson as [P-35]/V-12, arrived at independently, and it is
the reason the selection step is built into the script rather than done by
eye.

## What shipped from it

Only `mom_12_1`, and only as a **dark flag** — computed and logged on every
advice row, deliberately **not** folded into `trend_score`. It was the only
factor keeping a positive sign in explore and holdout across all four cuts,
with the best quintile spreads (+0.27% to +0.86%), but at IC ≈ 0.022–0.025 it
sits below what 101 dates can certify (≈0.03+). So it earns a live track
record for `factor_attribution` to grade, exactly as `weekly_trend` does.

Five tests pin it, including the one that matters: `trend_score` must return
an identical score with `mom_12_1` seeded at −99, 0 and +250. If that guard
fails, an unproven factor has started trading real money.

## Limits

- **Survivorship bias** is uncorrected — today's Nifty 500 membership applied
  to the past.
- **Power**: 101 dates certifies IC ≈ 0.03+. A real edge of 0.02 would not
  show reliably, which is exactly where `mom_12_1` sits.
- Testing four cuts is itself multiplicity beyond the Holm correction applied
  within each cut.
- The lab ranks the universe cross-sectionally. The advisor's other job —
  HOLD/SELL on names already held — is related but not identical.
