# Vision — Zerodha Auto-Trading System

**The single source of truth for what we're building, why, and what "done" means.**
Read this first when returning to the project. Companions:
`docs/PAPER_TRADING_ROADMAP.md` (tactical phases) · `docs/SESSION_HANDOFF.md`
(session-to-session state).

---

## 1. Mission

Build an autonomous intraday trading system that **earns the right to trade
real money** by first proving itself — statistically and operationally — on
real market data with simulated execution. Long-term: a self-improving loop
(§7) where every trade generates data, data generates learning, and learning
generates a better algorithm — with losses always capped by code and every
improvement re-proving itself before touching capital.

The path, in order:

| Stage | Proves | Status |
|---|---|---|
| 1. Money-path correctness | P&L math, guardrails, session lifecycle can't corrupt results | ✅ Done (Phase 0 + mock suite) |
| 2. Paper execution layer | Real decisions, real prices, simulated fills with real costs | ✅ Done (Phase 1 + cost model) |
| 3. Always-on infrastructure | Brain survives unattended: reboots, token expiry, silent failures | 🔨 In progress (Oracle VM) |
| 4. Backtest | Strategy has edge across regimes (years of data, minutes to run) | ⬜ Not started |
| 5. One-month paper run | Live infra + strategy behave as backtest predicts | ⬜ Gated (see §5) |
| 6. Real money | Everything above passed its criteria | ⬜ Gated (see §6) |
| 7. Statistical review loop | Which signals pay after costs; refine and repeat | ⬜ Future |

**Two different questions, two different tools:** the backtest answers "does
the strategy have edge?" (needs years of data across regimes); the paper month
answers "does the live system behave correctly?" (needs real-time operation).
One month ≈ 20 trading days is *not* a strategy sample — never conclude edge
from it alone.

---

## 2. Edge hypothesis

> A month of data can't confirm or refute anything without a prior
> hypothesis — you'll fit narratives to noise. State it or you can't test it.

**Working hypothesis:** intraday momentum/regime-following on a scored
universe of liquid NSE stocks — enter when signal confidence and market
regime align, exit on SL/target/EOD. The claimed edge: systematic discipline
plus regime filtering avoids the impulsive entries and held losers that
dominate retail flow.

If the data contradicts this (wins come from mean-reversion-shaped setups,
regime filter adds nothing), **the hypothesis changes — not the narrative.**

---

## 3. Architecture

| Piece | Role | Where |
|---|---|---|
| `zerodha-brain` (Python) | Decision engine: signals, risk, regime, execution | Oracle Cloud free-tier VM |
| `zerodha-trading` (Next.js) | Dashboard, API, guardrails | Vercel |
| Supabase `zerodha-trader` | Prod: sessions, trades, decisions, heartbeat, config | Cloud |
| Supabase `zerodha-trading-sim` | Staging for `/mock` validation suite | Cloud |

**Core design rule:** market data (read-only Kite quotes) is always real;
only the execution layer swaps between `PaperBroker` and `OrderManager`
(`PAPER_TRADING` env flag). Paper and real trading share every other line of
code, so the paper month validates the same system that will trade money.

**Paper fill realism:** fills at live LTP + adverse slippage + full Zerodha
MIS charges (brokerage, STT, exchange, SEBI, GST, stamp — ~0.1% round trip)
folded into the fill price. Even so, LTP fills ignore spread/depth/partial
fills — **paper P&L is an upper bound, not truth.**

**Infra constraint:** the free VM (`VM.Standard.E2.1.Micro`, 1 OCPU, ~500MB
usable RAM, Oracle Linux 9, IP `129.159.233.238`, user `opc`) is tiny.
Decisions must respect it — e.g. Docker daemon overhead vs bare
python+systemd is a live question; heavy work (backtests, analysis) runs on
the Mac, never the VM. The VM's only job: run the polling brain reliably.

---

## 4. Trading fundamentals encoded

How the best short-term traders operate, translated into mechanisms this
system enforces. The point of automation: these are exactly the rules humans
know and still break under pressure — code doesn't.

### 4.1 Think in R, not rupees

Every trade risks a fixed unit **R = entry − stop, per position sized so R ≈
1% of capital.** All outcomes measured as R-multiples (+2R win, −1R loss).
This normalizes across stock prices and makes the dataset comparable.

- **Expectancy = (win% × avg win in R) − (loss% × avg loss in R).** The only
  number that matters long-term. Positive expectancy after costs = edge;
  everything else is commentary.
- Never risk more than 1% per trade, ~3-4% total open risk. Survival math:
  at 1% risk, a 10-loss streak = −10%; recoverable. At 5% risk, same streak
  = −40%; needs +67% to recover. **The first job is staying in the game.**
- Asymmetry required at entry: no trade taken unless target ≥ 1.5R at a
  realistic level (structure-based, not hope-based).

### 4.2 Stops are decided before entry, honored always

Stop placement at entry, based on structure (below support / above
resistance / volatility-scaled via ATR), never moved *away* from price.
Widening a stop = converting a planned small loss into an unplanned big one
— the single most common way short-term traders die. Code makes it
impossible.

