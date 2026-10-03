import { AlertOctagon, AlertTriangle, ArrowDownCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ScoreBreakdown } from "@/lib/alerts/priority";
import { cn } from "@/lib/utils";

// PRD §7.3 severity colors, always paired with an icon + label (NFR accessibility).
const SEV = {
  critical: { cls: "bg-sev-critical text-white", Icon: AlertOctagon, label: "Critical" },
  high: { cls: "bg-sev-high text-navy-deep", Icon: AlertTriangle, label: "High" },
  medium: { cls: "bg-sev-medium text-navy-deep", Icon: Info, label: "Medium" },
  low: { cls: "bg-sev-low text-navy-deep", Icon: ArrowDownCircle, label: "Low" },
} as const;

export function SeverityChip({ severity, className }: { severity: string; className?: string }) {
  const s = SEV[severity as keyof typeof SEV] ?? SEV.low;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", s.cls, className)}>
      <s.Icon className="size-3" aria-hidden />
      {s.label}
    </span>
  );
}

/** Priority score with its full §7.1 breakdown in a tooltip — no unexplained numbers. */
export function PriorityScore({ score, breakdown }: { score: number; breakdown: ScoreBreakdown | null }) {
  const reviewNow = score >= 0.7;
  const bar = (
    <span className="inline-flex cursor-help items-center gap-2" tabIndex={0}>
      <span className="relative h-2 w-16 overflow-hidden rounded bg-muted">
        <span className={cn("absolute inset-y-0 left-0", reviewNow ? "bg-sev-critical" : "bg-cyan-deep")} style={{ width: `${Math.min(100, score * 100)}%` }} />
      </span>
      <span className={cn("font-mono text-sm font-bold tabular-nums", reviewNow ? "text-sev-critical" : "text-navy")}>{score.toFixed(2)}</span>
    </span>
  );
  if (!breakdown) return bar;
  return (
    <Tooltip>
      <TooltipTrigger render={bar} />
      <TooltipContent side="left" className="block max-w-sm text-left">
        <div className="mb-1 font-semibold">Priority = 0.5·severity + 0.3·cost + 0.2·risk (PRD §7.1)</div>
        <div className="font-mono text-[11px] leading-relaxed">
          severity {breakdown.severity} → {breakdown.severityWeight.toFixed(1)} × 0.5 = {breakdown.terms.severity.toFixed(3)}
          <br />
          cost {breakdown.totalLossKUSD?.toFixed(1) ?? "—"} / {breakdown.datasetMaxLossKUSD.toFixed(1)} k USD = {breakdown.normalizedCost.toFixed(3)} × 0.3 ={" "}
          {breakdown.terms.cost.toFixed(3)}
          <br />
          risk flag {breakdown.riskFlag ? "yes" : "no"} ({breakdown.riskBasis}) → {breakdown.terms.risk.toFixed(3)}
          <br />= {breakdown.score.toFixed(3)} {breakdown.reviewNow ? "≥ 0.7 → Critical — review now" : ""}
        </div>
        <div className="mt-1 text-[11px] opacity-80">Cost basis: {breakdown.costBasis}</div>
      </TooltipContent>
    </Tooltip>
  );
}
