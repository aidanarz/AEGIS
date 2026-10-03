// Seed: loads the 4 REAL source files from /mock-data into SQLite (PRD §9).
// No synthetic records are created. Normalization per §6.3, KPI taxonomy per §6.4.
// Ends with a record-count check against PRD §14 and exits non-zero on mismatch.

import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient, ActionStatus, ActionCreatedBy } from "@prisma/client";
import {
  AS_OF_DATE,
  canonicalTag,
  extractPlantCode,
  kpiForProductionParameter,
  monthKeyFromMonthYear,
  ownerFunctionFromPic,
  parseSourceDate,
  plantNameFromRca,
} from "../lib/data/normalize";
import { toJson } from "../lib/data/json";
import { runDataQualityChecks } from "../lib/data/dq";
import { DQ_CATALOG } from "../lib/data/dq-catalog";
import { logLoad } from "../lib/data/sources";
import {
  SOURCE_SYSTEMS,
  type EquipmentPerformanceRecord,
  type IncidentRecord,
  type ProductionRecord,
  type RcaRecord,
} from "../lib/data/source-types";

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, "..", "mock-data");

function load<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf-8")) as T;
}

function must<T>(v: T | null | undefined, what: string): T {
  if (v == null) throw new Error(`Seed: could not derive ${what}`);
  return v;
}

const CAPA_STATUS: Record<string, ActionStatus> = {
  Open: ActionStatus.open,
  "In Progress": ActionStatus.in_progress,
  Closed: ActionStatus.done,
};

async function clear() {
  // Child tables first.
  await prisma.action.deleteMany();
  await prisma.aiAnalysis.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.dataQualityIssue.deleteMany();
  await prisma.ingestRun.deleteMany();
  await prisma.capaAction.deleteMany();
  await prisma.pmSchedule.deleteMany();
  await prisma.rcaVerification.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.rcaReport.deleteMany();
  await prisma.productionReading.deleteMany();
  await prisma.productionInstrument.deleteMany();
  await prisma.runStatus.deleteMany();
  await prisma.productionDataset.deleteMany();
  await prisma.conditionReading.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.plant.deleteMany();
}

