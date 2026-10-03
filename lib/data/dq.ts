// Data-quality engine (PRD §6.5, FR-1.7). Every rule is computed from the database — nothing is
// hardcoded per record or per equipment type. Results are persisted as DataQualityIssue rows
// (one per affected entity) and are surfaced, never silently fixed.

import type { PrismaClient } from "@prisma/client";
import { DQ_BY_CODE } from "./dq-catalog";
import { fromJson } from "./json";
import { AS_OF_DATE, extractPlantCode } from "./normalize";
import type { MonitoredParameter } from "./source-types";
import { piRoleForLabel } from "./param-match";

/** PRD §6.2.2 failure-mechanism vocabulary. Anything outside it is a truncated / mis-split value (DQ-4). */
const MECHANISM_VOCABULARY = new Set([
  "Leakage", "High Vibration", "Worn Out", "Crack", "Fouling", "Error", "Loose",
  "Stuck", "Overheat", "Breakage", "Malfunction", "Low Performance",
]);

/** PI roles that are only meaningful on rotating / driven equipment (DQ-7). */
const ROTATING_ONLY_ROLES = new Set(["vibration", "motor_current"]);



type IssueInput = {
  code: string;
  entity: string;
  recordId: string;
  equipmentTag?: string | null;
  plantCode?: string | null;
  message: string;
  sourceSystem: string;
};

export interface DqRunResult {
  totals: Record<string, number>;
  sourceFlagCrossCheck: { flag: string; code: string; computed: number; inSourceFile: number; agree: boolean }[];
}

