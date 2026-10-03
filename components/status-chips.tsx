import { AlertTriangle, Check, Info, X, RefreshCw, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

// Every status uses icon + label, never color alone (NFR accessibility).

export function DqSeverityChip({ severity }: { severity: string }) {
  const warn = severity === "warning";
  const Icon = warn ? AlertTriangle : Info;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        warn ? "border-sev-high/50 bg-sev-high/10 text-[#a4520b]" : "border-cyan/50 bg-cyan/10 text-cyan-deep",
      )}
    >
      <Icon className="size-3" aria-hidden />
      {warn ? "Warning" : "Info"}
    </span>
  );
}

export function SourceStatusChip({ status }: { status: string }) {
  const map: Record<string, { cls: string; Icon: typeof Check; label: string }> = {
    ok: { cls: "border-lime/50 bg-lime/15 text-lime-deep", Icon: Check, label: "Connected · verified" },
    changed: { cls: "border-sev-high/50 bg-sev-high/10 text-[#a4520b]", Icon: RefreshCw, label: "File changed — reload needed" },
    failed: { cls: "border-sev-critical/50 bg-sev-critical/10 text-sev-critical", Icon: X, label: "Failed" },
  };
  const s = map[status] ?? { cls: "border-card-border bg-muted text-muted-foreground", Icon: CircleDashed, label: status };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", s.cls)}>
      <s.Icon className="size-3" aria-hidden />
      {s.label}
    </span>
  );
}

export function CheckMark({ ok, label }: { ok: boolean; label?: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-lime-deep">
      <Check className="size-4" aria-hidden />
      <span className={label ? "" : "sr-only"}>{label ?? "match"}</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sev-critical">
      <X className="size-4" aria-hidden />
      <span className={label ? "" : "sr-only"}>{label ?? "mismatch"}</span>
    </span>
  );
}
