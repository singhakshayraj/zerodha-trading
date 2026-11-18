"use client";

// MOCK-ONLY validations page. Dedicated home for the automated test suite so
// it can grow (more steps, history, timing charts) without fighting the
// trading dashboard's fixed-height layout. The real page reload in step E
// lands back here, and the panel resumes from sessionStorage.

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ValidationsPanel } from "../trading/validations";

export default function MockValidationsPage() {
  return (
    <div className="min-h-dvh">
      <div className="w-full bg-amber-400 text-black flex flex-wrap items-center justify-center gap-3 text-xs md:text-sm font-bold py-2 px-4 tracking-wide">
        <span>🧪 MOCK ENVIRONMENT — validation suite, staging data only</span>
      </div>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-[#eef2ee]">Validations</h1>
            <p className="text-xs text-[#8b968e] mt-1">
              Automated end-to-end checks against the staging simulation — grows
              with the system (see docs/PAPER_TRADING_ROADMAP.md).
            </p>
          </div>
          <Link
            href="/mock/trading"
            className="flex items-center gap-1.5 text-xs text-[#a9b3ab] hover:text-[#eef2ee] border border-[#223027] rounded px-3 py-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Mock Dashboard
          </Link>
        </div>

        <ValidationsPanel defaultOpen />
      </div>
    </div>
  );
}
