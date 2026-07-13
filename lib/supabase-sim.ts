// Staging-only Supabase client. Mirrors lib/supabase.ts (supabaseServer) but
// points at the zerodha-trading-sim project via SIM_* env vars. Used ONLY by
// the /mock routes so seeded staging data can be viewed in the deployed app
// with zero risk to production. Never import this from production code paths.
import { createClient } from "@supabase/supabase-js";

// SIM_* are set on Vercel (staging project). Fall back to harmless placeholders
// when absent (e.g. local `next build` without sim creds) so module import never
// throws — the mock routes are force-dynamic and only run at request time, where
// the real env vars are present.
// Shape-validated, not just truthy: a literal "<placeholder, fill in>" left
// in .env.local is truthy and used to reach createClient, which throws at
// module import and breaks the whole local `next build` (KNOWN_ISSUES P6).
const rawUrl = process.env.SIM_SUPABASE_URL ?? "";
const url = rawUrl.startsWith("http")
  ? rawUrl
  : "https://placeholder.supabase.co";
const key = process.env.SIM_SUPABASE_SERVICE_KEY || "placeholder-key";

// global.fetch override: Next.js patches fetch with a Data Cache that can
// serve stale GET responses even under force-dynamic routes. Forcing
// cache:'no-store' on every underlying request guarantees reads always hit
// the sim DB, regardless of route-level cache settings.
export const supabaseSim = createClient(url, key, {
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, cache: "no-store" }),
  },
  auth: { persistSession: false },
});
