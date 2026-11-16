# Advisor v3 — faults found, and the plan to build a stock-picking advisor worth trusting

_2026-11-16. A plan, not a change. Nothing here touches the live advisor
until each phase is greenlit — algorithm and advisor-setting changes need
the operator's explicit yes. Written against the evidence in
[POST_MORTEM](../../reference/POST_MORTEM.md), [ADVISOR_LAB](../../reference/ADVISOR_LAB.md),
[FACTOR_LAB](../../reference/FACTOR_LAB.md), [P18_CALIBRATION](../../reference/P18_CALIBRATION.md)
and tonight's `call_scorecard_latest`._

---

## 0. Where we actually stand (read this before the plan)

The current advisor is one idea — "is the daily trend up?" — scored seven
ways from the same price series, and asked to predict 10–30-day direction.
It has now been measured four independent ways, and the answer is the same
each time:

| measurement | result |
|---|---|
| Confidence number vs outcome (n=98, P-18) | AUC 0.46 — no information |
| Reweighting the 7 factors (8 variants, 43,952 obs, ADVISOR_LAB) | every variant insignificant; holdout IC ≈ −0.025 |
| 12 textbook factors, 4 cuts (FACTOR_LAB) | nothing clears Holm; "keep what worked" is *negative* out of sample |
| Verdict replay, 5.2 y × ~500 names, Fama–MacBeth (POST_MORTEM addendum) | 10d hit 50.9% (t=+1.56), 30d 49.99% (t=−0.03) |
| **Live, today** (`call_scorecard_latest`, holdings) | day 10: 62.8% right, +1.2% α (n=94) → **day 20: 49.3%, −0.03%** → **day 40: 37.3%, −2.4%** (n=75) |
| Live, buy targets | day 40: **23.8% right, −9.7% α** (n=21) |

Read the last two rows carefully. The calls look good for ten days and then
rot: whatever the trend score captures is a short-lived continuation that
*reverses* by day 40. That is the textbook signature of a 20-day momentum
term (which the literature calls short-term reversal, not momentum —
FACTOR_LAB §"structurally wrong" already said this). And the rotation
targets — the names the advisor says to *buy* — are so far worse than a
coin flip at every horizon beyond a week. n is small (21), but the sign is
the same as every backtest.

**The only output class that survived everything is risk measurement**
(covariance structure, effective bets, HRP, correlation regime — all in
`advisor_risk.py`, all true by inspection, none needing a forecast). It is
computed and shown, but it does not drive a single verdict.

So the honest starting point: **we do not have a stock-picking edge; we
have a well-instrumented trend-following read that churns an investor's
book on a trader's clock.** The instrumentation (grading, trial ledger,
dark flags, P-60 call scoring) is genuinely best-in-class and is the asset
to build on. The picking logic is not.

---

## 1. The faults, named preemptively

Ranked by how much money each one is likely costing, not by how hard it is.

### F1 — Horizon mismatch: a trader's lens on an investor's book 🔴
Holdings are CNC, held for months to years. The advisor judges them on
EMA-50/200, 20-day consistency, RSI and 20-day momentum, and grades itself
at 10 and 30 days. Every SELL it issues on a long-term holding is a
short-horizon call on a long-horizon asset. The day-40 decay above is the
cost made visible.

