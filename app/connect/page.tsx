"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import {
  Zap,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  X,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

const STATUS_STEPS = [
  "Account Connected",
  "Profile Fetched",
  "Market Access Verified",
];

export default function ConnectPage() {
  const router = useRouter();
  const { setToken, setProfile, hydrateFromStorage, isConnected, userProfile, clearSession } = useAppStore();

  const [token, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successSteps, setSuccessSteps] = useState<number[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  // Already connected — show connected state instead of the form
  if (isConnected) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#111111] border border-[#1f1f1f] mb-4">
              <Zap className="w-6 h-6 text-[#3b82f6]" fill="#3b82f6" />
            </div>
            <h1 className="text-2xl font-semibold text-[#f5f5f5] tracking-tight">Zerodha Trader</h1>
            <p className="text-sm text-[#666666] mt-1">Autonomous Trading Platform</p>
          </div>

          <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6">
            <div className="flex items-center gap-3 mb-5 pb-5 border-b border-[#1f1f1f]">
              <div className="w-9 h-9 rounded-full bg-[#22c55e]/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-[#22c55e]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#f5f5f5]">
                  {userProfile?.name ?? "Connected"}
                </p>
                <p className="text-xs text-[#444]">
                  {userProfile?.email ?? ""}{userProfile?.broker ? ` · ${userProfile.broker}` : ""}
                </p>
              </div>
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20 font-medium">
                ACTIVE
              </span>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => router.push("/portfolio")}
                className="w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg py-3 text-sm font-medium transition-colors"
              >
                Go to Portfolio
              </button>
              <button
                onClick={() => router.push("/trading")}
                className="w-full bg-[#1f1f1f] hover:bg-[#2a2a2a] text-[#f5f5f5] rounded-lg py-3 text-sm font-medium transition-colors"
              >
                Go to Auto Trade
              </button>
              <button
                onClick={clearSession}
                className="w-full text-[#444] hover:text-[#ef4444] py-2 text-xs transition-colors"
              >
                Disconnect & use different token
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 text-xs text-[#333] px-1">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#3b82f6]" />
            <span>Session expires at 6:00 AM. Token stored locally only.</span>
          </div>
        </div>
      </div>
    );
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setError("");
    setSuccessSteps([]);

    try {
      const res = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Invalid token. Please check and try again.");
        setLoading(false);
        return;
      }

      setToken(token.trim());
      setProfile(data.profile);

      for (let i = 0; i < STATUS_STEPS.length; i++) {
        await new Promise((r) => setTimeout(r, 500));
        setSuccessSteps((prev) => [...prev, i]);
      }

      await new Promise((r) => setTimeout(r, 600));
      router.push("/portfolio");
    } catch {
      setError("Connection failed. Check your network and try again.");
      setLoading(false);
    }
  }

  const connected = successSteps.length === STATUS_STEPS.length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#111111] border border-[#1f1f1f] mb-4">
            <Zap className="w-6 h-6 text-[#3b82f6]" fill="#3b82f6" />
          </div>
          <h1 className="text-2xl font-semibold text-[#f5f5f5] tracking-tight">
            Zerodha Trader
          </h1>
          <p className="text-sm text-[#666666] mt-1">Autonomous Trading Platform</p>
        </div>

        {/* Card */}
        <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-6 shadow-2xl">
          <h2 className="text-sm font-medium text-[#f5f5f5] mb-5">
            Connect your account
          </h2>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-xs text-[#666666] mb-2 uppercase tracking-wider">
                Access Token (enc_token)
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste your enc_token here"
                  required
                  disabled={loading}
                  className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-4 py-3 pr-11 text-sm text-[#f5f5f5] placeholder-[#333] focus:outline-none focus:border-[#3b82f6] transition-colors font-mono disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#444] hover:text-[#888] transition-colors"
                  tabIndex={-1}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-[#ef4444] text-xs bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-lg p-3">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full bg-[#3b82f6] hover:bg-[#2563eb] disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg py-3 text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              {loading && !connected && <Loader2 className="w-4 h-4 animate-spin" />}
              {connected ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#22c55e]" />
                  Connected — Redirecting...
                </>
              ) : loading ? (
                "Verifying..."
              ) : (
                "Connect"
              )}
            </button>
          </form>

          {/* Animated status steps */}
          {(loading || successSteps.length > 0) && (
            <div className="mt-5 pt-5 border-t border-[#1f1f1f] space-y-2.5">
              {STATUS_STEPS.map((step, i) => {
                const done = successSteps.includes(i);
                const pending = loading && !done && successSteps.length === i;
                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                      done ? "text-[#f5f5f5]" : pending ? "text-[#666666]" : "text-[#2a2a2a]"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-[#22c55e] shrink-0" />
                    ) : pending ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#3b82f6] shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-[#2a2a2a] shrink-0" />
                    )}
                    {step}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Security note */}
        <div className="mt-4 flex items-start gap-2 text-xs text-[#444] px-1">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#3b82f6]" />
          <span>
            Your token is stored locally and never sent to any server other than Zerodha.
          </span>
        </div>

        {/* How to get token */}
        <div className="mt-3 text-center">
          <button
            onClick={() => setShowModal(true)}
            className="text-xs text-[#3b82f6] hover:underline inline-flex items-center gap-1"
          >
            How to get your access token?
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-[#f5f5f5]">
                How to get your enc_token
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#666666] hover:text-[#f5f5f5] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="space-y-4">
              {[
                {
                  n: "1",
                  title: "Log in to Zerodha Kite",
                  desc: "Open kite.zerodha.com and sign in with your credentials.",
                },
                {
                  n: "2",
                  title: "Open Developer Tools",
                  desc: "Press F12 (or Cmd+Option+I on Mac) to open browser DevTools.",
                },
                {
                  n: "3",
                  title: "Go to Application → Cookies",
                  desc: 'Click the "Application" tab → expand "Cookies" in the left sidebar → select the Kite URL.',
                },
                {
                  n: "4",
                  title: 'Find the "enctoken" cookie',
                  desc: 'Look for the cookie named enctoken. Click it and copy the full value from the "Cookie Value" field.',
                },
                {
                  n: "5",
                  title: "Paste it here",
                  desc: "Paste the copied value into the Access Token field and click Connect.",
                },
              ].map(({ n, title, desc }) => (
                <li key={n} className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#1f1f1f] text-[#3b82f6] text-xs font-semibold flex items-center justify-center mt-0.5">
                    {n}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-[#f5f5f5]">{title}</p>
                    <p className="text-xs text-[#666666] mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-5 p-3 bg-[#0a0a0a] rounded-lg border border-[#1f1f1f]">
              <p className="text-xs text-[#666666]">
                <span className="text-[#f59e0b] font-medium">Note: </span>
                The enc_token expires at 6:00 AM the next day. Repeat this process daily.
              </p>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full mt-4 bg-[#1f1f1f] hover:bg-[#2a2a2a] text-[#f5f5f5] rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
