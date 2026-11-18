"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { NatwarTokenCard } from "@/components/NatwarTokenCard";
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
  const [dbStatus, setDbStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [brainStatus, setBrainStatus] = useState<"checking" | "online" | "running" | "offline">("checking");

  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  // No token on THIS device? Adopt the one already in Supabase (pasted from
  // another browser this morning) — validated server-side before handout.
  // Paste once anywhere; every device just works until the token expires.
  useEffect(() => {
    const local =
      typeof window !== "undefined"
        ? localStorage.getItem("enc_token") || sessionStorage.getItem("enc_token")
        : null;
    if (local) { setRestoring(false); return; }
    fetch("/api/connect/restore")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.token) {
          setToken(d.token);
          if (d.profile) setProfile(d.profile);
        }
      })
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, [setToken, setProfile]);

  useEffect(() => {
    fetch("/api/db/health")
      .then((r) => r.json())
      .then((d) => setDbStatus(d.connected ? "connected" : "disconnected"))
      .catch(() => setDbStatus("disconnected"));
  }, []);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("enc_token") || sessionStorage.getItem("enc_token")
        : null;
    if (!token) { setBrainStatus("offline"); return; }

    fetch("/api/brain/status", { headers: { "x-enc-token": token } })
      .then((r) => r.json())
      .then((d) => {
        const s = (d.status as string)?.toLowerCase();
        if (s === "running") setBrainStatus("running");
        else if (s === "online") setBrainStatus("online");
        else setBrainStatus("offline");
      })
      .catch(() => setBrainStatus("offline"));
  }, []);

  // Checking Supabase for a token pasted on another device — brief, avoids
  // flashing the paste form on phones that never saw the morning paste.
  if (restoring && !isConnected) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <Loader2 className="w-6 h-6 text-[#b9ec8a] animate-spin mb-3" />
        <p className="text-sm text-[#8b968e]">Checking for an active session…</p>
      </div>
    );
  }

  // Already connected — show connected state instead of the form
  if (isConnected) {
    const brainOnline = brainStatus === "online" || brainStatus === "running";
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#121a15] border border-[#223027] mb-4">
              <Zap className="w-6 h-6 text-[#b9ec8a]" fill="#b9ec8a" />
            </div>
            <h1 className="text-2xl font-semibold text-[#eef2ee] tracking-tight">Zerodha Trader</h1>
            <p className="text-sm text-[#8b968e] mt-1">Autonomous Trading Platform</p>
          </div>

          <div className="glass rounded-3xl p-6">
            {/* Zerodha status */}
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-[#223027]">
              <div className="w-9 h-9 rounded-full bg-[#9be15d]/10 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-[#9be15d]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#eef2ee]">
                  {userProfile?.name ?? "Connected"}
                </p>
                <p className="text-xs text-[#8b968e]">
                  {userProfile?.email ?? ""}{userProfile?.broker ? ` · ${userProfile.broker}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-[#9be15d]/10 text-[#9be15d] border border-[#9be15d]/20 font-medium">
                ZERODHA
              </span>
            </div>

            {/* DB status */}
            {/* DB status */}
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-[#223027]">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                dbStatus === "connected" ? "bg-[#9be15d]/10" :
                dbStatus === "disconnected" ? "bg-[#f08a76]/10" : "bg-[#6b776e]/10"
              }`}>
                {dbStatus === "connected" ? (
                  <CheckCircle2 className="w-5 h-5 text-[#9be15d]" />
                ) : dbStatus === "disconnected" ? (
                  <XCircle className="w-5 h-5 text-[#f08a76]" />
                ) : (
                  <Loader2 className="w-5 h-5 text-[#8b968e] animate-spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#eef2ee]">Database</p>
                <p className="text-xs text-[#8b968e]">
                  {dbStatus === "connected"
                    ? "Supabase connected — trade history will be recorded"
                    : dbStatus === "disconnected"
                    ? "Database unavailable — sessions won't be persisted"
                    : "Checking database connection…"}
                </p>
              </div>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
                dbStatus === "connected" ? "bg-[#9be15d]/10 text-[#9be15d] border-[#9be15d]/20" :
                dbStatus === "disconnected" ? "bg-[#f08a76]/10 text-[#f08a76] border-[#f08a76]/20" :
                "bg-[#6b776e]/10 text-[#8b968e] border-[#6b776e]/20"
              }`}>
                {dbStatus === "connected" ? "DB" : dbStatus === "disconnected" ? "OFFLINE" : "…"}
              </span>
            </div>

            {/* Brain status */}
            <div className="flex items-center gap-3 mb-5 pb-5 border-b border-[#223027]">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                brainOnline ? "bg-[#9be15d]/10" :
                brainStatus === "offline" ? "bg-[#f08a76]/10" : "bg-[#6b776e]/10"
              }`}>
                {brainOnline ? (
                  <CheckCircle2 className="w-5 h-5 text-[#9be15d]" />
                ) : brainStatus === "offline" ? (
                  <XCircle className="w-5 h-5 text-[#f08a76]" />
                ) : (
                  <Loader2 className="w-5 h-5 text-[#8b968e] animate-spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#eef2ee]">Brain Server</p>
                <p className="text-xs text-[#8b968e]">
                  {brainStatus === "running"
                    ? "Brain is actively trading"
                    : brainStatus === "online"
                    ? "Brain is online and ready"
                    : brainStatus === "offline"
                    ? "Brain offline — check Railway deployment"
                    : "Checking brain status…"}
                </p>
              </div>
              <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${
                brainStatus === "running" ? "bg-[#9be15d]/10 text-[#9be15d] border-[#9be15d]/20" :
                brainStatus === "online"  ? "bg-[#b9ec8a]/10 text-[#b9ec8a] border-[#b9ec8a]/20" :
                brainStatus === "offline" ? "bg-[#f08a76]/10 text-[#f08a76] border-[#f08a76]/20" :
                "bg-[#6b776e]/10 text-[#8b968e] border-[#6b776e]/20"
              }`}>
                {brainStatus === "checking" ? "…" : brainStatus.toUpperCase()}
              </span>
            </div>

            {dbStatus === "disconnected" && (
              <div className="mb-4 p-3 bg-[#f08a76]/5 border border-[#f08a76]/20 rounded-lg text-xs text-[#f08a76]">
                Database is offline. You can still view your portfolio, but trade sessions won&apos;t be saved.
              </div>
            )}
            {!brainOnline && brainStatus !== "checking" && (
              <div className="mb-4 p-3 bg-[#d9b84a]/5 border border-[#d9b84a]/20 rounded-lg text-xs text-[#d9b84a]">
                Brain server is offline. Auto trade won&apos;t execute until Railway is running.
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={() => router.push("/portfolio")}
                className="w-full bg-[#b9ec8a] hover:bg-[#d6f7b8] text-[#0f1a12] rounded-full py-3 text-sm font-medium transition-colors"
              >
                Go to Portfolio
              </button>
              <button
                onClick={() => router.push("/trading")}
                className="w-full bg-[#223027] hover:bg-[#2a372e] text-[#eef2ee] rounded-lg py-3 text-sm font-medium transition-colors"
              >
                Go to Auto Trade
              </button>
              <button
                onClick={clearSession}
                className="w-full text-[#8b968e] hover:text-[#f08a76] py-2 text-xs transition-colors"
              >
                Disconnect & use different token
              </button>
            </div>
          </div>

          <NatwarTokenCard />

          <div className="mt-4 flex items-start gap-2 text-xs text-[#8b968e] px-1">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#b9ec8a]" />
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
    <div className="min-h-dvh flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#121a15] border border-[#223027] mb-4">
            <Zap className="w-6 h-6 text-[#b9ec8a]" fill="#b9ec8a" />
          </div>
          <h1 className="text-2xl font-semibold text-[#eef2ee] tracking-tight">
            Zerodha Trader
          </h1>
          <p className="text-sm text-[#8b968e] mt-1">Autonomous Trading Platform</p>
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-6 shadow-2xl">
          <h2 className="text-sm font-medium text-[#eef2ee] mb-5">
            Connect your account
          </h2>

          <form onSubmit={handleConnect} className="space-y-4">
            <div>
              <label className="block text-xs text-[#8b968e] mb-2">
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
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="text"
                  className="w-full bg-[#0a0e0c] border border-[#223027] rounded-lg px-4 py-3 pr-11 text-base md:text-sm text-[#eef2ee] placeholder-[#34443a] focus:outline-none focus:border-[#b9ec8a] transition-colors font-mono disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b968e] hover:text-[#d3dbd5] transition-colors"
                  tabIndex={-1}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-[#f08a76] text-xs bg-[#f08a76]/10 border border-[#f08a76]/20 rounded-lg p-3">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full bg-[#b9ec8a] hover:bg-[#d6f7b8] disabled:opacity-40 disabled:cursor-not-allowed text-[#0f1a12] rounded-full py-3 text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              {loading && !connected && <Loader2 className="w-4 h-4 animate-spin" />}
              {connected ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#9be15d]" />
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
            <div className="mt-5 pt-5 border-t border-[#223027] space-y-2.5">
              {STATUS_STEPS.map((step, i) => {
                const done = successSteps.includes(i);
                const pending = loading && !done && successSteps.length === i;
                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                      done ? "text-[#eef2ee]" : pending ? "text-[#8b968e]" : "text-[#2a372e]"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 text-[#9be15d] shrink-0" />
                    ) : pending ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[#b9ec8a] shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-[#2a372e] shrink-0" />
                    )}
                    {step}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <NatwarTokenCard />

        {/* Security note */}
        <div className="mt-4 flex items-start gap-2 text-xs text-[#8b968e] px-1">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#b9ec8a]" />
          <span>
            Your token is stored locally and never sent to any server other than Zerodha.
          </span>
        </div>

        {/* DB health */}
        <div className="mt-2 flex items-center gap-2 text-xs px-1">
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              dbStatus === "connected"
                ? "bg-[#9be15d]"
                : dbStatus === "disconnected"
                ? "bg-[#f08a76]"
                : "bg-[#6b776e] animate-pulse"
            }`}
          />
          <span className="text-[#8b968e]">
            {dbStatus === "checking"
              ? "Checking database..."
              : dbStatus === "connected"
              ? "Database connected"
              : "Database unavailable"}
          </span>
        </div>

        {/* How to get token */}
        <div className="mt-3 text-center">
          <button
            onClick={() => setShowModal(true)}
            className="text-xs text-[#b9ec8a] hover:underline inline-flex items-center gap-1"
          >
            How to get your access token?
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass rounded-3xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold text-[#eef2ee]">
                How to get your enc_token
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-[#8b968e] hover:text-[#eef2ee] transition-colors"
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
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#223027] text-[#b9ec8a] text-xs font-semibold flex items-center justify-center mt-0.5">
                    {n}
                  </span>
                  <div>
                    <p className="text-xs font-medium text-[#eef2ee]">{title}</p>
                    <p className="text-xs text-[#8b968e] mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-5 p-3 bg-[#0a0e0c] rounded-lg border border-[#223027]">
              <p className="text-xs text-[#8b968e]">
                <span className="text-[#d9b84a] font-medium">Note: </span>
                The enc_token expires at 6:00 AM the next day. Repeat this process daily.
              </p>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full mt-4 bg-[#223027] hover:bg-[#2a372e] text-[#eef2ee] rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
