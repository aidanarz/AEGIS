"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Bell,
  CheckSquare,
  FileText,
  Database,
  FlaskConical,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { RoleSwitcher } from "@/components/role-provider";

const NAV_GROUPS = [
  {
    label: "Monitor",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/alerts", label: "Alerts", icon: Bell },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/actions", label: "Actions", icon: CheckSquare },
      { href: "/incidents", label: "Incidents", icon: FileText },
    ],
  },
  {
    label: "Data",
    items: [
      { href: "/data-sources", label: "Data Sources", icon: Database },
      { href: "/dev/ai-eval", label: "AI Eval", icon: FlaskConical },
    ],
  },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* ── Mobile top bar ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-[#E5E7EB] bg-[#1C2B3A] px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="rounded p-1 text-[#C9D8E8] hover:bg-[#253649] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563EB]"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <span className="font-semibold tracking-tight text-[#F8FAFC]">AEGIS</span>
      </div>

      {/* ── Mobile backdrop ─────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={cn(
          /* Layout */
          "fixed inset-y-0 left-0 z-30 flex w-60 flex-col bg-[#1C2B3A]",
          /* Transition */
          "transition-transform duration-200 ease-in-out",
          /* Mobile: slide in/out */
          open ? "translate-x-0" : "-translate-x-full",
          /* Desktop: always visible */
          "md:relative md:translate-x-0 md:inset-auto md:z-auto md:h-auto md:min-h-screen",
        )}
      >
        {/* Logo row */}
        <div className="flex items-center justify-between px-5 py-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563EB] focus-visible:rounded"
          >
            {/* Icon mark: two overlapping squares — precision instrument feel */}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[#2D4259] bg-[#253649]">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <rect x="1" y="4" width="8" height="8" rx="1" stroke="#2563EB" strokeWidth="1.5" fill="none" />
                <rect x="5" y="1" width="8" height="8" rx="1" stroke="#7A9AB8" strokeWidth="1.5" fill="none" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold leading-tight tracking-tight text-[#F8FAFC]">AEGIS</div>
              <div className="text-[10px] leading-tight text-[#7A9AB8]">Intelligence Mfg</div>
            </div>
          </Link>
          {/* Close button — mobile only */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded p-1 text-[#7A9AB8] hover:bg-[#253649] hover:text-[#C9D8E8] md:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563EB]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-5 mb-4 border-t border-[#2D4259]" />

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-3" aria-label="Main navigation">
          <ul className="space-y-5">
            {NAV_GROUPS.map((group) => (
              <li key={group.label}>
                {/* Group label — lowercase sentence case, not uppercase */}
                <div className="mb-1.5 px-2 text-[11px] font-medium text-[#7A9AB8]">
                  {group.label}
                </div>
                <ul className="space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors",
                            active
                              ? "bg-[#2D4259] text-[#F8FAFC] font-medium"
                              : "text-[#C9D8E8] hover:bg-[#253649] hover:text-[#F8FAFC]",
                          )}
                          aria-current={active ? "page" : undefined}
                        >
                          {/* Active indicator line */}
                          <span
                            className={cn(
                              "absolute left-0 h-5 w-0.5 rounded-r bg-[#2563EB] transition-opacity",
                              active ? "opacity-100" : "opacity-0",
                            )}
                            aria-hidden
                          />
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              active ? "text-[#60A5FA]" : "text-[#7A9AB8]",
                            )}
                            aria-hidden
                          />
                          <span className="flex-1">{label}</span>
                          {active && (
                            <ChevronRight className="size-3 text-[#7A9AB8]" aria-hidden />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        {/* Role switcher at bottom */}
        <div className="border-t border-[#2D4259] px-4 py-4">
          <div className="mb-2 text-[11px] font-medium text-[#7A9AB8]">View as</div>
          <RoleSwitcher />
        </div>
      </aside>
    </>
  );
}