### F2 — Tax and cost are invisible to every verdict 🔴
A SELL/rotate pays: STT 0.1% each side, brokerage/slippage (~0.3% round
trip in P-60's model), and **tax** — 20% STCG if held < 12 months, 12.5%
LTCG above the ₹1.25 L annual exemption after (check the current Finance
Act; rates moved in July 2024). A holding at +30% sold at month 11 hands
~6% of its value to tax that waiting 30 days would halve. No verdict,
rotation sizing or grade knows the holding period, the unrealised gain, or
the LTCG clock. `advisor_risk` has a tax-loss-harvest read, but it is a
flag, not a rule in the decision. **This is the one fault whose fix is
guaranteed to help regardless of whether any signal works**, because it
only ever suppresses churn.

### F3 — Scoring is absolute, not cross-sectional 🟡
"Above EMA-200 = +20" regardless of whether 480 of 500 names are above
theirs. Ranking what to hold is a relative question. FACTOR_LAB fixed this
in the lab (z-scores per date) and it still didn't produce a winner — but
every future factor must be built this way, and the live score still isn't.

### F4 — The 20-day momentum term is a reversal factor 🟡
Jegadeesh (1990): 1-month returns *reverse*. The robust anomaly is 12-1
(12-month return skipping the last month), which ships only as a dark flag
(`mom_12_1`) and is the only factor that kept a positive sign in every cut.
The live score weights the wrong window and ignores the right one.

### F5 — Wrong benchmark 🟡
Alpha is measured vs Nifty 50. The household is PSU-bank-heavy (16.4% vs
4.4% index), small/mid-cap tilted, IT-light. "Beat Nifty by 2%" on a
PSU-bank name in a PSU-bank rally is sector beta, not skill; "lost to Nifty"
in an IT rally is the same thing in reverse. Grading against the wrong
yardstick makes the scorecard noisier than it needs to be and can hide a
real signal or invent one.

### F6 — Rotation targets inherit the null score 🟡
`find_rotation_candidate` picks the highest trend-score name in the sector.
The thing we know doesn't predict is used to choose what to buy, and the
live targets are at 23.8% by day 40. P-57 due diligence filters red flags
*after* the pick; nothing good chooses the pick.

### F7 — Backtests are survivorship-flattered and non-point-in-time 🟡
Every study applies today's Nifty 500 membership to the past. Names that
fell out (the ones a trend score would have told you to hold on the way
down) are missing. All historical evidence is therefore optimistic. We
cannot certify any new factor until this is fixed.

### F8 — Fundamentals have no history 🟢
`fundamentals.py` holds one hand-pasted Screener snapshot (stale at 45 d).
Quality/value factors are untestable because there is no point-in-time
series — and every month we don't start accumulating one is a month we can't
test later. This is a fault of omission with a clock on it.

### F9 — Known-good event anomalies are unexploited 🟢
`event_calendar.py` has an earnings-feed slot that is empty. Post-earnings-
announcement drift (PEAD) is the most replicated short-horizon anomaly in
the literature, including Indian evidence; insider/promoter buying (SAST
disclosures), bulk/block deals, and mutual-fund holding changes (AMFI
monthly portfolios) are free NSE/AMFI data with published evidence. None
are captured.

### F10 — Risk layer is advisory-only 🟢
The one thing that survived — effective bets, correlation clusters, HRP
weights — is printed as "risk lines" and never changes a target weight or
a rotation size. Household caps (P-53) are simple % caps, not risk-based.

### What is *not* a fault (keep it)
Grading on non-overlapping windows; the trial ledger's z ≥ 3.72 haircut;
dark-flag discipline; pre-registered variants; P-60's Bonferroni lessons;
"only through moves". These are why the faults above are *known* instead
of suspected. Every phase below keeps them.

---

## 2. What "best in the world" has to mean here

Not "predicts stocks". Nobody certifiably does at the single-name,
one-month horizon, and the evidence above says we don't either. For a
two-account household book it means:

1. **Never loses money to its own process** — no churn, no tax leak, no
   concentration blow-up the risk layer already saw coming.
2. **Harvests the few premia that survive out of sample at long horizons**
   — momentum (12-1), quality, low-volatility, earnings drift — in a
   rules-based, cross-sectional, cost-aware way, rebalanced slowly.
3. **Knows what it doesn't know** — every rule carries its own kill
   criterion and the ledger haircut; nothing graduates on plausibility.
4. **Explains itself in plain language, with the evidence row attached**
   — the Ask/brief layer already does this; it just needs better things to
   say.
5. **Learns from the operator** — the tradebook is a record of 263 human
   decisions; nobody has asked whether they beat the advisor.

---

## 3. The plan — six phases, each with its own gate

Each phase ships dark (computed, logged, graded) → paper book → suggestions.
Nothing moves to the next stage without the ledger's bar. Rough effort in
brackets is engineering time; the calendar is set by data accrual.

### Phase 0 — Fix the ruler (2 weeks) · *prerequisite for everything*
- **Point-in-time universe.** Build `index_membership(date)` from NSE's
  published index-reconstitution history (semi-annual changes since 2000s
  are public) so every backtest uses the names that *were* in the Nifty
  500, including the ones that left. Store in `data/nifty500_history.csv`.
- **Corporate-action-adjusted bars.** Verify the 5.2-year bar cache is
  split/bonus adjusted (Kite historical is; our own `daily_bars` sync from
  08-25 needs a check against two known splits). Add a nightly diff.
- **Right benchmark.** Grade every call three ways: vs Nifty 50 (keep, for
  continuity), vs its **sector index** (NSE sectoral indices are free), and
  vs a **size-matched** cohort (same market-cap decile). P-60's
  `call_outcomes` gets `sector_alpha_pct`, `size_alpha_pct` columns.
- **Full cost + tax model.** `costs.py`: STT, brokerage, impact (by ADV
  bucket), and tax given buy date, qty, avg price, FY-to-date realised
  gains. One function: `after_tax_pct(sale)`.
- **Bootstrap CIs** on every scorecard number (block bootstrap by date) so
  n=21 never again reads as a result.
- *Gate:* re-run ADVISOR_LAB and FACTOR_LAB on the point-in-time universe.
  Expect everything to get *worse*; record it. That is the baseline.

### Phase 1 — Stop the bleeding: tax-aware action layer (1 week) · *first thing that changes a suggestion*
- A verdict becomes an **action** only when expected benefit clears cost:
  `SELL` → "sell now" only if `expected_loss_avoided > after_tax_cost`;
  otherwise "sell after <LTCG date>" or "hold, trim on strength".
- LTCG clock on every holding row and move card; the brief carries
  "3 names cross 12 months this month".
- Loss harvesting as a **rule**, not a flag: an underwater SELL-grade name
  is sold in the FY where it offsets realised gains.
- *Measure:* replay the last 199 holdings calls through the layer; report
  churn avoided, tax saved, alpha forgone (if any). *Expected:* this alone
  beats the current advisor on after-tax book return, because the day-40
  numbers say the sells weren't adding anything to pay for themselves.
- *Gate:* counterfactual after-tax return ≥ actual on the P-60 window.

### Phase 2 — Put the survivor to work: risk-based construction (2 weeks)
- Target weights from **HRP / risk parity** on the Ledoit–Wolf covariance
  (already in `advisor_risk.py`), capped by P-53 household rules.
- "Effective bets" becomes a headline number on `/advisor` with a floor
  (e.g. < 6 effective bets on 49 names = you own one trade; say so).
- Rotation sizing uses risk contribution, not ₹ freed.
- Correlation-regime read gates how aggressive any rebalance is.
- *Gate:* a paper book (PICKING-RP) rebalanced monthly to HRP weights,
  vs the real book and vs Nifty 500 TRI; read at 2027-03-31 with the
  existing books. Rule-class, so it can ship as suggestions once the
  plumbing is tested — it makes no forecast.

### Phase 3 — Slow factors at the horizon where they exist (6 weeks build, then accrual)
- Replace the daily trend score as the *ranking* engine with a
  cross-sectional, sector-neutral composite tested at **3/6/12-month**
  horizons, monthly rebalance, on the point-in-time universe:
  `mom_12_1`, `low_vol`/`low_ivol`, `prox_52w`, plus **quality** once
  Phase 4 gives it history. Equal-weight z's — no fitted weights (the lab
  showed fitting is the enemy).
