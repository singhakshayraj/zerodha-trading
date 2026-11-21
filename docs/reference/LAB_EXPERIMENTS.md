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
   (`lab_backtest.HOLDOUT`). **2026 (Jan → Nov 19) is a second locked
   holdout** (added 2026-11-20, before any 2026 replay): the bars come from Kite
   (`lab_backtest.py fetch_kite` + `merge_kite`), because the free source ends
   2025-12-31. The same code guard covers it.
4. **Keep or kill (sets the direction only, never a promotion).** An experiment
   is **kept**, and may become a parent, only if:
   - its net PF beats its parent's on the same window;
   - its net is > 0 in at least 2 of the 3 blocks (2018-03→2020, 2021→22, 2023→24).

   Otherwise it is **killed**, and we write down what it taught us.
5. **The only way out of the lab:** a final candidate opens the 2025 holdout
   **once**. It must reach PF ≥ 1.3 and ≥ ₹100/day in 2025 **and** in 2026, and have a
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
| X03 | GAPFADE_s0.5_strict_v1 | SHORT side only (fade gap-ups; drop gap-down longs) | parent's own trades split by side: shorts gross PF 1.92 / 1.93 / 1.53 by block, longs 1.61 / 0.91 / 1.03 — the long side is what dies after 2020 | 2026-11-20 06:50 IST | net PF **1.08** (parent 0.93), ₹11.3/day, 2,089 trades, t 2.23; blocks ₹+17,482 / +8,086 / −6,331 | **kept** (2 of 3 blocks > 0); becomes a parent | The short side alone holds its edge through 2022 (gross PF 1.95 / 1.92). In 2023–24 the edge per trade is ₹45 against ₹57 of cost, so cost is the binding limit again. Still far from the exit bar (PF 1.3, ₹100/day, t 3.78). |
| X04 | X03_GAPFADE_short_v1 | only the top-100 names by ADV (X01's lever) | X01 cut cost per trade by ~25% with gross unchanged; that would put 2023–24 shorts (₹45 gross vs ₹57 cost) near break-even or better | 2026-11-20 09:40 IST | net PF **1.18** (parent 1.08), ₹12.9/day, 1,152 trades, t 3.16; blocks ₹+14,169 / +6,315 / +1,586 | **kept** (3 of 3 blocks > 0); becomes a parent | Cost per trade fell from ₹57 to ₹43 and 2023–24 turned positive (net PF 1.05). Exit bar: PF 1.18 vs 1.3, t 3.16 vs 3.78, and **₹12.9/day vs ₹100**. That last gap is structural: about 0.67 trades/day at a ₹25k notional cap (₹135 risk), so ₹/day needs more trades or more size, not a better filter. |
| X05 | X04_GAPFADE_short_top100_v1 | gap ≥ 1.5% (was 2.5%) | more trades per day is the only lever on ₹/day that stays inside the ₹25k cap; tests whether smaller gap-ups in liquid names keep the short-side edge | 2026-11-20 12:35 IST | net PF **1.03** (parent 1.18), ₹5.7/day, 3,076 trades; blocks ₹+9,666 / +139 / −81 | **killed**: PF below the parent | Almost 3× the trades but less ₹/day: the extra 1.5–2.5% gaps lose about ₹6 a trade after costs. **The edge lives in big gap-ups only**, so more trades from smaller gaps is a dead end. |
| X06 | X04_GAPFADE_short_top100_v1 | stop 1.0% (was 0.5%) | X04 stops out on 64% of trades and reaches the target on only 26%; a wider stop gives the fade room to reach the prior close, and the ₹25k notional cap keeps the size the same | 2026-11-20 15:45 IST | net PF **1.183** (parent 1.179), ₹17.4/day, 1,152 trades, t 3.10; blocks ₹+15,547 / +9,406 / +4,834 | **kept**, by a hair (3 of 3 blocks > 0) | Same entries; stop-outs fell from 64% to 47%. Net per trade rose from ₹19 to ₹26, but **only because each trade risks ₹258 instead of ₹135**: the edge per unit of risk fell (0.139R → 0.098R). More ₹, not a better signal. Splitting its trades by Nifty's move at 09:30: when Nifty is already up ≥ 0.5%, 588 shorts make ₹+321 in total (PF 1.0); when Nifty is up 0–0.5%, 374 shorts make ₹+32,483 (PF 1.8). |
| X07 | X06_GAPFADE_short_top100_s1_v1 | skip the short when Nifty is up ≥ 0.5% at 09:30 | a stock gapping up with the whole market tends to keep going; one gapping up on its own fades. X06's own trades show the market-wide half earns nothing | 2026-11-20 18:10 IST | net PF **1.40** (parent 1.18), ₹17.3/day, 564 trades, t 2.73; blocks ₹+15,913 / +6,790 / +6,763 | **kept** (3 of 3 blocks > 0); becomes a parent | Half the trades for the same ₹ (₹29,465 vs ₹29,787): the skipped market-wide gap-ups really were dead weight. Edge per unit of risk doubled (0.098R → 0.199R) and gross PF rose from 1.58 to 1.89. First explore PF above the 1.3 bar. But t fell from 3.10 to 2.73, because there are fewer trades (bar 3.79), and ₹/day is unchanged at ~₹17. Chosen from X06's own trades, so the holdout is the real test. |
| X08 | X07_GAPFADE_short_top100_s1_nifty_v1 | enter at 09:45 (was 09:30), only if the 09:40 bar still closes below the day open; Nifty filter still read at 09:30 | X07 loses ₹14.3k on its 223 trades that exit before 10:00 (mostly fast stops) and makes ₹43.8k on the rest; waiting 15 min asks the fade to prove itself first, at the cost of a worse entry price | 2026-11-21 01:55 IST | net PF **1.04** (parent 1.40), ₹1.9/day, 565 trades, t 1.02; blocks ₹+1,551 / +3,344 / −1,630 | **killed**: PF below the parent | Same number of trades, but net fell from ₹29.5k to ₹3.3k and gross PF from 1.89 to 1.45. **The edge is in the first 15 minutes of the fade:** by 09:45 much of the move toward the prior close has already happened, so the later entry gives up the reward while the stop still gets hit. The early stop-outs are the price of being early, not a separate mistake. Keep the 09:30 entry. |
| X09 | X07_GAPFADE_short_top100_s1_nifty_v1 | no target: exit only at the 1% stop or 15:15 (was: also at prior close) | X07's 204 target exits average 1.63R gross, its 119 end-of-day exits 0.95R; tests whether a gap-up that fills keeps falling past the prior close or bounces back | 2026-11-21 08:10 IST | — | — | — |

**Caveat on X03, X07, X08 and X09:** each was chosen by looking at its parent's own 2018–24 trades,
so a good explore result is expected and proves little. Only the locked 2025
holdout can test it.

**Caveat on X01:** it gains only if the slippage model is right. Real fills at
09:30 on a gapping stock may be worse than 5 bps, so a "kept" X01 needs live
fills to confirm it.
