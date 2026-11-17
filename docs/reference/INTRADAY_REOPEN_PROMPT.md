# Intraday reopen — brief for outside review

_Paste-block for other models. Written 2026-11-18. Everything below the line is the prompt._

---

You are reviewing a retail algorithmic-trading project for Indian equities (NSE). Earlier
versions failed, and the measured results are below. I want a strategy approach that can
plausibly become profitable **after all charges and tax**, and an honest view of whether my
target is reachable at all. Please be quantitative and skeptical. Don't give me a generic list
of indicators.

## 1. The goal

- **Capital:** ₹50,000 to start.
- **Target:** ₹500/day realised profit, net of brokerage, statutory charges, slippage and tax.
  That is ~1% of capital per trading day.
- **Interim bar that would build confidence:** a consistent average of ₹100+/day net, with
  profit factor ≥ 1.3 over a large sample.
- **Style:** intraday preferred (MIS, flat by close). Open to multi-day holds (CNC, 2–10 days)
  if the math says intraday can't work.
- **Testing:** live paper trading only (simulated fills on live prices). No paid historical
  data for now. I want to run **many strategies in parallel** on the same live feed so that we
  get thousands of paper trades a month, plus a daily scoreboard per strategy.

## 2. What exists (the system)

- **Brain:** Python on Railway. Decision cycle every 5 minutes, exit checks every ~30 s.
- **Dashboard:** Next.js on Vercel. **Store:** Supabase Postgres.
- **Broker:** Zerodha retail. Market data comes through the browser session token
  (`enc_token`): last traded price and historical candles (5-minute is the finest we use).
  There is no tick data, no market depth/order book, and no options chain.
- **Universe:** Nifty 500. 40 names rotated per day, plus an "in-play" list ranked by
  opening-range relative volume at 09:30.
- **Two entry archetypes:**
  1. **Indicator confluence on 15-min bars:** RSI, EMA21/EMA200, MACD histogram, Bollinger
     proximity, volume spike vs 20-SMA, VWAP side, 1H alignment, ADX ±DI. These are summed
     into a confidence score and gated by a regime detector (TRENDING / WEAK_TREND / CHOPPY,
     Nifty direction).
  2. **Opening-range breakout (ORB):** the 09:15–09:30 range, confirmed by relative volume
     and gap. Stop at the far side of the range; target is one measured move.
- **Risk settings:** 1% risk per trade (configured). The 40% max-position cap binds first,
  so realised risk was only ~0.14% of capital. Daily stop −3R; max 40 trades/day, 3 per
  symbol. Optional time stops and level-anchored stops exist.
- **Paper cost model (Zerodha MIS, per order):**
  - brokerage min(₹20, 0.03%)
  - STT 0.025% on the sell side
  - exchange 0.00297%
  - SEBI 0.0001%
  - GST 18% on (brokerage + exchange + SEBI)
  - stamp 0.003% on the buy side
  - **slippage:** 5 bps adverse per leg, with a capped stop/target fill band

## 3. Measured results (paper, 2026-05-19 → 2026-08-28, 31 sessions, one market regime)

| metric | value |
|---|---|
| closed trades | 1,018 |
| profit factor | **0.37** |
| win rate | 23.5% |
| expectancy | **−0.42R** per trade |
| net | −₹59,195 on ₹1,00,000 nominal |
| Nifty 50 buy-and-hold, same window | +3.0% |

**Decomposition of the −0.42R:**
- **Transaction cost:** −0.398R, about 94% of the loss.
- **Residual signal:** −0.027R, statistically zero.

**Governing identity (checked on 875 trades):**

> cost in R ≈ round-trip friction (bps of position) ÷ stop width (bps of price)
> ≈ 20.6 bps ÷ 52.3 bps ≈ **0.42R**

This is scale-invariant: capital, position size and risk-per-trade cancel out. With ~0.5%
stops, every trade starts ~0.4R in the hole. To push cost below ~0.1R the stop would need to
be ~2%+, and the post-mortem estimated ~3.7% to make the observed signal viable. Moves that
size are more typical of multi-day holds than of intraday trades.

