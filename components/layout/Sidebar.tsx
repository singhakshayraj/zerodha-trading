"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Zap, Briefcase, Bot, LineChart, Compass, LogOut, LayoutDashboard, Activity, Trophy, Crosshair, GraduationCap, Wallet, ListChecks, Landmark, FlaskConical, MoreHorizontal, X } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { AskDrawer } from "@/components/AskDrawer";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ElementType; short?: string };

// Grouped so the sidebar reads as 5 short lists instead of one 14-item column.
// Every page is still here — grouping only changes how they're presented.
const navGroups: { title: string | null; items: NavItem[] }[] = [
  { title: null, items: [
    { href: "/", label: "Home", icon: LayoutDashboard },
  ] },
  { title: "Trading", items: [
    { href: "/trading",  label: "Auto Trade",    icon: Bot,          short: "Trade" },
    { href: "/insights", label: "Insights",      icon: LineChart },
    { href: "/lab",      label: "Lab",           icon: FlaskConical },
    { href: "/autopsy",  label: "Exit Frontier", icon: Crosshair,    short: "Exits" },
  ] },
  { title: "Advisor", items: [
    { href: "/advisor",                label: "Advisor",   icon: Compass },
    { href: "/advisor/timeline",       label: "Timeline",  icon: Activity },
    { href: "/advisor/accountability", label: "Scorecard", icon: Trophy },
    { href: "/advisor/calls",          label: "Calls",     icon: ListChecks },
  ] },
  { title: "Money", items: [
    { href: "/portfolio", label: "Portfolio", icon: Briefcase, short: "Folio" },
    { href: "/pnl",       label: "P&L",       icon: Wallet },
    { href: "/household", label: "Household", icon: Landmark },
  ] },
  { title: "Setup", items: [
    { href: "/connect", label: "Connect", icon: Zap },
    { href: "/learn",   label: "Learn",   icon: GraduationCap },
  ] },
];
const navItems = navGroups.flatMap((g) => g.items);

