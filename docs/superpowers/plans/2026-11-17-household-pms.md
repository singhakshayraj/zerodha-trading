# Household portfolio manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/household` — one page for both accounts: net worth, true returns vs benchmark, X-ray vs targets, risk, tax, rebalance list, ledger.

**Architecture:** brain `household_book.py` (pure builders + one `publish()` that reads the DB and writes `app_config.household_book_latest`), scheduled after reconcile and after the official run; dashboard API + page render the JSON; Ask tool reads it.

**Tech Stack:** Python 3.11 brain (supabase-py, numpy, FakeSupabase tests); Next.js 14 dashboard (TypeScript, Tailwind, Playwright).

**Spec:** [2026-11-17-household-pms-design.md](../specs/2026-11-17-household-pms-design.md)

## Global Constraints

- Read-only on positions and verdicts: `household_book.py` never writes anything except `app_config.household_book_latest` and (first run only) `app_config.household_targets` defaults.
- Default targets: sector ≤ 20%, name ≤ 8%, both-account name ≤ 3%, ETF/gold sleeve ≤ 15%, size mix = Nifty 500's size mix ± 10pp; stored with `"source": "default"`.
- TWR from `pnl_daily` (`r_t = pnl_t / value_open_t`, skip `value_open_t <= 0`); benchmark from `nifty_pnl_t / value_open_t`; XIRR from tradebook flows + current value, `xirr_partial` flagged.
- Every section carries `asof`. Every multi-row read paged. Phone width safe. `next build` ✓ before push.

## Review Focus

1. A day with a large deposit (buy) must not show as a gain in TWR. (T1)
2. XIRR on flows that never change sign → `None`, not an exception. (T1)
3. A sector bucket that is not a sector ('Outside Nifty 500', ETFs) is never flagged against the sector cap. (T2)
4. A name held in both accounts is counted once in name weight and flagged against the 3% overlap cap. (T2)
5. A rebalance trim never sells more than held, and picks the lowest-tax lots/account. (T3)

---

### Task 1: returns + net worth (`household_book.py`, pure part 1)

**Files:** Create `household_book.py`, `tests/test_household_book.py`.

**Interfaces — Produces:**
- `twr(daily: list[{date, pnl, value_open}]) -> dict` → `{'1m', '3m', 'since', 'start', 'series': [{date, index}]}` (index starts at 100);
- `benchmark_twr(daily)` (same, from `nifty_pnl`);
- `xirr(flows: list[(date_str, amount)]) -> float | None` (annualised %, Newton with bisection fallback, `None` if no sign change);
- `max_drawdown(series) -> {'pct', 'peak', 'trough'}`;
- `net_worth(positions) -> {'total', 'by_account', 'by_asset_class'}`.

- [ ] Failing tests:
  - `test_twr_ignores_deposits` (day 2 has a ₹1L buy and 0 pnl → index unchanged);
  - `test_twr_chains_returns`;
  - `test_benchmark_from_nifty_pnl`;
  - `test_xirr_known_value` (−10000 on 2025-01-01, +11000 on 2026-01-01 → 10.0 ± 0.05);
  - `test_xirr_no_sign_change_is_none`;
  - `test_max_drawdown`;
  - `test_net_worth_by_account_and_class`.
- [ ] RED → implement → GREEN; full suite; commit `feat(household): returns, drawdown, net worth [household PMS]`.

### Task 2: X-ray, targets, drift, risk, tax (`household_book.py`, pure part 2)

**Files:** Modify `household_book.py`, `tests/test_household_book.py`.

**Interfaces — Produces:**
- `DEFAULT_TARGETS` dict;
- `xray(positions, sectors, sizes, index_weights) -> {'sectors': [{name, pct, index_pct, target_pct, drift_pp, breach}], 'sizes': [...], 'names': [{symbol, pct, accounts, breach}], 'etf_pct'}`;
- `risk(positions, closes_by_symbol) -> {'effective_bets', 'top_contributors': [{symbol, risk_pct, value_pct}], 'clusters': [...], 'n_used'}` via `advisor_risk.ledoit_wolf_cov` / `risk_contributions` / `effective_number_of_bets` / `_correlation_read`;
- `tax_summary(positions, lots_by_account, fy_by_account, today) -> {'fy_realised', 'unrealised_stcg', 'unrealised_ltcg', 'ltcg_calendar': [{symbol, account, date, qty}], 'harvest': [{symbol, account, loss_inr}]}` using `costs.after_tax_pct` at last price.

