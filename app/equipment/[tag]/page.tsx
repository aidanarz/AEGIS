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

export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag } = await params;
  const v = await getEquipmentView(prisma, tag);
  if (!v) notFound();
  const e = v.equipment;
  const perf = e.performanceSummary;

  return (
    <>
      <PageHeader
        pillar={`Equipment detail · ${e.plantCode}${e.plant.name ? ` (${e.plant.name})` : ""}`}
        title={`${v.tag}${e.equipmentName ? ` — ${e.equipmentName}` : ""}`}
      >
        {/* Linked sources indicator */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex flex-wrap justify-end gap-1">
            {(Object.keys(SOURCE_NAMES) as (keyof typeof SOURCE_NAMES)[]).map((k) => (
              <span
                key={k}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
                  v.linkedSources[k]
                    ? "border-green-300 bg-green-100 text-green-800"
                    : "border-[#E5E7EB] bg-[#F9FAFB] text-[#9CA3AF]",
                )}
              >
                {v.linkedSources[k] ? (
                  <Check className="size-3" aria-hidden />
                ) : (
                  <X className="size-3" aria-hidden />
                )}
                {SOURCE_NAMES[k]}
              </span>
            ))}
          </div>
          <span
            className={cn(
              "text-[12px] font-medium",
              v.linkedSourceCount === 4 ? "text-green-700" : "text-[#6B7280]",
            )}
          >
            Linked sources: {v.linkedSourceCount}/4
          </span>
        </div>
      </PageHeader>

      {/* Equipment attributes */}
      <div className="mb-5 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <Fact label="Type" value={e.equipmentTypeName ?? e.equipmentTypeCode} />
        <Fact label="Class" value={e.equipmentClass} />
        <Fact label="Discipline" value={e.discipline} />
        {e.criticality && <Fact label="Criticality" value={e.criticality} />}
        {e.monitoringMethod && <Fact label="Monitoring" value={e.monitoringMethod} />}
        {perf["Availability (%)"] != null && (
          <Fact label="Availability" value={`${fmtNum(perf["Availability (%)"], 2)}%`} mono />
        )}
        {perf["MTBF (hours)"] != null && (
          <Fact label="MTBF" value={`${fmtNum(perf["MTBF (hours)"])} h`} mono />
        )}
        {perf["MTTR (hours)"] != null && (
          <Fact label="MTTR" value={`${fmtNum(perf["MTTR (hours)"], 1)} h`} mono />
        )}
        {perf["PM Compliance (%)"] != null && (
          <Fact label="PM compliance" value={`${perf["PM Compliance (%)"]}%`} mono />
        )}
      </div>

      {/* Limited data notice */}
      {v.linkedSourceCount < 4 && (
        <div className="mb-5 rounded border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-3 text-[13px] text-[#6B7280]">
          Only the Incident Database has records for this tag. The three-scale view (weekly
          condition, hourly PI, RCA/CAPA) exists for the 5 focus assets only — this is a
          limitation of the case dataset, not hidden data.
        </div>
      )}

      {/* Timeline */}
      {v.timeline.length > 0 && <Timeline items={v.timeline} />}

      {/* Main grid */}
      <div className="grid gap-6 xl:grid-cols-5">
        {/* Left: charts */}
        <div className="space-y-6 xl:col-span-3">
          {v.weeklyView.points.length > 0 && (
            <Widget
              fill={false}
              title="① Weekly condition — 26 weeks (slow warning)"
              action={
                <span className="text-[11px] text-[#9CA3AF]">
                  ● normal ■ alarm ▲ trip · blue band = hourly window · red line = failure
                </span>
              }
            >
              <WeeklyConditionChart
                points={v.weeklyView.points}
                parameters={v.weeklyView.parameters}
                hourlyWindow={
                  v.hourly
                    ? {
                        start: new Date(v.hourly.period.start).getTime(),
                        end: new Date(v.hourly.period.end).getTime(),
                      }
                    : null
                }
                failureDate={e.failureDate ? e.failureDate.getTime() : null}
              />
            </Widget>
          )}
          {v.hourly && (
            <Widget
              fill={false}
              title="② Hourly PI signal — 30 days (fast warning)"
              action={
                <span className="text-[11px] text-[#9CA3AF]">
                  baseline-deviation detector · 3σ × 3 h
                </span>
              }
            >
              <HourlySignalChart
                points={v.hourly.points}
                signals={v.hourly.signals}
                detector={v.hourly.detector}
              />
              {v.hourly.detector && <DetectorSummary d={v.hourly.detector} />}
            </Widget>
          )}
        </div>

        {/* Right: RCA panels, alerts, incidents */}
        <div className="space-y-6 xl:col-span-2">
          {v.rcaView.map((r) => (
            <RcaPanel key={r.rcaId} r={r} />
          ))}

          <Widget fill={false} title={`Alerts on ${v.tag} (${v.alerts.length})`}>
            {v.alerts.length === 0 ? (
              <p className="text-[13px] text-[#6B7280]">No alerts.</p>
            ) : (
              <ul className="divide-y divide-[#F3F4F6]">
                {v.alerts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-2 text-[13px]">
                    <SeverityChip severity={a.severity} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/alerts/${a.id}`}
                        className="block truncate text-[#111827] hover:text-[#2563EB] hover:underline"
                      >
                        {a.title}
                      </Link>
                      <div className="font-mono text-[11px] text-[#9CA3AF]">
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
            <ul className="space-y-2 text-[13px]">
              {v.incidents.map((i) => (
                <li
                  key={i.serialNo}
                  className={cn(
                    "rounded border p-2.5",
                    i.rcaOverdue ? "border-red-200 bg-red-50/50" : "border-[#E5E7EB] bg-[#F9FAFB]",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[11px] text-[#6B7280]">
                      {i.incidentId} · {i.arNo ?? "no AR No."}
                    </span>
                    <span className="font-mono text-[11px] text-[#9CA3AF]">
                      {fmtDate(i.dateOfOccurrence)}
                    </span>
                  </div>
                  <div className="mt-0.5 font-medium text-[#111827]">{i.riskCaseTitle}</div>
                  <div className="mt-0.5 text-[11px] text-[#6B7280]">
                    {i.plantCode} · pre-risk {i.preRisk} ({i.riskScore}) · {i.statusNormalized}
                    {i.rcaOverdue && (
                      <span className="font-semibold text-red-600"> · RCA overdue</span>
                    )}{" "}
                    · owner {i.picRca} ·{" "}
                    <span className="font-mono">{fmtNum(i.downtimeHours, 1)} h</span> ·{" "}
                    <span className="font-mono">{fmtKUsd(i.totalLossKUSD)}</span>
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
              <ul className="space-y-1.5 text-[12px]">
                {v.dataQualityIssues
                  .filter((d) => d.code !== "DQ-11")
                  .map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/data-sources/dq/${d.code}`}
                        className="font-mono font-semibold text-[#2563EB] hover:underline"
                      >
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

// ── Inline helpers ────────────────────────────────────────────────────────

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <span className="text-[#6B7280]">
      {label}:{" "}
      <span className={cn("font-medium text-[#111827]", mono && "font-mono")}>{value ?? "—"}</span>
    </span>
  );
}

