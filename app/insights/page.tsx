"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Sidebar } from "@/components/layout/Sidebar";
import api from "@/lib/api";
import {
  Database, TrendingUp, Layers, Activity, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ─── types ───────────────────────────────────────────────────────────────────
type Insights = {
  scale: { sessions: number; trades: number; decisions: number; candles: number };
  daily: { day: string; decisions: number; trades: number; candles: number }[];
  signals: { signal: string; count: number }[];
  outcomes: { closed: number; wins: number; losses: number; winRate: number; avgR: number; totalPnl: number };
  rDistribution: { bucket: string; count: number }[];
  byRegime: { regime: string; trades: number; winRate: number; avgR: number }[];
  byTimeBucket: { bucket: string; trades: number; winRate: number }[];
  excursion: { avgMfe: number; avgMae: number; stopTooTight: number; gaveItBack: number; sampled: number };
};

const GREEN = "#22c55e", RED = "#ef4444", BLUE = "#3b82f6", AMBER = "#f59e0b", MUTE = "#3f3f46";
const INR = (n: number) =>
  (n < 0 ? "-" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDay = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

// ─── small building blocks ───────────────────────────────────────────────────
function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[#f5f5f5]">{title}</h3>
        {subtitle && <p className="text-[11px] text-[#555] mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tint }: { icon: React.ElementType; label: string; value: string; tint: string }) {
  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: tint }} />
        <span className="text-[11px] text-[#666] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-[#f5f5f5] tabular-nums">{value}</p>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: "#0d0d0d", border: "1px solid #1f1f1f", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#888" }, itemStyle: { color: "#f5f5f5" },
};

// ─── page ─────────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const router = useRouter();
  const { isConnected, hydrateFromStorage } = useAppStore();
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (!isConnected) router.push("/connect"); }, [isConnected, router]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get("/analytics/insights");
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);

  return (
    <div className="flex flex-col md:flex-row md:h-screen bg-[#0a0a0a] md:overflow-hidden pb-24 md:pb-0">
      <Sidebar />
      <main className="flex-1 md:overflow-auto p-5 md:p-8">
        <div className="max-w-[1200px] w-full mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[#f5f5f5]">Data Insights</h1>
            <p className="text-xs text-[#555] mt-1">What the brain has recorded across every session</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#888] bg-[#111111] border border-[#1f1f1f] hover:text-[#f5f5f5] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-sm rounded-xl p-4 mb-6">
            {error}
          </div>
        )}

        {!data && loading && <p className="text-sm text-[#555]">Loading…</p>}

        {data && (
          <div className="space-y-6">
            {/* Scale */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat icon={Layers} label="Sessions" value={data.scale.sessions.toLocaleString()} tint={BLUE} />
              <Stat icon={TrendingUp} label="Trades" value={data.scale.trades.toLocaleString()} tint={GREEN} />
              <Stat icon={Activity} label="Decisions" value={data.scale.decisions.toLocaleString()} tint={AMBER} />
              <Stat icon={Database} label="Candles" value={data.scale.candles.toLocaleString()} tint={MUTE} />
            </div>

            {/* Data captured per day */}
            <Panel title="Data captured per day" subtitle="Decisions & trades recorded each trading day">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.daily} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fill: "#555", fontSize: 11 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} labelFormatter={(l) => fmtDay(String(l))} />
                  <Bar yAxisId="l" dataKey="decisions" name="Decisions" fill={AMBER} radius={[3, 3, 0, 0]} />
                  <Bar yAxisId="r" dataKey="trades" name="Trades" fill={GREEN} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            {/* Outcomes strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat icon={TrendingUp} label="Win rate" value={`${data.outcomes.winRate.toFixed(1)}%`} tint={data.outcomes.winRate >= 50 ? GREEN : RED} />
              <Stat icon={Activity} label="Avg R (expectancy)" value={data.outcomes.avgR.toFixed(2)} tint={data.outcomes.avgR >= 0 ? GREEN : RED} />
              <Stat icon={TrendingUp} label="Total P&L" value={INR(data.outcomes.totalPnl)} tint={data.outcomes.totalPnl >= 0 ? GREEN : RED} />
              <Stat icon={Layers} label="Closed trades" value={`${data.outcomes.wins}W / ${data.outcomes.losses}L`} tint={BLUE} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* R distribution */}
              <Panel title="R-multiple distribution" subtitle="Outcome of each closed trade, in risk units">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.rDistribution} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <XAxis dataKey="bucket" tick={{ fill: "#555", fontSize: 11 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
                    <YAxis tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" name="Trades" radius={[3, 3, 0, 0]}>
                      {data.rDistribution.map((d, i) => (
                        <Cell key={i} fill={d.bucket.startsWith("-") || d.bucket === "≤-2" ? RED : GREEN} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              {/* Win rate by regime */}
              <Panel title="Win rate by regime" subtitle="Trades grouped by the regime at entry">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.byRegime} layout="vertical" margin={{ top: 4, right: 12, left: 20, bottom: 0 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                    <YAxis type="category" dataKey="regime" tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip {...tooltipStyle} formatter={((v: number, _n: unknown, p: { payload: { trades: number; avgR: number } }) => [`${v.toFixed(0)}%  (${p.payload.trades} trades, avg ${p.payload.avgR.toFixed(2)}R)`, "Win rate"]) as never} />
                    <Bar dataKey="winRate" name="Win rate" radius={[0, 3, 3, 0]}>
                      {data.byRegime.map((d, i) => (
                        <Cell key={i} fill={d.winRate >= 50 ? GREEN : d.winRate >= 30 ? AMBER : RED} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </div>

            {/* MFE/MAE stop quality */}
            <Panel title="Stop & target quality (MFE / MAE)" subtitle={`How far trades ran vs where they exited — ${data.excursion.sampled} trades with path data`}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-[11px] text-[#666] uppercase tracking-wide mb-1">Avg favorable (MFE)</p>
                  <p className="text-xl font-semibold tabular-nums" style={{ color: GREEN }}>+{data.excursion.avgMfe.toFixed(2)}R</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#666] uppercase tracking-wide mb-1">Avg adverse (MAE)</p>
                  <p className="text-xl font-semibold tabular-nums" style={{ color: RED }}>{data.excursion.avgMae.toFixed(2)}R</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#666] uppercase tracking-wide mb-1">Stops too tight</p>
                  <p className="text-xl font-semibold tabular-nums text-[#f5f5f5]">{data.excursion.stopTooTight}</p>
                  <p className="text-[10px] text-[#555] mt-0.5">losers that first ran ≥1R</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#666] uppercase tracking-wide mb-1">Gave it back</p>
                  <p className="text-xl font-semibold tabular-nums text-[#f5f5f5]">{data.excursion.gaveItBack}</p>
                  <p className="text-[10px] text-[#555] mt-0.5">reached ≥1.5R, exited &lt;0.5R</p>
                </div>
              </div>
            </Panel>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Win rate by time of day */}
              <Panel title="Win rate by time of day" subtitle="IST hour bucket at entry">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.byTimeBucket} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                    <XAxis dataKey="bucket" tick={{ fill: "#555", fontSize: 11 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip {...tooltipStyle} formatter={((v: number, _n: unknown, p: { payload: { trades: number } }) => [`${v.toFixed(0)}%  (${p.payload.trades} trades)`, "Win rate"]) as never} />
                    <Bar dataKey="winRate" name="Win rate" fill={BLUE} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              {/* Signal distribution */}
              <Panel title="Decision signals" subtitle="Every recorded brain decision, by action">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.signals} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <XAxis dataKey="signal" tick={{ fill: "#888", fontSize: 12 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
                    <YAxis tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" name="Decisions" radius={[3, 3, 0, 0]}>
                      {data.signals.map((s, i) => (
                        <Cell key={i} fill={s.signal === "BUY" ? GREEN : s.signal === "SELL" ? RED : MUTE} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
