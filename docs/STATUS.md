# STATUS — where the project is right now

**The single source of truth for current state.** Update this in place; do not
create dated `HANDOFF_*` snapshots (those are archived). For the "why" see
[VISION.md](VISION.md); for what's next see [ROADMAP.md](ROADMAP.md).

_Last updated: **2026-08-13** (Thu, post-session, ~16:45 IST). ⚠️ **No trading
session has run since 08-10** — three consecutive weekdays silent (08-11 Tue,
08-12 Wed, 08-13 Thu). Verified directly against prod (dashboard API
unreachable this pass, see note below): zero rows in `trading_sessions`,
`trades`, `brain_decisions`, `portfolio_advice`, `market_context`, and
`stock_observations` for all three dates. `brain_heartbeat` is **ONLINE** as of
16:44 IST today but `current_cycle=0`, `"Waiting for START command"` — the
known manual-enc_token-paste dependency ([P-03]/[P-04]) never got a token any
of these three days. This is a new worst case: exceeds the previously
recorded 07-30/07-31 two-day gap. Not re-raising the P-03/P-04 priority call
(user has deprioritised it) — recording the evidence only. **No metrics
changed this pass** — 08-10 numbers (81 trades, −₹8,528.22, PF 0.242; 773
closed trades cumulative, PF 0.343) still stand, see "2026-08-10 post-session"
below.
⚠️ **Data-source note:** the deployed dashboard API
(`zerodha-trading-liard.vercel.app`) was **egress-blocked** for this session
(proxy returned 403 — organization policy denial, not a site outage). Today's
"no session" finding was confirmed instead via direct Supabase queries, which
this routine always has as a fallback. Deployed versions are in the
"Deployed:" line below — that is the single place they live. Prior entries:
`git log docs/STATUS.md`._

---

## ▶️ START HERE NEXT SESSION

_Written 2026-08-10 (Mon) ~01:40 IST, pre-market. **Today is a trading day** —
the open is 09:15 IST._
Board: [PIPELINE.md](PIPELINE.md) · open checks:
[reference/VERIFY.md](reference/VERIFY.md) · findings:
[reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md) · how they connect:
[README.md](README.md) · paste-block: [reference/RESUME_PROMPT.md](reference/RESUME_PROMPT.md).
**Who owes what, with exact commands: [OPEN_ITEMS.md](OPEN_ITEMS.md).**

**Deployed:** brain `68f306f3f5fc` (git_sha stamped on today's session,
`6220e8ce`), dashboard `b7f9f9f`.

### Where things stand

An overnight pre-market session (00:45–03:27 IST) closed **[P-24]**, **[C1]**,
**[C2]** and **[C5]**, shipped **[P-35]**/**[P-36]**/**[P-37]**, and added the
Learn page — see §"2026-08-10 pre-market shipped" below. **No
date-independent VERIFY check remains open**; the ledger is now purely
event-driven (V-7/V-9/V-10 all need a live session to judge).

⚠️ **Superseded — a full trading session has since run.** Session `6220e8ce`
04:07–09:51 UTC (09:37–15:21 IST), `COMPLETED`/`MARKET_CLOSED`. The **"Do these,
in order"** block right below is pre-market prep for a day that has now
happened — items ①/② no longer apply. See **§"📈 2026-08-10 post-session"**
below for today's result, and re-write this block fresh next pre-market
session rather than trusting it as-is.

### Do these, in this order

