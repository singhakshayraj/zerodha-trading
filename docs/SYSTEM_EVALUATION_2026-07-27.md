# System Evaluation + God-Mode Improvement Roadmap — 2026-07-27

Honest, three-lens evaluation of the whole system as built, then a concrete
solution for **every** weakness found — sequenced so we improve iteratively
toward a "god-mode" system. Companion: `docs/HANDOFF_2026-07-26.md`,
`docs/NEXT_SESSION_TODO.md`, `docs/VISION.md`.

Brain live on `8edb746`; dashboard on Vercel. Verdict basis: the 3 measured
sessions (07-22/23/24) + the first 21 graded advisor calls.

---

## PART 1 — THE EVALUATION

| Lens | Score | One-line |
|---|---|---|
| Financial advisor | **5/10** | Real discipline (tax-loss, correlation, self-grading) but advises a chart, not a person, with no fundamentals. |
| Seasoned trader | **3.5/10** | Measured *negative* edge (PF 0.33), trades through its own stop, and parks the one decisive test over ₹500. |
| Software engineer | **7/10** | 825 green tests, pure core, dark-flag learning pattern — but a token leak in logs, artisanal deploys, and a daily-paste SPOF. |
| **Overall** | **5/10** | An 8/10 truth-telling machine wrapped around a 2/10 engine; the effort has gone into eloquence, not answering the edge question. |

**Sub-scores**
- Trading strategy (the engine): **2/10** — measured negative edge, this regime.
- Measurement / learning system: **8/10** — genuinely excellent, self-honest.
- Portfolio advisor: **5.5/10** — useful, no fundamentals, low-n.
- Engineering craft: **7/10**.
- Capital-allocation of *your own effort*: **3/10** — the real problem.

**The core finding:** the system's best quality is that it never lies to you —
and it keeps reporting *no edge*. The response so far has been to make the
machine more articulate instead of running the ₹500 experiment that answers the
question. Fix that first; everything else is enrichment.

---

## PART 2 — SOLUTIONS (per finding)

Each: **Problem → Solution → God-mode target → Effort / Measure-of-done.**
Tags: 🔴 blocking · 🟠 high · 🟡 medium · ⚪ low. Owner: [me]=buildable now,
[you]=decision/action, [both].

### TRADER FINDINGS (the engine — highest stakes)

**T1 — Unknown true edge (only live-paper, one regime). 🔴 [you→me]**
- Problem: PF 0.33 over 3 recent days is real but tiny-sample + single regime
  (SIDEWAYS→BEARISH). The only decisive test — gate #6 historical backtest over
  2020–2022 — is built but unrun.
- Solution: (a) subscribe Kite Connect historical (₹500/mo, data-only). (b) I
  build the chunked puller → local Parquet (respecting interval date-caps +
  rate limits). (c) run `backtest.py` across bull/bear/chop regimes.
- God-mode: an edge verdict with a number — PF + expectancy per regime, with
  confidence intervals — that *decides* keep / redesign / kill.
- Effort: puller ~1 day once keys exist. **Measure:** `backtest.py` outputs
  per-regime PF over ≥2 years.

**T2 — Trades through its own 3R daily stop. 🟠 [you→me]**
- Problem: data-collection override keeps trading past DAILY_STOP_3R; measured
  bleed both full days (−803→−1,278; −888→−1,582).
- Solution: flip the override off now the data-volume goal is largely met; keep
  soft-stopped trades logged as counterfactuals (already do). Make the hard stop
  the default; expose it as a tunable.
- God-mode: regime-aware stop (tighter in chop) once gate #6 says the strategy
  is worth running at all.
- Effort: ~1 hr (config + guard). **Measure:** no session's realized P&L crosses
  −3R after the marker.

**T3 — Effort sequenced backwards. 🔴 [you]**
- Problem: weeks of instrumentation before the dyno test. Classic build-trap.
- Solution: freeze net-new strategy features until gate #6 runs. Advisor/agent
  work continues (separate product), but the *trader* gets no more knobs until
  it has a verdict.
- God-mode: a written "definition of done" for the trader — a PF threshold that
  gates any further trader investment (VISION §6.1 already has >1.3 go / <1.1
  reject; enforce it).
- Effort: 0 (discipline). **Measure:** no trader-strategy commit until backtest.

**T4 — Churn (66 trades/day) at ~1:1 payoff. 🟡 [me]**
- Problem: high frequency compounds cost drag; even with edge, 66/day is thin.
- Solution: add a trade-frequency vs expectancy analysis to the counterfactual
  suite — bucket trades by setup quality (signal strength, regime, time-of-day)
  and measure expectancy per bucket; surface the low-expectancy buckets to
  consider filtering.
- God-mode: a learned "should I take this trade" quality gate, dark-flagged and
  graded like the advisor factors before it ever filters live.
