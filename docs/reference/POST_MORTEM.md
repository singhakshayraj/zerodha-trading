# Post-mortem — the intraday equity paper-trading system

**Decommissioned 2026-09-09.** Written to be read in two years by someone who
did not watch it happen. It is not a defence of the project.

---

## 1. One page

**What it was.** An automated intraday equity trading system for NSE, run
against a Zerodha retail account: a Python decision engine ("the brain") on
Railway, a Next.js dashboard on Vercel, a Supabase Postgres store. It scanned a
universe, generated BUY/SELL signals, sized positions, placed *simulated*
orders (paper only), managed stops and targets, and flattened by session end.
A separate portfolio advisor gave daily HOLD/TRIM/SELL guidance on real
holdings; it never placed an order and is not what was decommissioned.

**Verdict (frozen 2026-09-08 19:58:56 UTC):**

| | |
|---|---|
| trades | **1,018** (936 with an `r_multiple`) |
| expectancy | **−0.4213R** |
| profit factor | **0.3685** |
| win rate | **23.48%** |
| net P&L | **−₹59,195** (paper, ₹100,000 nominal) |
| session days | 31 |
| decisions logged | 36,891 |
| labelled decisions | 10,618 |
| graded advisor calls | 98 |

**The corrected decomposition.** Per-trade loss ≈ −0.42R. Transaction cost
**−0.398R** — ~94% of it. Residual signal **−0.027R**, statistically zero. The
cost was 7× heavier in R than design assumed, because realised risk per trade
was **₹140 (0.14% of capital)**, not the 1.0% configured — the 40% position cap
binds before the risk rule does.

**The governing identity (verified on 875 trades):**
> cost in R ≈ round-trip friction (bps of position) ÷ stop width (bps of price)
> ≈ **20.60 / 52.28 ≈ 0.424R**

Scale-invariant: position size, capital and the risk-per-trade setting all
cancel. Measured per-trade friction÷stop (0.424R) equals measured expectancy
(0.421R) to two decimals. **The loss is the cost ratio.** Escaping it needs
~3.7% stops — a multi-day holding distance. No intraday variant escapes it.

**Benchmark.** Over the same window (2026-05-19 → 2026-08-28), Nifty 50
buy-and-hold returned **+3.03%**; the system returned **−59.20%**. Alpha vs
doing nothing: **−62.23 pp**. (Per-trade R is load-bearing; this rupee figure
describes a portfolio that was not executable — see §3.)

**The decision.** Stop. The strategy has no edge, the loss is structural
friction that no intraday configuration removes, and — decisively — there is no
compliant live path: SEBI's retail-algo framework (circular 4 Feb 2025 +
Sept 2025 extension) requires, from 1 April 2026, an exchange-assigned Algo-ID
and API access via a vendor-client-specific key on a broker-whitelisted static
IP. This system's scraped-session-token auth is outside that framework. Even a
positive result would have required a rebuild, not a deployment.

---

## 2. The closed avenues

Each: hypothesis · pre-registered? · n · deciding number · date closed.

| # | hypothesis | pre-reg | n | deciding number | closed |
|---|---|---|---|---|---|
| 1 | An entry edge exists | yes | 2,428 decisions | **+0.010R, t=+0.4** (< 2) | 2026-08-27 |
| 2 | Some exit rule rescues it | yes | 180 policies × 541 trades | **0/180 positive at zero cost**, best −0.077R | 2026-08 |
| 3 | Advisor confidence carries information | yes | 98 graded | **AUC 0.4917** (0.5 = coin flip) | 2026-08-27 |
| 4 | Reweighting the 7 advisor factors helps | yes | 43,952 obs, 101 dates | **Holm p=1.000 all 8 variants**, IC range 0.004 | 2026-08 |
| 5 | Standard cross-sectional factors survive | yes | 5.2 yr, 4 cuts | **nothing clears Holm out of sample** | 2026-08 |
| 6 | The open window (09:30–10:30) hides the edge | yes | 182 | **−0.365R, t=−4.46** | 2026-09-08 |

**The worked example — how a null actually looked.** In August one filter —
short trades, entered before 13:00, in a strongly trending stock — read
**+0.097R after costs, t = +3.0**, and beat plain shorting on **9 consecutive
days out of 9**. It looked like the first real edge the project had found. One
more day of data erased it: the tenth session scored −0.532R on that filter and
the out-of-sample average fell to **−0.003R**. Reclassified from "unstable" to
**converged to zero**. This is the entire project in miniature: a t=3 on nine
correlated days is not an edge; it is what noise looks like before the sample is
large enough to say so.

---

## 3. Meta-findings, as lessons

1. **Selecting on in-sample performance was measurably harmful.** Factors chosen
   on the explore window and scored on the holdout were negative in *every* cut.
   Amihud illiquidity: explore t = **+4.18**, holdout **−0.0109**. "Keep what
   worked" has a measured price here.
2. **Detectability must be budgeted before an experiment is built, not
   discovered after.** 98 graded advisor calls could never have certified a
   modest skill (needs ~400); a 9-day filter could never have distinguished
   t=3-from-noise. Both were run first and found underpowered afterwards. The
   missing discipline is a required "n needed to detect the target effect at
   t=2" line before any experiment earns code.
