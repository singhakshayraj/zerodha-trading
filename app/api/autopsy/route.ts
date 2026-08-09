import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { buildLadder, levelIndex, type Bar, type Ladder } from "@/lib/exit-replay";

export const dynamic = "force-dynamic";

// ── Exit-Policy Frontier ─────────────────────────────────────────────────────
// Answers a question the paper record alone cannot: of the money this strategy
// lost, how much was the ENTRIES being wrong vs the EXIT RULE being wrong vs
// transaction costs?
//
// Every closed trade stores its path extremes in R — mfe_r (best unrealized R
// it ever reached) and mae_r (worst). That is enough to replay any fixed exit
// policy (take profit at +T, stop at -S) against the paths the strategy really
// walked, WITHOUT needing the Kite historical data that gate #6 is blocked on.
//
// For a policy (T, S) each trade falls into one of four cases:
//   mfe >= T, mae  > -S  → only the target was touched          → exit +T
//   mfe  < T, mae <= -S  → only the stop was touched            → exit -S
//   mfe  < T, mae  > -S  → neither touched                      → its real exit
//   mfe >= T, mae <= -S  → BOTH touched, and the extremes do
//                          not record which came first          → AMBIGUOUS
//
// PHASE 2 ([P-30]) attacks that last case. The 5-minute `candles` archive can
// ORDER the two touches: whichever level a bar reaches first decides the trade.
// So each trade also ships a first-touch LADDER (see lib/exit-replay.ts) and
// the client resolves most ambiguous trades exactly.
//
// The bounds do not go away — they narrow. Two residuals survive:
//   • INTRA-BAR — one 5-minute bar touched both levels; the sequence inside it
//     is unknowable at this resolution.
//   • NO DATA   — no archived bar covers the holding window (a trade shorter
//     than one bar, or a symbol/day the archive missed).
// `optimistic`/`pessimistic` now govern only those, so if even the OPTIMISTIC
// surface never crosses zero the verdict remains immune to what the data can't
// say — but it is now a far smaller thing being assumed.
//
// This route ships the raw per-trade primitives and lets the client sweep the
// grid, so the cost assumption stays a live dial rather than a baked-in guess.

type Row = {
  r: number;        // realized R, already NET of costs (charges are folded
                    // into the paper fill price, so pnl and r_multiple carry them)
  mfe: number;
  mae: number;
  risk: number;     // rupee risk per trade — the R denominator
  value: number;    // entry_value, for costing a counterfactual exit
  side: "LONG" | "SHORT";
  date: string;
  ladder: Ladder | null;  // phase-2 first-touch indices; null = no bars in window
};

type TradeRec = {
  r_multiple: number; mfe_r: number; mae_r: number; pnl: number; entry_value: number;
  position_type: string; created_at: string; symbol: string;
  entry_time: string | null; exit_time: string | null;
  entry_price: number | null; stop_loss_price: number | null;
  target_price: number | null; exit_reason: string | null;
};

type BarRow = { symbol: string; ts: string; open: number; high: number; low: number; close: number };

