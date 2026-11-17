import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Household book (both accounts) published by the brain's household_book.py,
// plus the latest 200 tradebook rows for the ledger. Read-only.
export async function GET() {
  try {
    const [cfg, ledger] = await Promise.all([
      supabaseServer.from("app_config").select("key, value").in("key", ["household_book_latest", "household_targets"]),
      supabaseServer.from("tradebook").select("account, symbol, trade_type, quantity, price, trade_date")
        .order("trade_date", { ascending: false }).order("trade_id", { ascending: true }).limit(200),
    ]);
    for (const q of [cfg, ledger]) if (q.error) throw q.error;
    const parsed: Record<string, unknown> = {};
    for (const c of cfg.data ?? []) {
      try { if (c.value) parsed[c.key as string] = JSON.parse(c.value as string); } catch { /* bad value -> absent */ }
    }
    return NextResponse.json({
      book: parsed.household_book_latest ?? null,
      targets: parsed.household_targets ?? null,
      ledger: ledger.data ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
