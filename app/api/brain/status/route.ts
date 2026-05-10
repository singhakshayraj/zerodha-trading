import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const heartbeat = await db.getBrainHeartbeat();

    if (!heartbeat) {
      return NextResponse.json({
        status: "OFFLINE",
        lastPing: null,
        currentCycle: null,
        message: "No heartbeat received yet",
        secondsSinceLastPing: null,
      });
    }

    const secondsSinceLastPing = Math.floor(
      (Date.now() - new Date(heartbeat.last_ping).getTime()) / 1000
    );

    const effectiveStatus =
      secondsSinceLastPing > 120 ? "OFFLINE" : heartbeat.status;

    return NextResponse.json({
      status: effectiveStatus,
      lastPing: heartbeat.last_ping,
      currentCycle: heartbeat.current_cycle,
      message: heartbeat.message,
      secondsSinceLastPing,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg, status: "OFFLINE" }, { status: 500 });
  }
}
