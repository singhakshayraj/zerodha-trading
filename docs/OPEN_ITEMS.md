# OPEN ITEMS — who owes what

_Cut by **owner**, as of 2026-08-10 (Mon, pre-market). Updated after the overnight session that closed [P-24], [C1], [C2] and [C5]._

This is a **derived view**, not a new source of truth. [PIPELINE.md](PIPELINE.md)
stays authoritative for work items and [reference/VERIFY.md](reference/VERIFY.md)
for open checks — if this file and those disagree, they win. It exists because
the board is organised by *status* and you needed it organised by *who is
blocked on whom*.

---

# PART 1 — On you

## 1.1 Every trading day, before 09:15 IST

### ⚠️ Paste the `enc_token`
**Why it's first:** on 08-07 it wasn't pasted. `AUTOPILOT=true` fired on
schedule at 09:30, `db.get_enc_token()` returned nothing, and the brain retried
roughly **380 times** on a 30-second loop until 12:40 IST. That cost **~3h25m of
a 6h15m session — about 55% of the day's tape**, more than breadth and pacing
changes combined ([C1]).

**Do:** open the dashboard `/connect` page and paste a fresh token before the
open.

**Note:** TOTP auto-login is *built and shipped but dormant* — it's [P-03],
which you deprioritised. Nothing is broken; the token is simply manual by your
choice. Don't rebuild the TOTP path.

### 🔴 The 3-minute task that makes the above nearly foolproof — do [P-04]

**The alarm for this already exists and is switched off.**
`scheduler._maybe_token_preflight()` runs **once per market day at 09:16 IST**,
skips weekends and holidays, live-checks the token, and on failure sends you:

> ⚠️ Kite session expired/missing. Paste a fresh enc_token before the … IST
> advisor run!

That is **14 minutes before** the 09:30 autostart — early enough to save the
whole session. It did nothing on 08-07 because its **only** channel is Telegram,
and [P-04]'s bot token has never been set.

**So the single highest-leverage action available to you is [P-04] (§1.4) — and
it takes about three minutes.** It is not a "nice to have alerts" item; it is
the difference between losing 55% of a session silently and getting a push
notification in time to prevent it. Prioritise it over everything else in §1.4.

---

## 1.2 Monday 2026-08-10 — PRE-MARKET (before 09:15 IST)

### ① Run the pacing runbook
```bash
cd ~/Desktop/GITHUB/zerodha-brain
bash scripts/session_2026-08-07_data_boost.sh
```

**It restarts the brain.** Must land before the open; never during a session.

✅ **Correction to an earlier note:** STATUS previously warned "the script still
carries the original numbers; adjust before running." **That is stale — the
script is already correct.** It sets `DATA_MAX_NEW_TRADES_PER_HOUR=25` and
`MAX_TRADES_PER_CYCLE=12`, which is exactly what the revised [C4] calls for
(hourly 15→25 is the lever that matters; cycle 8→12 is near-irrelevant). **No
edit needed.** Only the script's *header comment* is stale — it still cites the
08-06 46-symbol deferral tally.

---

## 1.3 Monday 2026-08-10 — POST-CLOSE (after 15:30 IST / 10:00 UTC)

> Never audit a live session — half the day's rows don't exist yet, so it
> misreports.

### ~~② [P-24] Run the paper-book repair~~ ✅ **DONE 2026-08-10, ~01:20 IST**

Ran from a session after the Supabase MCP connector came up. **18 rows /
−₹77,325.36 → 11 / −₹45,796.41**, duplicate sum −₹31,528.95 removed, every
documented target hit exactly. **V-4 PASSED; I-1 back to 0 rows.** TRIM rows
untouched. Rollback snapshot: `scripts/p24_rollback_2026-08-10.sql` (brain).

**Nothing left for you here.** Note for future items: `UPDATE`/`DELETE` both
went through — the standing "prod writes may be blocked by the permission
classifier" caveat did not bite.

### ③ [P-26] Decide the paper seed basis
**Bundle with ② — both rewrite the same rows, so it's one pass.**

**Recommendation (unchanged): seed at seed-day price**, so the advisor owns only
what happened after it spoke. Seeding at *cost basis* books pre-advisor history
as advisor performance — it would inherit RVNL at −46.3% and NBCC at +73.0% as
its own track record. Alpha is unaffected either way (the baseline carries it
too), but the win/loss scorecard reads as advisor skill when it isn't.

**Needed from you:** just the choice. I implement it.

### ④ Run the audits, in this order
```
/post-session-check      # runs the VERIFY ledger as its §0, then the scorecard
/counterfactual-audit    # flag verdicts
```

**Expected state entering Monday:**
| Check | Expect |
|---|---|
| ~~**V-4**~~ | ✅ **PASSED** — ② is done |
| **V-7** | [P-25] — event-driven. Only passes on a day you actually **trade**. A quiet day is NOT-YET, **not** a failure. |
| **V-8** | [P-30] — passed at build time; standing re-check |
| **V-9** | [C1] — event-driven: only judgeable on a day the token is missing. NOT-YET on a normal day. |
| **V-10** | [C5] — first judgeable after today's post-close backfill runs (15:40–16:30 IST) |
| ~~**I-1**~~ | ✅ **PASS** — 0 rows since the repair |

