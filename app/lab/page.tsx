"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useRefreshOnVisible } from "@/lib/useRefreshOnVisible";
import { Sidebar } from "@/components/layout/Sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { FlaskConical, RefreshCw } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { inr } from "@/lib/format";
import { StatTile } from "@/components/ui/stat-tile";
// [P-70] Strategy lab — ~54 pre-registered intraday PAPER variants, one ₹50k
// MIS book each. Every number is computed by the brain at 15:20 (lab_stats.py).

type Daily = {
  trade_date: string; strategy_id: string; n: number; net_inr: number; sum_gross_r: number; sum_cost_r: number;
  cum_n: number; cum_days: number; cum_net_inr: number; pf: number | null; win_rate: number | null;
  t_day: number | null; sprt_state: "running" | "killed" | "promoted"; mean_net_inr_day: number;
};
type Strategy = { id: string; arch: string; status: string };
type Payload = {
  date: string | null; strategies: Strategy[]; latest: Daily[];
  series: { trade_date: string; strategy_id: string; cum_net_inr: number }[];
  refusals: { strategy_id: string; reason: string; count: number }[];
};

const GREEN = "#22c55e", RED = "#ef4444", MUTE = "#71717a";
const LINE_COLORS = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#f472b6", "#71717a", "#52525b", "#3f3f46"];
const INR = (n: number) => inr(n, { signed: true });
const NUM = (n: number | null | undefined, d = 2) => (n == null ? "—" : Number(n).toFixed(d));
const MIN_TRADES = 300;

function Chip({ state }: { state: Daily["sprt_state"] }) {
  const style = state === "promoted" ? { color: GREEN, borderColor: GREEN } : state === "killed" ? { color: MUTE, borderColor: "#27272a" } : { color: "#a1a1aa", borderColor: "#3f3f46" };
  return <span className="px-1.5 py-0.5 rounded border text-xs" style={style}>{state}</span>;
}

