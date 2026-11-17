# Tax-aware actions (Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every SELL-grade verdict carries a tax-aware action (sell now / sell after the LTCG date), its marginal FY tax and cost of waiting, on the card, the brief and the digest — with the verdict itself untouched.

**Architecture:** one pure module `tax_actions.py` (FY marginal tax, wait rule, text) fed by `costs.py`, a thin `tax_context.py` for DB reads (lots, FY realised, cost curve, ADV), attached as `indicators.tax` in `run_advisor` / `account_preview` after rotation sizing; brief + digest add one line each; dashboard renders the JSON; a replay script writes the counterfactual.

**Tech Stack:** Python 3.11 brain, supabase-py, FakeSupabase tests; Next.js dashboard; Playwright.

**Spec:** [2026-11-17-tax-aware-actions-design.md](../specs/2026-11-17-tax-aware-actions-design.md)

## Global Constraints

- `verdict`, `trend_score`, `confidence`, `rotation_*`, `stop_level`, `exit_target` byte-identical with the tax pass on/off (Task 3 test).
- Wait cap 60 trading days; undated lots short-term and flagged; curve `n < 20` → no wait advice.
- Constants from `costs.py` only. Brought-forward prior-FY losses not counted (documented).
- Brain `pytest -q` green before push; dashboard `npx next build` ✓ + e2e before push; Vercel READY.

## Review Focus

1. A SELL on a name entirely underwater must never say "sell after" (no gain → no tax → no saving). (T1)
2. FY shield larger than the gain → `tax_now = 0` and the text names the shield. (T1)
3. A TRIM sells half: tax and LTCG date computed on the half, FIFO from the oldest lot. (T1)
4. Natwar with no `pnl_statements` row → `fy_known=False`, text says "FY realised unknown". (T2)
5. Card/brief/digest unchanged for HOLD rows except the LTCG date. (T3/T4)

---

### Task 1: `tax_actions.py` — marginal FY tax + wait rule (pure)

**Files:** Create `tax_actions.py`, `tests/test_tax_actions.py`.

**Interfaces:**
- Consumes: `costs.tax_lots`, `costs.after_tax_pct`, `costs.round_trip_cost_pct`, constants.
- Produces: `fy_tax(stcg: float, ltcg: float, ctx: dict) -> float` with `ctx = {ytd_net_realised_inr, ltcg_used_fy, fy_known}`;
  `expected_drop_pct(curve: dict, days: int) -> float | None` with `curve = {'5': {'n', 'mean_ret_pct'}, '10': …, '60': …}`;
  `plan(row: dict, lots: list, ctx: dict, curve: dict, today: str, adv_inr: float | None, trading_days: callable) -> dict | None` → `{action, ltcg_date, wait_days, tax_now_inr, tax_after_inr, saving_inr, wait_cost_inr, cost_inr, lots, unmatched_qty, harvest_inr, harvest_note, text}`; `None` for rows with `quantity == 0`.
  `WAIT_CAP_DAYS = 60`, `CURVE_MIN_N = 20`, `SELL_GRADES = ('SELL', 'SELL_ON_BOUNCE', 'TRIM')`.

- [ ] Step 1: failing tests — `test_fy_shield_zeroes_tax_and_names_it` (ytd −47,479, gain 30,000 → tax 0, text contains "FY loss shield ₹47,479"), `test_wait_when_saving_beats_drift` (lot 2025-12-20, today 2026-11-17, gain ₹60,000 on ₹2 L, ytd 0, curve 40d mean −1.0 → "sell after 2026-12-21"), `test_no_wait_when_underwater`, `test_trim_sells_half_fifo`, `test_unknown_lots_flagged_short_term` (unmatched 40 of 100 → `lots == 'partial'`, no `ltcg_date` for those), `test_curve_thin_means_no_wait` (n=12 → `action == 'sell now'`, text has "not enough history").
- [ ] Step 2: `pytest tests/test_tax_actions.py -q` → Expected: FAIL `ModuleNotFoundError`.
- [ ] Step 3: implement. `trading_days(a, b)` injected (tests pass a weekday counter); production passes `data_jobs` NSE-holiday-aware counter.
- [ ] Step 4: → 6 passed. Step 5: commit `feat(tax): marginal FY tax + wait rule [P-68 phase 1]`.

### Task 2: `tax_context.py` — lots, FY realised, cost curve, ADV

**Files:** Create `tax_context.py`, `tests/test_tax_context.py`; modify `call_lessons.py` (`compute()` also writes `app_config.tax_cost_curve`), `tests/test_call_lessons.py`.

