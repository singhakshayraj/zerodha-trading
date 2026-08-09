# Docs — start here

Map of the project's documentation. **Six living docs** carry the current
picture; everything else is stable reference or dated history.

## The loop these docs form

Nothing here is a filing cabinet — each doc is one leg of a cycle, and the
cycle is what keeps work from being silently dropped:

```
KNOWN_ISSUES  →  PIPELINE  →  (ship)  →  VERIFY  →  PIPELINE
  a finding      gets a P-nn            owes a       PASS → Done
  (K/W/A/B id)   + measurable done      runnable     FAIL → Ready
                                        check
```

`/post-session-check` drives it every market day: it runs the **VERIFY** ledger
first, then the data-quality scorecard, then appends new findings to
**KNOWN_ISSUES** and updates **PIPELINE** + **STATUS**. `/counterfactual-audit`
feeds the flag-watch tables in VERIFY.

**Two ID namespaces, deliberately distinct:** `K7`/`W2`/`A1`/`B3` are
KNOWN_ISSUES *findings*; `P-01`…`P-34` are PIPELINE *work items*. `K7` is not
`P-07`. A finding earns a `P-nn` only when it becomes tracked work.

## 🟢 Living docs (read/update these)

| Doc | What it answers | Update cadence |
|---|---|---|
| **[STATUS.md](STATUS.md)** | *Where are we right now?* — deployed versions, live subsystems, open items, verify-list. **The single source of truth for current state.** | every session |
| **[ROADMAP.md](ROADMAP.md)** | *What's next?* — the gate-#6 hinge, sprints, priorities, T4 findings. | when priorities change |
| **[PIPELINE.md](PIPELINE.md)** | *What's moving?* — the live kanban board; where feedback becomes tracked items and daily work is pulled from. | continuously (the feedback loop) |
| **[reference/VERIFY.md](reference/VERIFY.md)** | *Did the fixes actually work?* — the open-checks ledger. Every shipped fix registers runnable SQL + its pass number here; `/post-session-check` executes them. | every session |
| **[OPEN_ITEMS.md](OPEN_ITEMS.md)** | *Who owes what?* — the same work cut by **owner** instead of status: what's on you (with exact commands), what's on me, what's waiting on time, what's ruled out. A derived view — PIPELINE and VERIFY stay authoritative. | when ownership shifts |
| **[VISION.md](VISION.md)** | *Why?* — mission, trading fundamentals, risk limits, the pre-run gates + go/no-go criteria (§6.1, §7). The durable reference. | rarely |
| **`/learn`** (the app, not a doc) | *How does this all work?* — the in-app explanation of the system for a reader with basic finance knowledge: vocabulary, the trading loop, the advisor, how we measure, what we found. | **with any behaviour change** |
| this **README** | *Where is everything?* | when docs move |

> Do **not** create new dated `HANDOFF_YYYY-MM-DD.md` files — fold current state
> into STATUS.md. Old handoffs live in `archive/`.

> ### 📚 Changing behaviour? Update `/learn` in the same change.
> `app/learn/page.tsx` is the teaching surface — it explains the system to
> someone who did not build it. It goes stale the same way STATUS used to: not
> all at once, but one unmentioned change at a time, until it quietly teaches
> something false. So treat it like a test that must be kept green.
>
> **It needs editing when:** a new subsystem or page ships; the trading loop,
> the risk gates or the advisor's scoring change; a finding is corrected or
> reversed (this has already happened twice); or a house rule is added.
>
> **It does NOT need editing for numbers.** Every figure on the page is read
> live from `/api/learn/stats`, deliberately — hard-coded numbers in teaching
> material start lying the first time a session runs. Add to that endpoint
> rather than pasting a number into the prose.

## 📘 reference/ — stable technical specs
- [reference/ENGINEERING_SPEC.md](reference/ENGINEERING_SPEC.md) — system architecture + REQ list.
- [reference/ADVISOR_MODULE.md](reference/ADVISOR_MODULE.md) — the portfolio advisor design.
- [reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md) — tracked bugs/quirks (findings: `K`/`W`/`A`/`B`).
- [reference/EXIT_FRONTIER.md](reference/EXIT_FRONTIER.md) — the `/autopsy` page: idea, method, results, and the phase-2 candle-replay plan.
- [reference/EDGE_STUDY_P35.md](reference/EDGE_STUDY_P35.md) — **current** entry-edge verdict (2026-08-10); supersedes P-21's conclusion.
- [reference/EDGE_STUDY_P21.md](reference/EDGE_STUDY_P21.md) — the original entry-edge study + method (conclusion since reversed).
- [reference/GATE_MEASURES.md](reference/GATE_MEASURES.md) — the go/no-go gate time series (PF, expectancy, drawdown, advisor ECE). Split out of PIPELINE 2026-08-10.
- [reference/FINSERV_PLUGINS.md](reference/FINSERV_PLUGINS.md) — the claude-for-financial-services plugins: which four ideas transfer, and which are ruled out (so it isn't re-litigated).
- [reference/RESUME_PROMPT.md](reference/RESUME_PROMPT.md) — the paste-block for starting a new session.
- [reference/TEST_COVERAGE.md](reference/TEST_COVERAGE.md) — what the suite covers.

## 🗄️ archive/ — history + superseded (kept for the record)
- `SYSTEM_EVALUATION_2026-07-27.md` — full three-lens eval that seeded the roadmap.
- `SESSION_HANDOFF.md` — the long append-only running log (pre-2026-07-25).
- `HANDOFF_2026-07-25.md`, `HANDOFF_2026-07-26.md` — dated checkpoints (→ now STATUS.md).
- `POST_MARKET_TODO.md`, `NEXT_SESSION_TODO.md`, `POST_CLOSE_ACTION_PLAN.md` — old todo/plan lists (→ now STATUS + ROADMAP).
- `PAPER_TRADING_ROADMAP.md`, `UI_GODMODE_PLAN.md` — completed phase/feature plans.
- `NEWS_CORRELATION_PLAN.md`, `TIMING_CORRELATION_PLAN.md`, `ML_TRACK_C_NOTES.md` — shipped/dormant feature notes.

## Repos + infra
- **Dashboard** (this repo, `zerodha-trading`) — Next.js on Vercel; API + Supabase writes.
- **Brain** (`~/Desktop/GITHUB/zerodha-brain`) — Python decision engine on Railway. Deploy: `scripts/deploy.sh`.
- **Supabase** prod `gilmuwmtdpjccibfhqtx` — timestamps UTC (IST = UTC+5:30).
- Post-session skills: `/post-session-check`, `/counterfactual-audit`.
