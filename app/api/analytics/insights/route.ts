import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Aggregates the stored paper-trading dataset for the Insights page. Written
// against the CURRENT schema (entry_time, r_multiple, mfe_r/mae_r, trade_id,
// decision_to_order_ms) — the older lib/db analytics helpers reference stale
// columns (entry_at, resulted_in_trade) and are not reused.

type Trade = {
  pnl: number | null;
  r_multiple: number | null;
  mfe_r: number | null;
  mae_r: number | null;
  regime: string | null;
  position_type: string | null;
  exit_reason: string | null;
  is_winner: boolean | null;
  entry_time: string | null;
  created_at: string | null;
  decision_to_order_ms: number | null;
};

type Finding = { text: string; tone: "bad" | "warn" | "good" | "info" };

// Drain a select past Supabase's 1000-row server default — without this the
// query silently truncates once trades outgrow one page and every insight
// quietly computes on the OLDEST 1000 rows (KNOWN_ISSUES P2).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll<T>(makeQuery: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += pageSize) {
    const { data } = await makeQuery(start, start + pageSize - 1);
    const batch = (data ?? []) as T[];
    out.push(...batch);
    if (batch.length < pageSize) return out;
  }
}

function rBucket(r: number): string {
  if (r <= -2) return "≤-2";
  if (r < -1) return "-2..-1";
  if (r < 0) return "-1..0";
  if (r < 1) return "0..1";
  if (r < 2) return "1..2";
  return "≥2";
}
const R_ORDER = ["≤-2", "-2..-1", "-1..0", "0..1", "1..2", "≥2"];
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export async function GET() {
  try {
    // [P-36] Nine round trips of scalars (4 table counts, 3 signal counts, a
    // news count, and a full-table fetch of every trade purely to SUM one
    // column) collapse into one RPC. The remaining independent reads now run
    // concurrently instead of five sequential awaits — they never depended on
    // each other, the sequencing was incidental.
    const [
      { data: totalsRaw },
      { data: daily },
      { data: ttEffectRows },
      { data: newsEffectRows },
      { data: latestNews },
    ] = await Promise.all([
      supabaseServer.rpc("insights_totals"),
      supabaseServer.rpc("daily_capture"),
      supabaseServer.rpc("trend_tells_effect"),
      supabaseServer.rpc("news_outcome_effect"),
      supabaseServer
        .from("news_events")
        .select("published_at, headline, symbols, sentiment_label, sentiment_score, url")
        .order("published_at", { ascending: false })
        .limit(8),
    ]);

    const totals = (totalsRaw ?? {}) as {
      sessions: number; trades: number; decisions: number; candles: number;
      newsEvents: number; buy: number; sell: number; hold: number; totalDeployed: number;
    };
    const sessCount = { count: totals.sessions };
    const tradeCount = { count: totals.trades };
    const decCount = { count: totals.decisions };
    const candleCount = { count: totals.candles };
    const newsCount = totals.newsEvents;
    const buy = { count: totals.buy };
    const sell = { count: totals.sell };
    const hold = { count: totals.hold };
    const totalDeployed = Number(totals.totalDeployed) || 0;

    const tt = (ttEffectRows?.[0] as
      | { entry_signals: number; permitted: number; linked: number; blocked_losers: number; blocked_loser_pnl: number }
      | undefined) ?? { entry_signals: 0, permitted: 0, linked: 0, blocked_losers: 0, blocked_loser_pnl: 0 };

    const trades = await fetchAll<Trade>((from, to) =>
      supabaseServer
        .from("trades")
        .select("pnl,r_multiple,mfe_r,mae_r,regime,position_type,exit_reason,is_winner,entry_time,created_at,decision_to_order_ms")
        .eq("status", "CLOSED")
        .not("pnl", "is", null)
        .order("entry_time", { ascending: true, nullsFirst: false })
        .range(from, to));

    const closed = trades.length;
    const winners = trades.filter((t) => (t.pnl ?? 0) > 0);
    const losers = trades.filter((t) => (t.pnl ?? 0) <= 0);
    const wins = winners.length;
    const rVals = trades.map((t) => t.r_multiple).filter((r): r is number => r != null);
    const avgR = avg(rVals);
    const totalPnl = trades.reduce((a, t) => a + (t.pnl ?? 0), 0);
    const winRate = closed ? (wins / closed) * 100 : 0;

    // Breakeven win rate given the realized payoff ratio (avg win R vs avg loss R)
    const winR = winners.map((t) => t.r_multiple).filter((r): r is number => r != null);
    const lossR = losers.map((t) => t.r_multiple).filter((r): r is number => r != null).map((r) => Math.abs(r));
    const avgWinR = avg(winR), avgLossR = avg(lossR);
    const breakevenWinRate = avgWinR + avgLossR > 0 ? (avgLossR / (avgWinR + avgLossR)) * 100 : 0;

    const verdictLabel = avgR > 0.05 ? "PROFITABLE EDGE" : avgR >= -0.05 ? "MARGINAL" : "LOSING EDGE";
    const confidence = closed < 30 ? "thin" : closed < 120 ? "limited" : "reasonable";

    // Go/no-go gate metrics (VISION §6.1): profit factor and max drawdown are
    // the two numbers real money is gated on — PF >1.3 go / <1.1 kill, max DD
    // <10% go / >15% kill. Both net of costs (pnl already folds them in).
    const grossProfit = winners.reduce((a, t) => a + (t.pnl ?? 0), 0);
    const grossLoss = Math.abs(losers.reduce((a, t) => a + Math.min(0, t.pnl ?? 0), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null; // null = no losses yet
    // Max drawdown = largest peak-to-trough of the cumulative equity curve.
    // Reported in R (capital-independent, the system's native unit) and ₹.
    let peakR = 0, maxDrawdownR = 0, peakPnl = 0, maxDrawdownInr = 0;
    let runR = 0, runPnl = 0;
    for (const t of trades) {
      runR += t.r_multiple ?? 0;
      runPnl += t.pnl ?? 0;
      peakR = Math.max(peakR, runR);
      peakPnl = Math.max(peakPnl, runPnl);
      maxDrawdownR = Math.max(maxDrawdownR, peakR - runR);
      maxDrawdownInr = Math.max(maxDrawdownInr, peakPnl - runPnl);
    }

    // Cumulative curve (₹ over all closed; R where present)
    let cumPnl = 0, cumR = 0;
    const equityCurve = trades.map((t, i) => {
      cumPnl += t.pnl ?? 0;
      if (t.r_multiple != null) cumR += t.r_multiple;
      return { i: i + 1, date: t.entry_time ?? t.created_at, cumPnl: Math.round(cumPnl), cumR: Number(cumR.toFixed(2)) };
    });

    // R histogram
    const rHist: Record<string, number> = {};
    for (const r of rVals) rHist[rBucket(r)] = (rHist[rBucket(r)] ?? 0) + 1;
    const rDistribution = R_ORDER.map((bucket) => ({ bucket, count: rHist[bucket] ?? 0 }));

    // By regime
    const byRegimeMap: Record<string, { n: number; w: number; rSum: number; rN: number }> = {};
    for (const t of trades) {
      const k = t.regime || "UNKNOWN";
      byRegimeMap[k] ??= { n: 0, w: 0, rSum: 0, rN: 0 };
      byRegimeMap[k].n++;
      if ((t.pnl ?? 0) > 0) byRegimeMap[k].w++;
      if (t.r_multiple != null) { byRegimeMap[k].rSum += t.r_multiple; byRegimeMap[k].rN++; }
    }
    const byRegime = Object.entries(byRegimeMap)
      .map(([regime, v]) => ({ regime, trades: v.n, winRate: v.n ? (v.w / v.n) * 100 : 0, avgR: v.rN ? v.rSum / v.rN : 0 }))
      .sort((a, b) => b.trades - a.trades);

    // By IST hour
    const byHourMap: Record<string, { n: number; w: number }> = {};
    for (const t of trades) {
      if (!t.entry_time) continue;
      const istHour = (new Date(t.entry_time).getUTCHours() + 5) % 24;
      const bucket = `${String(istHour).padStart(2, "0")}:00`;
      byHourMap[bucket] ??= { n: 0, w: 0 };
      byHourMap[bucket].n++;
      if ((t.pnl ?? 0) > 0) byHourMap[bucket].w++;
    }
    const byTimeBucket = Object.entries(byHourMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({ bucket, trades: v.n, winRate: v.n ? (v.w / v.n) * 100 : 0 }));

    // MFE/MAE
    const withPath = trades.filter((t) => t.mfe_r != null && t.mae_r != null);
    const mfe = withPath.map((t) => t.mfe_r as number);
    const mae = withPath.map((t) => t.mae_r as number);
    const mfeScatter = withPath.map((t) => ({
      mae: t.mae_r as number, mfe: t.mfe_r as number,
      r: t.r_multiple ?? 0, win: (t.pnl ?? 0) > 0,
    }));
    const stopTooTight = trades.filter((t) => (t.pnl ?? 0) <= 0 && (t.mfe_r ?? 0) >= 1).length;
    const gaveItBack = trades.filter((t) => (t.mfe_r ?? 0) >= 1.5 && (t.r_multiple ?? 0) < 0.5).length;

    // Execution
    const lat = trades.map((t) => t.decision_to_order_ms).filter((m): m is number => m != null);

    // Position mix
    const shorts = trades.filter((t) => t.position_type === "SHORT").length;
    const shortPct = closed ? (shorts / closed) * 100 : 0;

    // Flag effects (trend-tells)
    const ttEntries = Number(tt.entry_signals);
    const ttPermitted = Number(tt.permitted);
    const ttPermitPct = ttEntries ? (ttPermitted / ttEntries) * 100 : 0;

    // ── auto-generated findings ─────────────────────────────────────────────
    const findings: Finding[] = [];
    findings.push({
      tone: avgR > 0.05 ? "good" : avgR >= -0.05 ? "warn" : "bad",
      text: `Expectancy is ${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R per trade over ${closed} closed trades — ${verdictLabel.toLowerCase()} (${confidence} confidence at this sample size).`,
    });
    if (closed >= 10 && breakevenWinRate > 0) {
      findings.push({
        tone: winRate >= breakevenWinRate ? "good" : "warn",
        text: `Win rate ${winRate.toFixed(0)}% vs the ${breakevenWinRate.toFixed(0)}% you'd need to break even at the current payoff ratio.`,
      });
    }
    if (closed >= 20 && profitFactor != null) {
      findings.push({
        tone: profitFactor >= 1.3 ? "good" : profitFactor >= 1.1 ? "warn" : "bad",
        text: `Profit factor ${profitFactor.toFixed(2)} (gross profit ÷ gross loss, net of costs). The real-money gate is >1.3 to go, <1.1 to reject — but this is a ${confidence}-confidence sample, not the backtest that actually decides.`,
      });
    }
    const worstRegime = byRegime.filter((r) => r.trades >= 15).sort((a, b) => a.winRate - b.winRate)[0];
    if (worstRegime && worstRegime.winRate < 25) {
      findings.push({
        tone: "bad",
        text: `${worstRegime.regime} regime: ${worstRegime.winRate.toFixed(0)}% win over ${worstRegime.trades} trades (avg ${worstRegime.avgR.toFixed(2)}R) — a systematic loser, likely shorting into strength.`,
      });
    }
    if (shortPct >= 65 && closed >= 10) {
      findings.push({ tone: "warn", text: `${shortPct.toFixed(0)}% of trades are shorts — a heavy directional lean the market-direction gate (still off) would temper.` });
    }
    if (ttEntries >= 50) {
      findings.push({
        tone: "info",
        text: `The trend-tells gate (currently off) would permit only ${ttPermitPct.toFixed(0)}% of entry signals — cutting ${(100 - ttPermitPct).toFixed(0)}% of entries.${tt.linked > 0 ? ` So far it would have blocked ${tt.blocked_losers} losing trades (${Math.round(tt.blocked_loser_pnl)}₹).` : " Win/loss impact fills in as new trades link to their decisions."}`,
      });
    }
    if (withPath.length >= 5 && stopTooTight >= 2) {
      findings.push({ tone: "warn", text: `${stopTooTight} losers first ran ≥1R in your favor before stopping out — stops may be too tight.` });
    }
    const holdCount = hold.count ?? 0;
    const totalDec = (buy.count ?? 0) + (sell.count ?? 0) + holdCount;
    if (totalDec > 0) {
      findings.push({ tone: "info", text: `${((holdCount / totalDec) * 100).toFixed(0)}% of ${totalDec.toLocaleString()} decisions are HOLD — the engine acts on a small, selective slice.` });
    }

    // Gate #6 (historical backtest) result, if it has ever run. Its ABSENCE is
    // the point: paper metrics above are NOT an edge verdict until this exists.
    let gate6 = null;
    try {
      const { data: g } = await supabaseServer
        .from("app_config").select("value").eq("key", "gate6_result").single();
      if (g?.value) gate6 = JSON.parse(g.value as string);
    } catch {
      /* absent = not run yet — the banner keys off exactly this */
    }

    return NextResponse.json({
      gate6,
      scale: {
        sessions: sessCount.count ?? 0,
        trades: tradeCount.count ?? 0,
        decisions: decCount.count ?? 0,
        candles: candleCount.count ?? 0,
        totalDeployed,
      },
      verdict: {
        label: verdictLabel,
        expectancyR: avgR,
        winRate,
        breakevenWinRate,
        totalPnl,
        closed,
        confidence,
        profitFactor,
        maxDrawdownR,
        maxDrawdownInr,
      },
      findings,
      equityCurve,
      daily: (daily ?? []).map((d: { day: string; decisions: number; trades: number; candles: number }) => ({
        day: d.day, decisions: Number(d.decisions), trades: Number(d.trades), candles: Number(d.candles),
      })),
      signals: [
        { signal: "BUY", count: buy.count ?? 0 },
        { signal: "SELL", count: sell.count ?? 0 },
        { signal: "HOLD", count: hold.count ?? 0 },
      ],
      rDistribution,
      byRegime,
      byTimeBucket,
      excursion: { avgMfe: avg(mfe), avgMae: avg(mae), stopTooTight, gaveItBack, sampled: withPath.length },
      mfeScatter,
      execution: { avgLatencyMs: Math.round(avg(lat)), samples: lat.length },
      flags: {
        trendTells: {
          entrySignals: ttEntries,
          permitted: ttPermitted,
          permitPct: ttPermitPct,
          linked: Number(tt.linked),
          blockedLosers: Number(tt.blocked_losers),
          blockedLoserPnl: Number(tt.blocked_loser_pnl),
        },
      },
      news: {
        total: newsCount ?? 0,
        byOutcome: (newsEffectRows ?? []).map(
          (r: { sentiment_bucket: string; trades: number; wins: number; avg_r: number; total_pnl: number }) => ({
            bucket: r.sentiment_bucket,
            trades: Number(r.trades),
            wins: Number(r.wins),
            avgR: r.avg_r == null ? null : Number(r.avg_r),
            totalPnl: Number(r.total_pnl),
          })
        ),
        latest: (latestNews ?? []).map(
          (n: { published_at: string; headline: string; symbols: string[]; sentiment_label: string | null; sentiment_score: number | null; url: string }) => ({
            publishedAt: n.published_at,
            headline: n.headline,
            symbols: n.symbols ?? [],
            sentimentLabel: n.sentiment_label,
            sentimentScore: n.sentiment_score,
            url: n.url,
          })
        ),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
