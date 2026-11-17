# Risk-based construction (Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** capped HRP targets, ENB headline, regime-gated step, shadow risk sizing on sell-grade rows, and a monthly PICKING_RP paper book — verdicts untouched.

**Architecture:** pure `risk_targets.py` → wired into the official `run_advisor` pass (app_config + indicators) → paper book in `advisor_paper` → dashboard card + Ask.

**Tech Stack:** Python 3.11 brain (numpy, scipy, FakeSupabase); Next.js 14 dashboard (Playwright).

**Spec:** [2026-11-18-risk-construction-design.md](../specs/2026-11-18-risk-construction-design.md)

## Global Constraints

- `verdict`, `trend_score`, `confidence`, `rotation_*`, `stop_level`, `exit_target` byte-identical with the risk pass on/off (Task 2 guard test).
- Caps from `household_book.DEFAULT_TARGETS` (name 8, sector 20, ETF 15); `NOT_SECTORS` never sector-capped; `ENB_FLOOR = 6`; `STEP_CALM = 0.5`, `STEP_DRIFTED = 0.25`; ≥ 31 aligned closes.
- Brain `pytest -q` green before each push; dashboard `next build` ✓ + e2e; Vercel READY.

## Review Focus

1. Caps that interact (a capped name in a capped sector) still end with every weight ≤ its cap and weights summing to 100 ± 0.01. (T1)
2. A name below target never gets a positive `sell_qty_to_target`; never more than held. (T1)
3. Fewer than 2 usable names → `build` returns `{'targets': [], 'enb_now': None, ...}` without raising. (T1)
4. The paper book rebalances once per calendar month, not every run; re-runs on the same date change nothing. (T3)
5. A missing `risk_targets_latest` leaves `/advisor` rendering without the card, no crash. (T4)

---

### Task 1: `risk_targets.py` (pure)

**Files:** Create `risk_targets.py`, `tests/test_risk_targets.py`.

**Interfaces — Produces:**
- `build(positions, closes_by_symbol, sectors, caps=None) -> dict`, where `positions = [{symbol, quantity, last_price, asset_class}]`. Returns `{asof_close, targets: [{symbol, current_pct, target_pct, drift_pp, risk_pct}], excluded: [..], enb_now, enb_target, enb_floor, below_floor, regime: {drifted, corr_full, corr_recent}|None, step}`.
- `cap_weights(w: dict, groups: dict, caps: dict) -> (dict, list)`, where `groups = {symbol: (sector_group, is_etf)}`. It returns the capped weights (sum 1.0) plus `infeasible`, the caps that cannot all hold. Example: 3 names in total can never all fit under an 8% name cap. When a cap is infeasible it is left unenforced and named; `build` copies the list to `caps_infeasible`.
- `sell_qty_to_target(qty, price, current_pct, target_pct, book_value, step) -> int`.

- [ ] Failing tests:
  - `test_caps_hold_and_sum_to_100`: 20 names across 4 sectors, raw weights skewed (one name 30%, one sector 50%) → every name ≤ 8, every capped sector ≤ 20, the ETF sleeve ≤ 15, sum 100 ± 0.01, `infeasible == []`.
  - `test_infeasible_caps_named_not_enforced`: 3 names → the name cap is infeasible; the result still sums to 100 and `'name' in infeasible`.
  - `test_not_sector_bucket_uncapped`.
  - `test_etf_sleeve_capped_15`.
  - `test_sell_qty_never_exceeds_held_or_goes_negative`.
  - `test_build_two_identical_names_enb_one`.
  - `test_build_too_few_names_returns_empty`.
  - `test_step_halves_when_regime_drifted`.
- [ ] RED → implement → GREEN; full suite; commit `feat(risk): capped HRP targets, ENB floor, regime step [P-68 phase 2]`.

### Task 2: wire into the official advisor run

**Files:** Modify `portfolio_advisor.py` (after `portfolio_risk`, non-fatal), `morning_brief.py` (one `kind: 'risk'` line when `below_floor`); tests `tests/test_risk_targets_wiring.py`, `tests/test_morning_brief.py`.

**Interfaces:** writes `app_config.risk_targets_latest = {asof, ...build()}`; sets `row['indicators']['risk_size'] = {target_pct, current_pct, sell_qty_to_target}` on rows whose `verdict in ('SELL','SELL_ON_BOUNCE','TRIM')` and whose symbol has a target.

- [ ] Failing tests:
  - `test_risk_pass_leaves_verdict_and_rotation_identical` (Global Constraint);
  - `test_risk_size_on_sell_grade_rows_only`;
  - `test_risk_pass_failure_is_non_fatal`;
  - `test_brief_risk_line_below_floor`.
- [ ] RED → GREEN; full suite; commit `feat(advisor): risk targets on the official run; shadow risk sizing [P-68 phase 2]`.

### Task 3: PICKING_RP paper book

**Files:** Modify `advisor_paper.py` (book `PICKING_RP`, seed key `advisor_paper_seed_rp`, monthly rebalance, NIFTY 500 baseline from `index_bars`); tests `tests/test_advisor_paper_rp.py`.

- [ ] Failing tests:
  - `test_rp_seeds_once_with_book_value`;
  - `test_rp_rebalances_first_run_of_month_only`;
  - `test_rp_same_date_rerun_is_noop`;
  - `test_rp_pays_cost_each_side`;
  - `test_rp_baseline_nifty500`.
- [ ] RED → GREEN; full suite; commit `feat(paper): PICKING_RP book rebalanced monthly to capped HRP [P-68 phase 2]`.

### Task 4: dashboard + Ask

**Files:**
- Modify `app/api/advisor/...` (or the existing advisor API route) to return `risk_targets_latest`; `app/advisor/page.tsx` (Risk construction card + `risk_size` line on the move-card detail); `lib/ask/tools.ts` (`explain_call` appends risk_size).
- Check `/advisor/accountability` lists PICKING_RP (if books are hard-coded, add it).
- `e2e/advisor.spec.ts`.

- [ ] e2e first (mocked): card shows ENB now/target/floor and a below-floor line; top over/under rows; the card is absent when the key is missing; move-card shows "risk-based: sell N". RED → implement → `tsc`, e2e, `next build` ✓; commit `feat(advisor): risk construction card + shadow sizing [P-68 phase 2]`.

### Task 5: docs + checks

**Files:** `docs/PIPELINE.md` (P-68 phase 2 line), `docs/STATUS.md`, `docs/reference/VERIFY.md` V-44:
- `risk_targets_latest.asof` = the last official run date;
- targets sum 100 ± 0.01, none above a cap;
- PICKING_RP has an equity row per official run date and position rows dated on the first run of the month.

- [ ] Write; commit `docs: P-68 phase 2 risk construction shipped; V-44`.
