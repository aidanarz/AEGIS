"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { RoleSwitcher } from "@/components/role-provider";

// Routes are added here as each phase ships them.
const NAV = [
  { href: "/dashboard", label: "Dashboard", pillar: "Single Pane of Glass" },
  { href: "/alerts", label: "Alerts", pillar: "AI Root Cause & Action" },
  { href: "/actions", label: "Actions", pillar: "Action Tracker" },
  { href: "/incidents", label: "Incidents", pillar: "Unified records" },
  { href: "/data-sources", label: "Data Sources", pillar: "Data Foundation" },
  { href: "/dev/ai-eval", label: "AI Eval", pillar: "FR-3.6 leave-one-out" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="bg-navy-deep text-white">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 lg:gap-8 lg:px-6">
        <Link href="/dashboard" className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
          <span className="font-heading text-lg font-bold text-white">
            <span className="hidden lg:inline">Intelligence Manufacturing</span>
            <span className="lg:hidden">IM</span>
          </span>
          <span className="hidden text-xs text-cyan xl:inline">CALIBER 2026 · Case 2</span>
        </Link>
        <nav className="flex min-w-0 gap-1 overflow-x-auto">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.pillar}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active ? "bg-navy text-white" : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto shrink-0">
          <RoleSwitcher />
        </div>
      </div>
      <div className="h-1 bg-gradient-to-r from-cyan via-cyan-deep to-lime" />
    </header>
  );
}
