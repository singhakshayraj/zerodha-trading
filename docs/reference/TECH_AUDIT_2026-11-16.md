# Technical audit — 2026-11-16

**What this is:** a sweep of the running system for technical gaps —
security, reliability, latency, data hygiene, dev/prod drift — done the
evening [P-60] shipped. Findings are ranked by what a person using the
system actually loses if nothing changes. Each one carries the evidence
it was measured with, the fix, and its tracking id.

**What it is not:** a review of the advisor's scoring or any trading
logic. Nothing here changes a call. Algorithm and advisor-setting changes
need the operator's explicit go-ahead ([PIPELINE](../PIPELINE.md) rules).

**Scope measured:** brain (Railway, `python:3.11-slim`, one process),
dashboard (Next.js 14.2 on Vercel, functions in `sin1`), Supabase
`gilmuwmtdpjccibfhqtx` (Postgres 17, ap-southeast-1). Tooling: `curl`
timings against production, Supabase advisors + `pg_stat_user_tables` +
`pg_stat_statements`, Vercel project protection settings, Railway deploy
logs.

**Tracking:** findings are `E1`–`E9` in
[KNOWN_ISSUES](KNOWN_ISSUES.md#2026-11-16-technical-audit); the ones worth
a fix are `[P-61]`–`[P-67]` under PROPOSED in [PIPELINE](../PIPELINE.md).
None is started — they wait on a greenlight.

---

## Summary table

| # | Finding | Severity | Effort | Tracked as |
|---|---|---|---|---|
| E1 | Dashboard data routes answer without any login | 🔴 security | ½ day | [P-61] |
| E2 | Brain: in-memory job guards, no health check, deploy overlap | 🔴 reliability | 1 day | [P-62] |
| E3 | A failed morning raises no alert until next day's brief | 🟡 ops | 1 h | [P-63] |
| E4 | NSE holiday calendar ends 2026-12-31, no warning | 🟡 time bomb | 1 h | [P-64] |
| E5 | `/api/analytics/insights` recomputes dead-engine RPCs per visit (~2.8 s) | 🟡 latency | 1 h | [P-65] |
| E6 | `amfi_nav` stores all 14,531 schemes (384k rows, 99 MB) for 3 held | 🟡 data hygiene | 1 h | [P-66] |
| E7 | Retired engine still imported; daily catch-up seq-scans `brain_decisions` | 🟢 hygiene | 2 h | [P-65] |
| E8 | No retry/backoff on Supabase calls | 🟡 reliability | 2 h | [P-67] |
| E9 | Minor: cold start, plaintext token, py3.9 vs 3.11, oversized payloads | 🟢 | — | notes only |

**Fine as is (measured, no action):** DB size 269 MB; connections 18/60;
indexes cover every hot query in `pg_stat_statements`; CI builds on push
for both repos; Vercel functions pinned to `sin1` next to the DB.

**Recommended order:** E1 → E3 → E4 (security, then "know when it
breaks", then the time bomb). E2 is the biggest engineering item and the
one most likely to bite on a deploy morning; do it before the next
scheduler change.

---

## E1 — Dashboard data routes are unauthenticated 🔴

**Evidence.** `curl` with no headers against the production alias
(`zerodha-trading-liard.vercel.app`) returns `200` with both accounts'
holdings, quantities, average prices and P&L from `/api/advisor` and
`/api/advisor?account=natwar`. Vercel *Deployment Protection* is on
(preview/deployment URLs `302` to SSO) but it does not cover the
production alias — by design on Vercel; the prod domain needs its own
gate. There is no `middleware.ts` in the dashboard repo.

**Why it matters.** The page is the private book of two real accounts.
Anyone who sees or guesses the URL reads it; a crawler can index it.

**Fix ([P-61]).** One `middleware.ts` at the repo root: check a signed
cookie on every request except `/login` and `/_next/*`; a `/login` page
that sets it from a single shared secret in Vercel env
(`DASHBOARD_PASSWORD`, compare in constant time). Supabase service key
stays server-side as today. Ask drawer and e2e keep working — Playwright
sets the cookie in `globalSetup`. Half a day including tests.

**Not recommended:** Supabase Auth or NextAuth — one operator, one
password; a library adds a session table and an upgrade cadence for no
gain. Vercel "Password Protection" for production is a paid add-on and
would still leave `/api/*` open to anyone with the password form bypass
token; a cookie middleware covers pages and APIs alike.

## E2 — Brain is one process with memory as its only job state 🔴

**Evidence.** `scheduler.py` keeps nine module-level once-per-day guards
(`_*_date` / `_*_days` variables; the P-60 `_lessons_days` is the newest)
plus several more inside daemon threads. A restart forgets all of them;
every job re-runs on the next tick and re-checks DB state only where the
job itself is idempotent. `railway.toml` sets only `restartPolicyType = "always"` — no
`healthcheckPath`; the Dockerfile exposes no port. Railway's default deploy brings the new
container up before the old one exits — tonight's deploy (`a867d334`,
21:30 IST) logged a Telegram `getUpdates` 409 Conflict from the overlap
([W5](KNOWN_ISSUES.md) is the same symptom).

**Why it matters.** A deploy or Railway restart between 09:15 and 10:00
can double a run (advisor digest sent twice) or lose one (guard set in
the dying process, job never finished). Nothing detects a hung process:
the scheduler loop can wedge on a network call and Railway sees a
healthy container.

**Fix ([P-62]).** (a) Durable job marks: one `app_config` row per job
(`job_done:<name>` = ISO date), checked before and written after; the
in-memory guard stays as a fast path. The `data_jobs` / `watchdog` style
already writes dates to `app_config`, so this is extending a pattern, not
a new one. (b) Health check: a tiny HTTP server thread on `$PORT`
answering `/health` with the last loop heartbeat age; `railway.toml`
`healthcheckPath = "/health"` so a wedged loop gets restarted. (c)
Overlap: set `[deploy] overlapSeconds = 0` if the plan honours it;
either way make every job idempotent via (a), which also removes the
Telegram 409 (the poller checks the mark before starting). One day.

**Not recommended:** a second worker, a queue, or APScheduler with a DB
job store — one process is the right size for one household; the gap is
durability, not concurrency.

## E3 — No alert when a morning fails 🟡

**Evidence.** The data watchdog ([P-56], `data_watchdog.py`) runs at 16:40 IST and writes its
verdict to `app_config`; the only reader is the next morning's brief
([P-55]). A token expiry at 09:20 is therefore seen ~23 hours later
([P-42] history in STATUS: eight silent nights in October).

**Fix ([P-63]).** When the watchdog returns any FAIL, send the same line
to Telegram through the existing `telegram.send_message` with
`ADVISOR_TELEGRAM_BOT_TOKEN` / `ADVISOR_TELEGRAM_CHAT_ID` (already in
config). Also send one line from the 09:45 advisor run
when it skips for a dead token. One hour; the sender exists.

## E4 — Holiday calendar ends at 2026-12-31 🟡

**Evidence.** `config.py:426`: `NSE_HOLIDAYS = set(NSE_HOLIDAYS_2025) |
set(NSE_HOLIDAYS_2026)`. No 2027 list; no check that today's year is
covered.

**Why it matters.** From 2027-01-01 every weekday is treated as a trading
day: the advisor runs on Republic Day with a stale tape, the watchdog
flags a phantom miss, `last_completed_trading_day` returns the wrong date
for call scoring ([P-60]) and bar sync. Nothing warns.

**Fix ([P-64]).** Add `NSE_HOLIDAYS_2027` (NSE publishes the list in
December; until then add the fixed-date ones and a `TODO` for the
lunar ones), and a startup assertion that `max(NSE_HOLIDAYS)` is at least
60 days ahead, logged as a WARN and sent to the brief as a chore line.
One hour. Put a reminder in `Cadence` to extend it every November.

## E5 — Insights recomputes the dead engine's history per visit 🟡

**Evidence.** `app/api/analytics/insights/route.ts:68-71` calls
`insights_totals`, `daily_capture`, `trend_tells_effect`,
`news_outcome_effect` on every request with no `revalidate`; `curl`
timing ~2.8 s warm. Those RPCs aggregate `brain_decisions` / `trades`,
frozen since 2026-08-28 (engine decommissioned 09-09). The two advisor
RPCs added today (`advisor_daily_capture`, `advisor_verdict_mix`) are
cheap (<100 ms).

**Fix ([P-65]).** `export const revalidate = 3600` on the route, or
cache the four dead-engine results in `app_config` once and read them
back. The four number tiles on `/insights` still show engine counts —
either relabel them "engine (retired)" or swap to advisor counts in the
same change. One hour.

## E6 — `amfi_nav` stores the whole mutual-fund market 🟡

**Evidence.** `pg_stat_user_tables`: `amfi_nav` 384k live rows, 99 MB —
the largest table — for 14,531 schemes; the household holds 3 (mapped by hand in
`holding_scheme_map`, see `amfi_nav.py`). The daily AMFI pull inserts every scheme's NAV.

**Fix ([P-66]).** Filter the insert to scheme codes present in the
holdings map; one `DELETE` of the unmapped history after a backup
(`pg_dump -t amfi_nav`). Table drops to a few thousand rows. One hour.
Keep the full file on disk for a month in case a new scheme is bought,
then stop.

## E7 — Retired engine still wired into the live brain 🟢

**Evidence.** `scheduler.py:14` `from brain import TradingBrain` (the
intraday engine) still runs at import; `scheduler.py:172-179` runs
`decision_outcomes.label_decisions_for_date` daily in a trailing window —
`pg_stat_statements` shows it as a sequential scan over `brain_decisions`
(36k calls lifetime, ~0 new rows since 08-28).

**Fix ([P-65], same hygiene pass).** Guard the import and the catch-up
behind a new `ENGINE_ENABLED` env (default `false`; there is no such
flag today — the engine is off only because nothing starts a session) so
a decommission stays a decommission; leave the code in place per POST_MORTEM reopening
rules. Two hours including tests that the scheduler boots without the
engine module.

## E8 — No retry on Supabase calls 🟡

**Evidence.** `database.py` wraps `supabase-py 2.5.0` calls with no retry;
every scheduler job catches the exception, logs "non-fatal", and moves on.
A single `httpx.ReadTimeout` during the 09:45 run skips that step for the
day (seen on 11-04: advisor silent with an ONLINE heartbeat).

**Fix ([P-67]).** One decorator in `database.py` — two retries, 1 s then
3 s, on `httpx` transport errors and PostgREST 5xx only; never on 4xx.
Apply to the read/write helpers, not call sites. Two hours; FakeSupabase
tests cover the retry path by raising once.

## E9 — Minor items (recorded, no ticket)

- **Cold start ~3 s** on the first dashboard hit after idle (Vercel
  function wake + Supabase connect). Normal for the plan; a cron ping every
  10 min would hide it at the cost of invocations. Leave.
- **`enc_token` in plaintext** in `app_config` (`database.py:104`).
  Supabase RLS keeps it server-side; the dashboard never reads it.
  Encrypting it buys little while the service key sits beside it. Note,
  don't act.
- **Local Python 3.9 vs prod/CI 3.11.** Tests pass on both today; `scipy`
  pins were chosen for 3.11. A local `pyenv` 3.11 removes the drift
  whenever convenient (operator's machine, operator's call).
- **`select("*")` payloads.** `/api/autopsy` returns 395 KB; several
  advisor routes send columns the page never reads. Trim per route when
  touched; not worth a sweep.

---

## Method notes (so this can be re-run)

- Auth probe: `curl -s -o /dev/null -w '%{http_code}' https://<prod>/api/advisor` with no headers; `302` = gated, `200` = open. Repeat for a deployment URL to see the SSO wall.
- Latency: `curl -w '%{time_total}'` ×3 per route, warm; anything > 1 s gets a `pg_stat_statements` look.
- DB: Supabase MCP `get_advisors` (security + performance), then `select relname, n_live_tup, pg_total_relation_size(relid) from pg_stat_user_tables order by 3 desc`.
- Brain state: count `^_[a-z_]*(_date|_days)\s*=` in `scheduler.py`; check `railway.toml` for `healthcheckPath`; read the last deploy's log for overlap errors.
- Re-run after any scheduler or routing change; re-rank, don't append.