### 4.3 Trade the market you're in (regime)

- Trend day → momentum entries, trail stops, let winners run to close.
- Range/chop day → either stand aside or fade extremes; momentum signals in
  chop are the #1 false-positive source.
- The regime detector's job is mostly to say **"no trade"** — the best
  short-term traders are flat far more often than they're positioned.
  Standing aside is a position.

### 4.4 Respect the intraday clock (NSE)

| Window (IST) | Character | Policy |
|---|---|---|
| 9:15–9:30 | Opening rotation — wide spreads, stop-hunts, gap resolution | No fresh entries; observe, let opening range form |
| 9:30–11:00 | Cleanest trends of the day | Primary entry window |
| 11:30–13:30 | Lunch chop — thin volume, mean-reverting noise | Raise entry bar or stand aside |
| 13:30–14:45 | Afternoon move — often resumes or reverses morning trend | Secondary entry window |
| 14:45–15:15 | Square-off pressure, MIS auto-close approaching | No new entries; manage exits only |
| 15:15+ | — | Flat, always. No overnight risk in an intraday system |

Event days (monthly expiry, RBI policy, budget, Fed nights): reduce size or
stand aside — the edge is calibrated to normal days.

### 4.5 Process over outcome

A trade that followed every rule and lost is a **good trade**; a rule-breaking
winner is a **bad trade** — its profit teaches the wrong lesson. Therefore the
journal (our decision log) grades trades on rule-adherence, not P&L, and the
weekly review asks "did the system follow its rules?" before "did it make
money?". Short-term P&L is noise; 100-trade expectancy is signal.

### 4.6 Losing-streak throttle

After N consecutive losses (start: 3), halve position size until a win
resets it. Streaks are usually the market telling you the regime changed
before the regime detector sees it. This is the automated version of the
best traders' "size down when cold, never revenge-trade."

## 4b. Risk limits (enforced in code, not aspirational)

- **Max daily loss = 3R (~3% of capital)** — hard stop; session ends, no
  re-entry same day. Three planned losses is a normal bad day; more usually
  means conditions changed and the system shouldn't be trading them.
- **Max position size** — sized from stop distance so risk per trade ≈ 1% of
  capital (§4.1), with an absolute cap as % of capital per position.
- **Max concurrent positions** + sector-concentration cap (three positions
  in one sector ≈ one position at 3× size).
- **Universe selection must be explicit and bounded** — if stocks enter the
  universe because they scored well in our own system, that's a feedback
  loop into yesterday's winners. Document the rule; cap the churn.
- Dashboard headline metrics: **profit factor, max drawdown, win rate — all
  net of costs.** Raw P&L is a vanity number.

---

## 5. Pre-run gate — ALL must pass before the month clock starts

The month only measures what we want (live strategy behavior) if the
infrastructure is already boring. Otherwise it degrades into a month of
infra debugging with holes in the dataset.

| # | Gate | Why it's a gate |
|---|---|---|
| 1 | Brain live on VM, auto-restart, survives reboot, fresh heartbeat | The run is unattended |
| 2 | Swap configured on VM | ~500MB RAM; OOM killer takes the brain silently otherwise |
| 3 | enc_token automation (TOTP auto-login, or hard pre-open alert) | Token dies ~6 AM IST daily; one forgotten morning = dataset hole. **Biggest single run-killer.** |
| 4 | External heartbeat watchdog with alerting | Watchdog on the VM dies with the VM; must be external |
| 5 | Market-hours auto start/stop + holiday calendar | No manual session starts for a month |
| 6 | Backtest executed across regimes (≥ 2020 crash, 2021 bull, 2022 chop) | Establishes the edge baseline the paper month is compared against |
| 7 | Realistic cost model in paper fills | ✅ done — without it paper P&L is fantasy |
| 8 | Railway decommissioned | Exactly one brain writing `active_session_id` |
| 9 | Decision-logging completeness verified (SKIP/HOLD with full indicator snapshots) | A decision not logged is a training example lost |

---

## 6. Go / no-go criteria for real money

Defined **before** the run so end-of-month isn't a rationalization exercise.
Evaluated on paper month + backtest together:

| Metric | Go | Kill / iterate |
|---|---|---|
| Profit factor (net of costs) | > 1.3 | < 1.1 |
| Max drawdown | < 10% of paper capital | > 15% |
| Market-hours uptime | > 95%, zero silent failures | any silent data hole |
| Paper vs backtest win rate | within ~10% | divergence = sim or logic bug |
| Guardrails | every trigger fired correctly | any miss |

**In-between results = iterate and re-run. Not "close enough, go live."**

### Metric definitions (fixed, so numbers mean the same thing forever)

- **Profit factor** = gross profit of winning trades ÷ gross loss of losing
  trades, both **net of all transaction costs**. PF 1.0 = breakeven.
- **Max drawdown** = largest peak-to-trough decline of the equity curve
  during the run, as % of starting paper capital.
