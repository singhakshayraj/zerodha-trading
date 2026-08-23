"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import api from "@/lib/api";

// Acquisition is this system's only real failure mode — 45.2% uptime since
// 2026-07-10, and every lost day was an enctoken nobody pasted before 09:15
// (see docs/reference/DESIGN_REVIEW_2026-08-23.md).
//
// Rendered from the root layout so it appears on ALL pages, not just home: the
// warning is worthless if you happen to land on /trading. Deliberately
// `fixed` rather than in the flow — every page is an `h-dvh overflow-hidden`
// shell, and inserting a block above it would break that height math.
//
// Not shown on /connect, which is the page that fixes the problem.
export function TokenAlert() {
  const [stale, setStale] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    // api.get carries the auth this route requires; a bare fetch 401s.
    api.get<{ tokenStale?: boolean }>("/brain/status")
      .then((r) => setStale(Boolean(r.data?.tokenStale)))
      .catch(() => {});
  }, [pathname]);

  if (!stale || pathname === "/connect") return null;

  return (
    <div
      role="alert"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-50 max-w-[min(92vw,620px)]
                 rounded-lg border px-3 py-2 flex items-start gap-2 shadow-lg backdrop-blur"
      style={{ borderColor: "#ef444488", background: "#2a0f0fee" }}
    >
      <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#ef4444" }} />
      <p className="text-[12px] leading-relaxed text-[#e8dcdc]">
        <span className="font-semibold" style={{ color: "#ef4444" }}>NO LIVE TOKEN</span>
        {" — missing or set before today's ~04:34 IST flush, so no session can start. "}
        <Link href="/connect" className="text-[#7fb4ff] underline underline-offset-2">
          paste a fresh one →
        </Link>
      </p>
    </div>
  );
}
