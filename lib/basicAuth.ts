// Dashboard password gate (HTTP Basic). Pure so it can be unit-tested; the
// middleware turns the decision into a response. Any username is accepted —
// only DASHBOARD_PASSWORD matters.
export type Gate = "allow" | "challenge" | "locked";

export function gate(header: string | null, password: string | undefined, vercelEnv: string | undefined): Gate {
  if (!password) return vercelEnv ? "locked" : "allow"; // fail closed on Vercel, open on a laptop
  if (!header?.startsWith("Basic ")) return "challenge";
  let decoded: string;
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return "challenge";
  }
  const given = decoded.slice(decoded.indexOf(":") + 1);
  return decoded.includes(":") && safeEqual(given, password) ? "allow" : "challenge";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