- Data: NSE bhavcopy archive goes back to the 1990s for free; build a
  20-year daily panel for ~1,500 names with the adjustment factors from
  Phase 0. That is 20× the dates we have, and 101 dates was the stated
  power ceiling.
- Prior: NSE's own Nifty 200 Momentum 30 and Nifty 100 Low Vol 30 indices
  have live histories since 2005 — use them as an external sanity check
  that the premia exist in this market before trusting our replication.
- The daily trend read survives only as a **timing / exit overlay** inside
  the slow framework (where trend-following has its real evidence: multi-
  month, not multi-day), dark-flagged like everything else.
- *Gate:* holdout Holm-corrected, ledger z ≥ 3.72 on the 20-year panel;
  then a paper book for two quarters; then suggestions.

### Phase 4 — Fundamentals with memory + event anomalies (ongoing from day 1)
- **Start the clock now:** store every Screener export as a dated snapshot
  (`fundamentals_history`, point-in-time by `asof`), not an overwrite. In
  18 months there is a testable quality series; in 36 a decent one.
- **Earnings calendar feed** (NSE corporate announcements / BSE API, free)
  into `event_calendar.results_symbols`; grade PEAD: did names with a
  positive surprise drift for 60 days? This is the one short-horizon
  anomaly with a real chance of surviving our bar.
