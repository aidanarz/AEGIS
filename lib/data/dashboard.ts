// FR-2.1 / 2.2 / 2.6 — dashboard aggregates, all computed live from the DB.
// Optional function filter uses the §6.7 PIC-prefix mapping (Incident.ownerFunction).

import type { Prisma, PrismaClient } from "@prisma/client";
import { fromJson } from "./json";
import { AS_OF_DATE, KPI_CATEGORIES, type FunctionName, type KpiCategory } from "./normalize";
import type { ScoreBreakdown } from "@/lib/alerts/priority";

const ACTIVE = ["open", "in_progress", "monitoring"];

export const HEATMAP_METRICS: Record<KpiCategory, { label: string; unit: string; source: string }> = {
  reliability: { label: "Failure events", unit: "incidents", source: "Incident DB" },
  availability: { label: "Downtime", unit: "h", source: "Incident DB" },
  throughput: { label: "Production loss", unit: "t", source: "RCA & Downtime (focus assets only)" },
  risk_exposure: { label: "Elevated pre-risk (I–III)", unit: "incidents", source: "Incident DB" },
  cost_impact: { label: "Total loss", unit: "k USD", source: "Incident DB" },
  condition: { label: "Weekly ALARM/TRIP readings", unit: "readings", source: "Equipment Performance (focus assets only)" },
};

export type AlertRow = Awaited<ReturnType<typeof topAlertsByEquipment>>[number];

async function topAlertsByEquipment(prisma: PrismaClient, where: Prisma.AlertWhereInput, limit: number) {
  const alerts = await prisma.alert.findMany({
    where: { ...where, status: { not: "resolved" } },
    orderBy: [{ priorityScore: "desc" }, { triggeredAt: "desc" }],
    include: { incident: { select: { incidentId: true, ownerFunction: true, picRca: true } }, equipment: { select: { isFocus: true, equipmentName: true } } },
  });
  // One row per equipment (its highest-priority alert) + count of its other open alerts.
  const seen = new Map<string, { alert: (typeof alerts)[number]; related: number }>();
  for (const a of alerts) {
    const s = seen.get(a.equipmentTag);
    if (s) s.related++;
    else seen.set(a.equipmentTag, { alert: a, related: 0 });
  }
  return [...seen.values()].slice(0, limit).map(({ alert: a, related }) => ({
    id: a.id,
    source: a.source,
    equipmentTag: a.equipmentTag,
    equipmentName: a.equipment.equipmentName,
    isFocus: a.equipment.isFocus,
    plantCode: a.plantCode,
    title: a.title,
    triggeredBy: a.triggeredBy,
    triggeredAt: a.triggeredAt,
    severity: a.severity,
    priorityScore: a.priorityScore,
    breakdown: fromJson<ScoreBreakdown | null>(a.scoreBreakdownJson, null),
    ownerCode: a.incident?.picRca ?? null,
    ownerFunction: a.incident?.ownerFunction ?? null,
    relatedOpenAlerts: related,
  }));
}

