"use client";

import { useEffect, useState } from "react";
import { Search, Loader2, RefreshCw } from "lucide-react";
import api from "@/lib/api";

// Look up any Nifty-500 name, not just holdings.
//
// Reads the score the daily rotation scan already persists to
// stock_universe.advisor_score — it scores all ~500 names and stores them
// (portfolio_advisor.scan_universe_scores). Nothing here re-implements the
// 7-factor model; that lives in Python and stays the single source of truth.
//
// Consequence, surfaced rather than hidden: the number is as fresh as the last
// advisor run, not live. The component always shows when it was scored.

type Option = { symbol: string; name: string | null; score: number | null };

type Detail = {
  verdict: "HOLD" | "TRIM" | "SELL" | "SELL_ON_BOUNCE" | "INSUFFICIENT";
  confidence: number;
  trend_score: number;
  reasons: string[];
  counter_case?: string | null;
  stop_level: number | null;
  exit_target: number | null;
  market_regime?: string | null;
  trigger_type?: "MACRO" | "MICRO" | null;
  indicators?: { rsi_14?: number; adx?: number; ema_50?: number; ema_200?: number;
                 support?: number; resistance?: number; relative_strength_vs_nifty?: number } | null;
};

type Match = {
  symbol: string; name: string | null; sector: string | null;
  industry: string | null; score: number | null; scoredAt: string | null;
  band: { label: string; tone: "good" | "bad" | "mid" } | null;
  detail: Detail | null;
  inNifty50: boolean; held: boolean;
};

const TONE = { good: "#22c55e", bad: "#ef4444", mid: "#f59e0b" } as const;

// Same palette/wording the holdings list uses, so a searched name and a held
// name read identically — the analysis is the same analysis.
const VERDICT: Record<Detail["verdict"], { color: string; label: string }> = {
  HOLD:           { color: "#22c55e", label: "Hold" },
  TRIM:           { color: "#3b82f6", label: "Trim" },
  SELL_ON_BOUNCE: { color: "#f59e0b", label: "Sell on bounce" },
  SELL:           { color: "#ef4444", label: "Sell" },
  INSUFFICIENT:   { color: "#71717a", label: "No read" },
};

