# Prompt for an external architectural review (Fable)

Paste everything below the line into Fable, then attach or paste
`docs/reference/SYSTEM_BIBLE.md` immediately after it.

---

You are reviewing a real, running algorithmic trading system built by one
person over four months. I am attaching its complete technical documentation.
I want your strongest, most honest analysis — not encouragement.

## The situation, stated without spin

The system works as software and fails as a strategy. Over **914 paper trades**
it has a profit factor of **0.365** and an expectancy of **−0.425R**. It has
lost **₹50,849** of simulated capital on ₹100,000 deployed. The engineering is
sound — it self-monitors, recovers, labels its own counterfactuals, and its
failures are visible. The strategy has no demonstrated edge.

I am at a decision point and I want your help thinking about it clearly.

## What has already been tried and has failed — do not propose these

Every item below was tested with real data and measured. Proposing them again
wastes your output and tells me you skimmed. Engage with *why* they failed if
you think a variant survives.

1. **Entry edge.** A filter looked real at **+0.097R, t = +3.0**, beating the
   baseline 9 days out of 9. One additional day collapsed it to −0.003R.
   Current pooled: **+0.009R, t = +0.3, n = 2,051.** Converged to zero.
2. **Exit rules.** All 180 take-profit × stop-width pairings replayed over real
   price paths **with costs set to zero**. None profitable. Results varied far
   more with stop width than target width.
3. **Advisor confidence.** AUC **0.4917** (0.5133 market-neutral). Carries no
   information.
4. **Reweighting the advisor's 7 factors.** 8 pre-registered variants, 43,952
   observations, 101 dates. Holm p = 1.000 for all; entire leaderboard spans an
   IC range of 0.004.
5. **Standard cross-sectional factors.** 12 from published literature
   (momentum 12-1/6-1, short-term reversal, 52-week-high proximity, low vol,
   low beta, low idio vol, low max return, low skew, Amihud illiquidity,
   time-series trend, volume growth), z-scored, winsorised, optionally
   sector-neutral, over 5.2 years, four cuts. **Nothing survives Holm out of
   sample.**
6. **Compression as a storage lever.** pglz and lz4 each compressed **0 of 500**
   real rows, measured in-database against an uncompressed control.

Two meta-findings that should shape your reasoning:

- **Selecting on in-sample performance is measurably harmful here.** Factors
  chosen on the explore window and scored on holdout are negative in *every*
  cut. `amihud`: explore t = +4.18, holdout −0.0109.
- **The low-risk factor family flips sign explore → holdout in all four cuts,
  together** — a regime signature, observed once, not established.

## What I actually want from you

Work through these in order. Be concrete. Prefer one well-argued idea over ten
plausible ones.

**1. Falsify my conclusions.** I believe "no edge exists in this approach."
Where is that conclusion weakest? Which measurement could be wrong in a way
that would hide a real edge? Specifically examine:
   - the counterfactual labeller never evaluates the 0–5 minutes between a
     decision and the next bar open;
   - the advisor's correctness label uses *absolute* return, so a rising tape
     scores every HOLD correct — the market-neutral column exists, unused;
   - realised reward:risk is 1.17 against a planned 2.08, and ~27.6% of total
     loss sits in the gap between plan and fill.

**2. Identify the highest-leverage structural change.** Not a parameter. The
measured decomposition: costs are ~60% of the per-trade loss (−0.24R of −0.40R);
token acquisition caps uptime at 45%; the largest single loss bucket is
STOP_LOSS_HIT at −196.8R across 148 trades averaging −1.330R against a −1.00R
design. Where would you intervene, and why there rather than elsewhere?

**3. Tell me whether to stop.** Seriously. Given the evidence, is continuing
this strategy rational, or is the correct move to abandon intraday equity
signals and redeploy the *infrastructure* — which is genuinely good — onto a
different problem? If so, which problem, and what would carry over?

**4. Attack the architecture.** Where is this system fragile, over-built, or
structurally wrong in ways that will bite later? I am especially interested in
anything that would break under real money that is invisible in paper.

**5. What is missing that I have not thought to measure?** Assume I am blind to
something obvious to an outsider.

## How to answer

For every substantive proposal, give me:

- **The claim** — one sentence, falsifiable.
- **The mechanism** — why it would work, in terms of this system's measured
  behaviour, not general trading wisdom.
- **The test** — the specific query, backtest or experiment that would confirm
  or kill it, and the number that decides. If you cannot name the number, say
  the idea is not yet testable.
- **The expected effect size**, and whether my sample sizes (914 trades, 29
  session days, 98 graded advisor calls, 2,051 labelled decisions) can detect
  it. If they cannot, say so — that is a finding, not a failure.
- **What it would cost** in engineering time and in new failure modes.

Rank everything by expected value, and state your confidence.

## Rules of engagement

- **Do not be encouraging.** I have had four months of my own optimism; it cost
  ₹50,849 of paper capital and produced six closed avenues. Blunt is useful.
- **Do not propose more analysis of existing data** unless you can name the
  specific number it would produce and why that number changes a decision. The
  system's own design review concluded: *"Do not build more analysis. It is the
  part that is already working."*
- **Do not suggest machine learning generically.** If you propose it, specify
  the label, the features, the sample size, the validation scheme, and how you
  would avoid the exact in-sample-selection failure documented above.
- **Respect the constraints:** retail `enc_token` auth only (no paid API, no
  live `/quote`, no options chain, no tick data — 5-minute bars are the finest
  granularity available); one operator; Indian equities; ~₹100,000 of real
  capital available.
- **If you think a section of my documentation is wrong or self-serving, say
  so.** I would rather be corrected than agreed with.

Begin with your single most important observation, before any structured
analysis. If it contradicts something I believe, lead with that.
