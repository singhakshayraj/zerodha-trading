# Multi-account advisor [P-45] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the advisor for a second Kite account (Natwar) beside Kanaklata in one Supabase DB, one brain image and one dashboard, with an account toggle, without changing a single number in Kanaklata's existing record.

**Architecture:** Every per-account table gets `account_id text not null default 'primary'`. The brain reads `ACCOUNT_ID` from the environment once at boot. All access to per-account tables goes through one choke point, `database.scoped(table)`, which adds the account filter to reads and tags writes. One Railway worker runs per account. The dashboard sends the selected account on every request (`x-account` header) and works out which account a pasted token belongs to from its Kite profile.

**Tech Stack:** Python 3 + supabase-py + pytest (brain, `~/Desktop/GITHUB/zerodha-brain`); Next.js 14 + supabase-js + zustand (dashboard, `~/Desktop/GITHUB/zerodha-trading`); Node 25 built-in test runner for the one pure TS helper (no new dependencies); hand-run SQL against Supabase `gilmuwmtdpjccibfhqtx`.

**Spec:** [specs/2026-11-09-multi-account-advisor-design.md](../specs/2026-11-09-multi-account-advisor-design.md). It builds on [plans/2026-08-26-multi-tenant.md](2026-08-26-multi-tenant.md); read both.

## Deviations from the spec (decided while mapping the code, 2026-11-09)

1. **No `'*'` global account in `app_config`.** Every key in the table today
   (20 keys, listed 11-09) is either per-account or used by exactly one
   process that is the `primary` worker or the watchdog: `advisor_bot_offset`
   (the poller is primary-only), `deploy_incident`, and trading-era keys. So
   these keys simply live under `'primary'`. This removes a `GLOBAL_KEYS` list
   that every caller would need to agree on.
2. **`/connect` has no account picker.** The connect route already fetches
   the Kite profile. It matches `profile.user_id` against a new
   `accounts.kite_user_id` column. A token can't be filed under the wrong
   account, and a token from an unregistered Kite account is refused.
3. **Constraint swap is split across two SQL files.** Today's writers upsert
   with `onConflict: "key"`, `book,snapshot_date` and so on. Postgres rejects
   `ON CONFLICT (key)` once `key` stops being unique by itself. So phase 0
   only *adds* the new account-scoped unique indexes beside the old ones.
   The old ones are dropped in `phase4_cutover.sql`, which runs only after
   the brain and the dashboard both write with the new conflict targets, and
   before Natwar's first row exists.

## Global Constraints

- **Freeze:** nothing merges to `main` or deploys before the V-20 n=400 read is done (~11-16/17) **and** `fix/grader-d3-d4` [P-46] is merged. Railway auto-deploys brain `main`; Vercel auto-deploys dashboard `main`.
- **Branches:** brain `feat/multi-account` is cut from `fix/grader-d3-d4` (stacked). Dashboard `feat/multi-account` is cut from `main`.
- **Prod SQL is never applied by an agent.** Every schema change is a `.sql` file in brain `scripts/` that the operator runs by hand in the Supabase SQL editor.
- Account ids: `primary` (label `Kanaklata`) and `natwar` (label `Natwar Raj Singh`). Format `^[a-z0-9_]{1,32}$`.
- Brain: `config.ACCOUNT_ID = os.getenv('ACCOUNT_ID', 'primary').strip() or 'primary'`.
- Per-account tables (exact set): `portfolio_advice`, `advisor_paper_positions`, `advisor_paper_equity`, `user_executions`, `holdings_snapshot`, `holding_scheme_map`, `brain_heartbeat`, `app_config`.
- Shared tables stay untouched: `stock_universe`, `candles`, `amfi_nav`, `news_events`, `stock_profile`, and every trading-era table.
- Never log a token. Never print `enc_token` values in tests or scripts.
- The V-20 read and its trial-ledger entry stay `primary`-only.
- Telegram: exactly one `getUpdates` poller, in the `primary` worker. Every digest names its account in the message text.
- Dashboard trading routes (`/api/trade/*`, `/trading`, `/api/sessions*`) are not touched.

## Review Focus

