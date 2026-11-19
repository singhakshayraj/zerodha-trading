"use client";
// Home widgets for the household (both accounts) view — mockup D. Data comes
// from the brain's household book (/api/household) and /api/pnl; Home fetches,
// these only render.
import Link from "next/link";
import { inr } from "@/lib/format";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ACCOUNT_NAME, shortDate, type AttentionItem, type Flagged, type HouseholdBook, type Level } from "@/lib/attention";

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

// ─── charts (mockup E) ─────────────────────────────────────────────────────
// Palette checked with the dataviz validator on the card surface: lime vs grey is
// the emphasis pair (you vs context); verdicts use ONE coral ramp (sell bright,
// trim dark, PASS ordinal) + neutral grey for hold — red/green fails colour-blind checks.
const MARK_GREY = "#7c877f", RING = "#141b16";
const lakh = (n: number) => `₹${(n / 1e5).toFixed(2)}L`;

export function VsNiftyChart({ book }: { book: HouseholdBook }) {
  const r = book.returns.household;
  if (!r?.series?.length || !r.bench_series?.length) return null;
  const bench = new Map(r.bench_series.map((p) => [p.date, p.index]));
  const data = r.series.map((p) => ({ date: p.date, you: p.index, nifty: bench.get(p.date) ?? null }));
  const vals = data.flatMap((d) => (d.nifty == null ? [d.you] : [d.you, d.nifty]));
  const lo = Math.floor(Math.min(...vals) / 5) * 5, hi = Math.ceil(Math.max(...vals) / 5) * 5;
  const ticks = Array.from({ length: (hi - lo) / 5 + 1 }, (_, i) => lo + i * 5);
  // first day + each month start, minus month starts too close to the first label to fit beside it
  const monthTicks = data.filter((d, i) => i === 0 || (d.date.slice(5, 7) !== data[i - 1].date.slice(5, 7) && i >= data.length * 0.12)).map((d) => d.date);
  const last = data[data.length - 1];
  const gaps = data.filter((d) => d.nifty != null).map((d) => (d.nifty as number) - d.you);
  const gapNow = last.nifty == null ? null : last.nifty - last.you;
  // end labels only when the two line-ends sit apart (never stacked/nudged)
  const apart = gapNow != null && (Math.abs(gapNow) / (hi - lo)) * 200 >= 16;
  const end = (text: string, ink: string) =>
    function EndLabel(p: { x?: number | string; y?: number | string; index?: number }) {
      return p.index === data.length - 1 && apart
        ? <text x={Number(p.x) + 10} y={Number(p.y) + 4} fontSize={13} fill={ink}>{text}</text>
        : <g />;
    };
  return (
    <section aria-labelledby="vs-h" className="glass rounded-3xl p-5 flex flex-col gap-3.5">
      <div className="flex flex-wrap justify-between items-baseline gap-x-4 gap-y-2">
        <h2 id="vs-h" className="text-[15px] font-medium text-[#eef2ee]">
          Household vs Nifty <span className="text-[#8b968e] font-normal">· both indexed to 100, since {shortDate(r.start)}</span>
        </h2>
        <span className="flex gap-4 text-[13px] text-[#a9b3ab]">
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded-full" style={{ background: GREEN }} />Household</span>
          <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded-full" style={{ background: MARK_GREY }} />Nifty</span>
        </span>
      </div>
      <div className="h-[240px] -ml-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: apart ? 92 : 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
            <ReferenceLine y={100} stroke="rgba(255,255,255,0.18)" />
            <XAxis dataKey="date" ticks={monthTicks} interval={0} axisLine={false} tickLine={false}
                   tick={{ fill: "#8b968e", fontSize: 12 }}
                   tickFormatter={(d: string) => (d === data[0].date ? shortDate(d) : new Date(d + "T00:00:00").toLocaleDateString("en-IN", { month: "short" }))} />
            <YAxis domain={[lo, hi]} ticks={ticks} width={34} axisLine={false} tickLine={false} tick={{ fill: "#8b968e", fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: "rgba(238,242,238,0.35)", strokeWidth: 1 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const v = (k: string) => payload.find((p) => p.dataKey === k)?.value as number | undefined;
                return (
                  <div className="rounded-2xl bg-[#1a241e] px-3 py-2.5 text-xs text-[#8b968e] shadow-xl ring-1 ring-white/[0.08] flex flex-col gap-1 min-w-[150px]">
                    <span>{shortDate(String(label))}</span>
                    {([["you", "Household", GREEN], ["nifty", "Nifty", MARK_GREY]] as const).map(([k, name, c]) => v(k) != null && (
                      <span key={k} className="flex justify-between gap-4">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full" style={{ background: c }} />{name}</span>
                        <span className="text-[13px] text-[#eef2ee] tabular-nums">{(v(k) as number).toFixed(1)}</span>
                      </span>
                    ))}
                  </div>
                );
              }} />
            <Line dataKey="nifty" stroke={MARK_GREY} strokeWidth={2} dot={false} isAnimationActive={false}
                  activeDot={{ r: 4, stroke: RING, strokeWidth: 2 }} label={end(`Nifty ${pct(r.bench_since, 1)}`, "#a9b3ab")} />
            <Line dataKey="you" stroke={GREEN} strokeWidth={2} dot={false} isAnimationActive={false}
                  activeDot={{ r: 4, stroke: RING, strokeWidth: 2 }} label={end(`You ${pct(r.since, 1)}`, "#eef2ee")} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {gapNow != null && (
        <p className="text-[13px] text-[#8b968e]">
          Today the household is {Math.abs(gapNow).toFixed(1)} points {gapNow > 0 ? "behind" : "ahead of"} the index
          {gapNow > 0 && gapNow >= Math.max(...gaps) ? ", its widest gap so far." : "."} Hover any day for both values.
        </p>
      )}
    </section>
  );
}

