# Next-Session TODO — Mon 2026-07-27

Clean checklist for the next market session. Full context: `docs/HANDOFF_2026-07-26.md`.
Brain live on **`8edb746`** (GIT_SHA `8edb746d9edb`); dashboard on Vercel.

---

## ① MUST-DO FIRST — you (token-gated)

- [ ] **Paste enc_token before 09:15 IST.** Lights up every feature below.
      (Before 09:14 also triggers the new PRE_OPEN timeline capture.)

## ② VERIFY — after the ~09:20 advisor run

- [ ] `trading_sessions.git_sha` = `8edb746d9edb` (**not `unknown`**) — first real
      check of the git_sha fix.
- [ ] `app_config.portfolio_risk_latest.correlation` populated (effective_bets + clusters).
- [ ] `app_config.advisor_calibration_latest` populated (real on-chart data, non-null bins).
- [ ] `stock_observations` filling — including one **PRE_OPEN** and one **POST_CLOSE**
      row for the day (per-stock agent P2).
- [ ] `/advisor` renders: calibration card, "What changed" diff, per-card calibrated
      confidence, `timeline_summary` on rows.
- [ ] Command center renders: Edge strip (PF / max-DD / expectancy) + advisor
      action-count / "N changed".

  Quick SQL checks (prod `gilmuwmtdpjccibfhqtx`):
  - `select git_sha from trading_sessions order by started_at desc limit 1;`
  - `select key from app_config where key in ('portfolio_risk_latest','advisor_calibration_latest');`
  - `select phase, count(*) from stock_observations where observed_at::date = current_date group by phase;`

## ③ SECURITY — you (do soon; a secret was exposed)

- [ ] **Rotate the Telegram bot token** via @BotFather (`/revoke` → new token),
      update the `ADVISOR_TELEGRAM_BOT_TOKEN` (and any other) Railway var. The old
      token was printed in Railway logs (now scrubbed in code, `71b8848`).
- [ ] Consider rotating the **Supabase anon key** — it was effectively a full
      read/write key until today's RLS fix (8 tables incl `app_config`/enc_token
      were public). Fixed now, but the key sat exposed in the client bundle.

## ④ DECISIONS — you (each unblocks a build)

- [ ] **Fundamentals data source** (agent P3): free scrape (screener.in / NSE) vs paid
      API. → unblocks per-stock fundamentals (currently a null slot).
- [ ] **Marketaux news key**: activate → `news.sentiment` starts populating the timeline
      (null today).
- [ ] **Gate #6 / Kite ₹500/mo**: the real edge verdict. THE priority; everything else
      is enrichment. Harness `backtest.py` built, blocked only on the data pull.

## ④ BUILDABLE — me, no blockers (just ask)

- [ ] **Agent P4** — per-stock timeline UI on `/advisor` (trend_score sparkline, verdict
      path, news flow). Best right after ② so it renders real data.
- [ ] **Agent P3** — build once the fundamentals source (③) is chosen.
- [ ] Kite historical puller — build once ③ Gate #6 is a go (runs gate #6 immediately).

---

## Context: what shipped 2026-07-26/27 (all live)
- Advisor **portfolio_risk v2** — return-correlation clusters + effective_bets (`b919a84`)
- Telegram **correlation digest line** (`f90dfa0`)
- Advisor **Pillar 1 calibration infra** — reliability curve, DARK (`296f8c7`)
- **UI x4** — advisor calib/filter, day-over-day diff, command-center Edge strip, skeletons
- Per-stock **agent P1** (observation timeline) (`7c6e710`) + **P2** (always-on pre/post capture) (`8edb746`)

Standing conclusion unchanged: **no proven edge yet** (paper PF ~0.33) → Gate #6 is the
real verdict. Everything above is advisor enrichment while that stays gated on the Kite call.
