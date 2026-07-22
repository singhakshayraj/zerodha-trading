# UI God-Mode Plan

Decision-support UI gaps found in the 2026-07-23 full-app scan. The app is
already well-built (dense, consistent dark theme; `/insights` is strong).
These are not cosmetic — each surfaces a number the system is built around
but currently hides. Ordered by build sequence (dependency-aware), not just
value.

Status legend: ⬜ not started · 🔨 in progress · ✅ done

---

## Task 2 — Profit Factor + Max Drawdown on `/insights` ✅ DONE 2026-07-23
Shipped: PF + max-drawdown (R and ₹) tiles in the "Is this working?" strip,
colour-coded to the go/kill thresholds, with a PF finding. Verified against
live data (PF 0.33, max DD 55.5R / ₹3,343 — the paper strategy is honestly a
losing edge so far, which is what the page is for). Below is the original spec.

**The literal go/no-go metrics are missing.** VISION §6.1 gates real money on
**profit factor** (>1.3 go / <1.1 kill) and **max drawdown** (<10% go / >15%
kill). `/insights` computes expectancy + win rate but not these two — it
answers "is this working?" without the numbers that define the answer. Both
derive from trade data already loaded. Smallest change, highest signal-per-
effort → built first.

- Compute PF = gross profit ÷ gross loss (net of costs) and max drawdown
  (largest peak-to-trough of the cumulative-P&L curve, already plotted).
- Surface both in the "Is this working?" strip, with the go/kill thresholds
  as context and the small-sample caveat honored (n shown; no verdict at low n).

## Task 1 — Live risk gauges on `/trading` ✅ DONE 2026-07-23
Shipped as `components/RiskMeter.tsx` (reusable — Task 3 will reuse it): one
horizontal track from the −maxLoss% hard floor to the +maxProfit% ceiling,
with the 3R operational stop and zero marked and the live session P&L as a
marker + headline ("₹X before the hard floor" / "past the 3R stop" / "₹X
before the ceiling"). Wired into `/trading` below the status bar. Math
hand-verified across loss/profit/zero; typecheck + build pass. Below is the
original spec.

**The defining daily contract is invisible.** VISION §4c centers the day on
the 3R operational stop, the −5% hard floor, and the +7% ceiling. The trading
page shows Session P&L as a number and a static "Max Loss −₹X"; nothing shows
how close the live session is to those limits. Highest decision-impact —
turns "watching a number drift" into "seeing risk against the lines that stop
the machine."

- Three gauges filling as P&L moves: distance to 3R stop, to the −5% hard
  floor, to the +7% ceiling. Colour shifts as each is approached.
- Build the gauge as a reusable component — Task 3 reuses it.

## Task 3 — Command-center landing page ⬜
**System state is scattered across four pages.** `app/page.tsx` is a 5-line
redirect to `/connect`. No single screen shows paper-engine status + live
risk, real portfolio health, and the advisor's #1 action today. God-mode
opens to one glance: "what's happening and what should I do." Biggest lift;
reuses Task 1's risk gauge → built last.

---

## Honorable mentions (real, lower/future)

- **"Current stance" panel on `/trading`** — explain brain *idleness* (regime
  + in-play list + "N signals deferred by pacing"). VISION §4.7: the brain is
  correctly flat most of the time, but the UI never says why. Turns the black
  box into a glass box. Medium value; data exists (brain_activity, decisions).
- **Advisor calibration / factor-attribution surface** — once grading data
  lands (advisor pillars 1/3, from 2026-07-24), show the measured factor edge
  and calibrated confidence. Data-gated, weeks out.
