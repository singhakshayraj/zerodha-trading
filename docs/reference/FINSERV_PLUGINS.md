# Financial-services plugins — what transfers, what doesn't

_Assessed 2026-08-08 against the installed `claude-for-financial-services`
marketplace (equity-research, financial-analysis, wealth-management,
investment-banking, private-equity, lseg, sp-global, fund-admin, operations,
plus the agent bundles: earnings-reviewer, market-researcher, model-builder,
pitch-agent, meeting-prep-agent, kyc-screener, gl-reconciler, month-end-closer,
statement-auditor, valuation-reviewer)._

Written so this doesn't get re-litigated every time the plugin list scrolls
past. Verdicts are from **reading the SKILL.md files**, not their descriptions.

## The two facts that shape everything below

**1. None of the data backends are connected.** `mcp__capiq__*`,
`mcp__factset__*`, `mcp__daloopa__*`, `mcp__portfolio__*`, `mcp__screening__*`,
`mcp__nav__*`, `mcp__crm__*`, `mcp__internal-gl__*`, `mcp__subledger__*`, LSEG
and S&P Global all resolve to nothing. S&P Global needs authorizing via
claude.ai connector settings; LSEG never finished connecting. Every skill that
"pulls comps" or "retrieves financials" has nothing to read.

**2. The skills are prose checklists, not machinery.** They are 60–120-line
workflow templates assuming a human analyst, an external data terminal, and a
US/global institutional context (SEC filings, USD, wash-sale rules, LP capital
accounts). None of them contain code.

So the useful question is not "what can we call?" — it is **"which ideas
transfer to an intraday NSE paper trader and a holdings advisor?"** Four do.

## ✅ What transfers

### A. Falsifiable invalidation, checked daily → [P-32]

`thesis-tracker` states the principle this project should already hold itself
to: **"A thesis should be falsifiable — if nothing could disprove it, it's not
a thesis."**

The advisor is closer to this than it looks. `advise()` already emits
`verdict`, `confidence`, `reasons` (the pillars), `exit_target`, and
**`stop_level` — which is exactly thesis-tracker's "what would make you
exit"**. What it does *not* do is ever **check** that level again. The call is
graded only when its 10- or 30-trading-day horizon matures.

That is the direct cause of a tracked problem. [P-18] is stuck because ~85% of
`portfolio_advice` is `trigger_type=MACRO` on a 30-trading-day horizon, so only
~3 MICRO rows grade per session and ECE sits at n=31 until late August.

**A broken `stop_level` is a verdict falsified on day 3, not day 30** — and it
is unambiguous, needs no new data, and is already stored. See [P-32].

### B. The bear case is not optional → [P-33]

`thesis-tracker`: *"Track disconfirming evidence as rigorously as confirming
evidence."* `deal-screening` operationalises it — every verdict ships a **bull
case and a bear case**, not just a rationale.

The advisor's `reasons` list is overwhelmingly confirmatory: it explains why the
verdict is right. Nothing records what would make it wrong, so nothing can be
scored against it later. See [P-33].

### C. No-trade bands against churn → [P-34]

`portfolio-rebalance` flags positions only outside a **±3–5% band**, and its
first tax-aware rule is *"consider directing new contributions to underweight
classes instead of trading."* Both are the same idea: **do not trade a small
drift, because the cost of trading exceeds the benefit of correcting it.**

This project has measured that cost precisely. [P-29]/[P-30] put cost drag at
**−0.239R of a −0.401R realized loss**, and no exit policy clears breakeven even
at zero cost. A no-trade band is the standard institutional answer to exactly
that arithmetic. Applies to the **rotation advisor**, not the intraday engine.
See [P-34].

### D. Results-day feed → fills existing dead code

`catalyst-calendar` is mostly US macro (FOMC, CPI) and needs a terminal. But
`event_calendar.py` says in its own docstring: *"Results-day symbols come from
an external earnings feed the caller supplies (**empty until that feed
exists**)."* The expiry rules work; the `STAND_ASIDE`-through-earnings path is
**dead code today**.

NSE earnings dates are **freely available** and need none of these plugins.
Worth noting the skill's one durable idea: *"Archive past catalysts with the
actual outcome — builds pattern recognition over time."* Already tracked as
part of [P-02]'s neighbourhood; not a new item until someone picks a source.

## ❌ What does not transfer

Listed so nobody re-checks them.

| Skill / agent | Why not |
|---|---|
| `dcf-model`, `lbo-model`, `merger-model`, `3-statement-model`, `comps-analysis` | Need fundamentals + a data terminal. `stock_agent.py:74` has had `'fundamentals': None` since P3 was written; that is [P-02]'s blocker, and these don't unblock it. |
| `initiating-coverage`, `sector-overview`, `earnings-analysis`, `earnings-preview`, `model-update` | Assume a coverage universe with estimates and consensus. This book holds ~20 names it never wrote a note on. |
| `cim`, `teaser`, `pitch-deck`, `buyer-list`, `process-letter`, `one-pager`, `ic-memo` | Sell-side deal marketing. No relationship to the project. |
| `gl-recon`, `nav-tieout`, `roll-forward`, `accrual-schedule`, `variance-commentary`, `break-trace` | Fund administration. Different business. |
| `kyc-doc-parse`, `kyc-rules` | Client onboarding compliance. Not applicable. |
| `tax-loss-harvesting` | ⚠️ **Concept genuinely relevant** to a real holdings book carrying RVNL at −46.3% — but every mechanic in it is US: wash-sale 30-day rule (**India has no wash-sale rule**), $3,000 ordinary-income offset, ST/LT rates. India runs STCG/LTCG with a ₹1.25L LTCG exemption. **Do not apply as written**; it would produce confident, wrong advice. |
| `client-report`, `investment-proposal`, `client-review`, `meeting-prep` | Client-facing wealth deliverables. There is no client. |
| `idea-generation` | Its screens (P/E, EV/EBITDA, FCF yield, ROE, net retention) are all fundamental. Uncomputable until [P-02] lands. The rotation advisor already screens on the price/volume factors that *are* computable. |
| `morning-note` | Format is fine, but the project's brief is the Telegram digest, already built and blocked only on [P-04]'s bot token. Nothing to gain. |

## The standing caution

These skills are built to **generate narrative deliverables** — polished
research prose that reads as authoritative. Pointed at NSE names with no
fundamentals feed, they will produce confident output over data that does not
exist.

This project's discipline is the opposite: a fix with no runnable VERIFY check
is unmeasured, not done. [P-30] is the case in point — a documented conclusion
("3 of 180 policies go positive at zero cost") turned out to be an artifact, and
only an exact re-measurement caught it.

**Adopt the ideas above; do not adopt the report formats.** The four items that
transfer all share one property: each is checkable against data already stored,
and each earns a VERIFY row.
