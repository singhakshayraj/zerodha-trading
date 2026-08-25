# Multi-tenant design — running the system for N Zerodha accounts

**Status:** design only, nothing built. Written 2026-08-26, revised the same
day after an architecture review that reversed one of its central decisions.

---

## 1. Executive summary

Running the system for a second account is mostly a **data-scoping** problem,
not a distributed-systems problem. Twenty-one tables, none of which has a
tenant column, plus a control plane (`app_config`) whose primary key is a
bare `key`, plus about fifteen module-level globals in `scheduler.py` holding
one account's state.

The work splits into five phases. Phases 0–1 (schema + query scoping) are
~70% of the effort and carry all of the risk. Phase 3 — actually adding the
second account — is configuration.

**What the review changed:** the first draft proposed a dedicated shared
market-data worker from day one. That is over-engineering at N=2 and it
introduced a worse failure mode than it solved. It is now staged out to N≥4.
See §3.

---

## 2. What the review found

The first draft was reviewed against three questions: what breaks at N=2,
what breaks when a token is missing, and what did it not mention at all. Five
findings, in severity order.

### F1 — The shared market worker made the system's worst failure mode worse *(critical, reversed)*

The draft proposed one market worker using "ONE designated token". Token
acquisition is already this system's only real failure mode — measured
uptime **29.2% lifetime, 45.2% since 2026-07-10**. Routing every account's
market data through one specific account's token means **one missing paste
blacks out all accounts**, where before it blacked out one.

It was also premature. At N=2 the duplication a market worker saves is two
sets of Kite calls — and Kite quota is **per account**, so each worker
spends its own budget, not a shared one. The saving is real only when N is
large enough that duplicate compute or write contention actually hurts.

**Resolution:** no market worker at N=2. Each account worker fetches its own
market data, exactly as today. Extract the worker at N≥4, and when extracted
give it a **token pool** — any healthy account's token, with failover —
never one designated account. §3 and §6.

### F2 — No readiness contract between producers and consumers *(critical)*

The draft had account workers reading shared artifacts (`inplay_list`,
`level_pack`) with no statement of what happens when they are absent, stale,
or half-written. This is precisely the shape of **[C7]**: `data_jobs` asked
for 5 days of candles, silently got 3, the in-play ranking came back empty,
and the list never locked — a silent wrong answer, not an error, and it only
failed on Mondays.

Any shared artifact needs an explicit contract: who writes it, when it is
considered complete, and what a reader does when it is not. §6.

### F3 — The entire operational surface was missing *(significant — the effort estimate was wrong)*

The draft covered the brain and the dashboard and stopped. Not mentioned:

- **The watchdog.** It reads `brain_heartbeat` with a hardcoded
  `.eq('id', 1)` and alerts on "the brain", singular. With N accounts it
  watches one of them and silently ignores the rest.
- **`brain_heartbeat` is a literal one-row singleton** (`id = 1`), not merely
  a table lacking a tenant column.
- **Telegram.** One bot, one `ADVISOR_TELEGRAM_CHAT_ID`, one global
  `advisor_bot_offset`. A tap on an action button carries no account
  dimension — with two accounts, **"SELL" is ambiguous**, and that ambiguity
  is attached to a button that moves money.
- **The measurement loop.** `/post-session-check`, `/counterfactual-audit`,
  the VERIFY ledger and the P-36 aggregate RPCs all query globally. Unscoped,
  they silently pool two accounts into one set of numbers — which would
  quietly corrupt the only evidence base this project has.

§9. This is the finding that most changes the effort estimate.

### F4 — The leak defence was too weak *(significant)*

The draft proposed a grep-based test banning raw `table('trades')` calls.
Greps are bypassable by ordinary refactoring (a table name in a variable) and
prove nothing about paths they do not match. The failure they are guarding
is a **silent cross-account read** — the worst class of bug this design can
produce.

Stronger defence available, in order of strength: §7.

### F5 — Smaller gaps

