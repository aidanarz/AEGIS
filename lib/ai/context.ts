// PRD §8.2 step 2 — context assembly. Builds a structured, bounded context for one alert (never a raw dump).
//
// Rules applied (agreed with the team):
//   • Time cutoff (both modes): the target asset's own records are included only if dated ≤ alert time.
//     Hourly statistics are computed on the series truncated at the alert — no look-ahead.
//   • Leave-one-out (eval mode only): strip the target's verifiedRootCause / 4P / 4M+1E / CAPA / PM schedule /
//     historicalEvidence / chronology (its RCA report is never included), its Equipment-Performance
//     dominantFailureMode, its Incident riskCaseTitle / failureMechanism, and — agreed addition — its incident
//     `component`. Any free text that quotes a stripped value is redacted.
//   • Similar cases: the other RCA reports only (FR-3.7).

import type { PrismaClient } from "@prisma/client";
import { fromJson } from "@/lib/data/json";
import { ownerFunctionFromPic } from "@/lib/data/normalize";
import type { MonitoredParameter } from "@/lib/data/source-types";
import { analyseSignal, BASELINE_HOURS, type HourlyPoint } from "@/lib/detect/baseline-detector";
import { loadHourlySeries } from "@/lib/detect/run";
import { findSimilarCases, incidentPatternStats, type Signature } from "./similar-cases";

export type AnalysisMode = "live" | "leave-one-out";
export const LOO_STRIPPED_FIELDS = [
  "rca.verifiedRootCause",
  "rca.fourP",
  "rca.fourMPlusOneE",
  "rca.capa",
  "rca.pmSchedule",
  "rca.historicalEvidence",
  "rca.chronology",
  "equipment.dominantFailureMode",
  "incident.riskCaseTitle",
  "incident.failureMechanism",
  "incident.component (agreed addition)",
];

const REDACTED = "[redacted — answer key]";
const H = 3_600_000;

export interface SignalFact {
  signal: string;
  role: string;
  unit: string;
  baselineMean: number;
  baselineStd: number;
  zNow: number;
  sustainedZ: number; // signed, up to cutoff
  firstFlagAt: string | null;
  templateTag: boolean;
}

export interface Facts {
  tag: string;
  plantCode: string;
  typeName: string | null;
  typeCode: string | null;
  discipline: string | null;
  isFocus: boolean;
  monitoredParameters: MonitoredParameter[];
  weekly: { week: number; date: string; readings: Record<string, number>; healthStatus: string }[];
  signals: SignalFact[];
  primary: SignalFact | null;
  incidentMechanism: string | null; // null when stripped or truncated (DQ-4)
  incidentComponent: string | null; // null when stripped
  weeklyOnlyParameters: string[]; // DQ-8
  ownerCodesByFunction: Record<string, { code: string; incidents: number }[]>;
  subjectPicRca: string | null;
  severity: string;
}

export interface BuiltContext {
  context: Record<string, unknown>;
  facts: Facts;
  meta: {
    mode: AnalysisMode;
    cutoff: string;
    included: string[];
    stripped: string[];
    redactions: number;
    knownIds: Map<string, { kind: string; href: string | null }>;
    similarCases: Awaited<ReturnType<typeof findSimilarCases>>;
  };
}

