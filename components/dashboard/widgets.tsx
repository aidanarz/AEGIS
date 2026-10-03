import Link from "next/link";
import { ArrowUpRight, Siren } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PriorityScore, SeverityChip } from "@/components/severity";
import { HEATMAP_METRICS, type AlertRow, type DashboardData } from "@/lib/data/dashboard";
import { KPI_CATEGORIES } from "@/lib/data/normalize";
import { fmtDate, fmtKUsd, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Widget({
  title,
  action,
  children,
  className,
  fill = true,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** stretch to the grid row height (dashboard tiles); off for stacked columns */
  fill?: boolean;
}) {
  return (
    <Card className={cn("gap-3 border-card-border bg-white", fill && "h-full", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="font-heading text-base text-navy">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function DrillLink({ href, label = "View records" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-xs text-cyan-deep hover:underline">
      {label} <ArrowUpRight className="size-3" />
    </Link>
  );
}

// ── Counters ────────────────────────────────────────────────────────────
export function Counters({ c, qs }: { c: DashboardData["counters"]; qs: string }) {
  const items = [
    { label: "Incidents (Jan 2024 – Jul 2026)", value: fmtNum(c.incidents), sub: `${fmtNum(c.downtimeHours, 1)} h downtime`, href: `/incidents?${qs}` },
    { label: "Total loss", value: `$${fmtNum(c.totalLossKUSD / 1000, 1)}M`, sub: "actual + potential", href: `/incidents?${qs}&sort=loss` },
    {
      label: "Active incidents",
      value: fmtNum(c.activeIncidents),
      sub: `$${fmtNum(c.activeLossKUSD / 1000, 1)}M exposure`,
      href: `/incidents?${qs}&status=active`,
    },
    { label: "RCA in process", value: fmtNum(c.rcaInProcess), sub: "status RCA PROCESS", href: `/incidents?${qs}&raw=RCA%20PROCESS` },
    { label: "RCA overdue", value: fmtNum(c.rcaOverdue), sub: "due date passed (as of 3 Oct 2026)", href: `/incidents?${qs}&overdue=1`, alert: true },
    { label: "Alerts — review now", value: fmtNum(c.reviewNowAlerts), sub: `of ${fmtNum(c.openAlerts)} open alerts (score ≥ 0.7)`, alert: true },
    {
      label: "Tracked actions overdue",
      value: `${fmtNum(c.actionsOverdue)} / ${fmtNum(c.actionsOpen)}`,
      sub: "past plan date per source snapshot (DQ-12)",
      href: "/data-sources/dq/DQ-12",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {items.map((i) => {
        const body = (
          <div className={cn("h-full rounded-lg border bg-white p-3", i.alert ? "border-sev-critical/30" : "border-card-border", i.href && "hover:shadow-md")}>
            <div className="text-xs text-muted-foreground">{i.label}</div>
            <div className={cn("text-2xl font-bold tabular-nums", i.alert ? "text-sev-critical" : "text-navy")}>{i.value}</div>
            <div className="text-[11px] text-muted-foreground">{i.sub}</div>
          </div>
        );
        return i.href ? (
          <Link key={i.label} href={i.href}>
            {body}
          </Link>
        ) : (
          <div key={i.label}>{body}</div>
        );
      })}
    </div>
  );
}

// ── Top prioritized alerts (FR-2.2) ─────────────────────────────────────
const SOURCE_LABEL: Record<string, string> = { incident: "Incident DB", detector: "Detector (hourly)", healthStatus: "Weekly health" };

export function TopAlerts({ alerts }: { alerts: AlertRow[] }) {
  if (!alerts.length) return <p className="text-sm text-muted-foreground">No open alerts.</p>;
  return (
    <ol className="divide-y divide-card-border">
      {/* title → alert detail (AI root cause); tag → equipment three-scale view */}
      {alerts.map((a, idx) => (
        <li key={a.id} className="flex items-center gap-3 py-2.5">
          <span className="w-5 text-center font-mono text-sm font-bold text-muted-foreground">{idx + 1}</span>
          <div className="flex w-24 shrink-0 flex-col gap-1">
            <SeverityChip severity={a.severity} />
            {a.priorityScore >= 0.7 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-sev-critical">
                <Siren className="size-3" aria-hidden /> Review now
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/equipment/${a.equipmentTag}`} className="font-semibold text-navy hover:underline">
              {a.equipmentTag}
            </Link>
            <span className="ml-2 text-xs text-muted-foreground">
              {a.plantCode} · {SOURCE_LABEL[a.source]} · {fmtDate(a.triggeredAt)}
              {a.ownerCode && ` · owner ${a.ownerCode} (${a.ownerFunction ?? "unmapped"})`}
            </span>
            <Link href={`/alerts/${a.id}`} className="block truncate text-sm hover:text-cyan-deep hover:underline">
              {a.title}
            </Link>
            {a.relatedOpenAlerts > 0 && <div className="text-[11px] text-muted-foreground">+{a.relatedOpenAlerts} more open alert(s) on this asset</div>}
          </div>
          <PriorityScore score={a.priorityScore} breakdown={a.breakdown} />
        </li>
      ))}
    </ol>
  );
}

// ── Horizontal bar list (portfolio breakdowns) ──────────────────────────
export function BarList({
  rows,
  hrefFor,
  labelFor,
  flagNote,
}: {
  rows: { key: string; count: number; lossKUSD: number; flagged?: number }[];
  hrefFor: (key: string) => string;
  labelFor?: (key: string) => string;
  flagNote?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.lossKUSD));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={hrefFor(r.key)} className="group grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-2 text-sm">
            <span className="truncate group-hover:text-cyan-deep group-hover:underline">
              {labelFor ? labelFor(r.key) : r.key}
              {!!r.flagged && flagNote && (
                <span className="ml-1 rounded border border-sev-high/40 bg-sev-high/10 px-1 font-mono text-[9px] text-[#a4520b]" title={flagNote}>
                  DQ-4
                </span>
              )}
            </span>
            <span className="h-3 overflow-hidden rounded bg-muted">
              <span className="block h-full rounded bg-navy group-hover:bg-cyan-deep" style={{ width: `${(100 * r.lossKUSD) / max}%` }} />
            </span>
            <span className="text-right text-xs tabular-nums">
              <span className="font-semibold text-navy">{fmtKUsd(r.lossKUSD)}</span>
              <span className="ml-1 text-muted-foreground">({r.count})</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ── Heatmap plant × kpiCategory ─────────────────────────────────────────
export function Heatmap({ data, qs }: { data: DashboardData; qs: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="text-left font-medium text-muted-foreground">Plant</th>
            {KPI_CATEGORIES.map((k) => (
              <th key={k} className="text-center align-bottom font-medium">
                <Tooltip>
                  <TooltipTrigger render={<span tabIndex={0} className="cursor-help font-mono text-[11px] text-navy underline decoration-dotted" />}>
                    {k}
                  </TooltipTrigger>
                  <TooltipContent>
                    {HEATMAP_METRICS[k].label} ({HEATMAP_METRICS[k].unit}) — {HEATMAP_METRICS[k].source}. Colour scaled within the column.
                  </TooltipContent>
                </Tooltip>
                <div className="text-[10px] font-normal text-muted-foreground">{HEATMAP_METRICS[k].unit}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.heatmap.map((row) => (
            <tr key={row.plantCode}>
              <td className="whitespace-nowrap pr-2">
                <span className="font-mono font-semibold text-navy">{row.plantCode}</span>
                {row.plantName && <span className="ml-1 hidden text-muted-foreground 2xl:inline">{row.plantName}</span>}
              </td>
              {KPI_CATEGORIES.map((k) => {
                const v = row.values[k];
                if (v == null)
                  return (
                    <td
                      key={k}
                      className="rounded bg-[repeating-linear-gradient(45deg,#eef3f8,#eef3f8_4px,#fff_4px,#fff_8px)] text-center text-[10px] text-muted-foreground"
                      title="No source data for this plant in this category"
                    >
                      n/a
                    </td>
                  );
                const t = data.heatmapMax[k] ? v / data.heatmapMax[k] : 0;
                const href =
                  (k === "condition" || k === "throughput") && row.focusTags.length
                    ? `/equipment/${row.focusTags[0]}`
                    : `/incidents?${qs}&plant=${row.plantCode}${k === "risk_exposure" ? "&risk=elevated" : ""}`;
                return (
                  <td key={k} className="p-0">
                    <Link
                      href={href}
                      className="block rounded px-1 py-1.5 text-center font-semibold tabular-nums transition-transform hover:scale-105"
                      style={{ background: `rgba(36,65,123,${0.06 + 0.84 * t})`, color: t > 0.45 ? "#fff" : "#162a52" }}
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
      <p className="mt-2 text-[11px] text-muted-foreground">
        Hatched = no source data. <span className="font-mono">throughput</span> and <span className="font-mono">condition</span> exist only for the 4 plants
        with a focus asset (Production Data / Equipment Performance); other plants have Incident DB data only.
      </p>
    </div>
  );
}
