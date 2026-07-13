# Paper-Trading Validation Roadmap

> **STATUS 2026-07-14:** Phases 0–3 are SHIPPED and live (paper broker,
> autopilot, watchdog, quote_snapshots, decision logging, performance_daily,
> /api/analytics/export). The unticked boxes below are historical — kept for
> the original design record. The only live section is **Phase 4** (post-run
> analysis), which activates when the month-long run completes. Current
> operational state lives in docs/SESSION_HANDOFF.md + docs/KNOWN_ISSUES.md.



Goal: validate the auto-trade platform against **real market data with simulated
execution** (paper trading), run it unattended for **one month**, and store every
decision + outcome as a dataset for training/strategy improvement.

Repos involved:

| Repo | Role |
|---|---|
| `zerodha-trading` (this repo, Vercel) | Dashboard + API + Supabase writes |
| `zerodha-brain` (`~/Desktop/GITHUB/zerodha-brain`, Railway) | Python decision engine: signal_engine, risk_manager, order_manager, market_data (Kite quotes), scheduler |
| Supabase prod project | Sessions, trades, decisions, heartbeat, app_config |
| Supabase sim project | Staging playground for `/mock` (already done) |

Key insight: the brain already separates **market data** (read-only Kite quote/
historical calls — safe to use live) from **execution** (`OrderManager` placing
real orders). Paper mode swaps only the execution layer.

---

## Phase 0 — Fix money-path bugs (zerodha-trading) — IN PROGRESS

Bugs found in the earlier audit that corrupt results if left in during the run:

- [ ] `updateSessionPnl` double-counts delta → guardrails trigger at half the limit (`lib/store.ts`)
- [ ] `endSession` writes `"STOPPED"`, not a valid `SessionStatus` (`lib/db/index.ts`)
- [ ] `closeTrade` NaN P&L when `entry_price` null; `updateStockScore` throw after trade already closed (`lib/db/index.ts`)
- [ ] Session-restore reads wrong `session_config` keys (`app/trading/page.tsx`)
- [ ] `/api/trade/stop` never clears `active_session_id` → stopped session resurrects on refresh

Deferred (not blocking paper run): auth hardening, token encryption at rest,
IST hour bucket, Axiom log volume.

## Phase 1 — Paper-trading mode in the brain (zerodha-brain)

- [ ] `config.py`: `PAPER_TRADING = os.getenv('PAPER_TRADING', 'false') == 'true'`
- [ ] `paper_broker.py` (new): mimics `OrderManager`'s interface. `place_buy_order`
      / `place_sell_order` return simulated fills at the **live quote** price
      (+ configurable slippage, e.g. 0.05%) instead of calling Kite orders.
      Generates fake order ids `PAPER-<uuid>`.
- [ ] `brain.py` / `scheduler.py`: select `PaperBroker` vs `OrderManager` from config.
      Everything else (market_data, signal_engine, risk_manager, regime_detector,
      database writes) runs UNCHANGED — real decisions on real data.
- [ ] Mark paper sessions: `trading_sessions.stock_universe` suffix or an
      `is_paper` flag in `app_config` (`paper_mode=true`) so the dashboard can label them.
- [ ] Dashboard banner on `/trading` when `paper_mode=true`: "PAPER TRADING".

## Phase 2 — Data capture for training

Already captured per trade/decision (prod schema): `brain_decisions`
(indicators, confidence, action, reasoning), `trades` (entry/exit, pnl,
exit_reason), `market_context` (direction, nifty, vix), `stock_universe`
(rolling scores).

Additions:

- [ ] Ensure EVERY decision is logged, including SKIP/HOLD with full indicator
      snapshot (verify signal_engine logs negatives, not just entries).
- [ ] `quote_snapshots` table (optional, high value): per-cycle LTP for the
      scanned universe so training can reconstruct "what the brain saw".
      Estimate volume first (~10 symbols × ~75 cycles/day × 22 days ≈ 16.5k rows/mo — fine).
- [ ] Daily rollup: `performance_daily` view or table — date, trades, win rate,
      gross/net pnl, max drawdown, regime distribution.
- [ ] `/api/analytics/export` route: dump sessions+trades+decisions as JSON/CSV
      for a date range (token-gated).

## Phase 3 — One-month unattended run

- [ ] Scheduler hardening (brain): auto-start session at 09:30 IST weekdays,
      auto-square-off + end session at 15:20, skip NSE holidays (static 2026 list).
- [ ] Token freshness: enc_token expires daily ~6 AM. Options:
      (a) manual morning paste into /connect (2 min/day), or
      (b) TOTP-based auto-login script (kiteconnect-style) — decide in Phase 3.
      Brain must mark session `ABORTED(TOKEN_EXPIRED)` and alert instead of dying.
- [ ] Watchdog: if heartbeat stale > 5 min during market hours → alert
      (email/Telegram) + Railway restart.
- [ ] Config for the run: capital ₹10,000 (paper), max 10 trades/day,
      max loss 3%/day, universe NIFTY50.
- [ ] Weekly checkpoint: export data, eyeball drift/bugs, keep notes in
      `docs/run-log.md`.

## Phase 4 — Post-run analysis / training dataset

- [ ] Final export: full month of decisions + trades + contexts + snapshots.
- [ ] Label dataset: each decision → realized outcome (pnl of resulting trade,
      or counterfactual price move for SKIPs from quote_snapshots).
- [ ] Baseline metrics: win rate, profit factor, Sharpe (daily), max drawdown,
      per-regime and per-time-bucket breakdowns (analytics functions in
      `lib/db/index.ts` already sketch these).
- [ ] Feed into training experiments (out of scope here).

---

## Order of execution

1. Phase 0 (hours) — this repo
2. Phase 1 (a day) — brain repo, then deploy to Railway with `PAPER_TRADING=true`
3. Phase 2 (half a day) — mostly verification + one export route
4. Phase 3 setup (half a day) → **start the month-long run**
5. Phase 4 after the run

## Risks / open questions

- Daily enc_token refresh is the main operational risk for a month-long run.
- Kite historical/quote API rate limits: brain already throttles (350ms/quote).
- Supabase free-tier row limits: fine at this volume; check if quote_snapshots added.
- Paper fills at LTP are optimistic (no depth/partial fills) — acceptable for v1;
  note slippage assumption in the final analysis.
