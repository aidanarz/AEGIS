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

const SOURCE_LABEL: Record<string, string> = { incident: "Incident DB — RCA overdue", detector: "Detector — hourly PI baseline deviation", healthStatus: "Weekly health-status transition" };

export default async function AlertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const alert = await prisma.alert.findUnique({ where: { id: decodeURIComponent(id) }, include: { incident: true, actions: true } });
  if (!alert) notFound();
  const breakdown = fromJson<ScoreBreakdown | null>(alert.scoreBreakdownJson, null);
  const detail = fromJson<Record<string, unknown>>(alert.detailJson, {});
  const view = await getEquipmentView(prisma, alert.equipmentTag);
  const canLoo = !!view?.equipment.isFocus;

  // Offline: analyse on first open (deterministic, ~100 ms). With an LLM key the user starts it explicitly.
  let live = await getLatestAnalysis(prisma, alert.id, "live");
  if (!live && !llmConfigured()) live = await runAnalysis(prisma, alert.id, "live", "fallback");
  const loo = canLoo ? await getLatestAnalysis(prisma, alert.id, "leave-one-out") : null;

  const owners = await prisma.incident.groupBy({ by: ["picRca"], where: { plantCode: alert.plantCode }, _count: { _all: true } });
  const ownerOptions = owners
    .map((o) => ({ code: o.picRca, fn: ownerFunctionFromPic(o.picRca) ?? "unmapped", incidents: o._count._all }))
    .sort((a, b) => b.incidents - a.incidents);
  const cutoff = alert.triggeredAt.getTime();

  return (
    <>
      <Link href="/alerts" className="mb-3 inline-flex items-center gap-1 text-sm text-cyan-deep hover:underline">
        <ArrowLeft className="size-4" /> Alert feed
      </Link>
      <PageHeader pillar={`Pillar 3 · AI Root Cause & Action · ${SOURCE_LABEL[alert.source]}`} title={alert.title}>
        <div className="flex items-center gap-3">
          <SeverityChip severity={alert.severity} />
          <PriorityScore score={alert.priorityScore} breakdown={breakdown} />
          {alert.priorityScore >= 0.7 && <span className="text-xs font-bold uppercase text-sev-critical">Critical — review now</span>}
        </div>
      </PageHeader>

      <div className="mb-6 grid gap-2 rounded-lg border border-card-border bg-white p-3 text-sm md:grid-cols-4">
        <Fact label="Equipment">
          <Link href={`/equipment/${alert.equipmentTag}`} className="inline-flex items-center gap-1 font-semibold text-navy hover:underline">
            {alert.equipmentTag} <ExternalLink className="size-3" />
          </Link>
          <span className="text-xs text-muted-foreground">
            {" "}
            {view?.equipment.equipmentTypeName ?? view?.equipment.equipmentTypeCode} · {alert.plantCode} · {view?.linkedSourceCount}/4 sources
          </span>
        </Fact>
        <Fact label="Triggered">
          {fmtDateTime(alert.triggeredAt)} <span className="text-xs text-muted-foreground">({alert.triggeredBy})</span>
        </Fact>
        <Fact label="Severity basis">{alert.severityBasis}</Fact>
        <Fact label="Status">{alert.status}</Fact>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="space-y-6 xl:col-span-3">
          <Widget fill={false} title="Raw signal" action={<Link href={`/equipment/${alert.equipmentTag}`} className="text-xs text-cyan-deep hover:underline">full three-scale view →</Link>}>
            {alert.source !== "incident" && view?.hourly ? (
              <>
                <HourlySignalChart points={view.hourly.points} signals={view.hourly.signals} detector={view.hourly.detector} />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  The chart shows the full 30-day file for orientation; the AI context only uses data up to the alert ({fmtDateTime(alert.triggeredAt)}).
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
              <div className="space-y-2 text-sm">
                <div className="font-semibold text-navy">
                  {alert.incident.incidentId} · {alert.incident.riskCaseTitle}
                </div>
                <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  <Fact label="Occurred">{fmtDate(alert.incident.dateOfOccurrence)}</Fact>
                  <Fact label="Component">{alert.incident.component}</Fact>
                  <Fact label="Failure mechanism">{alert.incident.failureMechanism}</Fact>
                  <Fact label="Highest impact">{alert.incident.highestImpact}</Fact>
                  <Fact label="Pre-risk / score">
                    {alert.incident.preRisk} / {fmtNum(alert.incident.riskScore)}
                  </Fact>
                  <Fact label="Status">{alert.incident.overallStatus}</Fact>
                  <Fact label="RCA due">{fmtDate(alert.incident.rcaDueDate)}</Fact>
                  <Fact label="Owner">
                    {alert.incident.picRca} ({alert.incident.ownerFunction})
                  </Fact>
                  <Fact label="Downtime">{fmtNum(alert.incident.downtimeHours, 1)} h</Fact>
                  <Fact label="Total loss">{fmtKUsd(alert.incident.totalLossKUSD)}</Fact>
                </div>
                <FlagChips flags={fromJson<string[]>(alert.incident.dataQualityFlagsJson, [])} codes={[]} />
                {view && view.linkedSourceCount < 4 && (
                  <p className="text-xs text-muted-foreground">
                    No condition data (weekly or hourly) exists for {alert.equipmentTag} in the case files — the AI can only use the incident record, pattern statistics and
                    similar cases.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No raw signal available for this alert.</p>
            )}
            {alert.source === "detector" && (
              <div className="mt-3 grid gap-2 rounded-md bg-app-bg p-3 text-xs sm:grid-cols-3">
                <Fact label="Signal">{String(detail.signal)}</Fact>
                <Fact label="Baseline">
                  {Number(detail.baselineMean).toFixed(2)} ± {Number(detail.baselineStd).toFixed(2)}
                </Fact>
                <Fact label="Lead time to trip">{String(detail.leadTimeHours)} h</Fact>
              </div>
            )}
          </Widget>

          <Widget fill={false} title="Similar past cases (RCA corpus)">
            {(live?.similarCases ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No RCA report shares this asset&apos;s type, discipline or failure signature.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {live!.similarCases.map((s) => (
                  <li key={s.rcaId} className="rounded-md border border-card-border p-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/equipment/${s.equipmentTag}`} className="font-semibold text-navy hover:underline">
                        {s.equipmentTag} · {s.rcaId}
                      </Link>
                      <span className="font-mono text-xs">similarity {s.score.toFixed(2)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{s.basis}</div>
                    <p className="mt-1 text-xs">{s.verifiedRootCause}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Ranked by equipment type, discipline and failure signature (FR-3.7). The 5 cases cover 5 different mechanisms, so similar-case help is limited by design.
            </p>
          </Widget>
        </div>

        <div className="xl:col-span-2">
          <Widget fill={false} title="AI probable root cause & recommended action">
            <AiPanel
              alertId={alert.id}
              initial={{ live, "leave-one-out": loo }}
              canLeaveOneOut={canLoo}
              llmConfigured={llmConfigured()}
              ownerOptions={ownerOptions}
              existingActions={alert.actions.map((a) => ({ id: a.id, title: a.title, status: a.status, createdBy: a.createdBy }))}
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
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}
