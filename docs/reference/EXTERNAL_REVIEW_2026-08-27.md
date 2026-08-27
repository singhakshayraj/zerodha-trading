# External architectural review — 2026-08-27

Two rounds of adversarial review of the whole system by an external model,
run against [SYSTEM_BIBLE.md](SYSTEM_BIBLE.md). This records what it said, what
was verified, what was actioned, and what is still open.

**Status: paused mid-engagement.** Round 3 is drafted but not sent. Nothing
from the decommission plan has been executed beyond Phase A measurement and one
safety fix.

---

## 1. The headline observation — verified, and it inverts the project

> The go/no-go gates were designed to answer "is this worth trading with real
> money?" — but the "go" branch was bricked before the experiment finished.

**Verified independently against SEBI and NSE sources, not taken on trust:**

- SEBI circular **SEBI/HO/MIRSD/MIRSD-PoD/P/CIR/2025/0000013**, dated
  **2025-02-04**, plus its September 2025 timeline extension.
- From **2026-04-01**, every algorithmically placed order must carry an
  exchange-assigned **Algo-ID**.
- API access may only be provided **by the broker**, through a
  **vendor-client-specific API key** on a **broker-whitelisted static IP**.
- Unregistered algos, **explicitly including API-based strategies**, are in
  scope.

This system authenticates with a **scraped retail `enc_token`** against
`kite.zerodha.com/oms`. That is outside the framework entirely — not a lenient
corner of it — and it violates Zerodha's terms for automated access
independently of the regulation.

**Implication:** there is no compliant path from this codebase to live
automated trading without rebuilding auth on Kite Connect under the new
framework — the ₹500/month product deliberately declined at the outset. Even a
*positive* edge result would have led to a rebuild, not a deployment.

---

## 2. Its proposed tests — all three run

### 2.1 The open-window cell — CLOSED

The review's single identified weakness: the ORB thesis lives at 09:30–10:30
IST, token-paste failures cluster at exactly that hour, so the cell might be
under-sampled and hiding an edge. Its own decision rule was *n ≳ 150 and mean
R ≤ −0.2 → closed*.

| segment | n | mean R | t |
|---|---|---|---|
| all trades | 832 | −0.425 | −12.86 |
| entry 09:30–10:30 IST | **159** | **−0.410** | −4.70 |
| …and session started on time | 86 | −0.411 | −4.31 |

**Closed.** The open window is neither under-sampled nor better — it is
statistically indistinguishable from the whole book. The proposed 4–8 week
TOTP-enabled experiment has no rationale, and "no edge exists in this
approach" needs no narrowing.

The review's own post-mortem on this is worth keeping: it spent a fifth of
round one on a mechanism that had **zero realised effect**, and identified that
as the exact error class this system exists to catch — a mechanistically
attractive confound promoted ahead of a 30-minute query.

### 2.2 The benchmark — measured for the first time

Nothing in 10 pages and 29 API routes had ever compared the system to doing
nothing.

| 2026-05-19 → 2026-08-26 | |
|---|---|
| Nifty 50 buy-and-hold | **+3.03%** |
| This system (paper) | **−50.85%** |
| **Alpha vs doing nothing** | **−53.88 pp (−₹53,883)** |
| Rupees per operator-hour | **−₹565/h** (~90 sessions, before build time) |

### 2.3 The charge-model validation — CANNOT be run as specified

`tradebook` holds **fills only** — no charge columns — because Zerodha's
tradebook export omits the contract-note breakdown. Its 215 rows are also
`segment = EQ`, dated 2026-02-11 → 2026-05-25: largely delivery trades
predating the paper period, so not a like-for-like comparison even with
charges attached.

What *was* verifiable: the modelled schedule matches Zerodha's published
intraday card (brokerage min(₹20, 0.03%), STT 0.025% sell-side, exchange
0.00297%, SEBI 0.0001%, GST 18%, stamp 0.003% buy-side). An empirical
validation needs actual contract notes.

---

## 3. What the Phase A measurement found instead

