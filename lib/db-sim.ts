// Staging-only DB helpers for the /mock routes. Mirrors the subset of
// lib/db used by the mirrored brain/status + sessions routes, but reads from
// the sim Supabase client instead of production. Additive + isolated.
import { supabaseSim } from "@/lib/supabase-sim";
import type { BrainHeartbeat, TradingSession } from "@/lib/db";

export async function getBrainHeartbeat(): Promise<BrainHeartbeat | null> {
  const { data, error } = await supabaseSim
    .from("brain_heartbeat")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return null;
  return data as BrainHeartbeat;
}

export async function getSessionHistory(
  limit = 30
): Promise<TradingSession[]> {
  const { data, error } = await supabaseSim
    .from("trading_sessions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getSessionHistory: ${error.message}`);
  return (data ?? []) as TradingSession[];
}