1. **Token pasted for an unregistered Kite account** → `/api/connect` returns 403 naming the Kite user id. Nothing is written. (Task 7 verify step.)
2. **Toggle to an account whose token is dead** → advisor views switch (they read the DB). The live-Kite `/portfolio` page must *not* silently show the other account's holdings. It shows a banner naming whose token is in use. (Task 8 step 4.)
3. **Legacy 4-part Telegram callbacks** (digests sent before the deploy) → recorded against `primary`, not rejected. (Task 4 test.)
4. **A tap for Natwar's call from Kanaklata's chat**, or the reverse → refused when the account's `telegram_chat_id` differs from the tap's chat. (Task 4 test.)
5. **Malformed `x-account` / `?account=`** (e.g. `primary' or 1=1`, empty string, 40 chars) → 400, never a silent fallback to `primary`. A silent fallback would render one account's data as another's. (Task 6 test.)

---

### Task 1: Schema SQL — phase 0, phase 0 rollback, phase 4 cutover

**Files:**
- Create: `zerodha-brain/scripts/multi_account_phase0_2026-11.sql`
- Create: `zerodha-brain/scripts/multi_account_phase0_rollback_2026-11.sql`
- Create: `zerodha-brain/scripts/multi_account_phase4_cutover_2026-11.sql`

**Interfaces:**
- Produces: column `account_id text not null default 'primary'` on all 8 per-account tables. Unique indexes `app_config_acct_key (account_id,key)`, `advisor_paper_equity_acct_book_date (account_id,book,snapshot_date)`, `user_executions_acct_natural_key (account_id,symbol,side,quantity,detected_at)`, `holdings_snapshot_acct_sid_ident (account_id,snapshot_id,identifier)`, `holding_scheme_map_acct_label (account_id,holding_label)`, `brain_heartbeat_acct (account_id)`. Table `accounts(account_id pk, label, is_active, kite_user_id, telegram_chat_id, created_at)`.

- [ ] **Step 1: Write phase 0.** Wrap it in one `begin; … commit;`. `add column if not exists` on each table. Each unique index above uses `create unique index if not exists`. Also add `(account_id, run_date)` on `portfolio_advice` and `(account_id, book, is_open)` on `advisor_paper_positions`. Not `CONCURRENTLY`: the largest table is ~MBs and `CONCURRENTLY` can't run inside a transaction. Then create `accounts` (spec §3 DDL plus `kite_user_id text unique`) and seed one row: `('primary','Kanaklata', true, :KANAKLATA_KITE_ID, null)`. Leave the literal `'REPLACE_ME'` for the id, with a comment that the operator fills it from the Kite profile. Finish with verification `select`s: per-table `count(*) filter (where account_id <> 'primary')` = 0, and that the `accounts` row exists.
- [ ] **Step 2: Write the rollback.** Drop the new indexes, drop the `accounts` table, and drop `account_id` from the 8 tables, all in one transaction. Header comment: only valid before the phase 4 cutover.
- [ ] **Step 3: Write the phase 4 cutover.** In one transaction:
  - drop the `app_config_pkey` constraint and add `primary key (account_id, key)`, then drop the now-redundant `app_config_acct_key`;
  - drop `advisor_paper_equity_book_snapshot_date_key`, `user_executions_natural_key`, `holdings_snapshot_snapshot_id_identifier_key` and `holding_scheme_map_holding_label_key`;
  - on `brain_heartbeat`: drop `brain_heartbeat_pkey`, then `alter column id drop default, drop not null`, then `add primary key (account_id)`;
  - `insert into accounts values ('natwar','Natwar Raj Singh', true, 'REPLACE_ME', null)`.
- [ ] **Step 4: Fill Kanaklata's Kite user id.** With a live token, from the brain repo, run `python3 -c "import kite_client as k; print(k.KiteClient(...).profile()['user_id'])"`, using whatever profile call `kite_client.py` exposes (check the file; never print the token). Put the value into phase 0 in place of `'REPLACE_ME'`. If no token is live, leave `REPLACE_ME` and add an operator checklist line at the top of the file.
- [ ] **Step 5: Commit**

```bash
git add scripts/multi_account_phase0_2026-11.sql scripts/multi_account_phase0_rollback_2026-11.sql scripts/multi_account_phase4_cutover_2026-11.sql
git commit -m "feat(db): multi-account phase 0 + cutover SQL (hand-run) [P-45]"
```

### Task 2: `ACCOUNT_ID` + `database.scoped()` + scoped config and heartbeat

