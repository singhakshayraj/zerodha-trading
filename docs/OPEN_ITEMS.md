# OPEN ITEMS — every known problem, by owner

_As of **2026-11-09**. Mode: **advisor-only, engineering freeze** (intraday
trading decommissioned 2026-09-09)._

A **derived view**, not a source of truth: [PIPELINE.md](PIPELINE.md) owns work
items, [reference/VERIFY.md](reference/VERIFY.md) owns open checks,
[reference/KNOWN_ISSUES.md](reference/KNOWN_ISSUES.md) owns findings. If this
file disagrees with them, they win. Update it in place; the 08-27 trading-era
version is in [archive/OPEN_ITEMS_2026-08-27.md](archive/OPEN_ITEMS_2026-08-27.md).

**Severity:** 🔴 blocks the advisor or the n=400 read · 🟡 degrades quality or
will bite later · ⚪ hygiene.

---

## 1 — On you

| # | Problem | Sev | Impact | What to do | Ref |
|---|---|---|---|---|---|
| 1.1 | **Token must be live ~11-16/17** (pasted fresh 11-09 10:19 ✅) | 🔴 | n=400 crosses when three 11-02 MICRO calls mature; no token that day = no read | Paste daily on trading days, fresh login, **after ~07:30 IST** (pre-dawn pastes die at the ~06:00 flush) | [P-42], [D2], [D4] |
| 1.2 | **3 mutual funds unmapped** (`holding_scheme_map` 0/3 confirmed) | 🟡 | No whole-book value / risk numbers; I-8, I-9 stuck NOT-YET | Send scheme name, Direct/Regular, Growth/IDCW, units per fund. Candidates: DSP 153487, ICICI 149775, Motilal 150642 | I-8, I-9 |
| 1.3 | **Telegram bot token never rotated** (leaked in pre-scrub logs) | 🟡 | Security exposure on the alert bot | BotFather `/revoke` → set `ADVISOR_TELEGRAM_BOT_TOKEN` (zerodha-brain) + `TELEGRAM_BOT_TOKEN` (watchdog) on Railway yourself; don't paste it in chat | [P-04] |
| 1.4 | **Supabase on free tier** — 232 MB / 500 MB | 🟡 | Fine for now (~46%); also caps you at 2 active projects | Decide Pro vs stay free before ~400 MB | [P-38] |
| 1.5 | **No sleeve targets / bands** | ⚪ | Drift-band layer can't be built | Give target weight + band width per sleeve | STATUS gated list |
| 1.6 | **Decommission backup has no offsite copy** | ⚪ | `~/Desktop/zerodha-decommission-2026-09-09/` lives on one laptop | Copy to cloud/drive | STATUS gated list |
| 1.7 | **Natwar's account: inputs missing** | ⚪ | [P-45] can't start | His consent, Kite user ID, alert chat (same/separate), whether he holds MFs | [P-45] |

## 2 — On me, waiting for the n=400 read to finish

These change the grading path, so they wait until the pre-registered read (V-20)
is done — changing the grader mid-read would cast doubt on it.

| # | Problem | Sev | Impact | Fix | Ref |
|---|---|---|---|---|---|
| 2.1 | **Grader drops a sold non-Nifty-500 holding** — no instrument token → `not_due` forever, silently | 🟡 | 1 row today (MAHLIFE 11-02). Biased: the dropped rows are mostly *followed SELL calls* | Fall back to the public no-auth instrument master for unknown symbols | [D3], [P-46] |
| 2.1b | **Incident message calls not-due rows "due"** — misled the board into expecting n=400 on 11-09 | 🟡 | Wrong expectations, not wrong grades | Check maturity before fetching; reword | [D4] |
| 2.2 | **Grading depends on your Kite token at all** | 🟡 | Every lapsed token stalls grading (the cause of every stall since September) | Grade from NSE's public daily closes (bhavcopy) — no token needed | [P-46] note |
| 2.3 | **Single-account design** | ⚪ | Can't run Natwar alongside Kanaklata | Multi-tenant: `account_id` (additive, defaults to Kanaklata), per-account tokens, isolated loops, dashboard toggle. 3–5 days | [P-45] |

## 3 — Known limits (not bugs — read before acting on advice)

| # | Limit | Evidence | Ref |
|---|---|---|---|
| 3.1 | **No demonstrated edge.** 5-year out-of-sample replay of the exact verdict function: MICRO hit rate 0.5085 (t=+1.56), MACRO 0.4999 — null | 164 independent dates | V-18 |
| 3.2 | **Confidence score carries no information** about whether a call is right | AUC 0.46 on n=98 | W-B, [P-18] |
| 3.3 | **Any new finding must clear z ≥ 3.72**, not 1.96 — 253 hypotheses tested | Trial ledger | V-19 |
| 3.4 | **Token lifetime is undocumented** — the ~06:00 IST flush is inferred from our own paste history, not from Zerodha | 5 pastes lined up | [C6], [D2] |
| 3.5 | **Holdings snapshot is manual** — only one exists (09-09); capture is CLI-only (`scripts/capture_holdings.py`) by design | — | STATUS |

## 4 — Process / tooling

| # | Problem | Sev | Fix |
|---|---|---|---|
| 4.1 | **`/post-session-check` skill is trading-era** — still audits trades/decisions/candles and expects `advisor_watch` to start (removed by the decommission, `505571d`) | ⚪ | Rewrite for advisor-only mode |
| 4.2 | **VERIFY OPEN still lists dead trading checks** (V-14, V-8, V-10, V-12, I-2–I-4…) — clutter that buries the live ones | ⚪ | Move to a "Moot — decommissioned" section |
| 4.3 | **Local checkout lags origin** — the scheduled review commits remotely; reading STATUS without `git pull` gives a stale picture (happened 11-09) | ⚪ | Always `git pull` first |
| 4.4 | **Dashboard API unreachable from the review environment** (proxy 403) | ⚪ | None needed — Supabase is the real data source |

---

## Recently closed (for context)

- **I-6 pin drift** — HEG/HFCL/ICICIPRULI renamed in the live master; repointed, 499/499 (brain `2261e59`, 11-09). [D1]
- **Railway Kite secrets** — `KITE_TOTP_SECRET`/`KITE_PASSWORD` verified absent from both services (11-09).
- **V-16 / V-17 / V-7 PASSED** (11-09) — advisor survived the decommission; alpha label reproduces 0.5510; real trades auto-link.
- **[P-44] Supabase access** — closed 11-03.
