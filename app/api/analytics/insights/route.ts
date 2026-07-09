import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Aggregates the stored paper-trading dataset for the Insights page. Written
// against the CURRENT schema (entry_time, r_multiple, mfe_r/mae_r, trade_id) —
// the older lib/db analytics helpers reference stale columns (entry_at,
// resulted_in_trade) and are not reused here.

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
};

function rBucket(r: number): string {
  if (r <= -2) return "≤-2";
  if (r < -1) return "-2..-1";
  if (r < 0) return "-1..0";
  if (r < 1) return "0..1";
  if (r < 2) return "1..2";
  return "≥2";
}
const R_ORDER = ["≤-2", "-2..-1", "-1..0", "0..1", "1..2", "≥2"];

export async function GET() {
  try {
    const [sessCount, tradeCount, decCount, candleCount] = await Promise.all([
      supabaseServer.from("trading_sessions").select("*", { count: "exact", head: true }),
      supabaseServer.from("trades").select("*", { count: "exact", head: true }),
      supabaseServer.from("brain_decisions").select("*", { count: "exact", head: true }),
      supabaseServer.from("candles").select("*", { count: "exact", head: true }),
    ]);

    // Per-day capture volume (grouped server-side to dodge the 1000-row cap)
    const { data: daily } = await supabaseServer.rpc("daily_capture");

    // Signal distribution — three cheap head counts
    const [buy, sell, hold] = await Promise.all(
      ["BUY", "SELL", "HOLD"].map((s) =>
        supabaseServer.from("brain_decisions").select("*", { count: "exact", head: true }).eq("signal", s)
      )
    );

    // Closed trades (small: tens–hundreds) — aggregate in JS
    const { data: tradesRaw } = await supabaseServer
      .from("trades")
      .select("pnl,r_multiple,mfe_r,mae_r,regime,position_type,exit_reason,is_winner,entry_time")
      .eq("status", "CLOSED")
      .not("pnl", "is", null);
    const trades = (tradesRaw ?? []) as Trade[];

    const closed = trades.length;
    const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
    const rVals = trades.map((t) => t.r_multiple).filter((r): r is number => r != null);
    const avgR = rVals.length ? rVals.reduce((a, b) => a + b, 0) / rVals.length : 0;
    const totalPnl = trades.reduce((a, t) => a + (t.pnl ?? 0), 0);

    // R-multiple histogram
    const rHist: Record<string, number> = {};
    for (const r of rVals) rHist[rBucket(r)] = (rHist[rBucket(r)] ?? 0) + 1;
    const rDistribution = R_ORDER.map((bucket) => ({ bucket, count: rHist[bucket] ?? 0 }));

    // Win rate + avg R by regime
    const byRegimeMap: Record<string, { n: number; w: number; rSum: number; rN: number }> = {};
    for (const t of trades) {
      const k = t.regime || "UNKNOWN";
      byRegimeMap[k] ??= { n: 0, w: 0, rSum: 0, rN: 0 };
      byRegimeMap[k].n++;
      if ((t.pnl ?? 0) > 0) byRegimeMap[k].w++;
      if (t.r_multiple != null) { byRegimeMap[k].rSum += t.r_multiple; byRegimeMap[k].rN++; }
    }
    const byRegime = Object.entries(byRegimeMap)
      .map(([regime, v]) => ({
        regime,
        trades: v.n,
        winRate: v.n ? (v.w / v.n) * 100 : 0,
        avgR: v.rN ? v.rSum / v.rN : 0,
      }))
      .sort((a, b) => b.trades - a.trades);

    // Win rate by IST hour bucket (entry_time)
    const byHourMap: Record<string, { n: number; w: number }> = {};
    for (const t of trades) {
      if (!t.entry_time) continue;
      const istHour = (new Date(t.entry_time).getUTCHours() + 5) % 24; // +5:30, hour part
      const bucket = `${String(istHour).padStart(2, "0")}:00`;
      byHourMap[bucket] ??= { n: 0, w: 0 };
      byHourMap[bucket].n++;
      if ((t.pnl ?? 0) > 0) byHourMap[bucket].w++;
    }
    const byTimeBucket = Object.entries(byHourMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({ bucket, trades: v.n, winRate: v.n ? (v.w / v.n) * 100 : 0 }));

    // MFE/MAE — stop/target quality
    const mfe = trades.map((t) => t.mfe_r).filter((r): r is number => r != null);
    const mae = trades.map((t) => t.mae_r).filter((r): r is number => r != null);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    // Losers that first ran ≥1R favorable → stop likely too tight
    const stopTooTight = trades.filter(
      (t) => (t.pnl ?? 0) <= 0 && (t.mfe_r ?? 0) >= 1
    ).length;
    // Trades that reached ≥1.5R favorable but exited below 0.5R → gave it back
    const gaveItBack = trades.filter(
      (t) => (t.mfe_r ?? 0) >= 1.5 && (t.r_multiple ?? 0) < 0.5
    ).length;

    return NextResponse.json({
      scale: {
        sessions: sessCount.count ?? 0,
        trades: tradeCount.count ?? 0,
        decisions: decCount.count ?? 0,
        candles: candleCount.count ?? 0,
      },
      daily: (daily ?? []).map((d: { day: string; decisions: number; trades: number; candles: number }) => ({
        day: d.day,
        decisions: Number(d.decisions),
        trades: Number(d.trades),
        candles: Number(d.candles),
      })),
      signals: [
        { signal: "BUY", count: buy.count ?? 0 },
        { signal: "SELL", count: sell.count ?? 0 },
        { signal: "HOLD", count: hold.count ?? 0 },
      ],
      outcomes: {
        closed,
        wins,
        losses: closed - wins,
        winRate: closed ? (wins / closed) * 100 : 0,
        avgR,
        totalPnl,
      },
      rDistribution,
      byRegime,
      byTimeBucket,
      excursion: {
        avgMfe: avg(mfe),
        avgMae: avg(mae),
        stopTooTight,
        gaveItBack,
        sampled: mfe.length,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