3. **The factor study carried survivorship bias *toward* finding edge** — it
   used current Nifty 500 constituents over 5.2 years, so delisted/demoted names
   (exactly what momentum and low-vol would have held on the way down) are
   absent — **and it still found nothing.** The null is stronger than a naive
   reading; the surviving candidate's IC (0.022–0.025) is optimistic.
4. **Caps must exist at every aggregation level that gets reported at.** The
   system had a position-level cap (40%) and day-level stops (−3R) and **nothing
   at the portfolio level.** Peak gross exposure hit **7.85×** deployed capital
   (₹785,346 on ₹100,000) across 20 concurrent positions, and the paper broker
   never checked margin — so the constraint that binds in reality did not exist
   in the simulator. **Roughly a third of concurrent positions could not have
   been taken with real money.** Per-trade R is unaffected (expectation is
   preserved under margin-driven subsetting); every portfolio-level *rupee*
   figure describes an inexecutable book and carries that asterisk. The missing
   invariant — *gross exposure ≤ margin capacity* — is the one that was never
   written.

---

## 4. Conditionality appendix — what was NOT tested, and why

- **One market regime.** 31 session days, all one summer. The low-risk factor
  family flipped sign across the single explore/holdout split, so regime clearly
  matters — and it was sampled once. Every live number is conditional on that
  regime. Fixing this needs a year-plus of paper; it is a permanent asterisk,
  not an open avenue.
- **Nothing finer than 5-minute bars.** Retail enc_token auth gives historical
  candles but no live `/quote`, no options chain, no tick data. Any edge living
  below 5-minute structure is both untested and unharvestable by a system whose
  finest cadence is a 300-second cycle with 30-second exit polls.
- **No live slippage measurement.** Paper slippage was an assumed constant
  (5 bps/leg). It is ~48% of total friction and was never validated against
  real fills, because contract notes hold fills, not decision-time prices (see
  the permanently-open list below).

This appendix exists so a future reader neither reopens a closed door nor
over-claims the null's breadth. The claim proven is narrow and exact: **no
harvestable edge in these signals, at 5-minute granularity, as operated, in
this regime.** It is not "no edge is possible in Indian intraday equities."

---

## 5. Decision record + pre-committed reopening criteria

The stop is not provisional. Reopening is justified **only** if *all three*
hold — anything less is relitigation, not decision:

1. **Compliant access exists** — broker-API access under the SEBI Algo-ID
   framework (vendor-client key, whitelisted static IP, order tagging). The
   scraped-token architecture can never satisfy this.
2. **A signal is certified outside this system first** — an edge demonstrated on
   independent data with pre-registered detectability, not discovered by
   re-running this codebase.
3. **Capital clears opportunity cost** — at a level where a certified edge's
   rupee return exceeds the operator-hours it consumes. At −₹643/operator-hour
   observed, and a long-term book ~45× the trading capital, the bar is high.

---

## 6. Stopping criteria for what remains accruing

So "passive" cannot silently become "ongoing":

- **Advisor grading:** one read when graded calls reach **n = 400** (≈ mid-2027
  at current accrual). Deciding condition: hit-rate confidence interval
  **excluding 0.50**, on the market-neutral (alpha) label. Miss → grading shuts
  off. No interim peeking beyond a quarterly glance.
- **The two paper books (PICKING, MANAGEMENT):** one read each on
  **2027-03-31**, book-minus-Nifty at **t ≥ 2**. Miss → off.
- **Engineering freeze:** zero commits to the market layer except fixes to the
  grading/accrual path. Auditable by `git log`; it is the tripwire.

---

## 7. Pointers

- **Snapshot:** `~/Desktop/zerodha-decommission-2026-09-09/` — 21 tables,
  168,467 rows, gzipped, with `MANIFEST.json`. Verified by exact head-count vs
  live: **21/21 match, 0 mismatches**. ⚠️ **Local only — an offsite copy is
  still owed** (Supabase pauses inactive free-tier projects; the dump then
  becomes the sole medium for any re-analysis).
- **`/learn` as believed:** `learn-page-as-believed.tsx` in the snapshot dir —
  the only prose written while the strategy was still believed in.
- **Repo tags:** `intraday-decommission-2026-09-09` — brain
  `c604c0d94f3176c312dccd980227a69a882ff0d6`, dashboard
  `61ee4ef3279ffb9cd47669e9116a499943eb21b2`.
- **Config:** no `tunables` override set (compiled defaults in `config.py`);
  no `config_hash` stored. Deployed env-var names (values never recorded) are in
  the manifest.
- **Killed-for-cause (permanently open):** the contract-note charge validation.
  The `tradebook` table holds fills only with no charge columns; its 215 rows
  are delivery-segment trades predating the paper period; the charge schedule is
  deterministic and already rate-card-verified; live slippage is unmeasurable in
  paper by construction. No decision consumes the number, so it will not be run.
- **Final invariant sweep (2026-09-09):** I-1 PASS · **I-2 FAIL** (C10: EOD
  exits labelled by side — `_auto_close_longs_if_eod` never wins the 15:20 race,
  so per-exit-reason tables are side-confounded; recorded, not fixed) · I-3 PASS
  · I-4 PASS · I-5 PASS · **I-6 FAIL** (2 pinned tokens, HEG and HFCL, now absent
  from Kite's live master — pin drift; not fixed, the system is decommissioned)
  · I-7 PASS.