// Mobile bottom bar: the four most-used pages + "More". 14 tabs in one row was
// ~25px a tab with 9px labels; everything else lives in the More sheet.
const MOBILE_TABS = ["/", "/trading", "/portfolio", "/advisor"];
const isAdvisor = (p: string) => p === "/advisor" || p.startsWith("/advisor/");
const ADVISOR_TABS = navGroups.find((g) => g.title === "Advisor")!.items;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { userProfile, clearSession } = useAppStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const activeLabel = navItems.find((i) => i.href === pathname)?.label ?? "Zerodha Trader";

  // Reflect the current section in the browser tab so multiple open tabs are
  // distinguishable (the static layout metadata makes every tab read the same).
  useEffect(() => {
    const active = navItems.find((i) => i.href === pathname)?.label;
    document.title = active ? `${active} · Zerodha Trader` : "Zerodha Trader";
  }, [pathname]);

  // Close the More sheet on navigation and on Escape.
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMoreOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  function handleDisconnect() {
    // Guard the one-tap logout — it clears the saved enctoken, and an accidental
    // tap (the icon is a small target on mobile) means pasting the token again.
    if (!window.confirm("Disconnect and clear your saved token? You'll need to paste it again to reconnect.")) return;
    clearSession();
    router.push("/connect");
  }

  // Tapping the tab you're already on scrolls the content back to top (the
  // native-app pattern) instead of a no-op navigation. main is the app-shell
  // scroll container; if it's already at the top, let the link behave normally.
  function handleNavClick(e: React.MouseEvent, href: string) {
    if (pathname !== href) return;
    const scroller = document.querySelector("main");
    if (scroller && scroller.scrollTop > 0) {
      e.preventDefault();
      scroller.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const moreActive = !MOBILE_TABS.includes(pathname) && !isAdvisor(pathname);

  return (
    <>
      {/* ─── Desktop sidebar ──────────────────────────────────────────── */}
      <aside className="hidden md:flex w-56 bg-[#111111] border-r border-[#1f1f1f] flex-col h-dvh sticky top-0 shrink-0">
        <div className="p-5 border-b border-[#1f1f1f]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#3b82f6]/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#3b82f6]" fill="#3b82f6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f5f5f5]">Zerodha Trader</p>
              <p className="text-xs text-[#8a8a8a]">Autonomous Platform</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
          {navGroups.map((g) => (
            <div key={g.title ?? "top"} className="space-y-0.5">
              {g.title && <p className="px-3 pb-1 text-xs font-medium text-[#8a8a8a]">{g.title}</p>}
              {g.items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={(e) => handleNavClick(e, href)}
                  aria-current={pathname === href ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    pathname === href
                      ? "bg-[#1f1f1f] text-[#f5f5f5] font-medium"
                      : "text-[#a1a1aa] hover:text-[#f5f5f5] hover:bg-[#181818]"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-[#1f1f1f] space-y-3">
          {userProfile && (
            <div className="px-3 py-2 bg-[#0d0d0d] rounded-lg">
              <p className="text-xs font-medium text-[#f5f5f5] truncate">{userProfile.name}</p>
              <p className="text-xs text-[#8a8a8a] mt-0.5">{userProfile.broker}</p>
            </div>
          )}
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#a1a1aa] hover:text-[#ef4444] hover:bg-[#181818] w-full transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Disconnect
          </button>
        </div>
      </aside>

      {/* ─── Mobile top bar ───────────────────────────────────────────── */}
      {/* In normal flow (order-first) inside the page's h-dvh flex column — NOT
          position:fixed. Fixed bars over a scrolling body jank on Android Chrome
          as the URL bar hides; here the body never scrolls (main does), so the
          URL bar stays put and the bar never overlaps content. */}
      <header className="md:hidden order-first shrink-0 bg-[#111111] border-b border-[#1f1f1f] pt-safe">
        <div className="h-12 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="w-4 h-4 text-[#3b82f6] shrink-0" fill="#3b82f6" />
            <p className="text-sm font-semibold text-[#f5f5f5] truncate">{activeLabel}</p>
          </div>
          <button
            onClick={handleDisconnect}
            aria-label="Disconnect"
            className="text-[#8a8a8a] hover:text-[#ef4444] p-2"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ─── Mobile Advisor sub-tabs ──────────────────────────────────── */}
      {/* The four Advisor pages share one bottom tab; this strip switches
          between them. order-first keeps it directly under the header. */}
      {isAdvisor(pathname) && (
        <div className="md:hidden order-first shrink-0 bg-[#111111] border-b border-[#1f1f1f] flex overflow-x-auto">
          {ADVISOR_TABS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={(e) => handleNavClick(e, href)}
              aria-current={pathname === href ? "page" : undefined}
              className={cn(
                "flex-1 text-center whitespace-nowrap px-3 py-2.5 text-sm border-b-2",
                pathname === href ? "border-[#3b82f6] text-[#f5f5f5] font-medium" : "border-transparent text-[#a1a1aa]"
              )}
            >
              {label === "Advisor" ? "Today" : label}
            </Link>
          ))}
        </div>
      )}

      {/* ─── Mobile bottom nav ────────────────────────────────────────── */}
      {/* order-last → sits below the scrollable main in the flex column (flow,
          not fixed) so no content is ever hidden behind it. */}
      <nav className="md:hidden order-last shrink-0 bg-[#111111] border-t border-[#1f1f1f] pb-safe">
        <div className="grid grid-cols-5">
          {MOBILE_TABS.map((href) => {
            const { label, short, icon: Icon } = navItems.find((i) => i.href === href)!;
            const active = href === "/advisor" ? isAdvisor(pathname) : pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={(e) => handleNavClick(e, href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-1.5 min-h-[56px]",
                  active ? "text-[#3b82f6]" : "text-[#a1a1aa] active:text-[#f5f5f5]"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-xs leading-none">{short ?? label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={cn(
              "flex flex-col items-center justify-center gap-1 py-1.5 min-h-[56px]",
              moreActive ? "text-[#3b82f6]" : "text-[#a1a1aa] active:text-[#f5f5f5]"
            )}
          >
            <MoreHorizontal className="w-5 h-5 shrink-0" />
            <span className="text-xs leading-none">More</span>
          </button>
        </div>
      </nav>

      {/* ─── Mobile "More" sheet: every page, grouped ─────────────────── */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-label="All pages">
          <button aria-label="Close" className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
          <div className="relative bg-[#111111] border-t border-[#262626] rounded-t-2xl px-4 pt-3 pb-safe max-h-[80dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[#f5f5f5]">All pages</p>
              <button aria-label="Close" onClick={() => setMoreOpen(false)} className="p-2 text-[#a1a1aa]"><X className="w-5 h-5" /></button>
            </div>
            {navGroups.filter((g) => g.title).map((g) => (
              <div key={g.title} className="mb-4">
                <p className="text-xs font-medium text-[#8a8a8a] mb-1.5">{g.title}</p>
                <div className="grid grid-cols-2 gap-2">
                  {g.items.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      aria-current={pathname === href ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-3 text-sm border",
                        pathname === href ? "border-[#3b82f6] text-[#f5f5f5] bg-[#3b82f6]/10" : "border-[#1f1f1f] text-[#d5d5d5] bg-[#0d0d0d]"
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* [P-54 spike] on-device "Ask your book" chat, on every page */}
      <AskDrawer />
    </>
  );
}