**Files:**
- Modify: `zerodha-brain/config.py` (near `ADVISOR_TELEGRAM_CHAT_ID`, ~L659)
- Modify: `zerodha-brain/database.py:46-100` (config), `:149-162` (heartbeat)
- Test: `zerodha-brain/tests/test_account_scope.py` (new)

**Interfaces:**
- Produces:
  - `config.ACCOUNT_ID: str`
  - `database.ACCOUNT_TABLES: frozenset[str]` (the 8 tables)
  - `database.scoped(table: str, account_id: str | None = None) -> _Scoped`. `_Scoped.select(*a, **k)`, `.update(patch)` and `.delete()` return the underlying builder already filtered `.eq('account_id', acct)`. `.insert(rows, **k)` and `.upsert(rows, **k)` set `account_id` on every row (a dict or a list of dicts, copied, never mutated). `scoped()` raises `ValueError` for a table not in `ACCOUNT_TABLES`. It reads `supabase` at call time, so tests that `patch.object(database, 'supabase', …)` still intercept it.
  - `get_config_strict` / `write_config` keep their signatures. They now go through `scoped('app_config')`, and the upsert is `on_conflict='account_id,key'`.
  - `update_heartbeat` drops `'id': 1` from the payload and upserts `on_conflict='account_id'`.

- [ ] **Step 1: Write failing tests** in `tests/test_account_scope.py`. Use a recording fake: every builder method appends `(name, args, kwargs)` to a list and returns itself, and `execute()` returns an object with `.data = []`. Patch it in as `database.supabase`.
  - `test_scoped_select_filters_account`: `scoped('portfolio_advice').select('*').eq('x',1).execute()` records `('eq', ('account_id','primary'))` before `('eq', ('x',1))`.
  - `test_scoped_honours_env_account`: `monkeypatch.setattr(config, 'ACCOUNT_ID', 'natwar')` → filter value `'natwar'`.
  - `test_scoped_explicit_account_overrides`: `scoped('portfolio_advice', 'natwar')` while `ACCOUNT_ID='primary'` → `'natwar'`.
  - `test_scoped_insert_tags_rows_without_mutating`: insert `[{'a':1}]` → recorded payload `[{'a':1,'account_id':'primary'}]`, and the original list is unchanged.
  - `test_scoped_rejects_shared_table`: `pytest.raises(ValueError)` for `scoped('candles')`.
  - `test_write_config_upserts_on_account_key`: recorded upsert kwargs include `on_conflict='account_id,key'` and the payload has `account_id`.
  - `test_heartbeat_has_no_singleton_id`: payload has no `'id'` key, and `on_conflict='account_id'`.
- [ ] **Step 2: Run** `cd ~/Desktop/GITHUB/zerodha-brain && python3 -m pytest tests/test_account_scope.py -v`. Expected: FAIL (`AttributeError: scoped`).
- [ ] **Step 3: Implement** `ACCOUNT_ID`, `ACCOUNT_TABLES`, `_Scoped` and `scoped()` in `database.py`, and switch `get_config_strict`, `write_config` and `update_heartbeat` over to them.
- [ ] **Step 4: Run** the new file, then the full suite `python3 -m pytest -q`. Expected: all pass (baseline 983 on the parent branch). Fix any existing test that asserted the old heartbeat or config payload shape by updating the assertion, never by weakening it.
- [ ] **Step 5: Commit** `feat(brain): ACCOUNT_ID + scoped() choke point for per-account tables [P-45]`

### Task 3: Route every per-account call site through `scoped()` + guard test

**Files:**
- Modify: `zerodha-brain/db_stocks.py:62-131`, `db_paper.py` (all 6 fns), `db_records.py:323-651` (all `portfolio_advice`, `user_executions`, `holdings_snapshot`, `holding_scheme_map` calls)
- Test: `zerodha-brain/tests/test_account_scope.py` (extend)

**Interfaces:**
- Consumes: `database.scoped` (Task 2).
- Produces: `db.record_advice_decision(run_date, symbol, decision, account_id: str | None = None) -> bool`. When `account_id` is given it scopes to that account instead of `ACCOUNT_ID` (used by Task 4). All other public signatures are unchanged.

