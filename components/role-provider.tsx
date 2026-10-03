"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// PRD §3 [ASSUMPTION] — no auth; a role switcher previews the app "as" each persona.
export const ROLES = [
  { id: "executive", label: "Executive / Plant Manager" },
  { id: "function_head", label: "Function Head" },
  { id: "operator", label: "Control Room Operator / Engineer" },
  { id: "action_owner", label: "Action Owner" },
  { id: "admin", label: "Data / Platform Admin" },
] as const;
export type RoleId = (typeof ROLES)[number]["id"];

const Ctx = createContext<{ role: RoleId; setRole: (r: RoleId) => void }>({ role: "executive", setRole: () => {} });
const KEY = "caliber.role";

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<RoleId>("executive");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as RoleId | null;
      if (saved && ROLES.some((r) => r.id === saved)) setRoleState(saved);
    } catch {}
  }, []);
  const setRole = (r: RoleId) => {
    setRoleState(r);
    try {
      localStorage.setItem(KEY, r);
    } catch {}
  };
  return <Ctx.Provider value={{ role, setRole }}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);

export function RoleSwitcher() {
  const { role, setRole } = useRole();
  return (
    <label className="flex items-center gap-2 text-xs text-white/70">
      View as
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as RoleId)}
        className="rounded-md border border-white/20 bg-navy px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan"
      >
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** FR-2.3 — emphasises a dashboard block for the listed roles (ring + label) and floats it to the top. */
export function RoleEmphasis({ roles, children, className }: { roles: RoleId[]; children: React.ReactNode; className?: string }) {
  const { role } = useRole();
  const on = roles.includes(role);
  return (
    <div className={cn("relative transition-all", on ? "order-first rounded-xl ring-2 ring-cyan ring-offset-4 ring-offset-app-bg" : "order-none", className)}>
      {on && (
        <span className="absolute -top-3 right-3 z-10 rounded-full bg-cyan px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-deep">
          Focus for your role
        </span>
      )}
      {children}
    </div>
  );
}
