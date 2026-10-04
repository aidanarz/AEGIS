import { AlertOctagon, AlertTriangle, Info, ArrowDownCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ScoreBreakdown } from "@/lib/alerts/priority";
import { cn } from "@/lib/utils";

// PRD §7.3 severity — icon + label + color, never color alone.
const SEV = {
  critical: {
    cls: "border-red-300 bg-red-100 text-red-800",
    Icon: AlertOctagon,
    label: "Critical",
  },
  high: {
    cls: "border-amber-300 bg-amber-100 text-amber-800",
    Icon: AlertTriangle,
    label: "High",
  },
  medium: {
    cls: "border-yellow-300 bg-yellow-100 text-yellow-800",
    Icon: Info,
    label: "Medium",
  },
  low: {
    cls: "border-green-300 bg-green-100 text-green-800",
    Icon: ArrowDownCircle,
    label: "Low",
  },
} as const;

export function SeverityChip({
  severity,
  className,
}: {
  severity: string;
  className?: string;
}) {
  const s = SEV[severity as keyof typeof SEV] ?? SEV.low;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium",
        s.cls,
        className,
      )}
    >
      <s.Icon className="size-3.5 shrink-0" aria-hidden />
      {s.label}
    </span>
  );
}

/** Priority score with PRD §7.1 breakdown in tooltip. */
export function PriorityScore({
  score,
  breakdown,
}: {
  score: number;
  breakdown: ScoreBreakdown | null;
}) {
  const reviewNow = score >= 0.7;
  const bar = (
    <span className="inline-flex cursor-help items-center gap-2" tabIndex={0}>
      {/* Bar */}
      <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-[#E5E7EB]">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width]",
            reviewNow ? "bg-red-500" : "bg-[#6B7280]",
          )}
          style={{ width: `${Math.min(100, score * 100)}%` }}
        />
      </span>
      {/* Numeric score in mono */}
      <span
        className={cn(
          "font-mono text-sm font-bold",
          reviewNow ? "text-red-600" : "text-[#374151]",
        )}
      >
        {score.toFixed(2)}
      </span>
    </span>
  );

  if (!breakdown) return bar;
  return (
    <Tooltip>
      <TooltipTrigger render={bar} />
      <TooltipContent side="left" className="block max-w-sm text-left">
        <div className="mb-1 font-semibold">
          Priority = 0.5·severity + 0.3·cost + 0.2·risk (PRD §7.1)
        </div>
        <div className="font-mono text-[11px] leading-relaxed">
          severity {breakdown.severity} → {breakdown.severityWeight.toFixed(1)} × 0.5 ={" "}
          {breakdown.terms.severity.toFixed(3)}
          <br />
          cost {breakdown.totalLossKUSD?.toFixed(1) ?? "—"} /{" "}
          {breakdown.datasetMaxLossKUSD.toFixed(1)} k USD = {breakdown.normalizedCost.toFixed(3)}{" "}
          × 0.3 = {breakdown.terms.cost.toFixed(3)}
          <br />
          risk flag {breakdown.riskFlag ? "yes" : "no"} ({breakdown.riskBasis}) →{" "}
          {breakdown.terms.risk.toFixed(3)}
          <br />= {breakdown.score.toFixed(3)}{" "}
          {breakdown.reviewNow ? "≥ 0.7 → Critical — review now" : ""}
        </div>
        <div className="mt-1 text-[11px] opacity-80">Cost basis: {breakdown.costBasis}</div>
      </TooltipContent>
    </Tooltip>
  );
}
