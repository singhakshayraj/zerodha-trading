// [P-60] Inline-SVG path of one call: signed alpha (the call's score, solid)
// and the Nifty's own move (dashed) per trading day, with a zero line.
export function CallPath({ path }: { path: { td: number; signed_alpha_pct: number; nifty_pct: number }[] }) {
  const W = 280, H = 80, P = 4;
  const vals = path.flatMap((p) => [p.signed_alpha_pct, p.nifty_pct]).concat(0);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const maxTd = Math.max(...path.map((p) => p.td), 1);
  const x = (td: number) => P + ((td - 1) / Math.max(maxTd - 1, 1)) * (W - 2 * P);
  const y = (v: number) => P + ((hi - v) / span) * (H - 2 * P);
  const line = (k: "signed_alpha_pct" | "nifty_pct") => path.map((p) => `${x(p.td)},${y(p[k])}`).join(" ");
  const last = path[path.length - 1]?.signed_alpha_pct ?? 0;
  return (
    <svg data-testid="call-path" viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[320px] h-20" role="img"
      aria-label="Daily score of this call against the Nifty">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="#34443a" strokeWidth={1} />
      <polyline points={line("nifty_pct")} fill="none" stroke="#8b968e" strokeWidth={1} strokeDasharray="3 3" />
      <polyline points={line("signed_alpha_pct")} fill="none" stroke={last >= 0 ? "#9be15d" : "#f08a76"} strokeWidth={2} />
    </svg>
  );
}
