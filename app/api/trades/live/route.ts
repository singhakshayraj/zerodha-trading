import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// Returns live trades + session stats for the brain's active session.
// Reads active_session_id from app_config so it always follows the brain's session,
// not the frontend's dbSessionId.
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    // Read active_session_id and session_config from app_config
    const { data: configRows } = await supabaseServer
      .from("app_config")
      .select("key, value")
      .in("key", ["active_session_id", "session_config"]);

    const cfg = Object.fromEntries((configRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const sessionId = cfg["active_session_id"] ?? null;
    const sessionConfig = cfg["session_config"] ? (() => { try { return JSON.parse(cfg["session_config"]); } catch { return null; } })() : null;

    if (!sessionId) {
      return NextResponse.json({ trades: [], tradesCount: 0, sessionId: null, sessionConfig: null });
    }

    // Fetch all trades for the active session (no status filter — show OPEN + CLOSED)
    const { data: trades, error } = await supabaseServer
      .from("trades")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[trades/live] query error:", error.message);
      return NextResponse.json({ trades: [], tradesCount: 0, sessionId, sessionConfig, error: error.message });
    }

    // Also read session row for total_trades_executed if the brain updates it
    const { data: sessionRow } = await supabaseServer
      .from("trading_sessions")
      .select("total_trades, total_pnl, status")
      .eq("id", sessionId)
      .single();

    return NextResponse.json({
      trades: trades ?? [],
      tradesCount: trades?.length ?? 0,
      sessionId,
      sessionConfig,
      sessionStats: sessionRow ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[trades/live] exception:", msg);
    return NextResponse.json({ trades: [], tradesCount: 0, error: msg }, { status: 500 });
  }
}
