"use client";

// Command center — the one-glance system view (UI god-mode task 3).
// Answers "what's happening and what should I do" without visiting
// /trading, /portfolio and /advisor separately: paper-engine state + live
// daily risk, real portfolio health, and the advisor's single top action.
// Reuses RiskMeter (task 1) and BrainStatus.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import api from "@/lib/api";
import { useRefreshOnVisible } from "@/lib/useRefreshOnVisible";
import { Sidebar } from "@/components/layout/Sidebar";
import { BrainStatus } from "@/components/BrainStatus";
import { RiskMeter } from "@/components/RiskMeter";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, History } from "lucide-react";
import { AttentionList, FlaggedCard, HouseholdCard, MixCard, MonthCard, RiskSourceCard, TaxCard, VsNiftyChart, type MonthVsNifty } from "@/components/HomeWidgets";
import { attentionItems, flaggedSplit, shortDate, type HouseholdBook } from "@/lib/attention";

import { inr } from "@/lib/format";
import { labPf, PF_START, PF_TARGET, MIN_TRADES, type LabPf } from "@/lib/labPf";
const GREEN = "#9be15d", RED = "#f08a76", AMBER = "#d9b84a", BLUE = "#b9ec8a", MUTE = "#8b968e";
const INR = (n: number) => inr(n);

type Trade = { status: string; pnl: number | null };
type Holding = { quantity: number; average_price: number; last_price: number; day_change: number };
type Advice = {
  symbol: string; verdict: string; trend_score: number; pnl_percent: number | null;
  quantity: number; last_price: number;
  rotation_target_symbol?: string | null;
};
type PnlData = {
  daily: { date: string; pnl: number; nifty_pnl: number | null }[];
  ledger: { kind: string; impact_inr: number | null }[];
};
type PortfolioRisk = {
  concentration_flags: string[];
  tax_loss_harvest: { symbol: string }[];
  harvestable_loss_inr: number;
  correlation?: { effective_bets: number | null; names_covered: number } | null;
};

const VERDICT_META: Record<string, { color: string; label: string }> = {
  SELL:           { color: RED,   label: "Sell" },
  SELL_ON_BOUNCE: { color: AMBER, label: "Sell on bounce" },
  TRIM:           { color: BLUE,  label: "Trim" },
  HOLD:           { color: GREEN, label: "Hold" },
};

// Label-over-value pill used in the header status row.
function Chip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="chip inline-flex shrink-0 flex-col gap-0.5 px-4 py-2">
      <span className="text-xs text-[#8b968e]">{label}</span>
      <span className="text-sm text-[#eef2ee]">{children}</span>
    </span>
  );
}

