"use client";

import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import {
  GraduationCap, Boxes, Bot, Compass, Ruler, FlaskConical,
  Server, ShieldCheck, BookMarked, ArrowDown,
} from "lucide-react";

// ── Learn ────────────────────────────────────────────────────────────────────
// Teaches the system to someone who knows basic finance but did not build this.
//
// Two rules this page is written to:
//   1. Teach from THIS system, not from generic theory. Every number is either
//      live from /api/learn/stats or a dated finding with its source named.
//   2. Never oversell. The honest headline is that the strategy has no proven
//      edge — a learner who comes away thinking otherwise has been taught
//      wrong, however good the prose was.
//
// Numbers are live on purpose: hard-coding them would mean the teaching
// material quietly starts lying the first time a session runs.

const BLUE = "#3b82f6", GREEN = "#22c55e", RED = "#ef4444", AMBER = "#f59e0b", MUTE = "#71717a";

type Stats = {
  closedTrades: number; wins: number; losses: number; winRatePct: number | null;
  avgR: number | null; totalPnl: number | null; tradingDays: number;
  firstTrade: string | null; lastTrade: string | null; sessions: number;
  decisions: number; adviceRows: number; candleRows: number;
  symbolsTraded: number; profitFactor: number | null;
};

const SECTIONS = [
  { id: "what",      label: "What this is",      icon: Boxes },
  { id: "words",     label: "The words first",   icon: BookMarked },
  { id: "trader",    label: "The trader",        icon: Bot },
  { id: "advisor",   label: "The advisor",       icon: Compass },
  { id: "measure",   label: "How we measure",    icon: Ruler },
  { id: "found",     label: "What we found",     icon: FlaskConical },
  { id: "machinery", label: "The machinery",     icon: Server },
  { id: "rules",     label: "The house rules",   icon: ShieldCheck },
  { id: "glossary",  label: "Glossary",          icon: GraduationCap },
];

