"use client";

// [P-59] What-if planner on /advisor: type moves, see the household impact.
// Pure computation over the two advisor payloads; nothing is sent anywhere.

import { useEffect, useRef, useState } from "react";
import { FlaskConical } from "lucide-react";
import api from "@/lib/api";
import { parseMoves, simulate, booksFrom, CAPS, type WhatIf as Result, type Books } from "@/lib/ask/whatif";
import type { Account } from "@/lib/ask/tools";

const GREEN = "#22c55e", RED = "#ef4444", AMBER = "#f59e0b";
const INR = (n: number) => (n < 0 ? "-" : "") + "₹" + Math.round(Math.abs(n)).toLocaleString("en-IN");

export function WhatIf({ account }: { account: Account }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [errs, setErrs] = useState<string[]>([]);
  const data = useRef<{ books: Books; indexWeights: Record<string, number | null>; known: string[] } | null>(null);
  useEffect(() => { data.current = null; }, [account]);

  async function run() {
    if (!text.trim()) return;
    if (!data.current) {
      const [p, n] = await Promise.all([api.get("/advisor").catch(() => null), api.get("/advisor/natwar").catch(() => null)]);
      data.current = booksFrom(p?.data ?? null, n?.data ?? null);
    }
    const { moves, errors } = parseMoves(text, account, data.current.known);
    setErrs(errors); setRes(simulate(moves, data.current.books, data.current.indexWeights));
  }

  return (
    <div className="bg-[#111111] border border-[#1f1f1f] rounded-xl p-4" data-testid="what-if">
      <p className="text-[10px] text-[#7a7a7a] uppercase tracking-wide mb-2 flex items-center gap-1.5"><FlaskConical className="w-3 h-3" /> What if · both accounts as one book</p>
      <form onSubmit={(e) => { e.preventDefault(); run(); }} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`sell 10 ATGL, buy ₹50k PETRONET${account === "natwar" ? "" : " in natwar"}, switch IOB to UNIONBANK`}
          className="flex-1 min-w-0 bg-[#0a0a0a] border border-[#262626] rounded-lg px-3 py-2 text-[12px] text-[#f5f5f5] placeholder-[#444] focus:outline-none focus:border-[#60a5fa]" />
        <button type="submit" className="px-3 rounded-lg bg-[#1f1f1f] border border-[#333] text-[12px] text-[#f5f5f5] hover:bg-[#2a2a2a]">Simulate</button>
      </form>
      {res && (
        <div className="mt-3 space-y-2 text-[12px]">
          <p className="text-[#d5d5d5]">
            Net cash <span className="font-semibold tabular-nums" style={{ color: res.net_cash >= 0 ? GREEN : AMBER }}>{INR(res.net_cash)}</span>
            <span className="text-[#7a7a7a]"> · sold {INR(res.cash_freed)} · bought {INR(res.cash_deployed)} · book {INR(res.total_before)} → {INR(res.total_after)}</span>
          </p>
          {res.sectors.length > 0 && (
            <ul className="space-y-0.5">
              {res.sectors.map((l) => (
                <li key={l.group} className="flex gap-2 tabular-nums">
                  <span className="text-[#c5c5c5] flex-1 min-w-0 truncate">{l.group}</span>
                  <span className="text-[#8a8a8a]">{l.before}% →</span>
                  <span className="font-semibold" style={{ color: l.breach ? RED : "#f5f5f5" }}>{l.after}%</span>
                  <span className="text-[#6a6a6a] w-20 text-right">{l.index != null ? `index ${l.index}%` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {res.names.map((n) => (
            <p key={n.symbol} className="text-[#8a8a8a] tabular-nums">{n.symbol}: {n.before}% → <span style={{ color: n.breach ? RED : "#d5d5d5" }}>{n.after}%</span> of the household{n.accounts.length > 1 ? " (both accounts)" : ""}</p>
          ))}
          <p style={{ color: res.breaches.length ? RED : GREEN }}>
            {res.breaches.length ? `Breaks: ${res.breaches.join("; ")}` : `No caps broken (sector ${CAPS.sector}%, name ${CAPS.name}%, both-accounts ${CAPS.dup}%, ETFs ${res.etf_pct}% of ${CAPS.etf}%)`}
          </p>
          {(errs.length > 0 || res.errors.length > 0) && <p style={{ color: AMBER }}>{[...errs, ...res.errors].join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}
