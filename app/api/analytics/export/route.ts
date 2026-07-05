/**
 * Training-dataset export: sessions + trades + decisions + daily rollup
 * for a date range, as JSON or CSV.
 *
 * Auth: `Authorization: Bearer <ANALYTICS_EXPORT_TOKEN>` (env var). This is
 * a standalone secret for offline analysis scripts — NOT the Kite enc-token.
 *
 * Query params:
 *   from     ISO date (default: 30 days ago)
 *   to       ISO date inclusive (default: today)
 *   dataset  sessions | trades | decisions | daily | all (default: all; CSV requires a single dataset)
 *   format   json | csv (default: json)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;

async function fetchAll(
  table: string,
  timeColumn: string,
  fromIso: string,
  toIso: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabaseServer
      .from(table)
      .select("*")
      .gte(timeColumn, fromIso)
      .lte(timeColumn, toIso)
      .order(timeColumn, { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  const expected = process.env.ANALYTICS_EXPORT_TOKEN;
  const auth = req.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const to = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
  const from =
    url.searchParams.get("from") ??
    new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const dataset = url.searchParams.get("dataset") ?? "all";
  const format = url.searchParams.get("format") ?? "json";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "from/to must be YYYY-MM-DD" }, { status: 400 });
  }
  // Inclusive end of day for timestamp columns
  const fromIso = `${from}T00:00:00Z`;
  const toIso = `${to}T23:59:59.999Z`;

  try {
    const fetchers: Record<string, () => Promise<Record<string, unknown>[]>> = {
      sessions: () => fetchAll("trading_sessions", "started_at", fromIso, toIso),
      trades: () => fetchAll("trades", "entry_time", fromIso, toIso),
      decisions: () => fetchAll("brain_decisions", "decided_at", fromIso, toIso),
      daily: async () => {
        const { data, error } = await supabaseServer
          .from("performance_daily")
          .select("*")
          .gte("trade_date", from)
          .lte("trade_date", to);
        if (error) throw new Error(`performance_daily: ${error.message}`);
        return data ?? [];
      },
    };

    if (dataset !== "all" && !fetchers[dataset]) {
      return NextResponse.json(
        { error: "dataset must be sessions|trades|decisions|daily|all" },
        { status: 400 }
      );
    }

    if (format === "csv") {
      if (dataset === "all") {
        return NextResponse.json(
          { error: "CSV export requires a single dataset (not 'all')" },
          { status: 400 }
        );
      }
      const rows = await fetchers[dataset]();
      return new NextResponse(toCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${dataset}_${from}_${to}.csv"`,
        },
      });
    }

    const names = dataset === "all" ? Object.keys(fetchers) : [dataset];
    const out: Record<string, unknown> = { from, to, exported_at: new Date().toISOString() };
    for (const name of names) {
      out[name] = await fetchers[name]();
    }
    return NextResponse.json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
