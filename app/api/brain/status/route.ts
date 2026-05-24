import { NextRequest, NextResponse } from "next/server";
import { Logger } from "next-axiom";
import * as db from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const log = new Logger();
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    const heartbeat = await db.getBrainHeartbeat();

    if (!heartbeat) {
      return NextResponse.json({
        status: "OFFLINE",
        lastPing: null,
        isAlive: false,
        message: "No heartbeat received yet",
        currentCycle: null,
        secondsSinceLastPing: null,
      });
    }

    const secondsSinceLastPing = heartbeat.last_ping
      ? Math.floor((Date.now() - new Date(heartbeat.last_ping).getTime()) / 1000)
      : null;

    const isAlive = secondsSinceLastPing !== null && secondsSinceLastPing < 120;
    const effectiveStatus = isAlive ? heartbeat.status : "OFFLINE";

    log.info("brain status", {
      app: "zerodha-trader",
      tag: "api",
      route: "brain/status",
      status: effectiveStatus,
      isAlive,
      secondsSinceLastPing,
      currentCycle: heartbeat.current_cycle,
    });
    await log.flush();

    return NextResponse.json({
      status: effectiveStatus,
      lastPing: heartbeat.last_ping,
      isAlive,
      message: heartbeat.message,
      currentCycle: heartbeat.current_cycle,
      secondsSinceLastPing,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    log.error("api exception", {
      app: "zerodha-trader",
      tag: "api",
      route: "brain/status",
      error: msg,
    });
    await log.flush();
    return NextResponse.json(
      { status: "OFFLINE", lastPing: null, isAlive: false, message: msg, currentCycle: null, secondsSinceLastPing: null },
      { status: 500 }
    );
  }
}
