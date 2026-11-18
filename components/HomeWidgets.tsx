"use client";
// Home widgets for the household (both accounts) view — mockup D. Data comes
// from the brain's household book (/api/household) and /api/pnl; Home fetches,
// these only render.
import Link from "next/link";
import { inr } from "@/lib/format";
import { ACCOUNT_NAME, shortDate, type AttentionItem, type HouseholdBook, type Level } from "@/lib/attention";

const GREEN = "#9be15d", RED = "#f08a76", GOLD = "#d9b84a", SKY = "#8fc7e8";
const DOT: Record<Level, string> = { act: RED, watch: GOLD, data: "#a9b3ab", info: GREEN };
const signColor = (n: number | null | undefined) => (n == null ? "#eef2ee" : n >= 0 ? GREEN : RED);
const pct = (n: number | null | undefined, dp = 2) => (n == null ? "—" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(dp)}%`);

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-xs text-[#8b968e]">{label}</span>
      <span className="text-[22px] font-light tabular-nums truncate" style={{ color: color ?? "#eef2ee" }}>{value}</span>
      {sub && <span className="text-xs text-[#8b968e]">{sub}</span>}
    </div>
  );
}

export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="att-h" className="glass rounded-3xl px-5 pt-5 pb-2">
      <div className="flex justify-between items-baseline pb-2.5">
        <h2 id="att-h" className="text-[15px] font-medium text-[#eef2ee]">
          Needs your attention <span className="text-[#8b968e] font-normal">· {items.length}</span>
        </h2>
        {items.length > 0 && <span className="text-[13px] text-[#8b968e]">most urgent first</span>}
      </div>
      {items.length === 0 ? (
        <p className="py-3 border-t border-white/[0.06] text-sm text-[#a9b3ab]">Nothing needs you today.</p>
      ) : items.map((it, i) => (
        <Link key={i} href={it.href}
              className="grid grid-cols-[8px_1fr_auto] gap-3.5 items-baseline py-3 border-t border-white/[0.06] hover:bg-white/[0.02] transition-colors">
          <span aria-hidden className="w-2 h-2 rounded-full -translate-y-px" style={{ background: DOT[it.level] }} />
          <span className="text-sm leading-relaxed"><span className="text-[#eef2ee]">{it.text}</span> <span className="text-[#8b968e]">{it.detail}</span></span>
          <span className="text-[13px] text-[#b9ec8a] whitespace-nowrap">{it.link}</span>
        </Link>
      ))}
    </section>
  );
}

// Proportional segments with a 3px gap; widths are % of total.
function SplitBar({ parts }: { parts: { pct: number; color: string }[] }) {
  return (
    <div className="flex h-3 gap-[3px]">
      {parts.map((p, i) => (
        <span key={i} className="first:rounded-l-full last:rounded-r-full" style={{ width: `${p.pct}%`, background: p.color }} />
      ))}
    </div>
  );
}

const ASSET: Record<string, { label: string; color: string }> = {
  equity: { label: "Stocks", color: GREEN },
  etf_gold_silver: { label: "Gold & silver ETFs", color: GOLD },
  fund: { label: "Funds", color: SKY },
};

export function HouseholdCard({ book }: { book: HouseholdBook }) {
  const total = book.net_worth.total || 1;
  const accts = Object.entries(book.net_worth.by_account);
  const assets = Object.entries(book.net_worth.by_asset_class).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const r = book.returns.household;
  return (
    <Link href="/household" aria-labelledby="hh-h" className="glass rounded-3xl p-5 flex flex-col gap-[18px] hover:bg-white/[0.02] transition-colors">
      <h2 id="hh-h" className="text-[15px] font-medium text-[#eef2ee]">
        Household book {r?.start && <span className="text-[#8b968e] font-normal">· since {shortDate(r.start)}</span>}
      </h2>
      <div className="flex flex-col gap-2">
        <SplitBar parts={accts.map(([, v], i) => ({ pct: (v / total) * 100, color: i === 0 ? "rgba(238,242,238,0.75)" : "rgba(238,242,238,0.28)" }))} />
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[13px]">
          {accts.map(([k, v]) => (
            <span key={k}><span className="text-[#eef2ee]">{ACCOUNT_NAME[k] ?? k}</span> <span className="text-[#8b968e]">{inr(v)} · {Math.round((v / total) * 100)}%</span></span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <SplitBar parts={assets.map(([k, v]) => ({ pct: (v / total) * 100, color: ASSET[k]?.color ?? "#6b776e" }))} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#8b968e]">
          {assets.map(([k, v]) => (
            <span key={k}><span style={{ color: ASSET[k]?.color ?? "#6b776e" }}>●</span> {ASSET[k]?.label ?? k} {((v / total) * 100).toFixed(1)}%</span>
          ))}
        </div>
      </div>
      {r && (
        <div className="grid grid-cols-3 gap-3 pt-1">
          <Metric label="1 month" value={pct(r["1m"])} color={signColor(r["1m"])} sub={`Nifty ${pct(r.bench_1m)}`} />
          <Metric label={`Since ${shortDate(r.start)}`} value={pct(r.since)} color={signColor(r.since)} sub={`Nifty ${pct(r.bench_since)}`} />
          {r.max_drawdown && (
            <Metric label="Worst drop" value={pct(r.max_drawdown.pct, 1)} sub={`${shortDate(r.max_drawdown.peak)} → ${shortDate(r.max_drawdown.trough)}`} />
          )}
        </div>
      )}
    </Link>
  );
}

export function MixCard({ book }: { book: HouseholdBook }) {
  const top = [...book.xray.sectors].sort((a, b) => b.pct - a.pct).slice(0, 5);
  const scale = Math.max(20, ...top.map((t) => Math.max(t.pct, t.index_pct)));
  const light = book.rebalance.filter((r) => r.kind === "underweight").slice(0, 3);
  return (
    <Link href="/household" aria-labelledby="mix-h" className="glass rounded-3xl p-5 flex flex-col gap-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex flex-wrap justify-between items-baseline gap-x-3">
        <h2 id="mix-h" className="text-[15px] font-medium text-[#eef2ee]">Where the money sits</h2>
        <span className="text-xs text-[#8b968e]">yours / Nifty 500 · tick = index</span>
      </div>
      {top.map((t) => (
        <div key={t.name} className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[150px_1fr_auto] gap-3 items-center text-[13px]">
          <span className="text-[#a9b3ab] truncate" title={t.name}>{t.name}</span>
          <span className="relative h-2.5 rounded-full bg-white/[0.06]">
            <span className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${(t.pct / scale) * 100}%`, background: `repeating-linear-gradient(90deg, ${GOLD} 0 2px, ${GOLD}40 2px 5px)` }} />
            <span title="index weight" className="absolute -top-[3px] -bottom-[3px] w-0.5 bg-[#eef2ee]" style={{ left: `${(t.index_pct / scale) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-[#eef2ee]">{t.pct.toFixed(1)}% <span className="text-[#8b968e]">/ {t.index_pct.toFixed(1)}</span></span>
        </div>
      ))}
      {light.length > 0 && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#8b968e]">
          Light on {light.map((l, i) => (
            <span key={l.sector}>{i > 0 && ", "}<span className="text-[#eef2ee]">{l.sector}</span> −{l.gap_pp.toFixed(1)} pts</span>
          ))}.
        </p>
      )}
    </Link>
  );
}

export type MonthVsNifty = { account: string; pnl: number; nifty: number };

export function MonthCard({ month, rows }: { month: string; rows: MonthVsNifty[] }) {
  const label = new Date(month + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long" });
  return (
    <Link href="/pnl" aria-labelledby="mon-h" className="glass rounded-3xl p-5 flex flex-col gap-4 hover:bg-white/[0.02] transition-colors">
      <h2 id="mon-h" className="text-[15px] font-medium text-[#eef2ee]">
        {label} vs Nifty <span className="text-[#8b968e] font-normal">· same money, same days</span>
      </h2>
      {rows.map((r) => {
        const scale = Math.max(Math.abs(r.pnl), Math.abs(r.nifty)) || 1;
        const gap = r.pnl - r.nifty;
        return (
          <div key={r.account} className="flex flex-col gap-2.5">
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-[#eef2ee]">{ACCOUNT_NAME[r.account] ?? r.account}</span>
              <span className="tabular-nums"><span style={{ color: signColor(r.pnl) }}>{inr(r.pnl, { signed: true })}</span> <span className="text-[#8b968e]">vs {inr(r.nifty, { signed: true })}</span></span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="h-2 rounded-full" style={{ width: `${(Math.abs(r.pnl) / scale) * 100}%`, background: signColor(r.pnl) }} />
              <span className="h-2 rounded-full bg-[#eef2ee]/[0.22]" style={{ width: `${(Math.abs(r.nifty) / scale) * 100}%` }} />
            </div>
            <span className="text-[13px]" style={{ color: signColor(gap) }}>{inr(Math.abs(gap))} {gap >= 0 ? "ahead of" : "behind"} the index</span>
          </div>
        );
      })}
    </Link>
  );
}

export function TaxCard({ book, today }: { book: HouseholdBook; today: string }) {
  const t = book.tax;
  const y = Number(today.slice(0, 4)), fyStart = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
  const booked = Object.entries(t.fy_realised).filter(([, v]) => v != null) as [string, number][];
  const bookedSum = booked.reduce((a, [, v]) => a + v, 0);
  const harvest = t.harvest.reduce((a, h) => a + h.loss_inr, 0);
  const next = [...t.ltcg_calendar].filter((l) => l.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const nextNames = next.filter((l, i) => next.findIndex((m) => m.symbol === l.symbol) === i).slice(0, 2);
  return (
    <Link href="/household" aria-labelledby="tax-h" className="glass rounded-3xl p-5 flex flex-col gap-4 hover:bg-white/[0.02] transition-colors">
      <h2 id="tax-h" className="text-[15px] font-medium text-[#eef2ee]">Tax · FY {fyStart}–{String(fyStart + 1).slice(2)}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Metric label="Booked so far" value={booked.length ? inr(bookedSum) : "—"} color={booked.length ? signColor(bookedSum) : undefined}
                sub={booked.length === 1 ? ACCOUNT_NAME[booked[0][0]] ?? booked[0][0] : booked.length ? "both accounts" : "nothing booked"} />
        <Metric label="On paper, short" value={inr(t.unrealised_stcg)} color={signColor(t.unrealised_stcg)} sub="under 1 year" />
        <Metric label="On paper, long" value={inr(t.unrealised_ltcg)} color={signColor(t.unrealised_ltcg)} sub="over 1 year" />
      </div>
      {harvest > 0 && (
        <p className="text-sm leading-relaxed text-[#a9b3ab]">
          <span className="text-[#b9ec8a]">{inr(harvest)}</span> of losses could be booked across {t.harvest.length} holding{t.harvest.length === 1 ? "" : "s"} to offset gains.
        </p>
      )}
      {nextNames.length > 0 && (
        <p className="text-[13px] leading-relaxed text-[#8b968e]">
          Next to turn long-term: {nextNames.map((l) => `${l.symbol} ${shortDate(l.date)}`).join(" · ")}
        </p>
      )}
    </Link>
  );
}
