// Underweight-sector buys from the brain's household rebalance list (both
// accounts as one book). Funded by today's TRIM/SELL proceeds that rotation
// does not reuse; each new name is capped at 3% of the household.
import { inr } from "@/lib/format";
import { ACCOUNT_NAME } from "@/lib/attention";

export type Underweight = {
  kind: "underweight"; sector: string; gap_pp: number; gap_inr?: number;
  buy?: { symbol: string; score: number; account: string; qty: number; price: number; inr: number } | null;
  note?: string | null; ideas?: string[];
};

export function RebalanceBuys({ rows }: { rows: Underweight[] }) {
  return (
    <div data-testid="rebalance-buys" className="space-y-2.5">
      {rows.map((u) => (
        <div key={u.sector} className="text-[12px] leading-relaxed">
          <p>{u.sector} <span className="text-[#8b968e]">{u.gap_pp.toFixed(1)}pp under index weight{u.gap_inr ? ` · ${inr(u.gap_inr)} to close` : ""}</span></p>
          {u.buy
            ? <p className="text-[#9be15d]">Buy {u.buy.qty} {u.buy.symbol} in {ACCOUNT_NAME[u.buy.account] ?? u.buy.account} · {inr(u.buy.inr)} <span className="text-[#8b968e]">score {u.buy.score}</span></p>
            : u.note && <p className="text-[#8b968e]">{u.note}</p>}
          {(u.ideas?.length ?? 0) > 1 && <p className="text-[#8b968e]">Also scoring well: {u.ideas!.filter((s) => s !== u.buy?.symbol).join(", ")}</p>}
        </div>
      ))}
    </div>
  );
}