- [ ] **Step 1: Write the failing guard test** `test_no_raw_per_account_table_calls`. It scans every top-level `*.py` in the brain repo (not `tests/`, not `scripts/`) for the regex `table\(\s*['"](portfolio_advice|advisor_paper_positions|advisor_paper_equity|user_executions|holdings_snapshot|holding_scheme_map|brain_heartbeat|app_config)['"]`. It asserts the only hits are inside `database.py`'s `_Scoped`. `watchdog.py` is exempt (separate service with its own client, handled in Task 5). Assert it by listing it as an allowed file.
- [ ] **Step 2: Run it.** Expected: FAIL, listing the ~30 call sites from `db_stocks.py`, `db_paper.py` and `db_records.py`.
- [ ] **Step 3: Replace** each `database.supabase.table('<t>')` with `database.scoped('<t>')`. Update the conflict targets:
  - `upsert_paper_equity`: `on_conflict='account_id,book,snapshot_date'`
  - `insert_user_executions`: `on_conflict='account_id,symbol,side,quantity,detected_at'`

  Add the `account_id` parameter to `record_advice_decision`.
- [ ] **Step 4: Add behaviour tests:**
  - `test_record_decision_explicit_account`: `record_advice_decision('2026-11-10','NTPC','accept','natwar')` records `eq('account_id','natwar')`.
  - `test_paper_equity_conflict_target`: asserts the on_conflict string.
  - `test_grading_queue_is_scoped`: `db.get_unevaluated_advice('2026-11-10')` records the account filter. This is what keeps Kanaklata's V-20 queue clean.
- [ ] **Step 5: Run** `python3 -m pytest -q`. Expected: all pass.
- [ ] **Step 6: Commit** `feat(brain): scope advice/paper/executions/holdings queries by account [P-45]`

### Task 4: Telegram — account-tagged callbacks, single poller, labelled digests

**Files:**
- Modify: `zerodha-brain/advisor_digest.py:67-115`, `advisor_bot.py:52-147`, `database.py` (2 small reads)
- Test: `zerodha-brain/tests/test_advisor_decisions.py`, `tests/test_advisor_digest.py` (extend)

**Interfaces:**
- Consumes: `db.record_advice_decision(..., account_id)` (Task 3), `config.ACCOUNT_ID`.
- Produces:
  - `database.account_info(account_id: str) -> dict`: `{'label': str, 'telegram_chat_id': str}`. It reads the `accounts` table (shared, not scoped) and caches each account for the life of the process. On a missing row or an error it returns `{'label': account_id, 'telegram_chat_id': config.ADVISOR_TELEGRAM_CHAT_ID}`, and when the chat column is null the chat falls back to that config value too.
  - Callback format `adv|<account_id>|<run_date>|<symbol>|<accept|decline>`.
  - `advisor_bot.parse_callback(data) -> tuple[str, str, str, str] | None`, returning `(account_id, run_date, symbol, decision)`. A 4-part legacy payload maps to `account_id='primary'`.

- [ ] **Step 1: Write failing tests:**
  - `test_parse_callback_account`: `'adv|natwar|2026-11-10|NTPC|accept'` → `('natwar','2026-11-10','NTPC','accept')`.
  - `test_parse_callback_legacy_is_primary`: `'adv|2026-07-14|NTPC|accept'` → `('primary','2026-07-14','NTPC','accept')`.
  - `test_parse_callback_rejects_bad_account`: `'adv|Nat War|2026-11-10|NTPC|accept'` → `None`.
  - `test_handle_update_routes_to_account`: the tap is from natwar's chat, with `account_info` patched to give natwar that chat. `record_advice_decision` is called with `account_id='natwar'`.
  - `test_handle_update_refuses_cross_chat`: the tap is for `natwar` but comes from primary's chat, and the chats differ → not recorded, answered `'Not authorized.'`.
  - `test_bot_starts_only_on_primary`: with `ACCOUNT_ID='natwar'` and the creds and flags set, `start_advisor_bot()` returns `False` and starts no thread.
  - `test_digest_names_account`: the `build_digest` text starts with `[Kanaklata]`, and the keyboard `callback_data` starts with `adv|primary|`. Callback data stays at or below 64 bytes for the symbol `BAJAJ-AUTO` and account `natwar`.
