import { NextResponse } from "next/server";
import { ping } from "@/lib/db";

export async function GET() {
  try {
    const connected = await ping();
    if (connected) return NextResponse.json({ connected: true });
    return NextResponse.json({ connected: false, error: "Supabase unreachable" }, { status: 503 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ connected: false, error: message }, { status: 503 });
  }
}