export async function buildContext(prisma: PrismaClient, alertId: string, mode: AnalysisMode): Promise<BuiltContext> {
  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
    include: { equipment: { include: { plant: true, rcaReports: { select: { rcaId: true } } } }, incident: true },
  });
  if (!alert) throw new Error(`Alert ${alertId} not found`);
  const eq = alert.equipment;
  if (mode === "leave-one-out" && !eq.rcaReports.length) throw new Error("Leave-one-out mode needs an asset with an RCA report (the 5 focus assets).");

  const loo = mode === "leave-one-out";
  const cutoff = alert.triggeredAt;
  const included: string[] = [];
  const knownIds = new Map<string, { kind: string; href: string | null }>();
  knownIds.set(alert.id, { kind: "alert", href: `/alerts/${alert.id}` });

  // Target incident (the one that records this failure) — its free text is the answer key in LOO mode.
  const targetIncident =
    alert.incident ?? (await prisma.incident.findFirst({ where: { equipmentTag: eq.tag, rcaId: { in: eq.rcaReports.map((r) => r.rcaId) } } }));
  const redactTerms = loo
    ? [
        eq.dominantFailureMode,
        targetIncident?.riskCaseTitle,
        targetIncident?.riskCaseTitle?.split("—").slice(1).join("—").trim(),
        targetIncident?.component,
        ...eq.rcaReports.map((r) => r.rcaId), // the target's own report id
      ]
        .filter((s): s is string => !!s && s.length >= 6)
        .sort((a, b) => b.length - a.length)
    : [];
  let redactions = 0;
  const redact = (s: string | null | undefined) => {
    if (!s || !redactTerms.length) return s ?? null;
    let out = s;
    for (const t of redactTerms) {
      const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      if (re.test(out)) {
        redactions++;
        out = out.replace(re, REDACTED);
      }
    }
    return out;
  };

  // ── Equipment + weekly condition (last 8 readings ≤ cutoff) ─────────────
  const params = fromJson<MonitoredParameter[]>(eq.monitoredParametersJson, []);
  const weeklyRows = await prisma.conditionReading.findMany({ where: { equipmentTag: eq.tag, date: { lte: cutoff } }, orderBy: { week: "desc" }, take: 8 });
  weeklyRows.reverse();
  for (const w of weeklyRows) knownIds.set(`${eq.tag}#w${w.week}`, { kind: "weekly reading", href: `/equipment/${eq.tag}` });
  if (weeklyRows.length) included.push(`${weeklyRows.length} weekly readings (Equipment Performance)`);

  // ── Hourly PI: statistics on the series truncated at the cutoff ─────────
  const { series: fullSeries } = await loadHourlySeries(prisma, eq.tag);
  const instruments = await prisma.productionInstrument.findMany({ where: { equipmentTag: eq.tag, digitalSet: null } });
  const templateTags = new Set((await prisma.dataQualityIssue.findMany({ where: { code: "DQ-7", equipmentTag: eq.tag } })).map((d) => d.recordId.split(":")[1]));
  const series: HourlyPoint[] = fullSeries.filter((p) => Date.parse(p.timestamp) <= cutoff.getTime());
  let hourly: Record<string, unknown> | null = null;
  const signals: SignalFact[] = [];
  if (series.length > BASELINE_HOURS + 3) {
    for (const ins of instruments) {
      const a = analyseSignal(series, ins.name, series.length);
      signals.push({
        signal: ins.name,
        role: ins.parameter,
        unit: ins.engUnitsObserved,
        baselineMean: round(a.baselineMean, 3),
        baselineStd: round(a.baselineStd, 3),
        zNow: round(a.z[a.z.length - 1], 2),
        sustainedZ: round(a.sustainedZ, 2),
        firstFlagAt: a.firstFlagAt,
        templateTag: templateTags.has(ins.name),
      });
      knownIds.set(ins.name, { kind: "PI tag", href: `/equipment/${eq.tag}` });
    }
    const windowStart = cutoff.getTime() - 168 * H;
    const last = series.filter((p) => Date.parse(p.timestamp) > windowStart);
    const down = last.filter((_, i) => i % 4 === 0 || i === last.length - 1);
    hourly = {
      window: { from: last[0]?.timestamp, to: last[last.length - 1]?.timestamp, note: "last 168 h up to the alert, sampled every 4 h" },
      baseline: Object.fromEntries(signals.map((s) => [s.signal, { mean: s.baselineMean, std: s.baselineStd, unit: s.unit }])),
      signalSummary: signals.map((s) => ({
        signal: s.signal,
        role: s.role,
        unit: s.unit,
        zNow: s.zNow,
        sustainedZ: s.sustainedZ,
        firstFlagAt: s.firstFlagAt,
        note: s.templateTag ? "template tag on static equipment (DQ-7) — not a health signal" : undefined,
      })),
      last168h: down.map((p) => ({ t: p.timestamp, ...Object.fromEntries(Object.entries(p.values).map(([k, v]) => [k, round(v, 3)])), runStatus: p.runStatus })),
      runStatus: series[series.length - 1]?.runStatus,
    };
    included.push(`hourly PI statistics for ${signals.length} tags (truncated at alert time)`);
  } else if (fullSeries.length) {
    included.push("hourly PI window not available yet at alert time");
  }
  const healthSignals = signals.filter((s) => !s.templateTag);
  const primary = healthSignals.sort((a, b) => Math.abs(b.sustainedZ) - Math.abs(a.sustainedZ))[0] ?? null;

  // ── Incidents on this tag (≤ cutoff), subject incident, pattern stats ───
  const sameTag = await prisma.incident.findMany({ where: { equipmentTag: eq.tag, dateOfOccurrence: { lte: cutoff } }, orderBy: { serialNo: "asc" } });
  const isTarget = (serial: number) => targetIncident?.serialNo === serial;
  const incidentView = (i: (typeof sameTag)[number]) => {
    knownIds.set(i.incidentId, { kind: "incident", href: `/incidents?tag=${encodeURIComponent(i.equipmentTag)}` });
    const strip = loo && isTarget(i.serialNo);
    const truncated = fromJson<string[]>(i.dataQualityFlagsJson, []).includes("truncated_f_mechanism");
    return {
      incidentId: i.incidentId,
      date: i.dateOfOccurrence.toISOString().slice(0, 10),
      plantCode: i.plantCode,
      equipmentType: i.equipmentType,
      equipmentClass: i.equipmentClass,
      riskCaseTitle: strip ? REDACTED : redact(i.riskCaseTitle),
      component: strip ? REDACTED : redact(i.component),
      failureMechanism: strip ? REDACTED : truncated ? `${i.failureMechanism} (truncated in source — DQ-4)` : i.failureMechanism,
      highestImpact: i.highestImpact,
      preRisk: i.preRisk,
      riskScore: i.riskScore,
      status: i.overallStatus,
      picRca: i.picRca,
      downtimeHours: i.downtimeHours,
      totalLossKUSD: i.totalLossKUSD,
    };
  };
  // Detector / weekly alerts are linked to the failure's incident for scoring, but that incident is usually dated
  // AFTER the alert — the time cutoff keeps it out of the context.
  const subject = alert.incident && alert.incident.dateOfOccurrence <= cutoff ? alert.incident : null;
  if (sameTag.length) included.push(`${sameTag.length} incident(s) on ${eq.tag} dated ≤ alert`);
  const subjectTruncated = subject ? fromJson<string[]>(subject.dataQualityFlagsJson, []).includes("truncated_f_mechanism") : false;
  const incidentMechanism = subject && !loo && !subjectTruncated ? subject.failureMechanism : null;
  const pattern = await incidentPatternStats(prisma, {
    equipmentType: eq.equipmentTypeCode ?? subject?.equipmentType ?? null,
    failureMechanism: incidentMechanism,
    cutoff,
    excludeSerial: targetIncident?.serialNo ?? null,
  });
  if (pattern) included.push(`pattern stats: ${pattern.incidentsOfThisType} prior incidents of type ${pattern.equipmentType}`);

  // ── Similar RCA cases (other reports only) ──────────────────────────────
  const signature: Signature | null = primary && Math.abs(primary.sustainedZ) > 3 ? { role: primary.role, direction: primary.sustainedZ >= 0 ? "up" : "down" } : null;
  const similar = await findSimilarCases(prisma, {
    tag: eq.tag,
    typeName: eq.equipmentTypeName,
    typeCode: eq.equipmentTypeCode ?? subject?.equipmentType ?? null,
    discipline: eq.discipline,
    signature,
  });
  for (const s of similar) {
    knownIds.set(s.rcaId, { kind: "RCA report", href: `/equipment/${s.equipmentTag}` });
    for (const f of s.ngFindings) knownIds.set(f.id, { kind: "RCA finding", href: `/equipment/${s.equipmentTag}` });
  }
  if (similar.length) included.push(`${similar.length} similar RCA case(s): ${similar.map((s) => s.rcaId).join(", ")}`);

  // ── Data-quality notes relevant to the reasoning ────────────────────────
  // DQ-9 (OFF hours vs reported downtime) describes the trip itself — post-event, so never part of an alert-time context.
  const dq = await prisma.dataQualityIssue.findMany({ where: { equipmentTag: eq.tag, code: { in: ["DQ-4", "DQ-6", "DQ-7", "DQ-8"] } } });
  const weeklyOnlyParameters = dq.filter((d) => d.code === "DQ-8").map((d) => d.recordId.split(":").slice(1).join(":"));

  // ── Owner directory: real PIC codes per function in this plant (for suggestedOwnerCode) ──
  const owners = await prisma.incident.groupBy({ by: ["picRca"], where: { plantCode: eq.plantCode }, _count: { _all: true } });
  const ownerCodesByFunction: Facts["ownerCodesByFunction"] = {};
  for (const o of owners.sort((a, b) => b._count._all - a._count._all)) {
    const fn = ownerFunctionFromPic(o.picRca);
    if (!fn) continue;
    (ownerCodesByFunction[fn] ??= []).push({ code: o.picRca, incidents: o._count._all });
  }

  const context = {
    mode,
    cutoff: cutoff.toISOString(),
    alert: {
      id: alert.id,
      source: alert.source,
      equipmentTag: eq.tag,
      plantCode: eq.plantCode,
      plantName: eq.plant.name,
      triggeredBy: alert.triggeredBy,
      timestamp: cutoff.toISOString(),
      severity: alert.severity,
      priorityScore: alert.priorityScore,
    },
    equipment: {
      equipmentTypeName: eq.equipmentTypeName,
      equipmentTypeCode: eq.equipmentTypeCode ?? subject?.equipmentType ?? null,
      equipmentClass: eq.equipmentClass,
      discipline: eq.discipline,
      criticality: eq.criticality,
      designLife: eq.designLife,
      monitoringMethod: eq.monitoringMethod,
      // The Equipment-Performance failure mode describes the failure on `failureDate`; before that date it is look-ahead.
      dominantFailureMode: loo ? REDACTED : eq.failureDate && eq.failureDate > cutoff ? "[not known at alert time — failure occurs later]" : eq.dominantFailureMode,
      monitoredParameters: params,
      recentConditionHistory: weeklyRows.map((w) => ({
        id: `${eq.tag}#w${w.week}`,
        week: w.week,
        date: w.date.toISOString().slice(0, 10),
        readings: fromJson<Record<string, number>>(w.readingsJson, {}),
        healthStatus: w.healthStatus,
        remark: redact(w.remark),
      })),
    },
    hourlySignals: hourly,
    subjectIncident: subject ? incidentView(subject) : null,
    relatedIncidents: {
      sameTag: sameTag.filter((i) => i.serialNo !== subject?.serialNo).map(incidentView),
      patternStats: pattern,
    },
    similarRcaCases: similar.map((s) => ({
      rcaId: s.rcaId,
      equipmentTag: s.equipmentTag,
      equipmentType: s.equipmentType,
      similarity: s.score,
      similarityBasis: s.basis,
      verifiedRootCause: s.verifiedRootCause,
      ngFindings: s.ngFindings,
    })),
    dataQualityNotes: dq.map((d) => ({ code: d.code, message: redact(d.message) })),
    ownerDirectory: { picPrefixToFunction: { "REL-": "Reliability", "ROT-/STA-/ELE-/INS-": "Maintenance", "OPS-": "Production" }, codesInThisPlant: ownerCodesByFunction },
  };

  return {
    context,
    facts: {
      tag: eq.tag,
      plantCode: eq.plantCode,
      typeName: eq.equipmentTypeName,
      typeCode: eq.equipmentTypeCode ?? subject?.equipmentType ?? null,
      discipline: eq.discipline,
      isFocus: eq.isFocus,
      monitoredParameters: params,
      weekly: weeklyRows.map((w) => ({ week: w.week, date: w.date.toISOString().slice(0, 10), readings: fromJson(w.readingsJson, {}), healthStatus: w.healthStatus })),
      signals,
      primary,
      incidentMechanism,
      incidentComponent: subject && !loo ? subject.component : null,
      weeklyOnlyParameters,
      ownerCodesByFunction,
      subjectPicRca: subject?.picRca ?? null,
      severity: alert.severity,
    },
    meta: { mode, cutoff: cutoff.toISOString(), included, stripped: loo ? LOO_STRIPPED_FIELDS : [], redactions, knownIds, similarCases: similar },
  };
}

function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
