// MOCK MIRROR of app/api/brain/activity/route.ts — identical logic, reads from
// the staging (sim) Supabase project. Diff against the original to verify.
import { NextRequest, NextResponse } from "next/server";
import { Logger } from "next-axiom";
import { supabaseSim } from "@/lib/supabase-sim";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const log = new Logger();
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");
    const limit = parseInt(searchParams.get("limit") || "50");

    let targetSessionId = sessionId ?? null;

    // Tier 1: app_config.active_session_id (written by brain on each new session)
    if (!targetSessionId) {
      const { data: configData } = await supabaseSim
        .from("app_config")
        .select("value")
        .eq("key", "active_session_id")
        .single();

      targetSessionId = configData?.value ?? null;
    }

    // No Tier 2. If app_config has no active session, return empty —
    // never fall back to prior sessions (which surfaces stale events).
    if (
      !targetSessionId ||
      targetSessionId === "" ||
      targetSessionId === "none"
    ) {
      return NextResponse.json({ activity: [], sessionId: null, count: 0 });
    }

    const { data, error } = await supabaseSim
      .from("brain_activity")
      .select("*")
      .eq("session_id", targetSessionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      log.error("activity query error", {
        app: "zerodha-trader",
        tag: "api",
        route: "mock/brain/activity",
        sessionId: targetSessionId,
        error: error.message,
      });
      await log.flush();
      return NextResponse.json({ activity: [], error: error.message });
    }

    log.info("activity fetched", {
      app: "zerodha-trader",
      tag: "api",
      route: "mock/brain/activity",
      sessionId: targetSessionId,
      count: data?.length || 0,
    });
    await log.flush();

    return NextResponse.json({
      activity: data || [],
      sessionId: targetSessionId,
      count: data?.length || 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    log.error("api exception", {
      app: "zerodha-trader",
      tag: "api",
      route: "mock/brain/activity",
      error: msg,
    });
    await log.flush();
    return NextResponse.json({ activity: [], error: msg });
  }
}
