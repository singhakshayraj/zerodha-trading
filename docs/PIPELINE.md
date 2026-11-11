# PIPELINE — the execution board

**Where feedback becomes tracked work.** The live kanban: every finding (from a
review, an audit, or you) lands here as an item with a **measure-of-done**;
daily work pulls the top **Ready** item. Strategy/why-order lives in
[ROADMAP.md](ROADMAP.md); current reality in [STATUS.md](STATUS.md).

_Last updated: **2026-11-10** (Tue, post-session pass ~11:14 UTC/16:44
IST — today is the confirmed Diwali-Balipratipada NSE/BSE holiday, so
zero new `portfolio_advice` rows is expected, not a new silence. The
thing that *did* move: `grading_incident` cleared clean (written
2026-11-09 18:30:25 UTC, no `TOKEN_EXPIRED`) — the 11-09 04:49 UTC token
passed its first real nightly test. **[P-42] RE-CLOSES** (reopened
11-05). `graded_calls` still 398, unchanged. DB 235 → 236 MB, +1 MB,
routine.)_

_Previous: **2026-11-09** (Mon, post-session pass ~16:48 IST — the
pre-open fix (fresh token pasted 10:19 IST) held through the whole
trading day: `portfolio_advice` closed at 1,020 rows, first full day
since the 11-03 silence. Calibration recomputed but unchanged (398/400,
ECE 16.3%). **[P-42] stayed Ready** — tonight's nightly grading test was
still the one that would confirm the token, not observable that pass;
it fired later that night (18:30:25 UTC) and cleared clean, which is
what this pass's [P-42] re-close is based on.) ·
Burn-down: **28 shipped + verified live / 0 in-progress / 5 ready (0
active — all 5 paused by the engineering freeze) / 4 blocked / 1
retired ([P-01], decommission)**._

**2026-11-10 post-session pass:** today is the confirmed
Diwali-Balipratipada NSE/BSE holiday — `portfolio_advice` shows **0 new
rows today** (`max(created_at)` still 2026-11-09 09:48:20 UTC), expected
on a non-trading day, not a new silence. **[P-42] RE-CLOSES.**
`app_config.grading_incident` reads clean/empty, written **2026-11-09
18:30:25 UTC** (no `TOKEN_EXPIRED`) — the 2026-11-09 04:49 UTC token's
first real nightly grading test cleared without error, meeting the
item's own measure-of-done (`grading_incident` clean **and** the next
nightly test clearing — both are this one event). `graded_calls` is
still **398** (`max(evaluated_at)` still 2026-10-27) — the clean test
had nothing newly due, so this closes the incident, not the separate
n=400 accrual question (still 2 short, next move expected ~11-16/17 when
the 11-02 MICRO calls mature). `brain_heartbeat` ONLINE, fresh
(`last_ping` 11:14:19 UTC), `brain_status` still `START`/11-03 (no
market-layer write expected on a holiday). Supabase DB size 235 → 236
MB, +1 MB, routine. `git log -25` shows nothing shipped since the 11-09
`chore(review)` commit besides docs — no code-based board move. Dashboard
API (`zerodha-trading-liard.vercel.app`) failed its routine
`connect_rejected` block again (`curl` exit 56) — unrelated, unchanged,
never the real data source; every number above read directly from
Supabase. Full detail in STATUS.md's 2026-11-10 entry.

**2026-11-09 post-session pass:** the pre-open fix held all day.
`portfolio_advice` closed the full trading day at **1,020 new rows**
(04:49–09:48 UTC) — the first complete day since the 11-03 silence
(11-04/05/06 silent, 11-07 Sat, 11-08 Sun had no session due).
`advisor_calibration_latest` recomputed (`built_at` → 2026-11-09) but
`graded_calls` unchanged at **398** (ECE 16.3%, `monotonic=false`) — the
recompute was triggered by the incident-clear, not new grading input.
`trades`/`trading_sessions` unchanged at 1,018/936 (frozen,
decommissioned). `brain_heartbeat` ONLINE, fresh. Supabase DB size
232 → 235 MB, +3 MB, routine. **[P-42] stays Ready** — the fresh 04:49
UTC token's first real test is tonight's nightly grading run (~18:30
UTC/00:00 IST), which has not fired yet as of this pass; confirmation
carries to tomorrow's post-session pass. No board move. Full detail in
STATUS.md's 2026-11-09 entry.

**2026-11-08 weekly review pass:** Supabase read cleanly, a seventh
consecutive clean pass. Dashboard API failed its routine
`connect_rejected` block again (`curl` exit 56), as always, not new.
**Gate metrics re-measured fresh against prod** — frozen, byte-identical
to every reading since the 08-28 freeze: PF **0.3685** (gross win
₹34,540.15 / gross loss ₹93,735.40), expectancy **−0.4213R**, net
**−₹59,195.25**, 1,018 closed trades (936 with `r_multiple`). No gate
flip, none possible (VISION §6.1: PF deep in reject territory).
**Token still not repasted:** `app_config.grading_incident` =
`TOKEN_EXPIRED 2026-11-08: 29/38 due rows could not authenticate; 0
graded` (written 11-07 18:30:33 UTC) — same 29/38 signature carried
since the 11-05 reopen; this is the fourth consecutive weekly-review
confirmation of the failure. `enc_token`/`token_updated_at` both still
frozen at 11-03 05:25:40/41 UTC — now **5 days stale**; `brain_status`
still frozen at `START`/11-03 05:27:56 UTC. `portfolio_advice` confirms
zero rows since 11-03 (`max(created_at)` unchanged at 11-03 09:46:33
UTC) — the three trading weekdays already flagged (11-04, 11-05,
11-06) remain the latest confirmed silence; no new trading weekday has
elapsed since (11-07 Sat, 11-08 Sun — the latter calendar-noted as NSE's
Muhurat trading day, logged as an observation only, no new rows seen).
`brain_heartbeat` stays healthy (`ONLINE`, fresh `last_ping` 11-08
04:36:37 UTC, `current_cycle=0`, "Idle — advisor only") — alive, still
unauthenticated. **Advisor calibration unchanged for a sixth
consecutive reading:** `advisor_calibration_latest` =
`graded_calls=398`, `ece_pct=16.3`, `monotonic=false`,
`built_at=2026-11-03` — byte-identical to 11-02/11-03, consistent with
zero new grading input; still 2 short of the POST_MORTEM §6 n=400 read,
no interim peek taken. **[P-42] stays Ready** — worsening evidence under
the already-reopened item, no board move. DB size 227 → 231 MB (45.4% →
46.2%), +4 MB in 2 days, routine. **[P-43] — holds Done, no new gap**;
`git log` shows a `chore(review)` commit for every trading weekday since
the last gap (11-02 through 11-06), nothing due 11-07/11-08 until this
pass's own weekly commit. 3-lens sanity: advisor lens — n=398/400 and
ECE 16.3% frozen six readings running, fully gated on the token; trader
lens — PF 0.3685 stays deep in reject territory, no flip possible, gate
#6 stays retired/blocked on the user decision; engineer lens — Supabase
access itself is now clean seven passes running ([P-44] holds Done), so
the sole live engineering risk is the `enc_token`/grading pipeline
([P-42]), now 5 days stale. Full detail in STATUS.md's 2026-11-08 entry.

**2026-11-06 post-session pass:** Supabase read cleanly a fifth
consecutive pass. Dashboard API failed its routine `connect_rejected`
block again (`curl` exit 56, agent-proxy confirms `connect_rejected`
×2), as always, not new. **Token still not repasted:**
`app_config.grading_incident` = `TOKEN_EXPIRED 2026-11-06: 29/38 due
rows could not authenticate; 0 graded` (written 11-05 18:30:37 UTC) —
the identical 29/38 count as the 11-05 reading, the third consecutive
failed nightly test since expiry. `enc_token`/`token_updated_at` both
still frozen at 11-03 05:25:40 UTC (3 days stale); `brain_status` still
frozen at `START`/11-03 05:27:56 UTC. `portfolio_advice` has zero rows
for 11-04, 11-05, and 11-06 (checked 11:12 UTC, past NSE close),
`max(created_at)` still 11-03 09:46:33 UTC — third consecutive silent
trading weekday. `brain_heartbeat` stays healthy (`ONLINE`, fresh
`last_ping` 11:12:27 UTC, `current_cycle=0`, "Idle — advisor only") —
alive, still unauthenticated. **[P-42] stays Ready** — this pass is
worsening evidence under the already-reopened item, not a new finding;
no board move. Graded pool unchanged at 398/400 (`max(evaluated_at)`
still 10-27). DB size 225 → 227 MB (45.0% → 45.4%), +2 MB, routine.
**[P-43] — no new gap**, this pass's commit lands immediately after
11-05's. `git log` shows nothing shipped since the 11-05 `chore(review)`
commit besides this pass's own docs edits — no code-based board move.
Full detail in STATUS.md's 2026-11-06 entry.

**2026-11-05 post-session pass:** Supabase read cleanly a fourth
consecutive pass. Dashboard API failed its routine `connect_rejected`
block, as always, not new. **Root cause surfaced for the 11-04 advisor
silence:** `app_config.grading_incident` = `TOKEN_EXPIRED 2026-11-05:
29/38 due rows could not authenticate; 0 graded` (written 11-04 18:30:30
UTC — the "tonight's grading test" the 11-04 pass flagged as pending; it
fired and failed). `enc_token`/`token_updated_at` both frozen at 11-03
05:25:40 UTC (2 days stale); `brain_status` frozen at `START`/11-03
05:27:56 UTC. `portfolio_advice` has zero rows for both 11-04 and 11-05
(checked 11:13 UTC, past NSE close), confirming the resumption streak
broke on this token expiry, not a one-off. `brain_heartbeat` stays
healthy (`ONLINE`, fresh `last_ping`, `current_cycle=0`, "Idle — advisor
only") — alive, just unauthenticated. **[P-42] REOPENED** (see Ready
below), moved out of Done per the [P-43]/[P-44] two-consecutive-failures
precedent. Graded pool unchanged at 398/400 (`max(evaluated_at)` still
10-27), consistent with 0 graded today. DB size 223 → 225 MB (44.6% →
45.0%), +2 MB, routine. **[P-43] — no new gap**, this pass's commit
lands immediately after 11-04's. `git log` shows nothing shipped since
the 11-04 `chore(review)` commit besides this pass's own docs edits — no
code-based board move. Full detail in STATUS.md's 2026-11-05 entry.

