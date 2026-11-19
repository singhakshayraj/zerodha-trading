"use client";
// Dashboard sign-in: replaces the browser's HTTP Basic popup. Posts the
// password to /api/login (sets an HttpOnly cookie), then returns to ?next=.
import { useState } from "react";
import { Zap } from "lucide-react";
import { safeNext } from "@/lib/auth";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (r?.ok) {
      window.location.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
      return;
    }
    setBusy(false);
    setPassword("");
    setError(
      r?.status === 401 ? "That password didn't match. Try again."
        : r?.status === 503 ? "Sign-in is off: no dashboard password is set on the server."
        : "Couldn't reach the server. Check your connection and try again.",
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="glass rounded-3xl p-6 md:p-8 w-full max-w-sm flex flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full bg-[radial-gradient(circle_at_35%_30%,#c8f29c,#5fae3a_70%)] flex items-center justify-center">
            <Zap className="w-4 h-4 text-[#0f1a12]" fill="#0f1a12" />
          </span>
          <span className="text-sm font-semibold text-[#eef2ee]">Zerodha Trader</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] leading-tight font-light text-[#eef2ee]">Sign in</h1>
          <p className="text-sm text-[#a9b3ab]">Enter the dashboard password.</p>
        </div>
        <label className="flex flex-col gap-2 text-[13px] text-[#a9b3ab]">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.1] px-4 text-base text-[#eef2ee] outline-none focus:ring-2 focus:ring-[#9be15d]/60"
          />
        </label>
        {error && <p role="alert" className="text-sm text-[#f08a76] -mt-2">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="h-12 rounded-full bg-[#b9ec8a] hover:bg-[#d6f7b8] text-[#0f1a12] text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b9ec8a]"
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