/** Every term a reader might not know, defined once. Inline <T> links here. */
const GLOSSARY: { slug: string; term: string; short: string; body: string }[] = [
  { slug: "paper", term: "Paper trading", short: "Fake money, real prices.",
    body: "Orders are simulated against live market prices, but no real money moves and no order reaches an exchange. The point is to find out whether the strategy would make money before risking any. Every rupee figure on this site is imaginary." },
  { slug: "long", term: "Long / Short", short: "Betting up / betting down.",
    body: "Long = buy first, hoping to sell higher. Short = sell first (borrowed stock), hoping to buy back lower. This system does both intraday. A short's stop sits ABOVE the entry, which is why the arithmetic is mirrored everywhere in the code." },
  { slug: "stop", term: "Stop-loss / Target", short: "The two pre-set exits.",
    body: "Before entering, the system fixes a stop (the price where it admits the trade is wrong and exits) and often a target (where it takes profit). Deciding both in advance is what makes the outcome measurable rather than a judgement call made in the heat of a move." },
  { slug: "r", term: "R / R-multiple", short: "Profit measured in units of the risk taken.",
    body: "R is the distance from entry to stop — the amount deliberately put at risk. If you enter at ₹100 with a stop at ₹95, one R is ₹5. Making ₹10 is +2R; getting stopped out is −1R. Using R instead of rupees lets a ₹5,000 trade and a ₹50,000 trade be compared honestly, which matters here because position sizes vary." },
  { slug: "expectancy", term: "Expectancy", short: "Average R per trade.",
    body: "Add up every trade's R and divide by the number of trades. Positive means the strategy makes money over many trades; negative means it bleeds. This is the single most important number on the site." },
  { slug: "pf", term: "Profit factor (PF)", short: "Gross winnings ÷ gross losses.",
    body: "PF 2.0 means winners brought in twice what losers cost. PF 1.0 is break-even. Below 1.0 loses money. The go/no-go gates for this project are PF > 1.3 to proceed and PF < 1.1 to reject." },
  { slug: "winrate", term: "Win rate", short: "How often trades are profitable — and why it misleads.",
    body: "The share of trades that made money. It is deliberately NOT the headline here: a strategy can win 80% of the time and still lose money if the 20% of losses are large. Expectancy already accounts for size; win rate does not." },
  { slug: "mfe", term: "MFE / MAE", short: "The best and worst a trade ever looked.",
    body: "Maximum Favourable Excursion is the most a trade was ever winning by; Maximum Adverse Excursion is the most it was ever losing by, both measured in R. Recording them means we can replay 'what if the stop had been tighter?' against paths the strategy really walked, without buying historical data." },
  { slug: "slippage", term: "Costs / slippage", short: "The money that disappears on the way in and out.",
    body: "Brokerage, STT, exchange fees, stamp duty, plus the gap between the price you wanted and the price you got. Assumed here at 0.12% per round trip. On this book they are not a rounding error — they are most of the loss." },
  { slug: "drawdown", term: "Drawdown", short: "The worst peak-to-trough fall.",
    body: "How far the account fell from its highest point to its lowest afterwards. It measures the pain an approach inflicts along the way, which is separate from whether it ends up profitable." },
  { slug: "calibration", term: "Calibration / ECE", short: "Does 70% confidence mean right 70% of the time?",
    body: "Expected Calibration Error measures the gap between stated confidence and actual hit rate. A well-calibrated advisor that says 70% is right about 70% of the time. High ECE means the confidence number is decorative — which is why the advisor's confidence is currently not fed into any decision." },
  { slug: "darkflag", term: "Dark flag", short: "A rule that runs but is not allowed to act.",
    body: "A new idea is switched on in 'counterfactual' mode: every time it WOULD have acted, that gets logged, but nothing changes. After enough sessions the logs say whether it would have helped. Only then is it enabled. This is how the project avoids shipping ideas that merely sound clever." },
  { slug: "counterfactual", term: "Counterfactual", short: "A recorded 'what would have happened if'.",
    body: "The trace a dark flag leaves. Because the entries, exits and excursions are all stored, whole strategies can be re-run over history to ask what a different rule would have produced." },
  { slug: "gate6", term: "Gate #6 / backtest", short: "The real verdict, still blocked.",
    body: "A historical backtest over years of data across different market regimes. Paper trading only tests the market conditions that happened to occur; gate #6 would test the ones that did not. It is built but blocked on buying Kite historical data, which is a pending decision." },
  { slug: "verify", term: "VERIFY ledger", short: "Every fix owes a runnable check.",
    body: "When something is fixed, a row is added to a ledger containing SQL and the number that counts as a pass. The post-session audit runs them. The rule: a fix with no VERIFY row is not shipped, it is unmeasured." },
  { slug: "enctoken", term: "enctoken", short: "The daily login key.",
    body: "The session token that lets the system read prices from Zerodha. It expires every morning and must be pasted in before the market opens. Forgetting costs a session — on 2026-08-07 it cost about 55% of the day's data." },
];

function T({ g, children }: { g: string; children: React.ReactNode }) {
  return (
    <a href={`#g-${g}`}
       className="text-[#f5f5f5] underline decoration-dotted decoration-[#555] underline-offset-2 hover:decoration-[#3b82f6]">
      {children}
    </a>
  );
}

function Callout({ kind = "plain", title, children }: {
  kind?: "plain" | "warn" | "key"; title?: string; children: React.ReactNode;
}) {
  const c = kind === "warn" ? { b: "#3a2a17", bg: "#17120b", t: AMBER }
          : kind === "key" ? { b: "#16324f", bg: "#0c1520", t: BLUE }
          : { b: "#1f1f1f", bg: "#0f0f0f", t: MUTE };
  return (
    <div className="rounded-lg border px-3.5 py-3 my-3" style={{ borderColor: c.b, background: c.bg }}>
      {title && <p className="text-[10px] uppercase tracking-wide mb-1.5" style={{ color: c.t }}>{title}</p>}
      <div className="text-[13px] text-[#c5c5c5] leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative pl-10 pb-5 last:pb-0">
      <span className="absolute left-0 top-0 w-7 h-7 rounded-full bg-[#111] border border-[#2a2a2a] flex items-center justify-center text-[11px] font-semibold text-[#8ab4f8]">{n}</span>
      <span className="absolute left-[13px] top-8 bottom-0 w-px bg-[#1f1f1f] last:hidden" aria-hidden />
      <h4 className="text-[13px] font-semibold text-[#f5f5f5] mb-1">{title}</h4>
      <div className="text-[13px] text-[#b5b5b5] leading-relaxed space-y-2">{children}</div>
    </li>
  );
}

