// FR-2.5 — everything the equipment detail page needs: three time scales + RCA/CAPA, joined on canonical keys.

import type { PrismaClient } from "@prisma/client";
import { getUnifiedEquipment } from "./equipment";
import { fromJson } from "./json";
import { limitDirection, limitsComparable, matchWeeklyParameter } from "./param-match";
import { AS_OF_DATE } from "./normalize";
import { detect, BASELINE_HOURS, type HourlyPoint } from "@/lib/detect/baseline-detector";
import type { ScoreBreakdown } from "@/lib/alerts/priority";

export async function getEquipmentView(prisma: PrismaClient, rawTag: string) {
  const u = await getUnifiedEquipment(prisma, rawTag);
  if (!u) return null;
  const params = u.equipment.monitoredParameters;

  // ── Scale 1: weekly condition (26 wk) — one panel per monitored parameter, straight from the data ──
  const weekly = {
    points: u.weekly.map((w) => ({ t: w.date.getTime(), week: w.week, healthStatus: w.healthStatus, remark: w.remark, ...w.readings })),
    parameters: params.map((p) => ({ ...p, direction: limitDirection(p) })),
  };

  // ── Scale 2: hourly PI (30 d) + detector ─────────────────────────────────
  let hourly = null;
  if (u.production) {
    const numeric = u.production.instruments.filter((i) => !i.digitalSet);
    const series: HourlyPoint[] = u.production.hourly.map((h) => ({
      timestamp: h.timestamp as string,
      runStatus: h.runStatus as "ON" | "OFF",
      values: Object.fromEntries(numeric.map((i) => [i.name, h[i.name] as number])),
    }));
    const det = detect(series, numeric.map((i) => i.name));
    const dq7 = new Set(u.dataQualityIssues.filter((d) => d.code === "DQ-7").map((d) => d.recordId.split(":")[1]));
    const dq6 = new Set(u.dataQualityIssues.filter((d) => d.code === "DQ-6").map((d) => d.recordId.split(":")[1]));

    const signals = numeric.map((i) => {
      const stats = det?.candidates.find((c) => c.signal === i.name) ?? null;
      const m = matchWeeklyParameter(i, params);
      const weeklyBase = m ? (u.weekly.slice(0, 5).map((w) => w.readings[m.parameter.parameter]).filter((v) => v != null) as number[]) : [];
      const cmp = m && stats ? limitsComparable(m, stats.baselineMean, weeklyBase.length ? weeklyBase.reduce((a, b) => a + b, 0) / weeklyBase.length : null) : null;
      return {
        name: i.name,
        description: i.description,
        parameter: i.parameter,
        unitDeclared: i.engUnits,
        unit: i.engUnitsObserved,
        kpiCategory: i.kpiCategory,
        dataQualityNote: i.dataQualityNote,
        unitMismatch: dq6.has(i.name),
        templateTag: dq7.has(i.name),
        baselineMean: stats?.baselineMean ?? null,
        baselineStd: stats?.baselineStd ?? null,
        sustainedZ: stats?.sustainedZ ?? null,
        firstFlagAt: stats?.firstFlagAt ?? null,
        limits: m && cmp?.ok ? { alarm: m.parameter.alarm, trip: m.parameter.trip, source: m.parameter.parameter, direction: limitDirection(m.parameter) } : null,
        limitsNote: m ? cmp?.reason ?? null : "no matching weekly parameter — no alarm/trip limits defined in Equipment Performance",
        isPrimary: det?.primary.signal === i.name,
      };
    });

    hourly = {
      period: { start: u.production.dataset.periodStart, end: u.production.dataset.periodEnd },
      points: u.production.hourly.map((h) => ({ ...h, t: Date.parse(h.timestamp as string) })),
      signals,
      detector: det && {
        rule: det.rule,
        primary: det.primary,
        runnerUp: det.runnerUp,
        firstFlagAt: det.primary.firstFlagAt,
        tripAt: det.tripAt,
        leadTimeHours: det.leadTimeHours,
        escalations: det.escalations,
        peakSustainedZ: det.peakSustainedZ,
        severity: det.severity,
        baselineEnd: u.production.hourly[BASELINE_HOURS - 1]?.timestamp as string,
        offHours: det.offHours,
        offWindows: offWindows(u.production.hourly as { timestamp: string; runStatus: string }[]),
      },
      sourceDerived: u.production.dataset.sourceDerived as Record<string, unknown>,
    };
  }

  // ── Alerts on this asset ─────────────────────────────────────────────────
  const alerts = (await prisma.alert.findMany({ where: { equipmentTag: u.tag }, orderBy: { priorityScore: "desc" } })).map((a) => ({
    ...a,
    breakdown: fromJson<ScoreBreakdown | null>(a.scoreBreakdownJson, null),
  }));

  // ── Scale 3: RCA / CAPA ──────────────────────────────────────────────────
  const rca = u.rca.map((r) => ({
    ...r,
    capa: r.capaActions.map((c) => ({
      ...c,
      overduePerSnapshot: c.kind !== "preventive" && c.kind !== "riskOfCorrectiveAction" && c.sourceStatus !== "Closed" && !!c.planDate && c.planDate < AS_OF_DATE,
    })),
  }));

  // ── Cross-scale timeline (the product story: weeks → hours → why) ────────
  const timeline: { at: string; label: string; scale: "weekly" | "hourly" | "rca" }[] = [];
  const firstAlarm = u.weekly.find((w) => w.healthStatus !== "NORMAL");
  if (firstAlarm) timeline.push({ at: firstAlarm.date.toISOString(), label: `Weekly health → ${firstAlarm.healthStatus} (wk ${firstAlarm.week})`, scale: "weekly" });
  if (hourly) timeline.push({ at: new Date(hourly.period.start).toISOString(), label: "Hourly PI window starts", scale: "hourly" });
  const d = hourly?.detector;
  if (d?.firstFlagAt) timeline.push({ at: d.firstFlagAt, label: `Detector flags ${d.primary.signal} (${d.leadTimeHours} h before trip)`, scale: "hourly" });
  if (d?.tripAt) timeline.push({ at: d.tripAt, label: "Trip — RUN_STATUS OFF", scale: "hourly" });
  for (const r of rca) timeline.push({ at: r.dateReported.toISOString(), label: `RCA reported (${r.rcaId})`, scale: "rca" });
  timeline.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return { ...u, weeklyView: weekly, hourly, alerts, rcaView: rca, timeline };
}

function offWindows(rows: { timestamp: string; runStatus: string }[]) {
  const out: { start: number; end: number }[] = [];
  let s: number | null = null;
  rows.forEach((r, i) => {
    const t = Date.parse(r.timestamp);
    if (r.runStatus === "OFF" && s == null) s = t;
    if (r.runStatus !== "OFF" && s != null) {
      out.push({ start: s, end: Date.parse(rows[i - 1].timestamp) + 3_600_000 });
      s = null;
    }
  });
  if (s != null) out.push({ start: s, end: Date.parse(rows[rows.length - 1].timestamp) + 3_600_000 });
  return out;
}

export type EquipmentView = NonNullable<Awaited<ReturnType<typeof getEquipmentView>>>;
