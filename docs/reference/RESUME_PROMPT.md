# Resume prompt

Paste the block below to start a new session. **This file is the prompt only** —
the state it refers to lives in [STATUS.md](../STATUS.md) (updated in place, never
snapshotted; see the docs convention in STATUS's header). Keep this prompt
generic; when something changes, change STATUS, not this.

---

```
Resuming the zerodha paper-trading project (brain = ~/Desktop/GITHUB/zerodha-brain,
dashboard = ~/Desktop/GITHUB/zerodha-trading, prod Supabase gilmuwmtdpjccibfhqtx).

Read first, in order: docs/STATUS.md — start with the "▶️ START HERE NEXT SESSION"
block at the top, which names the current priority and why. Then docs/PIPELINE.md
(the board), docs/reference/VERIFY.md (open checks owed on shipped fixes — this is
what the post-session audit runs first), and docs/reference/KNOWN_ISSUES.md
(the C-series is the newest batch). If you want it cut by OWNER instead of by
status — what is blocked on the user vs on you, with exact commands — read
docs/OPEN_ITEMS.md. docs/README.md maps how they all connect.

Two ID namespaces: K/W/A/B = KNOWN_ISSUES findings, P-nn = PIPELINE work items.
K7 is not P-07. Shipping a fix owes VERIFY.md a row with runnable SQL and the
number that counts as a pass — a fix with no VERIFY row is unmeasured, not done.

Context up front:
- Deploy = git push origin main. The service auto-deploys from GitHub; deploy.sh
  hard-aborts on unpushed/dirty/non-main. NEVER push while a session is RUNNING —
  it restarts the brain and truncates the day's data collection. Push post-close.
- Dashboard auto-deploys from main on Vercel; the brain's full suite is CI-gated
  on push. Deployed SHAs and the current suite count are in STATUS's "Deployed:"
  line — read them there, they are not repeated here on purpose.
- Supabase/Railway are MCP connectors — if their tools are missing they need
  reconnecting via claude.ai connector settings or /mcp. Railway CLI + npm/node/
  python may not be on PATH in a fresh shell:
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; python is ~/opt/anaconda3/bin/python.
  `railway logs --since Nh --lines 5000` for history (--lines caps ~5000).
  Kill any zombie `next start` on :3000 before running the dashboard locally.
- The dashboard has a /learn page explaining the whole system to a non-builder.
  If a change alters BEHAVIOUR (a new subsystem, the trading loop, the risk
  gates, advisor scoring, a corrected finding, a new house rule), update
  app/learn/page.tsx in the SAME change. Numbers there are live from
  /api/learn/stats — never hard-code a figure into that page.
- Do NOT foreground P-01 (Kite ₹500) or P-03 (TOTP) — user deprioritized both.
  This holds even though P-03 measurably cost ~55% of the 08-07 session: record
  the cost, don't re-open the decision.
- The two claude.ai routines ARE live (confirmed 08-07 — one committed
  `chore(review)` mid-session). They work from what the docs already say rather
  than re-querying prod, and they leave the full audit queued, so expect to
  rebase and still run the real sweep yourself.

NOTE (since 2026-09-09): the intraday TRADING engine is DECOMMISSIONED — no
sessions run any more, so the session-audit flow below is HISTORICAL. Do not
restart trading without an explicit decision (it fails its own reopening
criteria; POST_MORTEM §5). The live subsystem is the advisor only.
- (historical) git_sha stamped the deployed brain SHA; capture health was
  trades/decisions/link-count/advice cadence/candles; /post-session-check +
  /counterfactual-audit ran only after market close. None of this applies now.

Standing conclusion (SETTLED — the trading engine is decommissioned, 2026-09-09):
no edge, and the loss is an identity — cost in R = friction ÷ stop ≈ 0.424R,
which equals measured expectancy, so no configuration escapes it. The
out-of-sample verdict replay (Part B / V-18: 164 independent dates) is null, and
SEBI's Algo-ID framework makes the scraped-token architecture non-compliant for
live automation. Full record: reference/POST_MORTEM.md; every hypothesis counted
in reference/TRIAL_LEDGER.md (253 trials → significance bar z ≥ 3.72).

Current mode = advisor-only + engineering freeze. Do NOT "work the board" or
re-open gate #6 — both are superseded. The ONE live thing is the pre-registered
advisor decision read at n=400 (V-20). Start at STATUS's "▶️ START HERE" block
(the "📍 Exact resume point" sub-block) — it names the immediate action and what
is gated on the operator. Do not run new return-prediction analysis.
```

---

## Notes for whoever resumes

- **Don't create dated `HANDOFF_*` files.** STATUS.md is the single source of
  truth and is updated in place; `reference/` holds durable detail, `archive/`
  holds retired docs. This was set in the 2026-07-27 reorg.
- **Timestamps in Supabase are UTC** (IST = UTC+5:30). Market close ≈ 09:51 UTC.
- **Column names differ from what you'd guess** in several tables — e.g.
  `trading_sessions.end_reason`/`total_trades_executed` (not `stop_reason`/
  `total_trades`), `trades.position_type` (not `side`/`direction`),
  `stock_observations.phase` is a column not a payload key, `market_context`/
  `quote_snapshots` use `captured_at`, `candles` uses `trade_date`,
  `inplay_list` uses `date`/`locked_at`. Check
  `information_schema.columns` before guessing.
- **Verify before you trust a stored target.** Several acceptance numbers on
  this board go stale because the underlying table keeps growing (the [P-24]
  repair target moved from `9 / −39,983.84` to `11 / −45,796.41` in one day).
  Derive totals at run time; the invariant is usually a delta, not an absolute.
- **Two live-system rules that have each already bitten:** never `git push` the
  brain while a session is RUNNING (it restarts and truncates collection —
  dashboard pushes are safe, they only deploy Vercel), and never audit a live
  session (half the day's rows don't exist yet, so it misreports).
- **Prod writes may be blocked** by the permission classifier (Supabase
  `UPDATE`/`DELETE`, `railway variables --set`). DDL via `apply_migration` and
  ordinary inserts have gone through. When blocked, write the exact SQL or
  script to a file and hand it over — do not work around it.
- **Advisor grading cadence:** ~85% of `portfolio_advice` rows are
  `trigger_type=MACRO` on a **30-trading-day** horizon, so only ~3 MICRO rows
  grade per session. A large "ungraded backlog" is normal, not starvation — the
  pass log now splits `not_due` by horizon (`[10d=… 30d=…]`) to make this obvious.
