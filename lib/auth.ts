// Dashboard password gate. The browser signs in on /login, which sets an
// HttpOnly cookie holding HMAC-SHA256(key = DASHBOARD_PASSWORD, "dashboard-
// session-v1"), so changing the password signs every device out. Scripts and
// e2e may still send HTTP Basic (any username), but the gate never sends a Basic
// challenge, so browsers never show their own username/password popup.
// Pure + Web Crypto: shared by middleware (edge) and /api/login (node), unit-
// tested in e2e/auth-unit.spec.ts.
export const SESSION_COOKIE = "dash_session";
export const SESSION_DAYS = 30;

export type Gate = "allow" | "login" | "locked";

export async function sessionToken(password: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("dashboard-session-v1"));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function gate(o: {
  cookie: string | null | undefined;
  header: string | null;
  password: string | undefined;
  vercelEnv: string | undefined;
  token: string; // sessionToken(password), precomputed by the caller
}): Gate {
  if (!o.password) return o.vercelEnv ? "locked" : "allow"; // fail closed on Vercel, open on a laptop
  if (o.cookie && safeEqual(o.cookie, o.token)) return "allow";
  if (o.header?.startsWith("Basic ")) {
    try {
      const d = atob(o.header.slice(6).trim());
      if (d.includes(":") && safeEqual(d.slice(d.indexOf(":") + 1), o.password)) return "allow";
    } catch { /* malformed base64 → login */ }
  }
  return "login";
}

/** Where to go after sign-in: same-site paths only, so ?next= can't bounce off-site. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