- [ ] Failing tests:
  - `test_not_sectors_never_breach` (Review Focus 3);
  - `test_overlap_name_counted_once_and_flagged` (Review Focus 4);
  - `test_size_drift_vs_index_mix`;
  - `test_risk_effective_bets_two_identical_names_is_one`;
  - `test_tax_summary_splits_lots_and_lists_crossings_90d`.
- [ ] RED → GREEN; full suite; commit `feat(household): x-ray vs targets, risk, tax summary [household PMS]`.

### Task 3: rebalance list + `publish()` + scheduling

**Files:** Modify `household_book.py`, `scheduler.py`; tests `tests/test_household_book.py`, `tests/test_household_publish.py`.

**Interfaces — Produces:**
- `rebalance(xray_out, positions, lots_by_account, fy_by_account, targets, today) -> [{kind: 'trim', symbol, account, qty, freed_inr, tax_inr, cost_inr, reason}] + [{kind: 'underweight', sector, gap_pp}]`;
- `publish(today=None) -> dict`: reads positions (paged), `pnl_daily`, `tradebook`, `pnl_statements` via `tax_context.context_for` per account, `candles` closes, `household_targets` (writes defaults on first run with `"source": "default"`), builds every section with `asof`, writes `app_config.household_book_latest`.
- `scheduler.py`: call `household_book.publish()` non-fatally after `_reconcile_all()` and after the official advisor run completes.

- [ ] Failing tests:
  - `test_trim_brings_breach_inside_target_whole_shares`;
  - `test_trim_never_exceeds_held` (Review Focus 5);
  - `test_trim_prefers_lowest_tax_lots`;
  - `test_publish_writes_book_and_default_targets` (FakeSupabase with synthetic rows: 2 accounts, pnl_daily 5 days, tradebook, statements);
  - `test_publish_keeps_operator_targets`.
- [ ] RED → GREEN; full suite; commit `feat(household): rebalance list, publish + schedule [household PMS]`.
- [ ] Run `python3 -c "import household_book; household_book.publish()"` once against prod (read + the two app_config writes) and record the headline numbers in the report.

### Task 4: dashboard `/household` + Ask tool

**Files:**
- Create `app/api/household/route.ts`, `app/household/page.tsx`, `e2e/household.spec.ts`.
- Modify `components/layout/Sidebar.tsx`, `lib/ask/tools.ts` (+ `lib/ask/agent.ts` route example).

**Interfaces:**
- API returns `{book, targets, ledger: tradebook rows (both accounts, latest 200: account, symbol, trade_type, quantity, price, trade_date)}`.
- Ask tool `household` → summary `"Household ₹X; since <start> TWR ±a% vs Nifty-equivalent ±b%; N breaches; effective bets k."`

- [ ] e2e first (mocked API, synthetic numbers): header total; returns table + chart present; one sector breach shown red; rebalance row text; ledger filter by account; funds placeholder text "3 funds unconfirmed". RED → implement → `tsc`, e2e, `next build` ✓; commit `feat(household): /household page + Ask tool [household PMS]`.

### Task 5: docs + checks

**Files:** `docs/PIPELINE.md` (new `[P-69] Household portfolio manager` entry, done), `docs/STATUS.md` block, `docs/reference/VERIFY.md` V-42 (`household_book_latest.asof` = today after reconcile; returns section non-empty; total ≈ sum of both accounts' latest `pnl_daily.value_close` within 1%), `docs/README.md` index line.

- [ ] Write; commit `docs: P-69 household portfolio manager shipped; V-42`.

---

## Self-review

- Spec → tasks:
  - ranked items 1–2 → T1;
  - items 3–5 → T2;
  - item 6 + scheduling → T3;
  - page + item 7 ledger + funds placeholder → T4;
  - docs → T5.
  - Dividends: deferred per spec.
- Interfaces: T3 consumes T1/T2 builders; T4 consumes the `publish()` JSON (field names from T1–T3 Produces).
- Review Focus 1–5 pinned to T1/T1/T2/T2/T3 tests. ✔
