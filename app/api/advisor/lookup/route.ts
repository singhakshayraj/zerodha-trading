import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ── Advisor lookup: any Nifty-500 name, not just holdings ────────────────────
// The daily rotation scan already scores the whole Nifty 500 and persists the
// result to stock_universe.advisor_score (portfolio_advisor.py). 485 of 505
// names carry a score. So this is a read, not new scoring machinery — nothing
// here re-implements the 7-factor model, which lives in Python and must stay
// the single source of truth.
//
// What that buys, and what it costs: the score is only as fresh as the last
// advisor run. The route returns `scoredAt` so the UI can say so rather than
// implying a live read.

/** Same thresholds advise() uses, so the label matches what the advisor would
 *  say. Deliberately NOT called a "verdict": advise() also weighs support,
 *  overbought and weekly alignment before choosing HOLD vs TRIM vs SELL. */
function band(score: number) {
  if (score >= 20) return { label: "Uptrend", tone: "good" as const };
  if (score <= -20) return { label: "Downtrend", tone: "bad" as const };
  return { label: "Mixed", tone: "mid" as const };
}

export async function GET(req: Request) {
  try {
    const q = (new URL(req.url).searchParams.get("symbol") || "")
      .trim().toUpperCase();
    if (!q) return NextResponse.json({ error: "symbol required" }, { status: 400 });

    const { data, error } = await supabaseServer
      .from("stock_universe")
      .select("symbol, company_name, sector, industry, advisor_score, advisor_score_updated_at, advisor_detail, is_nifty50, is_nifty500")
      .ilike("symbol", `${q}%`)
      .order("symbol")
      .limit(8);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    // Exact match wins; otherwise the prefix hits become suggestions, which is
    // what makes a half-remembered ticker usable.
    const exact = rows.find((r) => r.symbol === q) ?? null;

    // Is it already in the book? A held name has its own full verdict on this
    // page, and pointing there beats showing a bare score.
    let held = false;
    if (exact) {
      const { data: h } = await supabaseServer
        .from("portfolio_advice")
        .select("symbol")
        .eq("symbol", exact.symbol)
        .eq("is_official", true)
        .order("run_date", { ascending: false })
        .limit(1);
      held = (h?.length ?? 0) > 0;
    }

    return NextResponse.json({
      query: q,
      match: exact
        ? {
            symbol: exact.symbol,
            name: exact.company_name,
            sector: exact.sector,
            industry: exact.industry,
            score: exact.advisor_score,
            scoredAt: exact.advisor_score_updated_at,
            band: exact.advisor_score === null ? null : band(exact.advisor_score),
            // Full advise() output the daily scan now stores: verdict, reasons,
            // counter_case, levels. Null until the next scan runs.
            detail: exact.advisor_detail ?? null,
            inNifty50: exact.is_nifty50,
            // Distinguishes "the scan has not covered it yet" from "it is not
            // in the scanned universe at all" — TATAMOTORS is is_nifty500=false,
            // so an unscored result there is expected, not a gap.
            inScanUniverse: exact.is_nifty500 === true,
            held,
          }
        : null,
      // Every prefix hit, including the exact one — the search box uses this
      // as a typeahead list, so filtering out the exact match would make the
      // dropdown drop the item you just finished typing.
      options: rows.map((r) => ({
        symbol: r.symbol,
        name: r.company_name,
        score: r.advisor_score,
      })),
      suggestions: rows.filter((r) => r.symbol !== q).map((r) => r.symbol),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