---

## 1.4 Decisions with no deadline — each one unblocks something

| Item | What exactly | What it unblocks |
|---|---|---|
| **[P-02]** Fundamentals provider | Pick a source | `stock_agent.py:74` has carried `'fundamentals': None` since P3. The advisor scores 7 factors with **zero fundamental input**. Also blocks every fundamental screen the finserv plugins offer ([FINSERV_PLUGINS](reference/FINSERV_PLUGINS.md)). |
| **[P-13]** Marketaux API key | Set the key | `news.sentiment` populates; the collector is built and dormant. |
| 🔴 **[P-04]** Telegram token — **do this one first** | ① @BotFather → `/mybots` → pick bot → API Token → **Revoke current token**. ② `railway variables --set "TELEGRAM_BOT_TOKEN=<new>" --service zerodha-brain`. ③ Confirm a digest lands. | **The 09:16 IST dead-token alert (§1.1)** — already built, dormant only for want of this token; it is what would have saved 55% of the 08-07 session. Plus the digest + intraday alerts. **~3 minutes.** Runbook: [reference/CRED_ROTATION.md](reference/CRED_ROTATION.md). **1 cred, not 2** — the anon key is safe-by-design, skip it. |

## 1.5 Deprioritised by you — listed for completeness, not being raised

| Item | Status |
|---|---|
| **[P-01]** Kite historical data (₹500/mo) | **The gate-#6 hinge.** The edge verdict cannot be reached without it. Deprioritised by you; recorded here only so the dependency is visible. |
| **[P-03]** TOTP headless auto-login | Built, dormant. Measurably cost ~55% of the 08-07 session ([C1]). Deprioritised by you; the cost is recorded, the decision is not re-opened. |

**Cheap mitigation for [C1] that avoids the [P-03] decision entirely:** have the
brain emit one `log_brain_activity('NO_TOKEN_AT_OPEN', …)` on the first failed
autostart of the day, so a lost morning surfaces somewhere visible instead of
only in a heartbeat field. That's on my list (§2.3), not yours.

## 1.6 MCP connectors — a recurring tax worth fixing once

Several connectors are unauthorized or never finished connecting:

| Connector | State | Consequence |
|---|---|---|
| **Supabase** | ✅ **connected 2026-08-10** | Resolved itself mid-session. `execute_sql` reads + `UPDATE`/`DELETE` all work — that's how ② finally ran. [P-33]'s migration is now unblocked too. |
| **Railway** | not available | Can't read logs or set variables directly. |
| S&P Global | needs auth | Finserv plugin data — low value here, see FINSERV_PLUGINS. |
| LSEG | never connected | Same. |

**Do:** authorize via claude.ai connector settings, or `/mcp` in an interactive
session. Supabase + Railway are the two that would actually change what I can
finish without handing you a script.

---

# PART 2 — On me

Buildable now. Nothing here is blocked on you **except** where marked.

## 2.1 New, from the finserv-plugin assessment

Full reasoning: [reference/FINSERV_PLUGINS.md](reference/FINSERV_PLUGINS.md).

- **[P-32] Grade a verdict when its `stop_level` breaks.** The highest-value
  item on the board that isn't waiting on gate #6. The advisor already emits
  `stop_level` ("hold while ₹520 holds") and then never checks it again — so a
  call that's wrong on day 3 isn't graded until day 30. Directly attacks
  [P-18]'s stall.
  ⚠️ **Needs one decision from you before I build:** is `stop_level` a *thesis
  invalidation* (breaking it means the HOLD was wrong) or a *suggested stop for
  you* (breaking it means you should act, but the call may still be sound)?
  They grade differently. Note `SELL` sets `stop = None`, so coverage is partial
  by construction either way.
- **[P-33] Every verdict carries a bear case.** `reasons[]` is confirmatory
  only — nothing records what would make the verdict wrong, so nothing can be
  scored against it. Cheap, no decision needed.
- **[P-34] No-trade band on the rotation advisor.** Cost drag is −0.239R of a
  −0.401R loss and no exit policy clears breakeven even at zero cost; a drift
  band is the standard answer. **Sequenced after ②/③** — those are already
  rewriting the same book. Rotation advisor only, *not* the intraday engine.

## 2.2 Standing engineering item

- **[P-06] Module split.** The advisor family and `database.py` are done and
  all <600 lines. What remains is the two genuinely risky files:
  `brain.py` **2211** (one monolithic `TradingBrain`; methods share `self`, so a
  split needs mixins/surgery on the live trade engine) and `scheduler.py` **868**
  (64 `patch('scheduler.db')` sites + dense monkeypatching). `config.py` 644 is
  exempt (flat flag declarations).
  **My read: do these only if a file becomes real merge-conflict or navigation
  pain, one carefully-verified pass at a time.** It's a line count, not a bug.