- [ ] **Step 2: Run** `python3 -m pytest tests/test_advisor_decisions.py tests/test_advisor_digest.py -v`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `handle_update` authorises against `account_info(acct)['telegram_chat_id']` instead of the global chat, and the ack text includes the label.
  - `start_advisor_bot` returns `False` unless `config.ACCOUNT_ID == 'primary'`.
  - `send_daily_digest` sends to `account_info(ACCOUNT_ID)['telegram_chat_id']`, with the `[label]` prefix in `build_digest`.
  - Any other `send_message(..., config.ADVISOR_TELEGRAM_CHAT_ID, ...)` (scheduler.py ~L107) also uses the account chat and prefix.
- [ ] **Step 4: Run** the full suite. Expected: all pass. Existing tests that pinned the 4-part format are updated to the 5-part one.
- [ ] **Step 5: Commit** `feat(brain): account-tagged Telegram callbacks; single poller on primary [P-45]`

### Task 5: Watchdog iterates active accounts

**Files:**
- Modify: `zerodha-brain/watchdog.py:159-237`
- Test: `zerodha-brain/tests/test_watchdog.py` (extend)

**Interfaces:**
- Produces:
  - `watchdog.fetch_accounts(sb) -> list[dict]`: rows of `accounts where is_active`, falling back to `[{'account_id':'primary','label':'primary'}]` if the read fails.
  - `watchdog.fetch_state(sb, account_id: str = 'primary') -> dict`: heartbeat via `.eq('account_id', account_id)`, app_config via `.eq('account_id', account_id)`.
  - In `main()` each alert goes out as `send_alert(f"{key}@{account_id}", f"[{label}] {message}", tier=…)`. One-shot clears upsert `{'account_id': account_id, 'key': cfg_key, 'value': ''}` with `on_conflict='account_id,key'`.

- [ ] **Step 1: Write failing tests:**
  - `test_fetch_state_scopes_account`: the recording fake sees `eq('account_id','natwar')` on both reads.
  - `test_fetch_accounts_fallback_on_error`: the client raises → `[{'account_id':'primary','label':'primary'}]`.
  - `test_one_shot_clear_is_per_account`: one loop iteration with two accounts, where only natwar has `token_incident` set. Only natwar's row is cleared. Drive one iteration by extracting the loop body into `run_once(sb, now_ist)` and testing that.
- [ ] **Step 2: Run** `python3 -m pytest tests/test_watchdog.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement.** Extract `run_once(sb, now_ist)` from the `while` body, loop it over `fetch_accounts(sb)`, and leave `evaluate()` unchanged. The trading-era `trades_today` read stays unscoped.
- [ ] **Step 4: Run** the full suite. Expected: all pass.
- [ ] **Step 5: Commit** `feat(watchdog): per-account heartbeat/token alerts, labelled [P-45]`

### Task 6: Dashboard — account helper + scoped DB reads and writes

**Files:**
- Create: `zerodha-trading/lib/account.ts`, `zerodha-trading/lib/account.test.ts`
- Modify: `lib/db/index.ts:226-264`, `app/api/advisor/route.ts`, `app/api/advisor/track-record/route.ts`, `app/api/advisor/accountability/route.ts`, `app/api/advisor/lookup/route.ts`, `app/api/advisor/refresh/route.ts`

**Interfaces:**
- Produces:
  - `lib/account.ts` (no imports, so the Node runner can load it):
    - `export const DEFAULT_ACCOUNT = "primary"`
    - `export function parseAccount(raw: string | null | undefined): string | null`: `null`/`undefined` → `"primary"`; a value matching `^[a-z0-9_]{1,32}$` → that value; anything else, including `""`, → `null`.
    - `export function accountFrom(req: Request): string | null`: the `x-account` header, else the `?account=` search param, run through `parseAccount`.
  - `writeConfig(key, value, account = DEFAULT_ACCOUNT)` upserts `{account_id: account, key, value, updated_at}` with `onConflict: "account_id,key"`. `readConfig(key, account = DEFAULT_ACCOUNT)` adds `.eq("account_id", account)`. `getBrainHeartbeat(account = DEFAULT_ACCOUNT)` uses `.eq("account_id", account).maybeSingle()` in place of `.eq("id", 1).single()`.
  - Each listed route starts with `const account = accountFrom(req); if (!account) return NextResponse.json({ error: "invalid account" }, { status: 400 });`. Every query on a per-account table gains `.eq("account_id", account)`. The `stock_universe` reads in lookup stay unscoped. Every `app_config` upsert uses `{ account_id: account, … }, { onConflict: "account_id,key" }`. Routes with `GET()` change to `GET(req: Request)`.

- [ ] **Step 1: Write the failing test** `lib/account.test.ts`, with `node:test` + `node:assert/strict`:
  - `parseAccount(null) === "primary"` and `parseAccount("natwar") === "natwar"`
  - `null` for each of `""`, `"Natwar"`, `"primary' or 1=1"`, and `"a".repeat(33)`
  - `accountFrom(new Request("http://x/api?account=natwar")) === "natwar"`
  - the header wins over the query: `accountFrom(new Request("http://x/api?account=natwar", { headers: { "x-account": "primary" } })) === "primary"`
- [ ] **Step 2: Run** `cd ~/Desktop/GITHUB/zerodha-trading && node --test lib/account.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `lib/account.ts`, then apply the interface changes to `lib/db/index.ts` and the five routes.
- [ ] **Step 4: Verify.** `node --test lib/account.test.ts`: PASS. Then `npx tsc --noEmit`: 0 errors. Then `grep -nE 'from\("(portfolio_advice|advisor_paper_positions|advisor_paper_equity|user_executions|app_config)"\)' -A4 app/api/advisor` must show `account_id` on every hit.
- [ ] **Step 5: Commit** `feat(dashboard): account-scoped advisor routes + config helpers [P-45]`

