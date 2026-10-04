import {
  AlertTriangle,
  Check,
  Info,
  X,
  RefreshCw,
  CircleDashed,
  CircleMinus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Every status chip uses icon + label + color — never color alone.

export function DqSeverityChip({ severity }: { severity: string }) {
  const warn = severity === "warning";
  const Icon = warn ? AlertTriangle : Info;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium",
        warn
          ? "border-amber-300 bg-amber-100 text-amber-800"
          : "border-blue-200 bg-blue-50 text-blue-700",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {warn ? "Warning" : "Info"}
    </span>
  );
}

export function SourceStatusChip({ status }: { status: string }) {
  const map: Record<string, { cls: string; Icon: typeof Check; label: string }> = {
    ok: {
      cls: "border-green-300 bg-green-100 text-green-800",
      Icon: Check,
      label: "Connected · verified",
    },
    changed: {
      cls: "border-amber-300 bg-amber-100 text-amber-800",
      Icon: RefreshCw,
      label: "File changed — reload needed",
    },
    failed: {
      cls: "border-red-300 bg-red-100 text-red-700",
      Icon: X,
      label: "Failed",
    },
    stale: {
      cls: "border-gray-300 bg-gray-100 text-gray-600",
      Icon: CircleMinus,
      label: "Stale — no recent data",
    },
  };
  const s = map[status] ?? {
    cls: "border-gray-200 bg-gray-50 text-gray-500",
    Icon: CircleDashed,
    label: status,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium",
        s.cls,
      )}
    >
      <s.Icon className="size-3.5 shrink-0" aria-hidden />
      {s.label}
    </span>
  );
}

export function CheckMark({ ok, label }: { ok: boolean; label?: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-green-700">
      <Check className="size-4 shrink-0" aria-hidden />
      <span className={label ? "" : "sr-only"}>{label ?? "match"}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-red-600">
      <X className="size-4 shrink-0" aria-hidden />
      <span className={label ? "" : "sr-only"}>{label ?? "mismatch"}</span>
    </span>
  );
}
