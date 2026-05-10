import { NextRequest, NextResponse } from "next/server";
import { makeKiteRequest } from "@/lib/zerodha";
import * as db from "@/lib/db";

interface KiteQuote {
  last_price: number;
  net_change: number;
  ohlc: { close: number };
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { sessionId, contextData } = await req.json();
    if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });

    // Try to enrich with live Nifty data
    let niftyPrice: number | undefined;
    let niftyChangePct: number | undefined;
    try {
      const quotes = await makeKiteRequest<Record<string, KiteQuote>>(
        token,
        "GET",
        "/quote?i=NSE:NIFTY+50"
      );
      const nifty = quotes["NSE:NIFTY 50"];
      if (nifty) {
        niftyPrice = nifty.last_price;
        niftyChangePct = nifty.ohlc?.close
          ? ((nifty.last_price - nifty.ohlc.close) / nifty.ohlc.close) * 100
          : nifty.net_change;
      }
    } catch {
      // Non-fatal
    }

    const merged = {
      market_direction: contextData?.market_direction ?? "SIDEWAYS",
      ...contextData,
      ...(niftyPrice !== undefined && { nifty_price: niftyPrice }),
      ...(niftyChangePct !== undefined && { nifty_change_pct: niftyChangePct }),
    };

    await db.logMarketContext(sessionId, merged);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