async function main() {
  const t0 = Date.now();
  const startedAt = new Date();
  const equipmentPerf = load<EquipmentPerformanceRecord[]>("equipment_performance.json");
  const incidents = load<IncidentRecord[]>("incidents.json");
  const production = load<ProductionRecord[]>("production.json");
  const rcas = load<RcaRecord[]>("rca_downtime.json");

  await clear();

  // ── Plants (§6.3 rule 2) ────────────────────────────────────────────────
  const plantCodes = new Set<string>();
  const aliases = new Map<string, Set<string>>();
  const names = new Map<string, string>();
  const addAlias = (code: string, raw: string) => {
    if (!aliases.has(code)) aliases.set(code, new Set());
    aliases.get(code)!.add(raw);
  };
  for (const i of incidents) plantCodes.add(must(extractPlantCode(i.plant), `plant code from "${i.plant}"`));
  for (const e of equipmentPerf) {
    const code = must(extractPlantCode(e.plantUnit), `plant code from "${e.plantUnit}"`);
    plantCodes.add(code);
    addAlias(code, e.plantUnit);
  }
  for (const r of rcas) {
    plantCodes.add(r.plantCode);
    addAlias(r.plantCode, r.plantName);
    const name = plantNameFromRca(r.plantName);
    if (name) names.set(r.plantCode, name); // only the RCA decks name plants — never invented
  }
  for (const p of production) plantCodes.add(p.plantCode);

  await prisma.plant.createMany({
    data: [...plantCodes].sort().map((code) => ({
      code,
      name: names.get(code) ?? null,
      nameSource: names.has(code) ? SOURCE_SYSTEMS.rca : null,
      aliasesJson: toJson([...(aliases.get(code) ?? [])]),
    })),
  });

  // ── Equipment: 5 focus assets from Equipment Performance + incident-only tags ──
  const incidentByTag = new Map<string, IncidentRecord>(); // earliest serial wins (CV-5846 appears twice)
  for (const i of [...incidents].sort((a, b) => a.serialNo - b.serialNo)) {
    const tag = canonicalTag(i.equipmentTag);
    if (!incidentByTag.has(tag)) incidentByTag.set(tag, i);
  }

  const focusTags = new Set<string>();
  for (const e of equipmentPerf) {
    const tag = canonicalTag(e.equipmentTag);
    focusTags.add(tag);
    const inc = incidentByTag.get(tag);
    await prisma.equipment.create({
      data: {
        tag,
        plantCode: must(extractPlantCode(e.plantUnit), "plant"),
        isFocus: true,
        equipmentName: e.equipmentName,
        equipmentTypeCode: inc?.equipmentType ?? null,
        equipmentTypeName: e.equipmentType,
        equipmentClass: e.equipmentClass,
        discipline: e.discipline,
        criticality: e.criticality,
        designLife: e.designLife,
        monitoringMethod: e.monitoringMethod,
        plantUnitRaw: e.plantUnit,
        linkedRcaNo: e.linkedRcaNo,
        failureDate: parseSourceDate(e.failureDate),
        dominantFailureMode: e.dominantFailureMode,
        monitoredParametersJson: toJson(e.monitoredParameters),
        performanceSummaryJson: toJson(e.performanceSummary),
        kpiCategory: "reliability",
        sourceSystem: SOURCE_SYSTEMS.equipment,
        sourceRecordId: tag,
      },
    });
  }

  await prisma.equipment.createMany({
    data: [...incidentByTag.entries()]
      .filter(([tag]) => !focusTags.has(tag))
      .map(([tag, i]) => ({
        tag,
        plantCode: must(extractPlantCode(i.plant), "plant"),
        isFocus: false,
        equipmentTypeCode: i.equipmentType,
        equipmentClass: i.equipmentClass,
        discipline: i.discipline,
        kpiCategory: "reliability",
        sourceSystem: SOURCE_SYSTEMS.incident,
        sourceRecordId: String(i.serialNo),
      })),
  });

  // ── Condition readings (weekly) ─────────────────────────────────────────
  await prisma.conditionReading.createMany({
    data: equipmentPerf.flatMap((e) => {
      const tag = canonicalTag(e.equipmentTag);
      const plantCode = must(extractPlantCode(e.plantUnit), "plant");
      return e.conditionHistory.map((c) => ({
        equipmentTag: tag,
        plantCode,
        week: c.week,
        date: parseSourceDate(c.date),
        readingsJson: toJson(c.readings),
        healthStatus: c.healthStatus,
        remark: c.remark,
        kpiCategory: "reliability",
        sourceSystem: SOURCE_SYSTEMS.equipment,
        sourceRecordId: `${tag}#w${c.week}`,
      }));
    }),
  });

  // ── RCA reports + 4P/4M+1E + CAPA + PM schedule ─────────────────────────
  const rcaIds = new Map<string, string>(); // rcaId → tag
  for (const r of rcas) {
    const tag = canonicalTag(r.equipmentTag);
    rcaIds.set(r.rcaId, tag);
    await prisma.rcaReport.create({
      data: {
        rcaId: r.rcaId,
        equipmentTag: tag,
        plantCode: r.plantCode,
        plantNameRaw: r.plantName,
        equipmentClass: r.equipmentClass,
        discipline: r.discipline,
        title: r.title,
        dateOccurrence: parseSourceDate(r.dateOccurrence),
        dateReported: parseSourceDate(r.dateReported),
        immediateAction: r.immediateAction,
        severity: r.severity,
        preRisk: r.preRisk,
        preRiskScore: r.preRiskScore,
        picRca: r.picRca,
        downtimeHours: r.downtimeHours,
        productionLossTon: r.productionLossTon,
        estimatedLossKUSD: r.estimatedLossKUSD,
        problemStatement: r.problemStatement,
        historicalEvidence: r.historicalEvidence,
        targetCondition: r.targetCondition,
        chronologyJson: toJson(r.chronology),
        verifiedRootCause: r.verifiedRootCause,
        methodologyJson: toJson(r.methodology),
        capaSummaryJson: toJson(r.capaSummary),
        kpiCategory: r.kpiCategory,
        sourceSystem: r.sourceSystem,
        sourceRecordId: r.rcaId,
        verifications: {
          create: [
            ...r.fourP.map((v) => ({ ref: v.id, method: "4P", parameterOrFactor: v.parameterOrFactor, result: v.result, evidence: v.evidence })),
            ...r.fourMPlusOneE.map((v) => ({ ref: v.id, method: "4M+1E", parameterOrFactor: v.parameterOrFactor, result: v.result, evidence: v.evidence })),
          ],
        },
        pmSchedules: { create: r.pmSchedule.map((p) => ({ pmNo: p.pmNo, description: p.description, group: p.group, interval: p.interval })) },
      },
    });

    const capaRows = [
      ...r.capa.corrective.map((c, seq) => ({ kind: "corrective", seq, ref: c.rootCauseRef, action: c.action, planDate: c.planDate, pic: c.pic, sourceStatus: c.status })),
      ...r.capa.proactive.map((c, seq) => ({ kind: "proactive", seq, ref: c.rootCauseRef, action: c.action, planDate: c.planDate, pic: c.pic, sourceStatus: c.status })),
      ...r.capa.preventive.map((c, seq) => ({ kind: "preventive", seq, ref: c.ref, action: c.action, planDate: c.planDate, pic: c.pic, possibleRootCause: c.possibleRootCause })),
      ...r.capa.riskOfCorrectiveAction.map((c, seq) => ({ kind: "riskOfCorrectiveAction", seq, ref: null, action: c.action, planDate: c.planDate, pic: c.pic, potentialRisk: c.potentialRisk, countermeasure: c.countermeasure })),
    ];
    for (const c of capaRows) {
      const capa = await prisma.capaAction.create({
        data: {
          rcaId: r.rcaId,
          plantCode: r.plantCode,
          kind: c.kind,
          seq: c.seq,
          ref: c.ref,
          action: c.action,
          possibleRootCause: "possibleRootCause" in c ? c.possibleRootCause : null,
          potentialRisk: "potentialRisk" in c ? c.potentialRisk : null,
          countermeasure: "countermeasure" in c ? c.countermeasure : null,
          planDate: c.planDate ? parseSourceDate(c.planDate) : null,
          pic: c.pic,
          ownerFunction: ownerFunctionFromPic(c.pic),
          sourceStatus: "sourceStatus" in c ? c.sourceStatus : null,
          kpiCategory: r.kpiCategory,
        },
      });
      // §9.3 / FR-3.8 — only corrective + pro-active items become tracked actions (20 total).
      if (c.kind === "corrective" || c.kind === "proactive") {
        const status = CAPA_STATUS["sourceStatus" in c ? c.sourceStatus : ""];
        if (!status) throw new Error(`Seed: unmapped CAPA status on ${r.rcaId} ${c.kind}#${c.seq}`);
        await prisma.action.create({
          data: {
            title: c.action,
            ownerCode: c.pic,
            ownerFunction: ownerFunctionFromPic(c.pic),
            dueDate: c.planDate ? parseSourceDate(c.planDate) : null,
            status,
            sourceStatus: "sourceStatus" in c ? c.sourceStatus : null,
            createdBy: ActionCreatedBy.imported_capa,
            rcaId: r.rcaId,
            rootCauseRef: c.ref,
            capaActionId: capa.id,
          },
        });
      }
    }
  }

  // ── Incidents (PK = serialNo, §6.3 rule 3/4) ────────────────────────────
  await prisma.incident.createMany({
    data: incidents.map((i) => {
      const tag = canonicalTag(i.equipmentTag);
      // arNo is only a foreign key to RCA where it exists AND the tag agrees (rule 4).
      const rcaId = i.arNo && rcaIds.get(i.arNo) === tag ? i.arNo : null;
      return {
        serialNo: i.serialNo,
        incidentId: i.incidentId,
        mtoNo: i.mtoNo,
        arNo: i.arNo,
        rcaId,
        plantCode: must(extractPlantCode(i.plant), "plant"),
        equipmentTag: tag,
        equipmentClass: i.equipmentClass,
        equipmentType: i.equipmentType,
        discipline: i.discipline,
        component: i.component,
        dateOfOccurrence: parseSourceDate(i.dateOfOccurrence),
        monthYear: i.monthYear,
        monthKey: monthKeyFromMonthYear(i.monthYear),
        riskCaseTitle: i.riskCaseTitle,
        highestImpact: i.highestImpact,
        preRisk: i.preRisk,
        riskScore: i.riskScore,
        picRca: i.picRca,
        ownerFunction: ownerFunctionFromPic(i.picRca),
        overallStatus: i.overallStatus,
        statusNormalized: i.statusNormalized,
        failureMechanism: i.failureMechanism,
        downtimeHours: i.downtimeHours,
        actualLossKUSD: i.actualLossKUSD,
        potentialLossKUSD: i.potentialLossKUSD,
        totalLossKUSD: i.totalLossKUSD,
        rcaDueDate: i.rcaDueDate ? parseSourceDate(i.rcaDueDate) : null,
        rcaOverdue: i.rcaOverdue,
        dataQualityFlagsJson: toJson(i.dataQualityFlags),
        kpiCategory: i.kpiCategory,
        secondaryKpi: "risk_exposure",
        sourceSystem: i.sourceSystem,
        sourceRecordId: String(i.sourceRecordId),
      };
    }),
  });

  // ── Production Data (long format, §6.2.3 assumption) ────────────────────
  for (const p of production) {
    const tag = canonicalTag(p.equipmentTag);
    await prisma.productionDataset.create({
      data: {
        equipmentTag: tag,
        plantCode: p.plantCode,
        periodStart: parseSourceDate(p.period.start),
        periodEnd: parseSourceDate(p.period.end),
        rows: p.period.rows,
        linkedRcaIndex: p.linkedRcaIndex,
        fileKpiCategory: p.kpiCategory,
        sourceDerivedJson: toJson(p.derived),
        sourceSystem: p.sourceSystem,
        sourceRecordId: `RCA${p.linkedRcaIndex}`,
      },
    });

    const unitByName = new Map<string, string>();
    const kpiByName = new Map<string, string>();
    for (const ins of p.instruments) {
      const kpi = kpiForProductionParameter(ins.parameter);
      unitByName.set(ins.name, ins.engUnitsObserved);
      kpiByName.set(ins.name, kpi);
      await prisma.productionInstrument.create({
        data: {
          equipmentTag: tag,
          plantCode: p.plantCode,
          name: ins.name,
          instrumentTag: ins.instrumentTag,
          description: ins.description,
          parameter: ins.parameter,
          engUnits: ins.engUnits,
          engUnitsObserved: ins.engUnitsObserved,
          span: ins.span,
          typicalValue: ins.typicalValue,
          zero: ins.zero,
          digitalSet: ins.digitalSet,
          dataQualityNote: ins.dataQualityNote,
          kpiCategory: kpi,
          sourceSystem: p.sourceSystem,
          sourceRecordId: `RCA${p.linkedRcaIndex}:${ins.name}`,
        },
      });
    }

    const readings = p.series.flatMap((s) =>
      Object.entries(s.values).map(([name, value]) => {
        const unit = unitByName.get(name);
        if (!unit) throw new Error(`Seed: series value "${name}" on ${tag} has no instrument metadata`);
        return {
          equipmentTag: tag,
          plantCode: p.plantCode,
          timestamp: parseSourceDate(s.timestamp),
          parameter: name,
          value,
          unit,
          kpiCategory: kpiByName.get(name)!,
        };
      }),
    );
    for (let i = 0; i < readings.length; i += 2000) {
      await prisma.productionReading.createMany({ data: readings.slice(i, i + 2000) });
    }
    await prisma.runStatus.createMany({
      data: p.series.map((s) => ({ equipmentTag: tag, timestamp: parseSourceDate(s.timestamp), status: s.runStatus })),
    });
  }

  await logLoad(prisma, startedAt);
  const dq = await runDataQualityChecks(prisma);

  await report(incidents, rcas, equipmentPerf, production, Date.now() - t0);

  console.log("\n── Data-quality issues (PRD §6.5) — persisted as DataQualityIssue rows ──");
  for (const d of DQ_CATALOG) {
    console.log(`${d.code.padEnd(6)} ${String(dq.totals[d.code] ?? 0).padStart(4)}  ${d.title}  [PRD: ${d.prdScale}]`);
  }
  console.log("── Computed incident flags vs flags already in incidents.json ──");
  for (const c of dq.sourceFlagCrossCheck) {
    console.log(`${c.agree ? "✔" : "✘"} ${c.code} ${c.flag.padEnd(24)} computed=${c.computed} inFile=${c.inSourceFile}`);
    if (!c.agree) process.exitCode = 1;
  }
}