- Effort: ~half day (analysis script). **Measure:** expectancy-by-bucket table;
  identify buckets with n≥30 and negative expectancy.

### FINANCIAL-ADVISOR FINDINGS

**FA1 — Advises a chart, not a person. 🟠 [both]**
- Problem: no client context — income, goals, horizon, tax bracket, liquidity
  needs, risk tolerance. "SELL RVNL" without "into what, and does it fit your
  plan" is half advice.
- Solution: a **client-profile layer** (`app_config` or a table): horizon,
  risk band, tax bracket, cash-need dates, do-not-sell list. Feed it into
  verdict framing + sizing (e.g., suppress SELL on a name inside a long-term
  tax-advantaged hold; scale urgency to horizon).
- God-mode: goal-based advice — "you're 4% behind your ₹X target; here's the
  rotation that closes it at your risk band." Advice conditioned on the person.
- Effort: ~1 day (profile schema + wire into `advise()`). **Measure:** verdicts
  visibly change when profile changes (tests pin it).

**FA2 — No fundamentals at all. 🟠 [you→me]**
- Problem: HOLD/SELL on long-term holdings from pure technicals is trading in
  advisor's clothing. Agent P3 slot exists but is null.
- Solution: pick a source — free (screener.in / NSE corporate-announcements /
  yfinance) vs paid. I build a `fundamentals` provider filling the P3 slot:
  P/E, earnings date, latest results delta, debt trend, promoter holding change.
  Fold as a *dark* factor first (graded before it moves the score).
- God-mode: fundamentals + technicals + news fused per stock, each factor
  weight *earned* via the calibration/attribution loop, not hand-set.
- Effort: ~1–2 days after source choice. **Measure:** `stock_observations`
  payload `fundamentals` non-null; factor_attribution can bucket on it.

**FA3 — Low hit rate / HOLDs punished (regime effect). 🟡 [me, in progress]**
- Problem: 42.9% overall, 18.2% on HOLDs — but n=21, one down-tape.
- Solution: already building the fix path — calibration infra (shipped, dark) +
  regime-conditional factor weighting (Pillar 3, next). Accumulate graded calls
  across regimes, let attribution reweight on evidence. Do NOT hand-tune.
- God-mode: self-calibrating confidence that means what it says (reliability
  curve monotonic), factor weights per regime — the flywheel.
- Effort: infra done; needs data (weeks). **Measure:** calibration ECE ↓ and
  curve turns monotonic as n grows; regime-split attribution stabilizes.

**FA4 — No entry-discipline / position-sizing for new buys. 🟡 [me]**
- Problem: the book is deeply red (−47% RVNL etc.); advisor only manages exits,
  has no "never over-buy one name again" layer for rotation *into* names.
- Solution: a position-sizing + entry-quality module for rotation targets —
  cap single-name and correlated-cluster weight (reuse the v2 correlation read),
  size by conviction × risk band, refuse entries into weekly downtrends.
- God-mode: portfolio-construction advice, not just per-name calls — target
  weights, rebalance path, correlation budget.
- Effort: ~1 day. **Measure:** rotation suggestions carry a sized, capped target
  weight that respects the correlation budget.

### SOFTWARE-ENGINEER FINDINGS

**SE1 — Secret leak: Telegram bot token in logs. 🔴 [both] — SECURITY**
- Problem: `getUpdates` 409 errors print the full bot URL incl token
  (`bot<id>:<secret>`) to Railway logs on every restart. Logs are a secondary
  secret store.
- Solution: (a) [me] redact the token from all error prints (wrap the Telegram
  client so URLs are masked in exceptions). (b) [you] rotate the bot token via
  @BotFather; update the Railway var. (c) [me] audit Supabase **RLS** — new
  `stock_observations` (and others) shipped without explicit policies; the
  service key masks missing RLS. Add row-level policies / confirm anon key can't
  read.
- God-mode: no secret ever reaches a log line; a pre-commit + CI secret scanner;
  RLS default-deny on every table.
- Effort: redaction ~30 min; RLS audit ~1 hr; rotation ~5 min (you). **Measure:**
  grep of prod logs shows no `bot\d+:` pattern; `get_advisors` security lint clean.

**SE2 — Artisanal, unguarded deploy pipeline. 🟠 [me]**
- Problem: manual `railway up` tarball, hand-bumped GIT_SHA (already regressed to
  "unknown"), a silent auto-deploy failure sat a day, no CI running the 825 tests
  before deploy.
- Solution: GitHub Actions — on push to main: run the full suite; if green,
  deploy via Railway CLI and set GIT_SHA from the commit automatically. Fail
  loud on red. Kills both hand-cranked steps.
- God-mode: green-to-prod in one path, tests gating every deploy, SHA always
  truthful, rollback one command.
- Effort: ~half day. **Measure:** a red test blocks deploy; `trading_sessions.git_sha`
  always a real SHA; no manual `railway up`.

