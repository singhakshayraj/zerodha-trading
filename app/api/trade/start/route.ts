import { NextRequest, NextResponse } from "next/server";
import { makeKiteRequest } from "@/lib/zerodha";
import { ZerodhaError } from "@/lib/types";
import * as db from "@/lib/db";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { config } = await req.json();

    // Create DB session
    const session = await db.createSession(config ?? {});

    // Fetch holdings and seed stock universe
    try {
      const holdings = await makeKiteRequest<{ tradingsymbol: string; exchange: string }[]>(
        token,
        "GET",
        "/portfolio/holdings"
      );
      await db.addHoldingsToUniverse(
        holdings.map((h) => ({ tradingsymbol: h.tradingsymbol, exchange: h.exchange }))
      );
    } catch {
      // Non-fatal — universe seeding failure shouldn't block session start
    }

    const topStocks = await db.getTopScoredStocks(20);

    return NextResponse.json({ sessionId: session.id, topStocks });
  } catch (err) {
    if (err instanceof ZerodhaError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
