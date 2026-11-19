import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, safeEqual, sessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST { password } → sets the HttpOnly session cookie the middleware checks.
export async function POST(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return NextResponse.json({ error: "Dashboard locked: DASHBOARD_PASSWORD is not set." }, { status: 503 });

  let given = "";
  try { given = String((await req.json())?.password ?? ""); } catch { /* bad body → wrong password */ }
  if (!safeEqual(given, password)) {
    // ponytail: fixed delay slows guessing; no per-IP lockout (serverless, no shared state) — add one if this URL is ever shared.
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
  return res;
}
