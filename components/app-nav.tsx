"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { RoleSwitcher } from "@/components/role-provider";

// Routes are added here as each phase ships them.
const NAV = [
  { href: "/dashboard", label: "Dashboard", pillar: "Single Pane of Glass" },
  { href: "/incidents", label: "Incidents", pillar: "Unified records" },
  { href: "/data-sources", label: "Data Sources", pillar: "Data Foundation" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <header className="bg-navy-deep text-white">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-8 px-6">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="font-heading text-lg font-bold text-white">Intelligence Manufacturing</span>
          <span className="text-xs text-cyan">CALIBER 2026 · Case 2</span>
        </Link>
        <nav className="flex gap-1">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                title={n.pillar}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "bg-navy text-white" : "text-white/75 hover:bg-white/10 hover:text-white",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <RoleSwitcher />
        </div>
      </div>
      <div className="h-1 bg-gradient-to-r from-cyan via-cyan-deep to-lime" />
    </header>
  );
}
