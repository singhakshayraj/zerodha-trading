"use client";

// MOCK-ONLY automated validation panel. Runs a scripted end-to-end test of
// the live-seed flow against the /mock/api routes, including a REAL browser
// reload to verify session-restore (task #20) and live counter updates
// (task #21). State survives the reload via sessionStorage.

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

const STORAGE_KEY = "mock_validation_state";

type StepStatus = "PENDING" | "RUNNING" | "PASS" | "FAIL" | "SKIPPED";

interface StepResult {
  id: string;
  name: string;
  status: StepStatus;
  detail: string;
  ts: string | null;
}

interface PersistedState {
  phase: "awaiting-reload-check";
  sessionId: string;
  tradeCountBeforeReload: number;
  steps: StepResult[];
}

const INITIAL_STEPS: StepResult[] = [
  { id: "A", name: "Reset", status: "PENDING", detail: "", ts: null },
  { id: "B", name: "Seed Live", status: "PENDING", detail: "", ts: null },
  { id: "C", name: "Trade count increments live", status: "PENDING", detail: "", ts: null },
  { id: "D", name: "Brain status while running", status: "PENDING", detail: "", ts: null },
  { id: "E", name: "Real page reload", status: "PENDING", detail: "", ts: null },
  { id: "F", name: "Session restored after reload", status: "PENDING", detail: "", ts: null },
  { id: "G", name: "Session ended cleanly", status: "PENDING", detail: "", ts: null },
];