function Timeline({ items }: { items: EquipmentView["timeline"] }) {
  const ICON = { weekly: CalendarRange, hourly: Activity, rca: FileSearch };
  return (
    <div className="mb-5 overflow-x-auto rounded border border-[#E5E7EB] bg-white p-3">
      <p className="mb-2 text-[11px] font-medium text-[#6B7280]">
        One asset, three time scales — weeks → hours → why
      </p>
      <ol className="flex min-w-max items-start">
        {items.map((it, idx) => {
          const Icon = ICON[it.scale];
          const isTrip = it.label.startsWith("Trip");
          return (
            <li key={idx} className="flex items-start">
              <div className="flex w-44 flex-col items-center text-center">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full",
                    isTrip ? "bg-red-500 text-white" : "bg-[#1C2B3A] text-white",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="mt-1 font-mono text-[11px] font-semibold text-[#374151]">
                  {fmtDateTime(it.at)}
                </span>
                <span className="text-[11px] leading-tight text-[#6B7280]">{it.label}</span>
              </div>
              {idx < items.length - 1 && (
                <div className="mt-3.5 h-0.5 w-8 bg-[#E5E7EB]" />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DetectorSummary({
  d,
}: {
  d: NonNullable<NonNullable<EquipmentView["hourly"]>["detector"]>;
}) {
  return (
    <div className="mt-3 grid gap-3 rounded border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-[12px] sm:grid-cols-4">
      <div>
        <div className="text-[11px] text-[#6B7280]">Primary signal (from data)</div>
        <div className="font-mono font-semibold text-[#111827]">{d.primary.signal}</div>
        <div className="text-[11px] text-[#6B7280]">
          sustained {d.primary.sustainedZ >= 0 ? "+" : ""}
          {d.primary.sustainedZ.toFixed(1)}σ
          {d.runnerUp &&
            ` · runner-up ${d.runnerUp.signal} ${d.runnerUp.sustainedZ.toFixed(1)}σ`}
        </div>
      </div>
      <div>
        <div className="text-[11px] text-[#6B7280]">First flag</div>
        <div className="font-mono font-semibold text-[#111827]">
          {d.firstFlagAt ? fmtDateTime(d.firstFlagAt) : "none"}
        </div>
        <div className="text-[11px] text-[#6B7280]">
          {d.primary.strayExceedances} stray single-hour exceedance(s) before
        </div>
      </div>
      <div>
        <div className="text-[11px] text-[#6B7280]">Trip (RUN_STATUS OFF)</div>
        <div className="font-mono font-semibold text-[#111827]">
          {d.tripAt ? fmtDateTime(d.tripAt) : "—"}
        </div>
        <div className="text-[11px] text-[#6B7280]">
          <span className="font-mono">{d.offHours}</span> h offline
        </div>
      </div>
      <div>
        <div className="text-[11px] text-[#6B7280]">Early-warning lead time</div>
        <div className="font-mono text-[22px] font-bold text-[#2563EB]">
          {d.leadTimeHours != null ? `${d.leadTimeHours} h` : "—"}
        </div>
      </div>
    </div>
  );
}

function RcaPanel({ r }: { r: EquipmentView["rcaView"][number] }) {
  const ng = r.verifications.filter((x) => x.result === "NG");
  const tracked = r.capa.filter(
    (c) => c.kind === "corrective" || c.kind === "proactive",
  );
  const other = r.capa.filter(
    (c) => c.kind === "preventive" || c.kind === "riskOfCorrectiveAction",
  );

  return (
    <Widget
      fill={false}
      title="③ RCA & CAPA — the why"
      action={
        <span className="font-mono text-[11px] text-[#9CA3AF]">{r.rcaId}</span>
      }
    >
      <div className="space-y-3 text-[13px]">
        {/* Meta row */}
        <div className="flex flex-wrap gap-x-3 text-[11px] text-[#6B7280]">
          <span>
            Severity <strong className="text-[#111827]">{r.severity}</strong>
          </span>
          <span>
            Pre-risk {r.preRisk} ({r.preRiskScore})
          </span>
          <span className="font-mono">{fmtNum(r.downtimeHours, 1)} h down</span>
          <span className="font-mono">{fmtNum(r.productionLossTon, 1)} t lost</span>
          <span className="font-mono">{fmtKUsd(r.estimatedLossKUSD)}</span>
          <span>PIC {r.picRca}</span>
        </div>

        <p className="text-[12px] text-[#374151]">{r.problemStatement}</p>

        {/* Verified root cause — green left border */}
        <div className="rounded border-l-2 border-green-500 bg-green-50 p-2.5">
          <div className="mb-1 text-[11px] font-semibold text-green-700">
            Verified root cause ({r.methodology.join(" + ")})
          </div>
          <div className="text-[13px] text-[#111827]">{r.verifiedRootCause}</div>
        </div>

        {/* Verification details */}
        <details>
          <summary className="cursor-pointer text-[12px] font-semibold text-[#374151]">
            Verification — {ng.length} NG of {r.verifications.length} checks (4P / 4M+1E)
          </summary>
          <ul className="mt-1.5 space-y-1 text-[11px]">
            {r.verifications.map((x) => (
              <li key={x.ref} className="flex gap-2">
                <span
                  className={cn(
                    "w-7 shrink-0 rounded text-center font-mono text-[10px] font-bold",
                    x.result === "NG"
                      ? "bg-red-100 text-red-700"
                      : "bg-green-100 text-green-700",
                  )}
                >
                  {x.result}
                </span>
                <span>
                  <span className="font-mono text-[#6B7280]">{x.ref}</span>{" "}
                  {x.parameterOrFactor} —{" "}
                  <span className="text-[#6B7280]">{x.evidence}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>

        {/* CAPA tracked items */}
        <div>
          <div className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-[#374151]">
            <ClipboardList className="size-3.5" aria-hidden />
            CAPA (corrective + pro-active, tracked)
          </div>
          <ul className="space-y-1.5">
            {tracked.map((c) => (
              <li
                key={c.id}
                className={cn(
                  "rounded border p-2 text-[12px]",
                  c.overduePerSnapshot
                    ? "border-red-200 bg-red-50/50"
                    : "border-[#E5E7EB] bg-[#F9FAFB]",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="mr-1 rounded bg-[#E5E7EB] px-1 font-mono text-[10px] text-[#374151]">
                      {c.kind === "corrective" ? "CA" : "PA"} · {c.ref}
                    </span>
                    {c.action}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-[#6B7280]">{c.pic}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[#6B7280]">
                  <span className="font-mono">plan {fmtDate(c.planDate)}</span>
                  <span>source status: {c.sourceStatus}</span>
                  {c.trackedAction && (
                    <span>tracker: {c.trackedAction.status.replace("_", " ")}</span>
                  )}
                  {c.overduePerSnapshot && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            tabIndex={0}
                            className="cursor-help font-semibold text-red-600 underline decoration-dotted"
                          />
                        }
                      >
                        overdue per source snapshot
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        DQ-12: CAPA statuses come from the RCA deck, a snapshot of unknown
                        date. The plan date has passed as of 3 Oct 2026, but the item may
                        have progressed since the snapshot.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Preventive + others */}
        <details>
          <summary className="cursor-pointer text-[12px] font-semibold text-[#374151]">
            Preventive items, risk of corrective action, PM schedule ({other.length + r.pmSchedules.length})
          </summary>
          <ul className="mt-1 space-y-1 text-[11px]">
            {other.map((c) => (
              <li key={c.id}>
                <span className="font-mono text-[10px] text-[#6B7280]">
                  {c.kind === "preventive" ? `PV · ${c.ref}` : "RISK"}
                </span>{" "}
                {c.action}
                {c.potentialRisk && (
                  <span className="text-[#6B7280]">
                    {" "}
                    — risk: {c.potentialRisk}; countermeasure: {c.countermeasure}
                  </span>
                )}
                <span className="text-[#6B7280]">
                  {" "}
                  ({c.pic}, <span className="font-mono">{fmtDate(c.planDate)}</span>)
                </span>
              </li>
            ))}
            {r.pmSchedules.map((p) => (
              <li key={p.pmNo}>
                <span className="font-mono text-[10px] text-[#6B7280]">{p.pmNo}</span>{" "}
                {p.description} — {p.group}, {p.interval}
              </li>
            ))}
          </ul>
        </details>

        {/* Chronology */}
        <details>
          <summary className="cursor-pointer text-[12px] font-semibold text-[#374151]">
            Chronology ({r.chronology.length})
          </summary>
          <ol className="mt-1 space-y-1 text-[11px]">
            {r.chronology.map((c, i) => (
              <li key={i}>
                <span className="font-mono text-[#6B7280]">{c.time}</span> — {c.event}
              </li>
            ))}
          </ol>
        </details>
      </div>
    </Widget>
  );
}