export default function LabPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData((await api.get("/lab")).data as Payload); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load lab"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useRefreshOnVisible(load);

  const rows = useMemo(() => [...(data?.latest ?? [])].sort((a, b) => Number(b.cum_net_inr) - Number(a.cum_net_inr)), [data]);
  const refusals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.refusals ?? []) m.set(r.strategy_id, (m.get(r.strategy_id) ?? 0) + r.count);
    return m;
  }, [data]);
  const best = useMemo(() => rows.filter((r) => r.cum_n >= MIN_TRADES && r.pf != null)
    .sort((a, b) => Number(b.pf) - Number(a.pf))[0] ?? null, [rows]);
  const todayN = rows.reduce((a, r) => a + r.n, 0);
  const todayNet = rows.reduce((a, r) => a + Number(r.net_inr), 0);
  const positive = rows.filter((r) => Number(r.cum_net_inr) > 0).length;
  const promoted = rows.filter((r) => r.sprt_state === "promoted").length;

  const chart = useMemo(() => {
    const ids = [...rows.slice(0, 5).map((r) => r.strategy_id), ...rows.filter((r) => r.strategy_id.startsWith("CONF_")).map((r) => r.strategy_id)];
    const keep = Array.from(new Set(ids)).slice(0, 8);
    const byDate = new Map<string, Record<string, number | string>>();
    for (const s of data?.series ?? []) {
      if (!keep.includes(s.strategy_id)) continue;
      const row = byDate.get(s.trade_date) ?? { date: s.trade_date.slice(5) };
      row[s.strategy_id] = Number(s.cum_net_inr);
      byDate.set(s.trade_date, row);
    }
    return { keep, points: Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v) };
  }, [rows, data]);

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] text-[#f5f5f5] overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 md:p-8">
        <div className="max-w-[1100px] w-full mx-auto space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold flex items-center gap-2"><FlaskConical className="w-5 h-5 text-[#888]" /> Strategy lab</h1>
              <p className="text-xs text-[#8a8a8a] mt-1">
                {data?.strategies.length ?? 0} pre-registered intraday variants paper-trade the Nifty 200 in parallel, each in its own ₹50k MIS book, after all charges and slippage.
              </p>
            </div>
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#aaa] bg-[#111111] border border-[#1f1f1f] hover:text-[#f5f5f5] min-h-[40px] shrink-0">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {error && <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-sm rounded-xl p-4">{error}</div>}
          {!data && loading && <Skeleton className="h-64 w-full rounded-xl bg-[#111]" />}

          {data && !data.date && (
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6 text-[12px] text-[#8a8a8a]">No lab trades yet — the scoreboard fills in at 15:20 IST on the first trading day with a live token.</div>
          )}

          {data?.date && (
            <>
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 text-[12px] space-y-1">
                {best
                  ? <p>Best by net PF: <span className="font-semibold">{best.strategy_id}</span> — PF {NUM(best.pf)} over {best.cum_n} trades on {best.cum_days} days.</p>
                  : <p className="text-[#a1a1aa]">n not yet meaningful (need {MIN_TRADES} trades per variant before any PF is worth reading).</p>}
                <p className="text-[#8a8a8a]">Variants trade the same stocks at the same moments — the real sample is trading days, not trades.</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatTile label={`Trades ${data.date.slice(5)}`} value={todayN.toLocaleString("en-IN")} />
                <StatTile label="Net today (all books)" value={INR(todayNet)} color={todayNet >= 0 ? GREEN : RED} />
                <StatTile label="Variants net positive" value={`${positive} / ${rows.length}`} sub="cumulative, after costs" />
                <StatTile label="Promoted" value={String(promoted)} color={promoted ? GREEN : undefined} sub="SPRT + t ≥ 3.72 + PF ≥ 1.3 + ₹100/day" />
              </div>

              {chart.points.length > 1 && (
                <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
                  <p className="text-xs text-[#8a8a8a] mb-2">Cumulative net ₹ — top 5 variants + CONF baselines</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chart.points}>
                        <CartesianGrid stroke="#1f1f1f" vertical={false} />
                        <XAxis dataKey="date" tick={{ fill: "#8a8a8a", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#8a8a8a", fontSize: 11 }} width={60} />
                        <Tooltip contentStyle={{ background: "#111", border: "1px solid #27272a", fontSize: 11 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {chart.keep.map((id, i) => <Line key={id} dataKey={id} dot={false} strokeWidth={1.5} stroke={LINE_COLORS[i % LINE_COLORS.length]} />)}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl overflow-x-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-[#8a8a8a] text-left">
                    <tr className="border-b border-[#1f1f1f]">
                      {["Variant", "Today n", "Today net", "Cum n", "Days", "Cum net", "PF", "Win %", "Gross R / Cost R", "t (days)", "SPRT", "Refused"].map((h) => (
                        <th key={h} className="px-3 py-2 font-normal whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.strategy_id} className={`border-b border-[#161616] ${r.sprt_state === "killed" ? "text-[#8a8a8a] line-through" : ""}`}>
                        <td className="px-3 py-1.5 whitespace-nowrap">{r.strategy_id}</td>
                        <td className="px-3 py-1.5">{r.n}</td>
                        <td className="px-3 py-1.5" style={{ color: Number(r.net_inr) >= 0 ? GREEN : RED }}>{INR(Number(r.net_inr))}</td>
                        <td className="px-3 py-1.5">{r.cum_n}</td>
                        <td className="px-3 py-1.5">{r.cum_days}</td>
                        <td className="px-3 py-1.5" style={{ color: Number(r.cum_net_inr) >= 0 ? GREEN : RED }}>{INR(Number(r.cum_net_inr))}</td>
                        <td className="px-3 py-1.5">{NUM(r.pf)}</td>
                        <td className="px-3 py-1.5">{r.win_rate == null ? "—" : `${(Number(r.win_rate) * 100).toFixed(0)}%`}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{r.n ? `${NUM(r.sum_gross_r / r.n)} / ${NUM(r.sum_cost_r / r.n)}` : "—"}</td>
                        <td className="px-3 py-1.5">{NUM(r.t_day)}</td>
                        <td className="px-3 py-1.5 no-underline"><Chip state={r.sprt_state} /></td>
                        <td className="px-3 py-1.5">{refusals.get(r.strategy_id) ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