export async function runDataQualityChecks(prisma: PrismaClient): Promise<DqRunResult> {
  const issues: IssueInput[] = [];
  const push = (i: IssueInput) => issues.push(i);

  // ── Incident Database rules ──────────────────────────────────────────
  const incidents = await prisma.incident.findMany({ orderBy: { serialNo: "asc" } });
  const countBy = <K>(xs: K[]) => xs.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<K, number>());
  const arCounts = countBy(incidents.map((i) => i.arNo).filter(Boolean));
  const mtoCounts = countBy(incidents.map((i) => i.mtoNo));
  const tagCounts = countBy(incidents.map((i) => i.equipmentTag));

  for (const i of incidents) {
    const base = { entity: "Incident", recordId: String(i.serialNo), equipmentTag: i.equipmentTag, plantCode: i.plantCode, sourceSystem: i.sourceSystem };
    if (!i.arNo) push({ ...base, code: "DQ-1", message: `${i.incidentId} (${i.equipmentTag}) has no AR No. — no RCA report can be linked.` });
    if (i.arNo && (arCounts.get(i.arNo) ?? 0) > 1) {
      const others = incidents.filter((o) => o.arNo === i.arNo && o.serialNo !== i.serialNo).map((o) => `${o.incidentId} ${o.equipmentTag}`);
      push({ ...base, code: "DQ-2", message: `AR No. ${i.arNo} is also used by ${others.join(", ")}.` });
    }
    if ((mtoCounts.get(i.mtoNo) ?? 0) > 1) {
      const others = incidents.filter((o) => o.mtoNo === i.mtoNo && o.serialNo !== i.serialNo).map((o) => `${o.incidentId} ${o.equipmentTag}`);
      push({ ...base, code: "DQ-3", message: `MTO No. ${i.mtoNo} is also used by ${others.join(", ")}.` });
    }
    if (!MECHANISM_VOCABULARY.has(i.failureMechanism)) {
      push({ ...base, code: "DQ-4", message: `Failure mechanism "${i.failureMechanism}" is not a full mechanism; title says "${i.riskCaseTitle}", component "${i.component}".` });
    }
    if (!i.rcaDueDate) push({ ...base, code: "DQ-5", message: `${i.incidentId} has no RCA due date — overdue status cannot be evaluated.` });
    if (i.overallStatus !== i.statusNormalized) {
      push({ ...base, code: "DQ-11", message: `Source status "${i.overallStatus}" mapped to "${i.statusNormalized}".` });
    }
    if ((tagCounts.get(i.equipmentTag) ?? 0) > 1) {
      const others = incidents.filter((o) => o.equipmentTag === i.equipmentTag && o.serialNo !== i.serialNo).map((o) => `${o.incidentId} (${o.plantCode})`);
      push({ ...base, code: "DQ-13", message: `Tag ${i.equipmentTag} (${i.plantCode}) also appears on ${others.join(", ")}.` });
    }
  }

  // ── Production Data rules ────────────────────────────────────────────
  const instruments = await prisma.productionInstrument.findMany({ include: { equipment: true } });
  const ranges = await prisma.productionReading.groupBy({
    by: ["equipmentTag", "parameter"],
    _min: { value: true },
    _max: { value: true },
  });
  const rangeOf = (tag: string, name: string) => ranges.find((r) => r.equipmentTag === tag && r.parameter === name);
  const normUnit = (u: string) => u.toLowerCase().replace(/\s*\(.*\)\s*/g, "").replace(/[^a-z/]/g, "");

  for (const ins of instruments) {
    const base = { entity: "ProductionInstrument", recordId: `${ins.equipmentTag}:${ins.name}`, equipmentTag: ins.equipmentTag, plantCode: ins.plantCode, sourceSystem: ins.sourceSystem };
    if (ins.digitalSet) continue; // RUN_STATUS has no numeric series
    const r = rangeOf(ins.equipmentTag, ins.name);
    const unitDiffers = normUnit(ins.engUnits) !== normUnit(ins.engUnitsObserved);
    const outOfSpan = r && (r._max.value! > ins.zero + ins.span || r._min.value! < ins.zero);
    if (unitDiffers || outOfSpan) {
      const parts = [];
      if (unitDiffers) parts.push(`declared unit ${ins.engUnits} but observed ${ins.engUnitsObserved}`);
      if (outOfSpan && r) parts.push(`observed range ${r._min.value!.toFixed(2)}–${r._max.value!.toFixed(2)} exceeds declared span ${ins.zero}–${ins.zero + ins.span}`);
      push({ ...base, code: "DQ-6", message: `${ins.name}: ${parts.join("; ")}.${ins.dataQualityNote ? ` Source note: ${ins.dataQualityNote}.` : ""}` });
    }
    if (ins.equipment.discipline === "STA" && ROTATING_ONLY_ROLES.has(ins.parameter)) {
      push({ ...base, code: "DQ-7", message: `${ins.name} (${ins.parameter}) is a template tag on static equipment ${ins.equipmentTag} (${ins.equipment.equipmentTypeName ?? ins.equipment.equipmentTypeCode}).` });
    }
  }

  // ── Cross-source rules (focus assets) ────────────────────────────────
  const focus = await prisma.equipment.findMany({ where: { isFocus: true }, include: { instruments: true, rcaReports: true } });
  for (const eq of focus) {
    const piRoles = new Set(eq.instruments.map((i) => i.parameter));
    for (const p of fromJson<MonitoredParameter[]>(eq.monitoredParametersJson, [])) {
      const role = piRoleForLabel(p.parameter);
      if (!role || !piRoles.has(role)) {
        push({
          code: "DQ-8",
          entity: "Equipment",
          recordId: `${eq.tag}:${p.parameter}`,
          equipmentTag: eq.tag,
          plantCode: eq.plantCode,
          sourceSystem: eq.sourceSystem,
          message: `"${p.parameter}" is monitored weekly (Equipment Performance) but has no hourly PI tag.`,
        });
      }
    }

    const off = await prisma.runStatus.count({ where: { equipmentTag: eq.tag, status: "OFF" } });
    for (const rca of eq.rcaReports) {
      if (off !== rca.downtimeHours) {
        push({
          code: "DQ-9",
          entity: "ProductionDataset",
          recordId: eq.tag,
          equipmentTag: eq.tag,
          plantCode: eq.plantCode,
          sourceSystem: "Production Data (PI Tag)",
          message: `RUN_STATUS OFF = ${off} h vs reported downtime ${rca.downtimeHours} h (${rca.rcaId}); difference ${Math.abs(off - rca.downtimeHours)} h${Math.abs(off - rca.downtimeHours) <= 1 ? " — within ±1 h" : " — EXCEEDS ±1 h"}.`,
        });
      }
    }
  }

  const plants = await prisma.plant.findMany();
  for (const p of plants) {
    const aliases = fromJson<string[]>(p.aliasesJson, []);
    const names = new Set(
      aliases.map((a) => {
        const inner = /\(([^)]+)\)/.exec(a)?.[1]?.trim();
        const outer = a.replace(/\([^)]*\)/, "").trim();
        // "Resin Plant (ARP)" → "Resin Plant"; "ARP  (Aurora Resin Plant)" → "Aurora Resin Plant"
        return inner && inner !== extractPlantCode(a) ? inner : outer;
      }),
    );
    if (names.size > 1) {
      push({
        code: "DQ-10",
        entity: "Plant",
        recordId: p.code,
        plantCode: p.code,
        sourceSystem: "Equipment Performance vs RCA & Downtime",
        message: `Plant ${p.code} is spelled ${aliases.map((a) => `"${a}"`).join(" vs ")}; canonical name ${p.name ? `"${p.name}" (RCA deck)` : "unknown"}.`,
      });
    }
  }

  // ── RCA / CAPA rules ─────────────────────────────────────────────────
  const capa = await prisma.capaAction.findMany({ where: { kind: { in: ["corrective", "proactive"] } } });
  for (const c of capa) {
    if (c.sourceStatus !== "Closed" && c.planDate && c.planDate < AS_OF_DATE) {
      push({
        code: "DQ-12",
        entity: "CapaAction",
        recordId: String(c.id),
        plantCode: c.plantCode,
        sourceSystem: "RCA & Downtime Data (RCA pptx)",
        message: `${c.rcaId} ${c.kind} ${c.ref ?? ""}: status "${c.sourceStatus}" with plan date ${c.planDate.toISOString().slice(0, 10)} — overdue per source snapshot (snapshot date unknown).`,
      });
    }
  }

  // ── Persist (replace previous run) ───────────────────────────────────
  await prisma.dataQualityIssue.deleteMany();
  await prisma.dataQualityIssue.createMany({
    data: issues.map((i) => {
      const def = DQ_BY_CODE[i.code];
      return {
        code: i.code,
        flag: def.flag,
        entity: i.entity,
        recordId: i.recordId,
        equipmentTag: i.equipmentTag ?? null,
        plantCode: i.plantCode ?? null,
        severity: def.severity,
        message: i.message,
        handling: def.handling,
        sourceSystem: i.sourceSystem,
      };
    }),
  });

  const totals: Record<string, number> = {};
  for (const i of issues) totals[i.code] = (totals[i.code] ?? 0) + 1;

  // Cross-check computed incident flags against the flags the source file already carries.
  const fileFlagCount = (flag: string) => incidents.filter((i) => fromJson<string[]>(i.dataQualityFlagsJson, []).includes(flag)).length;
  const sourceFlagCrossCheck = ["DQ-1", "DQ-2", "DQ-3", "DQ-4", "DQ-13"].map((code) => {
    const flag = DQ_BY_CODE[code].flag;
    const computed = totals[code] ?? 0;
    const inSourceFile = fileFlagCount(flag);
    return { flag, code, computed, inSourceFile, agree: computed === inSourceFile };
  });

  return { totals, sourceFlagCrossCheck };
}
