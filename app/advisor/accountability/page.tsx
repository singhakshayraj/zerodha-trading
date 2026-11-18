"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { Trophy, RefreshCw, TrendingUp, TrendingDown } from "lucide-react";

import { inr } from "@/lib/format";
const GREEN = "#9be15d", RED = "#f08a76", BLUE = "#b9ec8a", MUTE = "#8b968e";

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

const EMPTY_BOOK = { curve: [], startEquity: null, endEquity: null, totalReturnPct: null, baselineReturnPct: null,
  alphaVsBaselinePct: null, closedTrades: 0, wins: 0, losses: 0, winRatePct: null, realizedPnl: 0, avgReturnPct: null,
  byVerdict: {}, bySource: {}, bestTrade: null, worstTrade: null, openPositions: [] } as unknown as Book;

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
      <div className="flex items-center justify-center h-[150px] text-xs text-[#8b968e]">
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
      <p className="text-xs text-[#8b968e]">{label}</p>
      <p className="text-sm font-semibold mt-0.5" style={{ color: color ?? "#eef2ee" }}>{value}</p>
    </div>
  );
}

function BucketTable({ title, data }: { title: string; data: Bucket }) {
  const keys = Object.keys(data);
  if (keys.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-[#8b968e] mb-1.5">{title}</p>
      <div className="space-y-1">
        {keys.map((k) => {
          const b = data[k];
          const wr = b.n ? Math.round((b.wins / b.n) * 100) : 0;
          return (
            <div key={k} className="flex items-center justify-between text-xs">
              <span className="text-[#a9b3ab]">{k}</span>
              <span className="text-[#8b968e]">
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
    <div className="rounded-2xl bg-[#121a15] border border-[#223027] p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-base font-semibold text-[#eef2ee]">{name}</h2>
        <span className="text-sm font-semibold" style={{ color: sign(book.alphaVsBaselinePct) }}>
          {book.alphaVsBaselinePct != null ? `${pct(book.alphaVsBaselinePct)} vs baseline` : "—"}
        </span>
      </div>
      <p className="text-xs text-[#8b968e] mb-4">{subtitle}</p>

      {hasCurve ? (
        <>
          <EquityChart curve={book.curve} />
          <div className="flex items-center gap-4 mt-1 mb-4 text-xs text-[#8b968e]">
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-[2px]" style={{ background: BLUE }} /> advisor</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-[2px] border-t border-dashed" style={{ borderColor: MUTE }} /> do-nothing baseline</span>
          </div>
        </>
      ) : (
        <div className="h-[150px] flex items-center justify-center text-xs text-[#8b968e]">
          not yet seeded (no snapshots yet)
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
        <div className="mt-4 pt-3 border-t border-[#223027] grid grid-cols-2 gap-3 text-xs">
          {book.bestTrade && (
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" style={{ color: GREEN }} />
              <span className="text-[#a9b3ab]">{book.bestTrade.symbol}</span>
              <span style={{ color: GREEN }}>{inr(book.bestTrade.realized_pnl)}</span>
            </div>
          )}
          {book.worstTrade && (
            <div className="flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" style={{ color: RED }} />
              <span className="text-[#a9b3ab]">{book.worstTrade.symbol}</span>
              <span style={{ color: RED }}>{inr(book.worstTrade.realized_pnl)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Execution = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number | null;
  price_is_estimated: boolean;
  detected_at: string;
  verdict_at_time: string | null;
  followed_advice: boolean | null;
  notes: string | null;
};

type Real = { executions: Execution[]; followed: number; diverged: number; rate: number | null };

/** [P-25] What the user ACTUALLY did — inferred from consecutive holdings
 *  snapshots, not from a tap. The books above simulate the advice; this is the
 *  real-money record it gets judged against. */
function RealExecutions({ real }: { real: Real | null }) {
  if (!real) return null;
  const { executions, followed, diverged, rate } = real;
  return (
    <div className="rounded-xl bg-[#121a15] border border-[#223027] p-5 mt-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-sm font-semibold text-[#eef2ee]">Your real executions</h3>
        <span className="text-xs text-[#8b968e]">
          inferred from holdings snapshots · no manual step
        </span>
      </div>
      <p className="text-[12px] text-[#8b968e] max-w-2xl mb-4">
        Detected by diffing the ~8-minute holdings series the advisor already writes. A{" "}
        <strong className="text-[#eef2ee]">sell</strong> shows up on the next refresh; a{" "}
        <strong className="text-[#eef2ee]">buy</strong> only appears once it settles (T+1),
        because the broker&apos;s holdings feed reports delivered stock only.
      </p>

      {executions.length === 0 ? (
        <p className="text-[12px] text-[#8b968e]">
          No executions detected yet. Sell or add to a holding and it will appear here within
          one advisor refresh.
        </p>
      ) : (
        <>
          <div className="flex gap-5 mb-3 text-[12px] tabular-nums">
            <span className="text-[#a9b3ab]">Followed advice <strong className="text-[#9be15d]">{followed}</strong></span>
            <span className="text-[#a9b3ab]">Diverged <strong className="text-[#d9b84a]">{diverged}</strong></span>
            {rate !== null && (
              <span className="text-[#a9b3ab]">Follow rate <strong className="text-[#eef2ee]">{Math.round(rate * 100)}%</strong></span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] tabular-nums">
              <thead>
                <tr className="text-[#8b968e] text-left">
                  <th className="font-normal py-1 pr-3">Detected</th>
                  <th className="font-normal py-1 pr-3">Action</th>
                  <th className="font-normal py-1 pr-3">Qty</th>
                  <th className="font-normal py-1 pr-3">Price</th>
                  <th className="font-normal py-1 pr-3">Advice then</th>
                  <th className="font-normal py-1">Followed?</th>
                </tr>
              </thead>
              <tbody>
                {executions.map((e, i) => (
                  <tr key={i} className="border-t border-[#223027]">
                    <td className="py-1.5 pr-3 text-[#a9b3ab]">{e.detected_at.slice(0, 16).replace("T", " ")}</td>
                    <td className="py-1.5 pr-3">
                      <span className={e.side === "SELL" ? "text-[#f08a76]" : "text-[#9be15d]"}>{e.side}</span>{" "}
                      <span className="text-[#eef2ee]">{e.symbol}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-[#a9b3ab]">{e.quantity}</td>
                    <td className="py-1.5 pr-3 text-[#a9b3ab]">
                      {e.price !== null ? `\u20b9${Number(e.price).toFixed(2)}` : "—"}
                      {e.price_is_estimated && <span className="text-[#8b968e]" title="broker leaves avg_price unchanged on a sale, so this is the run's last price"> est</span>}
                    </td>
                    <td className="py-1.5 pr-3 text-[#a9b3ab]">{e.verdict_at_time ?? "—"}</td>
                    <td className="py-1.5">
                      {e.followed_advice === true ? <span className="text-[#9be15d]">yes</span>
                        : e.followed_advice === false ? <span className="text-[#d9b84a]">no</span>
                        : <span className="text-[#8b968e]" title="the advisor had no opinion on this name">n/a</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function AccountabilityPage() {
  const [books, setBooks] = useState<Record<string, Book> | null>(null);
  const [hasData, setHasData] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [real, setReal] = useState<Real | null>(null);
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
      setReal(data.real ?? null);
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
    <div className="flex flex-col md:flex-row h-dvh overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto p-5 md:p-8">
        <div className="max-w-[1100px] w-full mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#8b968e]" />
              <h1 className="text-lg font-semibold text-[#eef2ee]">Advisor scorecard</h1>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#8b968e] bg-[#121a15] border border-[#223027] hover:text-[#eef2ee] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          <p className="text-[12px] text-[#8b968e] mb-5">
            Paper-trading the advisor&apos;s own verdicts, two ways: <span className="text-[#a9b3ab]">Management</span> mirrors
            your holdings and applies every HOLD/SELL/TRIM/rotation; <span className="text-[#a9b3ab]">Picking</span> starts
            with cash and buys the rotation/scan targets. Each vs a do-nothing baseline.
            {updatedAt && <span className="text-[#8b968e]"> Last snapshot: {updatedAt}</span>}
          </p>

          {loading ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-[420px] w-full rounded-2xl bg-[#121a15]" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl bg-[#121a15] border border-[#223027] p-4 text-[13px] text-[#f08a76]">
              {error}
            </div>
          ) : !hasData ? (
            <>
            <RealExecutions real={real} />
            <div className="rounded-xl bg-[#121a15] border border-[#223027] p-5 mt-4">
              <h3 className="text-sm font-semibold text-[#eef2ee] mb-1">No paper snapshots yet</h3>
              <p className="text-[12px] text-[#8b968e] max-w-xl">
                The paper-portfolio seeds from the holdings and starts both books on the next
                official advisor run (needs a live token). Equity curves and the win/loss record
                fill in from there — one snapshot per trading day.
              </p>
            </div>
            </>
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
              <BookCard
                name="Picking (risk-based)"
                subtitle="Monthly rebalance to capped HRP weights vs the same money in Nifty 500 · shadow book"
                book={books.PICKING_RP ?? EMPTY_BOOK}
              />
              <BookCard
                name="S5 momentum (paper)"
                subtitle="₹50k · top-10 momentum, monthly at 15:25, cash below Nifty 200-DMA · baseline = Nifty200 Momentum 30 · trial 265, read 2028-12-31"
                book={books.S5 ?? EMPTY_BOOK}
              />
              <div className="lg:col-span-2"><RealExecutions real={real} /></div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
