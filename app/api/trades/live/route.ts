import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET() {
  try {
    // Tier 1: active_session_id from app_config
    const { data: configRows } = await supabaseServer
      .from("app_config")
      .select("key, value")
      .in("key", ["active_session_id", "session_config"]);

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

    // No active session → return empty. Never fall back to stale prior sessions.
    if (!sessionId) {
      return NextResponse.json({ trades: [], tradesCount: 0, sessionId: null, sessionConfig });
    }

    const { data: trades, error } = await supabaseServer
      .from("trades")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[trades/live] query error:", error.message);
      return NextResponse.json({ trades: [], tradesCount: 0, sessionId, sessionConfig, error: error.message });
    }

    return NextResponse.json({
      trades: trades ?? [],
      tradesCount: trades?.length ?? 0,
      sessionId,
      sessionConfig,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[trades/live] exception:", msg);
    return NextResponse.json({ trades: [], tradesCount: 0, error: msg }, { status: 500 });
  }
}
