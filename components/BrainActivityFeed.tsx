"use client";

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import type { BrainActivity } from "@/lib/types";

interface Props {
  sessionId: string | null;
  isRunning: boolean;
}

interface IconCfg {
  icon: string;
  cls: string;
}

function iconFor(type: string, data?: Record<string, unknown> | null): IconCfg {
  const t = (type || "").toUpperCase();
  const action = (data?.action as string | undefined)?.toUpperCase();

  if (t === "CYCLE_START")    return { icon: "🔄", cls: "text-[#60a5fa]" };
  if (t === "ANALYZING")      return { icon: "🔍", cls: "text-[#e5e5e5]" };
  if (t === "ORDER_PLACED")   return { icon: "✅", cls: "text-[#22c55e] font-bold" };
  if (t === "ORDER_FAILED")   return { icon: "❌", cls: "text-[#ef4444] font-bold" };
  if (t === "POSITION_EXIT")  return { icon: "💰", cls: "text-[#fbbf24]" };
  if (t === "SESSION_END")    return { icon: "🏁", cls: "text-[#f5f5f5]" };
  if (t === "ERROR")          return { icon: "⚠️", cls: "text-[#f97316]" };

  if (t === "SIGNAL" || t.startsWith("SIGNAL")) {
    if (action === "BUY"  || t === "SIGNAL_BUY")  return { icon: "🟢", cls: "text-[#22c55e]" };
    if (action === "SELL" || t === "SIGNAL_SELL") return { icon: "🔴", cls: "text-[#ef4444]" };
    return { icon: "⚪", cls: "text-[#888]" };
  }

  return { icon: "•", cls: "text-[#888]" };
}

function timeFmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-IN", { hour12: false });
}

function isSignal(type: string): boolean {
  return (type || "").toUpperCase().startsWith("SIGNAL");
}

function indicatorRow(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  const parts: string[] = [];
  const ind = (data.indicators as Record<string, unknown> | undefined) ?? data;
  if (ind.rsi != null)    parts.push(`RSI: ${Number(ind.rsi).toFixed(0)}`);
  if (ind.ema21 != null)  parts.push(`EMA21: ${ind.ema21 ? "✅" : "❌"}`);
  if (ind.macd  != null)  parts.push(`MACD: ${ind.macd  ? "✅" : "❌"}`);
  if (ind.volume!= null)  parts.push(`Volume: ${ind.volume ? "✅" : "❌"}`);
  if (data.regime)        parts.push(`Regime: ${data.regime}`);
  if (data.risk_reward || data.rr) parts.push(`R:R: ${data.risk_reward ?? data.rr}`);
  return parts.length ? parts.join(" | ") : null;
}

export function BrainActivityFeed({ sessionId, isRunning }: Props) {
  const [activity, setActivity] = useState<BrainActivity[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    stopRef.current = false;

    async function poll() {
      if (stopRef.current) return;
      try {
        const params = new URLSearchParams();
        if (sessionId) params.set("sessionId", sessionId);
        params.set("limit", "100");
        const r = await api.get<{ activity: BrainActivity[] }>(`/brain/activity?${params}`);
        if (stopRef.current) return;
        // API returns DESC; reverse to show oldest first (newest at bottom).
        const rows = (r.data.activity ?? []).slice().reverse().slice(-100);
        setActivity(rows);
      } catch {
        // non-fatal
      }
    }

    if (isRunning) {
      poll();
      pollRef.current = setInterval(poll, 3000);
    } else {
      // One final poll after stop to capture SESSION_END
      poll();
    }

    return () => {
      stopRef.current = true;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isRunning, sessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activity]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl overflow-hidden flex flex-col h-72 md:h-[400px]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1f1f1f] bg-[#0d0d0d] shrink-0">
        <span className="text-[10px] font-semibold text-[#e5e5e5] uppercase tracking-wider">Brain Activity</span>
        {isRunning && (
          <span className="flex items-center gap-1 text-[10px] text-[#22c55e]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
            LIVE
          </span>
        )}
        <span className="text-[10px] text-[#333] ml-auto">{activity.length} events</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scroll-touch p-3 font-mono text-[11px] space-y-0.5">
        {activity.length === 0 ? (
          <p className="text-[#333]">Waiting for brain activity…</p>
        ) : (
          activity.map((a) => {
            const { icon, cls } = iconFor(a.activity_type, a.data);
            const signal = isSignal(a.activity_type);
            const isOpen = expanded.has(a.id);
            const detail = signal ? indicatorRow(a.data) : null;
            return (
              <div key={a.id}>
                <div
                  className={`leading-5 ${signal ? "cursor-pointer hover:bg-[#111]" : ""}`}
                  onClick={signal ? () => toggle(a.id) : undefined}
                >
                  <span className="text-[#333]">[{timeFmt(a.created_at)}]</span>{" "}
                  <span>{icon}</span>{" "}
                  <span className={cls}>
                    {a.symbol ? <span className="font-semibold">{a.symbol}</span> : null}
                    {a.symbol && a.message ? " — " : null}
                    {a.message ?? a.activity_type}
                  </span>
                </div>
                {signal && isOpen && detail && (
                  <div className="pl-12 text-[10px] text-[#888] leading-5">
                    {detail}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
