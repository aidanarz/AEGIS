// PRD §6.7 — function coverage. The coverage LEVEL is the team decision recorded in the PRD;
// the EVIDENCE numbers are computed live from the database. No data is fabricated for any function.

import type { PrismaClient } from "@prisma/client";
import { FUNCTIONS, PIC_PREFIX_FUNCTION, type FunctionName } from "./normalize";

export type CoverageLevel = "connected" | "proxy" | "none";

export const COVERAGE_LABEL: Record<CoverageLevel, string> = {
  connected: "Connected",
  proxy: "Proxy",
  none: "Data source not in scope of this dataset",
};

export interface FunctionCoverage {
  fn: FunctionName;
  slug: string;
  level: CoverageLevel;
  summary: string; // one line under the tile title
  tooltip: string; // why this level — shown on the badge
  evidence: { label: string; value: number | string }[];
}

const LEVEL: Record<FunctionName, CoverageLevel> = {
  Production: "connected",
  Maintenance: "connected",
  Reliability: "connected",
  Energy: "proxy",
  HSE: "proxy",
  Warehouse: "none",
  Procurement: "none",
};

export const functionSlug = (fn: FunctionName) => fn.toLowerCase();
export const functionFromSlug = (slug: string) => FUNCTIONS.find((f) => functionSlug(f) === slug.toLowerCase()) ?? null;
export const picPrefixesFor = (fn: FunctionName) =>
  Object.entries(PIC_PREFIX_FUNCTION)
    .filter(([, f]) => f === fn)
    .map(([p]) => p);

export async function getFunctionCoverage(prisma: PrismaClient): Promise<FunctionCoverage[]> {
  const byFunction = await prisma.incident.groupBy({ by: ["ownerFunction"], _count: { _all: true } });
  const owned = (fn: FunctionName) => byFunction.find((b) => b.ownerFunction === fn)?._count._all ?? 0;

  const [productionDatasets, throughputTags, pmLines, conditionReadings, capaRows, ampTags, ampTemplateTags, highRisk, riskRows] = await Promise.all([
    prisma.productionDataset.count(),
    prisma.productionInstrument.count({ where: { kpiCategory: "throughput" } }),
    prisma.pmSchedule.count(),
    prisma.conditionReading.count(),
    prisma.capaAction.count(),
    prisma.productionInstrument.count({ where: { parameter: "motor_current" } }),
    prisma.dataQualityIssue.count({ where: { code: "DQ-7", recordId: { endsWith: "_AMP" } } }),
    prisma.incident.count({ where: { preRisk: { in: ["I", "II"] } } }),
    prisma.incident.count(),
  ]);

  const rows: Omit<FunctionCoverage, "slug" | "level">[] = [
    {
      fn: "Production",
      summary: "Throughput & run status (PI tags) + OPS-owned incidents",
      tooltip: "Direct: OPS- owner code in the Incident Database and hourly feed / plant-rate / run-status PI tags.",
      evidence: [
        { label: "Incidents owned (OPS-)", value: owned("Production") },
        { label: "Assets with hourly PI data", value: productionDatasets },
        { label: "Throughput tags", value: throughputTags },
      ],
    },
    {
      fn: "Maintenance",
      summary: "ROT / STA / ELE / INS owners + PM schedules",
      tooltip: "Direct: discipline owner codes ROT-, STA-, ELE-, INS- and PM schedules in the RCA decks.",
      evidence: [
        { label: "Incidents owned (ROT/STA/ELE/INS-)", value: owned("Maintenance") },
        { label: "PM schedule lines", value: pmLines },
      ],
    },
    {
      fn: "Reliability",
      summary: "REL-owned incidents, equipment condition, CAPA",
      tooltip: "Direct: REL- is the largest owner group; weekly equipment condition and RCA/CAPA data.",
      evidence: [
        { label: "Incidents owned (REL-)", value: owned("Reliability") },
        { label: "Weekly condition readings", value: conditionReadings },
        { label: "CAPA / PAA rows", value: capaRows },
      ],
    },
    {
      fn: "Energy",
      summary: "Motor ampere only — no energy consumption data",
      tooltip:
        "Proxy only: motor current (*_AMP) is the only energy-related signal. No power, steam, fuel or utility-consumption data is in the case files.",
      evidence: [
        { label: "Motor-current tags", value: ampTags },
        { label: "…of which template tags on static equipment (DQ-7)", value: ampTemplateTags },
      ],
    },
    {
      fn: "HSE",
      summary: "Risk exposure proxy — no injury / environmental data",
      tooltip:
        "Proxy only: pre-risk (I–IV) and risk score from the equipment-risk register. There are no injury, environmental or process-safety fields, so this is risk exposure, not HSE performance.",
      evidence: [
        { label: "Risk-register rows", value: riskRows },
        { label: "Pre-risk I / II", value: highRisk },
      ],
    },
    {
      fn: "Warehouse",
      summary: "Spare parts / stock not in the case files",
      tooltip: "No warehouse data (spare parts, stock levels) exists in the 4 case datasets. Candidate for a next integration wave.",
      evidence: [],
    },
    {
      fn: "Procurement",
      summary: "Purchase orders / lead times not in the case files",
      tooltip: "No procurement data (POs, supplier lead times) exists in the 4 case datasets. Candidate for a next integration wave.",
      evidence: [],
    },
  ];

  return rows.map((r) => ({ ...r, slug: functionSlug(r.fn), level: LEVEL[r.fn] }));
}
