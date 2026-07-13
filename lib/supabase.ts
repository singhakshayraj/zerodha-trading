import { createClient } from "@supabase/supabase-js";

// Placeholder fallbacks (same pattern as lib/supabase-sim.ts): module import
// must never throw during a local `next build` without env — every consumer
// route is force-dynamic and only touches the client at request time, where
// the real env vars exist (Vercel). KNOWN_ISSUES P6.
const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseUrl = rawUrl.startsWith("http")
  ? rawUrl
  : "https://placeholder.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// cache: "no-store" opts every PostgREST GET out of Next's data cache.
// Without it, constant-URL reads (e.g. brain_heartbeat id=1) get cached at
// the edge and the dashboard shows stale state — observed live 2026-07-06:
// /api/brain/status served a 19-minute-old heartbeat and reported the brain
// OFFLINE while it was pinging every 30s.
export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  global: {
    fetch: (url, options = {}) => fetch(url, { ...options, cache: "no-store" }),
  },
});