- `decision_outcomes.account_id` would be a denormalisation of
  `brain_decisions.account_id`; it needs a constraint or it will drift.
- Migration mechanics unspecified. The standing rule is that prod writes are
  handed over as SQL, not applied — so the migration must ship as reviewable
  `.sql` files. §10.
- Container cost was hand-waved. At N=2 the revised design is **3 services**
  (2 account workers + watchdog), not 4.
- Two accounts running the same strategy on the same signals produce
  correlated P&L. That is not diversification, and it should not be described
  as such.

---

## 3. Target architecture

Deliberately staged. Stage 1 is what you build for a second account; stage 2
is what you build when duplication starts to hurt.

### Stage 1 — N=2 to 3 (build this)

```
   ┌──────────────────────┐        ┌──────────────────────┐
   │  ACCOUNT WORKER  A   │        │  ACCOUNT WORKER  B   │
   │  SERVICE_ROLE=account│        │  SERVICE_ROLE=account│
   │  ACCOUNT_ID=primary  │        │  ACCOUNT_ID=second   │
   │  own enc_token       │        │  own enc_token       │
   │  own RiskManager     │        │  own RiskManager     │
   │  own instance lock   │        │  own instance lock   │
   │  own heartbeat row   │        │  own heartbeat row   │
   │  fetches own market  │        │  fetches own market  │
   │  data (own quota)    │        │  data (own quota)    │
   └──────────┬───────────┘        └──────────┬───────────┘
              │                               │
              ▼                               ▼
   ┌────────────────────── Supabase ──────────────────────┐
   │ SHARED, idempotent upserts on market-wide keys:      │
   │   candles UNIQUE(symbol,interval,ts)                 │
   │   inplay_list UNIQUE(date,symbol)  ← day-lease       │
   │   level_pack · stock_universe · stock_profile        │
   │   market_context · news_events · quote_snapshots     │
   │   stock_observations                                 │
   ├──────────────────────────────────────────────────────┤
   │ PER-ACCOUNT, every row carries account_id:           │
   │   trading_sessions · trades · brain_decisions        │
   │   brain_activity · decision_outcomes                 │
   │   portfolio_advice · advisor_paper_{positions,equity}│
   │   tradebook · user_executions · brain_heartbeat      │
   │   app_config  (PK becomes (account_id, key))         │
   └──────────────────────────────────────────────────────┘
              ▲                               ▲
              └────── WATCHDOG (1 svc) ───────┘
                  iterates accounts, alerts per account
```

Both workers write the shared tables. That is safe because every shared table
is keyed on market-wide identity, so writes are **idempotent upserts** — two
workers computing the same bars from the same market produce the same rows.

The one exception is `inplay_list`, where two workers could compute slightly
different rankings from opening-range snapshots taken seconds apart. That
gets a **day-lease**: the first worker to claim `(date, 'inplay')` computes
and publishes; the other reads. One small lease, not a whole service.

### Stage 2 — N≥4, or when duplicate pulls hurt

Extract `SERVICE_ROLE=market`. Then, and only then:

- it draws from a **token pool** — every active account's token, using
  whichever is healthy, so no single paste is load-bearing (F1);
- it publishes a **readiness marker** per `(date, artifact)` and account
  workers block or degrade explicitly against it (F2);
- account workers stop fetching shared data.

Staging it this way means stage 1 never has to be undone: the readiness
contract in §6 is written now and honoured by the day-lease, so extraction
later is a change of *who* writes, not of *how readers behave*.

---

## 4. Data plane

**Per-account** — add `account_id text not null default 'primary'`:
`trading_sessions`, `trades`, `brain_decisions`, `brain_activity`,
`decision_outcomes`, `portfolio_advice`, `advisor_paper_positions`,
`advisor_paper_equity`, `tradebook`, `user_executions`, `brain_heartbeat`.

**Shared** — no change: `candles`, `level_pack`, `stock_universe`,
`stock_profile`, `market_context`, `news_events`, `quote_snapshots`,
`stock_observations`, `inplay_list`.

Three calls worth defending explicitly:

