# Session Handoff — Paper Trading Infra Setup

Read this first in a new session to resume exactly where we left off.

## Big picture

Goal: validate the auto-trade platform against real market data with
simulated execution (paper trading), run it unattended for ~1 month, store
all decisions/trades as a training dataset. Full plan:
`docs/PAPER_TRADING_ROADMAP.md` (Phases 0-4).

Two repos involved:
- `zerodha-trading` (this repo) — Next.js dashboard + API + Supabase, deployed on Vercel
- `zerodha-brain` (`~/Desktop/GITHUB/zerodha-brain`) — Python decision engine, was on Railway, migrating to a self-hosted VM

## What's DONE

**Phase 0 (zerodha-trading, commit `cd8b36e`, pushed):** fixed 5 money-path
bugs before running anything for real — P&L guardrail double-count, invalid
`STOPPED` session status, `closeTrade` NaN guard, session-restore config-key
mismatch, stop route not clearing `active_session_id`.

**Mock/validation system (zerodha-trading, multiple commits through `96f4b14`,
`aa06d2d`):** `/mock/trading` dashboard against a staging Supabase project,
realistic market simulator (`app/mock/lib/market-sim.ts` — random-walk prices,
SL/target exits, position sizing), live-seed mode that holds a session RUNNING
until explicit end, and a dedicated `/mock/validations` page with a 7-step
automated test suite (reset → seed live → trade-count increments → brain
status → REAL page reload → post-reload restore check → clean end). All 7
steps passing as of last run.

**Phase 1 (zerodha-brain, commit `8bb2240`, pushed to GitHub):**
`paper_broker.py` — drop-in replacement for `OrderManager`. Fills at real
live LTP (`kite.get_ltp`, read-only) + slippage, `PAPER-*` order ids, refuses
to fill without a real price. Selected via `config.PAPER_TRADING` env flag.
`scheduler.py` writes `app_config.paper_mode` so the dashboard can label
sessions. Doc at `zerodha-brain/docs/PAPER_TRADING.md`. Brain's full test
suite (208 tests) + new smoke tests pass.

## Railway → Oracle Cloud migration (IN PROGRESS)

Railway usage ran out. Chose Oracle Cloud Always Free over AWS (12mo-limited)
and GitHub Actions (6hr job cap makes market-hours runs awkward, plus repo
already public so that tradeoff was moot — went with Oracle for a real
always-on host anyway).

**Oracle VM created:**
- Name: `zerodha-brain`, region `ap-hyderabad-1` (India South), AD-1
- Shape: `VM.Standard.E2.1.Micro` (1 OCPU, 1GB RAM) — **not** the originally
  planned `VM.Standard.A1.Flex` (ARM), because A1 hit "out of capacity" in
  this region. E2.1.Micro is also Always Free-eligible, just smaller —
  fine for this workload (lightweight polling, no ML inference).
- Image: **Oracle Linux 9.7** — not Ubuntu as originally planned. The OCI
  console wizard silently reset the image to its default every time we
  changed shape; we didn't catch it until after creation. Decision made:
  keep it and adapt (Oracle Linux is also free, just use `dnf` not `apt`,
  login user is `opc` not `ubuntu`) rather than risk losing the free-tier
  capacity slot by recreating.
- Networking: created `zerodha-vcn` (CIDR `10.0.0.0/16`) + `zerodha-igw`
  (internet gateway) + default route table rule (`0.0.0.0/0` → igw) +
  `zerodha-public-subnet` (`10.0.0.0/24`, public). Default security list
  already allows inbound TCP/22 from `0.0.0.0/0` — confirmed, no change
  needed.
- **Public IP: `129.159.233.238`**
- **SSH user: `opc`**
- **SSH key: `~/.ssh/oracle-zerodha-brain.key`** (moved from Downloads,
  chmod 600; `.pub` counterpart alongside it, chmod 644)
- SSH connection verified working from this Mac.

**Setup progress on the VM (last known state — VERIFY IN NEW SESSION,
a background command was checking this when the session ended):**
1. `.env` from local `zerodha-brain/.env` (SUPABASE_URL + SUPABASE_SERVICE_KEY)
   was `scp`'d to the VM at `~/brain.env` — confirmed done.
2. Docker + git install command was launched in the background
   (`dnf install docker-ce` via Docker's CentOS repo, since Oracle Linux 9
   is RHEL-compatible) — **status unconfirmed, check this first.**

**Still to do on the VM:**
1. Verify Docker + git installed OK (`ssh -i ~/.ssh/oracle-zerodha-brain.key opc@129.159.233.238 "sudo docker --version && git --version"`)
2. `git clone https://github.com/singhakshayraj/zerodha-brain.git` on the VM
3. Move `~/brain.env` into the cloned repo as `.env`
4. `sudo docker build -t zerodha-brain .`
5. `sudo docker run -d --name zerodha-brain --restart=always --env-file .env zerodha-brain`
6. `sudo systemctl enable docker` (survive reboots)
7. Verify: `sudo docker logs -f zerodha-brain` should show
   `[BRAIN] PAPER TRADING mode — no real orders will be placed` IF
   `PAPER_TRADING=true` is in the env file — **check whether `PAPER_TRADING=true`
   was ever added to the local `.env` before it was scp'd. If not, add it
   there and re-scp, or add it directly on the VM's copy.**
8. Confirm heartbeat lands in Supabase (`brain_heartbeat` table, status
   ONLINE/RUNNING, fresh `last_ping`).

## Other loose ends

- **Supabase MCP just added** (`claude mcp add supabase ...`, confirmed
  `✓ Connected` via `claude mcp list`) but tools weren't visible in the old
  session — needs a fresh session (this one) to pick it up. Two Supabase MCP
  connections exist: `claude.ai Supabase` (pre-existing connector) and
  `supabase` (the one just added, scoped with an access token). Use whichever
  responds; if both expose the same tool names there may be a naming
  collision to sort out.
- Old Railway deployment: not yet decommissioned/deleted — do this once the
  Oracle VM is confirmed running the brain correctly, to avoid double-billing
  risk or duplicate `active_session_id` writers.
- **Daily enc_token refresh** is still the main open operational risk for
  the month-long run (Zerodha token expires ~6 AM IST daily) — deferred
  decision from Phase 3 planning (manual paste vs TOTP auto-login).
- Phase 2 (verify decision/SKIP logging completeness, add an analytics
  export route) and Phase 3 (market-hours auto start/stop, holiday calendar,
  heartbeat watchdog) haven't been started yet.

## Immediate next action for new session

1. Check the Docker install background command actually finished OK (see
   command above).
2. If it succeeded, proceed through steps 2-8 in "Still to do on the VM"
   above — clone, build, run, verify.
3. If it failed, debug (Oracle Linux 9 uses `dnf`, SELinux may need Docker
   permissions tweaks, `opc` user needs `sudo`).
4. Then re-verify the Supabase MCP tools are visible via ToolSearch and use
   them to double check `brain_heartbeat` / `app_config` state if useful.
