"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// PRD §3 [ASSUMPTION] — no auth; a role switcher previews the app "as" each persona. Not a security boundary.
export const ROLES = [
  { id: "executive", label: "Executive / Plant Manager", home: "/dashboard", hint: "One glance at plant health, biggest risks and loss trend." },
  { id: "function_head", label: "Function Head", home: "/dashboard", hint: "Your function's incidents, alerts and owned actions." },
  { id: "operator", label: "Control Room Operator / Engineer", home: "/alerts", hint: "Start from the prioritized alert feed; open an alert for the AI root cause." },
  { id: "action_owner", label: "Action Owner", home: "/actions", hint: "Your assigned actions, due dates and evidence — update or close them." },
  { id: "admin", label: "Data / Platform Admin", home: "/data-sources", hint: "Source status, data-quality findings and cross-source joins." },
] as const;
export type RoleId = (typeof ROLES)[number]["id"];

// Persona details. Codes are real PIC codes from the Incident Database; functions are the 3 connected ones (§6.7).
export const HEAD_FUNCTIONS = ["Reliability", "Maintenance", "Production"] as const;
export const OWNER_CODES = ["REL-05", "REL-02", "STA-02", "ROT-01", "OPS-01"] as const;

type Ctx = {
  role: RoleId;
  setRole: (r: RoleId) => void;
  headFunction: string;
  setHeadFunction: (f: string) => void;
  ownerCode: string;
  setOwnerCode: (c: string) => void;
};
const RoleCtx = createContext<Ctx>({
  role: "executive",
  setRole: () => {},
  headFunction: "Reliability",
  setHeadFunction: () => {},
  ownerCode: "REL-05",
  setOwnerCode: () => {},
});
const KEY = "caliber.persona";

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ role: "executive" as RoleId, headFunction: "Reliability", ownerCode: "REL-05" });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved && ROLES.some((r) => r.id === saved.role)) setState((s) => ({ ...s, ...saved }));
    } catch {}
  }, []);
  const update = (patch: Partial<typeof state>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  return (
    <RoleCtx.Provider
      value={{
        ...state,
        setRole: (role) => update({ role }),
        setHeadFunction: (headFunction) => update({ headFunction }),
        setOwnerCode: (ownerCode) => update({ ownerCode }),
      }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export const useRole = () => useContext(RoleCtx);

/** Adds the acting persona to API writes so the audit trail records who did what. */
export function useRoleFetch() {
  const { role, ownerCode, headFunction } = useRole();
  const tag = role === "action_owner" ? `action_owner:${ownerCode}` : role === "function_head" ? `function_head:${headFunction}` : role;
  return (url: string, init: RequestInit = {}) => fetch(url, { ...init, headers: { ...(init.headers ?? {}), "x-role": tag } });
}

const selectCls = "w-full rounded-lg border border-[#F9DFDF] bg-white px-2 py-1.5 text-xs text-[#3D1A1A] focus:outline-none focus:ring-2 focus:ring-[#F5AFAF]";

export function RoleSwitcher() {
  const { role, setRole, headFunction, setHeadFunction, ownerCode, setOwnerCode } = useRole();
  return (
    <div className="flex flex-col gap-1.5">
      <select value={role} onChange={(e) => setRole(e.target.value as RoleId)} className={selectCls}>
        {ROLES.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
      {role === "function_head" && (
        <select aria-label="Your function" value={headFunction} onChange={(e) => setHeadFunction(e.target.value)} className={selectCls}>
          {HEAD_FUNCTIONS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      )}
      {role === "action_owner" && (
        <select aria-label="Your owner code" value={ownerCode} onChange={(e) => setOwnerCode(e.target.value)} className={cn(selectCls, "font-mono")}>
          {OWNER_CODES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Thin bar under the nav: who you are viewing as, and where that persona starts. */
export function RoleHint() {
  return null;
}

/** FR-2.3 — floats the block to the top for the listed roles, no visual decoration. */
export function RoleEmphasis({ roles, children, className }: { roles: RoleId[]; children: React.ReactNode; className?: string }) {
  const { role } = useRole();
  const on = roles.includes(role);
  return (
    <div className={cn(on ? "order-first" : "order-none", className)}>
      {children}
    </div>
  );
}
