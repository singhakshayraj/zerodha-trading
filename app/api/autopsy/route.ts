import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

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
// The ambiguous case is the honest hard part, and we do not paper over it: we
// return both bounds. `optimistic` resolves every ambiguity as target-first
// (the most generous reading physically available); `pessimistic` resolves all
// of them as stop-first. If even the OPTIMISTIC surface never crosses zero, no
// ordering of any tick could have made that policy profitable — the verdict is
// immune to the one thing the data can't tell us.
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
};

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("trades")
      .select("r_multiple, mfe_r, mae_r, pnl, entry_value, position_type, created_at")
      .eq("status", "CLOSED")
      .not("r_multiple", "is", null)
      .not("mfe_r", "is", null)
      .not("mae_r", "is", null)
      .order("created_at", { ascending: true })
      .limit(5000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows: Row[] = [];
    let dropped = 0;

    for (const t of data ?? []) {
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

      rows.push({
        r, mfe, mae, risk, value,
        side: t.position_type === "SHORT" ? "SHORT" : "LONG",
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
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