// Profit factor on a 0–2 half-dial with the 1.3 go/no-go target ticked.
function PfGauge({ pf, color }: { pf: number | null; color: string }) {
  const pt = (v: number, r: number) => {
    const a = (Math.PI * Math.min(2, Math.max(0, v))) / 2;
    return [110 - r * Math.cos(a), 110 - r * Math.sin(a)].map((n) => n.toFixed(1));
  };
  const [x, y] = pt(pf ?? 0, 90);
  const [t1x, t1y] = pt(1.3, 78), [t2x, t2y] = pt(1.3, 100);
  return (
    <div className="relative w-[220px] h-[128px] shrink-0">
      <svg role="img" aria-label={`Profit factor ${pf == null ? "unknown" : pf.toFixed(2)} against a 1.3 target, on a 0 to 2 scale`}
           width="220" height="128" viewBox="0 0 220 128" className="absolute inset-0">
        <path d="M 20 110 A 90 90 0 0 1 200 110" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="10" strokeLinecap="round" />
        {pf != null && pf > 0 && <path d={`M 20 110 A 90 90 0 0 1 ${x} ${y}`} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" />}
        <line x1={t1x} y1={t1y} x2={t2x} y2={t2y} stroke="#b9ec8a" strokeWidth="2" />
      </svg>
      <div className="absolute inset-x-0 top-16 flex flex-col items-center gap-0.5">
        <span className="text-4xl leading-none font-light">{pf == null ? "—" : pf.toFixed(2)}</span>
        <span className="text-xs text-[#a9b3ab]">profit factor · target 1.3</span>
      </div>
    </div>
  );
}
// daily lab PF, 0–2 scale, with the target and the old engine's PF as reference lines
function PfTrail({ days }: { days: { date: string; pf: number | null }[] }) {
  const pts = days.slice(-30), W = 300, H = 60;
  const y = (v: number) => (H - 4 - (Math.min(2, v) / 2) * (H - 8)).toFixed(1);
  const x = (i: number) => (pts.length > 1 ? 4 + (i * (W - 8)) / (pts.length - 1) : W / 2).toFixed(1);
  const xy = pts.flatMap((d, i) => (d.pf == null ? [] : [{ x: x(i), y: y(d.pf), ok: d.pf >= PF_TARGET, date: d.date, pf: d.pf }]));
  return (
    <svg role="img" aria-label={`Daily profit factor for the last ${pts.length} lab days against the ${PF_TARGET} target`}
         viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      <line x1="0" x2={W} y1={y(PF_TARGET)} y2={y(PF_TARGET)} stroke="#b9ec8a" strokeDasharray="4 4" strokeWidth="1" />
      <line x1="0" x2={W} y1={y(PF_START)} y2={y(PF_START)} stroke="#f08a76" strokeDasharray="4 4" strokeWidth="1" opacity="0.7" />
      {xy.length > 1 && <polyline points={xy.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgba(238,242,238,0.5)" strokeWidth="1.5" />}
      {xy.map((p) => (
        <circle key={p.date} cx={p.x} cy={p.y} r="3" fill={p.ok ? GREEN : "#eef2ee"}><title>{`${p.date} · PF ${p.pf.toFixed(2)}`}</title></circle>
      ))}
    </svg>
  );
}
const ACTIONABLE = new Set(["SELL", "SELL_ON_BOUNCE", "TRIM"]);

export default function CommandCenter() {
  const router = useRouter();
  const { isConnected, hydrated, hydrateFromStorage } = useAppStore();

  const [sess, setSess] = useState<{ pnl: number; trades: number; active: boolean; config: Record<string, unknown> | null } | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [advice, setAdvice] = useState<Advice[] | null>(null);
  const [risk, setRisk] = useState<PortfolioRisk | null>(null);
  const [runDate, setRunDate] = useState<string | null>(null);
  const [changeCount, setChangeCount] = useState(0);
  const [lab, setLab] = useState<LabPf | null>(null);
  const [edgeVerified, setEdgeVerified] = useState<boolean | null>(null); // null=loading, false=gate #6 not run, true=run
  // household view (both accounts): brain's household book + per-account P&L ledgers
  const [book, setBook] = useState<HouseholdBook | null>(null);
  const [natwarAdvice, setNatwarAdvice] = useState<Advice[] | null>(null);
  const [pnl, setPnl] = useState<Record<string, PnlData>>({});
  const [brief, setBrief] = useState<{ lines: { kind: string; warn: boolean; text: string }[] } | null>(null);
  const [watchdog, setWatchdog] = useState<{ fails: number } | null>(null);
  const [enbFloor, setEnbFloor] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (hydrated && !isConnected) router.push("/connect"); }, [hydrated, isConnected, router]);

  const load = useCallback(async () => {
    const get = (u: string) => api.get(u).then((r) => r.data);
    const [t, h, a, ins, hh, nw, p1, p2, lb] = await Promise.allSettled([
      get("/trades/live"), get("/portfolio/holdings"), get("/advisor"), get("/analytics/insights"),
      get("/household"), get("/advisor/natwar"), get("/pnl?account=primary"), get("/pnl?account=natwar"), get("/lab"),
    ]);
    // each card degrades to empty on its own failed call
    if (t.status === "fulfilled") {
      const trades: Trade[] = t.value.trades ?? [];
      const pnl = trades.filter((x) => x.status === "CLOSED").reduce((s, x) => s + (x.pnl ?? 0), 0);
      setSess({ pnl, trades: t.value.tradesCount ?? 0, active: !!t.value.isSessionActive, config: t.value.sessionConfig ?? null });
    }
    if (h.status === "fulfilled") setHoldings(h.value?.holdings ?? []);
    if (a.status === "fulfilled") {
      const v = a.value;
      setAdvice(v.rows ?? []); setRisk(v.portfolioRisk ?? null); setRunDate(v.runDate ?? null);
      setChangeCount((v.changes ?? []).length);
      setBrief(v.brief ?? null); setWatchdog(v.watchdog ?? null); setEnbFloor(v.riskTargets?.enb_floor ?? null);
    }
    if (ins.status === "fulfilled") setEdgeVerified(ins.value?.gate6 ? true : false);
    if (lb.status === "fulfilled") setLab(labPf(lb.value));
    if (hh.status === "fulfilled") setBook(hh.value?.book ?? null);
    if (nw.status === "fulfilled") setNatwarAdvice(nw.value?.rows ?? []);
    const pn: Record<string, PnlData> = {};
    for (const [k, r] of [["primary", p1], ["natwar", p2]] as const) if (r.status === "fulfilled") pn[k] = r.value;
    setPnl(pn);
    setLoaded(true);
  }, []);
  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);
  useRefreshOnVisible(load);

  // portfolio health
  const totalCurrent = (holdings ?? []).reduce((s, h) => s + h.last_price * h.quantity, 0);
  const totalInvested = (holdings ?? []).reduce((s, h) => s + h.average_price * h.quantity, 0);
  const totalPnl = totalCurrent - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const dayPnl = (holdings ?? []).reduce((s, h) => s + h.day_change * h.quantity, 0);

  // advisor top action: worst actionable call today
  const actionable = (advice ?? []).filter((r) => ACTIONABLE.has(r.verdict) || r.rotation_target_symbol);
  const topAction = [...actionable].sort((a, b) => (a.trend_score ?? 0) - (b.trend_score ?? 0))[0];

  const cfg = sess?.config ?? {};
  const capital = (cfg.capitalDeployed as number) ?? 25000;
  const maxLossPct = (cfg.maxLossPercent as number) ?? 5;
  const maxProfitPct = (cfg.maxProfitPercent as number) ?? 7;

  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const pfColor = !lab || lab.pf == null ? MUTE : lab.pf >= PF_TARGET ? GREEN : lab.pf >= 1.1 ? AMBER : RED;
  const lastDay = lab?.days[lab.days.length - 1];
  const sign = (n: number) => (n >= 0 ? GREEN : RED);

  const todayIso = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
  const attention = attentionItems({
    today: todayIso,
    advice: { primary: advice, natwar: natwarAdvice },
    ledgers: { primary: pnl.primary?.ledger, natwar: pnl.natwar?.ledger },
    book, enbFloor, brief, watchdog,
  });
  // latest month present in the P&L rows, per account: P&L vs Nifty on the same money
  const lastDate = Object.values(pnl).flatMap((d) => d.daily ?? []).reduce((m, r) => (r.date > m ? r.date : m), "");
  const month = lastDate.slice(0, 7);
  const monthRows: MonthVsNifty[] = month ? Object.entries(pnl).flatMap(([account, d]) => {
    const rows = (d.daily ?? []).filter((r) => r.date.startsWith(month));
    return rows.length ? [{ account, pnl: rows.reduce((a, r) => a + r.pnl, 0), nifty: rows.reduce((a, r) => a + (r.nifty_pnl ?? 0), 0) }] : [];
  }) : [];
  const hhRet = book?.returns.household;
  const flagged = flaggedSplit({ primary: advice, natwar: natwarAdvice });

  return (
    <div className="flex flex-col md:flex-row min-h-dvh md:h-dvh md:overflow-hidden">
      <Sidebar />
      <main className="flex-1 md:min-h-0 md:overflow-y-auto px-4 py-6 md:px-8 md:py-9">
        <div className="max-w-[1100px] w-full mx-auto flex flex-col gap-4 md:gap-6">
          {/* header: title + status pills, real-portfolio value on the right */}
          <header className="flex flex-wrap justify-between items-end gap-6">
            <div className="flex flex-col gap-4 min-w-0 max-w-full">
              <h1 className="text-[28px] md:text-[44px] leading-[1.05] font-light tracking-[-0.02em] text-[#eef2ee]">Command <br className="hidden md:block" />Center</h1>
              <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible">
                <Chip label="Date">{today}</Chip>
                <span className="chip rounded-2xl inline-flex shrink-0 items-center px-4 py-2 max-w-[300px] overflow-hidden"><BrainStatus /></span>
                <Chip label="Paper engine"><span style={{ color: sess?.active ? GREEN : undefined }}>{sess?.active ? "Active" : "Idle"}</span></Chip>
                {advice !== null && advice.length > 0 && (
                  <Chip label="Advisor">{actionable.length} action{actionable.length === 1 ? "" : "s"}</Chip>
                )}
              </div>
            </div>
            {book ? (
              <Link href="/household" className="flex flex-col items-start md:items-end md:ml-auto gap-2.5">
                <span className="text-[13px] text-[#a9b3ab]">Household · both accounts · {shortDate(book.asof)}</span>
                <span className="text-[40px] md:text-[52px] leading-none font-light tracking-[-0.02em] text-[#eef2ee]">{INR(book.net_worth.total)}</span>
                {hhRet && hhRet["1m"] != null && (
                  <span className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[13px] font-medium rounded-full px-3 py-1 text-[#0f1a12]" style={{ background: sign(hhRet["1m"]) }}>
                      {hhRet["1m"] >= 0 ? "+" : "−"}{Math.abs(hhRet["1m"]).toFixed(1)}% in 1 month
                    </span>
                    {hhRet.bench_1m != null && <span className="text-[13px] text-[#a9b3ab]">Nifty {hhRet.bench_1m >= 0 ? "+" : "−"}{Math.abs(hhRet.bench_1m).toFixed(1)}%</span>}
                  </span>
                )}
                {holdings && holdings.length > 0 && (
                  <span className="text-xs text-[#8b968e]">
                    Kanaklata live {INR(totalCurrent)} · <span style={{ color: sign(dayPnl) }}>{inr(dayPnl, { signed: true })} today</span> · <span style={{ color: sign(totalPnl) }}>{totalPnl >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}% total</span>
                  </span>
                )}
              </Link>
            ) : (
                        <Link href="/portfolio" className="flex flex-col items-start md:items-end gap-2.5">
              <span className="text-[13px] text-[#a9b3ab]">Portfolio value</span>
              {holdings === null ? (
                <Skeleton className="h-12 w-52" />
              ) : holdings.length === 0 ? (
                <span className="text-sm text-[#8b968e]">No holdings found.</span>
              ) : (
                <>
                  <span className="text-[40px] md:text-[52px] leading-none font-light tracking-[-0.02em] text-[#eef2ee]">{INR(totalCurrent)}</span>
                  <span className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[13px] font-medium rounded-full px-3 py-1 text-[#0f1a12]" style={{ background: sign(dayPnl) }}>
                      {inr(dayPnl, { signed: true })} today
                    </span>
                    <span className="text-[13px]" style={{ color: sign(totalPnl) }}>
                      {totalPnl >= 0 ? "+" : ""}{totalPnlPct.toFixed(1)}% total
                    </span>
                  </span>
                </>
              )}
            </Link>
            )}
          </header>

          {/* EDGE UNVERIFIED nag — clears only when gate #6 (historical
              backtest) has run. Keeps us honest: paper metrics are not a verdict. */}
          {edgeVerified === false && (
            <p className="flex items-start gap-3 rounded-3xl md:rounded-full px-5 py-3 text-sm leading-relaxed text-[#d3dbd5]"
               style={{ background: `${AMBER}14`, boxShadow: `inset 0 0 0 1px ${AMBER}40` }}>
              <span aria-hidden className="mt-[7px] w-2 h-2 rounded-full shrink-0" style={{ background: AMBER }} />
              <span>
                <span className="text-[#e7cc6e]">Edge unverified.</span>
                {" The historical backtest (gate #6) hasn't run, so the paper metrics here are a small, single-regime sample, not an edge verdict. Treat every result as provisional. "}
                <Link href="/insights" className="text-[#b9ec8a] hover:underline">Why this matters</Link>
              </span>
            </p>
          )}

          {/* what needs a decision or a look, both accounts, most urgent first */}
          {loaded && <AttentionList items={attention} />}

          {/* household vs Nifty, indexed to 100 */}
          {book && <VsNiftyChart book={book} />}

          {/* today: paper engine · advisor top move · whole-portfolio risk */}
          <section aria-label="Today" className="card-row [--card-min:240px]">
            <Link href="/trading" className="glass rounded-3xl p-4 md:p-5 flex flex-col gap-3.5 hover:bg-white/[0.02] transition-colors">
              <span className="flex justify-between items-center text-sm text-[#a9b3ab]">
                Paper engine
                <span className={`text-xs rounded-full px-2.5 py-0.5 ring-1 ring-inset ${sess?.active ? "text-[#9be15d] ring-[#9be15d]/40" : "text-[#a9b3ab] ring-white/[0.12]"}`}>
                  {sess?.active ? "Active" : "Idle"}
                </span>
              </span>
              <span className="text-[40px] leading-none font-light" style={{ color: !sess || sess.pnl === 0 ? "#eef2ee" : sign(sess.pnl) }}>
                {sess ? INR(sess.pnl) : "—"}
              </span>
              <span className="text-sm text-[#8b968e]">today · {sess?.trades ?? 0} trade{sess?.trades === 1 ? "" : "s"}</span>
            </Link>

            <Link href="/advisor" className="glass rounded-3xl p-4 md:p-5 flex flex-col gap-3.5 hover:bg-white/[0.02] transition-colors">
              <span className="flex justify-between items-center gap-2 text-sm text-[#a9b3ab]">
                Advisor · top move
                {changeCount > 0 && (
                  <span className="flex items-center gap-1 text-xs text-[#8fc7e8]"><History className="w-3 h-3" />{changeCount} changed</span>
                )}
              </span>
              {advice === null ? (
                <div className="space-y-2"><Skeleton className="h-8 w-36" /><Skeleton className="h-4 w-44" /></div>
              ) : !topAction ? (
                <>
                  <span className="text-[34px] leading-none font-light text-[#eef2ee]">All clear</span>
                  <span className="text-sm text-[#8b968e]">No action needed{runDate ? ` · ${runDate}` : ""}</span>
                </>
              ) : (() => {
                const m = VERDICT_META[topAction.verdict] ?? VERDICT_META.HOLD;
                return (
                  <>
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="text-[34px] leading-none font-light text-[#eef2ee] break-all">{topAction.symbol}</span>
                      <span className="text-[13px] font-medium rounded-full px-3 py-1 text-[#0f1a12]" style={{ background: m.color }}>{m.label}</span>
                    </span>
                    <span className="text-sm text-[#8b968e]">
                      trend {topAction.trend_score}
                      {topAction.pnl_percent != null && ` · ${topAction.pnl_percent >= 0 ? "+" : ""}${topAction.pnl_percent}%`}
                      {topAction.rotation_target_symbol && ` · rotate into ${topAction.rotation_target_symbol}`}
                      {actionable.length > 1 && ` · ${actionable.length} actions today`}
                    </span>
                  </>
                );
              })()}
            </Link>

            {risk && (risk.concentration_flags.length > 0 || risk.tax_loss_harvest.length > 0 || risk.correlation) && (
              <Link href="/advisor" className="glass rounded-3xl p-4 md:p-5 flex flex-col gap-3.5 hover:bg-white/[0.02] transition-colors">
                <span className="text-sm text-[#a9b3ab]">Whole-portfolio risk</span>
                {risk.correlation && risk.correlation.effective_bets != null && (
                  <span className="flex items-baseline gap-2">
                    <span className="text-[40px] leading-none font-light text-[#e7cc6e]">{risk.correlation.effective_bets}</span>
                    <span className="text-sm text-[#a9b3ab]">independent bets of {risk.correlation.names_covered}</span>
                  </span>
                )}
                {risk.concentration_flags.slice(0, 2).map((f, i) => (
                  <span key={i} className="flex items-start gap-2 text-[13px] text-[#d9b84a] leading-relaxed">
                    <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{f}</span>
                  </span>
                ))}
                {risk.tax_loss_harvest.length > 0 && (
                  <span className="text-sm text-[#8b968e]">
                    <span className="text-[#b9ec8a]">{INR(risk.harvestable_loss_inr)}</span> tax-loss harvest · {risk.tax_loss_harvest.length} names
                  </span>
                )}
              </Link>
            )}
          </section>

          {/* household book: split, asset mix, returns · sector mix vs index */}
          {book && (
            <section className="card-row">
              <HouseholdCard book={book} />
              <MixCard book={book} />
            </section>
          )}

          {/* flagged value by advisor call · risk share vs value share */}
          {(advice !== null || book) && (
            <section className="card-row">
              <FlaggedCard sum={flagged.sum} top={flagged.top} />
              {book && <RiskSourceCard book={book} />}
            </section>
          )}

          {/* this month vs Nifty (per account) · tax */}
          {(monthRows.length > 0 || book) && (
            <section className="card-row">
              {monthRows.length > 0 && <MonthCard month={month} rows={monthRows} />}
              {book && <TaxCard book={book} today={todayIso} />}
            </section>
          )}

          {/* intraday lab PF vs the 1.3 target, daily (P-70) — beside the daily risk meter */}
          {/* rendered only after load: inserting the lab card in front of an
              already-shown RiskMeter makes the phone swipe row re-snap past it */}
          {loaded && <section className="card-row [--card-min:320px]">
            {lab && lab.days.length > 0 && (
              <Link href="/lab" className="glass rounded-3xl p-4 md:p-5 flex flex-col gap-3 hover:bg-white/[0.02] transition-colors"
                    style={{ backgroundImage: "linear-gradient(160deg, rgba(155,225,93,0.07), rgba(255,255,255,0.02) 55%)" }}>
                <span className="flex justify-between items-center gap-3">
                  <span className="text-[15px] font-medium text-[#eef2ee]">
                    Intraday lab <span className="text-[#8b968e] font-normal">· {lab.trades.toLocaleString("en-IN")} trades · {lab.days.length} day{lab.days.length === 1 ? "" : "s"}</span>
                  </span>
                  {lab.pf != null && (
                    <span className="text-xs rounded-full px-2.5 py-0.5 whitespace-nowrap" style={{ color: pfColor, boxShadow: `inset 0 0 0 1px ${pfColor}66` }}>
                      {lab.pf >= PF_TARGET ? "on target" : `${(PF_TARGET - lab.pf).toFixed(2)} to go`}
                    </span>
                  )}
                </span>
                <div className="flex flex-wrap items-end gap-6">
                  <PfGauge pf={lab.pf} color={pfColor} />
                  <div className="flex flex-col gap-3.5 pb-1.5">
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs text-[#8b968e]">Last day · {lastDay ? shortDate(lastDay.date) : "—"}</span>
                      <span className="text-[22px] font-light text-[#eef2ee]">{lastDay?.pf == null ? "—" : lastDay.pf.toFixed(2)}</span>
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs text-[#8b968e]">Best strategy</span>
                      {lab.best ? (
                        <span className="text-[22px] font-light" style={{ color: lab.best.pf >= PF_TARGET ? GREEN : "#eef2ee" }} title={lab.best.id}>
                          {lab.best.pf.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#a9b3ab]">too early · {lab.leader ? `${lab.leader.n}/${MIN_TRADES} trades` : "no trades"}</span>
                      )}
                    </span>
                  </div>
                </div>
                <PfTrail days={lab.days} />
                <span className="text-xs text-[#8b968e]">
                  Daily PF, all strategies pooled · <span className="text-[#b9ec8a]">— {PF_TARGET} target</span> · <span className="text-[#f08a76]">— {PF_START} where we started</span>
                </span>
              </Link>
            )}
            <RiskMeter pnl={sess?.pnl ?? 0} capital={capital} maxLossPct={maxLossPct} maxProfitPct={maxProfitPct} />
          </section>}

          {/* jump links */}
          <nav aria-label="Jump to" className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap">
            {[
              { href: "/trading", label: "Auto Trade", desc: "run the paper engine" },
              { href: "/portfolio", label: "Portfolio", desc: "your real holdings" },
              { href: "/advisor", label: "Advisor", desc: "hold / sell guidance" },
              { href: "/insights", label: "Insights", desc: "is the edge real?" },
            ].map((l) => (
              <Link key={l.href} href={l.href}
                    className="chip inline-flex shrink-0 whitespace-nowrap items-baseline gap-2 px-[18px] py-2.5 text-sm text-[#eef2ee] hover:bg-white/[0.08] transition-colors">
                {l.label} <span className="text-[13px] text-[#8b968e]">{l.desc}</span>
              </Link>
            ))}
          </nav>
        </div>
      </main>
    </div>
  );
}
