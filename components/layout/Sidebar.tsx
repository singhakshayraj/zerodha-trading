"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Zap, Briefcase, Bot, LineChart, Compass, LogOut, LayoutDashboard, Activity } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/",          label: "Home",       icon: LayoutDashboard },
  { href: "/connect",   label: "Connect",    icon: Zap },
  { href: "/portfolio", label: "Portfolio",  icon: Briefcase },
  { href: "/trading",   label: "Auto Trade", icon: Bot },
  { href: "/insights",  label: "Insights",   icon: LineChart },
  { href: "/advisor",   label: "Advisor",    icon: Compass },
  { href: "/advisor/timeline", label: "Timeline", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, clearSession } = useAppStore();

  function handleDisconnect() {
    clearSession();
    router.push("/connect");
  }

  return (
    <>
      {/* ─── Desktop sidebar ──────────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 bg-[#111111] border-r border-[#1f1f1f] flex-col h-screen sticky top-0 shrink-0">
        <div className="p-5 border-b border-[#1f1f1f]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#3b82f6]/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#3b82f6]" fill="#3b82f6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#f5f5f5]">Zerodha Trader</p>
              <p className="text-[10px] text-[#444]">Autonomous Platform</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                pathname === href
                  ? "bg-[#1f1f1f] text-[#f5f5f5] font-medium"
                  : "text-[#555] hover:text-[#f5f5f5] hover:bg-[#181818]"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-[#1f1f1f] space-y-3">
          {userProfile && (
            <div className="px-3 py-2 bg-[#0d0d0d] rounded-lg">
              <p className="text-xs font-medium text-[#f5f5f5] truncate">{userProfile.name}</p>
              <p className="text-[10px] text-[#444] mt-0.5">{userProfile.broker}</p>
            </div>
          )}
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#555] hover:text-[#ef4444] hover:bg-[#181818] w-full transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Disconnect
          </button>
        </div>
      </aside>

      {/* ─── Mobile top bar ───────────────────────────────────────────── */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 bg-[#111111] border-b border-[#1f1f1f] pt-safe">
        <div className="h-12 flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#3b82f6]" fill="#3b82f6" />
            <p className="text-xs font-semibold text-[#f5f5f5]">Zerodha Trader</p>
          </div>
          <button
            onClick={handleDisconnect}
            aria-label="Disconnect"
            className="text-[#666] hover:text-[#ef4444] p-2"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ─── Mobile bottom nav ────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#111111] border-t border-[#1f1f1f] pb-safe">
        <div className="grid grid-cols-5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] min-h-[56px]",
                  active ? "text-[#3b82f6]" : "text-[#555] active:text-[#f5f5f5]"
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Spacers so content isn't hidden under fixed top/bottom bars on mobile */}
      <div aria-hidden className="md:hidden h-12 shrink-0" />
    </>
  );
}
