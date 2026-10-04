import Link from "next/link";
import { CoverageBadge } from "@/components/coverage-badge";
import type { FunctionCoverage } from "@/lib/data/function-coverage";
import { fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kpis = Record<string, { activeIncidents: number; activeLossKUSD: number; rcaOverdue: number }>;

/**
 * Function tiles — coverage level is communicated through visual weight,
 * not just opacity. Tiles with active incidents get a red left border.
 */
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
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
      {items.map((f) => {
        const k = kpis?.[f.fn];
        const hasIncidents = k && k.activeIncidents > 0;
        const hasOverdue = k && k.rcaOverdue > 0;
        const noCoverage = f.level === "none";

        const body = (
          <div
            className={cn(
              "flex h-full flex-col gap-2 rounded border p-3 transition-colors",
              /* Base */
              noCoverage
                ? "border-dashed border-[#D1D5DB] bg-[#F9FAFB]"
                : "border-[#E5E7EB] bg-white",
              /* Active incidents — red left border */
              hasIncidents && !noCoverage && "border-l-2 border-l-red-400",
              /* Hover (linked) */
              linkTiles && !noCoverage && "hover:border-[#93C5FD] hover:shadow-sm",
              /* Currently selected function */
              current === f.fn && "ring-2 ring-[#2563EB] ring-offset-1",
            )}
          >
            {/* Function name */}
            <div
              className={cn(
                "text-[13px] font-semibold leading-tight",
                noCoverage ? "text-[#9CA3AF]" : "text-[#111827]",
              )}
            >
              {f.fn}
            </div>

            {/* Coverage badge */}
            <CoverageBadge level={f.level} tooltip={f.tooltip} className="self-start" />

            {/* KPI numbers — only shown when data exists */}
            {k && !noCoverage && (
              <div className="flex items-end gap-3 pt-1">
                {/* Active incidents */}
                <div>
                  <div
                    className={cn(
                      "font-mono text-[22px] font-bold leading-none",
                      hasIncidents ? "text-[#DC2626]" : "text-[#374151]",
                    )}
                  >
                    {fmtNum(k.activeIncidents)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#6B7280]">
                    active · ${fmtNum(k.activeLossKUSD / 1000, 1)}M
                  </div>
                </div>
                {/* Overdue count — only when > 0 */}
                {hasOverdue && (
                  <div>
                    <div className="font-mono text-[22px] font-bold leading-none text-[#D97706]">
                      {fmtNum(k.rcaOverdue)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#6B7280]">overdue</div>
                  </div>
                )}
              </div>
            )}

            {/* Evidence metrics */}
            {f.evidence.length > 0 && !noCoverage && (
              <dl className="mt-auto space-y-1 border-t border-[#F3F4F6] pt-2 text-[11px]">
                {f.evidence.map((e) => (
                  <div key={e.label} className="flex justify-between gap-2">
                    <dt className="text-[#6B7280]">{e.label}</dt>
                    <dd className="font-mono font-semibold text-[#374151]">{e.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {/* No coverage placeholder */}
            {noCoverage && (
              <p className="mt-auto text-[11px] text-[#9CA3AF]">No data yet</p>
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
