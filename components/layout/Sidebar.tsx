"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Zap, LogOut, TrendingUp } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/trading", label: "Trading", icon: Zap },
];

export function Sidebar() {
  const pathname = usePathname();
  const { userProfile, sessionExpiry, clearSession } = useAppStore();

  return (
    <aside className="w-56 bg-[#111111] border-r border-[#1f1f1f] flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#3b82f6]" />
          <span className="font-semibold text-[#f5f5f5]">ZT Dashboard</span>
        </div>
        {userProfile && (
          <div className="mt-3">
            <p className="text-xs text-[#f5f5f5] font-medium">{userProfile.user_name}</p>
            <p className="text-xs text-[#666666]">{userProfile.user_id}</p>
          </div>
        )}
        {sessionExpiry && (
          <div className="mt-2 px-2 py-1 bg-[#1f1f1f] rounded text-xs text-[#666666]">
            Expires {sessionExpiry}
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              pathname === href
                ? "bg-[#1f1f1f] text-[#f5f5f5]"
                : "text-[#666666] hover:text-[#f5f5f5] hover:bg-[#1a1a1a]"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-[#1f1f1f]">
        <button
          onClick={clearSession}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-[#666666] hover:text-[#ef4444] hover:bg-[#1a1a1a] w-full transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Disconnect
        </button>
      </div>
    </aside>
  );
}