function Section({ id, icon: Icon, title, lede, children }: {
  id: string; icon: React.ElementType; title: string; lede?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-4">
      <div className="flex items-center gap-2.5 mb-1.5">
        <Icon className="w-4 h-4" style={{ color: BLUE }} />
        <h2 className="text-lg font-semibold tracking-tight text-[#f5f5f5]">{title}</h2>
      </div>
      {lede && <p className="text-[13px] text-[#8f8f8f] mb-4 leading-relaxed">{lede}</p>}
      <div className="text-[13.5px] text-[#c5c5c5] leading-[1.75] space-y-3">{children}</div>
    </section>
  );
}

const R2 = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(3) + "R";
/** Scale indicators come from pg_class.reltuples — O(1) instead of a count(*)
 *  that would take ~18s once a year of decisions has accumulated. The estimate
 *  refreshes on ANALYZE, so it can trail by a few percent mid-week. Rendering
 *  it rounded with a "~" is the honest presentation: it conveys scale, which is
 *  all it is for, without implying a precision it does not have. */
const APPROX = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";
  if (n >= 1000) return "~" + (Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, "") + "k";
  return "~" + Math.round(n / 10) * 10;
};
const INR = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : (n < 0 ? "−" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export default function LearnPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [active, setActive] = useState("what");

  useEffect(() => {
    fetch("/api/learn/stats").then((r) => r.json())
      .then((d) => { if (d.stats) setS(d.stats); }).catch(() => {});
  }, []);

  // Highlight the section currently in view. main is the scroll container.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { root: document.querySelector("main"), rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );
    SECTIONS.forEach((x) => { const el = document.getElementById(x.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);

  const facts = useMemo(() => ([
    { k: "Closed trades", v: s ? s.closedTrades.toLocaleString("en-IN") : "…", sub: s?.tradingDays ? `over ${s.tradingDays} trading days` : "" },
    { k: "Expectancy", v: s ? R2(s.avgR) : "…", sub: "average per trade", tone: (s?.avgR ?? 0) > 0 ? GREEN : RED },
    { k: "Profit factor", v: s?.profitFactor != null ? s.profitFactor.toFixed(3) : "…", sub: "1.0 = break-even", tone: (s?.profitFactor ?? 0) >= 1 ? GREEN : RED },
    { k: "Paper P&L", v: s ? INR(s.totalPnl) : "…", sub: "simulated, not real", tone: (s?.totalPnl ?? 0) > 0 ? GREEN : RED },
  ]), [s]);

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] text-[#f5f5f5] overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-8">

          {/* ── Header ───────────────────────────────────────────────── */}
          <header className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-5 h-5" style={{ color: BLUE }} />
              <h1 className="text-xl md:text-2xl font-semibold tracking-tight">How this system works</h1>
            </div>
            <p className="text-[14px] text-[#a1a1aa] leading-relaxed max-w-3xl">
              A guided tour of what was built, why, and what it has actually shown — written for someone who knows
              basic finance but did not write the code. Read it top to bottom the first time; after that, jump around.
              Underlined terms link to the <a href="#glossary" className="text-[#f5f5f5] underline decoration-dotted decoration-[#555] underline-offset-2">glossary</a>.
            </p>
            <p className="text-[12px] mt-2" style={{ color: MUTE }}>
              Every figure below is read live from the database when this page loads — so it cannot drift out of date.
            </p>
          </header>

          {/* ── Section nav ──────────────────────────────────────────── */}
          <nav aria-label="Sections"
               className="sticky top-0 z-10 -mx-4 md:mx-0 px-4 md:px-0 py-2 mb-6 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a]">
            <ul className="flex gap-1.5 overflow-x-auto no-scrollbar">
              {SECTIONS.map((x) => (
                <li key={x.id} className="shrink-0">
                  <a href={`#${x.id}`}
                     className={`block px-2.5 py-1.5 rounded text-[11.5px] whitespace-nowrap border transition-colors ${
                       active === x.id
                         ? "border-[#3b82f6] text-[#3b82f6] bg-[#3b82f6]/10"
                         : "border-[#1f1f1f] text-[#71717a] hover:text-[#c5c5c5]"}`}>
                    {x.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-12">

            {/* ── 1. What this is ────────────────────────────────────── */}
            <Section id="what" icon={Boxes} title="What this is"
              lede="Before any detail: this is a measurement rig, not a money machine.">
              <p>
                There are two independent programs here. One is an <strong className="text-[#f5f5f5]">intraday
                auto-trader</strong>: it watches a few dozen Indian stocks through the day and opens and closes
                positions on its own, finishing flat every evening. The other is a <strong className="text-[#f5f5f5]">portfolio
                advisor</strong>: once a day it looks at the shares you genuinely own and offers a hold-or-sell
                opinion on each. They share plumbing but answer different questions and are judged separately.
              </p>
              <p>
                Neither spends real money. Everything is <T g="paper">paper trading</T> — real prices, simulated
                orders. That is the entire point: find out whether the idea works <em>before</em> funding it.
              </p>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 my-4">
                {facts.map((f) => (
                  <div key={f.k} className="rounded-lg border border-[#1f1f1f] bg-[#111] p-3">
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: MUTE }}>{f.k}</p>
                    <p className="text-lg font-semibold tabular-nums mt-1" style={{ color: f.tone ?? "#f5f5f5" }}>{f.v}</p>
                    <p className="text-[10.5px] mt-0.5" style={{ color: MUTE }}>{f.sub}</p>
                  </div>
                ))}
              </div>

              <Callout kind="key" title="The honest headline">
                <p>
                  <strong className="text-[#f5f5f5]">The strategy has no proven edge.</strong> Over{" "}
                  {s ? <strong className="text-[#f5f5f5]">{s.closedTrades.toLocaleString("en-IN")}</strong> : "—"} closed
                  trades it loses about {s ? <strong className="text-[#f5f5f5]">{R2(s.avgR)}</strong> : "—"} per trade.
                  That is a valid experimental result, not a bug, and the project treats it as one.
                </p>
                <p>
                  It matters that you read the rest of this page with that in mind. The machinery below is
                  sophisticated; the thing it measures does not currently work. Both are true.
                </p>
              </Callout>
            </Section>

            {/* ── 2. Vocabulary ──────────────────────────────────────── */}
            <Section id="words" icon={BookMarked} title="The words you need first"
              lede="Five ideas carry most of the weight. The rest are in the glossary.">
              <p>
                <strong className="text-[#f5f5f5]">Everything is measured in <T g="r">R</T>, not rupees.</strong> R is
                the amount deliberately risked on a trade — the gap between the entry price and the{" "}
                <T g="stop">stop-loss</T>. Buy at ₹100 with a stop at ₹95 and one R is ₹5. Getting stopped out is −1R;
                making ₹10 is +2R.
              </p>
              <p>
                This matters because position sizes here vary a lot. In rupees, one big trade can drown out fifty
                small ones. In R, every trade counts once, so the average is honest. That average is called{" "}
                <T g="expectancy">expectancy</T>, and it is the number that decides whether any of this works.
              </p>
              <Callout title="A worked example">
                <p>
                  Ten trades. Three win +2R, seven lose −1R. Win rate is a poor-looking 30% — but expectancy is
                  (3×2 − 7×1) ÷ 10 = <strong style={{ color: GREEN }}>−0.1R</strong>… still a loser. Add costs and
                  it gets worse. This is why <T g="winrate">win rate</T> is not the headline anywhere on this site.
                </p>
              </Callout>
              <p>
                Two more you will meet constantly. <T g="pf">Profit factor</T> is gross winnings divided by gross
                losses — above 1.0 makes money. And <T g="mfe">MFE / MAE</T> record the best and worst each trade
                ever looked, which is what makes it possible to replay alternative exit rules later without buying
                any data.
              </p>
            </Section>

            {/* ── 3. The trader ──────────────────────────────────────── */}
            <Section id="trader" icon={Bot} title="The intraday trader, step by step"
              lede="What actually happens between the market opening and a trade appearing on your screen.">
              <ol className="mt-2">
                <Step n={1} title="Pick what to watch">
                  <p>
                    Each morning it assembles a watchlist of roughly <strong className="text-[#f5f5f5]">86
                    stocks</strong>: your own holdings, the Nifty 50, and a rotating 40-name slice of the Nifty 500
                    that changes daily so the system sees fresh names rather than the same ones forever.
                  </p>
                </Step>
                <Step n={2} title="Look at each one, about every five minutes">
                  <p>
                    A cycle fetches recent 5-minute price bars and computes standard indicators — trend direction,
                    momentum, volatility, how far price sits from its own averages, whether volume is unusual. One
                    full pass over ~86 stocks takes roughly 8 minutes.
                  </p>
                </Step>
                <Step n={3} title="Propose a trade">
                  <p>
                    A signal engine turns those indicators into a possible <T g="long">long or short</T>, together
                    with an entry price, a <T g="stop">stop</T> and a target. Nothing is placed yet — so far this is
                    only an opinion, and it is recorded even when it goes nowhere.
                  </p>
                </Step>
                <Step n={4} title="Ask permission from the risk gates">
                  <p>
                    Caps then decide whether the trade is allowed: how many trades per hour, per cycle, per symbol
                    per day, and how many positions may be open at once. Anything refused is logged with the reason.
                  </p>
                  <p style={{ color: MUTE }}>
                    Those refusals are data, not noise — they are how we later find out which cap was actually the
                    binding constraint on a given day.
                  </p>
                </Step>
                <Step n={5} title="Enter, and write down the plan">
                  <p>
                    A simulated order fills at the live price, and the trade is stored with its entry, stop and
                    target. Because the exits were fixed <em>before</em> the outcome was known, the result can be
                    scored later without hindsight.
                  </p>
                </Step>
                <Step n={6} title="Watch it, roughly every 30 seconds">
                  <p>
                    Faster than the 5-minute analysis cycle, deliberately. Checking only at cycle boundaries used to
                    let losses run well past the stop before being noticed — stops were filling at −2.78R instead of
                    about −1R. That single change is why the exit path is now kept as fast as possible.
                  </p>
                </Step>
                <Step n={7} title="Exit, and record everything">
                  <p>
                    The position closes on its stop, its target, a reversal signal, or the end of the day. The system
                    stores the reason, the <T g="r">R-multiple</T>, and the <T g="mfe">MFE and MAE</T> — the best and
                    worst it ever looked. That last detail is what later made it possible to test every alternative
                    exit rule for free.
                  </p>
                </Step>
              </ol>
              <Callout title="Nothing is held overnight">
                <p>
                  Every position is closed before the market shuts — shorts are covered around 15:15 and longs closed
                  around 15:20. So the account carries no market risk overnight, and each day is a clean, separate
                  experiment.
                </p>
              </Callout>
            </Section>

            {/* ── 4. The advisor ─────────────────────────────────────── */}
            <Section id="advisor" icon={Compass} title="The portfolio advisor"
              lede="A different job: opinions on shares you actually own, on a horizon of weeks rather than minutes.">
              <p>
                Once a day it scores each holding on about seven factors — trend direction on the daily chart, the
                longer weekly trend, momentum, strength relative to the Nifty, volume behaviour, distance from key
                moving averages, and where price sits against nearby support. Those combine into a single trend score
                from −100 to +100, which maps to a verdict: <strong className="text-[#f5f5f5]">HOLD</strong>,{" "}
                <strong className="text-[#f5f5f5]">TRIM</strong> (sell part),{" "}
                <strong className="text-[#f5f5f5]">SELL</strong>, or{" "}
                <strong className="text-[#f5f5f5]">SELL_ON_BOUNCE</strong> (exit, but not into a panic low).
              </p>
              <p>
                It is <strong className="text-[#f5f5f5]">advisory only</strong>. It never places an order. It also
                paper-trades its own advice in two books — one managing your real holdings, one picking fresh names
                with imaginary cash — so its record can be scored against a do-nothing baseline.
              </p>
              <Callout kind="key" title="Every verdict now argues against itself">
                <p>
                  A recent addition: each verdict carries a <strong className="text-[#f5f5f5]">counter-case</strong> —
                  the bear case for a hold, the bull case for a sell — naming the price level that would prove it
                  wrong. For example: <em>&ldquo;The hold fails if ₹497.50 gives way on a daily close; the weekly
                  trend already disagrees.&rdquo;</em>
                </p>
                <p>
                  The reason is simple and worth internalising: a list of reasons why a call is right can never be
                  wrong. Writing down what <em>would</em> make it wrong is what turns an opinion into something that
                  can be scored later.
                </p>
              </Callout>
              <p>
                The same page also lets you <strong className="text-[#f5f5f5]">look up any of the ~500 names it
                scans</strong>, not only the ones you own — useful before buying something. That returns the raw
                trend score rather than a full verdict, and it is only as fresh as the last advisor run, both of
                which the panel states rather than hides.
              </p>
              <p>
                Each call is graded after a set time — 30 trading days for calls resting on long-term structure, 10
                for ones resting on short-term signals. That is deliberately slow, and it is why the advisor&apos;s
                own accuracy is still measured on only a few dozen graded calls.
              </p>
            </Section>

            {/* ── 5. How we measure ──────────────────────────────────── */}
            <Section id="measure" icon={Ruler} title="How we decide whether it works"
              lede="The part that matters most, and the part most trading projects skip.">
              <p>
                It is easy to build something that looks clever and impossible to tell whether it helps. This project
                is organised almost entirely around that problem.
              </p>
              <ul className="space-y-2.5 my-3">
                <li className="flex gap-2.5"><span className="mt-2 h-1 w-1 rounded-full bg-[#555] shrink-0" />
                  <span><strong className="text-[#f5f5f5]">Pre-set go/no-go gates.</strong>{" "}
                  <T g="pf">Profit factor</T> above 1.3 means proceed; below 1.1 means reject. Fixing the thresholds
                  in advance stops the result being reinterpreted after the fact.</span></li>
                <li className="flex gap-2.5"><span className="mt-2 h-1 w-1 rounded-full bg-[#555] shrink-0" />
                  <span><strong className="text-[#f5f5f5]"><T g="darkflag">Dark flags</T>.</strong> New rules run in
                  logging-only mode first. Every time the rule <em>would</em> have acted, that is recorded and nothing
                  changes. Only after the log shows it helps is it switched on.</span></li>
                <li className="flex gap-2.5"><span className="mt-2 h-1 w-1 rounded-full bg-[#555] shrink-0" />
                  <span><strong className="text-[#f5f5f5]">The <T g="verify">VERIFY ledger</T>.</strong> Every fix
                  registers a query and the number that counts as a pass. The rule is blunt: a fix with no check is
                  not shipped, it is unmeasured.</span></li>
                <li className="flex gap-2.5"><span className="mt-2 h-1 w-1 rounded-full bg-[#555] shrink-0" />
                  <span><strong className="text-[#f5f5f5]">A post-session audit</strong> runs after every market day
                  — the checks first, then a data-quality scorecard confirming each intended datapoint was actually
                  captured.</span></li>
              </ul>
              <Callout kind="warn" title="Why the discipline earns its keep">
                <p>
                  One fix sat marked &ldquo;verified&rdquo; for two days on a number that turned out to measure only
                  half the book. Another documented conclusion — that a few exit policies turned a profit once costs
                  were removed — turned out to be an artefact of a generous assumption, and vanished when the
                  ordering of price touches was resolved exactly.
                </p>
                <p>
                  Both were caught by re-measuring rather than by anyone being clever. That is the whole argument for
                  the ledger.
                </p>
              </Callout>
            </Section>

            {/* ── 6. Findings ────────────────────────────────────────── */}
            <Section id="found" icon={FlaskConical} title="What the experiment has actually shown"
              lede="Findings to date, stated the way the evidence supports them.">
              <p>
                <strong className="text-[#f5f5f5]">1. The book as a whole loses.</strong>{" "}
                {s?.profitFactor != null && <>Profit factor sits at <strong className="text-[#f5f5f5]">{s.profitFactor.toFixed(3)}</strong>, </>}
                deep in the reject zone, and it has never approached either gate. Nothing below changes that.
              </p>
              <p>
                <strong className="text-[#f5f5f5]">2. Costs are most of the loss — but removing them would not
                save it.</strong> Of roughly −0.40R lost per trade, about −0.24R is <T g="slippage">transaction
                costs</T>. That sounds fixable. It is not: when every possible fixed exit rule was replayed over the
                real price paths with costs set to <em>zero</em>, none of 180 combinations made money.
              </p>
              <p>
                <strong className="text-[#f5f5f5]">3. No exit rule rescues it either.</strong> That replay covered
                every take-profit and stop-width pairing. The best was still a loss, and results varied far more with
                stop width than with target width — the signature of entries carrying no directional information.
              </p>
              <p>
                <strong className="text-[#f5f5f5]">4. So if an edge exists, it has to be in which trades are taken
                at all</strong> — and every candidate tested there has failed too.
              </p>

              <Callout kind="warn" title="A lead that looked real, and died">
                <p>
                  In August 2026 one filter looked like the first genuine edge this project had found. Restricting to{" "}
                  <strong className="text-[#f5f5f5]">short trades, entered before 13:00, in a strongly trending
                  stock</strong> turned −0.205R per decision into <strong className="text-[#f5f5f5]">+0.097R after
                  costs</strong>, tested on days it was not derived from, with a t-statistic of +3.0. It beat plain
                  shorting on 9 days out of 9.
                </p>
                <p>
                  <strong className="text-[#f5f5f5]">Then one more day of data erased it.</strong> The next session
                  scored −0.532R on that filter — its worst day ever — and the out-of-sample average fell to{" "}
                  <strong className="text-[#f5f5f5]">−0.003R</strong>. Not a decline: zero.
                </p>
                <p>
                  This is the single most useful thing on the page. A result can look statistically solid on ten days
                  and be a coin flip on eleven. Nothing had been switched on, so nothing had to be undone — which is
                  exactly what the <T g="darkflag">dark-flag</T> discipline is for.
                </p>
              </Callout>

              <p>
                <strong className="text-[#f5f5f5]">5. That earlier collapse is the lesson worth keeping.</strong>{" "}
                A separate filter posted two good sessions and looked ready to enable; the third was negative. It
                stays dark. A rule that changes sign session to session is fitted to noise, and the only defence is
                to keep measuring rather than to decide early.
              </p>

              <Callout kind="key" title="So what would settle it?">
                <p>
                  <T g="gate6">Gate #6</T> — a proper historical backtest across years and multiple market regimes.
                  Paper trading can only test conditions that happened to occur over a few weeks. It is built and
                  waiting on a decision about buying historical data.
                </p>
                <p>
                  Until then the honest position is blunt: <strong className="text-[#f5f5f5]">the book loses, and no
                  entry filter tested so far survives contact with more data.</strong>
                </p>
              </Callout>
            </Section>

            {/* ── 7. Machinery ───────────────────────────────────────── */}
            <Section id="machinery" icon={Server} title="The machinery"
              lede="Four moving parts, and how they talk to each other.">
              <div className="grid sm:grid-cols-2 gap-2.5 my-3">
                {[
                  { n: "The brain", d: "Python, running 24/7 on Railway. Makes every decision: what to watch, what to trade, when to exit. Runs the advisor too." },
                  { n: "The database", d: "Supabase (Postgres). Every decision, trade, price bar and verdict is written here. It is the shared memory and the entire evidence base." },
                  { n: "This dashboard", d: "Next.js on Vercel — what you are reading. It only reads and displays; it does not decide anything." },
                  { n: "Zerodha / Kite", d: "The broker. Supplies live prices and your real holdings. Access needs a login key that expires daily." },
                ].map((x) => (
                  <div key={x.n} className="rounded-lg border border-[#1f1f1f] bg-[#111] p-3">
                    <p className="text-[12.5px] font-semibold text-[#f5f5f5] mb-1">{x.n}</p>
                    <p className="text-[12px] text-[#a1a1aa] leading-relaxed">{x.d}</p>
                  </div>
                ))}
              </div>
              <p>
                The volume tells you what is being collected: {s ? <strong className="text-[#f5f5f5]">{APPROX(s.decisions)}</strong> : "—"} recorded
                decisions, {s ? <strong className="text-[#f5f5f5]">{APPROX(s.candleRows)}</strong> : "—"} price
                bars, {s ? <strong className="text-[#f5f5f5]">{APPROX(s.adviceRows)}</strong> : "—"} advisor
                opinions, across {s ? <strong className="text-[#f5f5f5]">{APPROX(s.sessions)}</strong> : "—"} sessions.
                Most were never acted on — they are kept so that questions nobody has asked yet can still be answered.
                {" "}<span style={{ color: MUTE }}>(These four are rounded estimates — counting them exactly would cost
                seconds once a year of data has piled up, and they exist to show scale. Every performance figure above
                is exact.)</span>
              </p>
              <Callout kind="warn" title="The daily login step">
                <p>
                  Zerodha&apos;s <T g="enctoken">session key</T> expires every morning, and there is no way around
                  pasting a fresh one before the market opens. Miss it and the system spends the morning retrying
                  instead of trading — that has cost real data, once about 55% of a day.
                </p>
              </Callout>
            </Section>

            {/* ── 8. Rules ───────────────────────────────────────────── */}
            <Section id="rules" icon={ShieldCheck} title="The house rules"
              lede="Conventions that exist because breaking them has already caused damage.">
              <ul className="space-y-2.5">
                {[
                  ["Never deploy the brain during market hours.", "A deploy restarts it, which truncates the day's data collection. Changes go out after the close or before the open."],
                  ["Never audit a session that is still running.", "Half the day's rows do not exist yet, so the audit reports confidently wrong numbers."],
                  ["A fix with no check is not shipped.", "It is unmeasured. This one rule catches the largest class of mistake."],
                  ["Measure before enabling.", "Ideas run as dark flags first. Sounding sensible is not evidence."],
                  ["Re-derive numbers at the moment you use them.", "Stored targets go stale as the data grows. More than one figure written down here has silently become wrong."],
                ].map(([t, d]) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-2 h-1 w-1 rounded-full shrink-0" style={{ background: AMBER }} />
                    <span><strong className="text-[#f5f5f5]">{t}</strong> <span className="text-[#a1a1aa]">{d}</span></span>
                  </li>
                ))}
              </ul>
            </Section>

            {/* ── 9. Glossary ────────────────────────────────────────── */}
            <Section id="glossary" icon={GraduationCap} title="Glossary"
              lede="Every term used above, defined without assuming prior knowledge.">
              <div className="space-y-2">
                {GLOSSARY.map((g) => (
                  <details key={g.slug} id={`g-${g.slug}`}
                           className="group rounded-lg border border-[#1f1f1f] bg-[#111] scroll-mt-16 open:border-[#2b3a4d]">
                    <summary className="cursor-pointer list-none px-3.5 py-2.5 flex items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-[#f5f5f5]">{g.term}</span>
                      <span className="text-[12px]" style={{ color: MUTE }}>{g.short}</span>
                      <ArrowDown className="w-3 h-3 ml-auto shrink-0 self-center text-[#555] transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="px-3.5 pb-3 text-[12.5px] text-[#b5b5b5] leading-relaxed">{g.body}</p>
                  </details>
                ))}
              </div>
            </Section>

            <footer className="pt-6 mt-2 border-t border-[#1a1a1a] text-[12px]" style={{ color: MUTE }}>
              <p>
                This page is maintained alongside the system: when behaviour changes, this explanation is updated in
                the same change. If something here contradicts what you see elsewhere on the site, the site is right
                and this page has a bug — worth reporting.
              </p>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}
