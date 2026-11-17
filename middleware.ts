import { NextRequest, NextResponse } from "next/server";
import { gate } from "./lib/basicAuth";

// Every page and API route sits behind DASHBOARD_PASSWORD (set in Vercel env).
export function middleware(req: NextRequest) {
  const g = gate(req.headers.get("authorization"), process.env.DASHBOARD_PASSWORD, process.env.VERCEL_ENV);
  if (g === "allow") return NextResponse.next();
  if (g === "locked") return new NextResponse("Dashboard locked: DASHBOARD_PASSWORD is not set.", { status: 503 });
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="zerodha-dashboard", charset="UTF-8"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
