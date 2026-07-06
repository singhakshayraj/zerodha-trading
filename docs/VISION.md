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
| 6. Real money (ramped) | Everything above passed its criteria; size scales in per §6c | ⬜ Gated (see §6) |
| 7. Statistical review loop | Which signals pay after costs; refine and repeat | ⬜ Future |

**Two different questions, two different tools:** the backtest answers "does
the strategy have edge?" (needs years of data across regimes); the paper month
answers "does the live system behave correctly?" (needs real-time operation).
One month ≈ 20 trading days is *not* a strategy sample — never conclude edge
from it alone. §6 therefore evaluates **edge criteria on the backtest** and
**operational criteria on the paper month** — never the reverse.

---

## 2. Edge hypothesis

> A month of data can't confirm or refute anything without a prior
> hypothesis — you'll fit narratives to noise. State it or you can't test it.

**Working hypothesis:** intraday momentum/regime-following, restricted to
stocks that are *in play* that day — enter when signal confidence, market
regime, and stock-level participation all align; exit on SL / target /
time-stop / EOD. The claimed edge: systematic discipline plus regime and
participation filtering avoids the impulsive entries and held losers that
dominate retail flow.

### 2.1 The universe IS the strategy (in-play filter)

Momentum does not live in a static list of liquid names. On any given day,
most of the market is dead chop and a handful of stocks are **in play** —
gapping on earnings, news, a sector catalyst, or unusual volume. Signals on
everything else are the primary false-positive source. Therefore the daily
tradeable universe is defined mechanically, before entries are considered:

- **Opening-range RVOL ranking (primary):** by ~9:30, rank the eligible
  universe by relative volume in the opening range — cumulative volume in
  the first 15 minutes ÷ 20-day average volume for that same window. Take
  the **top 10 names with RVOL ≥ 2.0**; the list locks for the day.
  Identifying in-play early catches the move, not its tail.
- **Gap qualifier:** opening gap ≥ 1.5% with an identifiable catalyst also
  qualifies (subject to the same cap and ranking).
- Baseline liquidity floor (avg daily turnover) so fills are realistic.
- A stock not in the day's in-play list is untradeable that day, regardless
  of how clean its signal looks.

