import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, CalendarRange, Check, ClipboardList, FileSearch, X } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { getEquipmentView, type EquipmentView } from "@/lib/data/equipment-view";
import { fmtDate, fmtDateTime, fmtKUsd, fmtNum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PriorityScore, SeverityChip } from "@/components/severity";
import { FlagChips } from "@/components/flag-chips";
import { WeeklyConditionChart } from "@/components/charts/weekly-condition-chart";
import { HourlySignalChart } from "@/components/charts/hourly-signal-chart";
import { Widget } from "@/components/dashboard/widgets";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const dynamic = "force-dynamic";

const SOURCE_NAMES = {
  equipmentPerformance: "Equipment Performance",
  incidentDatabase: "Incident DB",
  productionData: "Production (PI)",
  rcaDowntime: "RCA & Downtime",
} as const;

export default async function EquipmentPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const v = await getEquipmentView(prisma, tag);
  if (!v) notFound();
  const e = v.equipment;
  const perf = e.performanceSummary;

  return (
    <>
      <PageHeader pillar={`Equipment detail · ${e.plantCode}${e.plant.name ? ` (${e.plant.name})` : ""}`} title={`${v.tag}${e.equipmentName ? ` — ${e.equipmentName}` : ""}`}>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap justify-end gap-1">
            {(Object.keys(SOURCE_NAMES) as (keyof typeof SOURCE_NAMES)[]).map((k) => (
              <span
                key={k}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  v.linkedSources[k] ? "border-lime/50 bg-lime/15 text-lime-deep" : "border-card-border bg-muted text-muted-foreground",
                )}
              >
                {v.linkedSources[k] ? <Check className="size-3" aria-hidden /> : <X className="size-3" aria-hidden />}
                {SOURCE_NAMES[k]}
              </span>
            ))}
          </div>
          <span className={cn("text-sm font-semibold", v.linkedSourceCount === 4 ? "text-lime-deep" : "text-muted-foreground")}>
            Linked sources: {v.linkedSourceCount}/4
          </span>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <Fact label="Type" value={e.equipmentTypeName ?? e.equipmentTypeCode} />
        <Fact label="Class" value={e.equipmentClass} />
        <Fact label="Discipline" value={e.discipline} />
        {e.criticality && <Fact label="Criticality" value={e.criticality} />}
        {e.monitoringMethod && <Fact label="Monitoring" value={e.monitoringMethod} />}
        {perf["Availability (%)"] != null && <Fact label="Availability" value={`${fmtNum(perf["Availability (%)"], 2)}%`} />}
        {perf["MTBF (hours)"] != null && <Fact label="MTBF" value={`${fmtNum(perf["MTBF (hours)"])} h`} />}
        {perf["MTTR (hours)"] != null && <Fact label="MTTR" value={`${fmtNum(perf["MTTR (hours)"], 1)} h`} />}
        {perf["PM Compliance (%)"] != null && <Fact label="PM compliance" value={`${perf["PM Compliance (%)"]}%`} />}
      </div>

      {v.linkedSourceCount < 4 && (
        <div className="mb-6 rounded-lg border border-dashed border-card-border bg-white p-4 text-sm text-muted-foreground">
          Only the Incident Database has records for this tag. The three-scale view (weekly condition, hourly PI, RCA/CAPA) exists for the 5 focus assets
          only — this is a limitation of the case dataset, not hidden data.
        </div>
      )}

      {v.timeline.length > 0 && <Timeline items={v.timeline} />}

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          {v.weeklyView.points.length > 0 && (
            <Widget
              fill={false}
              title="① Weekly condition — 26 weeks (slow warning)"
              action={<span className="text-[11px] text-muted-foreground">● normal ■ alarm ▲ trip · blue band = hourly window · red line = failure</span>}
            >
              <WeeklyConditionChart
                points={v.weeklyView.points}
                parameters={v.weeklyView.parameters}
                hourlyWindow={v.hourly ? { start: new Date(v.hourly.period.start).getTime(), end: new Date(v.hourly.period.end).getTime() } : null}
                failureDate={e.failureDate ? e.failureDate.getTime() : null}
              />
            </Widget>
          )}
          {v.hourly && (
            <Widget fill={false} title="② Hourly PI signal — 30 days (fast warning)" action={<span className="text-[11px] text-muted-foreground">baseline-deviation detector · 3σ × 3 h</span>}>
              <HourlySignalChart points={v.hourly.points} signals={v.hourly.signals} detector={v.hourly.detector} />
              {v.hourly.detector && <DetectorSummary d={v.hourly.detector} />}
            </Widget>
          )}
        </div>

        <div className="space-y-6 xl:col-span-2">
          {v.rcaView.map((r) => (
            <RcaPanel key={r.rcaId} r={r} />
          ))}
          <Widget fill={false} title={`Alerts on ${v.tag} (${v.alerts.length})`}>
            {v.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No alerts.</p>
            ) : (
              <ul className="divide-y divide-card-border">
                {v.alerts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-2 text-sm">
                    <SeverityChip severity={a.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{a.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {a.source} · {fmtDateTime(a.triggeredAt)}
                      </div>
                    </div>
                    <PriorityScore score={a.priorityScore} breakdown={a.breakdown} />
                  </li>
                ))}
              </ul>
            )}
          </Widget>
          <Widget fill={false} title={`Incidents on ${v.tag}`}>
            <ul className="space-y-3 text-sm">
              {v.incidents.map((i) => (
                <li key={i.serialNo} className="rounded-md border border-card-border p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs">
                      {i.incidentId} · {i.arNo ?? "no AR No."}
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtDate(i.dateOfOccurrence)}</span>
                  </div>
                  <div className="font-medium">{i.riskCaseTitle}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.plantCode} · pre-risk {i.preRisk} ({i.riskScore}) · {i.statusNormalized}
                    {i.rcaOverdue && <span className="font-semibold text-sev-critical"> · RCA overdue</span>} · owner {i.picRca} · {fmtNum(i.downtimeHours, 1)} h ·{" "}
                    {fmtKUsd(i.totalLossKUSD)}
                  </div>
                  <div className="mt-1">
                    <FlagChips flags={i.dataQualityFlags} codes={[]} />
                  </div>
                </li>
              ))}
            </ul>
          </Widget>
          {v.dataQualityIssues.length > 0 && (
            <Widget fill={false} title="Data-quality notes for this asset">
              <ul className="space-y-1.5 text-xs">
                {v.dataQualityIssues
                  .filter((d) => d.code !== "DQ-11")
                  .map((d) => (
                    <li key={d.id}>
                      <Link href={`/data-sources/dq/${d.code}`} className="font-mono font-semibold text-cyan-deep hover:underline">
                        {d.code}
                      </Link>{" "}
                      {d.message}
                    </li>
                  ))}
              </ul>
            </Widget>
          )}
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium text-navy">{value ?? "—"}</span>
    </span>
  );
}