const CALL = {
  sell: { label: "Sell", fill: "#f39a87", ink: "#0f1a12" },
  trim: { label: "Trim", fill: "#a65a4b", ink: "#ffffff" },
  hold: { label: "Hold", fill: "#3a433d", ink: "#eef2ee" },
} as const;
const VERDICT_LABEL: Record<string, string> = { SELL: "Sell", SELL_ON_BOUNCE: "Sell on bounce", TRIM: "Trim" };

export function FlaggedCard({ sum, top }: { sum: Record<keyof typeof CALL, number>; top: Flagged[] }) {
  const total = sum.sell + sum.trim + sum.hold;
  if (total <= 0) return null;
  const parts = (Object.keys(CALL) as (keyof typeof CALL)[]).filter((k) => sum[k] > 0).map((k) => ({ k, v: sum[k], share: (sum[k] / total) * 100 }));
  return (
    <Link href="/advisor" aria-labelledby="fl-h" className="glass rounded-3xl p-5 flex flex-col gap-3.5 hover:bg-white/[0.02] transition-colors">
      <h2 id="fl-h" className="text-[15px] font-medium text-[#eef2ee]">
        How much of the book is flagged <span className="text-[#8b968e] font-normal">· by value, both accounts</span>
      </h2>
      <div className="flex gap-0.5" role="img" aria-label={parts.map((p) => `${CALL[p.k].label} ${Math.round(p.share)}%, ${lakh(p.v)}`).join("; ")}>
        {parts.map((p) => (
          <span key={p.k} title={`${CALL[p.k].label} · ${lakh(p.v)} · ${p.share.toFixed(1)}%`}
                className="h-7 rounded flex items-center pl-2.5 text-[13px] font-medium whitespace-nowrap overflow-visible"
                style={{ width: `${p.share}%`, background: CALL[p.k].fill, color: CALL[p.k].ink }}>
            {p.share >= 9 ? `${Math.round(p.share)}%` : ""}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[#a9b3ab]">
        {parts.map((p) => (
          <span key={p.k} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: CALL[p.k].fill, boxShadow: p.k === "hold" ? "inset 0 0 0 1px rgba(255,255,255,0.2)" : undefined }} />
            {CALL[p.k].label} {lakh(p.v)}{p.share < 9 ? ` · ${Math.round(p.share)}%` : ""}
          </span>
        ))}
      </div>
      {top.length > 0 && (
        <div className="flex flex-col">
          <span className="text-xs text-[#8b968e] pb-1">Biggest flagged holdings</span>
          {top.map((f) => (
            <div key={f.account + f.symbol} className="grid grid-cols-[10px_1fr_auto] gap-2.5 items-baseline text-[13px] py-[7px] border-t border-white/[0.06]">
              <span aria-hidden className="w-2 h-2 rounded-sm" style={{ background: f.verdict === "TRIM" ? CALL.trim.fill : CALL.sell.fill }} />
              <span className="min-w-0 truncate"><span className="text-[#eef2ee]">{f.symbol}</span> <span className="text-[#8b968e]">{ACCOUNT_NAME[f.account] ?? f.account} · {VERDICT_LABEL[f.verdict] ?? f.verdict}</span></span>
              <span className="text-[#eef2ee] tabular-nums">{inr(f.value)}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

export function RiskSourceCard({ book }: { book: HouseholdBook }) {
  const rows = book.risk.top_contributors ?? [];
  if (!rows.length) return null;
  const mx = Math.max(4, Math.ceil(Math.max(...rows.flatMap((r) => [r.risk_pct, r.value_pct])) / 2) * 2);
  const ticks = Array.from({ length: mx / 2 + 1 }, (_, i) => i * 2);
  const at = (v: number) => `${(v / mx) * 100}%`;
  const dot = (v: number, color: string, label: string) => (
    <span title={label} className="absolute top-px w-2.5 h-2.5 -ml-[5px] rounded-full" style={{ left: at(v), background: color, boxShadow: `0 0 0 2px ${RING}` }} />
  );
  const grid = "grid grid-cols-[84px_1fr_88px] sm:grid-cols-[96px_1fr_92px] gap-3";
  return (
    <Link href="/household" aria-labelledby="rv-h" className="glass rounded-3xl p-5 flex flex-col gap-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex flex-wrap justify-between items-baseline gap-x-4 gap-y-1.5">
        <h2 id="rv-h" className="text-[15px] font-medium text-[#eef2ee]">Where the risk comes from</h2>
        <span className="flex gap-3.5 text-[13px] text-[#a9b3ab]">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: MARK_GREY }} />share of value</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: GOLD }} />share of risk</span>
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-[#8b968e]">Top {rows.length} names by risk. When gold sits right of grey, the name swings the book more than its size suggests.</p>
      {rows.map((r) => {
        const [a, b] = [Math.min(r.value_pct, r.risk_pct), Math.max(r.value_pct, r.risk_pct)];
        return (
          <div key={r.symbol} className={`${grid} items-center h-[30px] text-[13px]`}>
            <span className="text-[#eef2ee] truncate">{r.symbol}</span>
            <span className="relative h-3">
              <span className="absolute top-[5px] h-0.5 bg-[#eef2ee]/25" style={{ left: at(a), width: `${((b - a) / mx) * 100}%` }} />
              {dot(r.value_pct, MARK_GREY, `${r.symbol}: ${r.value_pct}% of value`)}
              {dot(r.risk_pct, GOLD, `${r.symbol}: ${r.risk_pct}% of risk`)}
            </span>
            <span className="text-right tabular-nums text-[#eef2ee]">{r.risk_pct}% <span className="text-[#8b968e]">of {r.value_pct}%</span></span>
          </div>
        );
      })}
      <div className={`${grid} text-xs text-[#8b968e]`}>
        <span /><span className="relative h-3.5">{ticks.map((t) => <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: at(t) }}>{t}%</span>)}</span><span />
      </div>
    </Link>
  );
}
