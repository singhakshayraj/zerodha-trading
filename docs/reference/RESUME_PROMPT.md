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
(§A and §B are the live findings). docs/README.md maps how those four connect.

Two ID namespaces: K/W/A/B = KNOWN_ISSUES findings, P-nn = PIPELINE work items.
K7 is not P-07. Shipping a fix owes VERIFY.md a row with runnable SQL and the
number that counts as a pass — a fix with no VERIFY row is unmeasured, not done.

Context up front:
- Deploy = git push origin main. The service auto-deploys from GitHub; deploy.sh
  hard-aborts on unpushed/dirty/non-main. NEVER push while a session is RUNNING —
  it restarts the brain and truncates the day's data collection. Push post-close.
- Brain is on f645ff3; dashboard auto-deploys from main on Vercel. Full suite (872)
  CI-gated on push.
- Supabase/Railway are MCP connectors — if their tools are missing they need
  reconnecting via claude.ai connector settings or /mcp. Railway CLI + npm/node/
  python may not be on PATH in a fresh shell:
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"; python is ~/opt/anaconda3/bin/python.
  `railway logs --since Nh --lines 5000` for history (--lines caps ~5000).
  Kill any zombie `next start` on :3000 before running the dashboard locally.
- Do NOT foreground P-01 (Kite ₹500) or P-03 (TOTP) — user deprioritized both.

If a session is running or has run today, verify + audit:
- git_sha on the session stamps the deployed brain SHA (confirms the deploy chain).
- Capture health: trades / brain_decisions nulls + decision→trade link count,
  portfolio_advice run cadence, stock_observations phases, candles.
- Then /post-session-check + /counterfactual-audit — but only AFTER market close
  (~10:00 UTC / 15:30 IST); auditing a live session misreports.

Standing conclusion: no proven edge. [P-21] found no feature-based entry edge that
holds out-of-sample, and no dark flag has earned ENABLE. The real edge verdict rests
on gate #6, blocked on the Kite ₹500 user decision. Work the PIPELINE board; pull
the top Ready item.
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
- **Advisor grading cadence:** ~85% of `portfolio_advice` rows are
  `trigger_type=MACRO` on a **30-trading-day** horizon, so only ~3 MICRO rows
  grade per session. A large "ungraded backlog" is normal, not starvation — the
  pass log now splits `not_due` by horizon (`[10d=… 30d=…]`) to make this obvious.
