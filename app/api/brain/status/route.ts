import { NextRequest, NextResponse } from "next/server";
import { Logger } from "next-axiom";
import * as db from "@/lib/db";
import { supabaseServer } from "@/lib/supabase";

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

    // Token freshness. [DESIGN_REVIEW 2026-08-23] found acquisition is the
    // system's only real failure mode: 45% uptime since 07-10, and every lost
    // day was a token that nobody pasted before the open. The brain writes a
    // durable `token_incident`, but nothing ever read it — so the trace existed
    // and was invisible.
    //
    // Staleness is measured against the MEASURED daily flush at ~04:34 IST
    // ([C6], 2026-08-10), not the "~06:00" four files used to assume. A token
    // last written before today's flush is already dead.
    const { data: cfg } = await supabaseServer
      .from("app_config")
      .select("key, value, updated_at")
      .in("key", ["enc_token", "token_incident"]);

    const tok = cfg?.find((r) => r.key === "enc_token");
    const incident = cfg?.find((r) => r.key === "token_incident")?.value || null;

    const nowIst = new Date(Date.now() + 5.5 * 3600 * 1000);
    const flush = new Date(nowIst);
    flush.setUTCHours(4, 34, 0, 0);           // 04:34 "IST" on the shifted clock
    if (nowIst < flush) flush.setUTCDate(flush.getUTCDate() - 1);
    const tokenWrittenIst = tok?.updated_at
      ? new Date(new Date(tok.updated_at).getTime() + 5.5 * 3600 * 1000)
      : null;

    const tokenStale =
      !tok?.value || !tokenWrittenIst || tokenWrittenIst < flush;

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
      tokenStale,
      tokenUpdatedAt: tok?.updated_at ?? null,
      tokenIncident: incident,
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