export async function getDashboard(prisma: PrismaClient, fn: FunctionName | null = null) {
  const incWhere: Prisma.IncidentWhereInput = fn ? { ownerFunction: fn } : {};
  const alertWhere: Prisma.AlertWhereInput = fn ? { incident: { ownerFunction: fn } } : {};

  const incidents = await prisma.incident.findMany({
    where: incWhere,
    select: {
      serialNo: true, plantCode: true, monthKey: true, monthYear: true, statusNormalized: true, overallStatus: true, rcaOverdue: true,
      preRisk: true, discipline: true, failureMechanism: true, downtimeHours: true, actualLossKUSD: true, potentialLossKUSD: true,
      totalLossKUSD: true, ownerFunction: true, dataQualityFlagsJson: true,
    },
  });

  // ── Counters ───────────────────────────────────────────────────────────
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const active = incidents.filter((i) => ACTIVE.includes(i.statusNormalized));
  const [reviewNow, openAlerts, actionsOpen, actionsOverdue] = await Promise.all([
    prisma.alert.count({ where: { ...alertWhere, priorityScore: { gte: 0.7 }, status: { not: "resolved" } } }),
    prisma.alert.count({ where: { ...alertWhere, status: { not: "resolved" } } }),
    prisma.action.count({ where: { status: { not: "done" }, ...(fn ? { ownerFunction: fn } : {}) } }),
    prisma.action.count({ where: { status: { not: "done" }, dueDate: { lt: AS_OF_DATE }, ...(fn ? { ownerFunction: fn } : {}) } }),
  ]);
  const counters = {
    incidents: incidents.length,
    totalLossKUSD: sum(incidents.map((i) => i.totalLossKUSD)),
    downtimeHours: sum(incidents.map((i) => i.downtimeHours)),
    activeIncidents: active.length,
    activeLossKUSD: sum(active.map((i) => i.totalLossKUSD)),
    rcaInProcess: incidents.filter((i) => i.overallStatus === "RCA PROCESS").length,
    rcaOverdue: incidents.filter((i) => i.rcaOverdue).length,
    reviewNowAlerts: reviewNow,
    openAlerts,
    actionsOpen,
    actionsOverdue,
  };

  // ── Loss trend by month (FR-2.6) ───────────────────────────────────────
  const months = [...new Set(incidents.map((i) => i.monthKey))].sort();
  const trend: { monthKey: string; label: string; actual: number; potential: number; incidents: number; downtime: number }[] = [];
  if (months.length) {
    const [y0, m0] = months[0].split("-").map(Number);
    const [y1, m1] = months[months.length - 1].split("-").map(Number);
    for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1); m === 12 ? ((m = 1), y++) : m++) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      const rows = incidents.filter((i) => i.monthKey === key);
      trend.push({
        monthKey: key,
        label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
        actual: round1(sum(rows.map((r) => r.actualLossKUSD))),
        potential: round1(sum(rows.map((r) => r.potentialLossKUSD))),
        incidents: rows.length,
        downtime: round1(sum(rows.map((r) => r.downtimeHours))),
      });
    }
  }

  // ── Portfolio breakdowns (FR-2.6) ──────────────────────────────────────
  const group = <K extends string>(key: (i: (typeof incidents)[number]) => K) => {
    const m = new Map<K, { key: K; count: number; lossKUSD: number; active: number; flagged: number }>();
    for (const i of incidents) {
      const k = key(i);
      const g = m.get(k) ?? { key: k, count: 0, lossKUSD: 0, active: 0, flagged: 0 };
      g.count++;
      g.lossKUSD += i.totalLossKUSD;
      if (ACTIVE.includes(i.statusNormalized)) g.active++;
      if (fromJson<string[]>(i.dataQualityFlagsJson, []).includes("truncated_f_mechanism")) g.flagged++;
      m.set(k, g);
    }
    return [...m.values()].map((g) => ({ ...g, lossKUSD: round1(g.lossKUSD) })).sort((a, b) => b.lossKUSD - a.lossKUSD);
  };
  const statusOrder = ["open", "in_progress", "monitoring", "closed", "cancelled"];
  const portfolio = {
    byPlant: group((i) => i.plantCode),
    byMechanism: group((i) => i.failureMechanism),
    byDiscipline: group((i) => i.discipline),
    byStatus: group((i) => i.statusNormalized).sort((a, b) => statusOrder.indexOf(a.key) - statusOrder.indexOf(b.key)),
  };

  // ── Heatmap plant × kpiCategory ────────────────────────────────────────
  const plants = await prisma.plant.findMany({ orderBy: { code: "asc" } });
  const focus = await prisma.equipment.findMany({
    where: { isFocus: true, ...(fn ? { rcaReports: { some: { picRca: { in: await picCodesFor(prisma, fn) } } } } : {}) },
    select: { tag: true, plantCode: true, conditionReadings: { select: { healthStatus: true } }, rcaReports: { select: { productionLossTon: true } } },
  });
  const heatmap = plants.map((p) => {
    const rows = incidents.filter((i) => i.plantCode === p.code);
    const fa = focus.filter((f) => f.plantCode === p.code);
    const values: Record<KpiCategory, number | null> = {
      reliability: rows.length,
      availability: round1(sum(rows.map((r) => r.downtimeHours))),
      throughput: fa.length ? round1(sum(fa.flatMap((f) => f.rcaReports.map((r) => r.productionLossTon)))) : null,
      risk_exposure: rows.filter((r) => r.preRisk !== "IV").length,
      cost_impact: round1(sum(rows.map((r) => r.totalLossKUSD))),
      condition: fa.length ? sum(fa.map((f) => f.conditionReadings.filter((c) => c.healthStatus !== "NORMAL").length)) : null,
    };
    return { plantCode: p.code, plantName: p.name, focusTags: fa.map((f) => f.tag), values };
  });
  const heatmapMax = Object.fromEntries(
    KPI_CATEGORIES.map((k) => [k, Math.max(0, ...heatmap.map((h) => h.values[k] ?? 0))]),
  ) as Record<KpiCategory, number>;

  const topAlerts = await topAlertsByEquipment(prisma, alertWhere, 5);

  return { function: fn, asOf: AS_OF_DATE, counters, trend, portfolio, heatmap, heatmapMax, topAlerts };
}

async function picCodesFor(prisma: PrismaClient, fn: FunctionName) {
  const rows = await prisma.incident.findMany({ where: { ownerFunction: fn }, select: { picRca: true }, distinct: ["picRca"] });
  return rows.map((r) => r.picRca);
}

/** Headline KPI per function tile (owned incidents via PIC prefix). */
export async function getFunctionKpis(prisma: PrismaClient) {
  const rows = await prisma.incident.groupBy({
    by: ["ownerFunction"],
    where: { statusNormalized: { in: ACTIVE } },
    _count: { _all: true },
    _sum: { totalLossKUSD: true },
  });
  const overdue = await prisma.incident.groupBy({ by: ["ownerFunction"], where: { rcaOverdue: true }, _count: { _all: true } });
  return Object.fromEntries(
    rows
      .filter((r) => r.ownerFunction)
      .map((r) => [
        r.ownerFunction!,
        {
          activeIncidents: r._count._all,
          activeLossKUSD: round1(r._sum.totalLossKUSD ?? 0),
          rcaOverdue: overdue.find((o) => o.ownerFunction === r.ownerFunction)?._count._all ?? 0,
        },
      ]),
  ) as Record<string, { activeIncidents: number; activeLossKUSD: number; rcaOverdue: number }>;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
