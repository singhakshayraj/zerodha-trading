"use client";

// [P-54 spike] "Ask your book" — an in-browser model (WebLLM/WebGPU) that
// answers from fixed read-only tools. Nothing is sent to any LLM service;
// the only network traffic is the one-time model download and our own
// /api reads. Every answer shows which tool and data it used.

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Loader2, Send, Database } from "lucide-react";
import api from "@/lib/api";
import { ask } from "@/lib/ask/agent";
import type { ChatFn, Trace } from "@/lib/ask/agent";
import { DEFAULT_MODEL, MODELS, loadModel, webgpuAvailable } from "@/lib/ask/engine";
import type { Account } from "@/lib/ask/tools";

type Msg = { role: "user" | "bot"; text: string; trace?: Trace };
const MODEL_KEY = "ask_model";

export function AskDrawer() {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<Account>("primary");
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [chat, setChat] = useState<ChatFn | null>(null);
  const [progress, setProgress] = useState<{ text: string; pct: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [gpu, setGpu] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const known = useRef<string[] | null>(null);

  useEffect(() => {
    setGpu(webgpuAvailable());
    try { const m = localStorage.getItem(MODEL_KEY); if (m && MODELS.some((x) => x.id === m)) setModel(m); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function start() {
    setProgress({ text: "Starting…", pct: 0 });
    try {
      const fn = await loadModel(model, (text, pct) => setProgress({ text, pct }));
      setChat(() => fn);
      try { localStorage.setItem(MODEL_KEY, model); } catch { /* storage blocked */ }
    } catch (e) {
      setMsgs((m) => [...m, { role: "bot", text: `Couldn't load the model: ${e instanceof Error ? e.message : e}` }]);
    } finally { setProgress(null); }
  }

  async function send() {
    const q = input.trim();
    if (!q || !chat || busy) return;
    setInput(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    try {
      if (!known.current) {
        const [a, n] = await Promise.all([api.get("/advisor").catch(() => null), api.get("/advisor/natwar").catch(() => null)]);
        known.current = [...(a?.data?.rows ?? []), ...(n?.data?.rows ?? [])].map((r: { symbol: string }) => r.symbol);
      }
      const trace = await ask(q, { account, fetch: async (p) => (await api.get(p)).data, knownSymbols: known.current ?? [] }, chat);
      setMsgs((m) => [...m, { role: "bot", text: trace.answer, trace }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "bot", text: `Something failed: ${e instanceof Error ? e.message : e}` }]);
    } finally { setBusy(false); }
  }

  const sel = MODELS.find((m) => m.id === model)!;

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Ask about your portfolio"
          className="fixed z-40 right-4 bottom-20 md:bottom-6 h-12 w-12 rounded-full bg-[#1f1f1f] border border-[#333] text-[#e5e5e5] shadow-lg flex items-center justify-center hover:bg-[#2a2a2a]">
          <MessageCircle className="w-5 h-5" />
        </button>
      )}
      {open && (
        <div className="fixed z-50 inset-x-0 bottom-0 h-[80dvh] md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[420px] bg-[#0f0f0f] border-t md:border-t-0 md:border-l border-[#262626] rounded-t-2xl md:rounded-none flex flex-col" role="dialog" aria-label="Ask your book">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1f1f1f]">
            <span className="text-sm font-semibold text-[#f5f5f5]">Ask your book</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#a78bfa1a] text-[#a78bfa]">on-device · beta</span>
            <div className="ml-auto flex rounded-md border border-[#262626] overflow-hidden text-[11px]">
              {(["primary", "natwar"] as const).map((a) => (
                <button key={a} type="button" onClick={() => setAccount(a)}
                  className={`px-2 py-1 ${account === a ? "bg-[#1f1f1f] text-[#f5f5f5]" : "text-[#8a8a8a]"}`}>{a === "primary" ? "Kanaklata" : "Natwar"}</button>
              ))}
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-[#8a8a8a] hover:text-[#f5f5f5]"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {!gpu && <p className="text-[12px] text-[#f59e0b]">This browser has no WebGPU, so the on-device model can&apos;t run here. Use desktop Chrome or Edge.</p>}
            {gpu && !chat && (
              <div className="space-y-3">
                <p className="text-[12px] text-[#8a8a8a] leading-relaxed">
                  Answers come from a model running inside this browser, reading only this app&apos;s data — nothing is sent to an AI service. The first start downloads the model once ({sel.gb} GB); after that it loads from the browser cache.
                </p>
                <select value={model} onChange={(e) => setModel(e.target.value)} disabled={!!progress}
                  className="w-full bg-[#0a0a0a] border border-[#262626] rounded-lg px-2 py-2 text-[12px] text-[#e5e5e5]">
                  {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.gb} GB</option>)}
                </select>
                {progress ? (
                  <div>
                    <div className="h-1.5 rounded bg-[#1a1a1a] overflow-hidden"><div className="h-full bg-[#a78bfa]" style={{ width: `${Math.round(progress.pct * 100)}%` }} /></div>
                    <p className="text-[10px] text-[#6a6a6a] mt-1 truncate">{progress.text}</p>
                  </div>
                ) : (
                  <button type="button" onClick={start} className="w-full rounded-lg bg-[#1f1f1f] border border-[#333] py-2 text-[12px] text-[#f5f5f5] hover:bg-[#2a2a2a]">Start the model</button>
                )}
                <p className="text-[11px] text-[#6a6a6a]">Try: “Why is ATGL a sell?” · “How did I do in October?” · “Which sectors am I overweight in?”</p>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${m.role === "user" ? "bg-[#1f1f1f] text-[#f5f5f5]" : "bg-[#111] border border-[#1f1f1f] text-[#d5d5d5]"}`}>
                  {m.text}
                  {m.trace?.tool && (
                    <details className="mt-1.5">
                      <summary className="text-[10px] text-[#6a6a6a] cursor-pointer flex items-center gap-1 list-none"><Database className="w-3 h-3" /> {m.trace.tool}{Object.keys(m.trace.args).length ? ` · ${Object.entries(m.trace.args).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""} · {((m.trace.ms.route + m.trace.ms.answer) / 1000).toFixed(1)}s</summary>
                      <pre className="text-[10px] text-[#8a8a8a] whitespace-pre-wrap break-words mt-1 max-h-40 overflow-y-auto">{JSON.stringify(m.trace.result, null, 1)}</pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
            {busy && <p className="text-[11px] text-[#6a6a6a] flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> thinking on-device…</p>}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 p-3 border-t border-[#1f1f1f]">
            <input value={input} onChange={(e) => setInput(e.target.value)} disabled={!chat || busy}
              placeholder={chat ? "Ask about your calls, sectors, P&L…" : "Start the model first"}
              className="flex-1 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-2 text-[13px] text-[#f5f5f5] placeholder-[#444] focus:outline-none focus:border-[#a78bfa] disabled:opacity-50" />
            <button type="submit" disabled={!chat || busy || !input.trim()} aria-label="Send"
              className="px-3 rounded-lg bg-[#1f1f1f] border border-[#333] text-[#f5f5f5] disabled:opacity-40"><Send className="w-4 h-4" /></button>
          </form>
        </div>
      )}
    </>
  );
}