// ── Count check vs PRD §14 + cross-source reconciliation (§6.5) ───────────
async function report(
  incidents: IncidentRecord[],
  rcas: RcaRecord[],
  equipmentPerf: EquipmentPerformanceRecord[],
  production: ProductionRecord[],
  ms: number,
) {
  const counts = {
    plants: await prisma.plant.count(),
    plantsNamed: await prisma.plant.count({ where: { name: { not: null } } }),
    equipment: await prisma.equipment.count(),
    focusEquipment: await prisma.equipment.count({ where: { isFocus: true } }),
    conditionReadings: await prisma.conditionReading.count(),
    incidents: await prisma.incident.count(),
    incidentsLinkedToRca: await prisma.incident.count({ where: { rcaId: { not: null } } }),
    productionInstruments: await prisma.productionInstrument.count(),
    productionReadings: await prisma.productionReading.count(),
    runStatus: await prisma.runStatus.count(),
    rcaReports: await prisma.rcaReport.count(),
    rcaVerifications: await prisma.rcaVerification.count(),
    capaActionsAllKinds: await prisma.capaAction.count(),
    pmSchedules: await prisma.pmSchedule.count(),
    trackedActions: await prisma.action.count(),
    trackedImportedCapa: await prisma.action.count({ where: { createdBy: ActionCreatedBy.imported_capa } }),
  };

  const actions = await prisma.action.findMany();
  const closed = actions.filter((a) => a.status === ActionStatus.done).length;
  const pastPlan = actions.filter((a) => a.status !== ActionStatus.done && a.dueDate && a.dueDate < AS_OF_DATE).length;

  const agg = await prisma.incident.aggregate({ _sum: { downtimeHours: true, totalLossKUSD: true } });
  const overdue = await prisma.incident.count({ where: { rcaOverdue: true } });

  const checks: [string, number | string, number | string][] = [
    ["Incidents (§14)", counts.incidents, 380],
    ["Hourly rows: 5 × 720 (timestamps per asset)", counts.runStatus, 5 * 720],
    ["Hourly numeric values: 5 × 720 × 6", counts.productionReadings, 5 * 720 * 6],
    ["RCA reports (§14)", counts.rcaReports, 5],
    ["CAPA tracked actions (§14, §9.3)", counts.trackedImportedCapa, 20],
    ["  of which closed (§9.3)", closed, 1],
    ["  of which past plan date as of 2026-10-03 (§9.3)", pastPlan, 18],
    ["Weekly readings: 5 × 26 (§14)", counts.conditionReadings, 5 * 26],
    ["Focus equipment", counts.focusEquipment, 5],
    ["Plants (12 codes)", counts.plants, 12],
    ["Plants with a known name (4)", counts.plantsNamed, 4],
    ["Incident downtime total (h)", round(agg._sum.downtimeHours ?? 0, 1), 2261.1],
    ["Incident total loss (k USD)", round(agg._sum.totalLossKUSD ?? 0, 1), 67194.4],
    ["Incidents with RCA overdue", overdue, 183],
    ["RCA 4P + 4M+1E rows: 5 × 9", counts.rcaVerifications, 45],
    ["Incidents linked to an RCA report", counts.incidentsLinkedToRca, 5],
  ];

  console.log("\n══════════ Seed summary ══════════");
  console.table(counts);
  console.log("── Count check vs PRD ──");
  let failed = 0;
  for (const [label, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) failed++;
    console.log(`${ok ? "✔" : "✘"} ${label.padEnd(52)} actual=${actual}  expected=${expected}`);
  }

  // Cross-source reconciliation for the 5 focus assets (§6.5 closing paragraph).
  console.log("\n── Focus-asset reconciliation (Incident ↔ RCA ↔ Equipment Perf ↔ Production) ──");
  for (const r of rcas) {
    const tag = canonicalTag(r.equipmentTag);
    const inc = incidents.find((i) => i.arNo === r.rcaId && canonicalTag(i.equipmentTag) === tag);
    const ep = equipmentPerf.find((e) => canonicalTag(e.equipmentTag) === tag);
    const pr = production.find((p) => canonicalTag(p.equipmentTag) === tag);
    const row = {
      tag,
      ar: inc?.arNo === r.rcaId && ep?.linkedRcaNo === r.rcaId,
      plant: inc && ep ? extractPlantCode(inc.plant) === r.plantCode && extractPlantCode(ep.plantUnit) === r.plantCode : false,
      date: inc?.dateOfOccurrence === r.dateOccurrence && ep?.failureDate === r.dateOccurrence,
      downtime: inc?.downtimeHours === r.downtimeHours && ep?.performanceSummary["Total Downtime (hours)"] === r.downtimeHours,
      actualLoss: inc?.actualLossKUSD === r.estimatedLossKUSD && ep?.performanceSummary["Estimated Loss (k USD)"] === r.estimatedLossKUSD,
      class: inc?.equipmentClass === r.equipmentClass && ep?.equipmentClass === r.equipmentClass,
      offHoursVsDowntime: pr ? `${pr.derived.offlineHours} vs ${r.downtimeHours}` : "—",
      offWithin1h: pr ? Math.abs(pr.derived.offlineHours - r.downtimeHours) <= 1 : false,
    };
    console.log(JSON.stringify(row));
  }

  console.log(`\nSeeded in ${(ms / 1000).toFixed(1)} s.`);
  if (failed) {
    console.error(`\n✘ ${failed} count check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("✔ All count checks match the PRD.");
  }
}

function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