**SE3 — Daily manual token paste = SPOF; TOTP dormant. 🟠 [you→me]**
- Problem: the "24/7 agent" dies without a human 9 AM ritual. TOTP auto-login
  built but off (needs Zerodha-side setup).
- Solution: [you] complete Zerodha TOTP/API setup; [me] wire + test the dormant
  auto-login path so the token refreshes headless daily.
- God-mode: genuinely always-on — no human in the daily loop; alert only on
  auth failure.
- Effort: ~half day once Zerodha side is ready. **Measure:** a session starts
  with no manual paste; token auto-refreshes.

**SE4 — `portfolio_advisor.py` ~1,500 lines. 🟡 [me]**
- Problem: one module now holds indicators-glue, advise(), risk v2, calibration
  wiring, timeline, digest, two run loops. Change-risk rising.
- Solution: split — `advisor/` package: `scoring.py` (advise + trend_score),
  `risk.py` (portfolio_risk + correlation), `runs.py` (run_advisor/lite/capture),
  `digest.py`. Keep public API stable; move tests alongside.
- God-mode: small, single-responsibility modules; each pure core independently
  testable.
- Effort: ~half day (mechanical, tests guard it). **Measure:** no file >600 lines;
  suite still green.

**SE5 — Test runtime ≠ prod runtime. 🟡 [me]**
- Problem: tests on py3.9/anaconda; prod on a different Python. Drift risk.
- Solution: pin the Python version in CI to prod's; add a lockfile; run the suite
  on the prod image in CI (folds into SE2).
- God-mode: bit-identical test + prod env. **Measure:** CI uses the prod Python;
  lockfile committed.

### META FINDING

**M1 — Effort allocated to eloquence, not the decision. 🔴 [you]**
- Problem: the machine keeps saying "no edge"; we keep improving how nicely it
  says it.
- Solution: the sequencing rule in T3 + a single "north-star" check at the top of
  every session: *has gate #6 run yet? if no, that's the priority.*
- God-mode: the system's own dashboard nags you — a banner "EDGE UNVERIFIED —
  gate #6 not run" until it is. (I can build that in 20 min.)
- Effort: trivial. **Measure:** the banner exists and clears only when gate #6 has
  a result.

---

## PART 3 — SEQUENCED ROADMAP (do in this order)

**Sprint 0 — safety + truth — ✅ DONE 2026-07-27 (brain `71b8848`, dashboard `37f87dd`):**
1. ✅ SE1 — Telegram token scrubbed from logs (`_safe`). **RLS was worse than
   the lint implied:** 8 tables (incl `app_config`, which stores the enc_token)
   had a policy named "Service role full access" actually granted to `{public}`
   with `USING(true)` — i.e. the *public/anon* key (bundled in the dashboard JS)
   had full read/write. Rescoped all 8 to `service_role`; `performance_daily`
   view set `security_invoker`; `anon` EXECUTE on `rls_auto_enable` revoked;
   3 functions' `search_path` pinned. Advisor lint: the 8 always-true WARNs +
   the DEFINER-view ERROR cleared; dashboard API verified still working.
   ⏳ **You: rotate the Telegram bot token** via @BotFather (it was in logs) +
   update the Railway var. Consider rotating the Supabase anon key too.
2. ✅ M1 — "EDGE UNVERIFIED" banner on the command center (clears when
   `app_config.gate6_result` exists).
3. ✅ T2 — `-3R` daily stop now HARD even in data-collection
   (`ENFORCE_DAILY_STOP_3R`, default on). Note: sessions now halt at `-3R`
   (fewer trades/day, no bleed); set the env `false` to revert to fully-soft.

**Sprint 1 — answer the question (needs your ₹500 call):**
4. 🔴 T1/T3 Kite historical → puller → **run gate #6** [you decision → me build].
   *This is the hinge. Nothing else matters as much.*

**Sprint 2 — de-risk the ops (me, parallel-safe):**
5. 🟠 SE2 CI pipeline (tests-gate-deploy + auto GIT_SHA) [me].
6. 🟠 SE3 TOTP auto-login [you setup → me wire].
7. 🟡 SE4 module split [me].

**Sprint 3 — make the advisor genuinely advisory (after edge verdict):**
8. 🟠 FA2 fundamentals provider (agent P3) [you source → me build].
9. 🟠 FA1 client-profile layer [both].
10. 🟡 FA4 position-sizing / entry-quality [me].
11. 🟡 T4 trade-quality bucketing [me].
12. 🟡 FA3 regime-conditional weights (Pillar 3) — as data accrues [me].

**Sprint 4 — god-mode polish:**
13. Agent P4 timeline UI; fused multi-factor per-stock scoring; goal-based advice.

---

## The one sentence
Pay the ₹500, run gate #6, and plug the token leak — those three unlock or
protect everything. The rest is a well-ordered backlog the system has already
earned the right to build.
