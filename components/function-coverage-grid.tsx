import Link from "next/link";
import { CoverageBadge } from "@/components/coverage-badge";
import type { FunctionCoverage } from "@/lib/data/function-coverage";
import { cn } from "@/lib/utils";

/** FR-2.1 — all 7 function tiles on one row, each with its §6.7 coverage badge. */
export function FunctionCoverageGrid({ items, linkTiles = false }: { items: FunctionCoverage[]; linkTiles?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {items.map((f) => {
        const body = (
          <div
            className={cn(
              "flex h-full flex-col gap-2 rounded-lg border border-card-border bg-white p-3",
              f.level === "none" && "border-dashed bg-white/60",
              linkTiles && f.level !== "none" && "transition-shadow hover:shadow-md",
            )}
          >
            <div className="font-heading text-base font-bold text-navy">{f.fn}</div>
            <CoverageBadge level={f.level} tooltip={f.tooltip} className="self-start" />
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
        return linkTiles && f.level !== "none" ? (
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
