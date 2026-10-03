import { CheckCircle2, AlertTriangle, CircleSlash } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COVERAGE_LABEL, type CoverageLevel } from "@/lib/data/function-coverage";
import { cn } from "@/lib/utils";

const STYLE: Record<CoverageLevel, { cls: string; Icon: typeof CheckCircle2 }> = {
  connected: { cls: "bg-lime/15 text-lime-deep border-lime/40", Icon: CheckCircle2 },
  proxy: { cls: "bg-sev-medium/20 text-[#8a6d00] border-sev-medium/60", Icon: AlertTriangle },
  none: { cls: "bg-muted text-muted-foreground border-card-border", Icon: CircleSlash },
};

/** §6.7 coverage badge — icon + label (not color alone, NFR accessibility) + tooltip explaining why. */
export function CoverageBadge({ level, tooltip, className }: { level: CoverageLevel; tooltip: string; className?: string }) {
  const { cls, Icon } = STYLE[level];
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className={cn("inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cls, className)}
          />
        }
      >
        <Icon className="size-3.5" aria-hidden />
        {COVERAGE_LABEL[level]}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
