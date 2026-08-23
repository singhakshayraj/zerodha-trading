"use client";

import { useState } from "react";
import { Search, Loader2 } from "lucide-react";

// Look up any Nifty-500 name, not just holdings.
//
// Reads the score the daily rotation scan already persists to
// stock_universe.advisor_score — it scores all ~500 names and stores them
// (portfolio_advisor.scan_universe_scores). Nothing here re-implements the
// 7-factor model; that lives in Python and stays the single source of truth.
//
// Consequence, surfaced rather than hidden: the number is as fresh as the last
// advisor run, not live. The component always shows when it was scored.

type Match = {
  symbol: string; name: string | null; sector: string | null;
  industry: string | null; score: number | null; scoredAt: string | null;
  band: { label: string; tone: "good" | "bad" | "mid" } | null;
  inNifty50: boolean; held: boolean;
};

const TONE = { good: "#22c55e", bad: "#ef4444", mid: "#f59e0b" } as const;

export function StockLookup() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ match: Match | null; suggestions: string[]; query: string } | null>(null);

  async function run(symbol?: string) {
    const s = (symbol ?? q).trim();
    if (!s) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/advisor/lookup?symbol=${encodeURIComponent(s)}`);
      setRes(await r.json());
      if (symbol) setQ(symbol);
    } catch {
      setRes(null);
    } finally {
      setBusy(false);
    }
  }

  const m = res?.match;
  const stale = m?.scoredAt
    ? Math.floor((Date.now() - new Date(m.scoredAt).getTime()) / 86400000)
    : null;

  return (
    <section className="mb-5 rounded-xl border border-[#1f1f1f] bg-[#111111] p-4">
      <div className="flex items-center gap-2 mb-1">
        <Search className="w-4 h-4 text-[#3b82f6]" />
        <h2 className="text-sm font-medium text-[#f5f5f5]">Check any stock</h2>
      </div>
      <p className="text-[11px] text-[#6a6a6a] mb-3">
        Any of the ~500 names the advisor scans daily — not just the ones you hold.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); run(); }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value.toUpperCase())}
          placeholder="e.g. INFY, TATAMOTORS"
          aria-label="Stock symbol"
          className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg px-3 py-2 text-[13px] text-[#f5f5f5] placeholder:text-[#555] focus:outline-none focus:border-[#3b82f6]"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="px-4 py-2 rounded-lg text-[13px] bg-[#3b82f6]/10 border border-[#3b82f6]/40 text-[#7fb4ff] disabled:opacity-40 min-h-[40px]"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Check"}
        </button>
      </form>

      {res && !m && (
        <p className="mt-3 text-[12px] text-[#8a8a8a]">
          No exact match for <span className="text-[#f5f5f5]">{res.query}</span>.
          {res.suggestions.length > 0 && (
            <> Did you mean{" "}
              {res.suggestions.map((s, i) => (
                <span key={s}>
                  {i > 0 && ", "}
                  <button onClick={() => run(s)} className="text-[#7fb4ff] underline underline-offset-2">{s}</button>
                </span>
              ))}?
            </>
          )}
        </p>
      )}

      {m && (
        <div className="mt-3 rounded-lg border border-[#1f1f1f] bg-[#0d0d0d] p-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[#f5f5f5]">
                {m.symbol}
                {m.inNifty50 && <span className="ml-2 text-[10px] text-[#6a6a6a]">NIFTY 50</span>}
              </p>
              <p className="text-[11px] text-[#8a8a8a] truncate">
                {m.name}{m.sector ? ` · ${m.sector}` : ""}
              </p>
            </div>
            {m.score !== null && m.band ? (
              <div className="text-right shrink-0">
                <p className="text-2xl font-semibold tabular-nums" style={{ color: TONE[m.band.tone] }}>
                  {m.score > 0 ? "+" : ""}{m.score}
                </p>
                <p className="text-[11px]" style={{ color: TONE[m.band.tone] }}>{m.band.label}</p>
              </div>
            ) : m.held ? (
              // The daily scan deliberately EXCLUDES holdings (they get a full
              // verdict instead), so "not scored" here would read as a gap when
              // it is by design.
              <p className="text-[12px] text-[#7fb4ff] shrink-0">in your portfolio</p>
            ) : (
              <p className="text-[12px] text-[#8a8a8a] shrink-0">not scored yet</p>
            )}
          </div>

          <p className="mt-3 text-[11px] text-[#6a6a6a] leading-relaxed">
            {m.score === null && m.held
              ? "Held names are scored as a full verdict rather than a bare number — see the list below. "
              : ""}
            Trend score runs −100 to +100 and is the same input the advisor&apos;s verdict is built on —
            but it is <span className="text-[#a1a1aa]">not itself a verdict</span>: a full call also weighs
            swing support, overbought stretch and weekly alignment before choosing hold, trim or sell.
            {m.scoredAt && (
              <> Scored{" "}
                <span className="text-[#a1a1aa]">
                  {new Date(m.scoredAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
                </span>
                {stale !== null && stale > 1 && (
                  <span style={{ color: "#f59e0b" }}> — {stale} days ago, so it is stale until the advisor next runs</span>
                )}.
              </>
            )}
          </p>

          {m.held && (
            <p className="mt-2 text-[11px] text-[#7fb4ff]">
              You hold this — its full verdict, reasons and bear case are in the list below.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
