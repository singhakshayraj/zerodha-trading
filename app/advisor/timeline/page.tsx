"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { Activity, RefreshCw, Clock } from "lucide-react";

const GREEN = "#22c55e", RED = "#ef4444", AMBER = "#f59e0b", BLUE = "#3b82f6", MUTE = "#71717a";

// Same palette the /advisor verdicts use, so a stock reads the same everywhere.
const VERDICT_COLOR: Record<string, string> = {
  HOLD: GREEN,
  TRIM: BLUE,
  SELL_ON_BOUNCE: AMBER,
  SELL: RED,
  INSUFFICIENT: MUTE,
};
const vColor = (v: string | null) => (v && VERDICT_COLOR[v]) || MUTE;

type Point = {
  observed_at: string;
  price: number | null;
  trend_score: number | null;
  verdict: string | null;
  phase: string | null;
};
type Sym = {
  symbol: string;
  latest_at: string | null;
  latest_price: number | null;
  latest_score: number | null;
  latest_verdict: string | null;
  count: number;
  points: Point[];
};

const IST = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// Inline price sparkline — no chart lib, just an SVG polyline scaled to the
// point set. Flat/degenerate series render as a centered line.
function Sparkline({ points }: { points: Point[] }) {
  const w = 260, h = 44, pad = 4;
  const prices = points.map((p) => (typeof p.price === "number" ? p.price : null));
  const valid = prices.filter((v): v is number => v != null);
  if (valid.length < 2) {
    return (
      <div className="flex items-center justify-center h-[44px] text-[10px] text-[#555]">
        {valid.length === 1 ? "one reading — sparkline needs ≥2" : "no price readings yet"}
      </div>
    );
  }
  const min = Math.min(...valid), max = Math.max(...valid);
  const span = max - min || 1;
  const n = prices.length;
  const x = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const up = (valid[valid.length - 1] ?? 0) >= (valid[0] ?? 0);
  let last: number | null = null;
  const coords: string[] = [];
  prices.forEach((v, i) => {
    if (v == null) return;
    coords.push(`${x(i)},${y(v)}`);
    last = i;
  });
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[280px]">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={up ? GREEN : RED}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {last != null && prices[last] != null && (
        <circle cx={x(last)} cy={y(prices[last] as number)} r={2.5} fill={up ? GREEN : RED} />
      )}
    </svg>
  );
}

export default function TimelinePage() {
  const [symbols, setSymbols] = useState<Sym[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/advisor/timeline");
      setSymbols(data.symbols ?? []);
      setUpdatedAt(data.updatedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load timeline");
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
              <Activity className="w-5 h-5 text-[#888]" />
              <h1 className="text-lg font-semibold text-[#f5f5f5]">Stock timeline</h1>
            </div>
            <button
              onClick={load}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#888] bg-[#111111] border border-[#1f1f1f] hover:text-[#f5f5f5] transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
          <p className="text-[12px] text-[#666] mb-5 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Per-stock observation path (price · trend score · verdict) captured by the agent.
            {updatedAt && <span className="text-[#555]">Latest: {IST(updatedAt)} IST</span>}
          </p>

          {loading ? (
            <div className="grid gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[92px] w-full rounded-xl bg-[#111111]" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl bg-[#111111] border border-[#1f1f1f] p-4 text-[13px] text-[#ef4444]">
              {error}
            </div>
          ) : symbols.length === 0 ? (
            <div className="rounded-xl bg-[#111111] border border-[#1f1f1f] p-4">
              <h3 className="text-sm font-semibold text-[#f5f5f5] mb-1">No observations yet</h3>
              <p className="text-[12px] text-[#888]">
                The per-stock agent writes a row per holding each capture (pre-open / hourly /
                post-close). Once a session runs with a live token, timelines appear here.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {symbols.map((s) => (
                <div
                  key={s.symbol}
                  className="rounded-xl bg-[#111111] border border-[#1f1f1f] p-4 flex flex-col md:flex-row md:items-center gap-4"
                >
                  <div className="md:w-[190px] shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#f5f5f5]">{s.symbol}</span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ color: vColor(s.latest_verdict), background: vColor(s.latest_verdict) + "1a" }}
                      >
                        {s.latest_verdict ?? "—"}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#888] mt-1">
                      {s.latest_price != null ? `₹${s.latest_price}` : "—"}
                      {s.latest_score != null && (
                        <span className="ml-2" style={{ color: s.latest_score >= 0 ? GREEN : RED }}>
                          score {s.latest_score > 0 ? "+" : ""}
                          {s.latest_score}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#555] mt-0.5">
                      {s.count} obs · last {IST(s.latest_at)}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <Sparkline points={s.points} />
                    {/* verdict path — one dot per observation, oldest → newest */}
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {s.points.map((p, i) => (
                        <span
                          key={i}
                          title={`${IST(p.observed_at)} · ${p.verdict ?? "—"} · score ${p.trend_score ?? "—"}${p.phase ? " · " + p.phase : ""}`}
                          className="w-2 h-2 rounded-full"
                          style={{ background: vColor(p.verdict) }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