Running Phase A produced a correction neither party had: **see
[SYSTEM_BIBLE §11c](SYSTEM_BIBLE.md#11c).**

`RISK_PER_TRADE_PCT` is configured at **1.0%**; the measured mean risk per
trade across 907 trades is **₹140 = 0.140% of capital**. The position-size cap
dominates the risk rule, so realised risk lands ~7× below design — which makes
fixed rupee costs **7× heavier in R terms**.

| | |
|---|---|
| round-trip cost | **₹55.6 = 0.398R** |
| previously documented | −0.240R |
| **cost share of the −0.425R loss** | **~94%**, not ~60% |
| same rupee cost at a true 1% risk unit | 0.056R |

This creates no edge — the residual after costs stays statistically zero — but
it reclassifies the loss as **close to the cost of trading** rather than a
signal that lost money, and it **corrects the review's own §2 decomposition**,
which took −0.240R at face value to derive a −0.067R residual.

---

## 4. Its recommendation: stop, on four independent grounds

1. The pre-registered gates fired, and not marginally (−0.425R at n=914).
2. The best case is still a loss — zero costs plus perfect fills ≈ a coin flip,
   before live frictions paper does not model.
3. The deployment branch does not exist (§1).
4. Even success is uneconomic: a certified +0.15R at 1% risk with five quality
   trades a day is ~₹15k/month pre-tax, against a long-term book roughly 45×
   the trading capital.

**Redeployment, ranked:** the advisor on the real book with the alpha label
(R1); the behavioural-accountability instrument (R2); the build written up as
demonstrated-judgment career capital (R3, downgraded by the review itself in
round two for having no mechanism or falsifiable test).

---

## 5. Round two — the decommission design

Recorded in full for later execution. **Nothing below Phase A has been done.**

- **Phase A — final measurement.** Grading/labelling catch-up, I-1…I-7 sweep,
  the charge-model check, and a single-timestamp freeze of every headline table.
- **Phase B — snapshot.** Full `pg_dump` + offsite copy with a row-count
  manifest (Supabase pauses inactive free-tier projects), repo tags, sanitised
  env-var names, and an export of `/learn` as the only prose written while the
  author still believed.
- **Phase C — disable in dependency order.** `AUTOPILOT=false`; delete the
  trading-cycle call rather than gate it behind another env var; kill
  intraday-only jobs; **retune the watchdog** before its 30s-calibrated
  thresholds train the operator to ignore alarms; invert the token relationship
  from daily push to on-demand pull; tear down credentials.
- **Phase D — post-mortem.** One page at the top; the six closed avenues with
  n and deciding numbers; the three meta-findings as lessons; a conditionality
  appendix; and **pre-committed reopening criteria**.
- **Phase E — what deliberately not to keep.** The habit surface: the daily
  token ritual, intraday alerts, anything requiring daily attendance. Design
  test: *if ignored for three weeks, nothing degrades and nothing pages you.*
  **Do not delete data.**
- **Phase F — stopping criteria so "passive" has an exit.** Advisor grading
  reads once at n = 400; the paper books read once at 2027-03-31; an
  engineering freeze on the market layer, auditable by `git log`.

**Its proposed six-month claim:** by 2027-02-26, at least 3 pre-registered
graded decision experiments completed on **non-market** problems, and **0** new
market-facing experiments beyond the two Phase F reads. Auditable from
artifacts already kept, and it catches both failure modes — never leaving the
market (rationalisation) and quietly returning (relapse).

---

## 6. Actioned so far

| | |
|---|---|
| **Live order path hard-disabled** | `order_manager._refuse_live_orders` raises at all three placement entry points unless **both** `LIVE_ORDERS_ARMED` and `LIVE_ORDERS_ACK_DATE` are set. Two tests pin refusal-by-default and that one flag is insufficient. Paper is unaffected — it routes through `PaperBroker`. (brain `c604c0d`) |
| **Phase A measurement, partial** | The risk-unit / cost finding above. Invariant sweep and the frozen snapshot still outstanding. |
| **Documentation** | Review findings recorded in SYSTEM_BIBLE §11b and §11c. |

## 7. Open, and deliberately not done

- **Everything from Phase B onward.** Decommissioning is a decision, not a
  measurement; it has not been made.
- **⚠️ Credential exposure, independent of any decommission decision.**
  `KITE_TOTP_SECRET` and `KITE_PASSWORD` sit in Railway env. A stored TOTP
  secret plus password is full account takeover on a real brokerage account,
  and both exist only to enable the TOTP path already declined. Worth removing
  regardless. **[P-04]** (rotate the Telegram bot token) is also still open.
- **Round 3.** Drafted, not sent — it would report the §11c cost correction
  back, since it invalidates the review's own decomposition arithmetic.
