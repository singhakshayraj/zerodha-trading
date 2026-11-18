"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import api from "@/lib/api";
import { useRefreshOnVisible } from "@/lib/useRefreshOnVisible";
import { Sidebar } from "@/components/layout/Sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Landmark, RefreshCw } from "lucide-react";

import { inr } from "@/lib/format";
// Household book (both accounts), published daily by the brain. Read-only.

type Pt = { date: string; index: number };
type Ret = { "1m": number | null; "3m": number | null; since: number | null; start: string | null; series: Pt[];
  bench_1m: number | null; bench_3m: number | null; bench_since: number | null; bench_series: Pt[];
  max_drawdown: { pct: number; peak: string | null; trough: string | null }; xirr: number | null; xirr_since: string | null };
type Move = { kind: "trim"; symbol: string; account: string; qty: number; freed_inr: number; tax_inr: number; cost_inr: number; reason: string; tax_known?: boolean; unmatched_qty?: number }
  | { kind: "underweight"; sector: string; gap_pp: number };
type Book = {
  asof: string;
  net_worth: { total: number; by_account: Record<string, number>; by_asset_class: Record<string, number>; unpriced: string[] };
  returns: Record<"primary" | "natwar" | "household", Ret>;
  xray: { sectors: { name: string; pct: number; index_pct: number; target_pct: number; drift_pp: number; breach: boolean }[];
    sizes: { size: string; pct: number; index_pct: number; drift_pp: number; breach: boolean }[];
    names: { symbol: string; pct: number; accounts: string[]; breach: boolean }[]; etf_pct: number; etf_breach: boolean };
  risk: { effective_bets: number | null; top_contributors: { symbol: string; risk_pct: number; value_pct: number }[];
    clusters: { symbols: string[]; weight_pct: number; avg_corr: number }[]; n_used: number };
  tax: { fy_realised: Record<string, number | null>; unrealised_stcg: number | null; unrealised_ltcg: number | null;
    ltcg_calendar: { symbol: string; account: string; date: string; qty: number }[];
    harvest: { symbol: string; account: string; loss_inr: number }[]; unmatched?: { primary?: string[]; natwar?: string[] } };
  rebalance: Move[];
  funds_unconfirmed: string[]; targets_source: string;
  sections_asof: { positions: string | null; positions_primary?: string | null; positions_natwar?: string | null; returns: string | null; xirr_since: string | null; tax: string | null; risk: string | null };
};
type Trade = { account: string; symbol: string; trade_type: string; quantity: number; price: number; trade_date: string };
type Payload = { book: Book | null; targets: unknown; ledger: Trade[] };

const GREEN = "#22c55e", RED = "#ef4444", MUTE = "#71717a";
const NAME: Record<string, string> = { primary: "Kanaklata", natwar: "Natwar", household: "Household", unknown: "Unknown" };
const INR = (n: number | null | undefined) => inr(n);
const PCT = (n: number | null | undefined) => (n == null ? "—" : (n < 0 ? "−" : n > 0 ? "+" : "") + Math.abs(n).toFixed(1) + "%");
const col = (n: number | null | undefined) => (n == null ? MUTE : n < 0 ? RED : GREEN);
const plusYear = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 864e5;