const now = () => new Date().toLocaleTimeString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(path: string, method: "GET" | "POST" = "GET") {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`/mock/api${path}${sep}t=${Date.now()}`, {
    method,
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  let body: Record<string, unknown> = {};
  try { body = await res.json(); } catch { /* non-JSON body */ }
  return { httpOk: res.ok, status: res.status, body };
}

export function ValidationsPanel() {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<StepResult[]>(INITIAL_STEPS);
  const [running, setRunning] = useState(false);
  const [verdict, setVerdict] = useState<string | null>(null);

  const update = useCallback((id: string, patch: Partial<StepResult>) => {
    setSteps((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch, ts: now() } : s));
      return next;
    });
  }, []);

  // Post-reload continuation (steps E/F/G). Runs on mount if the pre-reload
  // half of the sequence left a marker in sessionStorage.
  useEffect(() => {
    const raw = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return;
    let saved: PersistedState;
    try { saved = JSON.parse(raw); } catch { sessionStorage.removeItem(STORAGE_KEY); return; }
    if (saved.phase !== "awaiting-reload-check") return;
    sessionStorage.removeItem(STORAGE_KEY);

    setOpen(true);
    setRunning(true);
    // Restore pre-reload results so the full report shows A-D too.
    setSteps(saved.steps.map((s) =>
      s.id === "E"
        ? { ...s, status: "PASS", detail: "page actually reloaded", ts: now() }
        : s
    ));

    (async () => {
      let allPass = true;
      // STEP F — verify session survived the reload
      update("F", { status: "RUNNING", detail: "checking /trades/live…" });
      try {
        const r = await call("/trades/live");
        const sid = (r.body.sessionId as string | null) ?? null;
        const count = (r.body.tradesCount as number) ?? 0;
        const active = Boolean(r.body.isSessionActive);
        const sidOk = sid === saved.sessionId;
        const countOk = count >= saved.tradeCountBeforeReload;
        if (sidOk && countOk && active) {
          update("F", {
            status: "PASS",
            detail: `count ${saved.tradeCountBeforeReload}→${count}, active=${active}, session ${sid?.slice(0, 8)}`,
          });
        } else {
          allPass = false;
          update("F", {
            status: "FAIL",
            detail: `expected session ${saved.sessionId.slice(0, 8)} count>=${saved.tradeCountBeforeReload} active=true — got session ${sid?.slice(0, 8) ?? "null"}, count ${count}, active=${active}`,
          });
        }
      } catch (e) {
        allPass = false;
        update("F", { status: "FAIL", detail: `request failed: ${String(e)}` });
      }

      // STEP G — cleanup (run even if F failed, so staging isn't left RUNNING)
      update("G", { status: "RUNNING", detail: "ending session…" });
      try {
        const r = await call("/seed/end", "POST");
        if (r.httpOk && r.body.ok) {
          const totals = r.body.totals as { trades: number; totalPnl: number } | undefined;
          update("G", {
            status: allPass ? "PASS" : "PASS",
            detail: totals ? `COMPLETED — ${totals.trades} trades, P&L ${totals.totalPnl}` : "COMPLETED",
          });
        } else {
          allPass = false;
          update("G", { status: "FAIL", detail: `HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}` });
        }
      } catch (e) {
        allPass = false;
        update("G", { status: "FAIL", detail: `request failed: ${String(e)}` });
      }

      setVerdict(allPass
        ? "ALL CHECKS PASSED — Tasks #20 and #21 verified"
        : "FAILURES DETECTED — see red steps above");
      setRunning(false);
    })();
  }, [update]);

  const run = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setVerdict(null);
    let currentSteps: StepResult[] = INITIAL_STEPS.map((s) => ({ ...s }));
    setSteps(currentSteps);

    const mark = (id: string, patch: Partial<StepResult>) => {
      currentSteps = currentSteps.map((s) => (s.id === id ? { ...s, ...patch, ts: now() } : s));
      setSteps(currentSteps);
    };
    const fail = (id: string, detail: string) => {
      mark(id, { status: "FAIL", detail });
      // Stop the sequence — mark the rest skipped, don't cascade failures.
      for (const s of currentSteps) if (s.status === "PENDING") mark(s.id, { status: "SKIPPED", detail: "sequence stopped" });
      setVerdict("FAILURES DETECTED — sequence stopped at step " + id);
      setRunning(false);
    };

    try {
      // STEP A — Reset
      mark("A", { status: "RUNNING", detail: "POST /seed?reset=1" });
      const a = await call("/seed?reset=1", "POST");
      if (!a.httpOk || !a.body.ok) return fail("A", `HTTP ${a.status}: ${JSON.stringify(a.body).slice(0, 200)}`);
      mark("A", { status: "PASS", detail: "cleared OK" });

      // STEP B — Seed Live
      mark("B", { status: "RUNNING", detail: "POST /seed?mode=live" });
      const b = await call("/seed?mode=live", "POST");
      const sessionId = b.body.sessionId as string | undefined;
      if (!b.httpOk || !b.body.ok || b.body.verified !== true || !sessionId) {
        return fail("B", `expected ok+verified — got HTTP ${b.status}: ${JSON.stringify(b.body).slice(0, 200)}`);
      }
      mark("B", { status: "PASS", detail: `session ${sessionId.slice(0, 8)}, verified` });

      // STEP C — trade count increments over consecutive polls.
      // The panel drives /seed/tick itself (the Seed button's interval isn't
      // running during validation). Window is 40s: the market sim holds up to
      // 2 concurrent positions and only opens the next trade after an exit
      // (SL/target hit or an aged signal exit), so the count legitimately
      // plateaus for several ticks before incrementing.
      mark("C", { status: "RUNNING", detail: "polling /trades/live every 2s (up to 40s)…" });
      const counts: number[] = [];
      let increments = 0;
      const deadline = Date.now() + 40_000;
      while (Date.now() < deadline && increments < 2) {
        await call("/seed/tick", "POST");
        const c = await call("/trades/live");
        const count = (c.body.tradesCount as number) ?? 0;
        if (counts.length > 0 && count > counts[counts.length - 1]) increments++;
        counts.push(count);
        mark("C", { status: "RUNNING", detail: `observed [${counts.join(",")}]` });
        if (increments >= 2) break;
        await sleep(2000);
      }
      if (increments < 2) return fail("C", `count did not increment twice within 40s — observed [${counts.join(",")}]`);
      mark("C", { status: "PASS", detail: `observed [${counts.join(",")}]` });
      const lastCount = counts[counts.length - 1];

      // STEP D — brain status while running
      mark("D", { status: "RUNNING", detail: "GET /brain/status" });
      const d = await call("/brain/status");
      const status = d.body.status as string;
      const pingAge = d.body.secondsSinceLastPing as number | null;
      if (status === "OFFLINE" || !d.body.isAlive) {
        return fail("D", `expected RUNNING/alive — got ${status}, ping ${pingAge ?? "?"}s ago`);
      }
      mark("D", { status: "PASS", detail: `${status}, ping ${pingAge ?? "?"}s ago` });

      // STEP E — persist everything, then REAL reload. Steps F/G resume on mount.
      mark("E", { status: "RUNNING", detail: "reloading page…" });
      const persisted: PersistedState = {
        phase: "awaiting-reload-check",
        sessionId,
        tradeCountBeforeReload: lastCount,
        steps: currentSteps,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
      window.location.reload();
    } catch (e) {
      fail("?", String(e));
    }
  }, [running]);

  const ICONS: Record<StepStatus, string> = {
    PENDING: "⬜", RUNNING: "🔄", PASS: "✅", FAIL: "❌", SKIPPED: "⏭️",
  };

  return (
    <div className="border border-[#1f1f1f] rounded-lg bg-[#0f0f0f] mx-4 md:mx-6 my-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#f5f5f5]"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Validations
        <span className="text-[#666] font-normal">— automated live-seed test (tasks #20/#21)</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <button
            onClick={run}
            disabled={running}
            className="mb-3 px-3 py-1.5 rounded bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/30 hover:bg-[#22c55e]/20 disabled:opacity-50 text-xs font-medium"
          >
            {running ? "Running…" : "Run Validations"}
          </button>
          <ul className="space-y-1.5">
            {steps.map((s) => (
              <li key={s.id} className="flex items-start gap-2 text-xs font-mono">
                <span>{ICONS[s.status]}</span>
                <span className={
                  s.status === "FAIL" ? "text-[#ef4444]" :
                  s.status === "PASS" ? "text-[#22c55e]" :
                  "text-[#999]"
                }>
                  {s.id}. {s.name}
                  {s.detail && <span className="text-[#666]"> — {s.detail}</span>}
                  {s.ts && <span className="text-[#444]"> ({s.ts})</span>}
                </span>
              </li>
            ))}
          </ul>
          {verdict && (
            <div className={`mt-3 text-xs font-bold ${verdict.startsWith("ALL") ? "text-[#22c55e]" : "text-[#ef4444]"}`}>
              {verdict}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
