// FR-1.3 / FR-1.6 — everything the Data Sources admin view shows, computed live from the DB.

import type { PrismaClient } from "@prisma/client";
import { DQ_CATALOG, type DqSource } from "./dq-catalog";
import { fromJson } from "./json";
import { KPI_CATEGORIES } from "./normalize";
import { SOURCES } from "./sources";

const DQ_SOURCE_FOR: Record<(typeof SOURCES)[number]["key"], DqSource> = {
  equipment: "equipment",
  incident: "incident",
  production: "production",
  rca: "rca",
};

export async function getDataSourcesOverview(prisma: PrismaClient) {
  const dqCounts = await prisma.dataQualityIssue.groupBy({ by: ["code"], _count: { _all: true } });
  const dqCount = (code: string) => dqCounts.find((d) => d.code === code)?._count._all ?? 0;

  // ── Per-source status ─────────────────────────────────────────────────
  const sources = await Promise.all(
    SOURCES.map(async (s) => {
      const [lastLoad, lastCheck, dbCount] = await Promise.all([
        prisma.ingestRun.findFirst({ where: { source: s.name, kind: "load" }, orderBy: { finishedAt: "desc" } }),
        prisma.ingestRun.findFirst({ where: { source: s.name }, orderBy: { finishedAt: "desc" } }),
        s.countInDb(prisma),
      ]);
      const codes = DQ_CATALOG.filter((d) => d.source === DQ_SOURCE_FOR[s.key]).map((d) => d.code);
      return {
        key: s.key,
        name: s.name,
        file: s.file,
        origin: s.origin,
        grain: s.grain,
        dbCount,
        dbLabel: s.dbLabel,
        status: lastCheck?.status ?? "not loaded",
        statusNote: lastCheck?.note ?? null,
        lastLoadAt: lastLoad?.finishedAt ?? null,
        lastCheckAt: lastCheck?.finishedAt ?? null,
        lastCheckKind: lastCheck?.kind ?? null,
        sha256: lastCheck?.sha256 ?? null,
        fileBytes: lastCheck?.fileBytes ?? null,
        dq: codes.map((code) => ({ code, count: dqCount(code) })),
      };
    }),
  );

  // ── DQ findings ────────────────────────────────────────────────────────
  const dq = DQ_CATALOG.map((d) => ({ ...d, count: dqCount(d.code) }));

  // ── Join-success matrix for the 5 focus assets (FR-1.6) ──────────────────
  const focus = await prisma.equipment.findMany({
    where: { isFocus: true },
    orderBy: { tag: "asc" },
    include: {
      conditionReadings: { select: { week: true } },
      incidents: { select: { serialNo: true, incidentId: true, arNo: true, rcaId: true, plantCode: true, dateOfOccurrence: true, downtimeHours: true, actualLossKUSD: true } },
      productionDataset: true,
      instruments: { select: { name: true } },
      rcaReports: { select: { rcaId: true, plantCode: true, dateOccurrence: true, downtimeHours: true, estimatedLossKUSD: true } },
    },
  });

  const joinMatrix = await Promise.all(
    focus.map(async (e) => {
      const rca = e.rcaReports[0] ?? null;
      const inc = e.incidents.find((i) => i.rcaId && i.rcaId === rca?.rcaId) ?? null;
      const perf = fromJson<Record<string, number>>(e.performanceSummaryJson, {});
      const offHours = await prisma.runStatus.count({ where: { equipmentTag: e.tag, status: "OFF" } });
      const hourlyRows = await prisma.runStatus.count({ where: { equipmentTag: e.tag } });
      const sameDay = (a?: Date | null, b?: Date | null) => !!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
      const rawPiNames = e.instruments.map((i) => i.name).filter((n) => n.includes("_") && n !== "PLANT_RATE");
      return {
        tag: e.tag,
        plantCode: e.plantCode,
        cells: {
          equipment: { linked: e.conditionReadings.length > 0, detail: `${e.conditionReadings.length} weekly readings`, key: `equipmentTag = ${e.tag}` },
          incident: {
            linked: !!inc,
            detail: inc ? `${inc.incidentId} (serial ${inc.serialNo})` : "no incident with matching tag + AR No.",
            key: `equipmentTag + arNo = ${inc?.arNo ?? "—"}`,
          },
          production: {
            linked: !!e.productionDataset,
            detail: `${hourlyRows} hourly rows`,
            key: rawPiNames.length ? `${rawPiNames[0].split("_")[0]}_* → ${e.tag}` : "—",
          },
          rca: { linked: !!rca, detail: rca?.rcaId ?? "no RCA report", key: `rcaId = linkedRcaNo = arNo` },
        },
        reconciliation: {
          arNo: !!rca && inc?.arNo === rca.rcaId && e.linkedRcaNo === rca.rcaId,
          plantCode: !!rca && !!inc && inc.plantCode === rca.plantCode && e.plantCode === rca.plantCode && e.productionDataset?.plantCode === rca.plantCode,
          eventDate: !!rca && sameDay(inc?.dateOfOccurrence, rca.dateOccurrence) && sameDay(e.failureDate, rca.dateOccurrence),
          downtime: !!rca && inc?.downtimeHours === rca.downtimeHours && perf["Total Downtime (hours)"] === rca.downtimeHours,
          actualLoss: !!rca && inc?.actualLossKUSD === rca.estimatedLossKUSD && perf["Estimated Loss (k USD)"] === rca.estimatedLossKUSD,
          offHoursWithin1h: !!rca && Math.abs(offHours - rca.downtimeHours) <= 1,
        },
        offHours,
        downtimeHours: rca?.downtimeHours ?? null,
      };
    }),
  );

  // ── Linked-source count across ALL equipment ("4/4 vs 1/4", §9.2) ────────
  const allEquipment = await prisma.equipment.findMany({
    select: {
      tag: true,
      _count: { select: { conditionReadings: true, incidents: true, rcaReports: true } },
      productionDataset: { select: { equipmentTag: true } },
    },
  });
  const linkage = new Map<number, number>();
  for (const e of allEquipment) {
    const n = [e._count.conditionReadings > 0, e._count.incidents > 0, !!e.productionDataset, e._count.rcaReports > 0].filter(Boolean).length;
    linkage.set(n, (linkage.get(n) ?? 0) + 1);
  }
  const [incidentsTotal, incidentsWithAr, incidentsWithRca] = await Promise.all([
    prisma.incident.count(),
    prisma.incident.count({ where: { arNo: { not: null } } }),
    prisma.incident.count({ where: { rcaId: { not: null } } }),
  ]);

  // ── KPI taxonomy coverage (FR-1.2) ─────────────────────────────────────
  const [eqK, crK, incK, incSecK, instK, prK, rcaK, capaK] = await Promise.all([
    prisma.equipment.groupBy({ by: ["kpiCategory"], _count: { _all: true } }),
    prisma.conditionReading.groupBy({ by: ["kpiCategory"], _count: { _all: true } }),
    prisma.incident.groupBy({ by: ["kpiCategory"], _count: { _all: true } }),
    prisma.incident.groupBy({ by: ["secondaryKpi"], _count: { _all: true } }),
    prisma.productionInstrument.groupBy({ by: ["kpiCategory"], _count: { _all: true } }),
    prisma.productionReading.groupBy({ by: ["kpiCategory"], _count: { _all: true } }),
    prisma.rcaReport.groupBy({ by: ["kpiCategory"], _count: { _all: true } }),
    prisma.capaAction.groupBy({ by: ["kpiCategory"], _count: { _all: true } }),
  ]);
  const toRow = (label: string, source: string, rows: { kpiCategory: string; _count: { _all: number } }[]) => ({
    label,
    source,
    counts: Object.fromEntries(KPI_CATEGORIES.map((k) => [k, rows.find((r) => r.kpiCategory === k)?._count._all ?? 0])),
  });
  const kpiCoverage = [
    toRow("Equipment", "Equipment Performance / Incident DB", eqK),
    toRow("Weekly condition readings", "Equipment Performance", crK),
    toRow("Incidents (primary)", "Incident Database", incK),
    toRow(
      "Incidents (secondary)",
      "Incident Database",
      incSecK.filter((r) => r.secondaryKpi).map((r) => ({ kpiCategory: r.secondaryKpi!, _count: r._count })),
    ),
    toRow("PI instruments", "Production Data", instK),
    toRow("Hourly values", "Production Data", prK),
    toRow("RCA reports", "RCA & Downtime", rcaK),
    toRow("CAPA / PAA rows", "RCA & Downtime", capaK),
  ];

  // ── Plants (§6.3 rule 2) ──────────────────────────────────────────────
  const plants = (await prisma.plant.findMany({ orderBy: { code: "asc" }, include: { _count: { select: { incidents: true } } } })).map((p) => ({
    code: p.code,
    name: p.name,
    aliases: fromJson<string[]>(p.aliasesJson, []),
    incidents: p._count.incidents,
  }));

  return {
    sources,
    dq,
    joinMatrix,
    linkage: {
      equipmentByLinkedSources: [4, 3, 2, 1].map((n) => ({ sources: n, equipment: linkage.get(n) ?? 0 })),
      incidentsTotal,
      incidentsWithAr,
      incidentsWithRca,
    },
    kpiCoverage,
    plants,
  };
}

export type DataSourcesOverview = Awaited<ReturnType<typeof getDataSourcesOverview>>;
