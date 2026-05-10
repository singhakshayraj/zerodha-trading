"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { TrendingUp, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import api from "@/lib/api";

export default function ConnectPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { setToken: storeToken, setProfile, isConnected, hydrateFromStorage } = useAppStore();

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (isConnected) router.push("/portfolio");
  }, [isConnected, router]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setError("");

    try {
      storeToken(token.trim());
      const res = await api.post("/connect", { token: token.trim() });
      setProfile(res.data.profile);
      router.push("/portfolio");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Invalid token. Make sure you copied it correctly.";
      setError(msg);
      useAppStore.getState().clearSession();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <TrendingUp className="w-8 h-8 text-[#3b82f6]" />
            <span className="text-xl font-semibold text-[#f5f5f5]">Zerodha Trader</span>
          </div>
          <p className="text-[#666666] text-sm">
            Enter your Zerodha enc_token to connect
          </p>
        </div>

        <div className="bg-[#111111] border border-[#1f1f1f] rounded-lg p-6">
          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-xs text-[#666666] mb-2 uppercase tracking-wider">
                enc_token
              </label>
              <textarea
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your enctoken here..."
                rows={3}
                className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-md px-3 py-2 text-sm text-[#f5f5f5] placeholder-[#444] resize-none focus:outline-none focus:border-[#3b82f6] transition-colors font-mono"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-[#ef4444] text-xs bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-md p-3">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Connecting..." : "Connect"}
            </button>
          </form>
        </div>

        <div className="mt-6 bg-[#111111] border border-[#1f1f1f] rounded-lg p-5">
          <h3 className="text-xs font-medium text-[#f5f5f5] uppercase tracking-wider mb-3">
            How to get your enc_token
          </h3>
          <ol className="space-y-2 text-xs text-[#666666]">
            <li className="flex gap-2">
              <span className="text-[#3b82f6] shrink-0">1.</span>
              Log in to Zerodha Kite at kite.zerodha.com
            </li>
            <li className="flex gap-2">
              <span className="text-[#3b82f6] shrink-0">2.</span>
              Open browser DevTools → Application → Cookies
            </li>
            <li className="flex gap-2">
              <span className="text-[#3b82f6] shrink-0">3.</span>
              Find the cookie named <code className="bg-[#1f1f1f] px-1 rounded">enctoken</code>
            </li>
            <li className="flex gap-2">
              <span className="text-[#3b82f6] shrink-0">4.</span>
              Copy the value and paste it above
            </li>
          </ol>
          <div className="mt-3 flex items-center gap-1 text-xs text-[#666666]">
            <AlertCircle className="w-3 h-3" />
            Token expires at 6:00 AM next day
          </div>
        </div>

        <div className="mt-4 text-center">
          <a
            href="https://kite.zerodha.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-[#3b82f6] hover:underline"
          >
            Open Kite <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
