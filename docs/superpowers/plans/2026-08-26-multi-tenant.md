# Multi-tenant design — running the system for N Zerodha accounts

**Status:** design only, nothing built. Written 2026-08-26.

## The short answer

It is very doable, and cheaper than it looks — because the right split is not
"run the system twice". Roughly **half the data and nearly all the expensive
work is market-wide**, identical for every account. Only account state
multiplies.

The single most important design decision:

> **One shared market-data worker + N thin account workers.**
> Candles, level pack, in-play ranking, the Nifty-500 scan and news are
> computed **once** and read by everyone. Holdings, decisions, orders, risk
> and the advisor's verdicts are per account.

Get that split wrong and every cost — storage, Kite quota, runtime — scales
by N. Get it right and only the small part does.

## What "one account" means today (measured, not assumed)

| Coupling | Where | Severity |
|---|---|---|
| **No tenant column anywhere** | all **21** tables | the main work |
| Single global control plane | `app_config`, 19 keys, `key` is the PK | `enc_token`, `brain_status`, `active_session_id`, `paper_mode`, `session_config` are all per-account |
| Module-level singleton state | `scheduler.py`: `risk_manager`, `_is_trading`, `_advisor_running`, `_heartbeat_*`, `_preflight_date`, ~10 dedupe sets | one account's state held in module globals |
| Explicit single-owner lock | `brain_instance_id` (`scheduler.py:546`, `:701`) | *deliberately* prevents two brains. Must become per-account, not removed |
| Risk state | `RiskManager.consecutive_losses`, one global instance | per-account by nature |
| Dashboard has no identity | auth is "holds the enc_token" (`lib/api.ts` sends `x-enc-token`) | needs account selection |
| One process | `Dockerfile: CMD python -u main.py` | already role-dispatched — see below |

**The seam already exists.** `main.py` reads `SERVICE_ROLE` and boots either
the brain or the watchdog from one image. Adding `SERVICE_ROLE=account` with
an `ACCOUNT_ID` is the same pattern, not a new one.

## Layout

```
                    ┌──────────────────────────────┐
                    │   MARKET WORKER  (exactly 1) │
                    │   SERVICE_ROLE=market        │
                    │   uses ONE designated token  │
                    ├──────────────────────────────┤
                    │ candles · level_pack         │
                    │ inplay_list · stock_universe │
                    │ stock_profile · news_events  │
                    │ market_context · observations│
                    └───────────────┬──────────────┘
                                    │ writes SHARED tables (no account_id)
                                    ▼
        ┌───────────────────── Supabase ─────────────────────┐
        │  SHARED (market-wide)      │  PER-ACCOUNT           │
        │  candles, level_pack,      │  trading_sessions,     │
        │  inplay_list, universe,    │  trades, decisions,    │
        │  stock_profile, news,      │  activity, outcomes,   │
        │  market_context,           │  portfolio_advice,     │
        │  quote_snapshots,          │  advisor_paper_*,      │
        │  stock_observations        │  tradebook, executions,│
        │                            │  heartbeat, config     │
        └────────────┬───────────────┴───────────┬────────────┘
                     │ read                      │ read/write, scoped
        ┌────────────▼─────────┐     ┌───────────▼──────────┐
        │ ACCOUNT WORKER  A    │     │ ACCOUNT WORKER  B    │
        │ SERVICE_ROLE=account │     │ SERVICE_ROLE=account │
        │ ACCOUNT_ID=akshay    │     │ ACCOUNT_ID=second    │
        │ own enc_token        │     │ own enc_token        │
        │ own RiskManager      │     │ own RiskManager      │
        │ own instance lock    │     │ own instance lock    │
        │ own kill switch      │     │ own kill switch      │
        └──────────────────────┘     └──────────────────────┘
                     │                           │
                     └────────► Dashboard ◄──────┘
                          account switcher, scoped API
```

## The three planes

### 1. Data plane — which tables split

**Per-account** (add `account_id text not null`): `trading_sessions`,
`trades`, `brain_decisions`, `brain_activity`, `decision_outcomes`,
`portfolio_advice`, `advisor_paper_positions`, `advisor_paper_equity`,
`tradebook`, `user_executions`, `brain_heartbeat`.

