"use client";

import { useEffect, useState } from "react";
import { ask, type Trace } from "@/lib/ask/agent";
import { loadModel, webgpuAvailable } from "@/lib/ask/engine";
import type { Account } from "@/lib/ask/tools";

type Q = { q: string; account?: Account; symbol?: string };
declare global {
  interface Window {
    __ASK_FIXTURE__?: Record<string, unknown>;
    __runAskEval?: (model: string, qs: Q[]) => Promise<{ loadMs: number; traces: (Trace & { q: string })[] }>;
  }
}

export default function AskEvalClient() {
  const [status, setStatus] = useState("idle");
  useEffect(() => {
    window.__runAskEval = async (model, qs) => {
      if (!webgpuAvailable()) throw new Error("WebGPU not available in this browser");
      const fx = window.__ASK_FIXTURE__ ?? {};
      const fetcher = async (path: string) => {
        if (!(path in fx)) throw new Error(`fixture missing ${path}`);
        return fx[path];
      };
      const known = ["/advisor", "/advisor/natwar"].flatMap((k) => ((fx[k] as { rows?: { symbol: string }[] })?.rows ?? []).map((r) => r.symbol));
      const t0 = performance.now();
      const chat = await loadModel(model, (text) => setStatus(text));
      const loadMs = performance.now() - t0;
      const traces: (Trace & { q: string })[] = [];
      for (let i = 0; i < qs.length; i++) {
        const item = qs[i];
        setStatus(`${model}: ${i + 1}/${qs.length}`);
        traces.push({ q: item.q, ...(await ask(item.q, { account: item.account ?? "primary", symbol: item.symbol ?? null, fetch: fetcher, knownSymbols: known }, chat)) });
      }
      setStatus(`done ${model}`);
      return { loadMs, traces };
    };
    setStatus("ready");
  }, []);
  return <pre data-testid="ask-eval-status" style={{ padding: 16, color: "#ddd" }}>{status}</pre>;
}
