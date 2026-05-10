import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { sessionId, decisionData } = await req.json();
    if (!sessionId || !decisionData)
      return NextResponse.json({ error: "sessionId and decisionData are required" }, { status: 400 });

    const decision = await db.logDecision(sessionId, decisionData);
    return NextResponse.json({ id: decision.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
