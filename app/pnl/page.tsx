"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import api from "@/lib/api";
import { useRefreshOnVisible } from "@/lib/useRefreshOnVisible";
import { Sidebar } from "@/components/layout/Sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Wallet } from "lucide-react";

// [P-51] Real-money P&L — what the account actually made, day by day, and
// which of those trades followed the advisor. Bookkeeping, not a model score.

type Day = { date: string; pnl: number; value_open: number | null; value_close: number | null; nifty_pnl: number | null; buys_inr: number | null; sells_inr: number | null; fills: number; missing_prices: string[] | null };
type Decision = { kind: "followed_sell" | "followed_buy" | "own_sell" | "own_buy" | "ignored_call"; symbol: string; date: string; side: "buy" | "sell" | null; qty: number | null; price: number | null; call_run_date: string | null; call_verdict: string | null; rotation_from: string | null; impact_inr: number | null; impact_days: number | null; impact_asof: string | null };
type Mismatch = { symbol: string; zerodha: number; ours: number };
type Statement = { period_from: string; period_to: string; uploaded_at: string;
  summary: Record<string, number>;
  check_result: { sell_symbols: number; sell_matched: number; sell_mismatches: Mismatch[]; open_checked: boolean; open_mismatches: Mismatch[]; pending?: string[]; lag_from?: string | null; fills_on_record_from: string | null; covers_period: boolean } | null };
type Payload = { account: string; daily: Day[]; ledger: Decision[]; firstFillDate: string | null; statements: Statement[] };

const GREEN = "#22c55e", RED = "#ef4444", AMBER = "#f59e0b", MUTE = "#71717a", PURPLE = "#a78bfa";
const INR = (n: number, d = 0) => (n < 0 ? "−" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: d });
const SIGNED = (n: number) => (n > 0 ? "+" : "") + INR(n);
const COMPACT = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "") + "₹" + (Math.abs(n) >= 1000 ? String(Number((Math.abs(n) / 1000).toFixed(Math.abs(n) >= 100000 ? 0 : 2))) + "k" : Math.round(Math.abs(n)).toString());
const MONTH = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const KIND: Record<Decision["kind"], { label: string; color: string }> = {
  followed_sell: { label: "followed · sell", color: GREEN },
  followed_buy: { label: "followed · buy", color: GREEN },
  own_sell: { label: "own · sell", color: "#60a5fa" },
  own_buy: { label: "own · buy", color: "#60a5fa" },
  ignored_call: { label: "ignored call", color: AMBER },
};

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-[#0d0d0d] border border-[#1c1c1c] px-3 py-2.5">
      <p className="text-[10px] text-[#7a7a7a] uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5 leading-none" style={{ color: color ?? "#f5f5f5" }}>{value}</p>
      {sub && <p className="text-[10px] text-[#5a5a5a] mt-1 leading-tight">{sub}</p>}
    </div>
  );
}

