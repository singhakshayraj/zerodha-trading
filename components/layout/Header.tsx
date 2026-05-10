"use client";

import { useAppStore } from "@/lib/store";
import { Clock } from "lucide-react";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { sessionExpiry } = useAppStore();

  return (
    <header className="h-14 border-b border-[#1f1f1f] flex items-center justify-between px-6 bg-[#0a0a0a]">
      <h1 className="text-sm font-medium text-[#f5f5f5]">{title}</h1>
      {sessionExpiry && (
        <div className="flex items-center gap-2 text-xs text-[#666666]">
          <Clock className="w-3 h-3" />
          <span>Session expires at {sessionExpiry}</span>
        </div>
      )}
    </header>
  );
}
