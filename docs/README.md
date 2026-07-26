# Docs — start here

Map of the project's documentation. **Four living docs** carry the current
picture; everything else is stable reference or dated history.

## 🟢 Living docs (read/update these)

| Doc | What it answers | Update cadence |
|---|---|---|
| **[STATUS.md](STATUS.md)** | *Where are we right now?* — deployed versions, live subsystems, open items, verify-list. **The single source of truth for current state.** | every session |
| **[ROADMAP.md](ROADMAP.md)** | *What's next?* — the gate-#6 hinge, sprints, priorities, T4 findings. | when priorities change |
| **[PIPELINE.md](PIPELINE.md)** | *What's moving?* — the live kanban board; where feedback becomes tracked items and daily work is pulled from. | continuously (the feedback loop) |
| **[VISION.md](VISION.md)** | *Why?* — mission, trading fundamentals, risk limits, the pre-run gates + go/no-go criteria (§6.1, §7). The durable reference. | rarely |
| this **README** | *Where is everything?* | when docs move |

> Do **not** create new dated `HANDOFF_YYYY-MM-DD.md` files — fold current state
> into STATUS.md. Old handoffs live in `archive/`.

## 📘 reference/ — stable technical specs
- [reference/ENGINEERING_SPEC.md](reference/ENGINEERING_SPEC.md) — system architecture + REQ list.
- [reference/ADVISOR_MODULE.md](reference/ADVISOR_MODULE.md) — the portfolio advisor design.
- [reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md) — tracked bugs/quirks.
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
