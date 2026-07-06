import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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
