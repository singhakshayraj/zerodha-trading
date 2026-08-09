# GATE MEASURES — the go/no-go time series

The periodic re-measure of [VISION.md](../VISION.md) §6.1's go/no-go gates.
Split out of [PIPELINE.md](../PIPELINE.md) on 2026-08-10: these are a **time
series**, and stacking each new one on top of the live kanban was pushing the
actual board 130 lines down the page. PIPELINE now carries only the latest
numbers and links here.

**The gates** (VISION §6.1): profit factor **>1.3 go / <1.1 reject**; expectancy
positive; advisor calibration is DARK and not scored.

## Latest — 2026-08-09

| Metric | Value | vs prior |
|---|---|---|
| Profit factor | **0.358** | 0.376 (08-02) → 0.358 |
| Expectancy | **−0.4155R** | −0.408R → −0.4155R |
| Max drawdown | **≈−₹33,378** | ≈−₹6,697 → −₹33,378 |
| Advisor calibration ECE | **35.6%**, non-monotonic, n=31 | 48.5% (n=22) → 35.6% |

**No gate has ever flipped.** PF has sat in the reject zone at every measure and
is nowhere near either threshold. The drawdown deepening is *by design* — the
−3R daily stop went soft on 08-03 so full-day sessions bleed past the marker;
that is data collection working as intended, not a regression.

The one number moving for a real reason is **advisor ECE**, which fell 12.9pp as
the graded pool grew 22→31. Still non-monotonic, still under the ≥50-graded
action threshold ([P-18]), and it is expected to keep crawling until the 30-day
MACRO wave matures ~late August.

⚠️ **None of this is the edge verdict.** Paper PF measures entries the book
already took; gate #6 (a historical backtest, [P-01]) is the verdict, and it is
blocked. [P-30] sharpened the surrounding picture — no exit policy clears
breakeven *even at zero transaction cost* — so the edge has to come from the
entries.

---

## 📊 Weekly gate re-measure (2026-08-09)

**No new trading session this week** (last session `2ddadca7` ended 08-07
09:52 UTC; 08-08/08-09 are weekend, next session Mon 08-10 per STATUS). So
this is a clean re-measure over the same underlying data the 08-07/08-08
post-session passes already recorded, computed directly from `trades` +
`app_config.advisor_calibration_latest` rather than carried-forward prose:

| Metric | Value (610 closed trades w/ `r_multiple`; 692 total CLOSED) | Gate (VISION §6.1) | Δ vs 08-02 review | Δ vs 08-07 post-close |
|---|---|---|---|---|
| Profit factor | **0.358** (gross win ₹18,563 / gross loss ₹51,830) | >1.3 go / <1.1 reject → **reject zone, no flip** | 0.376→0.358 | 0.371→0.358 |
| Expectancy | **−0.4155R** avg | negative | −0.408R→−0.4155R | −0.414R→−0.4155R |
| Max drawdown | **≈−₹33,378** (peak-to-trough equity, all-time) | — | ≈−6,697→−33,378 (deepening is by design — soft `-3R` stop lets full-day sessions bleed past the marker; see FLAG log, not a regression) | ≈−29,320→−33,378 (08-07's −₹3,423 session) |
| Advisor calibration ECE | **35.6%**, still non-monotonic, **31** graded calls | DARK — not scored | 48.5%→35.6% (n=22→31) | 48.5%→35.6% (STATUS's 08-06 narrative had already noted 28→31 graded but the tracked ECE/VERIFY W-B number was stale until this pass) |

**82 of 692 CLOSED trades carry no `r_multiple`** (all dated ≤2026-07-06 —
`COVER_SHORT` 39, `SESSION_END` 17, `AUTO_SQUARED_ZERODHA` 10, `BRAIN_SIGNAL`
8, `ORDER_FAILED`/`SQUARE_OFF_FAILED` 7, `STOP_LOSS_HIT` 1). Pre-dates every
tracked fix on this board, not a new gap — excluded from expectancy by
construction (`avg()` skips nulls), noted here so the 610-vs-692 count
doesn't read as unexplained.

No go/no-go gate flipped — PF stays deep in reject territory, nowhere near
either threshold. **Advisor calibration is the one number that moved for a
real reason**: ECE fell 12.9pp as the graded pool grew 22→31 (all MICRO-horizon
matures; the 30-day MACRO wave still isn't due — see [P-18]/W-B). Still
non-monotonic and still under the 50-graded action threshold, so this stays a
**watch note, not an action** — recorded in [VERIFY.md](VERIFY.md)
W-B so it isn't lost again.

**[P-24] DB repair (V-4) — still open, unchanged.** `advisor_paper_positions`
MANAGEMENT/SEED closed rows: still **18 rows / −₹77,325.36**, still **7**
duplicate pairs (I-1), all still frozen at `first_seen=last_seen=2026-08-06`
— the code fix continues to hold (no new dupes), but the repair script itself
hasn't been run yet. Third day open; not yet "over a week" but it's the one
Ready item that's pure user-action and has sat untouched since 08-06.

**3-lens sanity:**
- **Trader** — PF unchanged in substance (0.358, deep reject), no new
  trades to read since last Friday. Drawdown deepened exactly as the
  soft-stop design predicts; not a new risk.
- **Advisor** — ECE improved (48.5%→35.6%) but n=31 is still low and the
  curve is still non-monotonic; [P-18]'s own criteria (≥50 graded, expected
  late August per the MACRO-wave timeline) already covers when this becomes
  actionable — no new item needed.
- **Engineer** — no new session ran this week, so no new operational
  finding. The one standing engineering risk is non-technical: [P-24]'s DB
  repair is a one-command script (`scripts/repair_p24_paper_books.sql` in
  the brain repo) still waiting on a human to run it against prod.
  _✅ Since resolved — the repair ran 2026-08-10 pre-market once the Supabase
  connector came up. Left as written because this is a dated snapshot._

Nothing regressed; nothing moved to Ready. See prior weekly re-measure below
for the 08-02 baseline this compares against.

## 📊 Weekly gate re-measure (2026-08-02)

**No new trading data this week.** `trading_sessions` max `started_at` is still
07-29; `brain_heartbeat` shows `status=ONLINE, current_cycle=0, "Waiting for
START command"` as of 08-02 04:39 UTC — same stalled state STATUS flagged on
07-31. Zero sessions, zero trades, zero advisor runs since 07-29. All figures
below are therefore **unchanged from last review, not re-verified against new
data** — first-time cumulative baseline for future deltas:

| Metric | Value (370 closed trades, all-time) | Gate (VISION §6.1) |
|---|---|---|
| Profit factor | **0.376** | >1.3 go / <1.1 reject → **reject zone, no flip** |
| Expectancy | **−0.408R** avg | negative |
| Max drawdown | **≈−₹6,697** (peak-to-trough equity) | — |
| Advisor calibration ECE | **48.5%**, non-monotonic, 22 graded calls (most bins low-n) | DARK — not scored |

No go/no-go gate flipped. Paper PF confirms the standing conclusion (no edge
on paper data) but this is not the edge verdict — gate #6 is, and it's still
blocked on the Kite ₹500/mo decision ([P-01]).

**3-lens sanity:** trader — PF unchanged, deep reject zone, nothing new to
read since no new trades. advisor — calibration ECE 48.5%/non-monotonic is
the first hard number recorded for it; poor but DARK (no live weight), and
n=22 is too small to act on — watch, don't fix (new [P-18]). engineer — the
real story this week is operational, not statistical: the manual-token-paste
SPOF has now stalled the *entire* pipeline for a full week, which means none
of [P-05]/[P-07]/[P-16] can accumulate the fresh session data they need to be
tested. This sharpens [P-03]'s priority further; no new risk beyond what's
already tracked there.