### Task 7: Dashboard — accounts list, connect auto-detect, per-account token status

**Files:**
- Create: `zerodha-trading/app/api/accounts/route.ts`
- Modify: `app/api/connect/route.ts`, `app/api/connect/restore/route.ts`, `app/api/brain/status/route.ts`

**Interfaces:**
- Consumes: `accountFrom`, `parseAccount` and `writeConfig(…, account)` (Task 6).
- Produces:
  - `GET /api/accounts` → `{ accounts: { accountId: string; label: string }[] }`, from `accounts where is_active order by created_at`.
  - `POST /api/connect` → on success `{ success, profile, account: { accountId, label } }`. If `profile.user_id` matches no `accounts.kite_user_id`, it returns 403 `{ success:false, error:"Kite account <user_id> is not registered here" }` and writes nothing.
  - `GET /api/connect/restore?account=X` reads `X`'s token (default `primary`) and adds `account` to the response.
  - `GET /api/brain/status` keeps every existing field for the selected account (`accountFrom`). It adds `accounts: { accountId, label, tokenStale, tokenUpdatedAt }[]` for all active accounts. Staleness is computed with the existing 04:34 flush logic, extracted into a local `isStale(updatedAt)`.

- [ ] **Step 1: Implement** the four handlers to the interfaces above. Keep the `x-enc-token` requirement on `brain/status` unchanged.
- [ ] **Step 2: Verify.** `npx tsc --noEmit`: 0 errors. Then `npm run dev`, and with any valid token in `x-enc-token`:
  - `curl -s localhost:3000/api/accounts` → only `primary` before cutover.
  - `curl -s -H 'x-enc-token: x' 'localhost:3000/api/brain/status?account=bad%27'` → 400.
  - `POST /api/connect` with a token whose user id isn't in `accounts` → 403 and no change to `app_config.updated_at` (check with SQL). Do this only with the operator's own token, before `kite_user_id` is filled: that is the unregistered case.
- [ ] **Step 3: Commit** `feat(dashboard): /api/accounts, connect auto-detects account, per-account token status [P-45]`

### Task 8: Dashboard — toggle, per-account banner, request header

**Files:**
- Create: `zerodha-trading/components/AccountToggle.tsx`
- Modify: `lib/api.ts:10-18`, `components/TokenAlert.tsx`, `components/StockLookup.tsx:89,111,124`, `app/connect/page.tsx:52,254`, `app/portfolio/page.tsx`, `app/layout.tsx`

**Interfaces:**
- Consumes: `/api/accounts`, `/api/connect/restore?account=`, `brain/status.accounts` (Task 7).
- Produces:
  - localStorage keys `account` (selected; default `primary`) and `token_account` (which account the stored `enc_token` belongs to).
  - The `api` request interceptor sets `x-account` from `localStorage.account`. The raw `fetch` calls in StockLookup pass the same header.

