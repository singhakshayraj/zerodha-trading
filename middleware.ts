import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, gate, sessionToken } from "./lib/auth";

// Every page and API route sits behind DASHBOARD_PASSWORD (set in Vercel env).
// Signed-out pages redirect to /login; signed-out API calls get a 401 marked
// `login: true` (no WWW-Authenticate header, so no browser popup).
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const password = process.env.DASHBOARD_PASSWORD;
  const g = gate({
    cookie: req.cookies.get(SESSION_COOKIE)?.value,
    header: req.headers.get("authorization"),
    password,
    vercelEnv: process.env.VERCEL_ENV,
    token: password ? await sessionToken(password) : "",
  });
  if (g === "allow") return NextResponse.next();
  if (g === "locked") return new NextResponse("Dashboard locked: DASHBOARD_PASSWORD is not set.", { status: 503 });
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required", login: true }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