- **`candles` needs no migration at all.** Its unique key is already
  `(symbol, interval, ts)`; `session_id` is provenance, not identity. Adding
  `account_id` here is the single most expensive available mistake — it would
  multiply the largest table in the system (36k rows, and the fastest-growing)
  by N for zero information gain.
- **`inplay_list` is already keyed `(date, symbol)`** with no account
  dimension, and stays shared under the day-lease above.
- **`portfolio_advice` splits, but the universe scan does not.** The
  Nifty-500 scan scores names from market data alone and already writes to
  `stock_universe.advisor_score` (shared). Only verdicts on *held* positions
  are per-account. The `is_official = false` snapshot rows follow the
  holdings, so they are per-account too.

Indexes on per-account tables become `(account_id, <existing key>)`, leading
with `account_id`; the partial indexes from [P-37] keep their predicates.
Build them `CONCURRENTLY`.

**`decision_outcomes`** (F5): its `account_id` duplicates its parent
`brain_decisions`. Add a composite FK `(decision_id, account_id)` against a
matching unique key on the parent so the two cannot diverge.

---

## 5. Control plane

`app_config` PK moves from `key` to **`(account_id, key)`**, with
`account_id = '*'` for genuinely global keys.

| Per-account | Global (`'*'`) |
|---|---|
| `enc_token`, `token_updated_at`, `token_incident`, `token_probe_log` | `deploy_incident` |
| `active_session_id`, `brain_status`, `brain_instance_id` | `experiment_cursor` |
| `paper_mode`, `session_config` | `profiles_week` |
| `advisor_run_now`, `advisor_digest_date`, `advisor_calibration_latest` | `advisor_bot_offset` |
| `advisor_paper_seed_*`, `portfolio_risk_latest` | |

Note `token_incident` and `deploy_incident` are the watchdog's durable
one-shot flags. `token_incident` becomes per-account; `deploy_incident` is
genuinely global. Getting this backwards means one account's token alert
suppresses the other's.

New **`accounts`** table — the registry everything else iterates:

```sql
create table accounts (
  account_id      text primary key,
  label           text not null,
  is_active       boolean not null default true,
  paper_only      boolean not null default true,   -- new accounts start safe
  capital         numeric,
  max_daily_loss  numeric,
  telegram_chat_id text,
  created_at      timestamptz not null default now()
);
```

Per-account risk limits live here rather than in env vars, so a second
account cannot silently inherit the first's sizing.

---

## 6. Compute plane, and the readiness contract

**One Railway service per account**, same image, via the `SERVICE_ROLE` seam
`main.py` already uses for the watchdog. `ACCOUNT_ID` is read once at boot as
a module constant — which is exactly what keeps phase 1 mechanical instead of
invasive, since no per-request tenant plumbing is needed anywhere.

**Threads in one process was rejected.** `scheduler.py` holds ~15
module-level globals of per-account state (`risk_manager`, `_is_trading`,
`_advisor_running`, `_heartbeat_*`, `_preflight_date`, ~10 dedupe sets).
Making those per-tenant means rewriting the file's entire state model — the
riskiest change available — and it merges blast radius, so one account's hung
Kite call or `ABORTED` state ([C8]) takes the other down.

**Nothing shared goes inside the trading loop.** [C5] is the precedent:
`archive_candles` on the hot path cost ~7s/cycle and filled stops at −2.78R
instead of ≈−1R. Shared work runs on the existing daemon threads, never
inline with decisions or exits.

### The readiness contract (F2)

Every shared artifact declares three things, and readers honour them from
stage 1 so that stage 2 changes nothing for the reader:

| Artifact | Complete when | Reader on incomplete |
|---|---|---|
| `inplay_list` | day-lease holder publishes and marks the date done | **degrade loudly** — log, skip in-play gating for the cycle, never treat empty as "no candidates" |
| `level_pack` | published for the trade date | block entries that need levels; do not synthesise |
| `candles` | best-effort, continuous | proceed; gaps already handled by the [C7] window floor |

