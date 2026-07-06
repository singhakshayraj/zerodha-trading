# Session Handoff — Paper Trading Infra Setup

Read this first in a new session to resume exactly where we left off.
Companion doc: `docs/VISION.md` — mission, trading fundamentals, risk
limits, pre-run gates, go/no-go criteria. Read that too if the "why" behind
any decision here is unclear; it's the durable reference, this file is the
fast-moving state.

## Big picture

Goal: validate the auto-trade platform against real market data with
simulated execution (paper trading), run it unattended for ~1 month, store
all decisions/trades as a training dataset. Full plan:
`docs/PAPER_TRADING_ROADMAP.md` (Phases 0-4).

Two repos involved:
- `zerodha-trading` (this repo) — Next.js dashboard + API + Supabase, deployed on Vercel
- `zerodha-brain` (`~/Desktop/GITHUB/zerodha-brain`) — Python decision engine, moving back to Railway (see below)

## What's DONE

**Phase 0 (zerodha-trading, commit `cd8b36e`, pushed):** fixed 5 money-path
bugs before running anything for real — P&L guardrail double-count, invalid
`STOPPED` session status, `closeTrade` NaN guard, session-restore config-key
mismatch, stop route not clearing `active_session_id`.

**Mock/validation system (zerodha-trading, multiple commits through `96f4b14`,
`aa06d2d`):** `/mock/trading` dashboard against a staging Supabase project,
realistic market simulator, live-seed mode, `/mock/validations` 7-step
automated test suite. All 7 passing as of last run.

**Phase 1 (zerodha-brain, commit `8bb2240`):** `paper_broker.py` — drop-in
replacement for `OrderManager`. Fills at real live LTP + slippage, `PAPER-*`
order ids, selected via `config.PAPER_TRADING` env flag.

**Realistic cost model (zerodha-brain, commit `ae90de6`, pushed):**
`paper_broker.py` was slippage-only, which overstated paper P&L. Added
`_zerodha_intraday_charges()` — full Zerodha MIS schedule (brokerage, STT,
exchange, SEBI, GST, stamp, ~0.1% round trip), folded into the fill price
adversely. No schema change needed. 208 brain tests still pass.

**Vision doc (zerodha-trading, commit `b257519`, pushed):** `docs/VISION.md`
written — mission/stages table, edge hypothesis, architecture, trading
fundamentals (R-multiples, stop discipline, regime awareness, NSE intraday
clock, process-over-outcome, losing-streak throttle), risk limits, 9-item
pre-run gate, go/no-go criteria with metric definitions, live kill criteria,
the trade→data→learn→improve flywheel, and a decision log. **This is now
the source of truth for "what are we building and why" — read it before
re-deriving any of this from scratch.**

## Oracle Cloud VM — ABANDONED, do not resume

Tried migrating the brain off Railway to a free Oracle Cloud VM. Killed this
approach after ~1hr of fighting it. Keeping the story here so we don't
repeat the mistake:

- Created `zerodha-brain` VM, `VM.Standard.E2.1.Micro` (1 OCPU, ~500MB
  *usable* RAM despite "1GB" spec), Oracle Linux 9, `ap-hyderabad-1`, IP
  `129.159.233.238`, user `opc`, key `~/.ssh/oracle-zerodha-brain.key`.
  **Terminated 2026-07-05 — cleanup done, no longer running.**
- `dnf install docker-ce` **OOM-killed twice** — even a bundled install of
  just `git` alone got OOM-killed after growing swap from 498MB to 3GB.
  Root cause: this VM shape's real headroom is too thin for dnf's
  metadata/transaction overhead, let alone running Docker + Python +
  indicators + Kite polling unattended for a month.
- Tried the bigger free-tier shape (`VM.Standard.A1.Flex`, ARM, 4 OCPU/24GB
  pool) as a fix — hit "out of capacity" in `ap-hyderabad-1` **twice**
  (region is single-AD, no fallback AD to try). A1.Flex capacity is
  globally contested; not worth an open-ended retry loop.
