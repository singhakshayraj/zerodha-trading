# Phase 2 — risk-based construction (P-68) — design

_2026-11-18. Operator approved Phase 2 ("yes for all") and delegated design calls; every choice below is Claude's unless marked._

## Intent

The risk layer (Ledoit–Wolf covariance, effective bets, HRP, correlation regime in `advisor_risk.py`) is today only printed as risk lines. Roadmap Phase 2 puts it to work, but the rule is that it only goes live after it proves itself:

- Target weights from HRP, capped by the household rules.
- Effective bets becomes a headline with a floor.
- Rotation sizing gets a risk-based alternative.
- The correlation regime sets how big a rebalance step is.
- A paper book (PICKING-RP) tests the whole thing against the real book and the Nifty 500.

## Goals / non-goals / anti-goals

- **Goals:**
  - One pure module computes capped HRP targets, drift, ENB now vs at target, the regime gate and per-row risk sizing.
  - The official advisor run stores it.
  - `/advisor` shows it.
  - A monthly-rebalanced paper book measures it.
- **Non-goals:**
  - Changing `verdict`, `trend_score`, `confidence`, `rotation_*`, `stop_level` or `exit_target`.
  - Placing orders.
  - Changing Natwar's preview.
- **Anti-goals:**
  - A target weight above a household cap.
  - A suggestion that silently replaces the ₹-freed rotation size.
  - A "risk" number computed on fewer than 31 aligned days of history.

## How (decided)

**`risk_targets.py` (brain, pure).** `build(positions, closes_by_symbol, sectors, caps)`:

1. **Inputs.** Equity and ETF positions with at least 31 aligned daily closes, using the same alignment and exclusion loop as `household_book.risk`. Names with less history are excluded and listed.
2. **Covariance.** `advisor_risk.ledoit_wolf_cov` on the 60-day returns, then raw HRP weights from `hierarchical_risk_parity`.
3. **Caps.** Applied iteratively until stable, at most 20 passes:
   - name ≤ `name_cap_pct` (8);
   - ETF sleeve ≤ `etf_cap_pct` (15);
   - sector ≤ `sector_cap_pct` (20), skipping `NOT_SECTORS`;
   - the excess is redistributed pro-rata to uncapped names.
4. **Output per name:** `{symbol, current_pct, target_pct, drift_pp, risk_pct}`, where `risk_pct` is the current risk contribution share.
5. **Effective bets:** `enb_now` (current weights) and `enb_target` (capped HRP), plus `enb_floor = 6` and `below_floor`.
6. **Regime:** take `sleeve_correlation_regime` with the largest sector as the sleeve.
   - `drifted` → `step = 0.25`;
   - otherwise `step = 0.5`;
   - no read → `step = 0.5`.

   The step is the fraction of the gap a monthly rebalance closes.
7. **Per sell-grade row** (`SELL`, `SELL_ON_BOUNCE`, `TRIM`): `risk_size = {target_pct, current_pct, sell_qty_to_target}`. Here `sell_qty_to_target` = whole shares that move the name `step` of the way from current to target, never more than held, and 0 if the name is at or below target.

**Wiring (official run only).** `portfolio_advisor.run_advisor` already gathers `closes_by_symbol` and calls `portfolio_risk`. After it does:
- call `risk_targets.build(...)`, non-fatal;
- write `app_config.risk_targets_latest` (JSON with `asof`);
- set `row['indicators']['risk_size']` on sell-grade rows;
- add one `kind: 'risk'` brief line when `below_floor`.

Verdict and rotation fields are not touched; a guard test deep-compares rows with the pass on and off.

**Paper book PICKING_RP.** A new book key in `advisor_paper`, using the same tables (`advisor_paper_positions`, `advisor_paper_equity`).
- **Seed:** cash = the primary book's equity + ETF value on the first run after ship, stored in `app_config.advisor_paper_seed_rp`.
- **Rebalance:** on the first official run of each calendar month (and at seed), close all RP positions at the last close, then open at `target_pct` × equity.
- **Costs:** each traded ₹ pays `costs.round_trip_cost_pct()/2` per side.
- **Marking:** marked daily like the other books.
- **Baseline:** the same seed cash in `NIFTY 500` from `index_bars` (price index; TRI unavailable, noted).
- Idempotent per run_date, like the other books.

**Dashboard.**
- `/advisor` gets a "Risk construction" card:
  - ENB now / target / floor, with a red line when below the floor;
  - the regime step;
  - the top 5 over-target and under-target names with drift;
  - as-of.
- The move-card detail shows `risk_size` next to the rotation size: "risk-based: sell N to reach X%".
- `/advisor/accountability` lists PICKING_RP alongside the existing books (if the page iterates books generically, no change).
- Ask `explain_call` appends `risk_size`.

## Constraints

- Python 3.9 locally.
- Paged reads.
- FakeSupabase tests.
- `next build` before the dashboard push, and Vercel READY.
- Synthetic fixtures only.
- Phone-width safe.
- Gate reading on 2027-03-31: PICKING_RP vs MANAGEMENT vs NIFTY 500. Nothing graduates to live sizing before that read and an explicit operator yes.

## Left to the builder

Copy, card layout, chart (none required), and the internal helper split.
