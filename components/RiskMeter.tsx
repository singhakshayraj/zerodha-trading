"use client";
import { inr } from "@/lib/format";

// Live daily-risk meter — the VISION §4c daily contract made visible.
// One horizontal track from the hard floor (−maxLoss%) to the ceiling
// (+maxProfit%), with the 3R operational stop (~−3% of capital, the working
// stop that fires first) and zero marked, and the live session P&L as a
// marker. Turns "watching a number drift" into "seeing risk against the
// lines that stop the machine." Reused by the trading page and (later) the
// command-center landing page.

const RED = "#f08a76", AMBER = "#d9b84a", GREEN = "#9be15d";
const INR = (n: number) => inr(n);

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

  // ribbed track look (mockup C): thin vertical ribs instead of a solid bar
  const rib = (c: string) => `repeating-linear-gradient(90deg, ${c} 0 2px, transparent 2px 6px)`;

  return (
    <div className="glass rounded-3xl p-4 md:p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[15px] font-medium text-[#eef2ee]">Daily risk</span>
        <span className="text-[13px] text-[#a9b3ab]">{headline}</span>
      </div>

      <span className="text-[40px] leading-none font-light" style={{ color: pnlPct === 0 ? "#eef2ee" : barColor }}>
        {pnlPct >= 0 ? "+" : "−"}{Math.abs(pnlPct).toFixed(2)}%
      </span>

      <div>
        {/* 3R label sits above the track: below it, it collides with the floor label on narrow screens */}
        <div className="relative h-4 mb-1.5 text-xs">
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${stopPos}%`, color: RED }}>3R stop</span>
        </div>
        <div className="relative h-[26px] rounded-full ring-1 ring-inset ring-white/[0.06]" style={{ background: rib("rgba(255,255,255,0.14)") }}>
          {/* danger zone: floor → 3R stop */}
          <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${stopPos}%`, background: rib(`${RED}8c`) }} />
          {/* caution zone: 3R stop → zero */}
          <div className="absolute inset-y-0" style={{ left: `${stopPos}%`, width: `${zeroPos - stopPos}%`, background: rib(`${AMBER}4d`) }} />
          {/* fill */}
          <div className="absolute inset-y-0 transition-all" style={{ left: `${fillLeft}%`, width: `${fillWidth}%`, background: rib(barColor) }} />
          {/* 3R stop tick */}
          <div className="absolute -top-1 -bottom-1 w-0.5" style={{ left: `${stopPos}%`, background: RED }} title="3R operational stop" />
          {/* zero tick */}
          <div className="absolute -top-1 -bottom-1 w-px bg-[#6b776e]" style={{ left: `${zeroPos}%` }} />
          {/* value knob */}
          <div className="absolute top-[3px] w-5 h-5 -translate-x-1/2 rounded-full bg-[#eef2ee] transition-all"
               style={{ left: `${valPos}%`, boxShadow: `0 0 0 4px ${barColor}40` }} />
        </div>

        <div className="relative h-4 mt-2 text-xs text-[#8b968e]">
          <span className="absolute left-0" style={{ color: RED }}>−{Math.abs(floorPct)}%</span>
          <span className="absolute -translate-x-1/2" style={{ left: `${zeroPos}%` }}>0</span>
          <span className="absolute right-0" style={{ color: GREEN }}>+{ceilPct}%</span>
        </div>
      </div>
    </div>
  );
}
