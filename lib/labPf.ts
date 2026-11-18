// [P-70] Lab profit factor for the home card: ₹ won on winning trades ÷ ₹ lost
// on losing trades, after charges, all 54 lab variants pooled (apples to apples
// with the old single engine's 0.37). Reads /api/lab's payload; pure.
export const PF_START = 0.37; // old intraday engine at the 2026-09-09 decommission
export const PF_TARGET = 1.3; // pre-registered promotion floor
export const MIN_TRADES = 300; // same bar as /lab before a variant's PF is worth reading

type Row = { trade_date: string; strategy_id: string; n?: number; net_win_inr?: number; net_loss_inr?: number };
type Latest = { strategy_id: string; cum_n: number; pf: number | null };
export type LabPf = {
  pf: number | null; trades: number; days: { date: string; pf: number | null }[];
  best: { id: string; pf: number; n: number } | null; leader: { id: string; pf: number; n: number } | null;
};

const ratio = (w: number, l: number) => (l > 0 ? w / l : null);

export function labPf(p: { series?: Row[]; latest?: Latest[] }): LabPf {
  const byDay = new Map<string, { w: number; l: number; n: number }>();
  for (const r of p.series ?? []) {
    const d = byDay.get(r.trade_date) ?? { w: 0, l: 0, n: 0 };
    d.w += Number(r.net_win_inr) || 0;
    d.l += Math.abs(Number(r.net_loss_inr) || 0);
    d.n += Number(r.n) || 0;
    byDay.set(r.trade_date, d);
  }
  const days = Array.from(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, pf: ratio(d.w, d.l) }));
  const all = Array.from(byDay.values()).reduce((a, d) => ({ w: a.w + d.w, l: a.l + d.l, n: a.n + d.n }), { w: 0, l: 0, n: 0 });
  const ranked = (p.latest ?? []).filter((r) => r.pf != null)
    .map((r) => ({ id: r.strategy_id, pf: Number(r.pf), n: Number(r.cum_n) }))
    .sort((a, b) => b.pf - a.pf);
  return {
    pf: ratio(all.w, all.l), trades: all.n, days,
    best: ranked.find((r) => r.n >= MIN_TRADES) ?? null, // counts toward the target
    leader: ranked[0] ?? null,                            // shown only as "too early"
  };
}