- **Insider & flow data:** SAST/PIT disclosures (promoter buys), bulk/block
  deals, AMFI monthly MF portfolios, NSDL FII per-stock. Capture only, one
  trial each, same ledger.
- P-57 due diligence extends to all of the above as red/green flags on
  every target.

### Phase 5 — Learn from the human (2 weeks, needs the tradebook)
- Grade the operator's 263 real trades the P-60 way (sector- and
  size-adjusted, after tax). Compare: human vs advisor on the same names,
  same dates; overrides vs followed calls.
- Output: a **regret ledger** — "the 5 calls you overrode, net +₹X"; "the
  7 you followed, net −₹Y". Behaviour the data likes becomes a rule
  candidate; behaviour it doesn't becomes a brief line.
- *Gate:* n ≥ 100 decisions per arm before any rule.

### Phase 6 — The tournament (continuous)
- Every hypothesis — a factor, an LLM-generated thesis, a macro overlay
  (P-52 tape), a human rule from Phase 5 — enters as a **paper book with a
  pre-registered kill date and criterion**. The ledger scores them all on
  one page. Nothing graduates without clearing z ≥ 3.72 and surviving one
  independent window after it was proposed.
- LLM agents (the Ask layer, Claude) may *propose* entrants and write the
  thesis/falsifier text; they never pick a stock for the live book, and
  every claim cites rows. (Operator rule, 11-13; keep it.)

---

## 4. Order of work and what to expect

| when | do | what you'll see |
|---|---|---|
| now | Phase 4 capture (snapshots, earnings feed, insider/flows) — cheap, clock-bound | nothing visible; data accrues |
| weeks 1–2 | Phase 0 | scorecards get sector/size alpha + CIs; backtests restated (worse, honest) |
| week 3 | Phase 1 | verdicts gain "when" and "after tax"; churn drops; a counterfactual number |
| weeks 4–5 | Phase 2 | HRP target weights + effective-bets headline; PICKING-RP paper book starts |
| weeks 6–12 | Phase 3 build | 20-year panel; factor results on a point-in-time universe |
| Q1 2027 | Phase 5 | human-vs-advisor read |
| 2027-03-31 | existing paper-book read (POST_MORTEM §6) + PICKING-RP read | first decision on whether anything replaces v1 as the ranking engine |

The current v1 keeps running untouched throughout — it is the control arm.

## 5. What I would *not* do

- Tune v1's weights, thresholds or regime rules again (three studies say no).
- Add an ML model on the 101-date panel (it will fit noise; the lab proved
  selection on this panel is negative out of sample).
- Let any LLM pick a stock for the live book.
- Paid data before the free NSE/AMFI/BSE sources are exhausted.
- Promote anything on a single split or without an independent window.

## 6. Decisions needed from the operator

1. Greenlight Phase 0 + Phase 4 capture (no behaviour change) — recommended now.
2. Greenlight Phase 1 (the first suggestion-level change: tax-aware actions).
3. Confirm the benchmark set (Nifty 50 + sector + size) and the tax
   assumptions to encode (FY, exemption used so far, both accounts).
4. Whether the 20-year NSE panel may live locally in Parquet (same decision
   as the Gate #6 harness: local, not Supabase).