**2026-11-04 post-session pass:** Supabase read cleanly a third
consecutive pass. Dashboard API failed its routine `connect_rejected`/403
block, as always, not new. **New, logged only:** `portfolio_advice` and
`brain_decisions` both show zero rows for today (checked 11:13 UTC/16:43
IST, past NSE close); `max(created_at)` on `portfolio_advice` is still
yesterday's 09:46:33 UTC. `app_config.brain_status`/`enc_token`/
`grading_incident` are all still stamped 2026-11-03 — nothing wrote today.
`brain_heartbeat` is healthy and fresh (`ONLINE`, `last_ping=2026-11-04
11:14:01 UTC`, `current_cycle=0`, "Idle — advisor only") — the process is
alive but did not fire today's advisor cycle, breaking the two-day
resumption pattern (11-02: 1,063 rows; 11-03: 810 rows, both well under
way by this time of day). Per this board's own precedent ([P-43]/[P-44]:
two consecutive failures earns a tracked item), this first occurrence is
logged only — a second consecutive silent trading weekday would earn a
new Ready item. **[P-42] holds Done** — carried forward unchanged
(graded pool still 398/400, `max(evaluated_at)` still 2026-10-27; tonight's
grading test, due ≈18:30 UTC, hasn't fired yet). **[P-44] holds Done** —
today's clean read extends the streak, not a reopen condition. DB size
220 → 223 MB (44.0% → 44.6%), +3 MB, routine. **[P-43] — no new gap**,
this pass's commit lands immediately after 11-03's. `git log` shows
nothing shipped since the 11-03 `chore(review)` commit besides this
pass's own docs edits — no code-based board move. Full detail in
STATUS.md's 2026-11-04 entry.

**2026-11-03 post-session pass:** Supabase read cleanly a second
consecutive pass (11-02, 11-03) — no timeout, no auth-required block.
Dashboard API failed its routine `connect_rejected`/403 block, as
always, not new. **[P-44] CLOSES** — its measure-of-done ("two
consecutive scheduled passes with no connection failure") is met; moved
to Done below. **[P-42] — holds Done**, confirmed again: `enc_token
.updated_at` is now 2026-11-03 05:25:40 UTC (a fresh repaste overnight,
newer than 11-02's 01:30:03 UTC reading), `grading_incident` still
empty/clean (updated_at 05:31:27 UTC). Graded pool unchanged at **398**
(`max(evaluated_at)` still 2026-10-27 18:39:18 UTC — no new calls matured
today or yesterday; the 10-27 backlog catch-up was a one-time event).
`advisor_calibration_latest` recomputed today (`built_at=2026-11-03`) but
numbers are byte-identical to 11-02 (`graded_calls=398`, ECE 16.3%,
`monotonic=false`) — a recompute with no new input. **398/400 still two
calls short** of the POST_MORTEM §6 pre-registered read; no interim peek
taken. `portfolio_advice` added **810 new rows today** (2026-11-03,
same order of magnitude as 11-02's 1,063), `brain_status=START` (updated
05:27:56 UTC today) — advisor continues running normally. No new trading
session (expected forever, decommissioned); `trades` unchanged at
1,018/936. Supabase DB size **217 → 220 MB (43.4% → 44.0%)**, +3 MB in 1
day, consistent trickle; [P-38] tier decision still undecided, not
urgent. **[P-43] — no new gap**, this pass's commit lands the trading
weekday immediately after the 11-02 post-session commit. Full detail in
STATUS.md's 2026-11-03 entry.

**2026-11-02 post-session pass:** Supabase access restored (see [P-44]
evidence above) — the first successful query since 10-21. It surfaced that
[P-42] had actually resolved *during* the blackout: `enc_token.updated_at`
is fresh (2026-11-02 01:30:03 UTC), `app_config.grading_incident` reads
clean/empty (last written 2026-11-02 04:20:59 UTC, no `TOKEN_EXPIRED`), and
the graded pool jumped **277 → 398** — the 121-row backlog that had been
stuck since 09-22 graded with `evaluated_at = 2026-10-27`, inside the
blackout window this review couldn't see. `advisor_calibration_latest` was
rebuilt today (`built_at=2026-11-02`, `graded_calls=398`): ECE moved
**12.4% → 16.3%**, `monotonic` still `false` — logged as a trend point,
not a re-open of [P-18]'s closed verdict (criterion there is AUC, not ECE).
**`portfolio_advice` resumed today** — zero rows 2026-09-10→11-01 (confirmed
via `created_at` grouped by day over that range), then **1,063 new rows**
today (2026-11-02, 04:20–09:49 UTC, 20 symbols), in line with pre-silence
daily volumes (e.g. 1,220 rows on 09-10) rather than a runaway write.
`brain_status=START` (updated 06:02 UTC today) — first non-`IDLE` reading
since 09-13. **398/400 graded calls is 2 short of the POST_MORTEM §6
pre-registered read** (hit-rate CI on the market-neutral label); per that
section's own "no interim peeking" rule, the deciding statistic is
deliberately not computed here — only the accrual count is reported. No
new trading session (expected forever, decommissioned); `trades` unchanged
at 1,018/936. Supabase DB size **201 → 217 MB (40.2% → 43.4%)**, +16 MB
since the last reading 12 days ago — faster than the pre-blackout trickle,
consistent with the resumed grading/advice volume; [P-38] tier decision
still undecided, not urgent yet. **[P-43] — no new gap**, this pass's
commit lands the day immediately after the 11-01 weekly review. Full
detail in STATUS.md's 2026-11-02 entry.

**2026-11-01 weekly review pass:** Supabase failed a ninth consecutive
pass, the eighth occurrence of the exact 10-23/10-25/10-26/10-27/10-28/
10-29/10-30 signature (no `CONNECT_TIMEOUT`; `ToolSearch` surfaces zero
Supabase tools, connector reports auth-required) against one occurrence of
the distinct 10-22 timeout signature. Dashboard API failed its routine
`connect_rejected`/403 block, as always, not new (confirmed via the
agent-proxy status log). No evidence available on [P-42] or any
trading/advisor number this pass, so the board does not move on those —
this is the second weekly review in a row (10-25, now 11-01) where the
gate re-measure itself could not run. **[P-43] — holds Done**, already
closed 10-27; this pass's own `chore(review)` commit extends the clean
cadence further without reopening the item. Full detail in STATUS.md's
2026-11-01 entry.

**2026-10-30 post-session pass:** Supabase failed an eighth consecutive
pass, the seventh occurrence of the exact 10-23/10-25/10-26/10-27/10-28/
10-29 signature (no `CONNECT_TIMEOUT`; `ToolSearch` surfaces zero Supabase
tools, connector reports auth-required) against one occurrence of the
distinct 10-22 timeout signature. Dashboard API failed its routine
`connect_rejected`/403 block, as always, not new (confirmed via the
agent-proxy status log). No evidence available on [P-42] or any
trading/advisor number this pass, so the board does not move on those.
**[P-43] — holds Done**, already closed 10-27; this pass's own
`chore(review)` commit extends the clean cadence further without
reopening the item. Full detail in STATUS.md's 2026-10-30 entry.

**2026-10-29 post-session pass:** Supabase failed a seventh consecutive
pass, the sixth occurrence of the exact 10-23/10-25/10-26/10-27/10-28
signature (no `CONNECT_TIMEOUT`; `ToolSearch` surfaces zero Supabase tools,
connector reports auth-required) against one occurrence of the distinct
10-22 timeout signature. Dashboard API failed its routine
`connect_rejected`/403 block, as always, not new (confirmed via the
agent-proxy status log). No evidence available on [P-42] or any
trading/advisor number this pass, so the board does not move on those.
**[P-43] — holds Done**, already closed 10-27; this pass's own
`chore(review)` commit extends the clean cadence further without
reopening the item. Full detail in STATUS.md's 2026-10-29 entry.

**2026-10-28 post-session pass:** Supabase failed a sixth consecutive
pass, the fifth occurrence of the exact 10-23/10-25/10-26/10-27 signature
(no `CONNECT_TIMEOUT`; `ToolSearch` surfaces zero Supabase tools, connector
reports auth-required) against one occurrence of the distinct 10-22
timeout signature. Dashboard API failed its routine `connect_rejected`/403
block, as always, not new (confirmed via the agent-proxy status log). No
evidence available on [P-42] or any trading/advisor number this pass, so
the board does not move on those. **[P-43] — holds Done**, already closed
10-27; this pass's own `chore(review)` commit extends the clean cadence
further without reopening the item. Full detail in STATUS.md's 2026-10-28
entry.

**2026-10-27 post-session pass:** Supabase failed a fifth consecutive
pass, the fourth occurrence of the exact 10-23/10-25/10-26 signature (no
`CONNECT_TIMEOUT`; `ToolSearch` surfaces zero Supabase tools, connector
reports auth-required) against one occurrence of the distinct 10-22
timeout signature. Dashboard API failed its routine `connect_rejected`/403
block, as always, not new (confirmed via the agent-proxy status log).
No evidence available on [P-42] or any trading/advisor number this pass,
so the board does not move on those. **[P-43] — CLOSES.** `git log` shows
a clean `chore(review)` commit for every trading weekday since the 10-12
gap: 10-13, 10-14, 10-15, 10-16, 10-19, 10-21, 10-22, 10-23, 10-26, 10-27 —
**10 consecutive trading weekdays**, meeting the two-clean-week
measure-of-done. Moved to Done below. Full detail in STATUS.md's 2026-10-27
entry.

**2026-10-26 post-session pass:** Supabase failed a fourth consecutive
pass, with the third occurrence of the exact 10-23/10-25 signature (no
`CONNECT_TIMEOUT`; the connector simply reports auth-required and no tools
ever load) against one occurrence of the distinct 10-22 timeout signature —
further narrowing this toward a standing OAuth grant that lapsed and
hasn't been renewed. Dashboard API failed its routine `connect_rejected`/403
block, as always, not new. No evidence available on [P-42] or any
trading/advisor number this pass, so the board does not move on those.
**[P-43] — no new gap**, clean streak now **9 trading weekdays** (10-13,
10-14, 10-15, 10-16, 10-19, 10-21, 10-22, 10-23, 10-26); needs 10-27 clean
too to close the 10-day measure-of-done. Full detail in STATUS.md's
2026-10-26 entry.

**2026-10-25 weekly review pass:** Supabase failed a third consecutive
pass, and for the second time with the *exact* 10-23 signature (no
`CONNECT_TIMEOUT`; the connector simply reports auth-required and no tools
ever load) against one occurrence of the distinct 10-22 timeout signature —
narrowing this toward a standing OAuth grant that lapsed and hasn't been
renewed, not three independent flakes. Dashboard API failed its routine
`connect_rejected`/403 block, as always, not new. No evidence available on
[P-42] or any trading/advisor number this pass, so the board does not move
on those. **[P-43] — no new gap**, clean streak now **8 trading weekdays**
(10-13, 10-14, 10-15, 10-16, 10-19, 10-21, 10-22, 10-23); needs 10-26 and
10-27 clean too to close the 10-day measure-of-done. Full detail in
STATUS.md's 2026-10-25 entry.

**2026-10-23 post-session pass:** both data sources failed this pass too —
a second consecutive occurrence, with a different Supabase failure
signature (**authentication required**, no MCP tools loaded; 10-22 was a
`CONNECT_TIMEOUT`). The dashboard API hit the same org-policy block as
every pass on record (`connect_rejected`, not new, never the real data
source anyway). No evidence available on [P-42] or the trading/advisor
numbers this pass either, so the board does not move on those — nothing
fabricated. `git log` confirms the review's own cadence held: `2597f1b`
(10-22 post-session) is the commit immediately before this pass, no gap, so
**[P-43] unaffected**. Per the 10-22 entry's own stated precedent, two
consecutive data-access failures (even with different root causes) earns a
tracked item rather than staying narrative-only — **new [P-44]** added to
READY below. Full detail in STATUS.md's 2026-10-23 entry.

**2026-10-22 post-session pass:** both data sources failed this pass — the
Supabase MCP server failed to connect (`CONNECT_TIMEOUT`, confirmed across
three retries), and the dashboard API (`zerodha-trading-liard.vercel.app`)
hit the same org-policy block as every recent pass (`connect_rejected`, not
new). No evidence available on [P-42] or the trading/advisor numbers this
pass, so the board is unchanged — nothing moved, nothing fabricated. `git
log` confirms the review's own cadence held: `8c80eda` (10-21 post-session)
is on `origin/main`, no gap, so **[P-43] unaffected**. Full detail in
STATUS.md's 2026-10-22 entry. If this data-access failure recurs next pass,
it earns its own Ready item (same precedent as [P-43]'s promotion); one
occurrence is logged, not yet tracked.

**2026-10-21 post-session pass:** no new trading session (none ever will —
decommissioned); `trades` closed-count unchanged (1,018, 936 with
`r_multiple`). **[P-42] unchanged** — the 10-13 token's eighth consecutive
real test also failed: `grading_incident` written 2026-10-20 18:30:41 UTC
reads the identical `TOKEN_EXPIRED 100/121` signature. `enc_token.updated_at`
unchanged at 2026-10-13 19:05:27 UTC (now 8 days stale, zero further
repaste), graded pool still 277, `advisor_calibration_latest` a fourteenth
consecutive stale reading. **[P-43] no new gap** — `chore(review)` commit
exists for 2026-10-19 (`35e5e80`) immediately before this pass; nothing was
due for 10-20 (confirmed Dussehra NSE/BSE holiday); clean streak since the
10-12 gap now 6 days (10-13→10-16, 10-19, 10-21). DB size 201 MB (40.2%), +5
MB in 2 days, still the slow `amfi_nav` trickle; not urgent, [P-38]
undecided. Dashboard API (`zerodha-trading-liard.vercel.app`) unreachable
from this environment again (`connect_rejected`, org policy); all numbers
measured directly against Supabase prod.

**2026-10-19 post-session pass:** no new trading session (none ever will —
decommissioned); `trades` closed-count unchanged (1,018, 936 with
`r_multiple`). **[P-42] unchanged** — the 10-13 token's sixth consecutive
real test also failed: `grading_incident` written 2026-10-18 18:30:32 UTC
reads the identical `TOKEN_EXPIRED 100/121` signature. `enc_token.updated_at`
unchanged at 2026-10-13 19:05:27 UTC (now 6 days stale, zero further
repaste), graded pool still 277, `advisor_calibration_latest` a thirteenth
consecutive stale reading. **[P-43] no new gap** — `chore(review)` commit
exists for 2026-10-18 (`167d4fe`) immediately before this pass; nothing was
due for 10-17/10-18 (weekend); clean streak since the 10-12 gap now 5 days
(10-13→10-16, 10-19). DB size 196 MB (39.2%), +2 MB in 1 day, still the slow
`amfi_nav` trickle; not urgent, [P-38] undecided. Dashboard API
(`zerodha-trading-liard.vercel.app`) unreachable from this environment again
(`connect_rejected`, org policy); all numbers measured directly against
Supabase prod.

**2026-10-18 weekly review pass:** gate metrics re-measured fresh against
`trades` and are **frozen forever, byte-identical to every reading since the
08-28 freeze** — PF **0.3685** (gross win ₹34,540.15 / gross loss
₹93,735.40), expectancy **−0.4213R**, net **−₹59,195.25**; no gate flip,
none possible (VISION §6.1: PF stays deep in reject territory). **[P-42]** —
the 10-13 `enc_token` has now failed every nightly grading test through
10-17 night: `grading_incident` written 2026-10-17 18:30:43 UTC still reads
the identical `TOKEN_EXPIRED 100/121` signature carried since 09-22, and the
graded pool is unchanged at 277, confirming the token has not authenticated
on any of the five nights since the 10-13 paste. `enc_token.updated_at`
unchanged at 2026-10-13 19:05:27 UTC — now **5 days stale** with zero
further repaste attempt. `advisor_calibration_latest` unchanged
(`graded_calls=194`, ECE 12.4%, `built_at=2026-09-13`) — a **twelfth**
consecutive stale reading. **[P-43] no new gap** — `chore(review)` commit
exists for 2026-10-16 (`83004f8`) immediately before this pass; nothing was
due for 10-17 (confirmed Saturday); clean streak since the 10-12 gap now 4
days (10-13→10-16), extending to 5 after this pass's commit. DB size 194 MB
(38.8%), +3.6 MB in 2 days, still the slow `amfi_nav` trickle; not urgent,
[P-38] undecided. Dashboard API (`zerodha-trading-liard.vercel.app`)
unreachable from this environment again (`ENOTFOUND` DNS resolution
failure); all numbers measured directly against Supabase prod.

**2026-10-16 post-session pass:** no new trading session (none ever will —
decommissioned); `trades` closed-count unchanged (1,018, 936 with
`r_multiple`). **[P-42] unchanged** — the 10-13 token's second consecutive
real test also failed: `grading_incident` written 2026-10-15 18:31:00 UTC
reads the identical `TOKEN_EXPIRED 100/121` signature (the 10-14 run was the
first failed test, confirmed last pass). `enc_token.updated_at` unchanged at
2026-10-13 19:05:27 UTC (no further repaste), graded pool still 277,
`advisor_calibration_latest` an eleventh consecutive stale reading.
**[P-43] no new gap** — `chore(review)` commit exists for 2026-10-15
(`32d8c6c`) immediately before this pass; clean streak since the 10-12 gap
now 3 days (4 after this pass's commit). DB size 190.4 MB (38.1%), +1.4 MB in
1 day, negligible. Dashboard API unreachable again (`connect_rejected`, org
policy); all numbers measured directly against Supabase prod.

**2026-10-15 post-session pass:** no new trading session (none ever will —
decommissioned); `trades` closed-count unchanged (1,018, 936 with
`r_multiple`). **🔴 [P-42] third repaste confirmed failed** — the
`grading_incident` written 2026-10-14 18:30:54 UTC (~23h after the 10-13
19:05:27 UTC paste, the first run to actually test it) reads the identical
`TOKEN_EXPIRED 100/121` signature. Three consecutive repaste attempts
(09-20, 10-05, 10-13) have now each failed their first real test.
`enc_token.updated_at` unchanged at 2026-10-13 19:05:27 UTC, graded pool
still 277, `advisor_calibration_latest` a tenth consecutive stale reading.
**[P-43] no new gap** — `chore(review)` commit exists for 2026-10-14
(`e58f29d`) immediately before this pass; clean streak since the 10-12 gap
now 2 days (3 after this pass's commit). DB size 189 MB (37.8%), negligible
change. Dashboard API unreachable again (`connect_rejected`, org policy);
all numbers measured directly against Supabase prod.

**2026-10-14 post-session pass:** no new trading session (none ever will —
decommissioned); `trades` closed-count unchanged (1,018, 936 with
`r_multiple`). **🟢 [P-42] moved** — `enc_token` repasted **2026-10-13
19:05:28 UTC** (third attempt, ending the 8-day-dead 10-05 token), but the
only `grading_incident` reading so far (written 18:31:00 UTC, before the
paste) still tested the old token and reads identical `TOKEN_EXPIRED
100/121`; outcome of the fresh token is unconfirmed until tonight's run.
Graded pool still 277. **[P-43] no new gap** — `chore(review)` commit
exists for 2026-10-13 (`e63b0d2`) immediately before this pass; clean streak
since the 10-12 gap now 1 day. Dashboard API unreachable again
(`connect_rejected`, org policy); all numbers measured directly against
Supabase prod.

**2026-10-13 post-session pass:** no new trading session (none ever will —
decommissioned); `trades` closed-count unchanged (1,018, 936 with
`r_multiple`). **[P-42] unchanged** — same `TOKEN_EXPIRED 100/121` signature,
`enc_token.updated_at` still 2026-10-05 21:39:20 UTC (now 8 days stale on a
confirmed-dead paste), graded pool still 277. **🔴 [P-43] NEW gap** — no
`chore(review)` commit for 2026-10-12 (Mon), a confirmed plain trading
weekday; this is the fifth distinct occurrence of this pattern and resets the
clean streak to 0. Dashboard API unreachable again (`connect_rejected`, org
policy); all numbers measured directly against Supabase prod.

**2026-10-11 weekly review pass:** no new trading session (none ever will —
decommissioned); `trading_sessions.max(started_at)` unchanged at 2026-08-28
06:54:59 UTC (92 sessions total), `trades` closed-count unchanged (1,018, 936
with `r_multiple`) since 08-28. Gate metrics re-measured fresh and are
byte-identical to the frozen headline: PF **0.3685**, expectancy
**−0.4213R**, net **−₹59,195.25**, max drawdown **−₹59,206.27** (exact match
this pass, no tie-ordering drift). No gate flip; none is possible. **[P-42]
still broken** — `grading_incident` (written 2026-10-10 18:30:50 UTC / 00:00
IST 10-11): `TOKEN_EXPIRED 100/121 due rows; 0 graded`, same signature as
every reading since 09-22; `enc_token.updated_at` still **2026-10-05
21:39:20 UTC** — now **6 days stale on a confirmed-dead paste**, with no
third repaste attempt made since the second one failed (confirmed 10-07).
`git log` shows nothing shipped since the 10-09 post-session commit
(`2e4cf29`) besides this pass's own docs edits — no code-based board move.
**[P-43] cadence check: no new gap** — `chore(review)` commits exist for
10-09, 10-07, 10-06, 10-04, and nothing was due for 10-10/10-11 (Sat/Sun).
The last confirmed gap remains 2026-10-08 (Thu); the clean streak this item's
measure-of-done needs is still just 1 day. Dashboard API
(`zerodha-trading-liard.vercel.app`) unreachable from this environment again
(`ENOTFOUND` DNS failure) — same as every recent pass; all numbers below
measured directly against Supabase prod.

**🔴 [P-42] — still broken, 6 days stale on a dead token, zero repaste
attempts since.** `enc_token.updated_at` is still **2026-10-05 21:39:20
UTC**. `grading_incident` (written 2026-10-10 18:30:50 UTC): `TOKEN_EXPIRED
2026-10-11: 100/121 due rows could not authenticate; 0 graded` — identical
signature to every reading since 09-22. Graded pool unchanged at **277**
(69.25% of n=400). `advisor_calibration_latest` remains stale
(`graded_calls=194`, `built_at=2026-09-13` — now a **seventh** consecutive
stale reading). `portfolio_advice` still 0 new rows since 2026-09-10,
`brain_status=IDLE` — **21 straight silent weekdays** (09-11, 09-14→09-18,
09-21→09-26, 09-28, 09-29, 09-30, 10-01, 10-05, 10-06, 10-07, 10-08, 10-09;
10-02 excluded, a confirmed trading holiday) — unchanged this pass since no
new trading weekday has elapsed (10-10/10-11 are weekend). See updated
evidence under [P-42] below.

DB size **185 MB (37.0%)** — +5 MB in 2 days, slightly faster than the recent
trickle but still `amfi_nav`-driven (now 45 MB, 179,662 rows); not urgent.

## ⛔ The trading engine is DECOMMISSIONED (2026-09-09) — read this before the board below

The board below still carries several items framed around a live trading
engine (post-weekend stress tests, session-start token timing, gate #6). That
engine **no longer exists** — decommissioned 2026-09-09, full record
[reference/POST_MORTEM.md](reference/POST_MORTEM.md), and this fact sat
unreflected on this board for four days (last touched 09-06, three days
*before* the decommission) until this pass. Trading-specific items below are
now annotated RETIRED rather than deleted, so the burn-down history stays
intact. The board's live surface going forward is the **advisor's grading
accrual** (toward n=400, POST_MORTEM §6) and routine docs/data hygiene
([P-38] DB size) — nothing else earns new engineering.

**This pass (weekly review, 2026-09-20):** re-measured the gate metrics
fresh against prod. **Trading metrics are frozen and always will be** —
`trades`/`trading_sessions` cannot grow, confirmed via `trading_sessions`
(`max(started_at) = 2026-08-28 06:54:59 UTC`, 0 rows since). PF **0.3685**,
expectancy **−0.4213R**, max drawdown **≈−₹59,206.27** — identical to every
reading since the 08-28 freeze, and identical to POST_MORTEM's frozen
headline. No gate flip; none is possible now.

**The advisor — the only metric that can still move — didn't move this
week, because it's still blocked:**
- `graded_calls` **stuck at 194** (was 98 → 194 on the 09-08 MACRO wave;
  nothing has matured since), ECE **12.4%**, still `monotonic=false`,
  `built_at=2026-09-13` unchanged. 194/400 = 48.5% of the way to the
  pre-registered read — unmoved for two consecutive weekly reviews.
- **[P-42] grading stall is now in its third consecutive weekly reading
  with zero remediation.** `app_config.grading_incident` (2026-09-20):
  `TOKEN_EXPIRED: 169/204 due rows could not authenticate; 0 graded.`
  Identical 169/204 count since 09-13. `enc_token` last refreshed
  **2026-09-10 03:17 UTC — 10 days stale**. Same block silences the
  advisor's daily run: `portfolio_advice` 0 rows since 2026-09-10, **6
  straight silent weekdays** (09-11, 09-14→09-18), `brain_status=IDLE`
  since 09-13. Clearing the backlog would put the graded pool at ≈398 — on
  the doorstep of n=400. See **[P-42]** below, still the one live Ready item.
- Supabase DB: **152 → 158 MB** (30.4% → 31.6%), +6 MB in 3 days —
  **despite zero new rows in `brain_activity`/`brain_decisions`/
  `portfolio_advice` over the same window.** The growth is `amfi_nav` (a
  separate NAV-ingestion job, fresh as of 2026-09-19), independent of the
  brain outage. [P-38] undecided, not urgent on this trajectory, but the
  "growth paused during the outage" read from 09-13 is corrected: it hasn't.

**git log check:** nothing shipped since the last chore commit (`d9357b5`,
09-17 post-session) besides this pass's own docs edits — no board move
needed beyond [P-42]'s evidence update.

**Prior weekly gate-measure detail (08-23 through 09-06, all pre-decommission
and now historical):** [reference/GATE_MEASURES.md](reference/GATE_MEASURES.md).
The VERIFY-ledger detail this section used to carry each week (V-13/V-14/I-4/
I-1/I-2/I-3/I-7 re-checks) is retired along with the trading engine — see
[reference/VERIFY.md](reference/VERIFY.md) for the frozen final state of each
and POST_MORTEM §7's final invariant sweep for the closing numbers.

> **Where the history went.** This preamble used to stack every prior update,
> and the weekly gate re-measures sat above the board — together pushing the
> actual kanban ~130 lines down. Gate numbers now live in
> [reference/GATE_MEASURES.md](reference/GATE_MEASURES.md); prior preambles are
> in `git log docs/PIPELINE.md`, which is a better changelog than a doc that
> only ever grows. **Keep this section to the current pass.**

---

## 📊 Gate re-measure — latest 2026-10-11 (weekly, post-decommission)

**PF 0.3685 · expectancy −0.4213R · max drawdown ≈−₹59,206.27 — frozen
forever, decommissioned 2026-09-09.** These three numbers can never move
again; re-confirmed fresh against prod this pass (PF and expectancy
byte-identical; drawdown re-derived via a running peak-to-trough sum landed
≈−₹59,196.80, within ₹10 — exit-time tie-ordering noise, not a new figure).
**Advisor calibration snapshot still ECE 12.4% (n=194 as recorded,
`built_at=2026-09-13`) — the one metric that can still move is currently
not moving**, because grading has been blocked on a stale `enc_token` for
**14 straight days**, the longest gap on record (see [P-42]). Note the
snapshot itself is now stale against the DB for a third consecutive weekly
review: the actual graded pool is **277**, not 194 — the calibration
recompute is a separate gap from the grading stall and hasn't been
triggered since 09-13 despite 83 rows of headroom. No gate flip on either
front: the trading gate is frozen deep in reject territory (VISION §6.1)
and the advisor's own pre-registered read is not due until n=400 graded
calls (currently 277, plus 121 due-but-blocked on a token — see [P-42]).
Full history, method and the 3-lens read:
**[reference/GATE_MEASURES.md](reference/GATE_MEASURES.md)** (historical from
here on — trading figures cannot change; only the advisor rows will update).
Next weekly review due Sunday 2026-10-11, unless a token paste clears the
backlog first and triggers the n=400 read before then.

**2026-10-06 post-session addendum:** `enc_token` was repasted 2026-10-05
21:39:20 UTC, but the grading run that would test it hadn't fired yet as of
this pass (see [P-42] below) — the "14 straight days" line above is now
historical, not current; the next post-session/weekly pass confirms whether
grading actually resumed.

**2026-10-07 post-session addendum:** that test ran (2026-10-06 18:30:28
UTC) and failed — still `TOKEN_EXPIRED`, same 100/121 signature. The repaste
did not resume grading; see [P-42] below.

**2026-10-11 weekly-review addendum:** PF/expectancy/drawdown re-confirmed
byte-identical again this pass (see preamble above). No further repaste
attempt has been made since the 10-05 one failed — `enc_token` is now **6
days stale on a confirmed-dead token**. Calibration snapshot staleness
extends to a **seventh** consecutive weekly review (graded pool still 277,
unchanged since 09-20). Next weekly review due Sunday 2026-10-18, unless a
token paste clears the backlog first.

**2026-10-18 weekly-review addendum:** PF/expectancy/net re-confirmed
byte-identical again this pass (see preamble above). `enc_token` is now **5
days stale** since the 10-13 repaste, which has now failed every nightly
grading test through 10-17 night — zero further repaste attempts tried.
Calibration snapshot staleness extends to a **twelfth** consecutive reading
(graded pool still 277, unchanged since 09-20). Next weekly review due
Sunday 2026-10-25, unless a token paste clears the backlog first.

**2026-10-25 weekly-review addendum:** no re-measure possible — Supabase
unreachable this pass (see [P-44]), the third consecutive data-access
failure. PF/expectancy/drawdown/calibration all carry forward unconfirmed
from the 10-18 reading above. Next weekly review due Sunday 2026-11-01,
unless access is restored first.

**2026-11-01 weekly-review addendum:** no re-measure possible for a
second straight weekly review — Supabase unreachable this pass too (see
[P-44]), the ninth consecutive data-access failure overall. PF/expectancy/
drawdown/calibration all still carry forward unconfirmed from the 10-18
reading above; nothing below has moved because nothing could be read.
Next weekly review due Sunday 2026-11-08, unless access is restored
first.

**2026-11-08 weekly-review addendum:** access restored (clean since
11-02, see [P-44] Done); PF/expectancy/net re-measured fresh and
byte-identical to every reading since the 08-28 freeze — **PF 0.3685,
expectancy −0.4213R, net −₹59,195.25**, 1,018 closed / 936 with
`r_multiple`. No gate flip, none possible. Calibration snapshot
(`graded_calls=398`, ECE 16.3%, `monotonic=false`, `built_at=2026-11-03`)
is unchanged for a sixth consecutive reading — the grading stall
([P-42], reopened 11-05, now 5 days stale) is blocking the one metric
that could still move; still 2 short of the POST_MORTEM §6 n=400 read.
Next weekly review due Sunday 2026-11-15, unless a token paste clears
the backlog first.

## The feedback loop (how this board is fed + drained)

```
 REVIEW ─▶ TRIAGE ─▶ PIPELINE ─▶ DO (daily) ─▶ VERIFY ─▶ REVIEW
 cadence   finding→   item lands   pull top     next review
           solution   w/ measure   Ready, ship  re-measures
```

- **REVIEW (cadence):** per market session — `/post-session-check` +
  `/counterfactual-audit` (small findings, daily); **weekly** — a 3-lens eval +
  re-measure the gate metrics (big findings). Automated via the scheduled agents
  (see §Cadence at the bottom).
- **TRIAGE:** each finding → an item below with owner + a *measurable* done.
  Findings live in KNOWN_ISSUES with their own IDs (`K`/`W`/`A`/`B`); a finding
  earns a `P-nn` here only when it becomes tracked work. The two namespaces are
  deliberately separate — `K7` is not `P-07`.
- **DO:** each working session, pull the top **Ready** item, ship it, move it to
  **Done**, add one line to STATUS.
- **VERIFY:** shipping owes a row in
  [reference/VERIFY.md](reference/VERIFY.md) — runnable SQL plus the number
  that counts as a pass. `/post-session-check` runs that ledger as its §0 and
  writes the result back: **PASS** closes the item here, **FAIL** returns it to
  **Ready** carrying the failing number.

**The rule that makes the loop closed:** a fix with no VERIFY row is not
shipped, it is *unmeasured*. [P-05] spent two days marked verified on a number
that turned out to measure half the book — that is precisely the failure this
ledger exists to prevent.

Item format: `[ID] Title — owner · measure-of-done · source`
Owners: **[me]** buildable now · **[you]** decision/action · **[both]**.

---

## 🔴 BLOCKED — waiting on a decision/action (mostly [you])

- **[P-46] Grader can't price a sold, non-Nifty-500 holding — its pending
  calls never grade (KNOWN_ISSUES [D3]).** [me] · *done =* a symbol in
  neither the pin nor live holdings still gets daily candles in
  `advisor_backtest`, and MAHLIFE's 11-02 row grades. · *source:* 2026-11-09
  log audit (`no instrument token for NSE:MAHLIFE`). **Blocked on:** the V-20
  n=400 read — grading-path change, do after. Impact today 1 row; owes VERIFY
  a row. Natural to fold into [P-45]'s grader work, or the token-free
  bhavcopy grading idea (grade from NSE's public daily closes, no Kite
  token needed) — both touch the same function.
  **2026-11-09: BUILT on branch `fix/grader-d3-d4` (brain `088958c`), not
  merged.** D3 public-master fallback + D4 maturity-before-fetch, 3 new tests,
  suite 983 passing. **Merge after the V-20 read** — neither change alters any
  grade value, but D3 adds rows (MAHLIFE 11-02) to the pool, which would change
  the composition of the pre-registered n=400 sample. VERIFY row to add on
  merge: next dead-token pass reports only truly-due rows; MAHLIFE 11-02 grades.

- **[P-45] Multi-account (multi-tenant) advisor — add a second Kite account
  (Natwar Raj Singh) alongside the current one (Kanaklata).** [me] · *done =*
  both accounts get their own official `portfolio_advice` run on the same
  trading day from one brain deploy, each graded with its own token, and
  Kanaklata's calibration/V-20 numbers are byte-identical before vs after the
  migration. · *source:* user decision 2026-11-09 (chose single-stack
  multi-tenancy over a second isolated deployment). **Approved exception to
  the 2026-09-09 engineering freeze.**
  **Blocked on:** (1) the V-20 n=400 read completing first — this item
  rewrites the grading/token path that read depends on; (2) Natwar's consent
  and his own Kite login.
  **Decided 2026-11-09:** no separate dashboard login for Natwar — the
  existing single dashboard gets an **account toggle** (Kanaklata / Natwar).
  Token paste is **per account and independent**: the operator may paste
  either token or both on a given day; whichever account has a live token
  runs, the other idles without error. Dashboard auth (+1–2 days) not needed.
  **2026-11-11 PROVISIONAL SHIPPED (brain `5d34056`, dashboard): Natwar's
  consent given. `/connect` has a second token card → `enc_token_natwar`;
  the brain's `account_preview` advises his holdings (advise + thesis +
  risk) once a day after 09:45 on his token into `advisor_natwar_latest`;
  `/advisor` has a Kanaklata/Natwar toggle. Never writes `portfolio_advice`
  — not graded, no digest. The full design (per-account grading, accounts
  table) still waits for V-20.**
  **Design constraints (agreed):** additive only — `account_id` column
  defaulting to Kanaklata on `portfolio_advice`, `holdings_snapshot`,
  `user_executions`, `advisor_paper_positions`, `holding_scheme_map`;
  per-account token keys in `app_config`; the Nifty-500 universe scan stays
  shared (account-agnostic), only holdings advice is per account; each
  account's loop is isolated (a dead token on one never stops the other);
  calibration and the V-20 read stay filtered per account until pooling is
  explicitly decided; Natwar's account ships disabled until one dry run
  passes. Owes VERIFY a row (the before/after byte-identical check above).
  Estimate **3.5–5 days**. **Design:**
  [specs/2026-11-09-multi-account-advisor-design.md](superpowers/specs/2026-11-09-multi-account-advisor-design.md)
  (advisor-only revision of the 08-26 multi-tenant plan; one worker service
  per account, single Telegram poller, V-20 stays `primary`-only).

- ~~**[P-01] Gate #6 backtest — the edge verdict.**~~ 🔴 **RETIRED 2026-09-09,
  will not run.** The decommission decision was made *without* running gate #6:
  even a positive backtest would have needed a rebuild, not a deployment,
  because SEBI's Algo-ID framework (binding 2026-04-01) leaves no compliant
  path for this system's scraped-`enc_token` auth. Spending ₹500/mo to answer
  a question whose answer can no longer be acted on is not worth it. Full
  reasoning: [reference/POST_MORTEM.md](reference/POST_MORTEM.md) §1, §5. Kept
  here (not deleted) so the burn-down reflects that this was a deliberate
  stand-down, not an oversight.

- **[P-38] Supabase is on the FREE tier (500 MB) and will not hold a year.**
  [you] · *done =* tier decision made. · *source:* [P-37] capacity + the 08-23
  weekly review's own measurement (**97 MB / 500 MB, 19%**).
  _Projected growth is ~3.3 GB/yr; the storage plan's lossless savings are
  ~600 MB/yr. That gap is not closable by optimisation — **the fix is a tier
  change** (Pro = 8 GB ≈ 2.4 years). Tasks 1/2/4 shipped 08-23 anyway because
  they are cheap and lossless; Task 3 (`market_context`) is deliberately parked,
  since it is the only one that can lose data and it is not worth that risk to
  buy weeks._
  _**2026-09-13 (post-decommission):** DB now **148 MB / 500 MB (29.6%)**, up
  from 135 MB. The old ~7.6 MB/session growth driver (trading writes) is gone
  for good — the trading engine is decommissioned — so this now grows only
  from advisor/grading writes, much slower. The projection above no longer
  applies; not urgent on the new trajectory, but the tier decision itself is
  still undecided._

- **[P-02] Fundamentals provider (agent P3).** [you→me] · *done =*
  `stock_observations.payload.fundamentals` non-null. · *blocked on:* source pick.
  _Paused by the 2026-09-09 engineering freeze (POST_MORTEM §6: no market-layer
  commits except grading/accrual fixes) — not being actively pursued regardless
  of the source-pick decision until the freeze lifts._
- **[P-03] TOTP headless auto-login (SE3).** [you→me] · *done =* a session starts
  with no manual token paste. · *blocked on:* Zerodha API/TOTP setup.
  _07-31 review: the manual-paste dependency just cost 2 consecutive trading
  days (07-30, 07-31 — both regular NSE sessions) — brain online + heartbeating
  but no START command, zero sessions/trades/advisor runs either day. Sharpens
  priority on this item once unblocked._
  _08-02 review: unresolved — still zero sessions since 07-29 (heartbeat
  confirms brain ONLINE, `current_cycle=0`, "Waiting for START command" as of
  08-02 04:39 UTC). No new trading weekday has passed since the 07-31 flag
  (08-01/08-02 are weekend), so the day-count hasn't grown, but the pipeline
  has now produced zero fresh data for a full calendar week — blocking VERIFY
  on [P-05], [P-07], [P-16] and the P-15/P-17 fixes below alike._
- **[P-04] Rotate Telegram bot token (+ anon key = unnecessary).** [you] · *done
  =* new Telegram token live, old dead. · *source:* Sprint 0 security fix.
  _⚠️ **2026-08-23: the FUNCTIONAL half is already live** — token set and valid
  (`getMe` → @singhakshayraj_bot), chat reachable, digest + intraday alerts
  enabled, and the 09:16 preflight would fire on the current stale token. What
  remains is only the **security rotation** of a token that appeared in Railway
  logs pre-scrub. Every note elsewhere claiming the alarm was dormant for want
  of this token was wrong._
  _08-03 audit ([reference/CRED_ROTATION.md](reference/CRED_ROTATION.md)):
  repos + full git history are clean (no secret ever committed); RLS verified
  airtight (sensitive tables service_role-only, rest deny-all, no rls_disabled
  errors). So the anon key is safe-by-design → **skip rotating it** (rotation
  would force a JWT-secret regen that also breaks service_role, for ~zero gain).
  The ONE real action is the **Telegram token** (was in Railway logs pre-scrub):
  BotFather → revoke → `railway variables --set TELEGRAM_BOT_TOKEN=… --service
  zerodha-brain`. Runbook has exact steps. Reduced from a 2-cred task to 1._
  _**08-13 evidence, not a reprioritization:** the dependency this item guards
  against just cost **3 consecutive weekdays** (08-11/08-12/08-13) — zero rows
  in every session-scoped table, heartbeat ONLINE/`current_cycle=0`/"Waiting
  for START command" throughout. Previously worst-documented gap was 2 days
  (07-30/07-31); this is now the worst case on record. Still user-deprioritised,
  not re-raised here — logged so the next priority review has the number._
  _**08-14 evidence:** extends to **4 consecutive weekdays** (08-11→08-14),
  same signature (heartbeat ONLINE, `current_cycle=0`, "Waiting for START
  command", zero session/decision/advice rows). Still not re-raised — logging
  only._
  _**08-17 evidence:** extends to **5 consecutive weekdays** (08-11, 08-12,
  08-13, 08-14, 08-17 — weekend excluded), same signature. Still not
  re-raised — logging only._
  _**08-23 weekly-review evidence:** extends to **9 consecutive weekdays**
  (08-11 through 08-21, weekends excluded — 08-15/08-16 and 08-22/08-23
  skipped), same signature (`brain_heartbeat` ONLINE, `current_cycle=0`,
  "Waiting for START command", zero rows in `trading_sessions`/
  `brain_decisions`/`portfolio_advice` for the whole window). This is now the
  longest gap on record for this project, more than double the previous
  worst case (4 days). Still not re-raised per standing user
  deprioritization — logging only, so the next priority review has the
  number._
  _**08-31 post-session evidence:** the streak broke 08-24→08-28 (five
  sessions ran that week), but **today missed** — `brain_heartbeat` at
  11:15:58 UTC (16:45 IST, past close) still shows ONLINE / `current_cycle=0`
  / "Waiting for START command", `trades` closed-count unchanged at **1,018**
  (same as 08-28). Same signature as every prior gap: the token was never
  pasted. Notable only because today was the **Monday post-weekend session
  [C7]/I-4 was supposed to stress-test** (see STATUS 08-27/08-28 and the
  Ready-board note above) — that test did not happen and carries to the next
  session that runs after a weekend gap. Still not re-raised — logging
  only._
  _**09-06 weekly-review evidence:** the gap did not stop at 08-31 — **zero
  sessions ran the entire week** (08-31 through 09-04, all five weekdays),
  confirmed via `trading_sessions` (`max(started_at)` still 08-28) and
  `app_config.brain_status = IDLE` (updated 09-04 09:49 UTC). `trades`
  closed-count unchanged at 1,018 throughout. This extends the outage to
  **6 consecutive silent weekdays** (08-31→09-04, plus the earlier miss) and
  means the [C7]/I-4 post-weekend stress test still has not been observed on
  any Monday since the fix shipped. Still not re-raised — logging only, per
  standing user deprioritization.__
  _**2026-09-13 (post-decommission):** this evidence log is now closed — the
  trading engine that the token-paste dependency gated is decommissioned
  (2026-09-09), so no future Monday will ever run this stress test, and this
  item's original subject (trading sessions) no longer exists. The mechanism
  lives on in a new, narrower form: the advisor's **grading** job also needs a
  fresh `enc_token`, and stalled on exactly this dependency 2026-09-13 — see
  **[P-42]** below, which is the item to work, not this one._
- **[P-38] Storage-scaling plan — execute or defer.** [you→me] · *done =* a
  decision on Supabase tier (upgrade to Pro vs. stay free), then the plan at
  `docs/superpowers/plans/2026-08-10-storage-scaling.md` either runs (6 tasks,
  31 checkbox steps) or is explicitly deferred with the tier upgraded instead.
  · *source:* [P-37]'s capacity pass. · *blocked on:* the plan's own Task 0
  gate. **Confirmed 2026-08-10 (post-session): org is on the free tier**, DB
  at 97 MB / 500 MB (19%), ≈6 weeks of runway at the measured growth rate —
  the plan's own escalation clause fires ("stop and escalate... the correct
  fix is a tier change, not 600 MB of savings"). The trim plan alone does not
  remove the need for that decision — it only stretches runway.
  _**08-23 weekly review:** DB size re-measured at **97 MB / 500 MB (19%),
  unchanged byte-for-byte since 08-10** — with zero trading sessions writing
  data across the 9-weekday gap above, the runway clock has paused rather
  than continued counting down. Not a reason to deprioritize the decision
  (it resumes ticking the moment sessions restart), just a note that no
  extra urgency has accrued this week._
  _**09-06 weekly review — first real growth data point since the tier
  decision was flagged.** DB size is now **135 MB / 500 MB (27.1%)**, up
  **+38 MB** from the 97 MB baseline. All of that growth came from the five
  sessions that ran 08-24→08-28 (≈**7.6 MB/session**), confirming [P-37]'s
  original ≈7.88 MB/session estimate almost exactly — not a surprise, but the
  first live confirmation. At that rate the remaining 365 MB is
  **≈48 sessions of runway** if sessions resumed at a normal weekday cadence;
  the clock is paused again now (zero sessions since 08-28, see [P-04]
  evidence above). Decision still not made; not re-raising beyond this
  number update._

## 🟢 READY — pull these now (no blocker, [me])

- _(none active)_ — [P-42] closed 2026-11-10 (see DONE); everything else
  below is paused by the 2026-09-09 engineering freeze.

_Everything else on the board is paused by the 2026-09-09 engineering
freeze; see the next section._

⚠️ **Everything below this line is paused by the 2026-09-09 engineering
freeze** (POST_MORTEM §6: no market-layer commits except grading/accrual
fixes). Kept on the board rather than moved to Backlog/Parked because none
of it was rejected on the merits, only superseded by the decommission; do
not pull any of it without first checking whether the freeze has been
explicitly lifted.

- **[P-40] Storage Option B — de-duplicate per-cycle data out of `brain_decisions.indicators`.** [me] · *done =* `market_context` and `event_policy` no longer stored per decision; measured bytes/row drop recorded in VERIFY.
  `market_context` (232 B) and `event_policy` (92 B) are **byte-identical for every decision in a cycle** — ~85 rows per cycle, ~2,900 times a session. Compression cannot touch this: pglz compresses each row independently, so cross-row duplication is invisible to it. Only a foreign key removes it, and a `market_context` table already exists (235 rows) to point at.
  Estimated ~25–30% off the largest table — **larger than the compression attempt was ever going to deliver**, and it does not depend on any codec behaving.
  Deferred by the user 2026-08-27 ("we'll come back to it later"); raised only when they ask.
  ⚠️ Sequencing: this needs the `event_policy` sparse-drop bug looked at too — the logic is supposed to omit `NORMAL`, yet it is present on every sampled row with min = max.

- ~~**[P-41] Settle whether this data compresses at all.**~~ ✅ **DONE 2026-08-27 — answer is NO.**
  Measured in-database with a scratch table and an uncompressed control column, same 500 real blobs: **pglz compressed 0 of 500 rows, lz4 compressed 0 of 500** (1,427 B → 1,431 B, a 4-byte header difference). Harness validated in the same table — a repetitive blob compressed 2,015 → 51 B, ~97%.
  The old 42% estimate measured the JSON **text** form; Postgres stores **jsonb binary**, which has already stripped the quotes/colons/commas that made text look compressible. **Compression is closed as a storage lever.** Remaining levers: [P-40] de-duplication, and storing less.



- ~~**[P-36] Aggregate at the data, not in Node.**~~ ✅ **SHIPPED 2026-08-10.**
  Architect pass over the API layer. The codebase already had the right pattern
  (`/api/analytics/insights` calls Postgres RPCs) and applied it inconsistently;
  the heavy routes pulled whole tables over the wire because PostgREST cannot
  aggregate. `/api/autopsy` was making **24 sequential round trips** for all
  23,835 candles, then discarding ~73% client-side.
  Three new functions (`autopsy_dataset`, `learn_stats`, `insights_totals`),
  each returning one `jsonb` row so the 1000-row page cap stops mattering.
  **Combined latency 5.04s → 0.94s (−81%)**; autopsy −85%, insights −73%,
  learn −86%. Output verified identical field-by-field on all three, and
  `totalDeployed` is now *more* accurate (Postgres `numeric` vs accumulated JS
  float drift). Rule written up in
  [reference/ENGINEERING_SPEC.md](reference/ENGINEERING_SPEC.md) so new routes
  inherit it. No new security lints (`security invoker` + pinned `search_path`).

- ~~**[P-35] Re-test the entry edge on the grown sample.**~~ ✅ SHIPPED 2026-08-10
  · 🔴 **RESULT REVERSED 2026-08-23 — no entry edge.** Labelling 08-10 (329
  decisions) took pooled out-of-sample from **+0.097R (t=+3.0) → −0.003R
  (t=−0.1)**; the rule scored **−0.532R** on 08-10, its worst day. V-12 FAILED
  exactly as registered. Nothing was enabled, so nothing needs reverting. The
  rule still beat plain SHORT 9/10 days, so it was never merely directional —
  it picks better-than-average entries, just not better than the 0.309R cost of
  taking them. Original entry:
  ✅ **SHIPPED 2026-08-10** (brain `scripts/edge_study.py`). **Reverses [P-21].** The sample
  had grown 1,597 → 5,481 labeled decisions across 10 days (SHORT labels on ten
  days, not two), retiring the exact limitation [P-21] named — and nobody had
  re-run it. Walk-forward out-of-sample: **+0.097R net, n=1,383, t=+3.0**; the
  frozen rule beats plain SHORT on **9/9 days**. Both boring explanations ruled
  out and now checked automatically by the script: cost is flat across rules (the
  edge is in gross, +0.374R vs +0.105R), and it is not merely shorting a falling
  market. Verify **V-12**; writeup
  [reference/EDGE_STUDY_P35.md](reference/EDGE_STUDY_P35.md).
  _⚠️ **Not evidence of profitability.** Counterfactual labels rather than real
  fills, +0.097R against an average 0.310R cost, one 10-day market period, and
  4/7 OOS days positive. Nothing is enabled — the follow-up is to re-run it after
  each session and see whether it survives, which is how [P-21]'s version died.
  Also backfilled 08-07's 366 missing labels as part of this._

- ~~**[P-24] Advisor paper book double-counts realized P&L.**~~ ✅ **DONE
  2026-08-10 — code (brain `f645ff3`) + DB repair both complete.** The repair
  ran against prod pre-market once the Supabase connector came up: 18 rows /
  −₹77,325.36 → **11 / −₹45,796.41**, duplicate sum −₹31,528.95 removed, every
  target hit exactly. **V-4 PASSED, I-1 back to 0 rows.** Rollback snapshot:
  `scripts/p24_rollback_2026-08-10.sql` (brain repo).
  _The code half had already been verified live on 08-07 (20 advisor runs / 120
  rotations, zero new dupes). The "targets go stale, re-derive them" warning
  turned out not to bite this time — the book had not grown since 08-07 — but
  deriving at run time is still the right habit, since it moved once already
  (9/−39,983.84 → 11/−45,796.41)._
  _Note the audit's TRIM claim was wrong — ITC 40+40 and SILVERBEES are honest
  half-trims, not full exits; KNOWN_ISSUES §A1 corrected, and those rows were
  confirmed untouched after the repair._
- **[P-32] Grade a verdict the day its `stop_level` breaks, not 30 days later.**
  [me] · *done =* every open `portfolio_advice` row carrying a `stop_level` is
  checked each session against the daily close; a break writes an
  `invalidated_at` + the close that broke it, and those rows become gradeable
  immediately. Measure: **the graded pool grows by more than the ~3 MICRO
  rows/session it grows by today**, and ECE is recomputable without waiting for
  the 30-day MACRO wave. · *source:* `thesis-tracker` via
  [reference/FINSERV_PLUGINS.md](reference/FINSERV_PLUGINS.md) §A.
  _The advisor already emits `stop_level` — "hold while ₹520 holds" — and then
  never looks at it again. Checking it is a fast, unambiguous falsification
  that needs no new data. Directly attacks [P-18]'s small-n stall._
  _⚠️ Design question to settle first: a break is evidence the HOLD was wrong,
  but only if the level was meant as a thesis invalidation rather than a
  suggested stop for the user. Read `advise()` before building — SELL sets
  `stop = None`, so coverage is partial by construction._
- ~~**[P-33] Every verdict carries a bear case.**~~ ✅ **SHIPPED 2026-08-10**
  (brain `bcdb667`, dashboard). `build_counter_case()` states the opposite side
  in the verdict's own numbers — HOLD names the level whose daily close ends it;
  TRIM gets **two** different cases because it has two causes (overextended =
  you capped the upside, mixed = you booked a loss on noise); SELL argues the
  reversal; SELL_ON_BOUNCE names both ways it fails. Surfaced on `/advisor` as
  its own labelled block, **not** another bullet in the confirmatory list.
  Verify **V-11**. Suite 925.
  _Migration applied before the code, deliberately: `advise()`'s dict spreads
  straight into the insert, so shipping code first would have broken the
  advisor. An unrecognised verdict returns a loud "treat as unfalsifiable"
  rather than '' — the failure mode to avoid is looking compliant._
  _Half the measure is deferred by arithmetic, not by omission: grouping graded
  outcomes by whether the counter-case happened needs ~30 trading days of
  matured MACRO advice that carries one._
- **[P-34] No-trade band on the rotation advisor.** [me] · *done =* rotation
  suppresses any switch whose modelled edge is below a configurable band, with
  the band expressed in the same round-trip cost units the frontier uses;
  measured against the counterfactual of trading anyway. · *source:*
  `portfolio-rebalance`, FINSERV_PLUGINS §C.
  _[P-29]/[P-30] measured cost drag at −0.239R of a −0.401R loss and showed no
  exit policy clears breakeven even at zero cost. A no-trade band is the
  standard answer to that arithmetic. **Rotation advisor only — not the
  intraday engine**, whose pacing is deliberately loose for data collection._
  _⚠️ Ordering: this is a live-behaviour change to advice the user may act on.
  It should follow [P-24]/[P-26], which are already rewriting the same book._
- **[P-26] Decide the paper MANAGEMENT seed basis.** [me→you] · *done =* seed
  price rule chosen + implemented. · *source:* 08-06 audit §A2.
  _Seeding at the holdings' **cost basis** books pre-advisor history (RVNL −46.3%,
  NBCC +73.0%) as advisor realized results. Alpha is unaffected (baseline carries
  it too) but the win/loss scorecard reads as advisor skill when it isn't.
  **Recommend seeding at seed-day price** so the advisor only owns what happened
  after it spoke. Bundle with [P-24]._


- **[P-06] Module split part 2 — PARTIALLY DONE (advisor family + database.py all <600).** [me] · *done
  =* no file >600 lines, suite green. · *source:* SE4.
  _08-02–03 shipped: the **entire advisor family is now split and all <600** —
  `advisor_scoring.py` 554 (scoring/`advise`, brain `4cb62ce`) + `advisor_rotation.py`
  59 (rotation helpers, brain `a89b82d`), on top of part-1's advisor_risk/digest.
  **portfolio_advisor 1155 → 587**, behaviour-identical, suite 847 green, F-lint
  clean throughout. Patch-namespace hazards handled per split (weekly_trend
  repointed to advisor_scoring; rotation/news_sentiment untouched-safe).
  **Status (08-04): advisor family + database.py all <600.** Remaining offenders
  are the two highest-risk files + config (exempt):
  • brain.py 2211 — one monolithic `TradingBrain` class; methods share `self`,
    so a split needs mixins/surgery on the trade engine.
  • database.py 1359 → 905 → **561 (now <600 ✅)** — two increments (brain
    `9e370ac` + `4f8cff7`): `db_stocks.py` 479 (stock/observation/universe/level/
    advice-snapshot, 28 fns) + `db_records.py` 362 (decisions/quotes/candles/news/
    tradebook/advice-grading + `_fetch_all`, 17 fns). Same call-time
    `database.supabase` pattern so the 33 `patch('database.supabase')` sites still
    bite (verified each time); nothing in either block is patched by name. Suite
    855, cov 88.6%. **database.py is DONE.**
  • scheduler.py 868 — 64 `patch('scheduler.db')` + dense monkeypatching → any
    extraction risks mass patch-repointing. Highest-risk of the three.
  • config.py 644 — flat flag declarations, exempt.
  _Verdict: advisor family + database.py done via the safe facade pattern. brain.py
  + scheduler.py remain disproportionate risk for a line count (live engine, dense
  monkeypatching) — do only if a file becomes a real merge-conflict/nav pain, one
  carefully-verified pass at a time. config.py exempt._
- ~~**[P-18] Advisor calibration is poor and non-monotonic.**~~ ✅ **ANSWERED
  2026-08-25 — confidence carries no information; never promote it.** The ≥50
  gate opened on 08-24 (37→79 graded). On n=98: **corr 0.0205 (t=0.20), AUC
  0.4556**, avg confidence 70.3 when right vs 69.8 when wrong. The 90–100 bin
  hits 28.6% against a 48% base rate.
  _⚠️ **This item's own success criterion was wrong.** It asked for ECE +
  monotonicity, which measure CALIBRATION, not DISCRIMINATION — and a signal
  that always predicts the base rate is perfectly calibrated and useless. ECE
  falling 30.3%→22.6% looked like progress and was just compression toward the
  base rate. Replacement criterion for any re-open: **AUC materially above 0.5 under BOTH labels** (absolute and market-neutral; `scripts/advisor_discrimination.py`),
  not a better ECE._ Writeup:
  [reference/P18_CALIBRATION.md](reference/P18_CALIBRATION.md).
  _Original item + history below, kept for the record._ First
  recorded baseline: ECE 48.5%, `monotonic=false`, `built_at=2026-07-29`.
  _08-05: graded_calls 21→28, hit rate 42.9%→39.3% — still small-n, DARK,
  watch only._
  _**08-06 — timeline corrected.** 31 graded. The ≥50 gate is NOT days away:
  ~85% of advice rows are `trigger_type=MACRO` and mature at a **30-trading-day**
  horizon, so only ~3 MICRO rows grade per session. First MACRO wave (07-12, 19
  rows) matures ~**08-24**; 07-22's ~**09-02**. Realistic ECE re-measure date:
  **late August**. Don't re-open this weekly expecting movement._
  _**08-09 weekly review:** ECE itself moved for the first time — **48.5%→35.6%**
  (`built_at=2026-08-07`, still `monotonic=false`), graded pool unchanged at 31
  (no new session this week). Directionally good but n is still ~40% of the
  action gate; recorded in [reference/VERIFY.md](reference/VERIFY.md) W-B so
  it's tracked as a trend line, not treated as a verdict on one reading._
  _**08-16 weekly review:** graded pool grew 31→37 and ECE fell further,
  35.6%→30.3% (`built_at=2026-08-10` — this had already landed live in
  `app_config` and in STATUS's 08-10 post-session entry the day it was
  measured; this pass just caught PIPELINE/GATE_MEASURES/VERIFY up to it).
  Still `monotonic=false`, now ~74% of the ≥50 action gate. No new session
  this week, so the pool itself hasn't grown past 08-10._
  _**08-24 post-session — the ≥50 gate is crossed.** `graded_calls` jumped
  37→79 (`built_at=2026-08-24`, base rate 45.6%) — the predicted MACRO wave
  matured. ECE **fell further, 30.3%→22.6%**, but **`monotonic=false`
  still holds** on the recheck this item's own measure-of-done called for.
  Verdict unchanged: do not promote confidence into a scored input. This
  item's original trigger has now fired; it stays open only because the
  answer at the trigger is "not yet," not because the trigger hasn't come._
- ~~**[P-22] advisor_paper tables empty**~~ ✅ **DONE — verified live 08-06.**
  Both books seeded on the official run at 04:31 UTC: `advisor_paper_positions`
  42 rows, `advisor_paper_equity` 2 (MANAGEMENT ₹618,714 vs baseline ₹620,695;
  PICKING ₹99,400 vs ₹100,000). Measure met. Original triage kept below.
  _(was: ROOT-CAUSED + fixed 08-06)_ · *done =* `advisor_paper_*` ≥1 row after a clean official run.
  _Two causes, both fixed: (1) **timing** — 08-05's official advisor ran 11:51:57
  IST, ~3s **before** the git_sha-fix redeploy (`5df81c31`, 11:52), so it ran the
  OLD build (no paper engine), and the once-daily dedup then blocked the new code
  from re-running it. (2) **cold-cache MTM** — the paper engine's candle fetch
  would 400 on a retail token from a cold MarketData; fixed by warming holdings
  (brain `489d6b5`, same fix as grading). Next session runs the new code from the
  start → both books seed + snapshot. Carry the verify._
- ~~**[P-23] git_sha mismatch / P-05 re-fix undeployed**~~ ✅ **DONE — verified
  live 08-06.** Session `16f23213` stamps `git_sha=c5fd5254f157`, well past the
  P-05 fix — the push-based deploy holds. Measure met. _The [P-05] **−1.25R
  re-measure** is a separate open verify (see below), not this item._
  Original triage: [me] · *done =* a session stamps `git_sha` ≥ the P-05 fix. _Root cause: the
  brain service **auto-deploys from GitHub**, but `deploy.sh` only did `railway
  up` (local tarball) and the commits were never pushed — so a GitHub rebuild
  reverted to `c689ed4` and three commits (P-05 `b09904` + paper) ran nowhere.
  Fixed live 08-06: pushed → `git_sha` confirmed `a2d9881` mid-session; then
  `deploy.sh` reworked to push-based + hard-abort on unpushed/dirty/non-main so
  it can't recur. [P-05] `STOP_LOSS_HIT` re-verify still wants a clean full
  session on the fix (08-05 n=1 @ −1.157R is uninformative)._

## 🔨 IN PROGRESS

- **[P-47] Thesis engine — advisor v2 in SHADOW mode.** [me] · *done =* every
  official run attaches `indicators.thesis` (HOLD/ADD/TRIM/EXIT, target
  weight, sized qty, fundamentals quality, reason, falsifier) to each holding
  row with v1 columns byte-identical; `/advisor` shows it in its own section;
  `scripts/grade_thesis.py` grades at 126/252d (trials 256–257). · *source:*
  operator review request 2026-11-11 — every prediction layer measured null
  (V-18, ADVISOR_LAB, FACTOR_LAB, P-18, V-23); the untested layers are
  fundamentals, a 12-month horizon, sizing and loss discipline. Operator
  decisions: judge on 6–12-month book performance; shadow first; no paid
  backtest data; loss/size defaults −20% / 10% / 25%. **Approved exception to
  the freeze** (additive, non-fatal, grading path untouched). Spec:
  `superpowers/specs/2026-11-11-thesis-engine-design.md`. Fundamentals input:
  Screener.in paste → `scripts/ingest_fundamentals.py` (operator, monthly).
  VERIFY: V-24.

## 🗓️ BACKLOG — frozen pending POST_MORTEM §6 reopening criteria

⚠️ Heading was "after gate #6 / decisions" — gate #6 is retired ([P-01]), it
will not run and nothing here waits on it anymore. What everything below
actually waits on now is the 2026-09-09 engineering freeze lifting, which per
[reference/POST_MORTEM.md](reference/POST_MORTEM.md) §5 requires all three of
compliant broker-API access, an edge certified outside this codebase, and
capital clearing the observed −₹643/operator-hour opportunity cost. None of
that is expected soon; kept here rather than deleted so the ideas aren't lost.

- **[P-08] FA1 client-profile layer** (horizon/risk/tax → advice conditioned on
  the person). [both]
- **[P-09] FA4 entry-quality on rotation targets — DARK, shipped 08-03** (brain,
  see Done). Weekly-downtrend refusal + single-name weight cap live as dark
  counterfactuals; correlated-cluster lever deferred (no cluster membership for
  non-held names yet). [me]
- **[P-10] FA3 regime-conditional factor weights (Pillar 3).** [me] · needs graded
  data across regimes.
- **[P-11] Promote daily/weekly alignment into the score** once it's gradeable
  (~early Aug) AND attribution shows it predicts. [me]
- ~~**[P-12] Agent P4 — per-stock timeline UI**~~ ✅ SHIPPED 08-03 (see Done).
- ~~**[P-13] Activate Marketaux news key**~~ ✅ **DONE — verified 2026-08-23.**
  `MARKETAUX_API_KEY` is set on Railway and `NEWS_ENABLED=true`; `news_events`
  holds **137 rows, all with sentiment**, newest 2026-08-10 (i.e. the last day a
  session ran). It was already working and the board had not noticed.

## 💡 PROPOSED — high-value, awaiting user greenlight

- _(none)_

## ⏸️ PARKED — explicitly deferred, revisit when raised

- _(none)_

## ✅ DONE (recent — for burn-down + verify)

- ~~**[P-44] Review's data-access channel (Supabase MCP) failed two
  consecutive passes with different root causes.**~~ ✅ **DONE 2026-11-03**
  — measure-of-done met on the "two consecutive clean passes" branch:
  Supabase read cleanly on both 2026-11-02 and 2026-11-03, with no
  timeout and no auth-required block either time. · *source:* 2026-10-23.
  _History: nine consecutive failures (10-22 through 11-01) across two
  distinct signatures — a single `CONNECT_TIMEOUT` (10-22) and eight
  occurrences of an auth-required block (10-23, 10-25 through 11-01),
  pointing at a lapsed OAuth grant never confirmable from inside this
  session. The dashboard API (`zerodha-trading-liard.vercel.app`) failed
  its own unrelated `connect_rejected`/403 org-policy block throughout and
  still does — that was never the real data source and is not part of
  this item. The blackout hid [P-42]'s actual resolution until access
  returned 11-02 (see below)._

- ~~**[P-42] Grading stalled on an expired token — paste a fresh
  `enc_token`.**~~ ✅ **DONE 2026-11-02, 🔴 REOPENED 2026-11-05, ✅ RE-CLOSED
  2026-11-10** — `app_config.grading_incident` read clean/empty, written
  **2026-11-09 18:30:25 UTC** (no `TOKEN_EXPIRED`): the token pasted
  2026-11-09 04:49 UTC passed its first real nightly grading test. Both
  halves of the measure-of-done (`grading_incident` clean **and** the next
  nightly test clearing without error) are the same event here. ·
  *source:* reopened 2026-11-05 on a recurrence of the identical
  `TOKEN_EXPIRED` signature; closed again on this pass's fresh read.
  _Caveat: `graded_calls` is still **398** (`max(evaluated_at)` still
  2026-10-27) — the clean test had nothing newly due to grade, so this
  closes the *incident* (token authenticates, pipeline runs clean), not
  the separate n=400 accrual question, which still needs the three 11-02
  MICRO calls to mature (~11-16/17) under a live token that day. If
  `grading_incident` throws `TOKEN_EXPIRED` again on a future pass, that
  is a new recurrence of this same item, not evidence against this
  close._
  _History (2026-11-02 original close → 2026-11-05 reopen): four repaste
  attempts failed their first real nightly test in a row (09-20, 10-05,
  10-13); the attempt that held during the 10-22→10-26 Supabase blackout
  cleared the 277→398 backlog on 10-27 (`evaluated_at`), confirming
  `portfolio_advice`'s separate daily-advice silence (09-21) was a distinct
  fault, not the same mechanism. Reopened 2026-11-05 on a fresh
  `TOKEN_EXPIRED` (29/38) that recurred identically through 11-06 and
  11-08 (three further confirmed failed nights), then a 11-08 09:18 UTC
  repaste also failed its first test (11-09 reading); the 2026-11-09 04:49
  UTC repaste is the one that finally held clean overnight 11-09→11-10,
  closing the item again. `advisor_calibration_latest` recomputed
  2026-11-02/11-03/11-09 but `graded_calls` has sat at **398** since
  10-27 — **two calls short** of the POST_MORTEM §6 n=400 pre-registered
  read; no interim peek taken, per that section's own rule.

- ~~**[P-43] Automated post-session review intermittently fails to fire or
  commit on a plain NSE/BSE trading weekday.**~~ ✅ **DONE 2026-10-27** — 10
  consecutive clean trading weekdays (10-13, 10-14, 10-15, 10-16, 10-19,
  10-21, 10-22, 10-23, 10-26, 10-27), a `chore(review)` commit for every
  non-holiday weekday with no gap, confirmed via `git log`. Measure-of-done
  (two consecutive calendar weeks, every non-holiday weekday) met. ·
  *source:* 2026-10-06 (promoted from narrative evidence logged in
  STATUS.md on 09-27 and 10-01); recurred 2026-10-09.
  _History: five distinct gaps before this streak started (09-25/09-26,
  09-29/09-30, 10-05, 10-08, 10-12), each logged and reset the streak to
  zero; zero gaps in the 10 trading weekdays since the 10-12 gap. The
  brain's own independent nightly cron (`grading_incident`) kept writing on
  schedule through every gap, so the underlying infra was never the
  problem — this was specifically the scheduled Claude review
  (`trig_01SfvoCZ5tb7kecKwU6koDrY`) failing to fire or commit. No root
  cause was ever confirmed from inside this session (not observable without
  checking claude.ai/code/routines); closing on the measured outcome
  (sustained clean cadence), not a diagnosed fix. Full day-by-day evidence
  trail (10-09 through 10-26) lived in this item's Ready-section history
  before this move; trimmed here, superseded by the clean streak._

- **2026-09-13 (22:43 IST) — "Analyse this name live" shipped, undocumented
  until this pass.** `cc547da` (dashboard: `app/api/advisor/lookup/route.ts`,
  `components/StockLookup.tsx`), companion to brain `45428c7`. Adds an
  on-demand button to `StockLookup` that queues `app_config
  .advisor_lookup_request={symbol}` and polls until `scoredAt` advances
  (~30s) — reuses the brain's existing `score_one_symbol`/`advise`, no
  scoring re-implemented in TS. Distinct from the full-scan "Re-run
  analysis". Landed a few hours after the 09-13 weekly review commit
  (`91bd9cd`), so missed by that pass; caught via `git log -25` this pass.
  Not a tracked `P-nn` item, so not counted in the burn-down; recorded here
  per the same convention as the undocumented 08-23 dashboard features
  above it in this list.

- ~~**[P-39] Push + deploy the [C7] in-play-lock fix, verify it locks live.**~~
  ✅ **DONE 2026-08-26** — brain `eb75ded` confirmed live: session `c40c5634`
  stamps a new `git_sha=2e884587d855` (was `893267c447e3`), and
  `inplay_list` locked all 10 candidates for the day with `or_rvol`
  populated on every row (first lock 05:02:50 UTC). **Verify I-4: PASS**
  (was NOT-YET). · *source:* [reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md)
  §C7, root-caused 2026-08-25.
  _Root cause: `market_data._get_historical` hardcoded a 3-calendar-day
  candle window regardless of the caller's `days` argument, so after any
  weekend (≤1 prior trading day) `opening_range_stats` couldn't get its
  required ≥2 days and every candidate came back `or_rvol=None` —
  `inplay.rank()` returned empty and the list never locked. Fix floors the
  per-interval window instead of fixing it, so callers asking for more get
  more. Proven live on INFY pre-push (`or_rvol` None → 0.5221), suite 943._
  _⚠️ **Today is not the scenario that actually broke.** 08-26 is mid-week
  (Wed, after Tue's own session ran) — the bug specifically hit sessions
  after a weekend gap. The literal measure-of-done (git_sha moved + a lock)
  is met, so this closes, but the real stress test is the next session after
  a weekend — **Monday 2026-08-31**. Watch I-4 that day; if it warns again,
  re-open._

- **2026-08-23 (23:58 IST) — infinite-reload regression fixed same night,
  undocumented until this pass.** `493ee92` (`components/TokenAlert.tsx`,
  `lib/api.ts`). The stale-token banner shipped earlier that evening
  (`62ee323`) used the shared `api` client; its 401-response interceptor
  clears the session and hard-redirects to `/connect` — but `/connect` by
  definition has no token yet, so the banner's own fetch 401'd, wiped
  whatever token the user was mid-paste on, and reloaded into the same loop.
  Fix: the banner now uses a plain `fetch` with the header set manually,
  skips `/connect` entirely, and stays silent with no token — a passive
  advisory component can no longer log the user out. Also documented the
  hazard on the interceptor itself for future callers. `/connect` verified
  200 post-fix. Given the manual-token-paste dependency is this project's
  single point of failure ([P-03]/[P-04]), a same-night catch mattered.
  Missed by the 08-24 automated review despite running after it — caught via
  `git log -25` this pass.

- **2026-08-23 (evening) — two dashboard features shipped, undocumented until
  this pass.** Found via `git log -25` during the 08-24 post-session review;
  not tracked as board items beforehand, so recorded here rather than "moved."
  - **Stale-token banner** (`components/TokenAlert.tsx`, commits `0f7bddf`,
    `62ee323`). Shows a red warning on every page when the `enc_token` is
    missing or predates the day's ~04:34 IST flush. Design-review item #1's
    partial fix — needs no credential, surfaces the [C1]/token_incident state
    that was previously written and read by nothing on the dashboard side.
  - **Nifty-500 stock lookup + on-demand refresh** (`components/StockLookup.tsx`,
    `app/api/advisor/lookup/route.ts`, `app/api/advisor/refresh/route.ts`,
    commits `e6b904d`, `b453e8b`, `0efe1f5`, `eca1a8e`, `bbf1c10`). Look up any
    Nifty-500 name (not just current holdings) with a typeahead dropdown and
    the full read (not just a score); searched-but-unscored names are now
    distinguished from names outside the scan universe entirely.

- ~~**[P-37] Capacity — fix the two cliffs that break within a year.**~~ ✅
  **SHIPPED 2026-08-10** (found shipped in git log, was never moved off the
  board). `EXPLAIN ANALYZE`-led, not guessed: `autopsy_dataset()`'s Nested Loop
  had the right plan already, but its loop count is the trade count, which
  grows linearly (577×0.29ms today → ~7.5s/year); bounded to a rolling window
  (default 400d) + a partial index (`idx_trades_closed_excursion`, Seq Scan
  20.6ms → Index Scan 0.85ms). `count(*)` on `brain_decisions` (417ms warm at
  21k rows, →~18s/year) split into an exact **claim** (PF/expectancy/P&L, from
  `trades` only) vs an O(1) **indicator** (`pg_class.reltuples` via
  `approx_rows()`, rendered with `~`). `brain_activity` retention deliberately
  deferred (write-only, 17 MB today, not yet worth the irreversible delete).
  `/api/autopsy` 0.406s → 0.284s on top of [P-36]. All exact figures verified
  unchanged after the change (692 trades, PF 0.358, −0.4155R, −₹33,267).
  Projections in [reference/CAPACITY.md](reference/CAPACITY.md). _Follow-up
  spawned [P-38] (the storage-trim plan, now in Blocked)._

- ~~**[P-14] Advisor accountability / paper-trade system.**~~ ✅ **DONE — verified live 2026-08-10.** [me] · re-raised +
  scoped 2026-08-05 (was parked 2026-07-28): paper-trade every advisor verdict,
  store outcomes, measure wins/losses → feedback loop. Scope: **two books**,
  track **everything** (holdings + rotation + Nifty-500 scan). Spec:
  [reference/ADVISOR_ACCOUNTABILITY.md](reference/ADVISOR_ACCOUNTABILITY.md).
  - ✅ **Phase 1 (brain `91a48361`):** grading no longer starves — runs on every
    session start + loud `queued/graded/not_due/errors` log; `ADVISOR_BACKTEST_ENABLED=true`
    set on Railway (defaulted false — 2nd starvation cause). *done =* the 38
    matured-but-ungraded rows grade next session.
  - ✅ **Phase 2 (brain `a2d9881`):** `advisor_paper.py` + tables
    `advisor_paper_positions`/`advisor_paper_equity`. MANAGEMENT (holdings +
    HOLD/SELL/TRIM/rotation, baseline=frozen holdings) + PICKING (₹100k cash,
    buys rotation/scan targets, horizon close, baseline=Nifty B&H). Advisory-only,
    +10 tests, suite 867. *done =* both books seed + snapshot on the next official run —
    **met 08-06** (see [P-22], ✅ DONE below).
  - ✅ **Phase 3 (dashboard, auto-deploys Vercel):** `/advisor/accountability`
    ("Advisor scorecard") + API — per-book equity curve vs baseline (alpha),
    realized win/loss record + win-rate, by verdict + source, best/worst trade.
    Empty-state until data accrues; verified end-to-end with fixtures, `next
    build` clean. *done =* page live; fills in as Phase 2 snapshots land — **met.**
  - ✅ **UX redesign (dashboard `99fe9a7`, 08-05):** reworked `/advisor` page
    for scannability + mobile, content unchanged. `next build` clean, auto-
    deployed.
  **Closed 2026-08-10 on data, not on a code change.** All four sub-items were
  already ✅ but the item sat in IN PROGRESS because Phase 3 was noted
  "still empty-state — blocked on [P-22]", and [P-22] had since been resolved
  without this note being updated. Prod now shows both books populated:
  **MANAGEMENT 31 positions (20 open / 11 closed) + 2 equity snapshots;
  PICKING 7 open + 2 snapshots**, newest 2026-08-07. The scorecard is no longer
  an empty state. _Caveat: 2 equity snapshots per book is one per session since
  seeding, so the alpha curve is still only two points — it needs sessions, not
  work._



_2026-08-07_ — **[P-25] Real-money accountability SHIPPED** (brain `3489ac6`).
Infers the user's actual executions by diffing the ~8-min `portfolio_advice`
holdings series, links each to the advice standing at the time, and stamps
`user_decision` with no manual step — closing the loop the Telegram bot never
could ([P-04] stays blocked and no longer matters for this). **Validated against
ground truth before shipping:** 177 runs / 25 symbols → exactly one detection,
`NBCC SELL 115 @ 08-06 04:36`, the sale the user reported, zero false positives.
Backfilled + surfaced on `/advisor/accountability`. Suite 894.
_Documented asymmetry: SELLs land within one refresh, BUYs only T+1 (the
holdings feed reports delivered stock), which is why the paired rotation buy was
never captured._ Verify: **V-7** (event-driven) + invariant **I-5**.

_2026-08-07 post-close_ — **[P-27] + [P-28] + [P-31] all VERIFIED LIVE**, plus
[P-24]'s code half. Session `2ddadca7` (36 trades, −₹3,422.57): V-1 model_stop
15/15, V-2 `COVER_SHORT` gone and **[P-05] re-judged at −1.211R across both
sides**, V-3 counts 36=36=36, V-5 86 symbols, V-6 490s avg. [P-24] code
verified — 20 advisor runs / 120 rotations produced **zero** new duplicate
pairs. **[C3] fixed** (brain `a06d9fe`). **[C1] root-caused:** autopilot fired
on time but retried ~380× on a missing enc_token, costing ~55% of the session —
the largest single data loss of the day, and it is [P-03], not a bug.
Full scorecard in [STATUS.md](STATUS.md); checks in
[reference/VERIFY.md](reference/VERIFY.md).

_2026-08-07 pre-market_ — **[P-31] Data volume + diversity boost.** Diversity
shipped (brain `18b34f9`): sector-balanced Nifty 500 rotation, universe ~46 →
~86, 297 distinct names over 20 sessions vs 46. Volume half is a one-command
runbook (`scripts/premarket_pacing.sh`) — Railway var writes were
blocked from the session. Evidence-led: the 08-06 `ENTRY_DEFERRED` tally showed
`HOURLY_PACE` binding at 44 vs `CONCURRENT_CAP`/`SYMBOL_DAY_CAP` at 1 each, so
only the caps that bind get raised. **Verify V-5 + V-6** — V-6 (cycle cadence)
is the risk this introduces and must be checked the first session.

_2026-08-07_ — **[P-29] Exit-Policy Frontier (`/autopsy`).** Replays all 180
fixed (T, S) exit policies over the 541 closed trades carrying `mfe_r`/`mae_r`.
**None clears breakeven under the optimistic bound** (best −0.219R vs realized
−0.401R); at **zero cost, 3 do** (best +0.009R), so the entries are ≈ a coin
flip and **cost drag −0.239R is essentially the whole loss**. Needs no Kite
data, so it lands a real verdict while [P-01] stays blocked. Breakeven
round-trip cost measured at **≈0.0047%**, ~1/25th of the 0.12% actually paid —
so this is *not* a "cut costs" finding; the edge has to come from the entries.
Numbers cross-checked against SQL; page rendered and inspected at desktop +
mobile, all controls probed, zero console errors. **Full writeup + phase-2
plan: [reference/EXIT_FRONTIER.md](reference/EXIT_FRONTIER.md).**

_2026-08-07 (pre-market)_ — **[P-27] + [P-28] shipped** (brain `8c875df`, suite
870 green). **Verify on the next session, before re-judging [P-05]:**
1. every `STOP_LOSS_HIT` trade carries `execution.exit.model_stop = true` and
   `slippage_bps == charges_bps` (the whole residual adverse move is charges);
2. `STOP_LOSS_HIT` / `TARGET_HIT` now contain SHORT rows — re-measure the
   pooled stop bucket against the −1.25R cap; the 08-06 "−1.252R on target"
   read only LONGs and is not the answer;
3. `trades` == `total_trades_executed` == `ORDER_PLACED` count (+1 gap gone).
_Root causes: `model_stop` went into the broker and never came back out, so
`_fill_leg` had nothing to persist; `_cover_short` hardcoded
`exit_reason='COVER_SHORT'`, collapsing **all** short exits (stop, target,
time-stop, EOD, session-end) into one bucket; a never-filled row was
force-closed as `SQUARE_OFF_FAILED` with a fabricated exit price instead of
`ORDER_FAILED`. Caveat: exit_reason semantics changed, so short-side buckets
are **not comparable across the 08-07 boundary**._

_2026-08-06_ — **[P-21] Edge study: decision-feature mining → decisive NO-edge.**
Mined 1,597 walk-forward-labeled decisions (`decision_outcomes` ⋈ `brain_decisions`).
In-sample (07-22/23) a clean rule appeared — SHORT + before 13:00 IST + STRONG
trend = +0.44R/57% (n=655). **Out-of-sample it collapsed** (backfilled 07-24→08-05
labels): every bucket converges to ~+0.2R/54%, no exploitable spread; per-day the
rule even goes negative (07-29). The apparent edge was regime luck from two
down-days. Firm negatives: `confidence_score` doesn't predict; the `trend_tells`
gate is anti-predictive + sign-unstable (keep dark/off). **No feature-based entry
edge — do not ship one live; the edge verdict still rests on gate #6.** Full
writeup: [reference/EDGE_STUDY_P21.md](reference/EDGE_STUDY_P21.md). Side-fix:
decision labeling was starving (manual, unrun since 07-23) → now auto-runs every
session (brain `c5fd525`) + backfilled, so the study re-runs for free as data grows.


_2026-08-04 post-session — VERIFY pass, single full-day session:_
Session `1042e121` 04:00–09:51 UTC, `COMPLETED`/`MARKET_CLOSED`, brain
`c689ed44cbf1` (git_sha stamped). 90 trades, −₹10,827, PF 0.16, −0.64R avg —
no gate flip, still deep reject zone. **[P-20] verified** (see below). Gate
metrics re-based on 521 closed trades: PF 0.405→0.310, expectancy
−0.394R→−0.442R, max drawdown ≈−₹13,668→≈−₹23,200 (expected — soft-stop +
one weak session). Open-window vs after converged to both-negative
(reinforces [P-07] SKIP). Full detail in [STATUS.md](STATUS.md).
- **[P-05] stop-fill cap — RE-OPENED then RE-FIXED** (brain `b09904fe55fb`). The
  first live re-measure showed the bucket got *worse* (−1.40R avg / −1.60R worst,
  short stops −1.44R under `COVER_SHORT`). Root cause via `execution.exit`: the cap
  clamped the *reference/hint* to −1.25R but `PaperBroker._fill` re-applied
  `PAPER_SLIPPAGE_PCT`+charges on top. Fix: `model_stop` flag from both exit paths
  skips the double slippage on stop exits (charges kept). +3 test assertions,
  suite 856 green. _VERIFY next session: STOP_LOSS_HIT ≈ −1.25R − charges._
- **Mobile (dashboard):** Chrome-Android scroll/alignment fix — `100vh`/`100vw`
  → `dvh`/`100%` (URL-bar dynamic-viewport jank; iOS Safari was unaffected).
  `next build` clean, auto-deployed via Vercel.

_2026-08-04_ (brain `9bd59ad`, deployed):
- **[P-20] Advisor refresh + timeline capture now run inside the trading loop.**
  `_maybe_run_advisor` + `_maybe_capture_timeline` were outer-idle-loop only, so
  full-day sessions (post −3R-soft) starved the advisor for the whole session
  (08-03 last refresh 11:50). Now called once per cycle in the inner loop too —
  daemon-threaded + interval-gated, so no trade-loop impact. +1 test, suite 853.
  Resolves KNOWN_ISSUES K7. **VERIFIED live 08-04**: session `1042e121`
  (04:00–09:51 UTC) got 42 advisor runs spanning 04:23→09:45 UTC, no midday
  stall (was starving past ~11:50 pre-fix on 08-03).

_2026-08-03 / 08-04 — VERIFY pass, first live verification since 07-29:_
Two sessions ran 08-03 (morning `3fe00787` DAILY_STOP_3R, afternoon `1ef3f27f`
MARKET_CLOSED under the new soft-stop config). Data-quality PASS (77 trades /
1549 decisions / 320 advice rows, zero nulls). Every fix confirmed live:
- **[P-15]** — `stock_observations`: PRE_OPEN 20 / POST_CLOSE 20 / INTRADAY 40
  (was 100% INTRADAY).
- **[P-07]** — 24 `OUTSIDE_OPEN_WOULD_BLOCK` rows logged. ⚠️ **verdict: keep
  DARK, do NOT enable** — counterfactual 08-03 had the open window as the *worst*
  bucket (−0.51R vs −0.23R after 10:15), pooled open now −0.23R (negative,
  degraded from T4's +0.11R), sign not consistent. The "open is the only +EV
  window" thesis is dented; re-measure over more full-day sessions.
- **[P-05]** — `STOP_LOSS_HIT` −1.34R (11 trades), moved from −1.62R toward the
  ≈−1.25R target; small sample, keep watching. **[P-09]** — 9 well-formed
  `rotation_entry_quality` rows. **db_stocks split** — full session, no errors.
- **Soft daily-stop** confirmed as designed — `LIMIT_WOULD_STOP` fires logged,
  afternoon ran to `MARKET_CLOSED` not `DAILY_STOP_3R`. git_sha `9e370ac719df`.
- Gate metrics re-based on 447 closed trades: PF 0.376→0.405, expectancy
  −0.408R→−0.394R, max drawdown ≈−₹6,697→≈−₹13,668 (expected — soft-stop lets
  sessions bleed further by design). No gate flip.
- **[P-17]**/**[P-19]** — no stall; railway logs scanned clean (no 400 spam).
  **[P-18]** unchanged (22 graded / ECE 48.5%, watch-only). New findings →
  [P-20] (advisor-starve) + KNOWN_ISSUES K7/K8.

_2026-08-03_ (brain — code + suite green at 852; deployed `9e370ac`, VERIFIED live above):
- **[P-09] FA4 rotation entry-quality (DARK).** A rotation into a stronger score
  still needs to be a quality ENTRY. `rotation_entry_quality()` computes, per
  chosen target: weekly-downtrend (countertrend entry → `would_block`) + single-
  name weight vs `ROTATION_MAX_SINGLE_NAME_PCT` (over-concentration →
  `would_resize`). Plumbed `weekly` through score_universe → find_rotation_candidate
  → target. Flags stash on `indicators.rotation_entry_quality` (jsonb, migration-
  free, gradeable) + logged; only refuse/resize when `ROTATION_QUALITY_ENABLED`
  (default off — measure first, VISION §7). Correlated-cluster lever deferred
  (no cluster membership for non-held names). +5 tests.

_2026-08-03_ (dashboard, auto-deploys from main on Vercel):
- **[P-12] Per-stock timeline UI.** The agent's `stock_observations` (price /
  trend_score / verdict per capture) were collected since P1/P2 shipped but
  never surfaced. New `/advisor/timeline` page + `/api/advisor/timeline` route:
  per-holding card with an inline-SVG price sparkline + a verdict-dot path
  (oldest→newest, same verdict palette as /advisor), sorted freshest-observed
  first. Sidebar nav link added. No new deps; tsc + lint + `next build` clean;
  data-shape verified against prod (every symbol has price+verdict+score points).

_2026-08-02_ (code written + suite green locally at 847; **pending commit + deploy + live verify**):
- **[P-05] Stop-execution fill cap.** Root cause of the −1.62R STOP_LOSS_HIT
  bucket = poll latency: the ~30s exit checker fills at whatever price the poll
  caught, already drifted past the stop. Fix models a resting broker-side
  stop-market order: `config.PAPER_STOP_SLIPPAGE_CAP_R` (default 0.25) caps the
  stop-exit fill a bounded band past the stop → worst STOP_LOSS_HIT ≈ −1.25R,
  genuine slippage inside the band kept, no fill ever better than the stop, MAE
  stays honest (real low recorded before the capped fill). Only STOP_LOSS_HIT
  is capped (target/time-stop/cover untouched). +8 tests (`test_stop_fill_cap.py`),
  2 exit-latency tests updated to pin cap=0. _VERIFY next session: re-measure
  the STOP_LOSS_HIT R bucket — should move from −1.62R toward ≈−1.25R._
- **[P-07] Trade-only-open dark flag.** `_open_window_gate` mirrors the
  cooldown dark-flag pattern: every entry after the open window (default 10:15
  IST, `OPEN_WINDOW_END_*`) logs an `OUTSIDE_OPEN_WOULD_BLOCK` counterfactual
  (deduped per symbol); only blocks when `TRADE_ONLY_OPEN_ENABLED`. Wired into
  both BUY + SHORT entry paths. +5 tests. _VERIFY: next session's activity feed
  shows WOULD_BLOCK rows; counterfactual-audit can then rank it._
- **[P-16] Regime read — RESOLVED as a no-op (premise false).** Ran the
  breakdown: `trades.regime` comes from `regime_detector.py`, whose vocabulary
  is only TRENDING/WEAK_TREND/UNKNOWN — **SIDEWAYS/BEARISH can never tag a
  trade** (that's the separate market-level `market_regime.py`). So "TRENDING
  vs SIDEWAYS/BEARISH" is untestable: the strategy enters on ADX>threshold =
  TRENDING by construction (268/289 trades TRENDING, 21 WEAK_TREND, 0 other).
  TRENDING PF 0.42 / −0.384R vs WEAK_TREND PF 0.17 / −0.712R (n=21, small).
  The 07-28 (PF 0.65) vs 07-29 (PF 0.18) gap that seeded this is **both
  TRENDING** — within-regime variance (per-session PF spans 0.04→1.03), not a
  regime effect. DAILY_STOP_3R firing on consecutive TRENDING sessions is the
  base case, not a signal. No live action; a real regime-conditional test needs
  the market-level labels + multi-regime history = gate #6 ([P-01]).

_2026-08-02_ (brain `642ed94`, deployed):
- **[P-19] Killed the `/quote/ltp` 400-InputException spam.** The paper broker
  called `/quote/ltp` on every fill, but that endpoint 400s on a retail enctoken
  (same reason as `TRADING_MODE_FORCE=HOLDINGS_ONLY`) — so it always failed and
  the fill fell back to `hint_price` anyway, leaving a guaranteed-failing HTTP
  call + a `[PAPER] LTP fetch failed … 400` log line per fill flooding session
  logs. Fix: `config.PAPER_QUOTE_LTP_ENABLED` (default off) skips the doomed
  call; zero behaviour change (hint_price was already the effective path). +2
  tests, suite 834 green. _source: live log investigation 07-28._

_2026-07-30_ (brain `e81f706`, deployed):
- **[P-15] pre/post timeline capture fixed** — root cause: `_capture_stock_timeline`
  deduped on a rolling 1h window, so the 15:35 POST_CLOSE snapshot was deduped
  against the ~15:2X intraday refresh and never inserted. Fix = phase-aware dedup
  (INTRADAY hourly; PRE_OPEN/POST_CLOSE once-per-phase-per-day). _VERIFY next
  session: `stock_observations` shows POST_CLOSE rows (+ PRE_OPEN when the token
  is live before 09:14)._
  _08-02: still can't verify — `stock_observations` is still 100% `INTRADAY`
  (80 rows, unchanged from 07-29) because zero sessions have run since the fix
  deployed (see [P-03] above). Not a regression, just untested — carries over
  to next actual session._
- **[P-17] advisor stall hardened** — staleness self-heal (reset `_advisor_running`
  after >10min) + gate-decision logging (running / skip:no-token). _VERIFY: a
  future stall shows `[SCHEDULER] advisor gate → …` in logs + self-recovers._
  Note: PRE_OPEN still needs the token live before 09:14 — the real cure is the
  daily-token dependency ([P-03] TOTP), which both 07-28/07-29 incidents argue for.
  _08-02: no stall to observe either way — the advisor hasn't run at all since
  07-29 (no session, no token). Verify carries over to the next real run._

_2026-07-27:_ Sprint 0 (token scrub, RLS hole closed, EDGE-UNVERIFIED banner,
−3R hard stop) · Sprint 2 (CI both repos, `deploy.sh`, module split part 1) ·
T4 trade-quality first read · docs reorg (both repos).
_2026-07-26:_ advisor portfolio-risk v2 (correlation) · Telegram digest line ·
Pillar-1 calibration infra · per-stock agent P1 + P2 · 4 UI enhancements.

---

## Cadence (the scheduled loop)

```
         ┌── ships a fix ──▶ registers a check in reference/VERIFY.md
         │                                    │
  PIPELINE item                        (next session)
         ▲                                    │
         │                                    ▼
   TRIAGE: gets a P-nn        /post-session-check §0 runs the ledger
         ▲                          │                    │
         │                       PASS │                  │ FAIL
   KNOWN_ISSUES finding            │                     │
   (K / W / A / B id)              ▼                     ▼
         ▲                    item → Done          item → Ready
         │                                       (with the number)
         └──────── audit skills append findings ◀──────────┘
```

- **Per session (weekdays post-close):** an agent runs the audit skills —
  **VERIFY ledger first**, then the data-quality scorecard, then
  `/counterfactual-audit`. It appends findings to KNOWN_ISSUES, promotes the
  ones worth work to items here, drains PASSed items to Done, returns FAILed
  ones to Ready, and updates STATUS.
- **Weekly (weekend):** an agent runs a deeper review — re-measures PF /
  expectancy / drawdown + advisor calibration ECE, sweeps VERIFY for checks
  that have sat OPEN for more than a week (a check nothing ever satisfies is
  itself a finding), refreshes the burn-down, and flags regressions.
- **Never run the session audit before market close** (~10:00 UTC / 15:30 IST)
  — auditing a live session misreports.
**Live routines** (managed via `/schedule`; edit at claude.ai/code/routines):
- **Post-session review** — `trig_01SfvoCZ5tb7kecKwU6koDrY`, weekdays 16:30 IST
  (`0 11 * * 1-5` UTC). Reads the day's metrics, drains shipped items to Done,
  adds findings, updates STATUS + this board.
- **Weekly review** — `trig_01KWSXfHW5Q2r4sYbzNiqUtR`, Sundays 10:00 IST
  (`30 4 * * 0` UTC). Re-measures gate metrics, VERIFIES Done items moved their
  measure, refreshes the burn-down.

Both are docs-only (never edit code) and evidence-based (no invented findings).
They commit `chore(review): …` to main.

> ✅ **CONFIRMED LIVE 2026-08-07.** The post-session routine fired on schedule
> and committed `08a117e chore(review): post-session 2026-08-07` at 11:19 UTC
> (16:49 IST) — authored by Claude, syncing PIPELINE to what STATUS/VERIFY had
> recorded. So the cadence is genuinely automated, not manual, and the earlier
> doubt here was wrong.
> Two things it does **not** do, which is why the manual pass still matters:
> it works from what the docs already say rather than re-querying prod, and it
> explicitly leaves the full `/post-session-check` + `/counterfactual-audit`
> sweep queued. Treat it as a bookkeeping pass that keeps the board consistent
> between real audits, and expect to rebase — it commits to main while you work.
