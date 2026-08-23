# Design review — top to bottom, 2026-08-23

_Measured, not opined. Every number below came from prod or the repos on the
day of writing._

## The purpose, stated plainly

This system exists to answer one question: **does the strategy have an edge?**
It is a measurement rig, not a trading business. Every design judgement below is
scored against that purpose, not against general engineering taste.

## The finding

**The rig is excellent at measuring and unreliable at acquiring.**

| | |
|---|---|
| Weekdays since the project began | 72 |
| Weekdays it actually traded | **21 — 29.2%** |
| Weekdays since the 07-10 maturity point | 31 |
| Of those, traded | **14 — 45.2%** |

Everything else in this review is secondary to that number. A measurement
apparatus that collects data on **45% of available days** takes twice as long to
reach any verdict as one that runs daily — and the verdict is the entire point.

Crucially this is **not** an engine-reliability problem. Split by era:

| era | sessions | ghosts | clean close | traded |
|---|---|---|---|---|
| before 2026-07-10 | 72 | **49** | 2 | 9 |
| since 2026-07-10 | 15 | **0** | 11 | **15 / 15** |

Since 07-10 the engine has been essentially perfect: **zero ghost sessions, and
every session that started went on to trade.** The failure is entirely upstream
— sessions don't *start*, because a human must paste an `enctoken` before 09:15
and often doesn't. Nine consecutive weekdays were lost in August alone.

## Layer by layer

**Acquisition — 🔴 the weak link, and the only one that matters right now.**
One manual step gates the entire pipeline. It has no automated fallback in
service (TOTP is built and dormant), and its alarm is built and switched off for
want of a Telegram token. Measured cost: 55% of one session's tape on 08-07, and
nine whole days in mid-August. This is a single point of failure with a known,
cheap remedy sitting unused.

**Engine — 🟢 sound.** 0 ghosts in 15 sessions, clean `MARKET_CLOSED` closes,
intra-cycle exit checks at ~30s after the −2.78R lesson, deploy guards that
refuse to push dirty or mid-session. The hard-won reliability lessons are
encoded as code and tests rather than as prose.

**Storage — 🟡 adequate, wrong tier.** 97 MB of 500 MB on the **free** tier,
projecting ~3.3 GB/year. Query cost was the real risk and both cliffs are fixed
(bounded autopsy window, `reltuples` for scale counts). What remains is a
billing decision, not an engineering one.

**Analysis — 🟢 the strongest part of the system, and over-built for its
subject.** Excursion capture enabling exit replay without buying data;
counterfactual labelling turning ~800 trades into ~6,300 decisions; walk-forward
validation with pre-registered rules and built-in confound checks; a VERIFY
ledger that has now caught two of its own findings being wrong. This is better
methodology than most retail quant work.

**Presentation — 🟢 proportionate.** Dashboard reads, never decides. RPC
aggregation keeps it fast. The Learn page carries the honest verdict rather than
a flattering one.

## The uncomfortable conclusion

The analysis layer keeps producing *correct negative results faster than the
acquisition layer can feed it*. Three separate edge hypotheses have now been
tested and killed — entries ([P-21], [P-35]), exits ([P-29]/[P-30]), and costs
(breakeven needs ~1/25th of real cost). Each death was methodologically clean.

So the design is not failing. **It is succeeding at telling you the strategy
doesn't work** — and the remaining uncertainty is concentrated almost entirely
in gate #6, which needs historical data, and in sample size, which needs the rig
to actually run.

Both of those are gated on decisions that are currently parked ([P-01] Kite
data, [P-03] TOTP, [P-04] Telegram alert). That is a legitimate owner's choice,
recorded here without argument — but it means **further engineering has low
marginal value.** Building more measurement for a strategy already measured
three ways is the wrong allocation.

## Where the code has drifted

Honest note on this reviewer's own contribution: `brain.py` grew **2,211 →
2,352** lines and `scheduler.py` **868 → 1,060** during August, largely from
work I added — `_maybe_backfill_candles`, retention, the token probe (since
removed). Each addition followed the local pattern, which is right, but the
pattern itself concentrates unrelated jobs in one idle loop. Nine `_maybe_*`
jobs now hang off it.

That is not urgent — they are independent, day-gated and individually tested —
but [P-06]'s judgement ("risk > value for a line count") should be revisited if
a tenth job appears, because the loop is becoming a scheduler-of-everything by
accretion rather than by design.

## Ranked, if work resumes

1. **Make sessions start reliably.** Nothing else changes the verdict timeline.
   Cheapest form is [P-04] (~3 min, switches on an alarm already written).
   _Partially addressed 2026-08-23: the dashboard now shows a red **NO LIVE
   TOKEN** banner when the enctoken is missing or predates today's ~04:34 IST
   flush. This needs no credential and no decision. It is weaker than [P-04] —
   it only fires if you open the dashboard, whereas Telegram reaches you — but
   the dashboard is where you go to paste the token anyway, and until now the
   brain's durable `token_incident` was written and read by nothing._
2. **Settle the tier.** A billing decision blocking a data pipeline.
3. **Gate #6** — the only remaining source of a *positive* answer.
4. Everything currently on the board is below these.

**Do not build more analysis.** It is the part that is already working.