- Verdict (see `VISION.md` §5 gate #2, #4 — silent failure is disqualifying):
  a host that OOMs on `dnf install git` cannot be trusted for an unattended
  month handling real trade decisions. Decided to stop fighting free tier.
- The VM (`129.159.233.238`) is still running in OCI — **not yet
  terminated**. Low priority cleanup: terminate it once Railway is
  confirmed working, to avoid confusion/leftover cost-free-but-clutter.

## Railway — DONE (confirmed working 2026-07-05)

Decided to resume Railway (~$5/mo Hobby plan) instead of self-hosting.
Rationale: code already ran there before credits ran out; PaaS means no OS
to babysit; checked pricing against Hetzner/DigitalOcean/Render — Railway
isn't the cheapest (~$1-2/mo more than a raw VPS) but the alternatives all
require managing your own box, which is the exact risk category just
escaped with Oracle.

**Done:**
- User signed up for Railway Hobby plan.
- Railway CLI installed locally (`brew install railway`, v5.23.3).
- `railway login` completed — authenticated as `singhakshayraj@ymail.com`.
- `railway setup agent` run — installs Railway's own Claude Code
  integration:
  - Skill `use-railway` → `~/.claude/skills/use-railway`
  - MCP server registered in `~/.claude.json`
  - **Requires a Claude Code session restart to actually load** — this was
    just configured, not yet active as of this handoff.
- Existing Railway project confirmed via `railway list`: **`stunning-harmony`**
  (this is presumably the old zerodha-brain deployment — not yet inspected
  in detail).

**Verified 2026-07-05, all items closed:**
1. Railway MCP tools live post-restart — confirmed via `whoami`/`list_projects`.
2. `stunning-harmony` (id `c2088221-f7bb-4d10-9e6e-3af8238203d9`) is the
   zerodha-brain deployment, linked to `singhakshayraj/zerodha-brain` repo
   (Railpack builder), single service `zerodha-brain`, one environment
   `production`.
3. `PAPER_TRADING` was **not** set (old deployment predates paper mode) —
   added `PAPER_TRADING=true` via `mcp__railway__set_variables`, which
   auto-triggered a redeploy.
4. `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` confirmed pointing at prod
   (`gilmuwmtdpjccibfhqtx`), not sim.
5. Redeploy landed automatically from the var change — deployment SUCCESS
   at 2026-07-05 18:35:47 UTC, picks up `main` HEAD (includes cost-model
   fix `ae90de6`).
6. `[BRAIN] PAPER TRADING mode` banner (`brain.py:31`) only prints when a
   `TradingBrain` session actually starts (market-hours gated via
   scheduler), not at container boot — **not yet observed live**, container
   boot alone just runs the heartbeat loop. Confirm this during the next
   NSE market session (09:15-15:30 IST) by tailing deploy logs.
7. Heartbeat confirmed live in Supabase: `brain_heartbeat` row updating in
   real time (`last_ping` 18:36:28 UTC post-redeploy), `status=ONLINE`,
   `message="Waiting for START command"` — correct idle state outside
   market hours.
8. Abandoned Oracle VM (`129.159.233.238`) terminated 2026-07-05.

**Next session should pick up here:**
- During next market session, confirm the `PAPER TRADING mode` banner
  actually appears in Railway deploy logs and a real cycle count > 0 shows
  up in `brain_heartbeat` (proves the scheduler is starting sessions and
  the paper broker path is live end-to-end).
- Note: only 2 custom vars are defined on the Railway service
  (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, now + `PAPER_TRADING`). Kite
  `enc_token` is **not** a Railway env var — it's read from the Supabase
  `config` table via `database.get_enc_token()`. Daily token refresh
  (open risk, see below) needs to write there, not to Railway.

## Other loose ends

- **Supabase MCP working** — confirmed via `mcp__supabase__list_projects`.
  4 projects visible: `zerodha-trader` (prod, ACTIVE_HEALTHY,
  `gilmuwmtdpjccibfhqtx`), `zerodha-trading-sim` (staging,
  `fbfluafzxgynasvuryiu`), `MarketMind` + `zerodha-portfolio` (both
  INACTIVE, unrelated/unused). No naming collision issue in practice.
- **Mystery test files — RESOLVED 2026-07-06.** They were the untracked
  half of the passing 208-test suite (written May 26, "T2.2" batch, never
  committed). Verified all green, committed + pushed (`da23cf5`),
  `.coverage` gitignored.
- `test_paper_broker.py` was discussed as a good addition (unit tests for
  the new cost-model math) but **not yet written**.
- **Daily enc_token refresh — DECIDED 2026-07-06, partially closed.**
  - TOTP auto-login **built and shipped** (`token_refresher.py`, commit
    `ad01ce3`): replays kite.zerodha.com login (password + TOTP via pyotp),
    writes fresh enctoken to Supabase `config.enc_token`. Scheduler fires
    it daily 6:30 IST + on START-with-no-token. 13 unit tests, suite 221.
  - **Currently DORMANT** — user not comfortable storing broker creds yet,
    so `KITE_USER_ID` / `KITE_PASSWORD` / `KITE_TOTP_SECRET` are NOT set on
    Railway. Without all three, every refresher call is a no-op by design.
  - Interim decision: **manual paste daily before 9:15 AM IST** (user
    commitment). To activate auto-login later: set the 3 env vars on
    Railway (user should set them via dashboard themselves, TOTP secret =
    base32 string from 2FA re-setup, not a 6-digit code).
  - **Hard alert NOT built (user chose defer)** — VISION gate #3 therefore
    still OPEN: manual paste with no missed-morning alert is not
    month-run-ready. Revisit before the run starts (heartbeat watchdog in
    Phase 3 overlaps this).
- **Phase 2 — DONE 2026-07-06** (brain commit `3df3f9c`, trading commit
  `44b4281`):
  - Decision logging verified complete: every analyzed symbol logs
    BUY/SELL/HOLD with indicators + skip_reasons. Patched two gaps:
    regime-blocked HOLDs now carry indicator snapshots, and data-gap skips
    (no candles / no price) log as `SKIP` decisions.
  - `quote_snapshots` table created (prod migration): one row per cycle,
    jsonb symbol→LTP map, written from `brain.run_cycle`.
  - `performance_daily` view created (prod migration): IST trade-date
    rollup — trades, win rate, net pnl, max intraday drawdown, regime
    distribution. Validated against May trades.
  - `/api/analytics/export` route: sessions/trades/decisions/daily for a
    date range, JSON or CSV, paginated. **Gated by `ANALYTICS_EXPORT_TOKEN`
    env var — NOT YET SET on Vercel** (route 401s until set; generate with
    `openssl rand -hex 32`).
- **Phase 3 — code DONE 2026-07-06, activation pending:**
  - NSE 2026 holiday list hardcoded + merged with 2025; risk_manager now
    uses the merged set (old check was 2025-only, silently useless).
  - AUTOPILOT env flag: self-start at 09:30 IST trading days, at most once
    per day (any session today suppresses restart — manual stop, loss
    limit, token expiry). Square-off at 15:20 already existed via
    `end_session`. **AUTOPILOT NOT YET SET on Railway** — user chose to
    keep manual dashboard START for now; set `AUTOPILOT=true` when ready
    for the shakedown day.
  - Run config written to prod `app_config.session_config`: ₹10,000,
    10 trades/day, 3% max loss, 10% max profit, 300s interval, NIFTY50.
  - Heartbeat watchdog + alerts still NOT built (user deferred alerts) —
    remaining Phase 3 gap, blocks month-run start per VISION §5.
- Backtest across multiple market regimes (gate #6) also not started —
  needed to separate "infra works" from "strategy has edge," per
  `VISION.md` §1.

## 2026-07-07 — Architecture-failure scan + hardening (brain `db2fbb9`)

Full-system failure-mode scan, then fixed everything found. Brain:

1. **Transient Supabase error no longer ends the session** — the
   `active_session_id` re-verification now retries and fails OPEN
   (`get_config_strict` distinguishes "query failed" from "key cleared").
   Was the most probable month-run killer.
2. **Instance lock + SIGTERM handler** — Railway redeploy overlap can no
   longer double-trade one session; older process exits without teardown
   when a newer one claims `brain_instance_id`.
3. **Zombie unfilled trades voided on init/resume** (`UNFILLED_VOID`) —
   a NULL-quantity row used to crash every cycle silently after a resume.
4. **STOP while brain idle now finalizes the orphaned session** (was:
   brain_status stuck STOP + session RUNNING forever).
5. **Startup interlocks** (`config.assert_safe_boot`): QA_MODE+prod DB
   refuses to boot; real trading requires `REAL_TRADING_CONFIRM` env.
   NOTE: brain now REQUIRES `PAPER_TRADING=true` on Railway to boot.
6. Circuit-breaker streak rebuilt on resume; loss limit now counts open
   (unrealized) losses; `write_config` retries; `total_pnl_percent` vs
   capital; `_execute_sell_by_symbol` LONG-only match.

Dashboard: `/api/trade/start` + `/stop` now 403 unless `x-enc-token`
matches the stored `enc_token` (was presence-only = effectively public).
QA unaffected (sim DB has no enc_token row).

Verified: 256 brain unit tests, QA stack 4/4 Playwright scenarios,
brain-restart scenario PASS. Railway auto-deploys from main — confirm
`PAPER_TRADING=true` is set there before/at next deploy (it is today).
