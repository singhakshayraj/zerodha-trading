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
(the C-series is the newest batch). docs/README.md maps how those four connect.

Two ID namespaces: K/W/A/B = KNOWN_ISSUES findings, P-nn = PIPELINE work items.
K7 is not P-07. Shipping a fix owes VERIFY.md a row with runnable SQL and the
number that counts as a pass — a fix with no VERIFY row is unmeasured, not done.

Context up front:
- Deploy = git push origin main. The service auto-deploys from GitHub; deploy.sh
  hard-aborts on unpushed/dirty/non-main. NEVER push while a session is RUNNING —
  it restarts the brain and truncates the day's data collection. Push post-close.
- Brain is on 3489ac6; dashboard auto-deploys from main on Vercel. Full suite (894)
  CI-gated on push.
- Supabase/Railway are MCP connectors — if their tools are missing they need
  reconnecting via claude.ai connector settings or /mcp. Railway CLI + npm/node/
  python may not be on PATH in a fresh shell:
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; python is ~/opt/anaconda3/bin/python.
  `railway logs --since Nh --lines 5000` for history (--lines caps ~5000).
  Kill any zombie `next start` on :3000 before running the dashboard locally.
- Do NOT foreground P-01 (Kite ₹500) or P-03 (TOTP) — user deprioritized both.
  This holds even though P-03 measurably cost ~55% of the 08-07 session: record
  the cost, don't re-open the decision.
- The two claude.ai routines ARE live (confirmed 08-07 — one committed
  `chore(review)` mid-session). They work from what the docs already say rather
  than re-querying prod, and they leave the full audit queued, so expect to
  rebase and still run the real sweep yourself.

If a session is running or has run today, verify + audit:
- git_sha on the session stamps the deployed brain SHA (confirms the deploy chain).
- Capture health: trades / brain_decisions nulls + decision→trade link count,
  portfolio_advice run cadence, stock_observations phases, candles.
- Then /post-session-check + /counterfactual-audit — but only AFTER market close
  (~10:00 UTC / 15:30 IST); auditing a live session misreports.

Standing conclusion: no proven edge, now with a sharper number. [P-21] found no
feature-based entry edge that holds out-of-sample, and no dark flag has earned
ENABLE (trend-tells went +0.134, +0.182, then −0.093 — streak broken, stays dark).
[P-29] `/autopsy` then showed **no exit policy rescues the book either**, and
[P-30]'s candle replay sharpened that to an exact number: none of 180 policies
clears breakeven, and **none clears it even at zero transaction cost** (best
−0.077R). So the entries are slightly worse than a coin flip and there is no
cost structure that rescues them — the edge has to come from the entries. The
verdict still rests on gate #6, blocked on the Kite ₹500 decision. Work the
PIPELINE board; pull the top Ready item.
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
