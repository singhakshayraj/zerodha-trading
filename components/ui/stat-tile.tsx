/** Label-over-value tile shared by Advisor, Lab and P&L (was three identical copies). */
export function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-[#0d0d0d] border border-[#1c1c1c] px-3 py-2.5">
      <p className="text-xs text-[#8a8a8a] uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5 leading-none" style={{ color: color ?? "#f5f5f5" }}>{value}</p>
      {sub && <p className="text-xs text-[#8a8a8a] mt-1 leading-tight">{sub}</p>}
    </div>
  );
}
