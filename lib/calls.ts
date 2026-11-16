// [P-60] Shared by /advisor/calls and the Ask drawer's call_scores tool.

export const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export type Call = { source: string; account: string; symbol: string; call: string; entry: number | null; days: number;
  signed_alpha_pct: number; mae_pct: number; mfe_pct: number; worst_day: number; pair_pct: number | null; target: string | null;
  correct: boolean; early_wrong_days: number; should_have_sold: boolean;
  sector_alpha_pct?: number | null; size_alpha_pct?: number | null;
  path: { date: string; td: number; signed_alpha_pct: number; nifty_pct: number }[];
  context: { regime: string | null; trigger_type: string | null; confidence: number | null; reasons: string[] } };

/** "SELL ATGL 2026-11-03: right, +8.0% vs Nifty after 11 days; worst point -1.0% on day 1 (vs sector +6.5%) · switch +9.7% after costs" */
export function verdictSentence(c: Call, runDate: string): string {
  let s = `${c.call} ${c.symbol} ${runDate}: ${c.correct ? "right" : "wrong"}, ${pct(c.signed_alpha_pct)} vs Nifty after ${c.days} days; `
    + `worst point ${c.mae_pct.toFixed(1)}% on day ${c.worst_day}`;
  if (c.sector_alpha_pct != null) s += ` (vs sector ${pct(c.sector_alpha_pct)})`;
  if (c.should_have_sold) s += " — should have sold";
  if (c.pair_pct != null) s += ` · switch ${pct(c.pair_pct)} after costs`;
  return s;
}
