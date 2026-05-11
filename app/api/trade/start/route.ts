import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

// Frontend only writes config to Supabase. Railway brain does all order placement.
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { config } = await req.json();

    const session = await db.createSession(config ?? {});

    const sessionConfig = {
      sessionId: session.id,
      capitalDeployed: config?.capital ?? 0,
      maxTrades: config?.maxTrades ?? 10,
      maxLossPercent: config?.maxLossPct ?? 5,
      maxProfitPercent: config?.maxProfitPct ?? 15,
      tradeIntervalSeconds: (config?.intervalMinutes ?? 5) * 60,
      stockUniverse: config?.universe ?? "HOLDINGS",
    };

    await db.writeConfig("session_config", JSON.stringify(sessionConfig));
    await db.writeConfig("brain_status", "START");

    return NextResponse.json({ sessionId: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
