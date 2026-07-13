"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { Sidebar } from "@/components/layout/Sidebar";
import api from "@/lib/api";
import {
  Database, TrendingUp, Layers, Activity, RefreshCw, Gauge,
  AlertTriangle, CheckCircle2, Info, XCircle, BookOpen,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, ReferenceLine, ScatterChart, Scatter, CartesianGrid, ZAxis,
} from "recharts";

// ─── types ───────────────────────────────────────────────────────────────────
type Finding = { text: string; tone: "bad" | "warn" | "good" | "info" };
type Insights = {
  scale: { sessions: number; trades: number; decisions: number; candles: number };
  verdict: { label: string; expectancyR: number; winRate: number; breakevenWinRate: number; totalPnl: number; closed: number; confidence: string };
  findings: Finding[];
  equityCurve: { i: number; date: string | null; cumPnl: number; cumR: number }[];
  daily: { day: string; decisions: number; trades: number; candles: number }[];
  signals: { signal: string; count: number }[];
  rDistribution: { bucket: string; count: number }[];
  byRegime: { regime: string; trades: number; winRate: number; avgR: number }[];
  byTimeBucket: { bucket: string; trades: number; winRate: number }[];
  excursion: { avgMfe: number; avgMae: number; stopTooTight: number; gaveItBack: number; sampled: number };
  mfeScatter: { mae: number; mfe: number; r: number; win: boolean }[];
  execution: { avgLatencyMs: number; samples: number };
  flags: { trendTells: { entrySignals: number; permitted: number; permitPct: number; linked: number; blockedLosers: number; blockedLoserPnl: number } };
  news: {
    total: number;
    byOutcome: { bucket: string; trades: number; wins: number; avgR: number | null; totalPnl: number }[];
    latest: { publishedAt: string; headline: string; symbols: string[]; sentimentLabel: string | null; sentimentScore: number | null; url: string }[];
  };
};