function Section({ id, title, asof, children }: { id: string; title: string; asof?: string | null; children: React.ReactNode }) {
  return (
    <section data-testid={id} className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {asof && <span className="text-xs text-[#8a8a8a]">as of {asof}</span>}
      </div>
      {children}
    </section>
  );
}
const Table = ({ children }: { children: React.ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full text-[12px] tabular-nums whitespace-nowrap">{children}</table></div>
);
const Th = ({ children }: { children?: React.ReactNode }) => <th className="text-left font-normal text-xs uppercase tracking-wide text-[#8a8a8a] pr-4 pb-1.5">{children}</th>;
const Td = ({ children, color }: { children?: React.ReactNode; color?: string }) => <td className="pr-4 py-1" style={{ color }}>{children}</td>;
const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-[#8a8a8a] mt-2">{children}</p>;

// Household time-weighted index (solid) vs the Nifty-equivalent (dashed).
function Chart({ a, b }: { a: Pt[]; b: Pt[] }) {
  if (a.length < 2) return null;
  const W = 600, H = 140, P = 6;
  const vals = [...a, ...b].map((p) => p.index);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const line = (s: Pt[]) => s.map((p, i) => `${P + (i / Math.max(s.length - 1, 1)) * (W - 2 * P)},${P + ((hi - p.index) / span) * (H - 2 * P)}`).join(" ");
  return (<>
    <svg data-testid="returns-chart" viewBox={`0 0 ${W} ${H}`} className="w-full h-36 mt-3" role="img" aria-label="Household return index against the Nifty-equivalent">
      <polyline points={line(b)} fill="none" stroke={MUTE} strokeWidth={1.5} strokeDasharray="4 4" />
      <polyline points={line(a)} fill="none" stroke="#a78bfa" strokeWidth={2} />
    </svg>
    <div data-testid="chart-legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#8a8a8a] mt-1">
      <span className="flex items-center gap-1.5"><svg width="18" height="4"><line x1="0" x2="18" y1="2" y2="2" stroke="#a78bfa" strokeWidth={2} /></svg>Household</span>
      <span className="flex items-center gap-1.5"><svg width="18" height="4"><line x1="0" x2="18" y1="2" y2="2" stroke={MUTE} strokeWidth={1.5} strokeDasharray="4 4" /></svg>Nifty-equivalent</span>
    </div></>
  );
}

export default function HouseholdPage() {
  const router = useRouter();
  const { isConnected, hydrated, hydrateFromStorage } = useAppStore();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acct, setAcct] = useState<"all" | "primary" | "natwar">("all");

  useEffect(() => { hydrateFromStorage(); }, [hydrateFromStorage]);
  useEffect(() => { if (hydrated && !isConnected) router.push("/connect"); }, [hydrated, isConnected, router]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData((await api.get("/household")).data as Payload); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to load household"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (isConnected) load(); }, [isConnected, load]);
  useRefreshOnVisible(load);

  const b = data?.book ?? null;
  const sa = b?.sections_asof;
  const ledger = (data?.ledger ?? []).filter((t) => acct === "all" || t.account === acct);
  const hh = b?.returns.household;
  const enough = !!(hh?.xirr_since && b && days(hh.xirr_since, b.asof) >= 365);
  const trims = b?.rebalance.filter((m): m is Extract<Move, { kind: "trim" }> => m.kind === "trim") ?? [];
  const unders = b?.rebalance.filter((m): m is Extract<Move, { kind: "underweight" }> => m.kind === "underweight") ?? [];
  const undated = b ? (b.tax.unmatched?.primary ?? []).length + (b.tax.unmatched?.natwar ?? []).length : 0;
  const pa = sa?.positions_primary, na = sa?.positions_natwar;
  const posAsof = sa ? sa.positions && na && pa && na !== pa ? `${sa.positions} (Natwar as of ${na})` : sa.positions : null;
  const soon = b?.tax.ltcg_calendar.filter((l) => days(b.asof, l.date) <= 90) ?? [];

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-[#0a0a0a] text-[#f5f5f5] overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-5 md:p-8">
        <div className="max-w-[1100px] w-full mx-auto space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-semibold flex items-center gap-2"><Landmark className="w-5 h-5 text-[#888]" /> Household</h1>
            <button onClick={load} aria-label="Refresh" className="px-3 py-2 rounded-lg text-[#aaa] bg-[#111111] border border-[#1f1f1f] hover:text-[#f5f5f5] min-h-[40px]">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {error && <div className="bg-[#ef4444]/10 border border-[#ef4444]/30 text-[#ef4444] text-sm rounded-xl p-4">{error}</div>}
          {!data && loading && <Skeleton className="h-64 w-full rounded-xl bg-[#111]" />}
          {data && !b && <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6 text-[12px] text-[#8a8a8a]">The household book hasn&apos;t been built yet — it publishes after the daily reconcile.</div>}

          {data && b && sa && (<>
            <Section id="net" title="Net worth" asof={posAsof}>
              <p data-testid="net-total" className="text-2xl font-semibold tabular-nums">{INR(b.net_worth.total)}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 text-[12px]">
                <div>{Object.entries(b.net_worth.by_account).filter(([, v]) => v).map(([k, v]) => <p key={k} className="flex justify-between"><span className="text-[#8a8a8a]">{NAME[k] ?? k}</span><span className="tabular-nums">{INR(v)}</span></p>)}</div>
                <div>{Object.entries(b.net_worth.by_asset_class).filter(([, v]) => v).map(([k, v]) => <p key={k} className="flex justify-between"><span className="text-[#8a8a8a]">{k.replace(/_/g, " ")}</span><span className="tabular-nums">{INR(v)}</span></p>)}</div>
              </div>
              {b.net_worth.unpriced.length > 0 && <Muted>Unpriced: {b.net_worth.unpriced.join(", ")}</Muted>}
            </Section>

            <Section id="returns" title="Returns (time-weighted, vs Nifty-equivalent)" asof={sa.returns}>
              <Table>
                <thead><tr><Th /><Th>1M</Th><Th>3M</Th><Th>Since start</Th><Th>Max drawdown</Th></tr></thead>
                <tbody>
                  {(["primary", "natwar", "household"] as const).map((k) => { const r = b.returns[k]; return r && (
                    <tr key={k}>
                      <Td>{NAME[k]}</Td>
                      <Td><span style={{ color: col(r["1m"]) }}>{PCT(r["1m"])}</span> <span className="text-[#8a8a8a]">vs {PCT(r.bench_1m)}</span></Td>
                      <Td><span style={{ color: col(r["3m"]) }}>{PCT(r["3m"])}</span> <span className="text-[#8a8a8a]">vs {PCT(r.bench_3m)}</span></Td>
                      <Td><span style={{ color: col(r.since) }}>{PCT(r.since)}</span> <span className="text-[#8a8a8a]">vs {PCT(r.bench_since)}</span></Td>
                      <Td color={RED}>{PCT(r.max_drawdown.pct)}</Td>
                    </tr>); })}
                </tbody>
              </Table>
              {hh && <Chart a={hh.series} b={hh.bench_series} />}
              {hh?.xirr_since && (enough
                ? <Muted>Money-weighted return (XIRR) since {hh.xirr_since}: {PCT(hh.xirr)} a year, excludes dividends.</Muted>
                : <Muted>Money-weighted return (XIRR) appears from {plusYear(hh.xirr_since)}</Muted>)}
            </Section>

            <Section id="xray" title="X-ray" asof={posAsof}>
              {b.targets_source === "default" && <span className="inline-block text-xs px-2 py-0.5 rounded bg-[#1f1f1f] text-[#aaa] mb-3">targets: default</span>}
              <div className="space-y-2">
                {b.xray.sectors.map((s) => (
                  <div key={s.name} data-testid={s.breach ? `breach-${s.name}` : undefined} className="text-[12px]">
                    <div className="flex justify-between" style={{ color: s.breach ? RED : undefined }}>
                      <span>{s.name}{s.breach && " · over target"}</span>
                      <span className="tabular-nums">{s.pct.toFixed(1)}% <span className="text-[#8a8a8a]">(target {s.target_pct}%, index {s.index_pct.toFixed(1)}%)</span></span>
                    </div>
                    <div className="relative h-1.5 bg-[#1a1a1a] rounded mt-1">
                      <div className="h-full rounded" style={{ width: `${Math.min(s.pct, 100)}%`, background: s.breach ? RED : "#a78bfa" }} />
                      <div className="absolute -top-0.5 h-2.5 w-px bg-[#f5f5f5]" style={{ left: `${Math.min(s.target_pct, 100)}%` }} />
                    </div>
                  </div>))}
              </div>
              <h3 className="text-xs uppercase tracking-wide text-[#8a8a8a] mt-4 mb-1">Size mix vs index</h3>
              <Table><tbody>{b.xray.sizes.map((z) => (
                <tr key={z.size}><Td color={z.breach ? RED : undefined}>{z.size}</Td><Td color={z.breach ? RED : undefined}>{z.pct.toFixed(1)}%</Td><Td><span className="text-[#8a8a8a]">index {z.index_pct.toFixed(1)}%</span></Td></tr>))}</tbody></Table>
              <h3 className="text-xs uppercase tracking-wide text-[#8a8a8a] mt-4 mb-1">Top names</h3>
              <Table><tbody>{b.xray.names.map((n) => (
                <tr key={n.symbol}><Td color={n.breach ? RED : undefined}>{n.symbol}</Td><Td color={n.breach ? RED : undefined}>{n.pct.toFixed(1)}%</Td>
                  <Td><span className="text-[#8a8a8a]">{n.accounts.length > 1 ? "both accounts" : n.accounts.map((a) => NAME[a] ?? a).join(", ")}</span></Td></tr>))}</tbody></Table>
              <p className="text-[12px] mt-3" style={{ color: b.xray.etf_breach ? RED : undefined }}>ETF sleeve: {b.xray.etf_pct.toFixed(1)}%{b.xray.etf_breach && " — over its cap"}</p>
            </Section>

            <Section id="risk" title="Risk" asof={sa.risk}>
              <p className="text-[13px]">Independent risk sources: {b.risk.effective_bets ?? "—"} (of {b.risk.n_used} holdings)</p>
              <Muted>{b.risk.effective_bets == null ? "Not enough shared price history to measure."
                : b.risk.effective_bets < b.risk.n_used / 4 ? "Most of the book moves together — few truly independent bets." : "Holdings move fairly independently."}</Muted>
              <div className="mt-3"><Table>
                <thead><tr><Th>Name</Th><Th>Risk %</Th><Th>Value %</Th></tr></thead>
                <tbody>{b.risk.top_contributors.map((c) => <tr key={c.symbol}><Td>{c.symbol}</Td><Td>{c.risk_pct.toFixed(1)}%</Td><Td>{c.value_pct.toFixed(1)}%</Td></tr>)}</tbody>
              </Table></div>
              {b.risk.clusters.map((c, i) => <Muted key={i}>Moves together: {c.symbols.join(", ")} ({c.weight_pct.toFixed(1)}% of book, correlation {c.avg_corr})</Muted>)}
            </Section>

            <Section id="tax" title="Tax" asof={sa.tax}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
                {(["primary", "natwar"] as const).map((k) => <p key={k} className="flex justify-between"><span className="text-[#8a8a8a]">FY realised · {NAME[k]}</span><span className="tabular-nums">{b.tax.fy_realised[k] == null ? "unknown" : INR(b.tax.fy_realised[k])}</span></p>)}
                <p className="flex justify-between"><span className="text-[#8a8a8a]">Unrealised STCG</span><span className="tabular-nums">{INR(b.tax.unrealised_stcg)}</span></p>
                <p className="flex justify-between"><span className="text-[#8a8a8a]">Unrealised LTCG</span><span className="tabular-nums">{INR(b.tax.unrealised_ltcg)}</span></p>
              </div>
              <h3 className="text-xs uppercase tracking-wide text-[#8a8a8a] mt-4 mb-1">Turning long-term in the next 90 days</h3>
              {soon.length ? <Table><tbody>{soon.map((l, i) => <tr key={i}><Td>{l.symbol}</Td><Td>{NAME[l.account] ?? l.account}</Td><Td>{l.date}</Td><Td>{l.qty} sh</Td></tr>)}</tbody></Table> : <Muted>None.</Muted>}
              <h3 className="text-xs uppercase tracking-wide text-[#8a8a8a] mt-4 mb-1">Harvest candidates</h3>
              {b.tax.harvest.length ? <Table><tbody>{b.tax.harvest.map((h, i) => <tr key={i}><Td>{h.symbol}</Td><Td>{NAME[h.account] ?? h.account}</Td><Td color={RED}>{INR(-Math.abs(h.loss_inr))}</Td></tr>)}</tbody></Table> : <Muted>None.</Muted>}
              {undated > 0 && <Muted>{undated} holdings have undated lots — import the Console tradebook.</Muted>}
            </Section>

            <Section id="rebalance" title="Rebalance" asof={posAsof}>
              {trims.length ? <Table>
                <thead><tr><Th>Trim</Th><Th>Account</Th><Th>Qty</Th><Th>Frees</Th><Th>Tax</Th><Th>Why</Th></tr></thead>
                <tbody>{trims.map((m, i) => <tr key={i}><Td>{m.symbol}</Td><Td>{NAME[m.account] ?? m.account}</Td><Td>{m.qty}</Td><Td>{INR(m.freed_inr)}</Td><Td>{m.tax_known === false ? "tax unknown (undated lots)" : INR(m.tax_inr + m.cost_inr)}</Td><td className="py-1 whitespace-normal min-w-[180px]">{m.reason}</td></tr>)}</tbody>
              </Table> : <p className="text-[12px] text-[#8a8a8a]">No trims proposed — no name or sector is over its cap.{b.xray.sizes.some((z) => z.breach) && " Size mix drifts from the index; that is shown above, not traded here."}</p>}
              {unders.length > 0 && <>
                <h3 className="text-xs uppercase tracking-wide text-[#8a8a8a] mt-4 mb-1">Underweight sectors</h3>
                {unders.map((u) => <p key={u.sector} className="text-[12px]">{u.sector} <span className="text-[#8a8a8a]">{u.gap_pp.toFixed(1)}pp under index weight</span></p>)}
              </>}
            </Section>

            <Section id="ledger" title="Ledger" asof={data.ledger[0]?.trade_date ?? null}>
              <div data-testid="ledger-filter" className="flex rounded-lg border border-[#1f1f1f] overflow-hidden text-xs w-fit mb-3">
                {([["all", "All"], ["primary", "Kanaklata"], ["natwar", "Natwar"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setAcct(k)} className={`px-3 min-h-[36px] ${acct === k ? "bg-[#1f1f1f] text-[#f5f5f5]" : "text-[#8a8a8a]"}`}>{label}</button>))}
              </div>
              <Table>
                <thead><tr><Th>Date</Th><Th>Account</Th><Th>Symbol</Th><Th>Side</Th><Th>Qty</Th><Th>Price</Th></tr></thead>
                <tbody>{ledger.map((t, i) => <tr key={i}><Td>{t.trade_date}</Td><Td>{NAME[t.account] ?? t.account}</Td><Td>{t.symbol}</Td><Td color={t.trade_type.toLowerCase() === "buy" ? GREEN : RED}>{t.trade_type}</Td><Td>{t.quantity}</Td><Td>{INR(t.price)}</Td></tr>)}</tbody>
              </Table>
            </Section>

            {b.funds_unconfirmed.length > 0 && (
              <Section id="funds" title="Funds" asof={sa.positions}>
                <p className="text-[12px]">{b.funds_unconfirmed.length} funds unconfirmed — add scheme codes + units</p>
                <Muted>{b.funds_unconfirmed.join(", ")}</Muted>
              </Section>
            )}
          </>)}
        </div>
      </main>
    </div>
  );
}
