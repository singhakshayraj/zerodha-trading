/** Label-over-value tile shared by Advisor, Lab and P&L (was three identical copies). */
export function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <p className="text-xs text-[#8b968e]">{label}</p>
      <p className="text-2xl font-light tabular-nums mt-1 leading-none" style={{ color: color ?? "#eef2ee" }}>{value}</p>
      {sub && <p className="text-xs text-[#8b968e] mt-1 leading-tight">{sub}</p>}
    </div>
  );
}
