import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-enc-token");
  if (!token) return NextResponse.json({ error: "token is required" }, { status: 401 });

  try {
    // Tier 1: active_session_id from app_config
    const { data: configRows } = await supabaseServer
      .from("app_config")
      .select("key, value")
      .in("key", ["active_session_id", "session_config"]);

    const cfg = Object.fromEntries(
      (configRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
    );

    let sessionId: string | null = cfg["active_session_id"] ?? null;
    const sessionConfig = cfg["session_config"]
      ? (() => { try { return JSON.parse(cfg["session_config"]); } catch { return null; } })()
      : null;

    if (sessionId) {
      // Verify this session actually has trades; if not, fall through to Tier 2
      const { count } = await supabaseServer
        .from("trades")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);

      if ((count ?? 0) === 0) {
        console.log(`[trades/live] active_session_id ${sessionId} has 0 trades — falling back`);
        sessionId = null;
      }
    }

    // Tier 2: most recent session that has trades
    if (!sessionId) {
      const { data: latest } = await supabaseServer
        .from("trades")
        .select("session_id")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      sessionId = latest?.session_id ?? null;
    }

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
