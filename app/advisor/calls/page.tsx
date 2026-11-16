"use client";

// [P-60] Every advisor call re-scored each trading day for 60 days: pick a
// day, see how each call has done against the Nifty since, and read the
// lessons (attributes whose calls go wrong more often). Read-only.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { useAppStore } from "@/lib/store";
import api from "@/lib/api";
import { Sidebar } from "@/components/layout/Sidebar";
import { CallPath } from "@/components/CallPath";
import { pct, verdictSentence, type Call } from "@/lib/calls";

const GREEN = "#22c55e", RED = "#ef4444";
const INR = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

type Day = { run_date: string; n: number; scored_days: number };
type Lesson = { text: string };
type Pop = { overall: { n: number; hit_pct: number | null }; lessons: Lesson[]; strengths: Lesson[] };
type Lessons = { asof: string; populations: Record<string, Pop> } | null;
type Score = { by_source: Record<string, Record<string, { n: number; hit_pct: number; mean_alpha_pct: number }>> } | null;
type Chip = "primary" | "natwar" | "universe";

const SOURCES: [string, string][] = [["advice", "Kanaklata"], ["natwar", "Natwar"], ["target", "Buy targets"], ["universe", "Nifty 500 scan"]];
const CPS = ["5", "10", "20", "40", "60"];

