// FR-1.6 — unified view of one asset across all 4 sources, joined on canonical keys (§6.3).

import type { PrismaClient } from "@prisma/client";
import { fromJson } from "./json";
import { canonicalTag } from "./normalize";
import type { MonitoredParameter } from "./source-types";

export async function getUnifiedEquipment(prisma: PrismaClient, rawTag: string) {
  const tag = canonicalTag(decodeURIComponent(rawTag));
  const eq = await prisma.equipment.findUnique({
    where: { tag },
    include: {
      plant: true,
      conditionReadings: { orderBy: { week: "asc" } },
      incidents: { orderBy: { serialNo: "asc" } },
      productionDataset: true,
      instruments: { orderBy: { id: "asc" } },
      rcaReports: {
        include: {
          verifications: { orderBy: { ref: "asc" } },
          capaActions: { orderBy: [{ kind: "asc" }, { seq: "asc" }], include: { trackedAction: true } },
          pmSchedules: { orderBy: { pmNo: "asc" } },
        },
      },
    },
  });
  if (!eq) return null;

  const [readings, runStatus, dq] = await Promise.all([
    prisma.productionReading.findMany({ where: { equipmentTag: tag }, orderBy: { timestamp: "asc" }, select: { timestamp: true, parameter: true, value: true } }),
    prisma.runStatus.findMany({ where: { equipmentTag: tag }, orderBy: { timestamp: "asc" } }),
    prisma.dataQualityIssue.findMany({ where: { equipmentTag: tag } }),
  ]);

  // Wide hourly series: one row per timestamp, one key per instrument name.
  const byTs = new Map<string, Record<string, number | string>>();
  for (const r of readings) {
    const k = r.timestamp.toISOString();
    if (!byTs.has(k)) byTs.set(k, { timestamp: k });
    byTs.get(k)![r.parameter] = r.value;
  }
  for (const s of runStatus) byTs.get(s.timestamp.toISOString())!.runStatus = s.status;

  const linkedSources = {
    equipmentPerformance: eq.conditionReadings.length > 0,
    incidentDatabase: eq.incidents.length > 0,
    productionData: !!eq.productionDataset,
    rcaDowntime: eq.rcaReports.length > 0,
  };

  return {
    tag,
    requestedAs: rawTag,
    linkedSourceCount: Object.values(linkedSources).filter(Boolean).length,
    linkedSources,
    equipment: {
      ...eq,
      monitoredParameters: fromJson<MonitoredParameter[]>(eq.monitoredParametersJson, []),
      performanceSummary: fromJson<Record<string, number>>(eq.performanceSummaryJson, {}),
    },
    weekly: eq.conditionReadings.map((c) => ({ ...c, readings: fromJson<Record<string, number>>(c.readingsJson, {}) })),
    incidents: eq.incidents.map((i) => ({ ...i, dataQualityFlags: fromJson<string[]>(i.dataQualityFlagsJson, []) })),
    production: eq.productionDataset
      ? { dataset: { ...eq.productionDataset, sourceDerived: fromJson(eq.productionDataset.sourceDerivedJson, {}) }, instruments: eq.instruments, hourly: [...byTs.values()] }
      : null,
    rca: eq.rcaReports.map((r) => ({
      ...r,
      chronology: fromJson<{ time: string; event: string }[]>(r.chronologyJson, []),
      methodology: fromJson<string[]>(r.methodologyJson, []),
      capaSummary: fromJson<Record<string, number>>(r.capaSummaryJson, {}),
    })),
    dataQualityIssues: dq,
  };
}