**① BEFORE 09:15 IST — paste the `enc_token`, then run the pacing runbook. [you]**
```bash
bash scripts/premarket_pacing.sh   # brain repo
```
✅ **No edit needed** — the script already sets `DATA_MAX_NEW_TRADES_PER_HOUR=25`
and `MAX_TRADES_PER_CYCLE=12`, which is what revised [C4] calls for. (An earlier
version of this block said to adjust the numbers first; that was wrong, and the
script's own stale header has since been rewritten.) It **restarts the brain**,
so it must land before the open and never during a session.

**② ~~[P-24] DB repair~~ ✅ DONE 2026-08-10** — ran pre-market once the Supabase
connector came up. 18 → **11 rows**, −₹77,325.36 → **−₹45,796.41**. **V-4
PASSED, I-1 back to 0.** Nothing left for you here.

**③ [P-26] seed-basis decision. [you→me]** — the one item still waiting on you.
Recommendation unchanged: seed at **seed-day price**, so the advisor owns only
what happened after it spoke rather than inheriting RVNL −46.3% and NBCC +73.0%
as its own record. _(It was meant to be bundled with ②; ② has now run without it,
which costs nothing — the seed basis is a separate rewrite of the same rows.)_

**④ Post-close — `/post-session-check`, then `/counterfactual-audit`.**
Only after ~15:30 IST / 10:00 UTC; auditing a live session misreports. Open
entering today, all event-driven:
- **V-7** ([P-25]) — needs a day you actually trade. Quiet day = NOT-YET.
- **V-9** ([C1]) — only judgeable on a day the token is *missing*. If you paste
  on time it stays NOT-YET, which is the good outcome.
- **V-10** ([C5]) — first real read after today's 15:40–16:30 IST backfill runs.

**⑤ Then pull the top Ready item.** With [P-24] and the C-series closed, the
Ready list is **[P-32]** / **[P-33]** / **[P-34]** (from the finserv-plugin
assessment) and **[P-06]**. [P-32] is the highest value — it attacks [P-18]'s
grading bottleneck — but **needs one decision from you first**: is `stop_level` a
*thesis invalidation* (breaking it means the HOLD was wrong) or a *suggested stop
for you* (breaking it means act, but the call may still be sound)? They grade
differently. [P-33] needs no decision and is now unblocked, since Supabase DDL
works again.

### Standing facts a new session must not re-litigate

- **The biggest lever is [P-04], and it costs ~3 minutes.** [C1]: `AUTOPILOT`
  fired on time on 08-07 but retried ~380× on a missing enc_token, losing **~55%
  of the day's tape**. The alarm for this **already exists** —
  `_maybe_token_preflight` sends a Telegram warning at 09:16 IST, 14 minutes
  before autostart — and is dormant *only* because [P-04]'s bot token is unset.
  The durable post-mortem trace shipped 08-10 (V-9), but that records the loss,
  it does not prevent it. [P-03] stays **deprioritised — do not re-raise it**.
- **Do not read 08-07's trade count as a verdict on [P-31].** A 2h50m session
  caps volume regardless. 08-07 is a clean read on *diversity* (46→86 symbols),
  not volume.
- **Short-side `exit_reason` semantics changed on 08-07.** Buckets are **not
  comparable across that boundary** — every short exit before it is
  `COVER_SHORT`.
- **Trend-tells: streak broken.** +0.134, +0.182, then **−0.093**. Stays dark.
  Sign-flipping session to session is exactly what [P-21] warned of.
- **No exit policy rescues the book, and not even zero cost does.** [P-30]
  corrected [P-29] here: 0 of 180 policies clear breakeven *at zero transaction
  cost*. The edge has to come from the entries; the verdict rests on gate #6.
- **[P-01] Kite ₹500 and [P-03] TOTP are deprioritised** — do not proactively
  raise either.

## ⚡ 2026-08-10 — [P-36]: API layer, 5.04s → 0.94s

Architect pass. The right pattern already existed here and was applied
inconsistently: `/api/analytics/insights` called Postgres RPCs while the other
heavy routes pulled whole tables into Node, because PostgREST cannot aggregate.
`/api/autopsy` was making **24 sequential round trips** to read all 23,835
candles and then discarding ~73% of them client-side — the round trips, not the
data, were the cost.

| route | before | after | |
|---|---|---|---|
| `/api/autopsy` | 2.741s | **0.406s** | −85% |
| `/api/analytics/insights` | 1.603s | **0.431s** | −73% |
| `/api/learn/stats` | 0.694s | **0.099s** | −86% |
| **combined** | **5.04s** | **0.94s** | **−81%** |

Three functions, each returning a single `jsonb` row so PostgREST's 1000-row cap
stops mattering and the pagination loops disappear rather than being tuned.
**Output verified identical field-by-field on all three** — a speedup that
changes a number is not a speedup. `totalDeployed` is now *more* accurate:
Postgres `numeric` instead of accumulated JS float drift over 685 rows.

The durable part is the rule, written into
[reference/ENGINEERING_SPEC.md](reference/ENGINEERING_SPEC.md): **Postgres does
set operations, the app does algorithms.** The exit-frontier ladder stays in
TypeScript precisely because it is an algorithm, not a set operation.

## 🔬 2026-08-10 — [P-35]: the first entry edge that survives testing

**This reverses [P-21].** Everything prior said the edge had to be in the
entries ([P-29]/[P-30]: no exit policy clears breakeven even at zero cost), and
[P-21] had tested entries and found nothing. But [P-21] named its own
limitation in its first paragraph — SHORT labels on only 2 days — and that
limitation had since expired without anyone re-running the study.

Sample grew **1,597 → 5,481** usable labeled decisions across **10 days**
(after backfilling 08-07's 366 missing labels).

| | gross | cost | **net** |
|---|---|---|---|
| all 5,481 decisions | +0.105R | 0.310R | **−0.205R** |
| frozen rule: SHORT + before 13:00 + STRONG trend | **+0.374R** | 0.291R | **+0.083R** |

**Walk-forward out-of-sample: +0.097R net** (n=1,383, t=+3.0), derived only on
prior days. Beat that day's own baseline 7/9.

**Both boring explanations ruled out**, and the checks are built into the script
so they re-run with the data:
- *Cheaper trades?* No — cost is flat across every rule (0.291–0.332R). The
  advantage is in **gross** (+0.374R vs +0.105R, 3.6×).
- *Just shorting a falling market?* No — plain SHORT is that bet, and the rule
  **beat it on 9 of 9 days**. Direction alone lost on 8 of those 9.

⚠️ **Not evidence of profitability, and nothing is enabled.** Counterfactual
labels rather than real fills; +0.097R against 0.310R of cost; one 10-day
period; 4/7 OOS days positive. The traded book is still −0.4155R. An earlier
version of this same rule looked convincing on two days and then collapsed —
which is the entire reason for holding it at arm's length now.

**No new brain code is needed to keep testing it** — every decision already
records direction, hour and trend strength, so a dark flag would be redundant.
The follow-up is to run the labeler + `scripts/edge_study.py` after each
session. Registered as **V-12**; writeup
[reference/EDGE_STUDY_P35.md](reference/EDGE_STUDY_P35.md).

## 📈 2026-08-10 post-session

Session `6220e8ce` 04:07–09:51 UTC (09:37–15:21 IST), `COMPLETED`/
`MARKET_CLOSED`, git_sha `68f306f3f5fc`. **81 trades, −₹8,528.22, PF 0.242**
(gross win 13.712R / gross loss 56.686R), **expectancy −0.531R** (17 win / 64
loss) — a weak day, on the low end of the established per-session PF range
(0.04–1.03). Advisor ran normally: 800 advice rows, 04:23–09:46 UTC, no stall.

**Advisor calibration moved:** graded_calls **31 → 37**, ECE **35.6% → 30.3%**,
base rate 37.8%, still `monotonic=false` (still below [P-18]'s ≥50-graded
action gate).

**Cumulative (all-time, now 773 closed trades / 691 carrying `r_multiple`):**
PF **0.343** (gross win ₹21,765.63 / gross loss ₹63,560.75), expectancy
**−0.429R**, max drawdown (peak-to-trough equity) **≈−₹42,352** (deepened from
≈−₹33,378 on 08-09 — today's loss day, consistent with the soft-stop design,
not a new regression). No gate flip — PF stays deep in reject territory.
Standing conclusion unchanged: **no edge on paper data; gate #6 is still the
verdict and still blocked** ([P-01]).

**⚠️ New finding this pass — Supabase capacity.** Cross-checking [P-37]'s
capacity work (shipped pre-market but not yet reflected on the PIPELINE board)
turned up that its own Task 0 gate had never been answered: **the org is on
the Supabase free tier**, not Pro. Current DB size **97 MB / 500 MB (19%)**,
**≈6 weeks of runway** at the measured growth rate. This is a real, time-boxed
item — see **[P-38]** in PIPELINE (moved to Blocked) and
[reference/CAPACITY.md](reference/CAPACITY.md). Needs a decision: upgrade to
Pro, or run the storage-trim plan under that clock (the trim alone does not
remove the need for the decision — it only stretches the runway).

_Docs sync: [P-37] (shipped 03:15 IST) added to PIPELINE Done — it had
shipped but the board was never updated. No other undocumented shipped items
found in `git log -25`._

## 🚀 2026-08-10 pre-market shipped — [P-24] closed, plus three findings

Overnight session (~00:45–01:40 IST, market shut, brain pushes safe).

- **[P-24] DONE — the DB repair finally ran.** The Supabase MCP connector came
  up mid-session, so the repair that had been waiting on a human since 08-06
  went through: **18 rows / −₹77,325.36 → 11 / −₹45,796.41**, duplicate sum
  −₹31,528.95 removed, every documented target hit exactly. **V-4 PASSED and
  I-1 is back to 0 rows** — that was the last date-independent open check on the
  board. Rollback snapshot committed (`scripts/p24_rollback_2026-08-10.sql`).
  _Worth recording: `UPDATE` and `DELETE` both went through. The standing "prod
  writes may be blocked by the permission classifier" caveat did not bite._
- **[C2] closed** (brain `a68e136`). Audited all 500 Nifty-500 pins against
  Kite's live public master: **499 matched**, JBCHEPHARM was the only dead one
  and is absent from the master entirely. Dropped it; no rebuild needed. Added
  `scripts/audit_nifty500_tokens.py` + verify **I-6**. Also relaxed two tests
  that pinned the universe count at exactly 500 — an assertion that would fail
  at every legitimate index reconstitution.
- **[C1] + [C5] shipped** (brain `ce057e4`). [C1]: a *missing* token now leaves
  the same durable `token_incident` a *stale* one always did — that asymmetry is
  why 08-07's lost morning left no evidence. [C5]: post-close candle backfill
  (15:40–16:30 IST), deliberately **not** in the close path. Verifies **V-9**,
  **V-10**. Suite **905** green.

⚠️ **[C1] is the post-mortem trace, not the alarm.** The alarm already exists —
`_maybe_token_preflight` sends a Telegram warning at 09:16 IST, 14 minutes
before autostart — and is dormant only because **[P-04]**'s bot token is unset.
That remains the single highest-leverage ~3-minute action available.

## 🚀 2026-08-08 shipped — [P-30], and a correction it forced

**[P-30] exit-frontier phase 2** (dashboard: `lib/exit-replay.ts`, the autopsy
route + page). The 5-minute candle archive now **orders** the two touches that
`mfe_r`/`mae_r` could only report as a set, so most ambiguous trades resolve
exactly instead of riding on an assumption.

- **The bounds collapsed ~16×.** Same 541-trade window: the best cell's
  optimistic–pessimistic band went **0.118R → 0.007R**. On the current 577
  trades it is 0.012R. A range became a number.
- **Ground truth passed 85/85** (50/50 real stops, 35/35 real targets) among
  trades whose exit moment an archived bar actually covers. Every disagreement
  traced to the archive's tail, not the logic → new finding **[C5]**.
- ⚠️ **It corrected a conclusion this board was carrying.** [P-29] reported
  "set cost to 0 and **3 of 180** policies go positive (best +0.009R)", which
  fed the "entries are ≈ a coin flip, costs are the entire loss" line. Those
  three cells were an artifact of crediting every ambiguous trade with the
  target. With exact ordering: **0 of 180, best −0.077R.** So the entries are
  **slightly worse than a coin flip**, and "just cut costs" is not impractical
  but *unavailable* — no cost level makes any policy break even.
- **Robust to its own weakest assumption.** Whole bars only, so the entry bar is
  excluded; 9 of 14 resolutions at the best cell hinge on the first admitted
  bar. Inverting **every** one of them still leaves 0 of 180 above breakeven.
- Verify row **V-8**; full writeup [reference/EXIT_FRONTIER.md](reference/EXIT_FRONTIER.md) §5.1.

_Built in the API route, not the brain-side precompute the design specified —
the session had no Supabase MCP to apply the DDL. Same client-side behaviour;
costs ~2.8s per cold API response. Escape hatch documented in §5.1._

## 🚀 2026-08-07 shipped

- **[P-27]/[P-28]** stop-exit measurement fixed and **verified live**:
  `model_stop` 15/15, `COVER_SHORT` eliminated so every short exit carries a
  real reason, phantom row gone (36=36=36). **[P-05] finally re-judged over the
  whole book: −1.211R** (n=15, 11 SHORT — the old −1.252R was the smaller half).
- **[P-31]** universe breadth: 40 sector-balanced Nifty-500 names rotate in
  daily. **46 → 86 symbols**, ~490s cycles vs 459s at 46 — nearly double the
  universe for ~7% more cycle time.
- **[P-29]** `/autopsy` Exit-Policy Frontier — no exit rule rescues the book;
  breakeven needs costs **~25× lower** than reality.
- **[P-25]** real-execution capture — recovered your NBCC sale from history and
  stamps `user_decision` with no manual step.
- **Tracking loop**: [reference/VERIFY.md](reference/VERIFY.md) created; three
  dead links in the audit skills fixed; K/W/A/B vs P-nn ID collision removed.
- **[C3]** fixed; **[K8]** closed on evidence.

## 🔬 2026-08-07 — Exit-Policy Frontier (`/autopsy`): costs are the whole loss

New dashboard page. Replays **every** fixed (take-profit T, stop S) policy over
the 541 closed trades that carry excursion data (12 sessions, 07-10→08-06),
using `mfe_r`/`mae_r` — the best and worst unrealized R each trade reached. This
needs **no Kite historical data**, so it answers a real question while gate #6
stays blocked.

**Result, at the 0.12% round-trip cost assumption:**

| | per trade |
|---|---|
| Realized (net) | **−0.401R** |
| Best achievable exit policy (T 1.00R / S 0.25R) | **−0.219R** |
| Cost drag | **−0.239R** |
| Realized, gross of cost | **−0.162R** |

- **None of the 180 policies clears breakeven** — and that is the *optimistic*
  bound, where every trade that touched both levels is credited with hitting the
  target first. The extremes don't record ordering, so no tick sequence beats it.
  The verdict is therefore immune to the one thing the data can't say.
- ~~**Set cost to 0 and 3 of 180 policies go positive** (best **+0.009R**).~~
  **CORRECTED 2026-08-08 by [P-30]:** those three cells were an artifact of the
  optimistic assumption. With the candle replay ordering the touches exactly,
  **0 of 180 go positive at zero cost** (best −0.077R). The entries are
  **slightly worse than a coin flip**; costs are the larger part of the loss
  (−0.239R of −0.401R) but not the whole of it.
- **But that is not a "cut costs" finding — and [P-30] made that stronger.**
  Phase 1 put the breakeven round-trip cost at **≈0.0047%**, ~1/25th of the
  0.12% actually paid and a fifth of sell-side STT alone. After exact ordering
  there is **no breakeven cost at all**: the surface is still entirely negative
  at *zero* cost. So cutting costs is not merely impractical, it is
  unavailable — **the edge has to come from the entries.** Full writeup, and
  phase 2 as built: [reference/EXIT_FRONTIER.md](reference/EXIT_FRONTIER.md) §5.1.
- Structure in the surface runs almost entirely **down** the rows: stop width
  dominates, target width barely matters — the signature of no entry edge.
- Ships with a cost dial, optimistic/pessimistic bounds, side filter, and a
  table view. Pessimistic best is −0.292R.

**Caveat:** diagnostic on entries *already taken* — it cannot speak to regimes
the book never traded. That is still gate #6's job.

## One-paragraph state

Month-long **paper-trading** validation of an intraday auto-trader (brain =
`~/Desktop/GITHUB/zerodha-brain`, Python on Railway; dashboard = `zerodha-trading`,
Next.js on Vercel; data in Supabase prod `gilmuwmtdpjccibfhqtx`). **The strategy
has no proven edge** — paper PF ≈ 0.31 cumulative over 521 closed trades / 8
measured sessions; that's a valid outcome (VISION §7b), not a bug. The real
edge verdict is **gate #6** (a historical backtest), built but **blocked on
Kite historical data (₹500/mo — a user decision)**. Alongside the trader is a
**portfolio advisor** (daily HOLD/SELL on real holdings) which is where most
recent work has gone.

## ⚙️ Live config change 2026-08-03 — both sessions now COMPLETE, verified live
- **`ENFORCE_DAILY_STOP_3R=false`** set on Railway — the −3R daily stop is now a
  **soft counterfactual** (`LIMIT_WOULD_STOP`), not a hard cut, restoring true
  full-day data collection (user's stated goal). Reverts the 07-27 hard carve-out.
- Session params raised **25k→100k capital, 10→40 maxTrades**.
- **Two sessions ran 08-03, both COMPLETED:** morning `3fe00787` 04:00–04:48 UTC
  ended `DAILY_STOP_3R` (−₹4,037, 30 trades, PF 0.23, −0.51R — before the flag
  flip); afternoon `1ef3f27f` 06:23–09:51 UTC ended `MARKET_CLOSED` (−₹1,639, 47
  trades, PF 0.66, −0.23R) — **confirmed working as designed**: 11
  `LIMIT_WOULD_STOP` counterfactual fires logged (would've hard-stopped under
  the old flag) but the session ran the full day to close instead of cutting
  early. Combined today: 77 trades, −₹5,676, PF 0.44, −0.34R avg.

## 📈 2026-08-04 post-session — single full-day session, [P-20] verified live
Session `1042e121` 04:00–09:51 UTC, `COMPLETED`/`MARKET_CLOSED`, git_sha
`c689ed44cbf1` (first live run of the 08-04 night deploy). 90 trades, −₹10,827,
PF **0.158**, avg **−0.64R** — a weak day, inside the already-established
per-session PF range (0.04–1.03, see [P-16]). **[P-20] advisor-in-trading-loop
confirmed**: 42 advisor runs 04:23→09:45 UTC spanning the whole session, no
midday stall (was starving past ~11:50 pre-fix on 08-03). `stock_observations`
phases held: PRE_OPEN 20 / INTRADAY 120 / POST_CLOSE 20. Dark counterfactuals
fired: `REENTRY_WOULD_BLOCK` 56, `TIME_STOP_WOULD_FIRE` 40,
`OUTSIDE_OPEN_WOULD_BLOCK` 27, `LIMIT_WOULD_STOP` 7 (soft daily-stop fired but
the session still ran to `MARKET_CLOSED`, not `DAILY_STOP_3R` — soft-stop
still working as designed). Open-window (≤10:15 IST) vs after: **−0.63R
(n=10) vs −0.64R (n=80)** — converged, both negative; further dents the T4
open-window thesis (see FLAG log). `STOP_LOSS_HIT` **−1.40R** (13 trades) —
still above the ≈−1.25R [P-05] target, slightly worse than 08-03's −1.34R.
**Root-caused + re-fixed post-session:** the cap correctly clamped the stop
*reference/hint* to −1.25R (`execution.exit.reference_price`), but the paper
broker then re-applied `PAPER_SLIPPAGE_PCT`+charges on top of it, re-widening
the realized fill to −1.4/−1.6R (short stops hid the same under `COVER_SHORT`).
Fixed brain `b09904fe55fb` (`model_stop` flag skips the double slippage on
STOP_LOSS_HIT exits, charges kept). **Re-verify next session** → ≈−1.25R − charges.

## 📈 2026-08-05 post-session — normal-range day, P-05 re-fix STILL unverified
Session `3903c7e1` 06:16–09:51 UTC, `COMPLETED`. 41 trades, **−₹1,604**, PF
**0.554**, avg **−0.230R** — back inside the established per-session PF range
(0.04–1.03), a rebound from 08-04's weak 0.158. **⚠️ git_sha stamped
`c689ed44cbf1`** — same build as 08-04, **not** `b09904fe55fb` (the P-05
double-slippage re-fix STATUS recorded as deployed post-08-04). Either the
Railway deploy didn't actually go live or the stamp is stale — either way
the re-fix is **still unverified**: only 1 `STOP_LOSS_HIT` fired today
(−1.157R, n=1 — too small to read either way). Re-check the Railway deploy
before next session ([P-23]). Advisor ran normally: 540 advice rows, last
09:45 UTC (no stall, [P-20] still holding). Grading: 28 graded calls (was
21), 39.3% hit (was 42.9%) — still DARK/small-n, [P-18] watch-only.
⚠️ **New gap:** `advisor_paper_equity`/`advisor_paper_positions` are **0
rows** — today was the first official session since [P-14] Phase 2 shipped,
which should have seeded/snapshotted both books ([P-22]).

## 🛠️ 2026-08-06 — deploy incident root-caused + fixed, P-21 edge study, fixes
- **Deploy pipeline was broken (root cause of the 08-05 git_sha mismatch).** The
  brain service **auto-deploys from GitHub**, but `deploy.sh` only did `railway
  up` (local tarball) and never pushed — so a GitHub rebuild reverted to
  `c689ed4` and the P-05 + paper commits ran nowhere ([P-23]). **Fixed:** pushed
  (git_sha confirmed `a2d9881` live mid-session), then `deploy.sh` reworked to
  push-based + hard-abort on unpushed/dirty/non-main. **Deploy = `git push` now.**
- **Grading was starving on a real bug, not just cadence.** The session-start
  catch-up built a **cold** MarketData → `get_candles` fell back to `/quote`
  (400s on a retail token) → no candles → rows wrongly "not-due". **Fixed** by
  warming holdings (`489d6b5`); backfill drains next session.
- **[P-21] edge study — decisive NO-edge** (needs no token). In-sample a strong
  rule appeared (SHORT+morning+STRONG +0.44R) but **collapsed out-of-sample** —
  no feature-based entry edge; `confidence_score` + `trend_tells` gate don't
  predict. Edge verdict still rests on gate #6.
  [reference/EDGE_STUDY_P21.md](reference/EDGE_STUDY_P21.md).
- **Track C labeling unstarved** — was manual/unrun since 07-23; now auto-runs
  each session (`c5fd525`) + backfilled 07-24→08-05.
- **Dashboard — mobile overhaul + UX polish (all shipped, Vercel auto-deploys):**
  - **Mobile app-shell (`5c169f4`)** — root cause of the Android-Chrome scroll
    jank + hidden content was `position:fixed` bars over a scrolling `<body>`
    (URL-bar hide/show → jump) and a 2-row nav taller than the padding. Now the
    app is `h-dvh overflow-hidden`, `<main>` is the sole scroll container
    (`flex-1 min-h-0 overflow-y-auto`), and the mobile header/nav are normal-flow
    (`order-first`/`order-last`, not fixed). Body never scrolls → URL bar stays
    put → no jank; nav in flow → nothing hidden. **⚠️ user to re-confirm on a
    real Android device** (emulation never reproduced it).
  - Bottom nav slimmed to a **single row** of 8 (short labels, `45199b9`).
  - Advisor page redesigned for scannability/mobile (collapsible analytics,
    mobile-safe calibration bars). Hard-refresh `/connect` bounce fixed
    (`hydrated` gate, `edf72d7`).
  - UX: per-section browser-tab titles; refresh-on-tab-focus (home/advisor/
    insights); confirm-before-disconnect; tap-active-tab-to-scroll-top;
    overscroll containment; `aria-current`; Android `text-size-adjust`.

## ✅ 2026-08-06 VERIFY pass — 2 of 4 cleared, 1 was a false alarm
Session `16f23213` started 04:25:53 UTC (09:55 IST), **still RUNNING** at the
time of this pass (mid-session read, not a post-close audit).
1. **git_sha ✅ CLEARED** — session stamps **`c5fd5254f157`**. The whole 08-06
   brain chain is live; the deploy-pipeline fix ([P-23]) holds. **Closes [P-23].**
2. **[P-14 P2] paper books ✅ CLEARED** — both books seeded at 04:31 UTC on the
   official advisor run. `[paper] seeded MANAGEMENT: 20 holdings` + `seeded
   PICKING: ₹100,000 cash`, then same-minute snapshots. `advisor_paper_positions`
   42 rows (MANAGEMENT 29 = 13 open SEED + 16 closed SEED + 7 open ROTATION;
   PICKING 6 open SCAN), `advisor_paper_equity` 2 rows:
   **MANAGEMENT ₹618,714 vs baseline ₹620,695** (−0.32% alpha), **PICKING
   ₹99,400 vs ₹100,000** (−0.60%). Nifty 24,627.15. **Closes [P-22]** —
   `/advisor/accountability` now has real data instead of empty-state.
3. **Advisor grading — ❌ premise was WRONG, there is no backlog bug.** Graded
   went 28→31 (+3), not the predicted jump. Root cause of the *expectation*, not
   of a defect: **~85% of advice rows are `trigger_type=MACRO`, which
   `horizon_for()` puts on a 30-trading-day horizon, not 10.** Measured across
   every official run: **every due MICRO row is graded, 100%, with zero
   misses** — 07-12 1/1, 07-14 1/1, 07-22 2/2, 07-23 4/4, 07-24 3/3. Every
   remaining "matured" row is MACRO and genuinely not due yet. Live pass log
   confirms a clean mechanism: `queued=192 graded=3 not_due=189 errors=0`, no
   `no instrument token`, one unrelated 400. So the "~38 matured rows" figure in
   the 08-05/08-06 notes counted MACRO rows at a MICRO horizon. **Grading is
   healthy; the cold-cache fix (`489d6b5`) is not falsified — it just wasn't the
   binding constraint.** Expect the first MACRO wave ~**08-24** (the 07-12 batch,
   19 rows) and 07-22's ~**09-02**; MICRO adds ~3/session. Practical effect:
   **[P-18]'s ≥50-graded gate lands late August, not this week.** Diagnostic
   hardened so this can't recur — the pass log now splits `not_due` by horizon
   (`[10d=… 30d=…]`, brain `054f2c6`, suite 867 green, **committed not pushed**).
4. **[P-05] STOP_LOSS_HIT ≈ −1.25R — ⏳ still pending.** Session was ~40 min old
   with 7 trades and no closed `r_multiple` rows yet. Carry to post-close.
5. `/post-session-check` + `/counterfactual-audit` — ⏳ pending market close
   (10:00 UTC). Not run: auditing a live session would misreport.

⚠️ **Deploy note:** brain `054f2c6` is committed but **deliberately unpushed** —
push auto-deploys, which would restart the brain and truncate the running
session. Push after close.

## 🔎 2026-08-06 mid-session capture validation — **PASS**
Checked at 04:44 UTC (~20 min in), session `16f23213`. Every stream flowing,
**zero nulls** in the fields that matter:
- **trades** 22 (5 closed) · **brain_decisions** 133 (HOLD 61 / SELL 43 / BUY 34)
  — 0 null `confidence_score`/`indicators`/`price_at_decision`/
  `nifty_level_at_decision`/`time_of_day_bucket`; **22/22 entries linked to a
  trade_id** (8 SELL + 14 BUY), so decision→trade attribution is intact.
- **portfolio_advice** 39 (20 official + 2 intraday refreshes) · **stock_observations**
  20 INTRADAY, 0 null price/verdict/trend_score · **candles** 276 ·
  **level_pack** 46 · **inplay_list** 10 · **quote_snapshots** 3 · **market_context** 2.
- **Dark counterfactuals firing:** `LIMIT_WOULD_STOP` 2, `REENTRY_WOULD_BLOCK` 2.
  `brain_activity`: ANALYZING 138 / SIGNAL 138 / ORDER_PLACED 22 /
  ENTRY_DEFERRED 11 / POSITION_EXIT 6.
- **Track C labels** current through 08-05 (5,497 rows); today's label at close.
- _Expected gaps, not faults:_ no `PRE_OPEN` observations (session started 09:55
  IST, after the 09:14 window — the standing manual-token-paste timing), no
  `OUTSIDE_OPEN_WOULD_BLOCK` yet (10:15 IST cutoff had just passed), `tradebook`
  empty (paper mode).

## 🅿️ PARKED to post-market 2026-08-06 — advisor vs. live portfolio
User report: "I sold NBCC and rotated into the suggested stock; the advisor page
didn't show it immediately, and the real trade should have been recorded so we can
later judge whether the suggestion was a win or a loss." Root-caused read-only this
session, **implementation deferred at the user's instruction**. Full detail in
[reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md) §A1–A4:
- **[P-24] 🔴 Paper book double-counts realized P&L.** Every rotated-out holding
  written twice (`qty=0`/`SELL_VERDICT` + `qty=<real>`/`ROTATION_OUT`), same P&L
  both times — the 7 duplicate pairs are exactly the −₹31,528.95 gap between the
  recorded −₹71,512.79 and the true −₹39,983.84. Plus **TRIM books a full exit
  while leaving the position open** (ITC open 40 *and* closed 40). Corrupts the
  `/advisor/accountability` scorecard. Fix while the books are 1 day old.
- **[P-25] 🔴 Real executions are never linked to the advice** — the user's actual
  ask. `user_decision` is only ever written by the Telegram bot (blocked on
  [P-04]): 8 rows of 2,378. Proposed fix needs **no new capture** — `portfolio_advice`
  already snapshots symbol+qty+avg_price every ~6 min, so diffing consecutive runs
  recovers real fills and links them to the advice that recommended them.
- **[P-26] 🟡 Seed basis** — day-0 seeding at cost basis books pre-advisor history
  (RVNL −46.3%, NBCC +73.0%) as advisor results. Recommend seeding at seed-day price.
- **[A4] 🟢 The page is NOT stale** — `app/api/advisor/route.ts:16-20` already reads
  the freshest batch. Evidence: the official 04:30:58 run had NBCC qty 115; both
  intraday refreshes (04:36:35, 04:44:39) dropped it. The sale was picked up in
  **under 6 min**; the perceived lag is the ~6–8 min refresh interval, not staleness.

⏳ **Still unverified — [me→you]:** the Android mobile scroll/hidden-content fix
(`5c169f4`). User hasn't checked on a real device yet (asked 08-06). Re-ask; if
still broken, get a screenshot + the specific page/symptom **before** changing
anything — emulation never reproduced the original bug.

## Deployed versions
- **Brain:** `c5fd525` (08-06: auto-label decisions each session — Track C
  unstarve). Chain today: `b09904` (P-05 re-fix) → `91a4836` (grade-on-session-
  start) → `a2d9881` (paper-portfolio P-14·2) → `489d6b5` (holdings-warm grading
  fix) → `5b910a2` (deploy.sh push-based) → `c5fd525`. **All confirmed live** via
  git_sha `a2d9881` on the 08-05 session (later commits deployed same day, brain
  idle). Prior:
- **Brain:** `b09904fe55fb` (08-04 post-session: **P-05 double-slippage fix** —
  `model_stop` flag skips the broker's re-applied slippage on STOP_LOSS_HIT exits
  (the resting-stop cap already models it), charges kept. Suite 856 green). Prior:
- **Brain:** `c689ed44cbf1` (08-04 night: [P-20] advisor-in-trading-loop +
  database.py split to <600 + pa restored <600 — all behaviour-identical, suite
  855 green. **Confirmed live 08-04**: git_sha stamped on session
  `1042e121`, P-20 verified). Prior:
- **Brain (08-03):** `9e370ac719df` (git_sha stamped live on both 08-03 sessions —
  confirms the git_sha fix still holds). Chain since 07-29: `c177bae` (07-29) →
  `e81f706` (07-30, P-15/P-17) → `642ed94` (08-02, P-19) → `96dddf4` (P-05/P-07)
  → `9e370ac` (08-03, database split increment).
- **Dashboard:** auto-deploys from `main` on Vercel. CI gates both repos on push.

## ✅ ALL fixes VERIFIED LIVE on the 08-03 sessions (brain `9e370ac`)
Two sessions ran 08-03 (autopilot 09:30 + a manual afternoon after the −3R-soft flip):
- **[P-05]** stop-fill cap — `STOP_LOSS_HIT` averaged **−1.34R** (11 trades) vs
  the pre-fix −1.62R baseline, worst −1.47R; short stops (COVER_SHORT) worst
  −1.39R. Blow-through gone; not fully at −1.25R + small sample, keep tracking.
- **[P-07]** trade-only-open — **24** `OUTSIDE_OPEN_WOULD_BLOCK` rows fired
  (still DARK). ⚠️ **counterfactual now says SKIP** — see FLAG log below.
- **[P-09]** rotation entry-quality — 9 well-formed `rotation_entry_quality`
  payloads on the official run; flags correctly quiet on UP/under-cap targets.
- **[P-15]** capture — PRE_OPEN 20 / INTRADAY 40 / **POST_CLOSE 20** (was 100%
  INTRADAY pre-fix). Both new phases land.
- **[P-17]** no stall (both advisor runs completed, calibration/risk refreshed) —
  self-heal path itself remains unexercised. **[P-19]** railway logs scanned
  clean, no `400`/LTP-spam; git_sha stamped `9e370ac719df`.
- **db_stocks split** — a full session's observation/universe/advice writes all
  succeeded (moved fns), no import errors.
- **−3R soft** (`ENFORCE_DAILY_STOP_3R=false`) — afternoon ran to `MARKET_CLOSED`
  full-day (not `DAILY_STOP_3R`), confirming full-day data collection restored.
- **[P-16]** stays a no-op (regime can't tag non-TRENDING). Docs-only.

## 🚩 FLAG ENABLEMENT LOG

- **Counterfactual audit 2026-08-06 (522 closed trades / 10 days).** No flag
  flips. One genuinely new signal:
  - **Trend-tells gate → WAIT, but strengthening.** Today: blocked bucket
    **−0.541R (n=56)** vs kept **+0.182R (n=21)**. **The kept bucket is now
    positive two sessions running** (08-05 +0.134R, 08-06 +0.182R) — the first
    time that's happened; the prior audit's blocker was "kept is still negative
    almost every day". Directionally consistent **9 of 10 days** (only 07-23
    inverts). Pooled: blocked n=414 −0.468R / −₹26,715, kept n=107 −0.177R /
    −₹1,112. **Still not ENABLE:** it would block **73%** of today's trades
    (56/77), blinding the data collection that is this mode's whole purpose.
    Watch for a third consecutive positive kept-day — that would be the trigger
    to reconsider for a live-money phase.
  - **Market-direction → SKIP (still a no-op).** Tape remains ~all `SIDEWAYS`
    (LONG 269 / SHORT 246); only 6 BEARISH shorts, zero BULLISH. Nothing
    counter-direction to suppress. Unchanged from 08-06 morning.
  - **Time-stop → SKIP (reinforced).** Today's cleanly time-cuttable bucket is
    negligible: `SESSION_END` n=5, **−₹44**, −0.095R (mfe +0.479). Pooled n=55,
    −₹1,141, −0.204R. The real damage is `STOP_LOSS_HIT` (−1.393R, **mfe
    −0.609** — wrong from entry, never in profit) and `BRAIN_SIGNAL` (−0.638R,
    mfe +0.066); neither is time-cuttable.
  - **Soft −3R:** marker fired at 06:09 UTC with 37 trades / −₹3,258; the
    session finished **−₹5,052**, so continuing cost a further **−₹1,793**.
    Consistent with every prior day — the hard stop has real trading value, soft
    is the deliberate DATA choice. No flip.
  - **Circuit-breaker** was today's strongest counterfactual: fired at 15 trades
    / −₹535, final −₹5,052 → continuing cost **−₹4,517**. Also `MAX_TRADES_HIT`
    at 44 trades / −₹2,578 → cost −₹2,474. Both intentionally log-not-enforce in
    data-collection mode.
  - **Data-collection pacing → HELPED.** Track C labels (839 decisions labeled
    for 08-06) put the deferred signals at **−13.8R net avoided** (~−₹2,876):
    `CYCLE_LIMIT` −7.31R (n=13), `HOURLY_PACE` −5.47R (n=44), `CONCURRENT_CAP`
    −1.00R; only `SYMBOL_DAY_CAP` cost anything (+0.75R blocked, n=1).

- **Trade-only-open (P-07) → SKIP, keep DARK.** Counterfactual 08-03: the open
  window (≤10:15) was the *worst* bucket that day (−0.51R vs −0.23R after), and
  pooled across all clean days the open window is now **−0.23R (negative)** —
  degraded from T4's original +0.11R and **not directionally consistent** (08-03
  flipped the sign). The "open is the only +EV window" thesis no longer holds;
  do NOT enable. Re-measure as more full-day sessions accrue.
  _08-04: open (−0.63R, n=10) and after-open (−0.64R, n=80) converged — both
  negative, no exploitable spread either way. Reinforces SKIP, no new signal._
- Circuit-breaker (consec-loss): both 08-03 sessions lost more past it — WAIT
  (1 day; and data-collection intentionally logs-not-enforces it).
- **Full counterfactual audit 2026-08-06 (444 closed trades / 9 days):**
  - **Trend-tells gate → WAIT (strongest, but defensive-only).** The trades it
    would BLOCK (`permits_entry=false`) average −0.456R vs the KEEP bucket
    (`true`) −0.264R, **directionally consistent 8 of 9 days** (only 07-23
    inverts) — a real, stable loss-separator on live trades. BUT the kept bucket
    is **still negative** almost every day (only 08-05 +0.13R) → it *reduces
    bleed, doesn't create edge*, and enabling blocks **81%** (358/444) of trades,
    blinding the data collection that's the current mode's whole purpose. #1
    filter to enable for a live-money phase / once data-collection ends; **not
    now.** (Note: this sign is opposite [P-21]'s walk-forward-label result —
    real-taken-trades vs all-hypothetical-decisions are different populations.)
  - **Market-direction → SKIP (no-op).** The tape is ~all `SIDEWAYS` (no BULLISH;
    only 6 BEARISH shorts), so there's nothing counter-direction to suppress —
    same dead-end as [P-16].
  - **Time-stop → SKIP.** The cleanly time-cuttable bucket (`SESSION_END` losers,
    n=50) is small + mild (−₹1,097, −0.21R, mfe +0.33); the real losers are
    `BRAIN_SIGNAL` (−0.63R, mfe +0.04 — wrong from entry) + `STOP_LOSS_HIT`
    (−1.43R, the pre-P-05-fix double-slippage), neither time-cuttable.
  - **Soft −3R:** continuing past the −3R marker **lost more every day** (07-22
    −₹474, 07-23 −₹695, 08-04 −₹7,809 after the marker) — the hard stop has real
    trading value, but soft is the deliberate DATA choice. No flag flip.
  - **Net: no flag earns ENABLE.** Reinforces [P-21] — no feature *creates* edge;
    trend-tells only *reduces* loss. The edge verdict stays on gate #6.

## The measured sessions (edge evidence)
| Date | Trades | P&L | PF | Expectancy |
|---|---|---|---|---|
| 07-22 | 66 | −₹1,277 | 0.39 | −0.44R |
| 07-23 | 51 | −₹1,582 | 0.33 | −0.52R |
| 07-24 | 8 (short) | −₹144 | 0.22 | −0.43R |
| 07-28 | 65 | −₹709 | 0.65 | −0.24R |
| 07-29 | 32 (short — daily stop) | −₹918 | 0.18 | −0.52R |
| 08-03 AM | 30 (−3R hard cut) | −₹4,037 | 0.23 | −0.51R |
| 08-03 PM | 47 (full-day, −3R soft) | −₹1,639 | 0.66 | −0.23R |
| 08-04 | 90 (full-day, −3R soft) | −₹10,827 | 0.16 | −0.64R |
| 08-05 | 41 (full-day, −3R soft) | −₹1,604 | 0.55 | −0.23R |
| 08-06 | 77 (full-day, −3R soft) | −₹5,052 | 0.489 | −0.344R |
| 08-10 | 81 (full-day, −3R soft) | −₹8,528.22 | 0.242 | −0.531R |

_08-03 note: capital raised 25k→100k (so ₹ losses ~4× prior days; R is the
comparable unit). First full-day session (PM) since −3R went soft — PF 0.66,
still no edge. AM (in the "+EV" open window) was the **worst** bucket, PM (after
10:15) the best — inverting the T4 open-window thesis (see FLAG log)._

Cumulative (all-time, **773 closed trades**, 691 carrying `r_multiple`) ≈ PF
**0.343** (gross win ₹21,765.63 / gross loss ₹63,560.75), expectancy
**−0.429R avg**, total **−₹41,795.12** — measured directly from `trades` this
pass (08-10 post-close; see §"2026-08-10 post-session" above for the full
readout and method).
08-10 added 81 trades / −₹8,528.22 (PF 0.242, a weak day — worse than 08-06's
0.489, in similar territory to 08-04's 0.158); no gate flip (still deep
reject zone, PF gate is >1.3 go / <1.1 reject). **Standing conclusion
unchanged: no edge yet → gate #6 is the priority.** Max drawdown (peak-to-
trough equity, all-time) is now **≈−₹42,352** (was ≈−₹33,378 on 08-09) —
deeper, consistent with the soft daily-stop design (a session can bleed past
−3R rather than hard-cutting), not treated as a new regression. Trade-quality
note (T4): the "opening hour is the only +EV window" thesis stays **dented** —
08-04's open vs after-open R (−0.63R vs −0.64R) converged to both-negative, no
spread left to exploit either way. See the FLAG log; re-measure over more
full-day sessions.

## Live subsystems (all shipped + deployed)
- **Advisor** — daily HOLD/SELL on real holdings; `/advisor` + command center.
  - portfolio-risk **v2**: single-name + sector concentration + measured
    return-**correlation** (effective_bets, clusters) + tax-loss-harvest.
  - **Pillar-1 calibration** (DARK): confidence→hit-rate reliability curve.
  - **Weekly confluence** + **daily/weekly alignment** (DARK, logged not scored).
  - **Grading loop**: first 21 calls graded (42.9% hit); factor attribution live.
- **Per-stock agent** — 24/7 observation timeline per holding (P1 mechanical
  capture + P2 pre-open/hourly/post-close scheduler). Fundamentals slot = null.
- **Trader** — paper engine, full-day sessions, rich decision/trade/candle capture.
  −3R daily stop now HARD even in data-collection mode.
- **Dashboard** — command center (Edge strip + EDGE-UNVERIFIED banner), /insights
  (PF + max-DD gate tiles), /advisor (calibration, correlation, day-over-day diff),
  /trading (RiskMeter).

## ⏳ Open — needs the USER
1. **Supabase tier decision (≈6-week clock).** Org confirmed on the free tier
   (500 MB), DB at 97 MB (19%). Upgrade to Pro, or accept running
   [P-38]'s storage-trim plan under that runway (the trim alone doesn't remove
   the need for this decision — see [reference/CAPACITY.md](reference/CAPACITY.md)). [P-38]