export default function CallsPage() {
  const router = useRouter();
  const { isConnected, hydrated, hydrateFromStorage } = useAppStore();
  const [days, setDays] = useState<Day[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [chip, setChip] = useState<Chip>("primary");
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lessons>(null);
  const [score, setScore] = useState<Score>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (hydrated && !isConnected) router.push("/connect"); }, [hydrated, isConnected, router]);

  useEffect(() => {
    if (!isConnected) return;
    api.get("/advisor/calls/days").then((r) => {
      const d = (r.data.days ?? []) as Day[];
      setDays(d);
      setDay((d.find((x) => x.scored_days >= 5) ?? d[0])?.run_date ?? null);
    }).catch((e) => setError(e instanceof Error ? e.message : "Failed to load days"));
    api.get("/advisor").then((r) => { setLessons(r.data.lessons ?? null); setScore(r.data.scorecard ?? null); }).catch(() => {});
  }, [isConnected]);

  const population = chip === "universe" ? "universe" : "holdings";
  const reqId = useRef(0);
  const load = useCallback(async () => {
    if (!day) return;
    const id = ++reqId.current;
    setCalls(null); setOpen(null);
    try {
      const r = await api.get(`/advisor/calls?date=${day}&population=${population}`);
      if (id === reqId.current) setCalls(r.data.calls ?? []);
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : "Failed to load calls"); }
  }, [day, population]);
  useEffect(() => { load(); }, [load]);

  const shown = (calls ?? []).filter((c) => chip === "universe" || c.account === chip);
  const pops = lessons ? Object.entries(lessons.populations) : [];

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] text-[#f5f5f5] overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 md:p-8">
        <div className="max-w-[1100px] w-full mx-auto space-y-5">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2"><ListChecks className="w-5 h-5 text-[#888]" /> How the calls are doing</h1>
            <p className="text-xs text-[#8a8a8a] mt-1">Every call is checked each trading day for 60 days against the Nifty. Right means the call is beating doing the opposite.</p>
          </div>
          {error && <p className="text-sm text-[#ef4444]">{error}</p>}

          <section data-testid="scorecard" className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 overflow-x-auto">
            <p className="text-xs text-[#8a8a8a] mb-2">Share of calls that were right, after 5 to 60 trading days</p>
            <table className="text-xs w-full min-w-[480px]">
              <thead><tr className="text-[#666]"><th className="text-left font-normal py-1">Calls</th>
                {CPS.map((c) => <th key={c} className="text-right font-normal">day {c}</th>)}</tr></thead>
              <tbody>{SOURCES.map(([src, label]) => (
                <tr key={src} className="border-t border-[#1a1a1a]"><td className="py-1.5 text-[#ccc]">{label}</td>
                  {CPS.map((cp) => { const v = score?.by_source?.[src]?.[cp]; return (
                    <td key={cp} className="text-right tabular-nums" title={v ? `${v.n} calls, average ${pct(v.mean_alpha_pct)} vs Nifty` : ""}>
                      {v ? <span style={{ color: v.hit_pct >= 50 ? GREEN : RED }}>{v.hit_pct.toFixed(1)}%<span className="text-[#555]"> ({v.n})</span></span> : <span className="text-[#444]">—</span>}
                    </td>); })}
                </tr>))}</tbody>
            </table>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {days.slice(0, 15).map((d) => (
                <button key={d.run_date} onClick={() => setDay(d.run_date)}
                  className={`px-3 min-h-[36px] rounded-lg border text-xs ${day === d.run_date ? "border-[#3a3a3a] bg-[#1f1f1f]" : "border-[#1f1f1f] text-[#8a8a8a]"}`}>{d.run_date}</button>
              ))}
            </div>
            <div className="flex rounded-lg border border-[#1f1f1f] bg-[#111111] overflow-hidden text-xs w-fit">
              {([["primary", "Kanaklata"], ["natwar", "Natwar"], ["universe", "Nifty 500 scan"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setChip(k)}
                  className={`px-3 min-h-[36px] ${chip === k ? "bg-[#1f1f1f] text-[#f5f5f5]" : "text-[#8a8a8a]"}`}>{label}</button>
              ))}
            </div>
            {calls === null ? <p className="text-sm text-[#666]">Loading…</p>
              : shown.length === 0 ? <p className="text-sm text-[#8a8a8a]">No scored days yet — scores start the morning after the call.</p>
              : <ul className="space-y-2">{shown.map((c) => {
                  const k = `${c.source}|${c.account}|${c.symbol}`;
                  return (
                    <li key={k} className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-3">
                      <button className="w-full text-left" onClick={() => setOpen(open === k ? null : k)}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium">{c.symbol} <span className="text-[#8a8a8a] font-normal">{c.source === "target" ? "buy target" : c.call}{c.entry != null ? ` at ${INR(c.entry)}` : ""}</span></span>
                          <span className="tabular-nums text-sm" style={{ color: c.signed_alpha_pct >= 0 ? GREEN : RED }}>{pct(c.signed_alpha_pct)}</span>
                        </div>
                        <p className="text-xs text-[#aaa] mt-1">{verdictSentence(c, day ?? "")}</p>
                      </button>
                      {open === k && (
                        <div className="mt-3 flex flex-col sm:flex-row gap-4">
                          <CallPath path={c.path} />
                          <div className="text-xs text-[#8a8a8a] space-y-1">
                            <p>Best point {pct(c.mfe_pct)}. Looked wrong for the first {c.early_wrong_days} day{c.early_wrong_days === 1 ? "" : "s"}.</p>
                            <p>On the day: market {c.context.regime ?? "—"}, trigger {c.context.trigger_type ?? "—"}, confidence {c.context.confidence ?? "—"}.</p>
                            {c.target && <p>Named buy: {c.target}.</p>}
                            {c.context.reasons.map((r, i) => <p key={i}>· {r}</p>)}
                          </div>
                        </div>
                      )}
                    </li>);
                })}</ul>}
          </section>

          <section data-testid="lessons" className="rounded-xl border border-[#1f1f1f] bg-[#111111] p-4 space-y-2">
            <p className="text-sm font-medium">Lessons{lessons ? <span className="text-xs text-[#666] font-normal"> · checked {lessons.asof}, at day 20</span> : null}</p>
            {pops.every(([, p]) => !p.lessons.length) && <p className="text-xs text-[#8a8a8a]">Nothing fires yet — a lesson needs 30 scored calls in one bucket.</p>}
            {pops.map(([name, p]) => (
              <div key={name} className="text-xs space-y-1">
                {p.lessons.map((l, i) => <p key={i} className="text-[#f59e0b]">{l.text}</p>)}
                {p.strengths.map((l, i) => <p key={`s${i}`} className="text-[#666]">Strength: {l.text}</p>)}
                <p className="text-[#555]">{name === "holdings" ? "Your holdings" : "Nifty 500 scan"}: {p.overall.n} calls reached day 20{p.overall.hit_pct != null ? `, ${p.overall.hit_pct}% right` : ""}.</p>
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
