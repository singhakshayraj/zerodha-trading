// MOCK MIRROR of app/api/sessions/route.ts — identical logic, reads from the
// staging (sim) Supabase project via lib/db-sim. Diff against the original.
import { NextRequest, NextResponse } from "next/server";
import * as db from "@/lib/db-sim";

export const dynamic = "force-dynamic";

// MOCK: no token gate — staging viewer must work without a Kite login.
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(100, Number(url.searchParams.get("limit") ?? "30"));
    const sessions = await db.getSessionHistory(limit);
    return NextResponse.json({ sessions });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
