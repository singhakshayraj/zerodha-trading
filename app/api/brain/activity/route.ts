import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const limit = Number(searchParams.get("limit") ?? 50);

    const activity = await db.getBrainActivity(sessionId, Math.min(limit, 200));

    return NextResponse.json({ activity });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg, activity: [] }, { status: 500 });
  }
}
