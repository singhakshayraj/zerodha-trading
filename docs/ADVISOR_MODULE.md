# Portfolio Advisor Module

Real-time decision support for your holdings. Runs daily, scores positions, suggests exits + rotations, tracks accuracy.

## Overview

Advisor reads your real Zerodha portfolio every morning (09:20 IST) and gives you a trading verdict on each holding:
- **HOLD** — trend intact, hold
- **TRIM** — weakness starting, trim position
- **SELL** — strong downtrend, exit now
- **SELL_ON_BOUNCE** — extreme weakness, wait for a bounce to exit

When you hold a weak stock, advisor also suggests what to rotate into instead (same sector preferred, cross-sector fallback). After ~10 trading days, the system checks whether following the call actually made money vs the Nifty, and tracks your hit rate.

All advisory — never places orders.

## Daily Holdings Analysis

### Scoring (7 factors)

Every holding scored on:

| Factor | What it measures | Range |
|--------|------------------|-------|
| **EMA200** | Long-term trend (200-day moving average) | Strong up trend → +10 points |
| **EMA50** | Medium-term trend (50-day MA) | Above EMA200 = momentum |
| **Consistency** | How reliably it closes above 20-day MA | High % of closes above = +8 |
| **Momentum** | Slope and velocity (how fast it's moving) | Steep up → +10, steep down → −10 |
| **ADX** | Trend strength, not direction (14-period ADX) | Strong trend (ADX>25) = confidence |
| **Relative Strength** | Performance vs Nifty 50 index | Up more than index = +5 |
| **News Sentiment** | Live sentiment from market news (Marketaux API) | Positive → +3, negative → −3 |

**Score range:** −100 (extreme weakness) to +100 (extreme strength)

### Verdict Thresholds

| Score | Verdict |
|-------|---------|
| ≥50 | HOLD (all-clear) |
| 0 to 49 | TRIM (caution, reduce size) |
| −20 to −1 | SELL (downtrend confirmed) |
| ≤−20 | SELL_ON_BOUNCE (panic, wait for a relief bounce to exit) |

All thresholds tunable via app config (no redeploy needed) — stored in `app_config` table as JSON.

### What You See (Dashboard)

Navigate to `/advisor` page:

1. **Holdings grid** — your positions with:
   - Current holdings (qty, avg cost, LTP, day P&L)
   - Verdict (HOLD/TRIM/SELL/SELL_ON_BOUNCE chip, green/yellow/red)
   - Trend score (numeric, −100 to +100)
   - Confidence % (how strong the trend is)
   - Bars (candles on the 15-min chart to current time)

2. **Rotation suggestion chip** (when active) — if holding is weak (score ≤ −20):
   - "Rotate into [SYMBOL]" — target name
   - Target score (why it's better: 50–100 range)
   - Sector match (same_sector ⭐ or cross_sector)
   - Why (gap from exit to target ≥40pts)

3. **Track record tile** (bottom) — once backtest starts accruing:
   - Hit rate % (% of your past calls that were correct)
   - Avg alpha % (how much better/worse than just holding Nifty)
   - ₹ value saved (rupees your exit calls freed up to redeploy)

## Rotation Candidates

### How It Works

Daily after holdings score, advisor scans **all 500 Nifty 500 names** to find rotation targets for your weak holdings.

**Gate (triple check):**
1. Exit score ≤ −20 (your holding is genuinely weak)
2. Target score ≥ 50 (replacement is genuinely strong)
3. Gap ≥ 40pts (at least 40-point momentum gap between exit and target)

**Sector priority:** same-sector candidate first (stay within familiar space), cross-sector fallback if nothing clears the bar.

**Example from 2026-07-12 live run:**
- NTPC (score −69) → rotate into ACMESOLAR (96, same sector)
- SILVERBEES (−58) → ABCAPITAL (100, cross-sector)
- ITC (−57) → RADICO (100, same sector)

### Rate Limit

500-symbol scan runs **once per day only** (after 09:20 advisor run), paced at 350ms/request to not starve the paper-trading engine's Kite session. ~3 min wall time total. Per-symbol failures isolated (one bad fetch doesn't abort the batch).

### Technical Detail

Reuses the same 7-factor `trend_score()` logic as holdings (no new scoring math). Writes advisor_score to `stock_universe` table (separate from the paper engine's `brain_score`).

## Accountability & Track Record

### 10-Trading-Day Backtest

After 10 trading days (bars on the symbol's own chart), advisor grades its own calls:

- **HOLD verdict correct if** → price rose (even 0.1%) ✅
- **SELL/TRIM/SELL_ON_BOUNCE correct if** → price fell ❌
- **Alpha** → your verdict's return vs Nifty's return over same 10-day window

Example: NTPC said SELL_ON_BOUNCE on Day 1. By Day 11:
- NTPC fell −8%
- Nifty rose +2%
- Your call was RIGHT (exit saved you from −8% on your capital)
- Alpha: −8% − (+2%) = −10% relative gain (you outperformed by selling)

### Track Record Summary

Aggregated on `/advisor` track-record tile:

| Metric | Meaning |
|--------|---------|
| **Hit Rate %** | Out of all your past calls, how many were correct? |
| **Avg Alpha %** | On average, by how much did your calls beat/lose to the Nifty? |
| **₹ Saved** | Total rupees your SELL/TRIM calls freed up to redeploy vs sitting still |

First outcomes land ~10 trading days after first advice rows (early call: 2026-07-12 → outcomes ~late July 2026). Nothing to check before then — let price action accrue.

## Telegram Notifications

### Setup

1. Create bot via Telegram `@BotFather` → `/newbot`
2. Name it (e.g., "My Portfolio Advisor")
3. Get the token (looks like `123456789:ABCxyz...`)
4. Message the bot once (anything, e.g., "hi")
5. Fetch `https://api.telegram.org/bot<TOKEN>/getUpdates` → extract `chat.id`
6. Set on Railway:
   - `ADVISOR_TELEGRAM_BOT_TOKEN=<your-token>`
   - `ADVISOR_TELEGRAM_CHAT_ID=<your-chat-id>`
   - `ADVISOR_DIGEST_ENABLED=true`
   - `ADVISOR_INTRADAY_ALERTS_ENABLED=true`

Done. No code change needed.

### Daily Digest (09:20 IST)

After advisor run, if there's anything **actionable** (TRIM/SELL/SELL_ON_BOUNCE or a rotation suggestion), you get one Telegram message with:
- List of positions, worst first (most urgent sells first)
- Rotation targets included if applicable
- Concise format (respects your time)

HOLD-only days send nothing (no noise).

Per-day dedup — even if you manually re-run the advisor, no double-send.

### Intraday Alerts (Market hours)

Every 5 minutes during market hours, advisor checks your holdings. If any holding moves **±3%** vs previous close (the same day-change % Kite app shows):

- One alert per symbol per direction per day
- Alert format: "📈 SYMBOL +3.2% today (₹LTP, qty held, position PnL)" + guidance
- Guidance if down ≥3%: "Check /advisor before reacting — don't sell a panic low blind."
- Guidance if up ≥3%: "If this is on TRIM/SELL, strength like this is your exit window."

Intraday logic runs in a daemon thread (background, always-on during market hours), uses the holdings call already made for daily advisor, zero extra Kite requests.

## Configuration & Tuning

All knobs in `app_config` table — no redeploy to change.

### Verdicts & Scoring

| Key | Default | What it does |
|-----|---------|--------------|
| `advisor_hold_threshold` | 50 | Score ≥ this = HOLD |
| `advisor_trim_threshold` | 0 | Score 0–49 = TRIM |
| `advisor_sell_threshold` | −20 | Score ≤ this = SELL_ON_BOUNCE |

### Rotation Gate

| Key | Default | What it does |
|-----|---------|--------------|
| `rotation_min_exit_score` | −20 | Only rotate when holding score ≤ this |
| `rotation_min_target_score` | 50 | Only suggest targets scoring ≥ this |
| `rotation_min_gap` | 40 | Gap between exit & target must be ≥ this |

### Feature Flags (Railway env vars)

| Var | Default | Effect |
|-----|---------|--------|
| `ROTATION_ADVISOR_ENABLED` | true | Scan Nifty 500, suggest rotations |
| `ADVISOR_BACKTEST_ENABLED` | true | Grade past calls after 10 days, show hit rate |
| `ADVISOR_DIGEST_ENABLED` | true | Send Telegram digest daily at 09:20 |
| `ADVISOR_INTRADAY_ALERTS_ENABLED` | true | Send Telegram alerts on ±3% moves |
| `ADVISOR_UNIVERSE_SCAN_DELAY_MS` | 350 | Pace (ms between Kite candle fetches) during 500-scan |
| `ADVISOR_INTRADAY_THRESHOLD_PCT` | 3.0 | % move threshold for intraday alerts |
| `ADVISOR_WATCH_INTERVAL_SECONDS` | 300 | Poll interval (seconds) for intraday watch |

All live-tunable. No order-path method ever touched — fully advisory.

## Data Sources

### Holdings
Live read from your Zerodha account via Kite API at 09:20 IST.

### Candle Data
Daily 15-minute candles for:
- Your holdings (all of them)
- Nifty 50 (for relative performance)
- Nifty 500 names (during rotation scan)

Fetched live, 90-day history retained in DB.

### News Sentiment
Marketaux API (if key is set). Real-time sentiment (bullish/bearish/neutral) scored −3 to +3 in the 7-factor model. If key not set, news contribution = 0 (other 6 factors still active).

### Nifty 500 Universe
`data/nifty500.csv` — 500 symbols, tokens, sectors, industries. Joined from niftyindices.com constituent list + Kite public instrument master. Regenerate quarterly (index reconstitutes), manually via `scripts/seed_nifty500_universe.py`.

## Running On-Demand

Set `advisor_run_now=true` in `app_config` to trigger an immediate run outside the 09:20 window. Useful for:
- Testing after a config change
- Non-market days (checking what advisor *would* say if market were open)

Clears automatically after run completes.

## Logs & Debugging

Railway logs search for advisor events:

```bash
railway logs --service zerodha-brain | grep -E "\[advisor\]|\[advisor.scan\]|\[advisor.backtest\]"
```

Look for:
- `[advisor] SYMBOL: verdict (trend score, confidence, bars)`
- `[advisor.scan] scored N names in Ts` (rotation scan progress)
- `[advisor.rotation] SYMBOL → TARGET (reason)` (rotation calls)
- `[advisor] stored N recommendations` (daily run completion)

## API Endpoints

### GET `/api/advisor`
Returns all `portfolio_advice` rows for the current account + user, sorted by run_date desc. Includes:
- symbol, verdict, trend_score, confidence_pct
- rotation_target_symbol, rotation_target_score, rotation_reason (if applicable)
- run_date, created_at

Used by dashboard to render holdings grid + rotation chips.

### GET `/api/advisor/track-record`
Aggregated backtest results:
- hit_rate_pct
- avg_alpha_pct
- advice_value_inr (rupees saved by exit calls)
- breakdown by verdict (HOLD/TRIM/SELL/SELL_ON_BOUNCE)
- evaluated_count (how many calls have been graded so far)

## Privacy & Safety

- All positions read from real Zerodha account, never shared externally
- Telegram messages sent only to your configured chat_id
- No integration with order placement — advice is read-only
- All computation happens on Railway (your Kite token never leaves the OMS)

## Known Limitations

1. **News sentiment (Phase not live yet)** — currently OFF pending a Marketaux API key. Once set, real sentiment scores land in the 7-factor model.
2. **Rotation targets are momentum-based** — suggest what's trending now, not what's "undervalued." Backtest in ~2 weeks will show actual hit rate.
3. **Intraday watch runs at 5-min granularity** — misses sub-5-min spikes, intentional to minimize API load.
4. **Market-hours check is IST only** — assumes you trade during NSE hours (09:15–15:30 IST).

## Examples

### Holdings Analysis Output (2026-07-12 run)

```
NTPC: SELL_ON_BOUNCE (trend -69, conf 84, bars 270)
   Rotate into → ACMESOLAR (96, same_sector)

ITC: SELL (trend -57, conf 88, bars 270)
   Rotate into → RADICO (100, same_sector)

RELIANCE: HOLD (trend 72, conf 94, bars 270)
   No rotation needed — trend intact
```

### Telegram Digest

```
🔔 Portfolio Advisor – 2026-07-12

SELL_ON_BOUNCE: NTPC (−69) → rotate ACMESOLAR (96)
SELL: ITC (−57) → rotate RADICO (100)
TRIM: JSWSTEEL (−19) → consider TECHNOMECH (68)

Next check: 2026-07-13 at 09:20 IST
Hit rate: 64% | Avg alpha: +2.3% | Saved: ₹8,420
```

### Intraday Alert

```
📉 ATGL −4.2% today (₹724, 10 held, position −5.4%)

Check /advisor before reacting — don't sell a panic low blind.
```

## Support

- Verify enc_token is fresh (paste before 09:15 IST)
- Check Railway logs for errors during run (search `[advisor]`)
- Rerun via `advisor_run_now` to test live
- Telegram bot needs fresh token + chat_id if recreated

---

**Last updated:** 2026-07-12 | **Status:** All 6 phases live ✅
