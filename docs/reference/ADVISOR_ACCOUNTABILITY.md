# Advisor Accountability System — spec

**Goal (user, 2026-08-05):** paper-trade the advisor's every verdict, store the
outcomes, and build a feedback loop that measures wins/losses per verdict so we
can improve the advisor on evidence (VISION §7 — change on evidence, never by
hand). This is [P-14] (parked 2026-07-28) re-raised + scoped.

Scope (user-chosen): **phased**, tracking **everything** — holdings verdicts
(HOLD/SELL/TRIM) + rotation calls (sell weak → buy stronger) + the Nifty-500
rotation-candidate scan.

---

## What already exists (do NOT rebuild)

The advisor already has a **per-call grading loop**:
- **Storage:** every verdict → `portfolio_advice` (`verdict`, `confidence`,
  `trend_score`, 7-factor `indicators`, `rotation_*`, `is_official`, `run_id`).
- **Grading:** `advisor_backtest.run_backtest_pass(md)` walks each row forward its
  horizon (MICRO 10 / MACRO 30 trading days) through daily candles and stamps
  `outcome_correct`, `outcome_return_pct`, `outcome_vs_nifty_pct` (alpha).
- **Feedback:** `get_track_record_summary` (hit-rate, by-verdict, advice-value ₹),
  `factor_attribution` (which of 7 factors separate wins from losses),
  `calibration_curve` (confidence→hit reliability). Surfaced on `/advisor` via
  `api/advisor/track-record`; CLI `scripts/grade_advice.py`.

**Gap 1 — grading starves.** Of 200 official rows: 24 graded, **38 matured but
never graded**, 138 not-yet-due. Root cause is *date-specific*: the 07-12 batch
graded once (~07-24); later-maturing rows (07-13/07-14 …) were never retried
because grading only fired in the once/day official-advisor branch, on days a
token happened to be live, and per-row/pass failures are swallowed "non-fatal".

**Gap 2 — no managed paper-portfolio.** Grading judges each call in isolation
(alpha vs Nifty). There is no virtual book that *acts* on verdicts and tracks one
running equity curve + cumulative wins/losses vs a do-nothing baseline — the
single "did the advisor add value?" number the user is asking for.

---

## Phase 1 — make grading reliable (foundation)

The paper-portfolio is only as good as the outcome data feeding it; fix grading first.

1. **Always-run + catch-up.** Call `run_backtest_pass` on every **session start**
   (token guaranteed live) in addition to the official-advisor branch. Each pass
   already re-queries *all* currently-due unevaluated rows, so one reliable pass
   drains the whole backlog.
2. **Loud diagnostics.** Log `due=N graded=M skipped=K` + per-row skip reason
   (was silently "non-fatal"), so starvation is visible in logs, not inferred.
3. **Backfill.** The first live-token pass after deploy grades all 38 matured rows.
4. **Done =** no matured-but-ungraded row older than 1 trading day; graded count
   jumps from 24 → all-matured; verified next session.

## Phase 2 — managed paper-portfolio (the capture the user wants now)

New, advisory-only, zero real orders (mirrors `paper_broker`).

**Tables:**
- `advisor_paper_positions` — one row per virtual position: `symbol`, `source`
  (HOLDING | ROTATION | SCAN), `source_advice_id`, `verdict`, `qty`, `entry_price`,
  `entry_date`, `exit_price`, `exit_date`, `exit_reason`, `pnl`, `return_pct`,
  `is_open`.
- `advisor_paper_equity` — daily snapshot: `date`, `cash`, `positions_value`,
  `total_equity`, `baseline_equity` (do-nothing clone), `nifty_level`.

**Engine (`advisor_paper.py`):**
- Seed at a start date: virtual book = the real holdings snapshot; a frozen
  `baseline` clone = same holdings never touched (the do-nothing counterfactual).
- On each **official** advisor run, apply verdicts: SELL → close, TRIM → halve,
  HOLD → keep, ROTATION buy → open from freed cash, SCAN buy calls → open (capped
  single-name sizing).
- Daily **mark-to-market** via candles/`market_data`; write an equity snapshot for
  the book, the baseline, and Nifty.
- On each close, book a win/loss (pnl, return, vs entry, vs baseline hold).
- **Done =** equity curve accrues daily; every verdict maps to a paper action;
  wins/losses queryable by source + verdict type.

## Phase 3 — accountability dashboard (feedback surface; "later")

`/advisor/accountability` + API: equity curve (advisor vs do-nothing vs Nifty),
cumulative win/loss record, win-rate by verdict + by source, biggest wins/losses,
open paper positions, and the existing factor-attribution reused. Lightweight
first; deepen once Phase 2 data accrues.

## Guardrails
- Advisory-only; no real orders ever. Ship DARK (VISION §7) — **no advisor
  reweighting** until the record is statistically real (≥~50 graded, monotonic).
- Tests each phase; CI-gated; brain via `deploy.sh`; dashboard auto-deploys.
- All new writes RLS service-role-only (matches existing sensitive tables).
</content>
</invoke>
