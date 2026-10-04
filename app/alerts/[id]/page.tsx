import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { getEquipmentView } from "@/lib/data/equipment-view";
import { fromJson } from "@/lib/data/json";
import { ownerFunctionFromPic } from "@/lib/data/normalize";
import { getLatestAnalysis, runAnalysis } from "@/lib/ai/pipeline";
import { llmConfigured } from "@/lib/ai/llm";
import type { ScoreBreakdown } from "@/lib/alerts/priority";
import { fmtDate, fmtDateTime, fmtKUsd, fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { PriorityScore, SeverityChip } from "@/components/severity";
import { Widget } from "@/components/dashboard/widgets";
import { HourlySignalChart } from "@/components/charts/hourly-signal-chart";
import { WeeklyConditionChart } from "@/components/charts/weekly-condition-chart";
import { AiPanel } from "@/components/ai/ai-panel";
import { FlagChips } from "@/components/flag-chips";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  incident: "Incident DB — RCA overdue",
  detector: "Detector — hourly PI baseline deviation",
  healthStatus: "Weekly health-status transition",
};

export default async function AlertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const alert = await prisma.alert.findUnique({
    where: { id: decodeURIComponent(id) },
    include: { incident: true, actions: true },
  });
  if (!alert) notFound();

  const breakdown = fromJson<ScoreBreakdown | null>(alert.scoreBreakdownJson, null);
  const detail = fromJson<Record<string, unknown>>(alert.detailJson, {});
  const view = await getEquipmentView(prisma, alert.equipmentTag);
  const canLoo = !!view?.equipment.isFocus;

  let live = await getLatestAnalysis(prisma, alert.id, "live");
  if (!live && !llmConfigured())
    live = await runAnalysis(prisma, alert.id, "live", "fallback");
  const loo = canLoo ? await getLatestAnalysis(prisma, alert.id, "leave-one-out") : null;

  const owners = await prisma.incident.groupBy({
    by: ["picRca"],
    where: { plantCode: alert.plantCode },
    _count: { _all: true },
  });
  const ownerOptions = owners
    .map((o) => ({
      code: o.picRca,
      fn: ownerFunctionFromPic(o.picRca) ?? "unmapped",
      incidents: o._count._all,
    }))
    .sort((a, b) => b.incidents - a.incidents);
  const cutoff = alert.triggeredAt.getTime();

  return (
    <>
      {/* Back link */}
      <Link
        href="/alerts"
        className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#2563EB] hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Alert feed
      </Link>

      <PageHeader
        pillar={SOURCE_LABEL[alert.source]}
        title={alert.title}
      >
        <div className="flex items-center gap-2">
          <SeverityChip severity={alert.severity} />
          <PriorityScore score={alert.priorityScore} breakdown={breakdown} />
          {alert.priorityScore >= 0.7 && (
            <span className="rounded border border-red-300 bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              Review now
            </span>
          )}
        </div>
      </PageHeader>

      {/* Metadata strip */}
      <div className="mb-6 grid gap-x-6 gap-y-3 rounded border border-[#E5E7EB] bg-white p-4 text-[13px] md:grid-cols-4">
        <Fact label="Equipment">
          <Link
            href={`/equipment/${alert.equipmentTag}`}
            className="inline-flex items-center gap-1 font-mono font-semibold text-[#111827] hover:text-[#2563EB] hover:underline"
          >
            {alert.equipmentTag}
            <ExternalLink className="size-3" aria-hidden />
          </Link>
          <span className="ml-1 text-[11px] text-[#6B7280]">
            {view?.equipment.equipmentTypeName ?? view?.equipment.equipmentTypeCode} ·{" "}
            {alert.plantCode} · {view?.linkedSourceCount}/4 sources
          </span>
        </Fact>
        <Fact label="Triggered">
          <span className="font-mono">{fmtDateTime(alert.triggeredAt)}</span>
          <span className="ml-1 text-[11px] text-[#6B7280]">({alert.triggeredBy})</span>
        </Fact>
        <Fact label="Severity basis">{alert.severityBasis}</Fact>
        <Fact label="Status">{alert.status}</Fact>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Main column: raw signal + similar cases */}
        <div className="space-y-6 xl:col-span-3">
          <Widget
            fill={false}
            title="Raw signal"
            action={
              <Link
                href={`/equipment/${alert.equipmentTag}`}
                className="text-[12px] text-[#2563EB] hover:underline"
              >
                Full three-scale view →
              </Link>
            }
          >
            {alert.source !== "incident" && view?.hourly ? (
              <>
                <HourlySignalChart
                  points={view.hourly.points}
                  signals={view.hourly.signals}
                  detector={view.hourly.detector}
                />
                <p className="mt-2 text-[11px] text-[#9CA3AF]">
                  The chart shows the full 30-day file for orientation; the AI context only uses
                  data up to the alert ({fmtDateTime(alert.triggeredAt)}).
                </p>
              </>
            ) : alert.source === "healthStatus" && view && view.weeklyView.points.length ? (
              <WeeklyConditionChart
                points={view.weeklyView.points.filter((p) => p.t <= cutoff)}
                parameters={view.weeklyView.parameters}
                hourlyWindow={null}
                failureDate={null}
              />
            ) : alert.incident ? (
              <div className="space-y-3 text-[13px]">
                <div className="font-semibold text-[#111827]">
                  {alert.incident.incidentId} · {alert.incident.riskCaseTitle}
                </div>
                <div className="grid gap-x-6 gap-y-2 text-[12px] sm:grid-cols-2">
                  <Fact label="Occurred">{fmtDate(alert.incident.dateOfOccurrence)}</Fact>
                  <Fact label="Component">{alert.incident.component}</Fact>
                  <Fact label="Failure mechanism">{alert.incident.failureMechanism}</Fact>
                  <Fact label="Highest impact">{alert.incident.highestImpact}</Fact>
                  <Fact label="Pre-risk / score">
                    {alert.incident.preRisk} / {fmtNum(alert.incident.riskScore)}
                  </Fact>
                  <Fact label="Status">{alert.incident.overallStatus}</Fact>
                  <Fact label="RCA due">
                    <span className="font-mono">{fmtDate(alert.incident.rcaDueDate)}</span>
                  </Fact>
                  <Fact label="Owner">
                    {alert.incident.picRca} ({alert.incident.ownerFunction})
                  </Fact>
                  <Fact label="Downtime">
                    <span className="font-mono">{fmtNum(alert.incident.downtimeHours, 1)} h</span>
                  </Fact>
                  <Fact label="Total loss">
                    <span className="font-mono">{fmtKUsd(alert.incident.totalLossKUSD)}</span>
                  </Fact>
                </div>
                <FlagChips
                  flags={fromJson<string[]>(alert.incident.dataQualityFlagsJson, [])}
                  codes={[]}
                />
                {view && view.linkedSourceCount < 4 && (
                  <p className="text-[11px] text-[#9CA3AF]">
                    No condition data (weekly or hourly) exists for {alert.equipmentTag} in the
                    case files — the AI can only use the incident record, pattern statistics and
                    similar cases.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-[#6B7280]">No raw signal available for this alert.</p>
            )}

            {alert.source === "detector" && (
              <div className="mt-3 grid gap-3 rounded border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-[12px] sm:grid-cols-3">
                <Fact label="Signal">{String(detail.signal)}</Fact>
                <Fact label="Baseline">
                  <span className="font-mono">
                    {Number(detail.baselineMean).toFixed(2)} ±{" "}
                    {Number(detail.baselineStd).toFixed(2)}
                  </span>
                </Fact>
                <Fact label="Lead time to trip">
                  <span className="font-mono">{String(detail.leadTimeHours)} h</span>
                </Fact>
              </div>
            )}
          </Widget>

          <Widget fill={false} title="Similar past cases (RCA corpus)">
            {(live?.similarCases ?? []).length === 0 ? (
              <p className="text-[13px] text-[#6B7280]">
                No RCA report shares this asset&apos;s type, discipline or failure signature.
              </p>
            ) : (
              <ul className="space-y-2">
                {live!.similarCases.map((s) => (
                  <li
                    key={s.rcaId}
                    className="rounded border border-[#E5E7EB] bg-[#F9FAFB] p-2.5 text-[13px]"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/equipment/${s.equipmentTag}`}
                        className="font-mono font-semibold text-[#111827] hover:text-[#2563EB] hover:underline"
                      >
                        {s.equipmentTag} · {s.rcaId}
                      </Link>
                      <span className="font-mono text-[11px] text-[#6B7280]">
                        similarity {s.score.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#9CA3AF]">{s.basis}</div>
                    <p className="mt-1 text-[12px] text-[#374151]">{s.verifiedRootCause}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-[#9CA3AF]">
              Ranked by equipment type, discipline and failure signature (FR-3.7).
            </p>
          </Widget>
        </div>

        {/* Side column: AI panel */}
        <div className="xl:col-span-2">
          <Widget fill={false} title="AI probable root cause & recommended action">
            <AiPanel
              alertId={alert.id}
              initial={{ live, "leave-one-out": loo }}
              canLeaveOneOut={canLoo}
              llmConfigured={llmConfigured()}
              ownerOptions={ownerOptions}
              existingActions={alert.actions.map((a) => ({
                id: a.id,
                title: a.title,
                status: a.status,
                createdBy: a.createdBy,
              }))}
            />
          </Widget>
        </div>
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {/* Label: plain muted text, not uppercase */}
      <div className="mb-0.5 text-[11px] text-[#6B7280]">{label}</div>
      <div className="text-[13px] text-[#111827]">{children}</div>
    </div>
  );
}