2. **Rotate the Telegram bot token** (only real cred left — was in runtime logs).
   BotFather → revoke → `railway variables --set TELEGRAM_BOT_TOKEN=… --service
   zerodha-brain`. Anon-key rotation is **unnecessary** (RLS airtight) — see
   [reference/CRED_ROTATION.md](reference/CRED_ROTATION.md). [P-04]
3. **Fundamentals data source** pick (screener/NSE vs paid) → unblocks agent P3. [P-02]

_Deprioritized by the user (do not foreground): **P-01** Kite ₹500 historical
(gate #6) and **P-03** TOTP auto-login. Sessions now run daily via autopilot
(token paste before 09:15, or the manual afternoon restart pattern) — the
"no sessions" constraint is resolved for now._

## ✅ Verify list — ALL CLEARED 2026-08-03
Every deployed fix verified live against the 08-03 sessions (see the VERIFIED
LIVE section at the top). Nothing pending verification. Calibration itself
unchanged (still 22 graded calls / ECE 48.5% — no new gradeable outcomes yet,
[P-18] stays watch-only). New findings from the 08-03 audit: **K7** (full-day
sessions starve advisor refresh) + **K8** (inplay) in
[reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md); trade-only-open ruled
SKIP (FLAG log above).

## Feedback loop (live)
Project-level flywheel (mirrors VISION §7): REVIEW → TRIAGE → [PIPELINE.md](PIPELINE.md)
→ DO daily → VERIFY. Two scheduled cloud agents keep it timely:
- **Post-session review** — weekdays 16:30 IST — drains shipped items, adds findings.
- **Weekly review** — Sundays 10:00 IST — re-measures gate metrics + verifies impact.

The board is [PIPELINE.md](PIPELINE.md): pull the top **Ready** item each session.

## Routine
- Post-session audits: `/post-session-check`, `/counterfactual-audit` skills.
- Advisor grading: `zerodha-brain/scripts/grade_advice.py [--attrib-only]`.
- Prod Supabase `gilmuwmtdpjccibfhqtx`; timestamps are **UTC** (IST = UTC+5:30).
