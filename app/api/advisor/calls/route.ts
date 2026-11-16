import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// [P-60] Every call made on one day with its daily score path (brain
// call_outcomes.py). Population "holdings" = Kanaklata + Natwar calls and the
// buy targets they named; "universe" = the Nifty 500 scan. Worst first.

type Out = { source: string; account: string; symbol: string; td: number; date: string;
  signed_alpha_pct: number; nifty_pct: number; mae_pct: number; mfe_pct: number; pair_pct: number | null };
type Src = { symbol: string; verdict: string; sector_verdict?: string | null; last_price: number | null;
  regime?: string | null; market_regime?: string | null; trigger_type: string | null; confidence: number | null;
  reasons?: string[] | null; rotation_target_symbol?: string | null; rotation_buy_price?: number | null; account?: string };

const SELLS = ["SELL", "SELL_ON_BOUNCE", "TRIM"];

async function paged<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await q(off, off + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const universe = req.nextUrl.searchParams.get("population") === "universe";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date=YYYY-MM-DD required" }, { status: 400 });
  const sources = universe ? ["universe"] : ["advice", "natwar", "target"];
  try {
    const srcCols = "symbol, verdict, last_price, trigger_type, confidence, rotation_target_symbol";
    const [rows, adv, nat, uni] = await Promise.all([
      paged<Out>((a, b) => supabaseServer.from("call_outcomes")
        .select("source, account, symbol, td, date, signed_alpha_pct, nifty_pct, mae_pct, mfe_pct, pair_pct")
        .eq("run_date", date).in("source", sources).order("source").order("account").order("symbol").order("td").range(a, b)),
      universe ? Promise.resolve([] as Src[]) : paged<Src>((a, b) => supabaseServer.from("portfolio_advice")
        .select(`${srcCols}, market_regime, reasons, rotation_buy_price`).eq("run_date", date).eq("is_official", true).range(a, b)),
      universe ? Promise.resolve([] as Src[]) : paged<Src>((a, b) => supabaseServer.from("account_calls")
        .select(`${srcCols}, account, sector_verdict, regime`).eq("run_date", date).range(a, b)),
      paged<Src>((a, b) => supabaseServer.from("universe_calls")
        .select("symbol, verdict, last_price, trigger_type, confidence, regime")
        .eq("run_date", date).range(a, b)),
    ]);
    const uniPx = new Map(uni.map((u) => [u.symbol, u.last_price]));
    // the row that made each call: [account|symbol] for holdings, [target|account|symbol] for targets
    const made = new Map<string, { row: Src; call: string; entry: number | null; target: string | null }>();
    for (const r of adv) {
      made.set(`advice|primary|${r.symbol}`, { row: r, call: r.verdict, entry: r.last_price, target: r.rotation_target_symbol ?? null });
      if (r.rotation_target_symbol && !made.has(`target|primary|${r.rotation_target_symbol}`))
        made.set(`target|primary|${r.rotation_target_symbol}`, { row: r, call: "BUY",
          entry: r.rotation_buy_price ?? uniPx.get(r.rotation_target_symbol) ?? null, target: null });
    }
    for (const r of nat) {
      const acct = r.account ?? "natwar";
      made.set(`natwar|${acct}|${r.symbol}`, { row: r, call: r.sector_verdict || r.verdict, entry: r.last_price, target: r.rotation_target_symbol ?? null });
      if (r.rotation_target_symbol && !made.has(`target|${acct}|${r.rotation_target_symbol}`))
        made.set(`target|${acct}|${r.rotation_target_symbol}`, { row: r, call: "BUY", entry: uniPx.get(r.rotation_target_symbol) ?? null, target: null });
    }
    if (universe) for (const r of uni) made.set(`universe|universe|${r.symbol}`, { row: r, call: r.verdict, entry: r.last_price, target: null });

    const groups = new Map<string, Out[]>();
    for (const r of rows) {
      const k = `${r.source}|${r.account}|${r.symbol}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    const calls = Array.from(groups.entries()).map(([k, path]) => {
      const m = made.get(k);
      const [source, account, symbol] = k.split("|");
      const last = path[path.length - 1];
      const n = (x: unknown) => Number(x);
      const firstRight = path.findIndex((p) => n(p.signed_alpha_pct) > 0);
      const mae = Math.min(...path.map((p) => n(p.mae_pct)));
      const worst = path.reduce((w, p) => (n(p.signed_alpha_pct) < n(w.signed_alpha_pct) ? p : w), path[0]);
      const call = m?.call ?? (source === "target" ? "BUY" : "?");
      return {
        source, account, symbol, call, entry: m?.entry != null ? n(m.entry) : null, days: last.td,
        signed_alpha_pct: n(last.signed_alpha_pct), mae_pct: mae, mfe_pct: Math.max(...path.map((p) => n(p.mfe_pct))),
        worst_day: worst.td, pair_pct: last.pair_pct != null ? n(last.pair_pct) : null, target: m?.target ?? null,
        correct: n(last.signed_alpha_pct) > 0, early_wrong_days: firstRight < 0 ? path.length : firstRight,
        should_have_sold: !SELLS.includes(call) && mae <= -10,
        path: path.map((p) => ({ date: p.date, td: p.td, signed_alpha_pct: n(p.signed_alpha_pct), nifty_pct: n(p.nifty_pct) })),
        context: { regime: m?.row.market_regime ?? m?.row.regime ?? null, trigger_type: m?.row.trigger_type ?? null,
          confidence: m?.row.confidence ?? null, reasons: (m?.row.reasons ?? []).slice(0, 4) },
      };
    }).sort((a, b) => a.signed_alpha_pct - b.signed_alpha_pct);
    return NextResponse.json({ run_date: date, calls });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
