"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, UserPlus, XCircle } from "lucide-react";

// [P-45 provisional] Second account (Natwar Raj Singh). His enc_token goes
// to its own key via /api/connect/natwar; the brain previews his holdings
// on it. Independent of the primary token: paste either, or both.
export function NatwarTokenCard() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [status, setStatus] = useState<{ tokenUpdatedAt: string | null; previewUpdatedAt: string | null } | null>(null);

  const refresh = () =>
    fetch("/api/connect/natwar").then((r) => (r.ok ? r.json() : null)).then((d) => d && setStatus(d)).catch(() => {});
  useEffect(() => { refresh(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true); setMsg(null);
    try {
      const res = await fetch("/api/connect/natwar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) setMsg({ ok: false, text: d.error || "Invalid token" });
      else { setMsg({ ok: true, text: `Stored for ${d.profile?.name ?? d.label} (${d.profile?.user_id ?? ""}). His holdings get advised after 09:45 IST.` }); setToken(""); refresh(); }
    } catch { setMsg({ ok: false, text: "Connection failed" }); }
    finally { setLoading(false); }
  }

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) + " IST" : "never";

  return (
    <div className="mt-4 bg-[#111111] border border-[#1f1f1f] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus className="w-4 h-4 text-[#8a8a8a]" />
        <h2 className="text-sm font-medium text-[#f5f5f5]">Second account · Natwar Raj Singh</h2>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 font-medium">PREVIEW</span>
      </div>
      <p className="text-[11px] text-[#666] mb-3">
        Optional. Paste his enc_token to get advice on his holdings under the Natwar tab on /advisor. Kept separate from the main account; not graded yet.
        {status && <> Token pasted: <span className="text-[#aaa]">{fmt(status.tokenUpdatedAt)}</span> · last preview: <span className="text-[#aaa]">{fmt(status.previewUpdatedAt)}</span>.</>}
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Natwar's enc_token"
          disabled={loading} autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
          className="flex-1 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-sm text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#3b82f6] font-mono disabled:opacity-50" />
        <button type="submit" disabled={loading || !token.trim()}
          className="px-4 rounded-lg bg-[#1f1f1f] hover:bg-[#2a2a2a] text-sm text-[#f5f5f5] disabled:opacity-50 min-h-[40px]">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </button>
      </form>
      {msg && (
        <div className={`mt-2 flex items-start gap-2 text-xs rounded-lg p-2.5 border ${msg.ok ? "text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/20" : "text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/20"}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}
