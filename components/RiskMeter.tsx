"use client";

// Live daily-risk meter — the VISION §4c daily contract made visible.
// One horizontal track from the hard floor (−maxLoss%) to the ceiling
// (+maxProfit%), with the 3R operational stop (~−3% of capital, the working
// stop that fires first) and zero marked, and the live session P&L as a
// marker. Turns "watching a number drift" into "seeing risk against the
// lines that stop the machine." Reused by the trading page and (later) the
// command-center landing page.

const RED = "#ef4444", AMBER = "#f59e0b", GREEN = "#22c55e";
const INR = (n: number) => (n < 0 ? "-" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export function RiskMeter({
  pnl,
  capital,
  maxLossPct,
  maxProfitPct,
}: {
  pnl: number;
  capital: number;
  maxLossPct: number;
  maxProfitPct: number;
}) {
  if (!capital || capital <= 0) return null;

  const pnlPct = (pnl / capital) * 100;
  const floorPct = -Math.abs(maxLossPct);
  const ceilPct = Math.abs(maxProfitPct);
  // 3R operational stop ≈ −3% of capital; never below the hard floor.
  const stopPct = -Math.min(3, Math.abs(maxLossPct));

  const floorAmt = (floorPct / 100) * capital;
  const ceilAmt = (ceilPct / 100) * capital;

  // position 0..100 across the track for a given % value
  const span = ceilPct - floorPct;
  const pos = (v: number) => ((Math.max(floorPct, Math.min(ceilPct, v)) - floorPct) / span) * 100;

  const zeroPos = pos(0);
  const valPos = pos(pnlPct);
  const stopPos = pos(stopPct);

  const pastStop = pnlPct <= stopPct;
  const pastFloor = pnlPct <= floorPct;
  const barColor = pnlPct >= 0 ? GREEN : pastStop ? RED : AMBER;

  // headline: how much room before the next binding line
  let headline: string;
  if (pnlPct >= 0) {
    headline = `${INR(Math.max(0, ceilAmt - pnl))} before the +${ceilPct}% ceiling`;
  } else if (pastFloor) {
    headline = `past the −${Math.abs(floorPct)}% hard floor`;
  } else if (pastStop) {
    headline = `past the 3R stop · ${INR(Math.max(0, Math.abs(floorAmt) - Math.abs(pnl)))} before the hard floor`;
  } else {
    headline = `${INR(Math.abs(pnl - stopPct / 100 * capital))} before the 3R stop`;
  }

  // left fill (loss) runs from value→zero when negative; right fill (profit)
  // from zero→value when positive.
  const fillLeft = pnlPct < 0 ? valPos : zeroPos;
  const fillWidth = Math.abs(valPos - zeroPos);

  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[10px] text-[#444] uppercase tracking-wider">Daily risk</span>
        <span className="text-[11px]" style={{ color: barColor }}>
          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}% · {headline}
        </span>
      </div>

      <div className="relative h-6">
        {/* track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full bg-[#1a1a1a]" />
        {/* danger zone: floor → 3R stop */}
        <div className="absolute top-1/2 -translate-y-1/2 h-2 rounded-l-full" style={{ left: 0, width: `${stopPos}%`, background: `${RED}22` }} />
        {/* caution zone: 3R stop → zero */}
        <div className="absolute top-1/2 -translate-y-1/2 h-2" style={{ left: `${stopPos}%`, width: `${zeroPos - stopPos}%`, background: `${AMBER}1a` }} />
        {/* fill */}
        <div className="absolute top-1/2 -translate-y-1/2 h-2 rounded-full transition-all" style={{ left: `${fillLeft}%`, width: `${fillWidth}%`, background: barColor }} />
        {/* 3R stop tick */}
        <div className="absolute top-0 h-6 w-px" style={{ left: `${stopPos}%`, background: RED }} title="3R operational stop" />
        {/* zero tick */}
        <div className="absolute top-0 h-6 w-px bg-[#555]" style={{ left: `${zeroPos}%` }} />
        {/* value marker */}
        <div className="absolute -top-0.5 w-2 h-7 rounded-sm -translate-x-1/2 border border-[#0a0a0a]" style={{ left: `${valPos}%`, background: barColor }} />
      </div>

      <div className="relative h-4 mt-1 text-[9px] text-[#555]">
        <span className="absolute left-0" style={{ color: RED }}>−{Math.abs(floorPct)}%</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${stopPos}%`, color: `${RED}cc` }}>3R</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${zeroPos}%` }}>0</span>
        <span className="absolute right-0" style={{ color: GREEN }}>+{ceilPct}%</span>
      </div>
    </div>
  );
}