The rule that matters, stated once: **an absent shared artifact must never be
indistinguishable from an empty one.** [C7] cost three Mondays because empty
and missing looked the same.

---

## 7. Isolation and security

The failure mode is not a crash — it is acting on the wrong account's money
or leaking one account's positions into another's view.

1. **Separate `KiteClient` per account. Never shared.** [C8] showed a shared
   enctoken producing a mid-session `ABORTED`. Distinct process, distinct
   client, distinct token.
2. **Per-account instance lock.** `brain_instance_id` becomes
   `(account_id, 'brain_instance_id')`. Two workers for the *same* account
   must still not co-exist; workers for different accounts must.
3. **Per-account `RiskManager`**, constructed inside the worker, so
   `consecutive_losses` and daily-loss caps cannot bleed across books.
4. **`paper_only = true` by default.** A new account cannot place a real
   order until explicitly promoted in `accounts`.
5. **Cross-account read defence**, strongest first (F4):
   - **(a) Dedicated Postgres role + RLS.** Give the brain a non-service
     role with RLS policies keyed on a session GUC (`set local
     app.account_id`). This is the only option that makes a missed filter
     *impossible* rather than *unlikely*. Cost: the brain currently uses
     supabase-py with the service key, so this is a connection-layer change —
     real work, and the reason it is not phase 1.
   - **(b) A scoped `db` helper** that requires an account for per-account
     tables, with the raw client not exported from the module.
   - **(c) The grep test** as a backstop against new raw calls.
   Ship (b) + (c) in phase 1; treat (a) as the phase-6 hardening step before
   any account goes live rather than paper.
6. **Never log a token.** Existing discipline, now doubly load-bearing.

---

## 8. Dashboard

- `accounts` drives a switcher; selection persisted per browser.
- Every API route takes an account scope; the [P-36] aggregate RPCs gain an
  `account_id` parameter.
- `x-enc-token` stops being identity — it is *one account's* token. The
  connect flow must name which account it is connecting, and `TokenAlert`
  becomes per-account. (It must keep using raw `fetch` and skipping
  `/connect`; the shared `api` client's 401 interceptor calls `clearSession()`
  and would loop.)
- `/learn` gains a line saying the system is multi-account, per the house rule.

---

## 9. Operational surface (F3)

This is the part the first draft missed entirely, and it is a third of the
work.

- **Watchdog.** Today it reads `brain_heartbeat` at `.eq('id', 1)` and alerts
  on a singular brain. It must iterate `accounts where is_active`, evaluate
  each independently, and label every alert with the account. Its one-shot
  flags must be scoped or one account's alert will suppress the other's.
- **`brain_heartbeat`** loses its hardcoded `id = 1` and gains
  `unique(account_id)`.
- **Telegram.** One bot, one chat, one global offset — and action taps carry
  no account. Options: a bot per account (simplest, cleanest routing), or one
  bot with the account encoded in every callback payload and echoed in the
  confirmation. **Whichever is chosen, an action button that moves money must
  name its account in the message text**, not only in the payload.
- **The measurement loop.** `/post-session-check`, `/counterfactual-audit`,
  the VERIFY ledger and the aggregate RPCs must all take an account scope.
  Unscoped they pool two accounts into one set of figures — which corrupts
  the only evidence base the project has. VERIFY rows should record which
  account they were run against.

---

## 10. Migration

Five phases, each shippable and reversible alone. Per the standing rule,
**every schema change ships as a reviewable `.sql` file to be run by hand**,
not applied by an agent.

**Phase 0 — schema, no behaviour change.** `account_id` on the eleven
per-account tables with `default 'primary'`, backfill, `(account_id, …)`
indexes built `CONCURRENTLY`, `accounts` table seeded with one row,
`app_config` PK rewritten, `brain_heartbeat` unique key. Nothing reads it.

*Acceptance:* every existing query returns byte-identical results, because
exactly one account exists and every row now carries `'primary'`.

