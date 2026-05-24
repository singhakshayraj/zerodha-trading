import { NextResponse } from "next/server";
import { Logger } from "next-axiom";
import { supabaseServer } from "@/lib/supabase";

export async function GET() {
  const log = new Logger();
  try {
    // Tier 1: active_session_id from app_config
    const { data: configRows } = await supabaseServer
      .from("app_config")
      .select("key, value")
      .in("key", ["active_session_id", "session_config", "brain_status"]);

    const cfg = Object.fromEntries(
      (configRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
    );

    const rawSessionId = cfg["active_session_id"] ?? null;
    const sessionId =
      rawSessionId && rawSessionId !== "none" && rawSessionId !== ""
        ? rawSessionId
        : null;

    const sessionConfig = cfg["session_config"]
      ? (() => { try { return JSON.parse(cfg["session_config"]); } catch { return null; } })()
      : null;

    const brainStatus = cfg["brain_status"] ?? "OFFLINE";

    // No active session → return empty. Never fall back to stale prior sessions.
    if (!sessionId) {
      return NextResponse.json({
        trades: [],
        tradesCount: 0,
        sessionId: null,
        sessionConfig,
        brainStatus,
        isSessionActive: false,
      });
    }

    const { data: trades, error } = await supabaseServer
      .from("trades")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    if (error) {
      log.error("trades query error", {
        app: "zerodha-trader",
        tag: "api",
        route: "trades/live",
        sessionId,
        error: error.message,
      });
      await log.flush();
      return NextResponse.json({
        trades: [],
        tradesCount: 0,
        sessionId,
        sessionConfig,
        brainStatus,
        isSessionActive: false,
        error: error.message,
      });
    }

    const isSessionActive = Boolean(
      sessionId && (brainStatus === "RUNNING" || brainStatus === "IDLE")
    );

    log.info("trades fetched", {
      app: "zerodha-trader",
      tag: "api",
      route: "trades/live",
      sessionId,
      count: trades?.length ?? 0,
      brainStatus,
    });
    await log.flush();

    return NextResponse.json({
      trades: trades ?? [],
      tradesCount: trades?.length ?? 0,
      sessionId,
      sessionConfig,
      brainStatus,
      isSessionActive,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("api exception", {
      app: "zerodha-trader",
      tag: "api",
      route: "trades/live",
      error: msg,
    });
    await log.flush();
    return NextResponse.json({ trades: [], tradesCount: 0, error: msg }, { status: 500 });
  }
}
