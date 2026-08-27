# Round 3 — response to Fable

Paste below the line. Assumes rounds 1–2 are in context.

---

I ran Phase A. Your conclusion survives everything below and gets stronger —
but three of your numbers don't, one of your proposed tests can't be run at
all, and there's a finding neither of us had.

## 1. Your §2 decomposition is wrong, and it was my documentation's fault

You built the loss decomposition on my documented −0.240R cost figure. I
measured it properly. It is **−0.398R**.

The cause is upstream of costs. `RISK_PER_TRADE_PCT` is configured at **1.0%**
(₹1,000). The measured mean risk per trade across 907 trades is **₹140 —
0.140% of capital**, median ₹151. Sizing resolves through
`max(1, min(qty_risk, qty_max))`, and with stops averaging **0.62% of price**
the risk-derived quantity far exceeds the position cap, so `qty_max` binds and
the risk rule never does. Every position lands at ~40% of capital
(₹35,648–39,930 observed live), and realised risk collapses to ~1/7th of
design.

Fixed rupee costs are therefore **7× heavier in R terms** than the 1% sizing
assumed:

| | |
|---|---|
| measured charges (entry leg) | 5.34 bps |
| measured slippage incl. charges (entry leg) | 10.34 bps |
| **round-trip cost** | **₹55.6 = 0.398R** |
| my documented figure | −0.240R |
| **cost share of the −0.425R loss** | **~94%**, not ~60% |
| identical rupee cost at a true 1% risk unit | **0.056R** |

Arithmetic check: 914 × −0.425R × ₹140 ≈ −₹54,000 against an actual −₹50,849.

**Your corrected decomposition:** costs −0.398, residual **−0.027R** — not the
−0.067R you derived. Your qualitative claim ("the residual is statistically
zero") holds and is now *tighter*. Your §2 holding-period argument also gets
stronger, since the frequency tax is 66% larger than you were told.

**The question this raises, which I want you to answer.** Every R figure in
this project rests on a ₹140 risk unit rather than the ₹1,000 the config
implies. Is −0.425R therefore a distorted scale, and what would proper 1%
sizing have produced — a *different* strategy result, or the same rupee
outcome expressed against a larger denominator? I can argue both and I don't
trust my own reasoning here.

## 2. A sixth item for your "paper is silently flattered" list — and it's the largest

You listed four (shortability/ban list, auto-square-off, spread and partial
fills, circuit limits). Here is a fifth, measured on the 2026-08-27 session:

**Peak gross exposure ₹785,346 against ₹100,000 deployed — 7.85×, across 20
concurrent positions.**

`MAX_POSITION_PERCENT` caps each position at 40% *individually*. There is **no
portfolio-level cap** — no `MAX_CONCURRENT_POSITIONS`, no gross-exposure gate —
and `PaperBroker` never checks margin, so the constraint that binds in reality
does not exist in the simulator. Zerodha MIS equity leverage is ~5×.

**Consequence: the paper book is not reproducible with real money at this
capital.** Roughly a third of those concurrent positions could not have been
taken, and which ones drop changes the P&L. This does not rescue anything —
expectancy is negative either way — but it means your stopping ground #2
("zero costs plus perfect fills ≈ a coin flip") describes a book that was never
executable in the first place. **Does that change anything in your analysis, or
is it just a sixth nail?**

## 3. Your Phase A charge-model item cannot be run

`tradebook` holds **fills only** — `symbol, isin, trade_date, exchange,
segment, series, trade_type, quantity, price, trade_id, order_id, executed_at,
source`. **No charge columns**, because Zerodha's tradebook export omits the
contract-note breakdown. Its 215 rows are also `segment = EQ`, dated
2026-02-11 → 2026-05-25 — largely delivery trades predating the paper period,
so not like-for-like even with charges attached.

What I could verify: the modelled schedule matches Zerodha's published intraday
card. An empirical validation needs actual contract notes, which is a manual
PDF exercise. **Is it still worth doing given §1 measured the realised cost
directly from execution blobs, or is that measurement sufficient?**

## 4. Evidence the measurement loop works, offered as a check on your §4F

Your sharpest criticism was that a beautifully instrumented null result can
consume operator-years, and that my §1.3 framing of token acquisition as "the
biggest constraint" was a strategy failure dressed as an ops problem. Both
landed. But two things from the last session are relevant to whether the loop
earns its keep:

- An invariant I added the previous night (I-7, labelling completeness) **fired
  on its first real use**: 928 directional decisions logged, 0 labelled. Fixed;
  the edge study moved to +0.010R, t=+0.4, n=2,428, verdict unchanged. Without
  it that day would have entered the record 100% unlabelled.
- A fill-model change I shipped with a **wrong stated effect direction** was
  caught by replay before it went live, and its verification passed on real
  data reading exactly what the corrected prediction said (14/14 in band, mean
  R +1.266 against a predicted ~1.33).

I am not arguing this justifies continuing. I am asking a narrower question:
**when you say the machinery should transfer to a non-adversarial domain, is
the transferable unit the invariant-and-verify discipline specifically, or the
whole apparatus?** Your rule of thumb — instrument only decisions recurring
weekly with plausible effect >10% — implies most of this loop should not come
with me. I want that made explicit before I rebuild it somewhere else out of
habit.

## 5. On the decommission, one practical objection

Phase C says delete the trading-cycle call rather than gate it behind another
env var, because "env vars are how the paper/live boundary almost stayed
armed." I agree with the reasoning. But deletion is also the step that makes
Phase F's stopping criteria unverifiable in one direction — if I delete it and
later want the 2027-03-31 book reads in context, I cannot cheaply re-measure
anything about the intraday layer.

**Is there a staging you would accept** — for example, delete the call, keep
the frozen dump as the sole means of re-analysis, and pre-commit that any
re-instantiation requires the full reopening criteria from Phase D? Or is any
reversibility exactly the hedge that keeps the project alive?

## 6. What I want from round 3

Short. Four things:

1. The §1 question: is −0.425R a distorted scale, and what would 1% sizing have
   produced?
2. Whether §2 (7.85× exposure, book not executable) changes your analysis.
3. Whether the contract-note validation is still worth the manual effort.
4. The §4 question: what specifically transfers, and what should I deliberately
   leave behind.

Then, if your view has changed at all from round 2, say how. If it hasn't, say
that plainly and stop — I would rather have a short confirmation than a
manufactured update.