**Worked example for ₹50k, one round trip of a ₹25,000 MIS position:**
- statutory + brokerage ≈ ₹26 (~10.6 bps)
- slippage ≈ ₹25 (~10 bps)
- **total ≈ ₹51 per round trip (~20 bps)**

At 5× intraday leverage (₹2.5 lakh exposure), ₹500/day means netting ~20 bps on gross
exposure every day, after paying ~20 bps friction on each round trip.

**Tax note:** intraday equity gains in India are speculative business income, taxed at the
slab rate. Multi-day (delivery) gains held under 12 months are STCG at 20%.

## 4. Avenues already tested and closed (don't re-propose without a new mechanism)

| # | hypothesis | n | result |
|---|---|---|---|
| 1 | Entry edge exists in these signals | 2,428 decisions | +0.010R, t=+0.4 |
| 2 | Some exit rule rescues it | 180 exit policies × 541 trades | 0/180 positive even at zero cost; best −0.077R |
| 3 | Opening window (09:30–10:30) holds the edge | 182 | −0.365R, t=−4.46 |
| 4 | Standard cross-sectional factors (momentum, low-vol, illiquidity…) | 5.2 yrs daily, 4 cuts | nothing survives Holm out of sample |
| 5 | Reweighting the advisor's 7 factors | 43,952 obs | Holm p=1.000 on all 8 variants |

Cautionary example: one filter (shorts before 13:00 in strongly trending stocks) read
+0.097R, t=+3.0, and won 9 of 9 days. Day 10 erased it, and the out-of-sample average
became −0.003R. In total, 253 hypotheses have been tested, so our multiplicity-adjusted bar
is **z ≥ 3.72**, not 1.96.

## 5. Known problems and constraints

1. **Friction vs stop width** (above). This is the core problem.
2. **Compliance:** SEBI's retail-algo framework (Feb 2025 circular, effective 1 Apr 2026)
   requires an exchange Algo-ID, a vendor/client-specific API key and a whitelisted static
   IP for automated orders. A scraped session token is outside it. Live auto-execution would
   need Kite Connect (paid API) plus a registered algo. Paper trading is unaffected.
3. **Data limits:** 5-minute bars at best, a 30-second exit poll, and no depth. Any edge
   finer than that can't be seen or harvested.
4. **Slippage was never measured:** 5 bps/leg is assumed, and it is ~48% of friction.
5. **One regime:** all 31 sessions were in one summer.
6. **Simulator gaps:** no margin check, so peak gross exposure reached 7.85× capital. About
   a third of concurrent positions couldn't have been taken with real money.
7. **Token dependency:** the session token is pasted manually each day. A missed day means
   no data. TOTP auto-login is being built.
8. **Multiple testing:** running many parallel paper strategies makes lucky winners
   guaranteed. Selection must be pre-registered.

## 6. What I need from you

1. **Feasibility:** is ₹500/day net on ₹50k (~250% a year) achievable by any retail
   systematic approach in NSE equities? If not, what is a realistic net return, and what
   capital would ₹500/day need?
2. **Break-even math:** for a given stop width and our ~20 bps friction, give the win rate
   and average win/loss (in R) needed for PF ≥ 1.3. Show the formula and 3–4 worked points.
3. **Strategy candidates (3–5):** for each one give:
   - the **economic reason** the edge should exist (who is on the other side, and why)
   - holding period
   - typical stop width vs friction, so its cost in R
   - expected trade count per day
   - whether it is testable with only 5-min bars + LTP via live paper
   - the cost in R it must beat

   Consider at least: multi-day swing (2–10 days), overnight/gap effects, event-driven moves
   (results, index rebalances), mean-reversion vs momentum at different horizons, and fewer,
   larger moves vs many small trades.
4. **Parallel paper-testing design:**
   - how to run N strategies on one live feed without fooling ourselves (pre-registration,
     a multiplicity correction, the minimum trades per strategy to detect a +0.1R edge at
     t ≥ 2, and holdout days)
   - the daily scoreboard metrics
   - the kill/promote rules
5. **What would change the verdict:** which single change (stop width, holding period,
   instrument such as F&O / ETFs, cost reduction, data source) moves PF the most, with
   numbers.
6. **Risks I'm not seeing.**

Please answer with numbers, formulas and explicit assumptions. Say plainly if the target
is unrealistic.
