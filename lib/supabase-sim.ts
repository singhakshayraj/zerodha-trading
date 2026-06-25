// Staging-only Supabase client. Mirrors lib/supabase.ts (supabaseServer) but
// points at the zerodha-trading-sim project via SIM_* env vars. Used ONLY by
// the /mock routes so seeded staging data can be viewed in the deployed app
// with zero risk to production. Never import this from production code paths.
import { createClient } from "@supabase/supabase-js";

// SIM_* are set on Vercel (staging project). Fall back to harmless placeholders
// when absent (e.g. local `next build` without sim creds) so module import never
// throws — the mock routes are force-dynamic and only run at request time, where
// the real env vars are present.
const url = process.env.SIM_SUPABASE_URL || "https://placeholder.supabase.co";
const key = process.env.SIM_SUPABASE_SERVICE_KEY || "placeholder-key";

export const supabaseSim = createClient(url, key);
