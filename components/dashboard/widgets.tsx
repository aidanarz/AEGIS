import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PriorityScore, SeverityChip } from "@/components/severity";
import { HEATMAP_METRICS, type AlertRow, type DashboardData } from "@/lib/data/dashboard";
import { KPI_CATEGORIES } from "@/lib/data/normalize";
import { fmtKUsd, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── Widget shell ─────────────────────────────────────────────────────────
export function Widget({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  fill?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-[#111827]">{title}</h2>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {/* Thin rule under title — structural, carries section boundary info */}
      <div className="border-t border-[#E5E7EB]" />
      <div>{children}</div>
    </div>
  );
}

// ── Drill link ───────────────────────────────────────────────────────────
export function DrillLink({ href, label = "View records" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-0.5 text-xs text-[#2563EB] hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2563EB]"
    >
      {label}
      <ArrowUpRight className="size-3" aria-hidden />
    </Link>
  );
}

// ── KPI Counters ─────────────────────────────────────────────────────────
export function Counters({ c, qs }: { c: DashboardData["counters"]; qs: string }) {
  const items = [
    {
      label: "Total incidents",
      value: fmtNum(c.incidents),
      sub: `${fmtNum(c.downtimeHours, 1)} h downtime`,
      href: `/incidents?${qs}`,
      alert: false,
    },
    {
      label: "Total loss",
      value: `$${fmtNum(c.totalLossKUSD / 1000, 1)}M`,
      sub: "actual + potential",
      href: `/incidents?${qs}&sort=loss`,
      alert: false,
    },
    {
      label: "Active incidents",
      value: fmtNum(c.activeIncidents),
      sub: `$${fmtNum(c.activeLossKUSD / 1000, 1)}M exposure`,
      href: `/incidents?${qs}&status=active`,
      alert: false,
    },
    {
      label: "RCA overdue",
      value: fmtNum(c.rcaOverdue),
      sub: "past due date",
      href: `/incidents?${qs}&overdue=1`,
      alert: true,
    },
    {
      label: "Review now",
      value: fmtNum(c.reviewNowAlerts),
      sub: `of ${fmtNum(c.openAlerts)} open alerts`,
      href: `/alerts?${qs}&min=0.7`,
      alert: true,
    },
    {
      label: "Actions overdue",
      value: `${fmtNum(c.actionsOverdue)}/${fmtNum(c.actionsOpen)}`,
      sub: "past plan date",
      href: undefined,
      alert: c.actionsOverdue > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((i) => {
        const content = (
          <div
            className={cn(
              "flex flex-col gap-1 rounded border p-3",
              i.alert && Number(i.value.toString().replace(/[^0-9]/g, "")) > 0
                ? "border-red-200 bg-red-50"
                : "border-[#E5E7EB] bg-white",
            )}
          >
            <div
              className={cn(
                "font-mono text-[28px] font-bold leading-none",
                i.alert && Number(i.value.toString().replace(/[^0-9]/g, "")) > 0
                  ? "text-red-600"
                  : "text-[#111827]",
              )}
            >
              {i.value}
            </div>
            <div className="text-[12px] font-medium text-[#374151]">{i.label}</div>
            <div className="text-[11px] text-[#6B7280]">{i.sub}</div>
          </div>
        );
        return i.href ? (
          <Link key={i.label} href={i.href} className="group hover:opacity-90">
            {content}
          </Link>
        ) : (
          <div key={i.label}>{content}</div>
        );
      })}
    </div>
  );
}

// ── Top prioritized alerts ───────────────────────────────────────────────

export function TopAlerts({ alerts }: { alerts: AlertRow[] }) {
  if (!alerts.length)
    return (
      <p className="py-4 text-sm text-[#6B7280]">No open alerts.</p>
    );

  return (
    <div className="divide-y divide-[#F3F4F6]">
      {alerts.map((a, idx) => {
        const isCritical = a.severity === "critical";
        return (
          <div
            key={a.id}
            className={cn(
              "flex items-center gap-3 py-2.5",
              isCritical && "bg-red-50 -mx-1 px-1 rounded",
            )}
          >
            {/* Rank — plain number, not 01/02 */}
            <span className="w-4 shrink-0 text-center font-mono text-[12px] text-[#9CA3AF]">
              {idx + 1}
            </span>
            <SeverityChip severity={a.severity} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/equipment/${a.equipmentTag}`}
                  className="font-mono text-[13px] font-semibold text-[#111827] hover:text-[#2563EB] hover:underline"
                >
                  {a.equipmentTag}
                </Link>
                <span className="text-[11px] text-[#9CA3AF]">{a.plantCode}</span>
              </div>
              <Link
                href={`/alerts/${a.id}`}
                className="block truncate text-[13px] text-[#374151] hover:text-[#2563EB] hover:underline"
              >
                {a.title}
              </Link>
            </div>
            <PriorityScore score={a.priorityScore} breakdown={a.breakdown} />
          </div>
        );
      })}
    </div>
  );
}

// ── Horizontal bar list (portfolio breakdowns) ───────────────────────────
export function BarList({
  rows,
  hrefFor,
  labelFor,
}: {
  rows: { key: string; count: number; lossKUSD: number; flagged?: number }[];
  hrefFor: (key: string) => string;
  labelFor?: (key: string) => string;
  flagNote?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.lossKUSD));
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const pct = (100 * r.lossKUSD) / max;
        return (
          <li key={r.key}>
            <Link href={hrefFor(r.key)} className="group flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-[#374151] group-hover:text-[#2563EB]">
                  {labelFor ? labelFor(r.key) : r.key}
                </span>
                <span className="font-mono text-[12px] font-semibold text-[#111827]">
                  {fmtKUsd(r.lossKUSD)}{" "}
                  <span className="font-normal text-[#9CA3AF]">({r.count})</span>
                </span>
              </div>
              {/* Bar: 1px height — thin, functional, not decorative */}
              <div className="h-1 overflow-hidden rounded-full bg-[#F3F4F6]">
                <div
                  className="h-full rounded-full bg-[#6B7280] transition-[width] group-hover:bg-[#2563EB]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ── Heatmap plant × kpiCategory ──────────────────────────────────────────
export function Heatmap({ data, qs }: { data: DashboardData; qs: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[#E5E7EB]">
            <th className="py-2 pr-3 text-left text-[11px] font-medium text-[#6B7280]">Plant</th>
            {KPI_CATEGORIES.map((k) => (
              <th key={k} className="pb-2 text-center align-bottom text-[11px] font-medium">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span
                        tabIndex={0}
                        className="cursor-help font-mono text-[11px] text-[#374151] underline decoration-dotted"
                      />
                    }
                  >
                    {k}
                  </TooltipTrigger>
                  <TooltipContent>
                    {HEATMAP_METRICS[k].label} ({HEATMAP_METRICS[k].unit}) —{" "}
                    {HEATMAP_METRICS[k].source}. Colour scaled within the column.
                  </TooltipContent>
                </Tooltip>
                <div className="mt-0.5 text-[10px] font-normal text-[#9CA3AF]">
                  {HEATMAP_METRICS[k].unit}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F3F4F6]">
          {data.heatmap.map((row) => (
            <tr key={row.plantCode}>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                <span className="font-mono text-[12px] font-semibold text-[#111827]">
                  {row.plantCode}
                </span>
                {row.plantName && (
                  <span className="ml-1 hidden text-[11px] text-[#6B7280] 2xl:inline">
                    {row.plantName}
                  </span>
                )}
              </td>
              {KPI_CATEGORIES.map((k) => {
                const v = row.values[k];
                if (v == null)
                  return (
                    <td
                      key={k}
                      className="no-data-cell px-2 py-1.5 text-center text-[10px] text-[#9CA3AF]"
                      title="No source data for this plant in this category"
                    >
                      —
                    </td>
                  );
                const t = data.heatmapMax[k] ? v / data.heatmapMax[k] : 0;
                const href =
                  (k === "condition" || k === "throughput") && row.focusTags.length
                    ? `/equipment/${row.focusTags[0]}`
                    : `/incidents?${qs}&plant=${row.plantCode}${k === "risk_exposure" ? "&risk=elevated" : ""}`;
                // Color: from transparent to solid blue (not red — red is reserved for alerts)
                const bg = `rgba(37, 99, 235, ${0.05 + 0.55 * t})`;
                const textColor = t > 0.55 ? "#FFFFFF" : "#111827";
                return (
                  <td key={k} className="p-0.5">
                    <Link
                      href={href}
                      className="block rounded px-2 py-1.5 text-center font-mono text-[11px] font-semibold transition-opacity hover:opacity-80"
                      style={{ background: bg, color: textColor }}
                      title={`${row.plantCode} · ${HEATMAP_METRICS[k].label}: ${fmtNum(v, Number.isInteger(v) ? 0 : 1)} ${HEATMAP_METRICS[k].unit}`}
                    >
                      {fmtNum(v, Number.isInteger(v) ? 0 : 0)}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-[#9CA3AF]">
        Diagonal hatching = no source data.{" "}
        <span className="font-mono">throughput</span> and{" "}
        <span className="font-mono">condition</span> exist only for the 4 plants with a focus asset.
      </p>
    </div>
  );
}
