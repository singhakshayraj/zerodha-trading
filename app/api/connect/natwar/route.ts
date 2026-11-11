import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// [P-45 provisional] Second account (Natwar) — validate his enc_token against
// Zerodha and store it under its OWN key (enc_token_natwar). The brain's
// preview job reads that key; nothing about the primary token changes.
// Returns the profile so the UI can show whose token this is.
const ACCOUNT = "natwar";
const LABEL = "Natwar Raj Singh";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ success: false, error: "Token is required" }, { status: 400 });
    }
    const clean = token.trim();
    const kiteRes = await fetch("https://kite.zerodha.com/oms/user/profile", {
      headers: { Authorization: `enctoken ${clean}`, Cookie: `enctoken=${clean}`, "X-Kite-Version": "3" },
    });
    let data: Record<string, unknown>;
    try { data = await kiteRes.json(); } catch {
      return NextResponse.json({ success: false, error: "Zerodha returned non-JSON response" }, { status: 502 });
    }
    if (!kiteRes.ok || data.status !== "success") {
      return NextResponse.json({ success: false, error: (data.message as string) || "Invalid token" }, { status: kiteRes.status });
    }
    const profile = data.data as { user_name: string; user_id: string };
    const now = new Date().toISOString();
    const { error } = await supabaseServer.from("app_config").upsert(
      [{ key: `enc_token_${ACCOUNT}`, value: clean, updated_at: now },
       { key: `token_updated_at_${ACCOUNT}`, value: now, updated_at: now }],
      { onConflict: "key" });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, account: ACCOUNT, label: LABEL,
      profile: { name: profile.user_name, user_id: profile.user_id } });
  } catch (err) {
    return NextResponse.json({ success: false, error: "Internal server error", debug: { message: String(err) } }, { status: 500 });
  }
}

// Status: when was Natwar's token last pasted, and is a preview stored?
export async function GET() {
  const { data } = await supabaseServer
    .from("app_config").select("key, updated_at")
    .in("key", [`enc_token_${ACCOUNT}`, `advisor_${ACCOUNT}_latest`]);
  const tok = data?.find((r) => r.key === `enc_token_${ACCOUNT}`);
  const prev = data?.find((r) => r.key === `advisor_${ACCOUNT}_latest`);
  return NextResponse.json({ account: ACCOUNT, label: LABEL,
    tokenUpdatedAt: tok?.updated_at ?? null, previewUpdatedAt: prev?.updated_at ?? null });
}
