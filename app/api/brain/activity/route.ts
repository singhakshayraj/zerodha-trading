import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const limit = parseInt(searchParams.get("limit") || "50");

    let targetSessionId = sessionId;

    // Fall back to active session from app_config if not provided
    if (!targetSessionId) {
      const { data: configData } = await supabaseServer
        .from("app_config")
        .select("value")
        .eq("key", "active_session_id")
        .single();

      targetSessionId = configData?.value || null;
    }

    if (!targetSessionId) {
      return NextResponse.json({
        activity: [],
        message: "No active session found",
      });
    }

    const { data, error } = await supabaseServer
      .from("brain_activity")
      .select("*")
      .eq("session_id", targetSessionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[activity] Supabase error:", error);
      return NextResponse.json({
        activity: [],
        error: error.message,
      });
    }

    return NextResponse.json({
      activity: data || [],
      sessionId: targetSessionId,
      count: data?.length || 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[activity] Exception:", msg);
    return NextResponse.json({
      activity: [],
      error: msg,
    });
  }
}