**Phase 1 — scope reads and writes.** The scoped `db` helper (§7b) plus the
grep backstop; `ACCOUNT_ID = os.getenv('ACCOUNT_ID', 'primary')`.

*Acceptance, concretely:* snapshot per-table row counts and checksums of the
dashboard's aggregate endpoints before and after; they must match exactly.
Single-account behaviour is unchanged by construction, and that is testable
rather than asserted.

**Phase 2 — ops surface.** Watchdog iterates accounts; heartbeat per account;
Telegram routing decided and implemented; audit skills and VERIFY scoped.

**Phase 3 — second account.** New Railway service, new `accounts` row,
`paper_only = true`. Observe for a full week before considering promotion.

**Phase 4 — dashboard switcher.**

**Phase 5 (before any second account goes live) — RLS hardening** (§7a).

---

## 11. Capacity

Per [CAPACITY.md](../../reference/CAPACITY.md) and **[P-38]**: Supabase is on
the **FREE 500 MB tier** against ~3.3 GB/yr growth. That is already the
binding constraint and it is unresolved.

Multi-tenancy multiplies only the per-account half: `brain_activity` (47k
rows), `brain_decisions` (27k), `decision_outcomes` (7.9k),
`portfolio_advice` (5.5k). The largest table, `candles` (36k), does **not**,
because it is keyed market-wide — provided nobody adds `account_id` to it.

**Decide [P-38] before phase 3, not after.** A second account reaches the
wall sooner, and doing the tier migration while two accounts are live is
strictly harder than doing it while one is.

---

## 12. Effort (revised)

| Phase | Work | Risk |
|---|---|---|
| 0 schema + backfill | ~1 session | low, reversible |
| 1 scope every query | ~2–3 sessions | **highest** — a missed filter is a silent cross-account read |
| 2 ops surface (watchdog, Telegram, audits, VERIFY) | ~2 sessions | medium — *new since the review* |
| 3 second account | configuration | low while `paper_only` |
| 4 dashboard switcher | ~1 session | low |
| 5 RLS hardening | ~1–2 sessions | medium, but it retires the phase-1 risk |

The first draft estimated 5–8 sessions. With the operational surface and RLS
included, **8–11** is honest.

---

## 13. Open decisions for you

1. **[P-38] Supabase tier** — blocks phase 3.
2. **Telegram: one bot per account, or one bot with account-tagged
   callbacks?** Affects phase 2.
3. **Is the second account paper-only indefinitely, or promoted on a
   criterion?** If promoted, on what evidence?
4. **Does account 2 run the same strategy or a different one?** Same strategy
   means `inplay_list` stays shared; different means it becomes
   strategy-keyed, which is a larger change than tenancy itself.

---

## 14. Sequencing note

At **PF 0.325, expectancy −0.442R over 845 trades**, a second account running
the same strategy multiplies the loss and produces *correlated* P&L — it is
not diversification, and should not be described as such.

Two implications, offered as sequencing rather than objection:

- **The advisor is the part worth extending first.** It is advisory-only, so
  a second account gets real value with zero execution risk, and it exercises
  the entire tenancy stack — scoping, watchdog, Telegram routing, dashboard —
  safely.
- **Keep `paper_only = true` on account 2** until account 1 meets the VISION
  §7 gates. The tenancy work is not what unblocks live trading, and building
  it does not change that.

The phases are identical either way; the decision lands at phase 3.

---

## 15. Rejected alternatives

| Option | Why not |
|---|---|
| Threads in one process | Rewrites `scheduler.py`'s whole state model; merges blast radius |
| Shared market worker at N=2 | Premature; concentrates the token failure mode (F1) |
| Market work as a leased role inside an account worker | Availability is better, but it puts shared work in a trading process — the [C5] latency regression |
| Separate database per account | Kills the shared market tables, multiplies the [P-38] problem by N |
| Supabase RLS alone, with the service key | The service key bypasses RLS; needs a dedicated role to mean anything |
| `account_id` on `candles` | Multiplies the largest, fastest-growing table by N for no information |