export async function GET() {
  try {
    // [P-36] One RPC instead of a paginated client-side fetch of two whole
    // tables. autopsy_dataset() returns the closed trades carrying excursion
    // data plus ONLY the bars inside their holding windows — the window
    // semi-join is a set operation, which belongs in Postgres, and it was
    // previously being done in JS over all 23,835 candles after 24 sequential
    // round trips. Returning a single jsonb row also sidesteps PostgREST's
    // 1000-row page cap, so the pagination loop disappears entirely.
    const { data, error } = await supabaseServer.rpc("autopsy_dataset");
    if (error) throw new Error(error.message);

    const payload = (data ?? {}) as { trades?: TradeRec[]; bars?: BarRow[] };
    const trades = payload.trades ?? [];
    const rawBars = payload.bars ?? [];

    const bySymbol = new Map<string, Bar[]>();
    for (const c of rawBars) {
      const ts = Date.parse(c.ts);
      const o = Number(c.open), h = Number(c.high), l = Number(c.low), cl = Number(c.close);
      if (!Number.isFinite(ts) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(o)) continue;
      let arr = bySymbol.get(c.symbol);
      if (!arr) bySymbol.set(c.symbol, (arr = []));
      arr.push({ ts, o, h, l, c: cl });
    }
    bySymbol.forEach((arr: Bar[]) => arr.sort((a, b) => a.ts - b.ts));

    const rows: Row[] = [];
    let dropped = 0;
    let withBars = 0;
    // Ground truth (acceptance criterion 4): trades whose real exit was a clean
    // stop or target already know the answer. The replay must agree there.
    const truth = { stopChecked: 0, stopAgree: 0, tgtChecked: 0, tgtAgree: 0, noData: 0 };

    for (const t of trades) {
      const r = Number(t.r_multiple);
      const mfe = Number(t.mfe_r);
      const mae = Number(t.mae_r);
      const pnl = Number(t.pnl);
      const value = Number(t.entry_value);

      // mfe < mae is physically impossible — the best excursion cannot be worse
      // than the worst. Such a row is corrupt, not informative; drop and count.
      // (Note mfe may be negative and mae positive: excursion tracking starts
      // after entry, so a trade that never went green has a negative "best".)
      if (!Number.isFinite(r) || !Number.isFinite(mfe) || !Number.isFinite(mae)) { dropped++; continue; }
      if (mfe < mae) { dropped++; continue; }

      // Rupee risk per R, recovered from the trade's own arithmetic. This is
      // the true per-trade denominator — the book sizes by Kelly, not a flat
      // 1%, so there is no single ₹-per-R constant to assume.
      const risk = r !== 0 ? Math.abs(pnl / r) : NaN;
      if (!Number.isFinite(risk) || risk <= 0 || !Number.isFinite(value) || value <= 0) { dropped++; continue; }

      const side: "LONG" | "SHORT" = t.position_type === "SHORT" ? "SHORT" : "LONG";

      // ── phase 2: the trade's bar window ──────────────────────────────────
      // Whole bars only. A bar is stamped at its START, so the bar containing
      // the entry also contains PRE-entry action and could register a touch
      // that never happened to this position — excluding it costs up to five
      // minutes and is the conservative direction.
      const entryPx = Number(t.entry_price);
      const stopPx = Number(t.stop_loss_price);
      const rps = Math.abs(entryPx - stopPx);
      const t0 = t.entry_time ? Date.parse(t.entry_time) : NaN;
      const t1 = t.exit_time ? Date.parse(t.exit_time) : NaN;

      let ladder: Ladder | null = null;
      if (Number.isFinite(t0) && Number.isFinite(t1) && rps > 0 && Number.isFinite(entryPx)) {
        const all = bySymbol.get(t.symbol) ?? [];
        const win = all.filter((b) => b.ts >= t0 && b.ts <= t1);
        if (win.length) { ladder = buildLadder(side, entryPx, rps, win); withBars++; }
      }

      if (ladder) {
        if (t.exit_reason === "STOP_LOSS_HIT") {
          // The live stop sits at exactly 1.00R adverse, so the bars must show
          // the 1.00R stop level being touched.
          truth.stopChecked++;
          if (ladder.dn[levelIndex(1.0)] !== null) truth.stopAgree++;
        } else if (t.exit_reason === "TARGET_HIT" && Number.isFinite(Number(t.target_price))) {
          // The live target is wherever the signal put it; snap to the ladder.
          const lvl = Math.round((Math.abs(Number(t.target_price) - entryPx) / rps) / 0.25) * 0.25;
          if (lvl >= 0.25 && lvl <= 4.0) {
            truth.tgtChecked++;
            if (ladder.up[levelIndex(lvl)] !== null) truth.tgtAgree++;
          }
        }
      } else if (t.exit_reason === "STOP_LOSS_HIT" || t.exit_reason === "TARGET_HIT") {
        truth.noData++;
      }

      rows.push({
        r, mfe, mae, risk, value, side, ladder,
        date: String(t.created_at).slice(0, 10),
      });
    }

    const days = new Set(rows.map((r) => r.date)).size;

    return NextResponse.json({
      rows,
      meta: {
        n: rows.length,
        dropped,
        days,
        firstDate: rows[0]?.date ?? null,
        lastDate: rows[rows.length - 1]?.date ?? null,
        withBars,
        barCoveragePct: rows.length ? (100 * withBars) / rows.length : 0,
        truth,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