- [ ] **Step 1: Build `AccountToggle`.** Render nothing when `/api/accounts` returns fewer than 2 accounts, so nothing changes until cutover. It's fixed top-right, mounted in `layout.tsx` beside `TokenAlert`. On switch:
  1. Set `localStorage.account`.
  2. Raw `fetch("/api/connect/restore?account=X")` (not `api`, to avoid the 401 logout interceptor).
  3. If it's OK, `setToken(token)` and set `token_account = X`.
  4. `location.reload()`.
- [ ] **Step 2: Update `TokenAlert`** to render `brain/status.accounts` as `Kanaklata ✅ · Natwar ⚠️ expired` whenever any account is stale. It still uses raw fetch and still skips `/connect`. With a single account, keep today's banner text.
- [ ] **Step 3: Update `/connect`.** After a successful POST, set `account` and `token_account` from `response.account`, and show the label ("Connected as Natwar Raj Singh"). The restore call on load uses `?account=${localStorage.account}`.
- [ ] **Step 4: Update `/portfolio`.** When `token_account` differs from `account`, show an inline notice: "Live Kite data below is <token_account label>'s — <account label>'s token is not live." Review Focus #2.
- [ ] **Step 5: Verify.** `npx tsc --noEmit` and `npm run build` both succeed. `npx playwright test e2e/smoke.spec.ts` passes. Manually, before cutover there's no toggle visible and `/advisor` is unchanged.
- [ ] **Step 6: Commit** `feat(dashboard): account toggle + per-account token banner [P-45]`

### Task 9: Docs, VERIFY rows, audit skill

**Files:**
- Modify: `zerodha-trading/docs/superpowers/specs/2026-11-09-multi-account-advisor-design.md` (§3 app_config table, §6 `/connect`, §8 phase 0: the three deviations), `docs/PIPELINE.md` (P-45 → In progress, with branch names), `docs/reference/VERIFY.md`, `.claude/skills/post-session-check/SKILL.md`, `docs/OPEN_ITEMS.md` (2.3)

- [ ] **Step 1: Add VERIFY rows.**
  - **V-21 parity:** before and after the phase 1 deploy, for `account_id='primary'`, these are byte-identical: graded count, `md5(advisor_calibration_latest)`, and the latest `advisor_paper_equity` per book. Exact SQL goes in the row.
  - **V-22:** Natwar's first official run lands with `account_id='natwar'` and Kanaklata's V-21 numbers are unchanged.
  - **V-20 note:** its query must filter `account_id='primary'`.
- [ ] **Step 2: Update the skill.** Every SQL block in the post-session-check skill gains `and account_id = :acct` (default `'primary'`), and the report runs once per active account.
- [ ] **Step 3: Commit + push the docs** (docs only, allowed during the freeze): `docs: P-45 implementation plan deviations + VERIFY V-21/V-22`

### Task 10: Rollout runbook (executed after V-20 + P-46; needs the operator)

No code. This is the order of operations, and each step is gated on the one before it.

- [ ] **1.** Snapshot the V-21 "before" numbers (SQL from Task 9).
- [ ] **2.** The operator runs `multi_account_phase0_2026-11.sql` and its verification `select`s return 0 / 1 row.
- [ ] **3.** Merge brain `feat/multi-account` → `main`. Railway deploys. Check the logs for `[advisor_bot] started` exactly once and no 409. Next trading day, V-21 "after" numbers equal "before".
- [ ] **4.** Merge dashboard `feat/multi-account` → `main`. Vercel deploys. `/advisor` is unchanged and no toggle is visible.
- [ ] **5.** The operator gives Natwar's consent, his Kite user id, his alert chat id (or "same"), and whether he holds MFs. Put the id into the cutover SQL. The operator runs `multi_account_phase4_cutover_2026-11.sql`.
- [ ] **6.** Create Railway service `zerodha-brain-natwar` from the same repo. Env: copy `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` and the advisor flags from `zerodha-brain`, plus `ACCOUNT_ID=natwar`. The operator sets `ADVISOR_TELEGRAM_BOT_TOKEN` themselves. Do **not** set `KITE_*`.
- [ ] **7.** The operator pastes Natwar's token on `/connect`, which detects the account. His first official run lands, closing V-22.
