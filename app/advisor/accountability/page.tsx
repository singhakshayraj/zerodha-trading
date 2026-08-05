"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { Trophy, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";

const GREEN = "#22c55e", RED = "#ef4444", BLUE = "#3b82f6", MUTE = "#71717a";

type CurvePoint = {
  date: string;
  equity: number | null;
  baseline: number | null;
  nifty: number | null;
  openPositions: number | null;
};
type Trade = {
  symbol: string;
  verdict: string | null;
  source: string | null;
  realized_pnl?: number | null;
  return_pct?: number | null;
} | null;
type OpenPos = {
  symbol: string;
  source: string | null;
  verdict: string | null;
  qty: number;
  entryPrice: number;
  entryDate: string;
};
type Bucket = Record<string, { n: number; wins: number; pnl: number }>;
type Book = {
  curve: CurvePoint[];
  startEquity: number | null;
  endEquity: number | null;
  totalReturnPct: number | null;
  baselineReturnPct: number | null;
  alphaVsBaselinePct: number | null;
  closedTrades: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  realizedPnl: number;
  avgReturnPct: number | null;
  byVerdict: Bucket;
  bySource: Bucket;
  bestTrade: Trade;
  worstTrade: Trade;
  openPositions: OpenPos[];
};

const inr = (v: number | null | undefined) =>
  v == null ? "—" : `₹${Math.round(v).toLocaleString("en-IN")}`;
