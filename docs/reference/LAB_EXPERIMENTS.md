# Lab experiments — learn and build on the 54 [P-70]

_Started 2026-11-20. Every intraday idea tried after the 54-variant replay,
in order, with what it taught us._

## Where we start (2018–2025 replay, 2026-11-19)

- **All 54 lab variants failed** the pre-registered history rule. The best was
  `GAPFADE_s0.5_strict_v1`, with net PF 0.91. The old engine's logic (CONF) came
  out at 0.62–0.72. Full table: `nse_data/bt/verdicts.csv`.
- **The lesson that sets the direction:** split each archetype's result into its
  raw edge before costs and the costs themselves (2018–2024 only).

  | arch | gross PF | net PF | reading |
  |---|---|---|---|
  | GAPFADE | 1.31 (best variant 1.56) | 0.77 | **real raw edge; costs eat it** |
  | RSHOLD | 1.13 | 0.78 | small edge, eaten |
  | ORB, CONF, GAPGO | ≈1.00 | ≈0.7 | no edge at all |
  | VWAPREV | 0.91 | 0.56 | negative before costs |

- **GAPFADE strict, 0.5% stop:** the average trade grosses ₹48. It then pays ₹26
  in charges and ₹30 in modelled slippage, for 3,549 trades. **The costs, not
  the signal, are what kill it.**
- **The direction:** keep GAPFADE's signal and cut cost per unit of edge, either
  with cheaper trades or bigger moves per trade.

## Rules (fixed before X01 runs)

1. **One change per experiment** from a named parent. A new idea gets a new id;
   an experiment that has run is never edited.
2. **Register before running.** Each row is written here, and counted in
   [TRIAL_LEDGER.md](TRIAL_LEDGER.md), before its replay starts.
3. **Explore window: 2018-03 → 2024-12.** 2025 is the **locked holdout**. The
   code refuses to run an experiment past 2024-12-31
   (`lab_backtest.HOLDOUT`).
4. **Keep or kill (sets the direction only, never a promotion).** An experiment
   is **kept**, and may become a parent, only if:
   - its net PF beats its parent's on the same window;
   - its net is > 0 in at least 2 of the 3 blocks (2018-03→2020, 2021→22, 2023→24).

   Otherwise it is **killed**, and we write down what it taught us.
5. **The only way out of the lab:** a final candidate opens the 2025 holdout
   **once**. It must reach PF ≥ 1.3 and ≥ ₹100/day in 2025, and have a
   day-clustered t at least as large as the ledger's deflated threshold over the
   explore window. It still has to pass the live lab rule after that.
6. **Engine:** the same `lab.py` code as live, via
   `python scripts/lab_backtest.py exp <id>` (brain). Variants live in
   `scripts/lab_experiments.py` and are never registered live. Before X01, the
   harness reproduced the parent's real trades exactly (2024-02-14, 10 of 10).

## Log

| id | parent | one change | why | registered | result (explore, net) | verdict | lesson |
|---|---|---|---|---|---|---|---|
| X01 | GAPFADE_s0.5_strict_v1 | only the top-100 names by ADV | slippage is modelled at 5 bps for the top 100 and 15 bps for the rest | 2026-11-20 00:10 IST | net PF **1.04** (parent 0.93), ₹5.7/day, 2,069 trades; blocks ₹+24,253 / −9,132 / −5,306 | **killed**: only 1 of 3 blocks > 0 | Liquid names cut cost per trade from ₹56 to ₹42 with the gross edge unchanged (gross PF 1.54 vs 1.56), so the filter itself works. But the gross edge per trade halves after 2020 (₹68 → ₹26–32) while costs stay ₹42: **from 2021 on, one trade's edge is smaller than its cost.** |
| X02 | GAPFADE_s0.5_strict_v1 | gap ≥ 3.5% (was 2.5%) | a bigger gap means a bigger move to the target (prior close) for the same cost | 2026-11-20 00:10 IST | net PF **0.99** (parent 0.93), −₹1.1/day, 1,918 trades; blocks ₹+17,997 / −9,859 / −9,996 | **killed**: only 1 of 3 blocks > 0 | A bigger gap barely raises the edge per trade (₹66/39/28 → ₹74/35/36 by block) and costs stay ₹56. Gap size is not what drives the edge: **2018–20 works and 2021–24 does not, whatever the filter.** Both levers (X01, X02) hit the same wall, so the next idea has to explain that regime split. |
| X03 | GAPFADE_s0.5_strict_v1 | SHORT side only (fade gap-ups; drop gap-down longs) | parent's own trades split by side: shorts gross PF 1.92 / 1.93 / 1.53 by block, longs 1.61 / 0.91 / 1.03 — the long side is what dies after 2020 | 2026-11-20 06:50 IST | — | — | — |

**Caveat on X03:** it was chosen by looking at the parent's own 2018–24 trades,
so a good explore result is expected and proves little. Only the locked 2025
holdout can test it.

**Caveat on X01:** it gains only if the slippage model is right. Real fills at
09:30 on a gapping stock may be worse than 5 bps, so a "kept" X01 needs live
fills to confirm it.
