import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawSessionId = searchParams.get("sessionId");
    const sessionId = rawSessionId && rawSessionId !== "null" && rawSessionId !== "undefined"
      ? rawSessionId
      : null;
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    // Fall back to active_session_id from app_config if frontend didn't pass one
    let targetSessionId = sessionId;
    if (!targetSessionId) {
      const { data: configData, error: configErr } = await supabaseServer
        .from("app_config")
        .select("value")
        .eq("key", "active_session_id")
        .single();

      if (configErr) {
        console.error("activity: failed to read active_session_id:", configErr.message);
      }
      targetSessionId = (configData?.value as string) ?? null;
    }

    if (!targetSessionId) {
      return NextResponse.json({
        activity: [],
        message: "No active session",
      });
    }

    const { data, error } = await supabaseServer
      .from("brain_activity")
      .select("*")
      .eq("session_id", targetSessionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Brain activity query error:", error);
      return NextResponse.json(
        { activity: [], error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      activity: data ?? [],
      sessionId: targetSessionId,
      count: data?.length ?? 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("Activity API exception:", msg);
    return NextResponse.json(
      { activity: [], error: msg },
      { status: 500 }
    );
  }
}