const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`;
const sign = (v: number | null | undefined) =>
  v == null ? MUTE : v > 0 ? GREEN : v < 0 ? RED : MUTE;

// Dual-line equity curve — advisor book vs its do-nothing baseline, both scaled
// to the same axis so out/under-performance reads at a glance. No chart lib.
function EquityChart({ curve }: { curve: CurvePoint[] }) {
  const w = 520, h = 150, pad = 6;
  const eq = curve.map((c) => c.equity).filter((v): v is number => v != null);
  const base = curve.map((c) => c.baseline).filter((v): v is number => v != null);
  const all = [...eq, ...base];
  if (all.length < 2 || curve.length < 2) {
    return (
      <div className="flex items-center justify-center h-[150px] text-[11px] text-[#555]">
        needs ≥2 daily snapshots to draw the curve
      </div>
    );
  }
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const n = curve.length;
  const x = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const line = (key: "equity" | "baseline") =>
    curve
      .map((c, i) => (c[key] != null ? `${x(i)},${y(c[key] as number)}` : null))
      .filter(Boolean)
      .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <polyline points={line("baseline")} fill="none" stroke={MUTE} strokeWidth={1.25} strokeDasharray="4 3" />
      <polyline points={line("equity")} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[#666]">{label}</p>
      <p className="text-sm font-semibold mt-0.5" style={{ color: color ?? "#f5f5f5" }}>{value}</p>
    </div>
  );
}

function BucketTable({ title, data }: { title: string; data: Bucket }) {
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[#666] mb-1.5">{title}</p>
      <div className="space-y-1">
        {keys.map((k) => {
          const b = data[k];
          const wr = b.n ? Math.round((b.wins / b.n) * 100) : 0;
          return (
            <div key={k} className="flex items-center justify-between text-[11px]">
              <span className="text-[#aaa]">{k}</span>
              <span className="text-[#777]">
                {b.wins}/{b.n} · {wr}% · <span style={{ color: sign(b.pnl) }}>{inr(b.pnl)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BookCard({ name, subtitle, book }: { name: string; subtitle: string; book: Book }) {
  const hasCurve = book.curve.length > 0;
  return (
    <div className="rounded-2xl bg-[#111111] border border-[#1f1f1f] p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-base font-semibold text-[#f5f5f5]">{name}</h2>
        <span className="text-sm font-semibold" style={{ color: sign(book.alphaVsBaselinePct) }}>
          {book.alphaVsBaselinePct != null ? `${pct(book.alphaVsBaselinePct)} vs baseline` : "—"}
        </span>
      </div>
      <p className="text-[11px] text-[#666] mb-4">{subtitle}</p>

      {hasCurve ? (
        <>
          <EquityChart curve={book.curve} />
          <div className="flex items-center gap-4 mt-1 mb-4 text-[10px] text-[#666]">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-[2px]" style={{ background: BLUE }} /> advisor</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-[2px] border-t border-dashed" style={{ borderColor: MUTE }} /> do-nothing baseline</span>
          </div>
        </>
      ) : (
        <div className="h-[150px] flex items-center justify-center text-[11px] text-[#555]">
          no snapshots yet
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Return" value={pct(book.totalReturnPct)} color={sign(book.totalReturnPct)} />
        <Stat label="Baseline" value={pct(book.baselineReturnPct)} />
        <Stat label="Realized P&L" value={inr(book.realizedPnl)} color={sign(book.realizedPnl)} />
        <Stat label="Win rate" value={book.winRatePct != null ? `${book.winRatePct}%` : "—"} />
        <Stat label="W / L" value={`${book.wins} / ${book.losses}`} />
        <Stat label="Open" value={String(book.openPositions.length)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <BucketTable title="by verdict" data={book.byVerdict} />
        <BucketTable title="by source" data={book.bySource} />
      </div>

      {(book.bestTrade || book.worstTrade) && (
        <div className="mt-4 pt-3 border-t border-[#1f1f1f] grid grid-cols-2 gap-3 text-[11px]">
          {book.bestTrade && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: GREEN }} />
              <span className="text-[#aaa]">{book.bestTrade.symbol}</span>
              <span style={{ color: GREEN }}>{inr(book.bestTrade.realized_pnl)}</span>
            </div>
          )}
          {book.worstTrade && (
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" style={{ color: RED }} />
              <span className="text-[#aaa]">{book.worstTrade.symbol}</span>
              <span style={{ color: RED }}>{inr(book.worstTrade.realized_pnl)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AccountabilityPage() {
  const [books, setBooks] = useState<Record<string, Book> | null>(null);
  const [hasData, setHasData] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/advisor/accountability");
      setBooks(data.books ?? null);
      setHasData(Boolean(data.hasData));
      setUpdatedAt(data.updatedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto p-5 md:p-8">
        <div className="max-w-[1100px] w-full mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#888]" />
              <h1 className="text-lg font-semibold text-[#f5f5f5]">Advisor scorecard</h1>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#888] bg-[#111111] border border-[#1f1f1f] hover:text-[#f5f5f5] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          <p className="text-[12px] text-[#666] mb-5">
            Paper-trading the advisor&apos;s own verdicts, two ways: <span className="text-[#aaa]">Management</span> mirrors
            your holdings and applies every HOLD/SELL/TRIM/rotation; <span className="text-[#aaa]">Picking</span> starts
            with cash and buys the rotation/scan targets. Each vs a do-nothing baseline.
            {updatedAt && <span className="text-[#555]"> Last snapshot: {updatedAt}</span>}
          </p>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-[420px] w-full rounded-2xl bg-[#111111]" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl bg-[#111111] border border-[#1f1f1f] p-4 text-[13px] text-[#ef4444]">
              {error}
            </div>
          ) : !hasData ? (
            <div className="rounded-xl bg-[#111111] border border-[#1f1f1f] p-5">
              <h3 className="text-sm font-semibold text-[#f5f5f5] mb-1">No paper snapshots yet</h3>
              <p className="text-[12px] text-[#888] max-w-xl">
                The paper-portfolio seeds from the holdings and starts both books on the next
                official advisor run (needs a live token). Equity curves and the win/loss record
                fill in from there — one snapshot per trading day.
              </p>
            </div>
          ) : books ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <BookCard
                name="Management"
                subtitle="Holdings mirror · applies HOLD/SELL/TRIM/rotation · baseline = holdings frozen"
                book={books.MANAGEMENT}
              />
              <BookCard
                name="Picking"
                subtitle="₹100k cash · buys rotation/scan targets, exits at horizon · baseline = Nifty B&H"
                book={books.PICKING}
              />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
