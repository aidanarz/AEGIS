import Link from "next/link";
import { CoverageBadge } from "@/components/coverage-badge";
import type { FunctionCoverage } from "@/lib/data/function-coverage";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kpis = Record<string, { activeIncidents: number; activeLossKUSD: number; rcaOverdue: number }>;

/** FR-2.1 — all 7 function tiles on one row, each with its §6.7 coverage badge. */
export function FunctionCoverageGrid({
  items,
  linkTiles = false,
  kpis,
  current,
}: {
  items: FunctionCoverage[];
  linkTiles?: boolean;
  kpis?: Kpis;
  current?: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {items.map((f) => {
        const k = kpis?.[f.fn];
        const body = (
          <div
            className={cn(
              "flex h-full flex-col gap-2 rounded-lg border border-card-border bg-white p-3",
              f.level === "none" && "border-dashed bg-white/60",
              linkTiles && "transition-shadow hover:shadow-md",
              current === f.fn && "border-navy ring-2 ring-navy",
            )}
          >
            <div className="font-heading text-base font-bold text-navy">{f.fn}</div>
            <CoverageBadge level={f.level} tooltip={f.tooltip} className="self-start" />
            {k && (
              <div className="grid grid-cols-2 gap-1 rounded-md bg-app-bg p-1.5 text-center">
                <div>
                  <div className="text-lg font-bold leading-tight tabular-nums text-navy">{fmtNum(k.activeIncidents)}</div>
                  <div className="text-[10px] text-muted-foreground">active · ${fmtNum(k.activeLossKUSD / 1000, 1)}M</div>
                </div>
                <div>
                  <div className="text-lg font-bold leading-tight tabular-nums text-sev-critical">{fmtNum(k.rcaOverdue)}</div>
                  <div className="text-[10px] text-muted-foreground">RCA overdue</div>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{f.summary}</p>
            {f.evidence.length > 0 && (
              <dl className="mt-auto space-y-0.5 text-xs">
                {f.evidence.map((e) => (
                  <div key={e.label} className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">{e.label}</dt>
                    <dd className="font-semibold tabular-nums text-navy">{e.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
        return linkTiles ? (
          <Link key={f.fn} href={`/dashboard/${f.slug}`} className="block">
            {body}
          </Link>
        ) : (
          <div key={f.fn}>{body}</div>
        );
      })}
    </div>
  );
}