This rule is **market-driven, not score-driven** — it also closes the
feedback-loop risk (universe selected by our own past scores would tilt the
system toward yesterday's winners; RVOL/gap is external to the system).

**Evidence:** the best public study of this exact design (Zarattini, Barbon
& Aziz 2024, 7,000+ US stocks, 2016–2023) found that an opening-range
breakout applied to the broad universe averaged a *negative* return per
trade, while the identical strategy restricted to the top-20
opening-range-RVOL names produced Sharpe ~2.8 with large positive alpha.
The signal was nearly worthless; **the universe filter was the edge.**
Caveat: US evidence — MIS leverage limits, STT/stamp costs, price bands,
and a smaller daily in-play pool mean it must re-prove itself in our
gate #6 backtest, not be assumed.

### 2.2 Kill condition (defined before the backtest runs)

The hypothesis is **rejected** if the backtest (gate #6) shows, net of all
costs, across each of the three regime periods (≥ 2020 crash, 2021 bull,
2022 chop):

- Profit factor **< 1.1** in aggregate, **or**
- No regime period individually reaches PF ≥ 1.0 (i.e., the "edge" is one
  lucky regime).

Rejection triggers the pivot path (§7b) — it does **not** trigger threshold
tuning until something passes. If the data instead shows wins coming from
mean-reversion-shaped setups or the regime filter adding nothing, **the
hypothesis changes — not the narrative.**

---

## 3. Architecture

| Piece | Role | Where |
|---|---|---|
| `zerodha-brain` (Python) | Decision engine: signals, risk, regime, execution | Oracle Cloud free-tier VM |
| `zerodha-trading` (Next.js) | Dashboard, API, guardrails | Vercel |
| Supabase `zerodha-trader` | Prod: sessions, trades, decisions, heartbeat, config | Cloud |
| Supabase `zerodha-trading-sim` | Staging for `/mock` validation suite | Cloud |

**Core design rule:** market data (read-only Kite Connect quotes/WebSocket)
is always real; only the execution layer swaps between `PaperBroker` and
`OrderManager` (`PAPER_TRADING` env flag). Paper and real trading share
every other line of code, so the paper month validates the same system that
will trade money. Order placement runs exclusively from the VM's registered
static IP (§3c); data and analysis can run anywhere.

**Paper fill realism:** fills at live LTP + adverse slippage + full Zerodha
MIS charges (brokerage, STT, exchange, SEBI, GST, stamp — ~0.1% round trip)
folded into the fill price. Even so, LTP fills ignore spread/depth/partial
fills — **paper P&L is an upper bound, not truth.**

**Infra constraint:** the free VM (`VM.Standard.E2.1.Micro`, 1 OCPU, ~500MB
usable RAM, Oracle Linux 9, IP `129.159.233.238`, user `opc`) is tiny.
Decisions must respect it — e.g. Docker daemon overhead vs bare
python+systemd is a live question; heavy work (backtests, analysis) runs on
the Mac, never the VM. The VM's only job: run the polling brain reliably.

**Infra risk — Always Free reclamation:** Oracle reclaims idle Always Free
instances on accounts not upgraded to Pay-As-You-Go, and a low-CPU polling
brain can look "idle" to their heuristic. The external watchdog (gate #4)
detects it, but recovery isn't instant. Decide before the paper month:
convert the account to PAYG (still ₹0 within free limits) to remove the
reclamation class of failure entirely.

---

## 3b. Engineering requirements (the trade problem as a systems problem)

The strategy (§2, §4) is the hypothesis; this section is what makes the
machine that tests it trustworthy. A trading system's worst failures are
not strategy failures — they are silent engineering failures that corrupt
the experiment: stale data traded as fresh, duplicate orders, positions the
ledger forgot. Each requirement below exists because its absence has a
known catastrophic failure mode.

### 3b.1 Order lifecycle: idempotency and exactly-once semantics

The classic killer: network timeout *after* the broker accepted the order
but *before* the response arrived. Retry naively → double position.
Requirements:

- Every order carries a **client-generated order tag/ID**, persisted to
  Supabase *before* the API call. Retry logic checks the broker order book
  for that tag before re-placing — never blind-retry a POST.
- Order placement is a **state machine**, not a function call:
  `INTENT → SUBMITTED → ACKED → FILLED/REJECTED/ORPHANED`. Every transition
  persisted. `ORPHANED` (submitted, no ack, broker state unknown) halts new
  entries until reconciliation resolves it.
- Position state mirrors it: `PENDING_ENTRY → OPEN → PENDING_EXIT → CLOSED`,
  plus `UNKNOWN` after a crash. The brain never trades while any position
  is `UNKNOWN` or any order is `ORPHANED`.

### 3b.2 Crash recovery with open positions

The brain **will** die mid-position eventually (OOM, reboot, deploy bug).
On startup the sequence is fixed: (1) fetch broker positions + open orders,
(2) fetch internal ledger state, (3) diff them, (4) resolve — adopt broker
truth, re-attach stop/time-stop logic to any live position, log every
discrepancy as an incident — and only then (5) resume the decision loop.
**Broker state is truth; the ledger is a claim.** An open MIS position with
no functioning stop logic is the single most dangerous state this system
can be in; time-to-reattached-stops after restart is a monitored metric.
This recovery path is exercised in testing (gate #10), not discovered live.

### 3b.3 Reconciliation loop

Independent of the trading loop, every N minutes (start: 5): compare broker
positions/orders/fills against the internal ledger. Any mismatch →
alert + halt new entries (manage exits only). The §4c outer floor check
computes P&L **from broker-reported data, not the brain's ledger** — two
breakers sharing one calculation share one bug.

### 3b.4 Data quality gates (stale data is worse than no data)

- **Staleness:** every quote/candle carries its fetch timestamp; decisions
  reject inputs older than a threshold (start: 2× poll interval). A brain
  confidently trading yesterday's prices is a silent failure by §6's
  definition.
- **Completeness:** candle series validated for gaps before indicator
  computation — indicators silently computed over missing bars produce
  plausible-looking garbage.
- **Sanity bounds:** price moves > X% between polls, zero/negative volume,
  or out-of-band values quarantine the symbol for the day rather than feed
  the signal engine.
- **Clock:** VM on NTP; all timestamps stored UTC, reasoned/displayed IST.
  The 3:15 square-off and time-stops depend on the clock being right.

### 3b.5 Config and code identity per trade

Every decision row logs the **config version (hash) and code version (git
SHA)** it ran under. Without this, the §7 flywheel can't attribute outcome
changes to the one thing that changed. Config changes mid-session are
forbidden; config loads at session start, immutable until close. A manual
**kill switch** (Supabase flag, checked every cycle) flattens all positions
and halts — reachable from the phone via the dashboard.

### 3b.6 Deployment discipline

No deploys during market hours, ever — the deploy window is post-close.
Schema migrations are additive-only during an active experiment month
(new columns, never renames/drops). The paper month runs a **frozen code
version**; hotfixes restart the month clock unless they're pure
observability (§5's logic: the month measures a fixed system).

### 3b.7 Testing pyramid (money-path first)

1. **Unit tests** on all money math — P&L, R-multiples, sizing, cost
   folding, boundary checks. Property-based where possible (e.g. sizing
   never exceeds 1% risk for *any* input).
2. **Simulation/mock suite** (exists) — full session lifecycle against the
   staging Supabase.
3. **Replay tests** — recorded market days replayed through the decision
   loop; doubles as the §6.2 decision-fidelity harness.
4. **Chaos drills** (gate #10) — kill the brain mid-position, expire the
   token mid-session, drop the network mid-order, reboot the VM: each must
   end in a reconciled, alerted, safe state. Run before the month, then
   after any change to order/recovery code.

### 3b.8 Latency budget (modest, but measured)

This is a polling system, not HFT — but decision-to-order latency is
logged per trade, and the poll cadence must satisfy: worst-case detection
delay of a stop breach ≤ one poll interval, which bounds slippage beyond
the planned stop. If measured stop slippage exceeds the cost model's
assumption, either the poll tightens or the cost model worsens — the
backtest must use whichever is true.

## 3c. Regulatory scope (SEBI retail algo framework — in force since April 2026)

Automated order placement through broker APIs is now formally regulated
(SEBI circular Feb 2025; fully mandatory for all brokers from **April 1,
2026**). This system is designed to sit squarely inside the compliant
retail lane:

- **Under the 10 orders-per-second threshold** (we place 2–3 trades/day),
  the system is a regular API user: **no strategy registration, no
  exchange approval, no Algo-ID** required. Stay under; nothing in this
  design ever approaches the line.
- **Static IP, mandatory:** API order placement is rejected from
  unregistered IPs. The Oracle VM's fixed public IP is registered in the
  Kite Connect developer console. Market data (WebSocket, quotes) and
  read endpoints (positions, orders) work from any IP — so the Mac can
  run analysis/backtests; only the VM places orders.
- **Market protection, mandatory:** plain market orders via API are
  rejected; every market order carries the `market_protection` parameter
  (`-1` = broker default band). `order_manager.py` requirement.
- **Auth path: official Kite Connect API** (₹500/month, includes realtime
  + historical data — which also supplies gate #6's backtest data).
  The prior enctoken approach (scraped browser cookie) is retired for
  order placement: it sidesteps the entire traceability framework
  (API key ↔ static IP ↔ client mapping) and post-April-2026 carries
  material account risk, not gray-zone risk. Daily OAuth token flow
  replaces the enctoken morning ritual — same operational shape
  (gate #3), compliant substance.
- **Cost note:** this amends §10's "zero cost" principle to "near-zero"
  — ₹500/month is the license to run the experiment legally; against a
  ₹25k pool it is the correct trade, and it eliminates the largest
  account-level risk the project carried.

Compliance posture is a **gate-level property**: if any element above is
unmet, the system does not place live orders, full stop. Regulation in
this space has changed twice in two years — re-verify quarterly alongside
the expiry calendar (§4.4).

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
- **Capital must be stated explicitly** (paper and live) in session config,
  and any absolute position floor/cap must be checked against it: if the
  minimum position size forces risk > 1% of capital, the trade is rejected
  — a floor must never silently override the 1% rule.

### 4.2 Stops are decided before entry, honored always

Stop placement at entry, based on structure (below support / above
resistance / volatility-scaled via ATR), never moved *away* from price.
**"Structure" means objective, coded levels** — prior day's high/low, the
opening range high/low, VWAP, gap levels, round numbers — locations where
real order flow clusters because thousands of participants watch them.
Entries and stops anchor to these levels; a breakout *through* a level with
in-play volume is a materially better trade than the same indicator
crossover in the middle of nowhere. Named chart patterns (head-and-
shoulders, flags, wedges) and LLM visual chart reading are **explicitly
excluded**: subjective, weakly evidenced, and — fatally for this system —
not precisely definable, therefore not backtestable (§10 principle 5).
Widening a stop = converting a planned small loss into an unplanned big one
— the single most common way short-term traders die. Code makes it
impossible.

**Cost floor on stop distance:** costs are a fixed tax per R. If the stop is
0.5% away, a ~0.1% round trip plus slippage consumes ~20%+ of every R risked
— tight stops on NSE intraday die from being nickeled, not from being wrong.
Rule: **no trade where (round-trip cost + expected slippage) > 10% of R** —
in practice a minimum stop distance of ≈ 1% of price on liquid names. Setups
that only work with tighter stops were never profitable after costs.

**Time-stop (fourth exit):** exits are SL / target / **time-stop** / EOD. A
momentum entry that hasn't moved meaningfully in our favor within **N
minutes (start: 40)** is scratched — the participation we bet on isn't
there, and the position is holding a slot hostage while donating time-value
to chop. This converts a population of eventual −1R losers into ~−0.1R
scratches.

### 4.3 Trade the market you're in (regime)

- Trend day → momentum entries, trail stops, let winners run to close.
- Range/chop day → either stand aside or fade extremes; momentum signals in
  chop are the #1 false-positive source.
- The regime detector's job is mostly to say **"no trade"** — the best
  short-term traders are flat far more often than they're positioned.
  Standing aside is a position.

### 4.3b Trend-day tells (deterministic regime definition)

"Trend day" is not a vibe; it is recognized by mechanical tells, all
checkable by ~10:00–10:30 IST. **Momentum entries require ≥ 3 of:**

1. Nifty gapped and **held** the gap — no fill within the first 30–45 min.
2. Index persistently one side of VWAP; pullbacks hold at/above (below) it.
3. Breadth one-sided (advance/decline heavily skewed) **and** the stock's
   sector index agrees with the trade direction.
4. First-hour index range already a large fraction (≥ ~60%) of the 14-day
   average daily range — expansion, not contraction.

Fewer than 3 tells → range day handling per §4.3. These tells are fully
mechanical, so they backtest even where the LLM regime layer can't (§8),
and they serve as a deterministic cross-check on the LLM Brain's regime
call: **when the tells and the Brain disagree, the tells win for entry
permission.**

### 4.3c Shorts are not mirrored longs

Down-moves are faster, sharper, and more prone to violent squeeze-backs.
Intraday shorting (MIS SELL) therefore runs **stricter, asymmetric
parameters** — not the long rules with the sign flipped:

- TRENDING (down) regime only, with the §4.3b tells confirming direction.
- Higher confidence bar than longs (start: ≥ 70%).
- Wider stop multiple **and** a faster time-stop than longs.
- Auto-cover by 3:15 PM IST, no exceptions.
- Never short symbols held as CNC (safety lock in `order_manager.py`).

### 4.4 Respect the intraday clock (NSE)

| Window (IST) | Character | Policy |
|---|---|---|
| 9:15–9:30 | Opening rotation — wide spreads, stop-hunts, gap resolution | No fresh entries; observe, let opening range form, lock in-play list |
| 9:30–11:00 | Cleanest trends of the day; documented edge concentrates just after the range forms | Primary entry window. **Opening-range breakout is a first-class entry type:** break of the 15-min OR high/low on an in-play name, tells permitting — don't wait for lagging indicator alignment to confirm a move half-done |
| 11:00–13:30 | Lunch chop — thin volume, mean-reverting noise | Raise entry bar or stand aside |
| 13:30–14:45 | Afternoon move — often resumes or reverses morning trend | Secondary entry window |
| 14:45–15:15 | Square-off pressure, MIS auto-close approaching | No new entries; manage exits only |
| 15:15+ | — | Flat, always. No overnight risk in an intraday system |

**Event-day policy:** reduce size or stand aside — the edge is calibrated to
normal days. Event days include:

- **Tuesdays** — NSE weekly expiry (Nifty weeklies; all NSE derivatives
  expire Tuesdays since Sept 2025). Options-hedging flows distort
  index-heavyweight moves: exclude index heavyweights or raise the entry
  bar. **Last Tuesday of the month** (NSE monthly expiry) doubly so.
- **Thursdays** — BSE/Sensex expiry; milder effect on NSE cash but noted.
- RBI policy days, budget day, Fed nights, and scheduled results days for
  in-play candidates (a stock in play *because* of results it announces
  mid-session is a different risk class — stand aside through the event).

Expiry structure is regulator-set and has changed twice in two years —
re-verify the calendar each quarter rather than trusting this table.

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

### 4.7 Trade less. Then less than that.

An automated scanner will find "valid" setups all day if allowed. The
majority of annual P&L in intraday momentum comes from a minority of days —
real trend days; the core skill is doing nothing on the rest. Enforced:

- **Max 2–3 trades per day** (start: 3).
- **One open position at a time** until the first trade closes — the
  morning's second-best signal is usually the same market move wearing a
  different stock (correlation, not diversification).
- **Profit lock-in:** after a **+2R day**, stop entering (or raise the entry
  bar drastically). Afternoon giveback of morning profits is one of the most
  reliable patterns in intraday trading, human or machine.

### 4c. Daily campaign boundaries (the pool contract)

The operator hands the system a **pool** (e.g. ₹25,000) with two absolute
daily boundaries. Each trading day is a self-contained campaign on that
pool; either boundary ends the day, full stop:

| Boundary | Level (example on ₹25k) | Behavior |
|---|---|---|
| **Daily floor** | −5% (−₹1,250) | Hard halt. Independent, outer circuit breaker. |
| **Daily ceiling** | +7% (+₹1,750) | Halt and bank. Session over; tomorrow is a new decision. |

**Layered stops — the floor is a seatbelt, not the working stop.** The
operational daily stop remains §4b's **3R (~−3%)**; it fires first on any
normal bad day. The −5% floor is enforced *independently* in code and exists
to catch what planned stops can't: gap-through-stop slippage, a guardrail
bug, execution failure. If the floor ever fires, that is by definition a
§6b-class incident (the 3R stop failed to hold) — halt, investigate,
back to paper until understood.

**The ceiling is a stop, never a target.** The system must never modify
behavior to *reach* +7% — no catch-up sizing, no forced trades on chop days,
no loosened filters when behind (§4.5 governs). In practice §4.7's +2R
lock-in is the working profit protection and fires far earlier; the +7%
ceiling (~7R at 1% risk) is near the theoretical maximum of a 3-trade day
where everything hits full target, and will rarely trigger. That is
intentional.

**Expectation, stated so no one is disappointed by reality:** a good
intraday system averages roughly +0.3–0.7R per day *across all days* —
most days end flat or small, a minority of trend days carry the month.
+7% days are outliers to be banked, not planned for. The verdict on any
day is rule-adherence (§4.5), not which boundary it finished nearer to.

**Parameterization:** pool size, floor %, and ceiling % are session config
(operator-set), with code-enforced sanity checks: floor must be ≥ the 3R
operational stop (outer bound can't be tighter than the working stop),
and per-trade risk must satisfy the §4.1 floor-vs-1% check against the
stated pool.

### 4.8 Stock character profiles (history parameterizes trades — never predicts direction)

Historical data cannot tell us *where* a stock goes tomorrow (directional
seasonality on single names is noise-fitting — §2's warning applies in
full). What it can tell us, robustly, is the stock's **behavioral
fingerprint**, used to parameterize *how* a trade is built once the live
pipeline generates a signal:

| Profile stat | Feeds into |
|---|---|
| Gap follow-through rate (gaps > 1.5%: extend vs fill by 11:00) | In-play ranking tiebreak; entry permission on gap days |
| Trendiness (first-hour direction vs day close agreement; intraday autocorrelation) | Confidence bar per stock — historically choppy names need more; may be banned from momentum entries |
| Range/volatility profile (typical range % of price, time-of-day distribution) | ATR multiplier, time-stop length, target realism (reject trades whose 1.5R target exceeds the stock's typical range) |
| Spread/slippage character | Per-stock haircut in the §4.2 cost-floor check |
| Stop-hunt tendency (prior-day-level pierce-and-reverse frequency) | Stop buffer placement |

Rules: minimum sample per stat (≥ 30 instances, else fall back to universe
averages — a follow-through rate off 12 gaps is a coin flip); rolling
windows only (character drifts after re-ratings, index inclusion, float
changes); computed on the Mac, cached in Supabase, refreshed weekly — zero
VM load. **Direction still comes only from the live pipeline.** Profiles
answer: *given* a signal on this stock, how should the trade be built —
and should it be taken at all? Adding this layer goes through the §7 loop
like everything else: stated prediction, backtest, one change at a time.

### 4.8b Level pack + profile v1 (targeted implementation)

The concrete, scoped version of §4.2's levels and §4.8's profiles — what
gets computed, when, and what each number is allowed to influence.

**Nightly level pack** (cron on the Mac after close → Supabase, per stock
in the liquid universe; ~10 values):

- Prior day high / low / close (PDH/PDL/PDC)
- Unfilled gap levels from recent sessions
- Nearest round numbers (₹100/₹500/₹1000 steps relative to price)
- 14-day ATR + 20-day time-of-day volume curve (the §2.1 RVOL denominator)
- Weekly high/low **only if within ~2 ATR of price** — distant levels are
  noise

Plus one live capture at 9:30: opening range high/low. The set is
deliberately small: a level matters only if thousands of others watch it,
and that is true of ~8 things, not 80.

**What each is allowed to do (and nothing else):**

1. **Entry permission:** a breakout through OR-high *and* PDH is the A+
   setup; the same signal *into* overhead structure is degraded. Rule: no
   long entry with a major level closer than **0.5R above entry** (mirror
   for shorts).
2. **Stop placement:** stops go beyond the nearest level (below PDL /
   OR-low), buffer sized by the stock's stop-hunt stat when available —
   not at arbitrary ATR distances.
3. **Target realism:** the first opposing level is the honest target; if
   it sits < 1.5R away, the trade fails §4.1's asymmetry test *before*
   entry. Kills the most common momentum loser: right direction, no room.
4. **Confluence scoring:** count of aligned levels at entry feeds signal
   confidence. Objective, cheap, backtestable.

**Profile v1 priority** (from §4.8's five, by expected impact):
(1) **trendiness** — gates which stocks are allowed momentum entries at
all; (2) **gap follow-through** — upgrades in-play ranking on gap days;
(3) range profile — sharpens target realism. Spread character and
stop-hunt buffers are v2 — they refine trades rather than select them.

**Scope rule:** if it can't be computed from OHLCV in one SQL/pandas
expression, it's out of v1. Explicitly excluded: named pattern detectors,
Fibonacci, candlestick libraries, multi-month zones, anything requiring a
human to "see" the chart (§4.2).

**Validation:** each layer enters gate #6 as an **ablation** — backtest
with/without the level filter, with/without the trendiness gate; keep only
what moves PF. Stated prediction (§7 discipline): target-realism check >
trendiness gate > confluence scoring, with the largest single effect from
rejecting trades with no room to their first opposing level.

## 4b. Risk limits (enforced in code, not aspirational)

- **Max daily loss = 3R (~3% of capital)** — hard stop; session ends, no
  re-entry same day. Three planned losses is a normal bad day; more usually
  means conditions changed and the system shouldn't be trading them.
- **Max daily trades and one-open-position rule** per §4.7.
- **Max position size** — sized from stop distance so risk per trade ≈ 1% of
  capital (§4.1), with an absolute cap as % of capital per position, and the
  floor-vs-1% check from §4.1.
- **Cost floor** — no trade where costs + slippage > 10% of R (§4.2).
- **Max concurrent positions** + sector-concentration cap (three positions
  in one sector ≈ one position at 3× size). Note §4.7's one-at-a-time rule
  currently supersedes this; the cap remains for when concurrency returns.
- **Universe selection is explicit and market-driven** — the in-play rule
  (§2.1). No score-derived universes.
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
| 3 | Compliant auth live (§3c): Kite Connect API key + VM static IP registered + daily OAuth token flow automated or hard pre-open alert | Token dies daily; one forgotten morning = dataset hole. **Supersedes the enctoken/TOTP question** — the compliant path removes the account-risk dimension; only the daily-renewal operational risk remains |
| 4 | External heartbeat watchdog with alerting | Watchdog on the VM dies with the VM; must be external |
| 5 | Market-hours auto start/stop + holiday calendar | No manual session starts for a month |
| 6 | Backtest executed across regimes (≥ 2020 crash, 2021 bull, 2022 chop) on the **deterministic pipeline** (in-play filter → §4.3b tells → signals → trade plan), with the LLM layer's backtestability resolved per §8. Must compare **(a) entry archetypes**: opening-range breakout vs indicator-confluence pullback, and **(b) exit styles**: fixed 1.5R structure target vs ATR trailing stop held to close on trend days — the documented ORB edge ran ~17% win rate with rare large winners carrying everything; fixed targets may cap exactly those winners | Establishes the edge baseline; defines the §2.2 kill decision; settles the target-vs-trail question with data, not preference |
| 7 | Realistic cost model in paper fills | ✅ done — without it paper P&L is fantasy |
| 8 | Railway decommissioned | Exactly one brain writing `active_session_id` |
| 9 | Decision-logging completeness verified (SKIP/HOLD with full indicator snapshots) | A decision not logged is a training example lost |
| 10 | Chaos drills passed (§3b.7): crash mid-position, token expiry mid-session, network drop mid-order, VM reboot — each ends reconciled, alerted, safe | The failure modes WILL occur during the month; they must be boring by then |
| 11 | Reconciliation loop live (§3b.3) + order state machine with idempotent placement (§3b.1) verified in the mock suite | Duplicate orders and phantom positions corrupt the experiment worse than any strategy bug |

---

## 6. Go / no-go criteria for real money

Defined **before** the run so end-of-month isn't a rationalization exercise.
**Edge is judged on the backtest; operations are judged on the paper month.**
~20 trading days yields ~30–60 trades — profit factor and win rate at that
sample size are noise with wide confidence intervals, so the paper month is
*never* asked to prove edge. What it can prove at small n is **behavioral
fidelity**: that the live system made the same decisions the backtest logic
would have made on the same days.

### 6.1 Edge criteria (evaluated on the backtest)

| Metric | Go | Kill / iterate |
|---|---|---|
| Profit factor (net of costs), aggregate | > 1.3 | < 1.1 → hypothesis rejected (§2.2) |
| Profit factor per regime period | every period ≥ 1.0 | any period deeply negative → edge is regime-luck |
| Max drawdown (backtest equity curve) | < 10% | > 15% |

### 6.2 Operational criteria (evaluated on the paper month)

| Metric | Go | Kill / iterate |
|---|---|---|
| Market-hours uptime | > 95%, zero silent failures | any silent data hole |
| **Decision fidelity**: live decisions (incl. SKIPs) match what the backtest logic decides when replayed on the same days' data | ≥ ~95% match; every mismatch explained | unexplained mismatches = sim or logic bug |
| Guardrails | every trigger fired correctly | any miss |
| Paper drawdown | < 10% of paper capital | > 15% |
| Fill quality | slippage within cost-model assumptions | consistent adverse divergence |

**In-between results = iterate and re-run. Not "close enough, go live."**

### Metric definitions (fixed, so numbers mean the same thing forever)

- **Profit factor** = gross profit of winning trades ÷ gross loss of losing
  trades, both **net of all transaction costs**. PF 1.0 = breakeven.
- **Max drawdown** = largest peak-to-trough decline of the equity curve
  during the run, as % of starting capital for that run.
- **Win rate** = winning trades ÷ closed trades. Meaningless alone — always
  read with avg-win/avg-loss ratio (45% win rate is great at 2:1 payoff,
  terrible at 1:2).
- **Decision fidelity** = closed-loop replay match rate: for each live
  decision cycle, feed the same market snapshot to the backtest logic and
  compare decisions (ENTER/SKIP/HOLD/EXIT + direction + size bucket).
- **Silent failure** = any market-hours window where the brain wasn't
  running AND nothing alerted us. Detected failures that alerted are uptime
  incidents; undetected ones are disqualifying.
- **Uptime** = market-hours minutes with fresh heartbeat ÷ total
  market-hours minutes in the run.

### 6c. Live ramp (real money is entered gradually, never at full size)

Passing §6.1 + §6.2 buys entry at **reduced size**, not full size. Live
fills are the one thing paper cannot prove; the ramp is the cheap period to
catch fill-quality problems while they cost quarter-stakes:

| Phase | Risk per trade | Advance condition |
|---|---|---|
| Weeks 1–4 live | 0.25% of capital | Fill quality (slippage vs paper model) within assumptions; no guardrail misses; §6b triggers quiet |
| Weeks 5–8 | 0.5% | Same, plus live decision fidelity holding |
| Week 9+ | 1.0% (full §4.1 size) | Same |

Any §6b trigger during the ramp resets it one phase back after the cause is
understood.

---

## 6b. Live kill criteria (while trading real money)

The go/no-go tables govern *entering* real money; these govern *staying in*.
Enforced automatically where possible, reviewed weekly regardless:

| Trigger | Action |
|---|---|
| Daily loss limit hit | Session ends, no re-entry same day (already enforced) |
| Drawdown from equity peak > 10% | **Auto-halt.** Back to paper until cause understood |
| Rolling profit factor (last 30 closed trades) < 1.0 | Pause; run the divergence checklist below |
| Any guardrail misfire or silent failure | Immediate halt — infrastructure trust is broken, that's worse than a losing streak |
| Live win rate diverges > 15% from paper baseline | Investigate fill quality / market change before continuing |

**Expect the rolling-PF pause to fire on pure variance** — a true-PF-1.4
system dips below 1.0 on 30-trade windows routinely. To keep each pause a
checklist, not a re-litigation of the strategy, the investigation is fixed:
(1) fill quality vs paper model, (2) live-vs-backtest decision fidelity on
the losing window, (3) regime distribution of losses vs backtest
expectation, (4) any single rule responsible for the cluster. If all four
are clean, it's variance — resume; log the pause.

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

## 7b. Pivot path — decided now, so killing the hypothesis stays cheap

Honest prior: intraday momentum on liquid NSE names is the most competed,
highest-cost venue a retail-sized account can hunt edge in — competing with
prop desks and HFTs while paying ~0.1% round trip. The regulator's own
data: SEBI found ~7 in 10 individual intraday traders in the equity cash
segment lose money, and loss-makers bear proportionally higher trading
costs than profit-makers — the cost-floor rule (§4.2) is aimed at the
statistically correct enemy. A profitable minority exists; the entire
point of this document's gating is to verify membership before paying
tuition. **"No edge found" is a
likely and acceptable outcome of gate #6, and it is a success of the
process, not a failure of the project.** Everything built — the R-framework,
guardrails, logging flywheel, PaperBroker, regime detector, VM infra — is
strategy-agnostic.

If §2.2 rejects the hypothesis, the pre-committed pivot is **up the
timeframe: multi-day swing/positional momentum** on the same infrastructure:

- Costs shrink from ~20% of R to low single digits (wider stops, fewer
  trades) — the cost tax mostly disappears.
- Competition thins; overnight gap edge accrues *to* the holder instead of
  against the day-trader.
- The regime detector and in-play concepts matter *more*, not less.
- Changes required: CNC/positional product handling, overnight risk rules,
  gap-risk sizing — a new §4 section, same §5/§6 gating discipline.

The pivot re-enters the same pipeline: hypothesis → backtest → paper →
ramped live. No stage is skipped because "the infra already passed."

---

## 8. Open decisions & decision log

Decisions made (and why), so we don't re-litigate them:

| Decision | Choice | Why |
|---|---|---|
| Hosting for brain | Oracle Cloud Always Free | Railway credits ran out; AWS free tier is 12-mo-limited; GH Actions has 6h job cap |
| VM shape | E2.1.Micro (x86, ~500MB) | A1.Flex (ARM, 4×24GB) out of capacity in ap-hyderabad-1; E2 also always-free |
| VM OS | Oracle Linux 9 (not Ubuntu) | Console wizard reset image silently; kept rather than risk losing free-tier slot. `dnf` not `apt`, user `opc` |
| Paper fill costs | Folded into fill price | Flows into P&L with zero schema changes |
| Universe rule | In-play filter: RVOL ≥ 2 (time-adjusted) or gap ≥ 1.5% w/ catalyst; cap 10 names/day | Market-driven, closes score-feedback loop; participation is the missing edge ingredient (§2.1) |
| Edge vs operations split | Backtest proves edge; paper month proves behavior (decision fidelity) | 30–60 trades can't prove edge; win-rate comparison at that n is noise (§6) |
| Live entry sizing | Ramp 0.25% → 0.5% → 1.0% per §6c | Fill quality is unprovable on paper; ramp caps the cost of finding out |
| Daily pool boundaries | Operator sets pool + daily floor/ceiling (e.g. ₹25k, −5%/+7%); floor is an outer circuit breaker behind the 3R stop; ceiling is a halt-and-bank, never a target (§4c) | Loss promises are keepable in code; profit promises aren't — a ceiling protects gains without corrupting behavior |
| In-play identification timing | Opening-range RVOL ranking, locked by ~9:30 (§2.1) | Strongest public evidence (Zarattini et al. 2024) uses opening-range RVOL; early identification catches the move, not the tail |
| Chart analysis scope | Objective levels in (prior day H/L, OR H/L, VWAP, gaps); named patterns and LLM visual chart reading out (§4.2) | Levels are codifiable and backtestable; patterns are subjective and unfalsifiable |
| Historical per-stock data | Character profiles parameterize trades (§4.8); per-stock directional forecasting banned | Behavior is stable and measurable; single-name direction from history is noise-fitting |
| Auth path | Official Kite Connect API (₹500/mo) + VM static IP; enctoken retired for order placement | SEBI retail algo framework in force since Apr 2026: static IP mandatory for API orders, enctoken sidesteps traceability = account risk. Kite Connect includes historical data, resolving gate #6's data source (§3c) |
| Order type compliance | All market orders carry `market_protection` (start: -1) | Unprotected market orders via API are rejected under the framework; also a free slippage bound (§3c) |
| Regulatory lane | Stay under 10 orders/sec = regular API user; no strategy registration or Algo-ID needed | 2–3 trades/day is orders of magnitude below the threshold; never design toward it (§3c) |

Open (decide before the relevant gate):

- **LLM Brain backtestability (blocks gate #6 design).** The Market Brain's
  macro/sector reads cannot be replayed for 2020–2022 — the news context is
  gone and LLM output isn't reproducible. Options: (a) backtest only the
  deterministic pipeline and accept that the paper month's decision-fidelity
  check covers the LLM layer separately; (b) replace the LLM regime call
  with the §4.3b mechanical tells for backtesting and treat any live
  LLM-vs-tells divergence as logged, measurable behavior. Leaning (b) — the
  tells already override the Brain for entry permission, so the backtest
  would test the binding constraint.
- **Docker vs bare python+systemd on the VM** — Docker daemon costs ~60MB of
  a ~500MB box; systemd is leaner but loses image reproducibility. Currently
  proceeding with Docker; revisit if memory pressure shows.
- **Oracle account → PAYG conversion** (see §3 infra risk) — removes the
  Always Free reclamation failure mode at ₹0 cost within limits. Now
  doubly important: the VM's static IP is registered with Kite Connect
  (§3c), so losing the VM also breaks order-placement compliance until
  re-registered.
- **Where the external watchdog lives** (gate #4) — Vercel cron, GitHub
  Actions schedule, or UptimeRobot-style service reading `brain_heartbeat`.
- **Backtest harness design** (gate #6) — reuse the deterministic pipeline
  directly on Kite historical candles; runs on the Mac, never the VM. Must
  implement the decision-fidelity replay interface used in §6.2.
- **Time-stop N and +2R lock-in behavior** (§4.2, §4.7) — starting values
  40 min and hard-stop-after-+2R; tune only via the §7 loop, one change at
  a time.
- **Exit style: fixed 1.5R target vs trail-to-close** (gate #6b) — the
  ORB evidence ran low win rates with rare large winners carrying all
  profitability; our §4.1 asymmetry rule may cap those winners. Settled by
  the gate #6 head-to-head, not by preference. If trail-to-close wins, §4.1
  needs rewording (asymmetry *potential* required at entry, not a fixed
  target).
- **Entry archetype weighting** (gate #6a) — opening-range breakout vs the
  current indicator-confluence entry (RSI + EMA cross is closer to a
  pullback pattern than a breakout). Both backtest; the data decides which
  earns entries, or how they split by regime.
- **Stock character profile v1 stats** — resolved in §4.8b (trendiness →
  gap follow-through → range profile; spread + stop-hunt deferred to v2).
  Remaining open: minimum history per stock and refresh cadence
  (start: 1 year lookback, weekly refresh).
- **Order-tag scheme and orphan-resolution timeout** (§3b.1) — how long an
  `ORPHANED` order waits for reconciliation before manual escalation.
- **Poll cadence vs stop-slippage bound** (§3b.8) — current interval vs
  what the cost model assumes; measure in paper month, align whichever way
  the data points.

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
6. **Cheap and durable** — free-tier infra everywhere; the one paid item
   is the Kite Connect license (₹500/mo, §3c) — the cost of running the
   experiment legally, and it bundles the backtest data source.
7. **The hypothesis bends to the data** — never the other way around.
8. **Flat is a position; fewer trades is an edge** — the scanner proposes,
   the filters dispose. Most days the correct output is nothing.