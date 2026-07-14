# Test Coverage — Baseline & Path to 100%

Living document. Tracks brain-repo (`zerodha-brain`) test coverage and the
incremental push toward full coverage of the logic that matters.

Run: `cd zerodha-brain && python3 -m pytest -q --cov=. --cov-report=term`

## Baseline — 2026-07-14

- **Overall (incl. test files): 87%**
- **Production code only: 76%** (5,154 stmts, 1,244 uncovered) — the honest number
- Suite: 704 tests, all green

## Per-file (production modules, ascending) — 2026-07-14 start

| File | Stmts | Miss | Cov | Target | Notes |
|------|-------|------|-----|--------|-------|
| main.py | 14 | 14 | 0% | smoke | entrypoint — one import/boot test |
| telegram.py | 35 | 21 | 40% | 100% | new get_updates/answer_callback net paths |
| database.py | 613 | 332 | 46% | ~85% | biggest gap; per-fn error branches |
| market_data.py | 212 | 99 | 53% | ~80% | live-fetch paths; some unreachable w/o Kite |
| kite_client.py | 164 | 76 | 54% | FLOOR | real HTTP + order methods — do NOT exercise orders |
| watchdog.py | 121 | 52 | 57% | ~85% | Supabase-poll loop |
| trading_principles.py | 151 | 58 | 62% | 100% | pure logic — should be fully covered |
| order_manager.py | 100 | 33 | 67% | ~85% | live-order branches are the floor |
| qa_market.py | 105 | 32 | 70% | n/a | test harness itself |
| scheduler.py | 391 | 99 | 75% | ~90% | run-loop orchestration |
| news_jobs.py | 98 | 23 | 77% | ~95% | |
| indicators.py | 254 | 57 | 78% | 100% | pure math — fully coverable |
| brain.py | 1002 | 210 | 79% | ~90% | decision paths covered; some exit/error branches |
| level_pack.py | 67 | 10 | 85% | 100% | pure |
| risk_manager.py | 143 | 22 | 85% | 100% | money logic — must be high |
| advisor_bot.py | 85 | 11 | 87% | 100% | |
| logger.py | 68 | 9 | 87% | ~95% | |
| data_jobs.py | 134 | 15 | 89% | ~95% | |
| market_regime.py | 41 | 4 | 90% | 100% | |
| signal_engine.py | 136 | 14 | 90% | 100% | money logic |
| paper_broker.py | 70 | 5 | 93% | 100% | |
| trend_tells.py | 71 | 5 | 93% | 100% | |
| portfolio_advisor.py | 423 | 27 | 94% | 100% | |
| config.py | 178 | 8 | 96% | ~98% | |
| regime_detector.py | 67 | 3 | 96% | 100% | |
| advisor_backtest.py | 110 | 3 | 97% | 100% | |
| levels.py | 59 | 2 | 97% | 100% | |
| orb.py | 47 | 1 | 98% | 100% | |
| stock_profile.py | 52 | 1 | 98% | 100% | |
| advisor_watch.py | 81 | 1 | 99% | 100% | |
| data_quality / event_calendar / inplay / token_refresher | — | 0 | 100% | ✅ | |

## Philosophy — what "100%" means here

Not every line should be forced to 100%. Explicit **FLOOR** files:

- **kite_client.py** — the real Kite HTTP paths, especially `place_order` /
  `cancel_order`. Exercising them means real API calls or heavy mock theater
  that tests the mock, not the code. Covered indirectly via paper_broker +
  QA. Floor accepted ~55%.
- **market_data.py / order_manager.py** — live-fetch and live-order branches.
  Paper + QA cover the logic; the raw HTTP wrappers are floored.
- **qa_market.py** — the synthetic-market test harness itself.

Everything else — pure logic, decision paths, risk math, the advisor — has a
realistic **100%** target and is where the incremental work goes.

**Dashboard (Next.js):** no test runner configured (0%). Verified by
`tsc --noEmit` + `next build` + live use. Separate decision whether to add
vitest — not counted in the numbers above.

## Progress log

*(each batch: file, cov before→after, commit)*

- 2026-07-14 — baseline documented. 704 tests, 76% production.