**Interfaces:**
- Produces: `cost_curve(stored_rows_by_call, calls) -> dict` (pure; SELL-grade `advice` calls, `mean(ret_pct)` and `n` at each checkpoint) and `call_lessons.compute()` writes it as `tax_cost_curve`;
  `context_for(account: str, today: str) -> dict` → `{lots_by_symbol, fy: {ytd_net_realised_inr, ltcg_used_fy, fy_known}, curve, adv_by_symbol}` reading `tradebook`, `pnl_statements` (row whose `period_from` = this FY's Apr 1 for the account), `app_config.tax_cost_curve`, 20-day `candles` close×volume.
- [ ] Step 1: failing tests — `test_cost_curve_from_outcomes`, `test_context_unknown_fy_for_natwar` (Review Focus 4), `test_context_fy_from_statement` (primary → −47,479 from a fixture row).
- [ ] Steps 2–4: RED → GREEN. Step 5: commit `feat(tax): context reads + daily cost curve [P-68 phase 1]`.

### Task 3: attach to rows; brief + digest lines; verdict guard

**Files:** Modify `portfolio_advisor.py` (after the rotation pass, before `target_dd`: `tax_actions.attach(rows, ctx, today)` non-fatal), `account_preview.py` (same for Natwar), `morning_brief.py` (`kind: 'tax'` line: waits + names crossing 12 months within 30 days), `advisor_digest.py` (`🧾` line), tests for each (`tests/test_tax_attach.py`, `tests/test_morning_brief.py`, `tests/test_advisor_digest.py`).

**Interfaces:** `tax_actions.attach(rows: list, ctx: dict, today: str) -> int` sets `row['indicators']['tax']` and appends `text` to `row['reasons']`; returns rows touched.

- [ ] Step 1: failing tests — `test_attach_sets_indicators_tax_and_reason`, `test_verdict_and_rotation_untouched` (deep-compare rows minus `indicators.tax`/`reasons` with attach on vs off — Global Constraint), `test_brief_tax_line`, `test_digest_tax_line`, `test_hold_rows_only_get_ltcg_date`.
- [ ] Steps 2–4: RED → GREEN; `pytest -q` whole suite. Step 5: commit `feat(advisor): tax-aware action on every sell-grade row; brief + digest lines [P-68 phase 1]`.
- [ ] Step 6: run the official advisor path locally against prod read-only? No — wait for the 09:45 run; verify `indicators.tax` on the next day's rows (VERIFY row V-40).

### Task 4: dashboard — card chip + detail line

**Files:** Modify `app/advisor/page.tsx` (type `Tax`, chip on the move card: `after tax: sell now · ₹0` / `sell after 2027-01-07 · saves ₹4.5k`; detail sheet line with the full text + lots status), `e2e/advisor.spec.ts` (fixture gains `indicators.tax`; asserts chip text), `lib/ask/tools.ts` (`explain_call` summary appends the tax text when present).

- [ ] Step 1: e2e assertion added first and seen failing. Step 2: implement. Step 3: `npx tsc --noEmit`, e2e, `npx next build`. Step 4: commit `feat(advisor): tax-aware action on move cards [P-68 phase 1]`, push, confirm Vercel READY.

### Task 5: replay + docs

**Files:** Create `scripts/tax_replay.py`, `tests/test_tax_replay.py` (pure summariser), `docs/reference/TAX_REPLAY.md`; modify `docs/PIPELINE.md` (P-68 Phase 1 line), `docs/reference/VERIFY.md` (V-40 `indicators.tax` daily; V-41 replay net ≥ 0 monthly), `docs/STATUS.md`.

**Interfaces:** `tax_replay.summarise(decisions: list) -> dict` → `{calls, told_to_wait, tax_saved_inr, drift_paid_inr, net_inr, net_pct}`; script loads official SELL-grade calls since 2026-08-25 with today's lots/FY context, applies `tax_actions.plan` as of each call date, prices the wait with `call_outcomes` paths.

- [ ] Step 1: failing `test_summarise_nets_tax_against_drift`. Steps 2–4: RED → GREEN. Step 5: run the script, write TAX_REPLAY.md with the numbers; commit `feat(tax): replay of the rule over P-60 calls + docs [P-68 phase 1]`.

---

## Self-review

- Spec → tasks: marginal FY tax, wait rule, lots/flags (T1); FY/ADV/curve reads (T2); attach + brief + digest + guard (T3); card (T4); replay + gate (T5). ✔
- Interfaces: `plan()` consumed by `attach()`; `cost_curve` produced by T2 and read via `app_config` in T2's `context_for`; `summarise` standalone. ✔
- Review Focus 1–5 pinned to T1/T1/T1/T2/T3–T4 tests. ✔