- **Win rate** = winning trades ÷ closed trades. Meaningless alone — always
  read with avg-win/avg-loss ratio (45% win rate is great at 2:1 payoff,
  terrible at 1:2).
- **Silent failure** = any market-hours window where the brain wasn't
  running AND nothing alerted us. Detected failures that alerted are uptime
  incidents; undetected ones are disqualifying.
- **Uptime** = market-hours minutes with fresh heartbeat ÷ total
  market-hours minutes in the run.

---

## 6b. Live kill criteria (while trading real money)

The go/no-go table governs *entering* real money; these govern *staying in*.
Enforced automatically where possible, reviewed weekly regardless:

| Trigger | Action |
|---|---|
| Daily loss limit hit | Session ends, no re-entry same day (already enforced) |
| Drawdown from equity peak > 10% | **Auto-halt.** Back to paper until cause understood |
| Rolling profit factor (last 30 closed trades) < 1.0 | Pause; compare live vs paper/backtest behavior for divergence |
| Any guardrail misfire or silent failure | Immediate halt — infrastructure trust is broken, that's worse than a losing streak |
| Live win rate diverges > 15% from paper baseline | Investigate fill quality / market change before continuing |

Principle: **losses are capped by code; profits are earned by edge.** No
system guarantees minimum profit — what we guarantee is minimum acceptable
performance, below which the system stops itself instead of bleeding.

## 7. The flywheel: trade → data → learn → improve

This is the long-term engine of the system — each cycle makes the next one
better-informed:

```
apply trading fundamentals → trade (paper, then real)
        ↑                          ↓
improve algorithm ← learn ← captured decision data
```

1. **Trade** — every cycle logs decisions (incl. SKIP/HOLD with full
   indicator snapshots), fills, costs, market context, regime.
2. **Learn** — simple statistics first: which signals correlate with wins
   *after costs*, which regimes suit the strategy, where sizing helped or
   hurt. Analysis runs on the Mac against Supabase data.
3. **Improve** — change ONE thing per iteration (a signal weight, a filter,
   a sizing rule), state the expected effect beforehand, then validate:
   backtest → paper → live. Never tune live directly.
4. **Repeat** — each loop's changes and outcomes get logged too, so the
   system's own evolution becomes data.

Rules of the loop:

- **One change at a time** — change five things and learn nothing.
- **Prediction before change** — "this should raise PF because X"; if it
  doesn't, that's information about the hypothesis.
- **ML only after 1000+ trades** — models trained on a few hundred trades
  overfit instantly. The month of paper data is the seed, not the model.
- **Improvements must survive the same gates** — a "better" algorithm
  re-passes backtest + paper comparison before touching real money.

---

## 8. Open decisions & decision log

Decisions made (and why), so we don't re-litigate them:

| Decision | Choice | Why |
|---|---|---|
| Hosting for brain | Oracle Cloud Always Free | Railway credits ran out; AWS free tier is 12-mo-limited; GH Actions has 6h job cap |
| VM shape | E2.1.Micro (x86, ~500MB) | A1.Flex (ARM, 4×24GB) out of capacity in ap-hyderabad-1; E2 also always-free |
| VM OS | Oracle Linux 9 (not Ubuntu) | Console wizard reset image silently; kept rather than risk losing free-tier slot. `dnf` not `apt`, user `opc` |
| Paper fill costs | Folded into fill price | Flows into P&L with zero schema changes |

Open (decide before the relevant gate):

- **Docker vs bare python+systemd on the VM** — Docker daemon costs ~60MB of
  a ~500MB box; systemd is leaner but loses image reproducibility. Currently
  proceeding with Docker; revisit if memory pressure shows.
- **enc_token: TOTP auto-login vs manual paste + hard alert** (gate #3).
- **Where the external watchdog lives** (gate #4) — Vercel cron, GitHub
  Actions schedule, or UptimeRobot-style service reading `brain_heartbeat`.
- **Backtest harness design** (gate #6) — reuse signal_engine directly on
  Kite historical candles; runs on the Mac, never the VM.

## 9. Doc maintenance

This doc changes only when the *plan* changes — new gate, changed threshold,
decided open question — not for day-to-day progress (that's
`SESSION_HANDOFF.md`). When a gate passes, mark it here. When a decision
closes, move it from "Open" to the decision log with its why.

## 10. Guiding principles

1. **Money-path correctness first** — bugs that corrupt P&L or guardrails
   get fixed before anything runs, even on paper.
2. **Real data, fake fills** — never simulate market data; only execution.
3. **Costs are part of the strategy** — for intraday, transaction costs are
   often the entire edge. Every simulated number is net of them.
4. **Everything logged** — including SKIPs. Unlogged decisions are lost data.
5. **Criteria before outcomes** — go/no-go thresholds, edge hypothesis, and
   gates are written down *before* the data arrives.
6. **Cheap and durable** — free-tier infra everywhere, so the system can run
   indefinitely at zero cost.
7. **The hypothesis bends to the data** — never the other way around.