const INR = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function StockLookup() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ match: Match | null; suggestions: string[]; query: string } | null>(null);
  const [opts, setOpts] = useState<Option[]>([]);
  const [queue, setQueue] = useState<"idle" | "sending" | "queued" | "failed">("idle");

  // Ask the brain to re-score. Uses the shared `api` client deliberately: this
  // IS a user action, so the 401-redirect-to-/connect behaviour is correct here
  // (unlike the passive TokenAlert, which must never log anyone out).
  async function requestRefresh() {
    setQueue("sending");
    try {
      await api.post("/advisor/refresh");
      setQueue("queued");
    } catch {
      setQueue("failed");
    }
  }

  // Typeahead. A native <datalist> rather than a custom popover: the browser
  // handles keyboard nav, mobile and dismissal, which is most of what a hand-
  // rolled dropdown gets wrong. Debounced so typing a 10-char ticker is one
  // request at rest, not ten.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2) { setOpts([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/advisor/lookup?symbol=${encodeURIComponent(s)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setOpts(d?.options ?? []))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

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
          list="stock-symbols"
          autoComplete="off"
          className="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1f1f1f] rounded-lg px-3 py-2 text-[13px] text-[#f5f5f5] placeholder:text-[#555] focus:outline-none focus:border-[#3b82f6]"
        />
        <datalist id="stock-symbols">
          {opts.map((o) => (
            // label carries the company name + score where the browser shows it
            <option key={o.symbol} value={o.symbol}
                    label={`${o.name ?? ""}${o.score !== null ? `  ·  ${o.score > 0 ? "+" : ""}${o.score}` : ""}`} />
          ))}
        </datalist>

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

          {m.detail && m.detail.verdict !== "INSUFFICIENT" && (
            <div className="mt-3 pt-3 border-t border-[#1f1f1f] space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-1 rounded-md text-[12px] font-semibold border"
                      style={{ color: VERDICT[m.detail.verdict].color,
                               borderColor: `${VERDICT[m.detail.verdict].color}55`,
                               background: `${VERDICT[m.detail.verdict].color}14` }}>
                  {VERDICT[m.detail.verdict].label}
                </span>
                <span className="text-[11px] text-[#6a6a6a]">
                  confidence {m.detail.confidence}%
                  {m.detail.trigger_type ? ` · ${m.detail.trigger_type === "MACRO" ? "long-term structure" : "short-term signal"}` : ""}
                </span>
              </div>

              <ul className="space-y-1.5">
                {m.detail.reasons.map((r, i) => (
                  <li key={i} className="text-[12px] text-[#c5c5c5] leading-relaxed flex gap-2">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-[#555] shrink-0" />{r}
                  </li>
                ))}
              </ul>

              {/* [P-33] the case AGAINST — its own block, never a bullet in the
                  list above, which is confirmatory by construction. */}
              {m.detail.counter_case && (
                <div className="rounded border border-[#3a3320] bg-[#17140c] px-2.5 py-2">
                  <p className="text-[9px] uppercase tracking-wide mb-1" style={{ color: "#f59e0b" }}>
                    {m.detail.verdict === "SELL" || m.detail.verdict === "SELL_ON_BOUNCE"
                      ? "Bull case — what would make this sell wrong"
                      : "Bear case — what would make this call wrong"}
                  </p>
                  <p className="text-[12px] text-[#c5b898] leading-relaxed">{m.detail.counter_case}</p>
                </div>
              )}

              {(m.detail.stop_level || m.detail.exit_target || m.detail.indicators) && (
                <div className="flex flex-wrap gap-2">
                  {m.detail.exit_target && (
                    <span className="px-2 py-1 rounded bg-[#0a0a0a] border border-[#1f1f1f] text-[11px] text-[#d5d5d5]">
                      sell near <span style={{ color: "#f59e0b" }}>{INR(m.detail.exit_target)}</span>
                    </span>
                  )}
                  {m.detail.stop_level && (
                    <span className="px-2 py-1 rounded bg-[#0a0a0a] border border-[#1f1f1f] text-[11px] text-[#d5d5d5]">
                      exit below <span style={{ color: "#ef4444" }}>{INR(m.detail.stop_level)}</span>
                    </span>
                  )}
                  {m.detail.indicators?.rsi_14 != null && (
                    <span className="px-2 py-1 rounded bg-[#0a0a0a] border border-[#1f1f1f] text-[11px] text-[#8a8a8a]">
                      RSI {m.detail.indicators.rsi_14.toFixed(0)}
                    </span>
                  )}
                  {m.detail.indicators?.adx != null && (
                    <span className="px-2 py-1 rounded bg-[#0a0a0a] border border-[#1f1f1f] text-[11px] text-[#8a8a8a]">
                      ADX {m.detail.indicators.adx.toFixed(0)}
                    </span>
                  )}
                  {m.detail.indicators?.relative_strength_vs_nifty != null && (
                    <span className="px-2 py-1 rounded bg-[#0a0a0a] border border-[#1f1f1f] text-[11px] text-[#8a8a8a]">
                      vs NIFTY {m.detail.indicators.relative_strength_vs_nifty > 0 ? "+" : ""}
                      {m.detail.indicators.relative_strength_vs_nifty.toFixed(1)}pp
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {m.score !== null && !m.detail && (
            <p className="mt-3 pt-3 border-t border-[#1f1f1f] text-[11px] text-[#8a8a8a]">
              Only the trend score is stored for this name so far — the full
              read (reasons, levels, bear case) lands on the next advisor run.
            </p>
          )}


          {m.scoredAt && stale !== null && stale > 1 && (
            <div className="mt-3 pt-3 border-t border-[#1f1f1f] flex items-center gap-3 flex-wrap">
              <button
                onClick={requestRefresh}
                disabled={queue === "sending" || queue === "queued"}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] bg-[#3b82f6]/10 border border-[#3b82f6]/40 text-[#7fb4ff] disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${queue === "sending" ? "animate-spin" : ""}`} />
                {queue === "queued" ? "Requested" : "Re-run analysis"}
              </button>
              <span className="text-[11px] text-[#6a6a6a]">
                {queue === "queued"
                  ? "Queued — the brain picks it up within ~30s and needs a live token. Refresh this page after that."
                  : queue === "failed"
                  ? "Could not queue the request."
                  : "Re-scores all ~500 names, including on weekends."}
              </span>
            </div>
          )}

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