function Timeline({ items }: { items: EquipmentView["timeline"] }) {
  const ICON = { weekly: CalendarRange, hourly: Activity, rca: FileSearch };
  return (
    <div className="mb-6 overflow-x-auto rounded-lg border border-card-border bg-white p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-deep">One asset, three time scales — weeks → hours → why</div>
      <ol className="flex min-w-max items-start">
        {items.map((it, idx) => {
          const Icon = ICON[it.scale];
          return (
            <li key={idx} className="flex items-start">
              <div className="flex w-44 flex-col items-center text-center">
                <span className={cn("flex size-7 items-center justify-center rounded-full", it.label.startsWith("Trip") ? "bg-sev-critical text-white" : "bg-navy text-white")}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="mt-1 text-[11px] font-semibold text-navy">{fmtDateTime(it.at)}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">{it.label}</span>
              </div>
              {idx < items.length - 1 && <div className="mt-3.5 h-0.5 w-8 bg-card-border" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DetectorSummary({ d }: { d: NonNullable<NonNullable<EquipmentView["hourly"]>["detector"]> }) {
  return (
    <div className="mt-3 grid gap-2 rounded-md bg-app-bg p-3 text-xs sm:grid-cols-4">
      <div>
        <div className="text-muted-foreground">Primary signal (from data)</div>
        <div className="font-mono font-semibold text-navy">{d.primary.signal}</div>
        <div className="text-muted-foreground">
          sustained {d.primary.sustainedZ >= 0 ? "+" : ""}
          {d.primary.sustainedZ.toFixed(1)}σ{d.runnerUp && ` · runner-up ${d.runnerUp.signal} ${d.runnerUp.sustainedZ.toFixed(1)}σ`}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">First flag</div>
        <div className="font-semibold text-navy">{d.firstFlagAt ? fmtDateTime(d.firstFlagAt) : "none"}</div>
        <div className="text-muted-foreground">{d.primary.strayExceedances} stray single-hour exceedance(s) before</div>
      </div>
      <div>
        <div className="text-muted-foreground">Trip (RUN_STATUS OFF)</div>
        <div className="font-semibold text-navy">{d.tripAt ? fmtDateTime(d.tripAt) : "—"}</div>
        <div className="text-muted-foreground">{d.offHours} h offline</div>
      </div>
      <div>
        <div className="text-muted-foreground">Early-warning lead time</div>
        <div className="text-2xl font-bold text-cyan-deep">{d.leadTimeHours != null ? `${d.leadTimeHours} h` : "—"}</div>
      </div>
    </div>
  );
}

function RcaPanel({ r }: { r: EquipmentView["rcaView"][number] }) {
  const ng = r.verifications.filter((x) => x.result === "NG");
  const tracked = r.capa.filter((c) => c.kind === "corrective" || c.kind === "proactive");
  const other = r.capa.filter((c) => c.kind === "preventive" || c.kind === "riskOfCorrectiveAction");
  return (
    <Widget fill={false} title="③ RCA & CAPA — the why" action={<span className="font-mono text-xs text-muted-foreground">{r.rcaId}</span>}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          <span>
            Severity <strong className="text-navy">{r.severity}</strong>
          </span>
          <span>
            Pre-risk {r.preRisk} ({r.preRiskScore})
          </span>
          <span>{fmtNum(r.downtimeHours, 1)} h down</span>
          <span>{fmtNum(r.productionLossTon, 1)} t lost</span>
          <span>{fmtKUsd(r.estimatedLossKUSD)}</span>
          <span>PIC {r.picRca}</span>
        </div>
        <p className="text-xs">{r.problemStatement}</p>
        <div className="rounded-md border-l-4 border-lime-deep bg-lime/10 p-2">
          <div className="text-[11px] font-semibold uppercase text-lime-deep">Verified root cause ({r.methodology.join(" + ")})</div>
          <div>{r.verifiedRootCause}</div>
        </div>
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-navy">
            Verification — {ng.length} NG of {r.verifications.length} checks (4P / 4M+1E)
          </summary>
          <ul className="mt-1 space-y-1 text-xs">
            {r.verifications.map((x) => (
              <li key={x.ref} className="flex gap-2">
                <span className={cn("w-7 shrink-0 rounded text-center font-mono text-[10px] font-bold", x.result === "NG" ? "bg-sev-critical text-white" : "bg-lime/30 text-lime-deep")}>
                  {x.result}
                </span>
                <span>
                  <span className="font-mono text-muted-foreground">{x.ref}</span> {x.parameterOrFactor} — <span className="text-muted-foreground">{x.evidence}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
        <div>
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-navy">
            <ClipboardList className="size-3.5" /> CAPA (corrective + pro-active, tracked)
          </div>
          <ul className="space-y-1.5">
            {tracked.map((c) => (
              <li key={c.id} className="rounded border border-card-border p-1.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="mr-1 rounded bg-muted px-1 font-mono text-[10px]">
                      {c.kind === "corrective" ? "CA" : "PA"} · {c.ref}
                    </span>
                    {c.action}
                  </span>
                  <span className="shrink-0 font-mono text-[10px]">{c.pic}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>plan {fmtDate(c.planDate)}</span>
                  <span>source status: {c.sourceStatus}</span>
                  {c.trackedAction && <span>tracker: {c.trackedAction.status.replace("_", " ")}</span>}
                  {c.overduePerSnapshot && (
                    <Tooltip>
                      <TooltipTrigger render={<span tabIndex={0} className="cursor-help font-semibold text-sev-critical underline decoration-dotted" />}>
                        overdue per source snapshot
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        DQ-12: CAPA statuses come from the RCA deck, a snapshot of unknown date. The plan date has passed as of 3 Oct 2026, but the item may have
                        progressed since the snapshot.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-navy">Preventive items, risk of corrective action, PM schedule ({other.length + r.pmSchedules.length})</summary>
          <ul className="mt-1 space-y-1 text-xs">
            {other.map((c) => (
              <li key={c.id}>
                <span className="font-mono text-[10px] text-muted-foreground">{c.kind === "preventive" ? `PV · ${c.ref}` : "RISK"}</span> {c.action}
                {c.potentialRisk && <span className="text-muted-foreground"> — risk: {c.potentialRisk}; countermeasure: {c.countermeasure}</span>}
                <span className="text-muted-foreground">
                  {" "}
                  ({c.pic}, {fmtDate(c.planDate)})
                </span>
              </li>
            ))}
            {r.pmSchedules.map((p) => (
              <li key={p.pmNo}>
                <span className="font-mono text-[10px] text-muted-foreground">{p.pmNo}</span> {p.description} — {p.group}, {p.interval}
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-navy">Chronology ({r.chronology.length})</summary>
          <ol className="mt-1 space-y-1 text-xs">
            {r.chronology.map((c, i) => (
              <li key={i}>
                <span className="font-mono text-muted-foreground">{c.time}</span> — {c.event}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </Widget>
  );
}
