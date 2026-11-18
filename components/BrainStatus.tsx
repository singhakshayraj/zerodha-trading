"use client";

import { useEffect, useRef } from "react";
import { Radio, AlertTriangle } from "lucide-react";
import { useAppStore } from "@/lib/store";
import api from "@/lib/api";

interface BrainStatusResponse {
  status: "ONLINE" | "OFFLINE" | "RUNNING" | "ERROR";
  lastPing: string | null;
  isAlive: boolean;
  message: string | null;
  currentCycle: number | null;
  secondsSinceLastPing: number | null;
}

export function BrainStatus() {
  const { brainStatus, brainMessage, setBrainStatus } = useAppStore();
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const r = await api.get<BrainStatusResponse>("/brain/status");
        const d = r.data;
        setBrainStatus(d.status, d.message ?? "");
      } catch {
        setBrainStatus("OFFLINE", "");
      }
    }

    poll();
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [setBrainStatus]);

  const { lastBrainPing } = useAppStore();
  const secAgo = lastBrainPing ? Math.floor((Date.now() - lastBrainPing) / 1000) : null;

  const isOffline = brainStatus === "OFFLINE" || brainStatus === "ERROR";
  const isRunning = brainStatus === "RUNNING";
  const isOnline  = brainStatus === "ONLINE";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs">
        <Radio className={`w-3 h-3 shrink-0 ${
          isRunning ? "text-[#d9b84a] animate-pulse" :
          isOnline  ? "text-[#9be15d]" :
          "text-[#f08a76]"
        }`} />

        <span className={
          isRunning ? "text-[#d9b84a]" :
          isOnline  ? "text-[#9be15d]" :
          "text-[#f08a76]"
        }>
          Brain {brainStatus}
        </span>

        {secAgo !== null && (
          <span className="text-[#8b968e]">
            · {secAgo < 60 ? `${secAgo}s ago` : `${Math.floor(secAgo / 60)}m ago`}
          </span>
        )}

        {brainMessage && (
          <span className="text-[#8b968e] truncate max-w-[200px]">{brainMessage}</span>
        )}
      </div>

      {isOffline && secAgo !== null && secAgo > 120 && (
        <div className="flex items-center gap-1.5 text-xs text-[#d9b84a] bg-[#d9b84a]/5 border border-[#d9b84a]/20 rounded px-2 py-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Brain server offline — check Railway deployment
        </div>
      )}
    </div>
  );
}
