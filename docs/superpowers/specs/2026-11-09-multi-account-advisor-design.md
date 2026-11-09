# Multi-account advisor — design revision (2026-11-09)

**Status:** design only, nothing built. Tracked as **[P-45]**.
**Builds on** [plans/2026-08-26-multi-tenant.md](../plans/2026-08-26-multi-tenant.md)
(the "base plan"). Everything there stands unless this file changes it. What
changed since 08-26: the intraday trading engine was decommissioned
(2026-09-09), and the operator made three decisions (§2).

**Accounts:** `primary` = Kanaklata (existing, all current data) ·
`natwar` = Natwar Raj Singh (new).

---

## 1. What the decommission removes from the base plan

The base plan's riskiest phase was scoping ~21 tables, most of them
trading-only. Those tables are now frozen (no session since 08-28) and will
never receive a second account's rows:

`trading_sessions`, `trades`, `brain_decisions`, `brain_activity`,
`decision_outcomes`, `tradebook`, `inplay_list`, `level_pack`,
`quote_snapshots`, `stock_observations`, `market_context`.

They get **no `account_id`**. Also gone: per-account `RiskManager`, the
in-play day-lease (F2's main case), `paper_only` order gating (the real-money
path is hard-disabled in code, `c604c0d`), and the [C5] hot-path concern.

## 2. Operator decisions (2026-11-09)

1. **Single stack** — one Supabase DB, one dashboard, one repo/deploy
   pipeline. (A second isolated deployment was rejected.)
2. **No separate login for Natwar.** The existing dashboard gets an
   **account toggle** (Kanaklata / Natwar).
3. **Tokens are independent.** The operator may paste either token or both on
   a day. An account with a live token runs; the other idles without error.

## 3. Scope (advisor-only)

**Per-account** — add `account_id text not null default 'primary'`:

| Table | Why per-account |
|---|---|
| `portfolio_advice` | verdicts on *held* positions (official + lite rows) |
| `advisor_paper_positions`, `advisor_paper_equity` | each account's virtual books |
| `user_executions` | real trades detected from that account's holdings |
| `holdings_snapshot` | that account's holdings |
| `holding_scheme_map` | that account's mutual-fund units |
| `brain_heartbeat` | one row per worker (drop the `id = 1` singleton) |

**Shared — unchanged:** `stock_universe` (Nifty-500 scores are market-only),
`candles`, `amfi_nav`, `news_events`, `stock_profile`.

**`app_config`:** PK `key` → `(account_id, key)`, `'*'` for global keys.

| Per-account | Global (`'*'`) |
|---|---|
| `enc_token`, `token_updated_at`, `token_incident` | `advisor_bot_offset` |
| `brain_status`, `brain_instance_id` | `deploy_incident` |
| `advisor_run_now`, `advisor_digest_date` | |
| `advisor_calibration_latest`, `grading_incident` | |
| `advisor_paper_seed_*`, `portfolio_risk_latest` | |

**`accounts` registry** (base plan §5, trimmed — no capital/loss limits):

```sql
create table accounts (
  account_id       text primary key,
  label            text not null,
  is_active        boolean not null default true,
  telegram_chat_id text,
  created_at       timestamptz not null default now()
);
-- seed: ('primary','Kanaklata'), ('natwar','Natwar Raj Singh', is_active=false)
```

## 4. Compute — one worker service per account (kept from base plan §6)

Same image, `ACCOUNT_ID` env read once at boot as a module constant. Kept
over threads-in-one-process because it needs no per-request tenant plumbing
and a hung Kite call on one account cannot stall the other — which is
exactly decision §2.3 ("the other idles without error").

Cost: +1 small Railway service. Both workers run the Nifty-500 rotation scan
and upsert the same `stock_universe` rows — idempotent, each on its own Kite
quota. ponytail: duplicate scan at N=2; designate one scanner when N≥4.

**Exactly one Telegram poller.** Two services long-polling the same bot get
`409 Conflict` (seen 11-09 during a deploy overlap). `advisor_bot` runs only
in the `primary` worker; every callback payload carries `account_id`, and
the poller routes the accept/decline to that account's row. Digests are sent
by each worker. **Every message names its account in the text**, not only in
the payload (base plan §9).

## 5. Grading and the evidence base

- `run_backtest_pass` scopes its queue by `ACCOUNT_ID`; each worker grades
  its own rows with its own token.
- `advisor_calibration_latest` is per-account.
- **The V-20 n=400 read stays `primary`-only**, as pre-registered. Pooling
  Natwar's calls into any advisor-skill measure needs its own explicit,
  pre-registered decision, and goes on the trial ledger (V-19).
- [P-46]/[D3]/[D4] grader fixes land **before** this work (same function),
  so tenancy is not mixed with grading-logic changes.

## 6. Dashboard

- Account toggle in the header, driven by `accounts`; selection kept per
  browser (localStorage).
- Routes that read per-account data take `?account=`: `/api/advisor`,
  `/advisor/track-record`, `/advisor/accountability`, `/advisor/lookup`
  (lookup is market-only, but its result renders against that account's
  holdings).
- `/connect` asks **which account** the token is for; `TokenAlert` shows
  each account's token state separately ("Kanaklata ✅ · Natwar ⚠️ expired").
- `/api/trade/start|stop` and `/trading` are trading-era — leave untouched.

## 7. Isolation

From base plan §7, the parts that still apply: a separate `KiteClient` per
worker, a per-account instance lock, never log a token, and the scoped `db`
helper + grep backstop for per-account tables. **RLS hardening (base §7a) is
deferred:** with no order path, the worst cross-account bug is a wrong
*view*, not a wrong trade — real but recoverable. Revisit if an order path
ever returns.

## 8. Phases

| Phase | Work | Acceptance | Est. |
|---|---|---|---|
| 0 | `.sql` migration (hand-run): `account_id` on §3 tables, `app_config` PK, `accounts` seeded, heartbeat unique key | every existing query byte-identical (one account, every row `primary`) | 0.5 day |
| 1 | Brain: `ACCOUNT_ID` constant, scoped `db` helper for §3 tables, per-account `app_config` reads, grader/paper/executions scoped | **Kanaklata's `advisor_calibration_latest`, graded count, paper equity identical before vs after**; suite green | 1–1.5 days |
| 2 | Ops: watchdog iterates `accounts`; single Telegram poller with account-tagged callbacks; audit skill + VERIFY take an account | alerts labelled per account; one 409-free poller | 0.5–1 day |
| 3 | Dashboard toggle, per-account `/connect` + `TokenAlert` | toggle switches every advisor view; either-token paste works | 1 day |
| 4 | Natwar live: second Railway service, `accounts.is_active = true`, first token paste | his first official run lands; Kanaklata's numbers untouched | config |

**Total ≈ 3.5–5 days** (base plan said 8–11 sessions with trading in scope).
Each phase ships and reverts alone.

## 9. Prerequisites and open items

- **Sequencing:** start after the V-20 read (~11-16/17) and after [P-46].
- **[you]** Natwar's consent, his Kite user ID (label only), alert chat
  (same vs separate), whether he holds mutual funds.
- **[P-38] storage:** 232 MB / 500 MB. Advisor-only growth is
  `portfolio_advice` lite rows (~800–1,400/day per account) — a second
  account roughly doubles that. Measure for a week after phase 4; decide the
  tier before ~400 MB.
