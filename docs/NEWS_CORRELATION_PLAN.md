# News & Financial-News Correlation — High-Level Plan

Status: **Phase 1 SCAFFOLD SHIPPED 2026-07-11** (brain 40be41e), dormant until
keyed. `news_events` table (both DBs), `news_jobs.py` (normalize+fetch+collect),
`database.upsert_news_events` + `recent_news_for_symbol` (causal published_at <
decided_at filter), config `NEWS_ENABLED`/`MARKETAUX_API_KEY`. Parse unit-tested.
**Phase 2 WIRED 2026-07-11** (brain b8b9a64): run_cycle kicks a throttled,
daemon-thread news fetch; each decision attaches `news_context` from an in-memory
cache (no live call in the hot loop). Key is set in Railway.
**LAST STEP TO GO LIVE:** set `NEWS_ENABLED=true` on Railway (key alone stays
dormant). First session after that populates `news_events` + decision
`news_context` — verify the real Marketaux payload parses (normalize is defensive;
worst case 0 rows, no crash). **Still to build:** Insights news section +
sentiment-gate dark flag. Sibling to `TIMING_CORRELATION_PLAN.md`;
`minutes_since_headline` is a timing feature that feeds that plan.

## Motivation

We capture *what* the brain decided, *when*, and *whether it worked*. Missing: the
**news environment** around each decision. Hypothesis: world/financial news
(macro prints, results, filings, sentiment shifts) is a causal factor in why a
trade goes up or down, independent of the technical signal. Capture news + align
it to the decision timeline → expose factors like "shorted into strongly positive
fresh news = worse outcome", "trades within N minutes of a results announcement
behave differently".

## Architectural rule (non-negotiable)

**News never enters the hot trading loop.** Brain scans 46 stocks/cycle;
synchronous per-stock news API calls = slow cycles + instant rate-limit death.

Decouple:
1. A **separate periodic collector** (`news_jobs.py`) fills a news cache.
2. Brain reads the **cached** snapshot and folds a `news_context` block into the
   decision — zero live API calls in the loop.

Exact mirror of existing pattern: `data_jobs` builds level packs out-of-loop;
brain attaches cached `market_context`. Same shape.

## Sources (verified, India-relevant)

- **Marketaux** — PRIMARY. Financial news, ticker-tagged incl. Indian symbols,
  sentiment −1..+1, ~5000 sources; free tier ~100 req/day. Gives per-symbol
  sentiment — the thing that correlates with our per-symbol trades.
  https://www.marketaux.com/
- **Finnhub** — market-wide news + NSE data; but sentiment endpoint is **US-only**
  → weak for India stock sentiment. Use for macro/global cues.
  https://finnhub.io/docs/api/market-news
- **NSE/BSE corporate announcements** — free, authoritative for *events* (results,
  filings, corporate actions) — hard event data, not sentiment.
- **RSS** (Moneycontrol / ET Markets) — free macro/market-wide headlines.
- **EODHD** — news + sentiment API (paid), fallback if Marketaux coverage thin.
  https://eodhd.com/financial-apis/stock-market-financial-news-api

Recommendation: **Marketaux (per-symbol sentiment) + NSE announcements (events) +
RSS (macro)**. Start Marketaux-only, add the rest incrementally.

## Architecture

1. **`news_jobs.py` collector** — periodic (~10–15 min, decoupled from trading).
   Batches multiple symbols per Marketaux call (entity filter) to stay under
   100/day. Writes to `news_events`.
2. **`news_context` block per decision** — brain reads cached latest news for the
   symbol + market-wide sentiment, folds into `indicators` (same as
   `market_context`): `{symbol_sentiment, market_sentiment, headlines_recent,
   minutes_since_headline, top_headline}`. No live call.
3. **Correlate** — join decisions/trades → `news_context` → outcome.

## Storage schema

`news_events` table:
```
id            uuid pk
source        text        -- marketaux | nse | rss | finnhub
published_at  timestamptz -- normalized UTC
fetched_at    timestamptz
scope         text        -- MARKET | STOCK | MACRO
symbols       text[]      -- tagged tickers (empty for macro)
headline      text
url           text
sentiment_score  numeric  -- -1..1 (null if source has none)
sentiment_label  text     -- positive | neutral | negative
raw           jsonb       -- full API payload for reprocessing
```
Index on `(published_at)`, GIN on `symbols`. Dedup on `(source, url)`.

`news_context` folded into `brain_decisions.indicators` (no new column) — same as
the current analytics blocks.

## Correlation (ties directly to timing plan)

`minutes_since_headline` IS a timing feature → drops into
`TIMING_CORRELATION_PLAN.md` Pillar 2. Analysis surface (Insights + offline):
- Win-rate / expectancy bucketed by sentiment (did we short into good news?)
- Correlation of sentiment vs `r_multiple` (and vs MFE/MAE)
- **Event proximity** — trades near a results/announcement, or right after a
  macro print
- **News-sentiment gate** = dark-flag candidate ("don't short a stock with
  strongly positive fresh news"), validated the same counterfactual way as
  existing flags.

## Critical gotcha — causal ordering (no leakage)

For *causal* features, only news with `published_at < decided_at` counts (known at
decision time). News published *after* = leakage → exclude from causal features
(keep for outcome *explanation* only). We capture exact decision timing, so
alignment is clean. Enforce in the query, not just convention.

## Other constraints

- **Rate limits** (100/day free) → batch symbols, poll market-wide + in-play
  subset, not all 46/min. ~375 market minutes/day; every 10–15 min batched keeps
  well under. Upgrade tier if coverage needs per-symbol density.
- **Timezone** — normalize all `published_at` to UTC; render IST.
- **Backfill** — Marketaux has history; can retro-enrich existing trades (optional,
  post-hoc only, mark as non-causal).
- **LLM enrichment** (later) — Claude could score relevance / summarize beyond raw
  API sentiment. Start with API sentiment; add LLM only if it lifts signal.

## Phases

1. Marketaux key + `news_jobs.py` collector → `news_events` table.
2. `news_context` block on decisions (cached read, no loop cost).
3. Correlate — Insights "news context" section + counterfactual sentiment gate.
4. (Later) NSE events, LLM enrichment, historical backfill.

## Dependencies / sequencing

- Independent of Tier-2, but strongest paired with the timing plan (shared
  `minutes_since_headline`). See [[paper-trading-project]].
- Needs calendar time: correlations meaningless until many clean days across
  regimes.
- Build only after the news collector proves it doesn't perturb cycle latency
  (validate in QA — recall the archive_candles per-symbol upsert regression).
