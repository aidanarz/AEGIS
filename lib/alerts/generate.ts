// Alert generation from the three FR-3.1 sources. Deterministic ids, so re-running is idempotent.
//   (a) healthStatus — weekly Equipment Performance transitions into ALARM or TRIP
//   (b) detector     — baseline-deviation detector on hourly PI data (lib/detect)
//   (c) incident     — Incident DB rows with statusNormalized ∈ {open, in_progress} AND rcaOverdue

import type { PrismaClient } from "@prisma/client";
import { toJson } from "@/lib/data/json";
import { runDetector } from "@/lib/detect/run";
import { priorityScore, severityFromHealthStatus, severityFromPreRisk, type Severity } from "./priority";

export async function generateAlerts(prisma: PrismaClient) {
  const max = await prisma.incident.aggregate({ _max: { totalLossKUSD: true } });
  const datasetMax = max._max.totalLossKUSD ?? 0;

  const rows: Parameters<typeof prisma.alert.create>[0]["data"][] = [];

  // ── (c) Incident: open / in-progress with RCA overdue ──────────────────
  const overdue = await prisma.incident.findMany({
    where: { statusNormalized: { in: ["open", "in_progress"] }, rcaOverdue: true },
    include: { equipment: { select: { equipmentClass: true } } },
  });
  for (const i of overdue) {
    const severity = severityFromPreRisk(i.preRisk);
    const sb = priorityScore({
      severity,
      totalLossKUSD: i.totalLossKUSD,
      datasetMaxLossKUSD: datasetMax,
      costBasis: `${i.incidentId} total loss (actual + potential)`,
      preRisk: i.preRisk,
      equipmentClass: i.equipmentClass,
    });
    rows.push({
      id: `inc-${i.serialNo}`,
      source: "incident",
      equipmentTag: i.equipmentTag,
      plantCode: i.plantCode,
      incidentSerialNo: i.serialNo,
      rcaId: i.rcaId,
      title: `RCA overdue — ${i.riskCaseTitle}`,
      triggeredBy: `incident: ${i.overallStatus}, RCA due ${i.rcaDueDate!.toISOString().slice(0, 10)} passed (as of 2026-10-03)`,
      triggeredAt: i.rcaDueDate!,
      severity,
      severityBasis: `pre-risk ${i.preRisk} → ${severity} (§7.1 assumption)`,
      priorityScore: sb.score,
      scoreBreakdownJson: toJson(sb),
      detailJson: toJson({ incidentId: i.incidentId, picRca: i.picRca, ownerFunction: i.ownerFunction, overallStatus: i.overallStatus }),
    });
  }

  // ── Focus assets: (a) weekly transitions and (b) detector ─────────────
  const focus = await prisma.equipment.findMany({
    where: { isFocus: true },
    include: { conditionReadings: { orderBy: { week: "asc" } }, incidents: true, rcaReports: { select: { rcaId: true } } },
  });

  for (const eq of focus) {
    // The incident that records this asset's failure (joined on tag + AR No., §6.3 rule 4).
    const rcaId = eq.rcaReports[0]?.rcaId ?? null;
    const inc = eq.incidents.find((i) => i.rcaId && i.rcaId === rcaId) ?? null;
    const costBasis = inc
      ? `realised loss of this event — ${inc.incidentId} (retrospective: loss is only known after the trip)`
      : "no linked incident";
    const scoreFor = (severity: Severity) =>
      priorityScore({
        severity,
        totalLossKUSD: inc?.totalLossKUSD ?? null,
        datasetMaxLossKUSD: datasetMax,
        costBasis,
        preRisk: inc?.preRisk ?? null,
        equipmentClass: eq.equipmentClass,
      });

    // (a) weekly healthStatus transitions into ALARM / TRIP
    for (let k = 1; k < eq.conditionReadings.length; k++) {
      const prev = eq.conditionReadings[k - 1];
      const cur = eq.conditionReadings[k];
      if (cur.healthStatus === prev.healthStatus) continue;
      const severity = severityFromHealthStatus(cur.healthStatus);
      if (!severity) continue; // recovery to NORMAL is not an alert
      const sb = scoreFor(severity);
      rows.push({
        id: `hs-${eq.tag}-w${cur.week}`,
        source: "healthStatus",
        equipmentTag: eq.tag,
        plantCode: eq.plantCode,
        incidentSerialNo: inc?.serialNo ?? null,
        rcaId,
        title: `${eq.tag} weekly health ${prev.healthStatus} → ${cur.healthStatus}`,
        triggeredBy: `healthStatus: week ${cur.week} transitioned ${prev.healthStatus} → ${cur.healthStatus}`,
        triggeredAt: cur.date,
        severity,
        severityBasis: `${cur.healthStatus} → ${severity} (agreed assumption)`,
        priorityScore: sb.score,
        scoreBreakdownJson: toJson(sb),
        detailJson: toJson({ week: cur.week, from: prev.healthStatus, to: cur.healthStatus, readings: JSON.parse(cur.readingsJson) }),
      });
    }

    // (b) detector
    const det = await runDetector(prisma, eq.tag);
    if (det?.primary.firstFlagAt && det.severity) {
      const sb = scoreFor(det.severity);
      const dir = det.primary.sustainedZ >= 0 ? "above" : "below";
      const sign = det.primary.sustainedZ >= 0 ? "+" : "−";
      rows.push({
        id: `det-${eq.tag}`,
        source: "detector",
        equipmentTag: eq.tag,
        plantCode: eq.plantCode,
        incidentSerialNo: inc?.serialNo ?? null,
        rcaId,
        title: `${det.primary.signal} deviating ${dir} baseline`,
        triggeredBy: `detector: ${det.primary.signal} ${sign}3σ beyond baseline for 3 h`,
        triggeredAt: new Date(det.primary.firstFlagAt),
        severity: det.severity,
        severityBasis: `peak sustained deviation ${det.peakSustainedZ}σ before trip → ${det.severity} (≥6σ critical, ≥4σ high); escalated hourly from first flag`,
        priorityScore: sb.score,
        scoreBreakdownJson: toJson(sb),
        detailJson: toJson({
          signal: det.primary.signal,
          baselineMean: det.primary.baselineMean,
          baselineStd: det.primary.baselineStd,
          sustainedZ: det.primary.sustainedZ,
          runnerUp: det.runnerUp && { signal: det.runnerUp.signal, sustainedZ: det.runnerUp.sustainedZ },
          firstFlagAt: det.primary.firstFlagAt,
          tripAt: det.tripAt,
          leadTimeHours: det.leadTimeHours,
          escalations: det.escalations,
          strayExceedances: det.primary.strayExceedances,
          rule: det.rule,
        }),
      });
    }
  }

  // Replace only what we generate; keep AI analyses / actions linked to unchanged ids.
  const ids = rows.map((r) => r.id as string);
  await prisma.alert.deleteMany({ where: { id: { notIn: ids }, aiAnalyses: { none: {} }, actions: { none: {} } } });
  for (const r of rows) {
    const { id, ...rest } = r;
    delete (rest as { status?: unknown }).status;
    await prisma.alert.upsert({ where: { id: id as string }, create: r, update: rest });
  }

  const bySource = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.source as string]: (m[r.source as string] ?? 0) + 1 }), {});
  return { total: rows.length, bySource, reviewNow: rows.filter((r) => (r.priorityScore as number) >= 0.7).length };
}