**Shared** (no change): `candles`, `level_pack`, `stock_universe`,
`stock_profile`, `market_context`, `news_events`, `quote_snapshots`,
`stock_observations`, **`inplay_list`**.

Two calls worth arguing about, so they are argued here:

- **`inplay_list` is shared**, and already keyed `(date, symbol)` with no
  account dimension. It ranks candidates from opening-range stats — pure
  market data — so two accounts on the same strategy should see the same
  list. A future account running a *different* strategy gets its own list
  keyed by strategy, not by account.
- **`candles` is already shared-shaped.** Its unique key is
  `(symbol, interval, ts)` — `session_id` is provenance, not identity — so the
  bars are already deduped market-wide and need **no migration at all**.
  Adding `account_id` here would be the single most expensive mistake
  available: it would multiply the largest table in the system by N for zero
  information gain.
- **`portfolio_advice` splits, but its Nifty-500 scan half does not.** The
  scan scores the universe from market data alone — that belongs in
  `stock_universe.advisor_score` (already shared). Only verdicts on *held*
  positions are per-account.

Every per-account index becomes `(account_id, <existing key>)`, leading with
`account_id`. The existing partial indexes from [P-37] keep their predicates.

### 2. Control plane — `app_config` grows a tenant

`app_config` PK goes from `key` to **`(account_id, key)`**, with
`account_id = '*'` for genuinely global keys.

| Per-account | Global (`'*'`) |
|---|---|
| `enc_token`, `token_updated_at`, `token_incident`, `token_probe_log` | `deploy_incident` |
| `active_session_id`, `brain_status`, `brain_instance_id` | `experiment_cursor` |
| `paper_mode`, `session_config` | `profiles_week` |
| `advisor_run_now`, `advisor_digest_date`, `advisor_calibration_latest` | `advisor_bot_offset` |
| `advisor_paper_seed_*`, `portfolio_risk_latest` | |

Plus a small **`accounts`** table: `account_id`, `label`, `is_active`,
`paper_only`, `capital`, `max_daily_loss`, `telegram_chat_id`, `created_at`.
Per-account risk limits live here rather than in env vars, so a second
account cannot inherit the first one's sizing by accident.

### 3. Compute plane — process per tenant

**Recommended: one Railway service per account**, same image, `SERVICE_ROLE=account`
+ `ACCOUNT_ID`.

Why not threads in one process:

- `scheduler.py` holds ~15 module-level globals of per-account state. Making
  those per-tenant means rewriting the file's entire state model — the single
  largest and riskiest change available, for no gain.
- Blast radius. One account's crash, hung Kite call, or `ABORTED` state
  ([C8]) takes the other down with it.
- The token flush at 04:34 IST, the stale-token banner, the kill switch and
  the instance lock are all per-account concepts that map 1:1 onto a process.
- Railway already runs two services off this image. A third is configuration,
  not architecture.

Cost: one container per account. That is the honest trade and it is the right
one at N=2.

**With process-per-tenant, `ACCOUNT_ID` is a module constant read once at
boot** — no request-scoped plumbing anywhere. This is what makes the code
change mechanical rather than invasive.

## Isolation and safety

This is the part that matters most, because the failure mode is not a bug —
it is trading the wrong account's money.

1. **Separate `KiteClient` per account, never shared.** [C8] is the warning:
   concurrent use of one enctoken produced a mid-session `ABORTED`. Two
   accounts must never share a client, a session, or a token.
2. **Per-account instance lock.** `brain_instance_id` becomes
   `(account_id, 'brain_instance_id')`. Two workers for the *same* account
   still must not co-exist; workers for *different* accounts must.
3. **Per-account `RiskManager`**, constructed inside the account worker, so
   `consecutive_losses` and daily-loss caps cannot bleed across books.
4. **Per-account kill switch and paper mode.** A new account starts
   `paper_only = true` in the `accounts` table and must be explicitly
   promoted.