export default function PnlPage() {
  const router = useRouter();
  const { isConnected, hydrated, hydrateFromStorage } = useAppStore();
  const [account, setAccount] = useState<"primary" | "natwar">("primary");
  const [data, setData] = useState<Payload | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "followed" | "ignored" | "own">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (hydrated && !isConnected) router.push("/connect"); }, [hydrated, isConnected, router]);

  const reqId = useRef(0);
  const shownAccount = useRef(account);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    if (shownAccount.current !== account) { shownAccount.current = account; setData(null); }
    setLoading(true); setError(null);
    try {
      const r = (await api.get(`/pnl?account=${account}`)).data as Payload;
      if (id !== reqId.current) return;
      setData(r);
      const last = r.daily.length ? r.daily[r.daily.length - 1].date.slice(0, 7) : null;
      setMonth((m) => (m && r.daily.some((d) => d.date.startsWith(m)) ? m : last));
    } catch (e) { if (id === reqId.current) setError(e instanceof Error ? e.message : "Failed to load P&L"); }
    finally { if (id === reqId.current) setLoading(false); }
  }, [account]);
  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);
  useRefreshOnVisible(load);

  const months = useMemo(() => {
    const m = new Map<string, { pnl: number; nifty: number; days: number; fills: number }>();
    for (const d of data?.daily ?? []) {
      const k = d.date.slice(0, 7);
      const x = m.get(k) ?? { pnl: 0, nifty: 0, days: 0, fills: 0 };
      x.pnl += d.pnl; x.nifty += d.nifty_pnl ?? 0; x.days += 1; x.fills += d.fills;
      m.set(k, x);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);

  const mDays = useMemo(() => (data?.daily ?? []).filter((d) => month && d.date.startsWith(month)), [data, month]);
  const mPnl = mDays.reduce((a, d) => a + d.pnl, 0);
  const mNifty = mDays.reduce((a, d) => a + (d.nifty_pnl ?? 0), 0);
  const best = mDays.reduce<Day | null>((a, d) => (!a || d.pnl > a.pnl ? d : a), null);
  const worst = mDays.reduce<Day | null>((a, d) => (!a || d.pnl < a.pnl ? d : a), null);
  const lastValue = data?.daily.length ? data.daily[data.daily.length - 1].value_close : null;
  const maxAbs = Math.max(1, ...mDays.map((d) => Math.abs(d.pnl)));

  // Calendar: Mon–Fri columns, one row per week of the month.
  const weeks = useMemo(() => {
    if (!month) return [] as (Day | null | "pad")[][];
    const byDate = new Map(mDays.map((d) => [d.date, d]));
    const lastDate = data?.daily.length ? data.daily[data.daily.length - 1].date : "";
    const first = new Date(month + "-01T00:00:00");
    const rows: (Day | null | "pad")[][] = [];
    let row: (Day | null | "pad")[] = [];
    for (let dt = new Date(first); dt.getMonth() === first.getMonth(); dt.setDate(dt.getDate() + 1)) {
      const wd = dt.getDay();
      if (wd === 0 || wd === 6) continue;
      if (row.length === 0) for (let i = 1; i < wd; i++) row.push("pad");
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      row.push(byDate.get(iso) ?? (iso > lastDate ? "pad" : null));
      if (wd === 5) { rows.push(row); row = []; }
    }
    if (row.length) { while (row.length < 5) row.push("pad"); rows.push(row); }
    return rows;
  }, [month, mDays, data]);

  const ledger = (data?.ledger ?? []).filter((r) =>
    filter === "all" ? true : filter === "followed" ? r.kind.startsWith("followed") : filter === "own" ? r.kind.startsWith("own") : r.kind === "ignored_call");
  const sumImpact = (pred: (r: Decision) => boolean) => (data?.ledger ?? []).filter(pred).reduce((a, r) => a + (r.impact_inr ?? 0), 0);
  const followedImpact = sumImpact((r) => r.kind.startsWith("followed"));
  const ignoredImpact = sumImpact((r) => r.kind === "ignored_call");
  const dayRow = day ? (data?.daily ?? []).find((d) => d.date === day) ?? null : null;
  const dayDecisions = day ? (data?.ledger ?? []).filter((r) => r.date === day && r.kind !== "ignored_call") : [];

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] text-[#f5f5f5] overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 md:p-8">
        <div className="max-w-[1100px] w-full mx-auto space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold flex items-center gap-2"><Wallet className="w-5 h-5 text-[#888]" /> Real-money P&amp;L</h1>
              <p className="text-xs text-[#8a8a8a] mt-1">What the account actually made, from Zerodha fills marked to each day&apos;s close — and which trades followed the advisor.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex rounded-lg border border-[#1f1f1f] bg-[#111111] overflow-hidden text-xs min-h-[40px]">
                {([["primary", "Kanaklata"], ["natwar", "Natwar"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => { setAccount(k); setDay(null); }}
                    className={`px-3 ${account === k ? "bg-[#1f1f1f] text-[#f5f5f5]" : "text-[#8a8a8a] hover:text-[#f5f5f5]"}`}>{label}</button>
                ))}
              </div>
              <button onClick={load} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#aaa] bg-[#111111] border border-[#1f1f1f] hover:text-[#f5f5f5] min-h-[40px]">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {error && <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-sm rounded-xl p-4">{error}</div>}
          {!data && loading && <Skeleton className="h-64 w-full rounded-xl bg-[#111]" />}

          {data && data.daily.length === 0 && (
            <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6 text-[12px] text-[#8a8a8a]">No P&amp;L computed yet for this account — it fills in after the next 15:35 post-close run.</div>
          )}

          {data && data.daily.length > 0 && month && (
            <>
              {account === "natwar" && data.firstFillDate && data.firstFillDate > data.daily[0].date && (
                <div className="p-3 rounded-lg border border-[#f59e0b]/20 bg-[#f59e0b]/5 text-[11px] text-[#f59e0b] leading-relaxed">
                  Fills for this account are on record only from {data.firstFillDate}. Days before that assume the holdings did not change — import his Console tradebook to make them exact.
                </div>
              )}

              {/* month chips */}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {months.map(([m, x]) => (
                  <button key={m} onClick={() => { setMonth(m); setDay(null); }}
                    className="shrink-0 rounded-lg border px-3 py-2 text-left min-w-[104px]"
                    style={{ borderColor: m === month ? "#3a3a3a" : "#1f1f1f", background: m === month ? "#161616" : "#111111" }}>
                    <p className="text-[10px] text-[#7a7a7a] uppercase tracking-wide">{MONTH(m)}</p>
                    <p className="text-[13px] font-semibold tabular-nums" style={{ color: x.pnl >= 0 ? GREEN : RED }}>{SIGNED(Math.round(x.pnl))}</p>
                  </button>
                ))}
              </div>

              {/* month tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <Tile label={`${MONTH(month)} P&L`} value={SIGNED(Math.round(mPnl))} sub={`${mDays.length} trading days · ${mDays.reduce((a, d) => a + d.fills, 0)} fills`} color={mPnl >= 0 ? GREEN : RED} />
                <Tile label="vs Nifty 50" value={SIGNED(Math.round(mPnl - mNifty))} sub={`Nifty on the same money: ${SIGNED(Math.round(mNifty))}`} color={mPnl - mNifty >= 0 ? GREEN : RED} />
                <Tile label="Best / worst day" value={best ? SIGNED(Math.round(best.pnl)) : "—"} sub={worst ? `worst ${SIGNED(Math.round(worst.pnl))} on ${worst.date.slice(5)}` : undefined} color={GREEN} />
                <Tile label="Account value" value={lastValue != null ? INR(Math.round(lastValue)) : "—"} sub="holdings at last close" />
              </div>

              {/* calendar */}
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
                <div className="grid grid-cols-5 gap-1.5 text-[10px] text-[#6a6a6a] uppercase tracking-wide mb-1.5">
                  {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => <span key={d}>{d}</span>)}
                </div>
                <div className="space-y-1.5">
                  {weeks.map((w, i) => (
                    <div key={i} className="grid grid-cols-5 gap-1.5">
                      {w.map((c, j) => {
                        if (c === "pad") return <div key={j} />;
                        if (c === null) return <div key={j} className="h-14 rounded-md bg-[#0b0b0b] border border-[#161616]" />;
                        const a = Math.min(1, Math.abs(c.pnl) / maxAbs);
                        const col = c.pnl >= 0 ? "34,197,94" : "239,68,68";
                        return (
                          <button key={j} onClick={() => setDay(day === c.date ? null : c.date)}
                            className="h-14 rounded-md border text-left px-1.5 py-1 flex flex-col justify-between hover:border-[#555]"
                            style={{ background: `rgba(${col},${0.08 + a * 0.45})`, borderColor: day === c.date ? "#e5e5e5" : "#1f1f1f" }}>
                            <span className="text-[10px] text-[#c5c5c5] tabular-nums">{Number(c.date.slice(8))}{c.fills > 0 && <span className="ml-1 text-[#f5f5f5]">•</span>}</span>
                            <span className="text-[10px] sm:text-[11px] font-semibold tabular-nums text-[#f5f5f5] truncate">{COMPACT(c.pnl)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[#5a5a5a] mt-2">Tap a day for its detail · • = trades that day · grey = market holiday or no data</p>

                {dayRow && (
                  <div className="mt-3 rounded-lg border border-[#262626] bg-[#0d0d0d] p-3">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
                      <span className="font-semibold text-[#f5f5f5]">{new Date(dayRow.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
                      <span className="tabular-nums" style={{ color: dayRow.pnl >= 0 ? GREEN : RED }}>{SIGNED(Math.round(dayRow.pnl))}</span>
                      {dayRow.nifty_pnl != null && <span className="text-[#8a8a8a] tabular-nums">Nifty {SIGNED(Math.round(dayRow.nifty_pnl))}</span>}
                      {dayRow.value_open != null && dayRow.value_close != null && <span className="text-[#8a8a8a] tabular-nums">value {INR(Math.round(dayRow.value_open))} → {INR(Math.round(dayRow.value_close))}</span>}
                      {(dayRow.buys_inr ?? 0) > 0 && <span className="text-[#8a8a8a] tabular-nums">bought {INR(Math.round(dayRow.buys_inr!))}</span>}
                      {(dayRow.sells_inr ?? 0) > 0 && <span className="text-[#8a8a8a] tabular-nums">sold {INR(Math.round(dayRow.sells_inr!))}</span>}
                    </div>
                    {dayDecisions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {dayDecisions.map((r, i) => (
                          <span key={i} className="text-[11px] px-2 py-1 rounded bg-[#111] border border-[#1f1f1f]">
                            <span style={{ color: r.side === "sell" ? RED : GREEN }}>{r.side}</span> <span className="text-[#e5e5e5] font-medium">{r.symbol}</span>
                            <span className="text-[#8a8a8a] tabular-nums"> {r.qty} @ {INR(r.price ?? 0, 2)}</span>
                            <span style={{ color: KIND[r.kind].color }}> · {KIND[r.kind].label}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {dayRow.missing_prices && <p className="text-[10px] text-[#f59e0b] mt-2">No close for {dayRow.missing_prices.join(", ")} — valued at the last known price.</p>}
                  </div>
                )}
              </div>

              {/* decision ledger */}
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-sm font-semibold">Decisions</h3>
                  <span className="text-[11px] text-[#6a6a6a]">every trade vs the call standing at the time · impact {`~10`} trading days later</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 my-3">
                  <Tile label="Followed calls" value={SIGNED(Math.round(followedImpact))} sub="+ = the trade beat staying put" color={followedImpact >= 0 ? GREEN : RED} />
                  <Tile label="Ignored sell calls" value={SIGNED(Math.round(ignoredImpact))} sub="+ = holding paid (ignoring was right)" color={ignoredImpact >= 0 ? GREEN : RED} />
                </div>
                <div className="flex gap-1.5 mb-2.5">
                  {(["all", "followed", "ignored", "own"] as const).map((f) => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={`text-[11px] px-2.5 py-1 rounded-md border ${filter === f ? "bg-[#1f1f1f] border-[#333] text-[#f5f5f5]" : "border-[#1f1f1f] text-[#8a8a8a]"}`}>{f}</button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {ledger.slice(0, 80).map((r, i) => (
                    <div key={i} className="grid grid-cols-[72px_1fr_auto] sm:grid-cols-[80px_110px_1fr_auto] items-center gap-2 text-[12px] rounded-md bg-[#0d0d0d] border border-[#1a1a1a] px-2.5 py-1.5">
                      <span className="text-[#8a8a8a] tabular-nums">{r.date.slice(5)}</span>
                      <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-wide" style={{ color: KIND[r.kind].color }}>{KIND[r.kind].label}</span>
                      <span className="min-w-0 truncate">
                        <span className="text-[#f5f5f5] font-medium">{r.symbol}</span>
                        <span className="text-[#8a8a8a] tabular-nums">
                          {r.kind === "ignored_call" ? ` ${r.call_verdict} ${r.qty} @ ${INR(r.price ?? 0, 2)}` : ` ${r.side} ${r.qty} @ ${INR(r.price ?? 0, 2)}`}
                          {r.rotation_from && <span style={{ color: PURPLE }}> ← from {r.rotation_from}</span>}
                          {r.call_verdict && r.kind !== "ignored_call" && <span> · call {r.call_verdict} {r.call_run_date?.slice(5)}</span>}
                        </span>
                      </span>
                      <span className="tabular-nums text-right" style={{ color: r.impact_inr == null ? MUTE : r.impact_inr >= 0 ? GREEN : RED }}>
                        {r.impact_inr == null ? "pending" : SIGNED(Math.round(r.impact_inr))}
                        {r.impact_inr != null && (r.impact_days ?? 0) < 10 && <span className="text-[10px] text-[#6a6a6a]"> ({r.impact_days}d)</span>}
                      </span>
                    </div>
                  ))}
                  {ledger.length === 0 && <p className="text-[12px] text-[#6a6a6a]">Nothing here yet.</p>}
                </div>
              </div>

              {/* Zerodha statements — authoritative totals + fills reconciliation */}
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-1">Zerodha statements</h3>
                <p className="text-[11px] text-[#6a6a6a] mb-3">Console P&amp;L exports, checked against our recorded fills: every sell value and every open quantity must match.</p>
                {data.statements.length === 0 && <p className="text-[12px] text-[#8a8a8a]">None uploaded — Console → Reports → P&amp;L → Equity, then scripts/import_pnl_statement.py.</p>}
                <div className="space-y-2.5">
                  {data.statements.map((st) => {
                    const c = st.check_result;
                    const bad = c ? c.sell_mismatches.length + c.open_mismatches.length : 0;
                    const ok = !!c && bad === 0;
                    const sm = st.summary;
                    return (
                      <div key={st.period_from + st.period_to} className="rounded-lg bg-[#0d0d0d] border border-[#1a1a1a] p-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-semibold text-[#f5f5f5]">{st.period_from} → {st.period_to}</span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                            style={{ color: !c ? MUTE : ok ? GREEN : RED, background: !c ? "#71717a1a" : ok ? "#22c55e1a" : "#ef44441a" }}>
                            {!c ? "not checked" : ok ? "✓ reconciled" : `✗ ${bad} differ`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px] tabular-nums">
                          {[["Realized", sm["Realized P&L"]], ["Unrealized", sm["Unrealized P&L"]], ["Charges", -(sm["Charges"] ?? 0)], ["Other debits", sm["Other Credit & Debit"]]].map(([k, v]) => (
                            <div key={k as string}><p className="text-[9px] text-[#6a6a6a] uppercase tracking-wide">{k}</p>
                              <p style={{ color: (v as number) >= 0 ? GREEN : RED }}>{v == null ? "—" : SIGNED(Math.round(v as number))}</p></div>
                          ))}
                        </div>
                        {c && (
                          <p className="text-[11px] text-[#8a8a8a] mt-2">
                            Sells: {c.sell_matched}/{c.sell_symbols} stocks match{c.open_checked ? ` · open quantities: ${c.open_mismatches.length === 0 ? "all match" : `${c.open_mismatches.length} differ`}` : ""}
                            {!c.covers_period && c.fills_on_record_from && <> · our fills start {c.fills_on_record_from}, so earlier trades are Zerodha&apos;s figures only</>}
                            {c.pending && c.pending.length > 0 && <> · <span style={{ color: AMBER }}>pending (Console not updated yet): {c.pending.join(", ")}</span></>}
                          </p>
                        )}
                        {c && [...c.sell_mismatches.map((m) => ({ ...m, k: "sell ₹" })), ...c.open_mismatches.map((m) => ({ ...m, k: "open qty" }))].map((m, i) => (
                          <p key={i} className="text-[11px] text-[#ef4444] tabular-nums">✗ {m.symbol} {m.k}: Zerodha {m.zerodha.toLocaleString("en-IN")} vs ours {m.ours.toLocaleString("en-IN")}</p>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* month table */}
              <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
                <h3 className="text-sm font-semibold mb-2">By month</h3>
                <div className="space-y-1 text-[12px] tabular-nums">
                  <div className="grid grid-cols-5 text-[10px] text-[#6a6a6a] uppercase tracking-wide"><span>Month</span><span className="text-right">P&amp;L</span><span className="text-right">Nifty</span><span className="text-right">vs Nifty</span><span className="text-right">Fills</span></div>
                  {months.map(([m, x]) => (
                    <div key={m} className="grid grid-cols-5">
                      <span className="text-[#c5c5c5]">{MONTH(m)}</span>
                      <span className="text-right" style={{ color: x.pnl >= 0 ? GREEN : RED }}>{SIGNED(Math.round(x.pnl))}</span>
                      <span className="text-right text-[#8a8a8a]">{SIGNED(Math.round(x.nifty))}</span>
                      <span className="text-right" style={{ color: x.pnl - x.nifty >= 0 ? GREEN : RED }}>{SIGNED(Math.round(x.pnl - x.nifty))}</span>
                      <span className="text-right text-[#8a8a8a]">{x.fills}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-[#5a5a5a] mt-3">Daily history starts 2026-08-26 (first stored closes). Before charges and taxes — Zerodha&apos;s charges are in the statements above.</p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