const GREEN = "#22c55e", RED = "#ef4444", BLUE = "#3b82f6", AMBER = "#f59e0b", MUTE = "#3f3f46";
const INR = (n: number) => (n < 0 ? "-" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const toneColor: Record<Finding["tone"], string> = { bad: RED, warn: AMBER, good: GREEN, info: BLUE };
const ToneIcon: Record<Finding["tone"], React.ElementType> = { bad: XCircle, warn: AlertTriangle, good: CheckCircle2, info: Info };

const tooltipStyle = {
  contentStyle: { background: "#0d0d0d", border: "1px solid #1f1f1f", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#888" }, itemStyle: { color: "#f5f5f5" },
};

// ─── building blocks ───────────────────────────────────────────────────────────
function SectionTitle({ children, hint }: { children: React.ReactNode; hint: string }) {
  return (
    <div className="flex items-baseline gap-3 mt-2 mb-3">
      <h2 className="text-[13px] font-semibold text-[#f5f5f5] uppercase tracking-wider">{children}</h2>
      <span className="text-[11px] text-[#555]">{hint}</span>
    </div>
  );
}
function Panel({ title, subtitle, children, className = "" }: { title?: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#111111] border border-[#1f1f1f] rounded-xl p-5 ${className}`}>
      {title && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[#f5f5f5]">{title}</h3>
          {subtitle && <p className="text-[11px] text-[#555] mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
function PlainEnglishGuide() {
  const [open, setOpen] = useState(true);
  const terms: { term: string; simple: string }[] = [
    { term: "What is this page?", simple: "Our trading robot practices with pretend money every market day. This page is its report card — every chart below answers one question: \"is the robot's way of trading actually any good?\"" },
    { term: "R (risk unit)", simple: "Before every trade the robot decides the most it's willing to lose — that amount is called 1R. A result of +2R means it won twice what it risked; −1R means it lost exactly what it planned to risk. Measuring in R makes big and small trades comparable." },
    { term: "Expectancy", simple: "The average result per trade, in R. Positive = on average each trade adds money; negative = each trade quietly leaks money. This single number matters more than how many trades win." },
    { term: "Win rate & break-even", simple: "How often trades end in profit. You do NOT need 50% — if winners are bigger than losers, even 40% wins can make money. The \"need X% to break even\" line shows the bar this strategy must clear." },
    { term: "Regime", simple: "The market's mood that day — trending up, trending down, or choppy/sideways. Grouping results by mood shows when the robot does well and when it should sit out." },
    { term: "Time of day", simple: "Same idea, but by clock: morning trades vs afternoon trades. Markets behave differently right after opening than mid-day." },
    { term: "MFE / MAE", simple: "For each trade: the best it ever looked (MFE) and the worst it ever looked (MAE) before closing. If trades often look great but end small, targets are too timid; if they look terrible before recovering, stops are too tight." },
    { term: "News sentiment", simple: "Headlines are scored positive or negative. This section checks whether the news mood before a trade actually predicted how it went — or whether the news is just noise." },
    { term: "Small sample warning", simple: "With only a handful of trades, results are mostly luck — like judging a coin after 5 flips. Confidence grows with the trade count shown in the banner below." },
  ];
  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-2xl mb-6 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-[#161616] transition-colors">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#3b82f6]" />
          <span className="text-sm font-semibold text-[#f5f5f5]">New here? What all of this means, in plain English</span>
        </div>
        <span className="text-[11px] text-[#666]">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {terms.map((t) => (
            <div key={t.term} className="bg-[#0d0d0d] border border-[#1f1f1f] rounded-xl p-4">
              <p className="text-[12px] font-semibold text-[#3b82f6] mb-1">{t.term}</p>
              <p className="text-[12px] text-[#999] leading-relaxed">{t.simple}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tint, sub }: { icon: React.ElementType; label: string; value: string; tint: string; sub?: string }) {
  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color: tint }} />
        <span className="text-[11px] text-[#666] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-[#f5f5f5] tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-[#555] mt-1">{sub}</p>}
    </div>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const router = useRouter();
  const { isConnected, hydrateFromStorage } = useAppStore();
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [curveMode, setCurveMode] = useState<"R" | "₹">("R");

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (!isConnected) router.push("/connect"); }, [isConnected, router]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData((await api.get("/analytics/insights")).data); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load insights"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);

  const v = data?.verdict;
  const verdictTone: Finding["tone"] = !v ? "info" : v.expectancyR > 0.05 ? "good" : v.expectancyR >= -0.05 ? "warn" : "bad";

  return (
    <div className="flex flex-col md:flex-row md:h-screen bg-[#0a0a0a] md:overflow-hidden pb-24 md:pb-0">
      <Sidebar />
      <main className="flex-1 md:overflow-auto p-5 md:p-8">
        <div className="max-w-[1200px] w-full mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-[#f5f5f5]">Data Insights</h1>
              <p className="text-xs text-[#555] mt-1">What the brain has recorded — and what it means</p>
            </div>
            <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#888] bg-[#111111] border border-[#1f1f1f] hover:text-[#f5f5f5] transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          <PlainEnglishGuide />

          {error && <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-sm rounded-xl p-4 mb-6">{error}</div>}
          {!data && loading && <p className="text-sm text-[#555]">Loading…</p>}

          {data && v && (
            <div className="space-y-8">
              {/* ── VERDICT HERO ─────────────────────────────────────────── */}
              <div className="rounded-2xl border p-6" style={{ borderColor: `${toneColor[verdictTone]}55`, background: `linear-gradient(135deg, ${toneColor[verdictTone]}14, transparent 60%)` }}>
                <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                  <div className="lg:w-72 shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Gauge className="w-4 h-4" style={{ color: toneColor[verdictTone] }} />
                      <span className="text-[11px] text-[#888] uppercase tracking-wider">Is this working?</span>
                    </div>
                    <p className="text-3xl font-bold tracking-tight" style={{ color: toneColor[verdictTone] }}>{v.label}</p>
                    <p className="text-[11px] text-[#666] mt-2">{v.closed} closed trades · {v.confidence} confidence at this sample size</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 flex-1">
                    <div>
                      <p className="text-[11px] text-[#666] uppercase tracking-wide mb-1">Expectancy</p>
                      <p className="text-2xl font-semibold tabular-nums" style={{ color: v.expectancyR >= 0 ? GREEN : RED }}>{v.expectancyR >= 0 ? "+" : ""}{v.expectancyR.toFixed(2)}R</p>
                      <p className="text-[10px] text-[#555] mt-0.5">per trade</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#666] uppercase tracking-wide mb-1">Win rate</p>
                      <p className="text-2xl font-semibold tabular-nums text-[#f5f5f5]">{v.winRate.toFixed(0)}%</p>
                      <p className="text-[10px] mt-0.5" style={{ color: v.winRate >= v.breakevenWinRate ? GREEN : RED }}>need {v.breakevenWinRate.toFixed(0)}% to break even</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#666] uppercase tracking-wide mb-1">Total P&L</p>
                      <p className="text-2xl font-semibold tabular-nums" style={{ color: v.totalPnl >= 0 ? GREEN : RED }}>{INR(v.totalPnl)}</p>
                      <p className="text-[10px] text-[#555] mt-0.5">paper</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-[#666] uppercase tracking-wide mb-1">Avg latency</p>
                      <p className="text-2xl font-semibold tabular-nums text-[#f5f5f5]">{data.execution.samples ? `${(data.execution.avgLatencyMs / 1000).toFixed(1)}s` : "—"}</p>
                      <p className="text-[10px] text-[#555] mt-0.5">decision → order</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── KEY FINDINGS ─────────────────────────────────────────── */}
              {data.findings.length > 0 && (
                <div>
                  <SectionTitle hint="auto-generated from the data">Key findings</SectionTitle>
                  <div className="grid gap-2.5">
                    {data.findings.map((f, i) => {
                      const Ico = ToneIcon[f.tone];
                      return (
                        <div key={i} className="flex items-start gap-3 bg-[#111111] border border-[#1f1f1f] rounded-lg px-4 py-3">
                          <Ico className="w-4 h-4 mt-0.5 shrink-0" style={{ color: toneColor[f.tone] }} />
                          <p className="text-[13px] text-[#d4d4d4] leading-relaxed">{f.text}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── IS THE STRATEGY WORKING? ─────────────────────────────── */}
              <div>
                <SectionTitle hint="cumulative trajectory + outcome shape">Is the strategy working?</SectionTitle>
                <Panel className="mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#f5f5f5]">Cumulative {curveMode === "R" ? "R" : "P&L"} curve</h3>
                      <p className="text-[11px] text-[#555] mt-0.5">Every closed trade in sequence — the equity trajectory</p>
                    </div>
                    <div className="flex rounded-lg overflow-hidden border border-[#1f1f1f]">
                      {(["R", "₹"] as const).map((m) => (
                        <button key={m} onClick={() => setCurveMode(m)} className={`px-3 py-1.5 text-xs ${curveMode === m ? "bg-[#1f1f1f] text-[#f5f5f5]" : "bg-[#0d0d0d] text-[#555]"}`}>{m}</button>
                      ))}
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={data.equityCurve} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={BLUE} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={BLUE} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" vertical={false} />
                      <XAxis dataKey="i" tick={{ fill: "#555", fontSize: 11 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
                      <YAxis tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <ReferenceLine y={0} stroke="#3f3f46" strokeDasharray="2 2" />
                      <Tooltip {...tooltipStyle} formatter={((val: number) => [curveMode === "R" ? `${val.toFixed(2)}R` : INR(val), `Cumulative ${curveMode}`]) as never} labelFormatter={(l) => `Trade #${l}`} />
                      <Area type="monotone" dataKey={curveMode === "R" ? "cumR" : "cumPnl"} stroke={BLUE} strokeWidth={2} fill="url(#eq)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </Panel>
                <Panel title="R-multiple distribution" subtitle="Outcome of each closed trade, in risk units">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={data.rDistribution} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                      <XAxis dataKey="bucket" tick={{ fill: "#555", fontSize: 11 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
                      <YAxis tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip {...tooltipStyle} />
                      <Bar dataKey="count" name="Trades" radius={[3, 3, 0, 0]}>
                        {data.rDistribution.map((d, i) => <Cell key={i} fill={d.bucket.startsWith("-") || d.bucket === "≤-2" ? RED : GREEN} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
              </div>

              {/* ── WHERE DOES IT WIN / LOSE? ────────────────────────────── */}
              <div>
                <SectionTitle hint="break the edge down by condition">Where does it win / lose?</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Panel title="Win rate by regime" subtitle="Grouped by regime at entry (avg R in tooltip)">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.byRegime} layout="vertical" margin={{ top: 4, right: 12, left: 20, bottom: 0 }}>
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                        <YAxis type="category" dataKey="regime" tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                        <Tooltip {...tooltipStyle} formatter={((val: number, _n: unknown, p: { payload: { trades: number; avgR: number } }) => [`${val.toFixed(0)}%  (${p.payload.trades} trades, avg ${p.payload.avgR.toFixed(2)}R)`, "Win rate"]) as never} />
                        <Bar dataKey="winRate" name="Win rate" radius={[0, 3, 3, 0]}>
                          {data.byRegime.map((d, i) => <Cell key={i} fill={d.winRate >= 50 ? GREEN : d.winRate >= 30 ? AMBER : RED} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                  <Panel title="Win rate by time of day" subtitle="IST hour bucket at entry">
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={data.byTimeBucket} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <XAxis dataKey="bucket" tick={{ fill: "#555", fontSize: 11 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                        <Tooltip {...tooltipStyle} formatter={((val: number, _n: unknown, p: { payload: { trades: number } }) => [`${val.toFixed(0)}%  (${p.payload.trades} trades)`, "Win rate"]) as never} />
                        <Bar dataKey="winRate" name="Win rate" fill={BLUE} radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>
              </div>

              {/* ── EXECUTION & FLAG VALIDATION ──────────────────────────── */}
              <div>
                <SectionTitle hint="fill quality + what the dark flags would do">Execution & flag validation</SectionTitle>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Panel title="Stop & target quality (MFE / MAE)" subtitle={data.mfeScatter.length ? `Each trade: how far it ran (MFE) vs where it exited — ${data.mfeScatter.length} with path data` : "Path data starts populating from the next session"}>
                    {data.mfeScatter.length ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                          <XAxis type="number" dataKey="mae" name="MAE" unit="R" tick={{ fill: "#555", fontSize: 11 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
                          <YAxis type="number" dataKey="mfe" name="MFE" unit="R" tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <ZAxis range={[40, 40]} />
                          <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3", stroke: "#333" }} formatter={((val: number) => `${val.toFixed(2)}R`) as never} />
                          <Scatter data={data.mfeScatter} name="Trades">
                            {data.mfeScatter.map((d, i) => <Cell key={i} fill={d.win ? GREEN : RED} fillOpacity={0.7} />)}
                          </Scatter>
                        </ScatterChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[180px] flex flex-col items-center justify-center text-center gap-2">
                        <Layers className="w-6 h-6 text-[#333]" />
                        <p className="text-[12px] text-[#555] max-w-[240px]">Every trade&apos;s favorable/adverse path is now recorded — the scatter fills in after the next live session.</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[#1f1f1f]">
                      <div><p className="text-[10px] text-[#666] uppercase mb-0.5">Stops too tight</p><p className="text-lg font-semibold text-[#f5f5f5] tabular-nums">{data.excursion.stopTooTight}</p></div>
                      <div><p className="text-[10px] text-[#666] uppercase mb-0.5">Gave it back</p><p className="text-lg font-semibold text-[#f5f5f5] tabular-nums">{data.excursion.gaveItBack}</p></div>
                    </div>
                  </Panel>

                  <Panel title="Trend-tells gate (dark flag)" subtitle="What the entry gate would do if enabled">
                    <div className="flex items-end gap-4 mb-4">
                      <div>
                        <p className="text-4xl font-bold tabular-nums" style={{ color: AMBER }}>{data.flags.trendTells.permitPct.toFixed(0)}%</p>
                        <p className="text-[11px] text-[#666] mt-1">of {data.flags.trendTells.entrySignals.toLocaleString()} entry signals permitted</p>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-[#1f1f1f] overflow-hidden mb-4">
                      <div className="h-full rounded-full" style={{ width: `${data.flags.trendTells.permitPct}%`, background: AMBER }} />
                    </div>
                    <p className="text-[12px] text-[#888] leading-relaxed">
                      Would cut <span className="text-[#f5f5f5] font-medium">{(100 - data.flags.trendTells.permitPct).toFixed(0)}%</span> of entries.
                      {data.flags.trendTells.linked > 0
                        ? <> So far it would have blocked <span className="text-[#f5f5f5] font-medium">{data.flags.trendTells.blockedLosers}</span> losing trades ({INR(data.flags.trendTells.blockedLoserPnl)}).</>
                        : <> Win/loss impact fills in as new trades link to their decisions.</>}
                    </p>
                  </Panel>
                </div>
              </div>

              {/* ── NEWS CONTEXT ─────────────────────────────────────────── */}
              <div>
                <SectionTitle hint="does the news around a trade move its outcome?">News context</SectionTitle>
                {data.news.total === 0 ? (
                  <Panel title="No news captured yet" subtitle="financial-news collector">
                    <p className="text-[12px] text-[#888] leading-relaxed">
                      The news collector is wired but idle. Set <span className="text-[#f5f5f5] font-mono">NEWS_ENABLED=true</span> (key already set) and the next session begins tagging each decision with the news sentiment around it — then this fills in with sentiment-vs-outcome and recent headlines.
                    </p>
                  </Panel>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Panel title="Outcome by pre-entry sentiment" subtitle="freshest news within 24h before entry">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-[#555] border-b border-[#1a1a1a]">
                              <th className="text-left py-2">Sentiment</th>
                              <th className="text-right py-2">Trades</th>
                              <th className="text-right py-2">Win%</th>
                              <th className="text-right py-2">Avg R</th>
                              <th className="text-right py-2">P&L</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.news.byOutcome.map((r) => {
                              const c = r.bucket === "positive" ? GREEN : r.bucket === "negative" ? RED : r.bucket === "none" ? MUTE : AMBER;
                              return (
                                <tr key={r.bucket} className="border-b border-[#141414]">
                                  <td className="py-2 font-medium capitalize" style={{ color: c }}>{r.bucket}</td>
                                  <td className="py-2 text-right text-[#888] tabular-nums">{r.trades}</td>
                                  <td className="py-2 text-right text-[#888] tabular-nums">{r.trades ? Math.round((r.wins / r.trades) * 100) : 0}%</td>
                                  <td className="py-2 text-right tabular-nums" style={{ color: (r.avgR ?? 0) >= 0 ? GREEN : RED }}>{r.avgR == null ? "—" : r.avgR.toFixed(2)}</td>
                                  <td className="py-2 text-right tabular-nums" style={{ color: r.totalPnl >= 0 ? GREEN : RED }}>{INR(r.totalPnl)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-[#666] mt-3 leading-relaxed">&quot;none&quot; = no tagged news in the 24h before entry. Causal: only news published before the decision counts.</p>
                    </Panel>
                    <Panel title="Latest headlines" subtitle={`${data.news.total.toLocaleString()} stored`}>
                      <ul className="space-y-2.5">
                        {data.news.latest.map((n, i) => {
                          const c = n.sentimentLabel === "positive" ? GREEN : n.sentimentLabel === "negative" ? RED : AMBER;
                          return (
                            <li key={i} className="text-[12px] leading-snug">
                              <div className="flex items-start gap-2">
                                <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c }} />
                                <div className="min-w-0">
                                  <p className="text-[#ccc] truncate">{n.headline ?? "—"}</p>
                                  <p className="text-[10px] text-[#555] mt-0.5">
                                    {n.symbols.slice(0, 4).join(", ") || "macro"}
                                    {n.publishedAt ? " · " + new Date(n.publishedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : ""}
                                    {n.sentimentScore != null ? " · " + n.sentimentScore.toFixed(2) : ""}
                                  </p>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </Panel>
                  </div>
                )}
              </div>

              {/* ── DATASET HEALTH ───────────────────────────────────────── */}
              <div>
                <SectionTitle hint="are we capturing what we need?">Dataset health</SectionTitle>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <Stat icon={Layers} label="Sessions" value={data.scale.sessions.toLocaleString()} tint={BLUE} />
                  <Stat icon={TrendingUp} label="Trades" value={data.scale.trades.toLocaleString()} tint={GREEN} />
                  <Stat icon={Activity} label="Decisions" value={data.scale.decisions.toLocaleString()} tint={AMBER} />
                  <Stat icon={Database} label="Candles" value={data.scale.candles.toLocaleString()} tint={MUTE} sub={data.scale.candles === 0 ? "archive starts next session" : undefined} />
                </div>
                <Panel title="Data captured per day" subtitle="Decisions & trades recorded each trading day">
                  <ResponsiveContainer width="100%" height={220}>
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
                <div className="mt-4">
                  <Panel title="Decision signals" subtitle="Every recorded brain decision, by action">
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={data.signals} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                        <XAxis dataKey="signal" tick={{ fill: "#888", fontSize: 12 }} axisLine={{ stroke: "#1f1f1f" }} tickLine={false} />
                        <YAxis tick={{ fill: "#555", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip {...tooltipStyle} />
                        <Bar dataKey="count" name="Decisions" radius={[3, 3, 0, 0]}>
                          {data.signals.map((s, i) => <Cell key={i} fill={s.signal === "BUY" ? GREEN : s.signal === "SELL" ? RED : MUTE} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Panel>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