5. **Leak prevention.** A missing `account_id` filter is a silent
   cross-account read. Two defences:
   - a `db` helper that *requires* an account scope for per-account tables —
     no raw `.table('trades')` calls outside it;
   - a test that greps for direct `table('<per-account>')` usage outside the
     helper and fails on any new one. Cheap, and it catches the whole class.
6. **Never log a token.** Existing discipline; now doubly true with two.
7. **Supabase RLS is not the defence here** — the service key bypasses it.
   The helper plus the test is the real guard.

## Dashboard

- `accounts` drives a switcher; selection stored per browser.
- Every API route takes an account scope and passes it to Supabase. The
  routes that aggregate ([P-36] RPCs) take `account_id` as a parameter.
- `x-enc-token` stops being identity. It is *one account's* token, so the UI
  needs to say which account it is connecting, and `TokenAlert` becomes
  per-account (it already must skip `/connect`).
- `/learn` needs a line saying the system is multi-account, per the house
  rule.

## Migration — phases, each shippable alone

**Phase 0 — schema, no behaviour change.** Add `account_id` to the eleven
per-account tables, default `'primary'`, backfill existing rows, add
`(account_id, …)` indexes, add the `accounts` table with one row. Rewrite
`app_config` PK. Nothing reads it yet. Fully reversible.

**Phase 1 — scope the writes and reads.** Introduce the account-scoped `db`
helper and route every per-account query through it, with
`ACCOUNT_ID = os.getenv('ACCOUNT_ID', 'primary')`. Single-account behaviour
must be bit-for-bit identical — that is the acceptance test.

**Phase 2 — split the workers.** Extract the market-wide jobs into
`SERVICE_ROLE=market`. The account worker stops fetching shared data and
reads it instead. Verify the shared tables are still written exactly once per
day.

**Phase 3 — add the second account.** New Railway service, new `accounts`
row, `paper_only = true`. Watch for a full week before considering promotion.

**Phase 4 — dashboard switcher.**

Phases 0–1 are the bulk. Phase 3 is configuration.

## Capacity — the constraint that actually bites

Per [CAPACITY.md](../../reference/CAPACITY.md) and **[P-38]**: Supabase is on
the **FREE 500 MB tier** against ~3.3 GB/yr growth. That is already the
binding problem, and it is unresolved.

Multi-tenancy makes it worse, but only on the per-account half:

- `brain_activity` (47k rows), `brain_decisions` (27k), `decision_outcomes`
  (7.9k) and `portfolio_advice` (5.5k) all scale by N.
- `candles` (36k rows — the largest) does **not**, because it is already
  keyed market-wide. It stays free as long as nobody adds `account_id` to it.

So the shared/per-account split is not an elegance argument, it is the
difference between ~2× and ~1.4× growth. **The tier decision ([P-38]) should
be made before phase 3, not after** — a second account on the free tier hits
the wall sooner.

## Effort

| Phase | Work | Risk |
|---|---|---|
| 0 schema + backfill | ~1 session | low, reversible |
| 1 scope every query | ~2–3 sessions, mechanical but wide | **highest** — a missed filter is a cross-account leak |
| 2 split workers | ~1–2 sessions | medium — shared jobs must run exactly once |
| 3 second account | configuration | low, if `paper_only` |
| 4 dashboard | ~1 session | low |

Phase 1 is the one to be careful with, and the grep-based test is what makes
it safe rather than hopeful.

## One thing to weigh before starting

The design above is sound regardless, but the sequencing question is honest:
the intraday engine currently runs **PF 0.325, expectancy −0.442R** over 845
trades. Running a losing strategy on a second account multiplies the loss,
it does not diversify it. Two implications:

- **The advisor is the part worth extending first.** It is advisory-only, so
  a second account gets value with no execution risk, and it exercises the
  whole tenancy stack safely.
- **Keep `paper_only = true` on account 2** until the gates in VISION §7 are
  met by account 1. The tenancy work is not what unblocks live trading.

This is a sequencing note, not an objection — the phases are the same either
way, and phase 3 is where the decision actually lands.
