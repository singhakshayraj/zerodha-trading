# Track C — Predictive Model on Our Own Decision Data

Learning log for the "can a program predict/improve on our trading
decisions" thread (started 2026-07-15). Companion to `VISION.md` §7a
(condensed durable version) and `SESSION_HANDOFF.md` (fast-moving state).
This doc is the fuller teaching record — read it when the "why" behind a
Track C design choice isn't obvious from code.

## What this is (and isn't)

Started as "build an LLM from scratch." Unpacked into three tracks
(see memory `llm-learning-project`); this doc covers **Track C** only —
the one aimed at actually improving trading decisions using our own data.

**Track C is NOT an LLM problem.** LLMs are transformers trained on
next-token prediction over text — built for reading/generating language.
Predicting a number or direction from structured historical data (stock
name, date, indicators → future price/direction) is a completely
different, older, more mature branch: **supervised learning /
predictive modeling**, specifically tabular classification/regression
(sometimes framed as time-series).

**Track C is NOT a RAG problem either.** RAG retrieves relevant facts to
feed a text-generating model so it reasons over real data instead of
guessing. It's the right tool for Track B (ask natural-language questions
about our data), not for "learn a function that predicts an outcome from
features."

## Core vocabulary

- **Feature** = an input the model sees at prediction time. In our case:
  RSI, EMA positions, ADX, trend_tells, market_context, news_sentiment —
  all already computed and logged in `brain_decisions.indicators` (jsonb)
  on every single decision, BUY/SELL/HOLD/SKIP alike.
- **Label / target** = the known correct answer for historical rows, used
  to train and then to score the model. For us: did this decision's
  implied trade win or lose (direction + magnitude), i.e. an R-multiple —
  the same unit `trades.r_multiple` already uses for real trades.
- **Training data** = historical rows where both feature and label are
  known. **We already have most of this sitting in prod** — indicators
  are captured on every decision, and we already know the label recipe
  (see "Labeling every decision" below); it just wasn't computed for the
  ~99% of decisions that never became a real trade.
- **Overfitting** = a model that fits the historical noise in a small
  dataset rather than a real, generalizable pattern. The single biggest
  risk in this track — see below.

## The honest goal (agreed 2026-07-15)

**Not** "beat the market." Quant funds' edge is structural — alternative
data (satellite, transactions, order-book microstructure), colocated
low-latency execution, and critically breadth (thousands of small
uncorrelated edges run simultaneously so a 51-52% edge compounds via
volume/diversification). None of that is solo-reproducible, and the
specific signal space we're using (daily-timeframe EMA/RSI/ADX) is
decades-old and public — most of what's discoverable there is either
already priced in or too weak to survive transaction costs.

**The honest, achievable goal**: can a model trained on our own logged
features beat our OWN hand-coded rule-based baseline (the confidence-
weighted `trend_score`/`generate_signal` logic), measured strictly
out-of-sample? Put differently: does it tell us something the hand-coded
weights don't — which regime, sector, or time-of-day the existing signals
actually work in vs don't? That is genuinely attainable and useful,
independent of whether it ever "beats the market."

## The #1 risk: overfitting via repeated retraining

"Keep retraining/improving, will it get there eventually?" — only if the
retraining loop respects a specific discipline. With a small, slowly-
growing dataset (~10-20 real trades/day before 2026-07-15's pacing fix,
more after), repeatedly tuning a model against the SAME historical window
does NOT converge toward truth — it converges toward fitting that
window's noise (the classic multiple-testing trap: try enough variations
against fixed data and you WILL find something that backtests
beautifully by chance).

The fix is **walk-forward validation**: train on data up to date X, test
ONLY on strictly-later unseen data (X+1 onward), then roll the window
forward and repeat. Never let the model see the future during training,
and never trust a backtest that hasn't been validated this way across
multiple non-overlapping windows. This is the same discipline `VISION.md`
§5/§6 already demands of the rule-based system before real money — Track
C inherits it, not a lighter version of it.

## Costs are a hard floor

The paper broker already models Zerodha's realistic MIS cost schedule
(~0.1% round trip — brokerage, STT, exchange, SEBI, GST, stamp). Any
model-driven edge has to clear that bar consistently. "60% directional
accuracy" can still lose money net of costs — this kills more amateur
"edges" than bad models do. Any Track C evaluation must score against
realized/simulated pnl (which already includes costs), not raw direction
accuracy.

## Paper vs real money — settled, don't re-litigate

Switching to real money does not help Track C. The paper broker fills at
real live LTP with the realistic cost model above — the data is exactly
as "real" for training purposes as live execution would be. Real money
doesn't speed up the data-accrual clock (same calendar either way) and
doesn't fix the small-sample/overfitting problem. It only adds real
financial risk before `VISION.md`'s own go/no-go gates are met. Stay on
paper; don't let ML curiosity be the reason to skip the gates.

## Labeling every decision, not just executed trades

The highest-leverage, lowest-risk lever for Track C's data problem: only
~1% of logged decisions (BUY/SELL signals that cleared every gate AND
weren't paced out) ever become a real trade with a known `pnl`/
`r_multiple`. But every BUY/SELL decision already carries `stop_loss`,
`target`, and `price_at_decision` in its logged snapshot — enough to
compute "what would have happened if this had been taken as a fresh
entry," using the same stop→target priority order the live exit logic
uses (`brain.py::_evaluate_exit`), walked forward through the 5-min
candle archive.

This is a genuine counterfactual label, not a real fill — it doesn't
account for whether concurrent-position/capital limits would have even
allowed the entry, and it ignores slippage/costs (unlike real trades'
`r_multiple`, which already bakes those in via the paper broker). Still
valuable: it turns a ~14-trades/day dataset into a ~hundreds-of-decisions/
day dataset, which is the actual bottleneck for any of this being
statistically meaningful sooner than months out.

**Built 2026-07-15** (brain `78a8412`): `decision_outcomes` table (prod+sim
migrated) + `decision_outcomes.py::label_decisions_for_date()` — offline,
on-demand (`scripts/label_decisions.py`, NOT wired into the live
scheduler), reads `brain_decisions` + `candles`, writes one outcome row
per directional decision. See that module's docstring for the exact
walk-forward logic and known limitations (same-bar stop+target ambiguity
resolved conservatively as stop-first, matching live priority order).

Dry-run validated against 2026-07-14 (571 BUY/SELL decisions — a ~40x
multiplier over that day's 14 real trades): all 571 correctly labeled
`NO_DATA`, confirming the script fails safe/honest rather than
fabricating an outcome when the candle archive is empty for that date.

**Known gap**: only works for decisions on/after 2026-07-15 — the
candle-archive batch-dedup bug (fixed 2026-07-14 post-close) means
`candles` has zero rows for 07-14 and earlier, so those days label as
`NO_DATA` until/unless a `quote_snapshots`-based coarser fallback is
built later (not done — parked idea, not a current need).

## Status

Not yet decided: whether Track C is the track to actually build training/
inference on top of the labeled data. Labeling itself is infrastructure
useful regardless of that decision — it's pure data enrichment, doesn't
commit to any modeling choice yet.