## 2.3 Small, real, unclaimed

None of these are P-items yet; each is a finding with a known fix.

| From | Fix |
|---|---|
| ~~**[C1]**~~ | ✅ **DONE 2026-08-10** (brain `ce057e4`) — the durable-trace half. `_report_stale_token()` already wrote a `token_incident` the watchdog and dashboard read; it was only wired to the *stale* branch, so the *missing*-token case (08-07's) left nothing behind. Both branches now write it, message says which. Verify **V-9**. ⚠️ **Still not the alarm — [P-04] is.** _(prior note)_ ⚠️ **Downgraded** — the alert already exists (`_maybe_token_preflight`, 09:16 IST) and is dormant only because [P-04]'s Telegram token is unset. **[P-04] is the fix; this is second-best.** Still worth writing a `NO_TOKEN_AT_OPEN` marker eventually for the *post-mortem* trace (08-07's `brain_activity` had zero rows 03:30→07:11 UTC, so the loss was invisible afterwards too) — but via `db.write_config`, since `log_brain_activity` needs a `session_id` and swallows exceptions, so a no-session insert could fail silently and look shipped. |
| ~~**[C5]**~~ | ✅ **DONE 2026-08-10** (brain `ce057e4`). `archive_traded_day_candles()` re-reads the full traded day, 15:40–16:30 IST, day-gated, idempotent; a test pins the gate shut during market hours. Verify **V-10**. Runs forward only. _(original)_ Archive the day's traded symbols' tail bars **post-close, in `data_jobs.py`** — ⚠️ **not** in the close path, which is where I first wrote it. That would reintroduce the documented `archive_candles` latency regression (~7s/cycle), and a slow exit path is measured to fill stops at −2.78R instead of ≈−1R. Found by [P-30]: 10 of 118 clean-exit trades exit past the last archived bar. Benign for [P-30]; matters for anything treating `candles` as a complete path. |
| ~~**[C2]**~~ | ✅ **DONE 2026-08-08** (brain `a68e136`). Audited all 500 pins against Kite's live master: 499 matched, JBCHEPHARM was the only dead one and is absent from the master entirely — dropped. No rebuild needed. Added `scripts/audit_nifty500_tokens.py` (read-only, no auth) and verify **I-6**. Suite 894 green. |
| pacing script | Refresh the stale header comment (numbers are fine — see §1.2). |

---

# PART 3 — On nobody: waiting on time or data

| Item | Waiting for |
|---|---|
| **[P-18]** Advisor calibration (ECE) | ~**late August 2026**. 31 graded calls; ~85% of advice is `trigger_type=MACRO` on a 30-trading-day horizon, so only ~3 MICRO rows grade per session. First MACRO wave (07-12) matures ~08-24, 07-22's ~09-02. **Don't re-open this weekly expecting movement.** ([P-32] is the attempt to break this bottleneck.) |
| **V-7** ([P-25]) | A session where you actually trade. A BUY won't show same-day — the holdings feed reports delivered stock only, so purchases land T+1 and intraday round-trips never land. |
| **[P-09] / [P-10] / [P-11]** | Graded data across regimes. Downstream of [P-18]. |
| **[P-08]** client-profile layer | After gate #6. |
| Android mobile re-check | Open since 08-07; needs a device. |

---

# PART 4 — Ruled out, so it isn't re-litigated

- **Supabase anon key rotation** — unnecessary. It's designed to be public and
  RLS is airtight; rotating it forces a JWT-secret regen that also breaks
  `service_role`, for ~zero gain. [P-04] is Telegram-only.
- **Most of the finserv plugins** — DCF/LBO/comps/research formats need
  fundamentals we don't have; the IB, fund-admin and KYC verticals are a
  different business. ⚠️ **`tax-loss-harvesting` specifically:** the concept is
  relevant to a book holding RVNL at −46.3%, but every mechanic is US tax code —
  and **India has no wash-sale rule**. Applying it as written would produce
  confident, wrong advice. Detail: [reference/FINSERV_PLUGINS.md](reference/FINSERV_PLUGINS.md).
- **Rebuilding TOTP** — already shipped and dormant. See §1.5.
- **Reading 08-07's trade count as a verdict on [P-31]** — a 2h50m session caps
  volume regardless. 08-07 is a clean read on *diversity* (46→86 symbols), not
  volume.
- **Enabling trend-tells** — streak broken (+0.134, +0.182, then −0.093). Stays
  dark. Sign-flipping session to session is exactly what [P-21] warned of.

---

## The one-line summary

**You:** do **[P-04]** first — three minutes, and it switches on a dead-token
alarm that is already written and would have saved 55% of the 08-07 session.
Then: paste the token daily; Monday = pacing script pre-market, then repair +
seed decision + audits post-close. Everything else of yours is a decision with
no deadline.

**Me:** [P-32]/[P-33]/[P-34] are ready to build — [P-32] needs one answer from
you first.

**The project:** still no proven edge, and the verdict still rests on gate #6,
which rests on [P-01].
