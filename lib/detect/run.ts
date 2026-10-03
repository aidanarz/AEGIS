// Loads an asset's hourly PI series from the DB and runs the detector on every numeric instrument.

import type { PrismaClient } from "@prisma/client";
import { detect, type DetectorResult, type HourlyPoint } from "./baseline-detector";

export async function loadHourlySeries(prisma: PrismaClient, tag: string): Promise<{ series: HourlyPoint[]; signals: string[] }> {
  const [readings, status, instruments] = await Promise.all([
    prisma.productionReading.findMany({ where: { equipmentTag: tag }, orderBy: { timestamp: "asc" }, select: { timestamp: true, parameter: true, value: true } }),
    prisma.runStatus.findMany({ where: { equipmentTag: tag }, orderBy: { timestamp: "asc" } }),
    prisma.productionInstrument.findMany({ where: { equipmentTag: tag, digitalSet: null }, select: { name: true } }),
  ]);
  const byTs = new Map<string, HourlyPoint>();
  for (const s of status) byTs.set(s.timestamp.toISOString(), { timestamp: s.timestamp.toISOString(), values: {}, runStatus: s.status as "ON" | "OFF" });
  for (const r of readings) byTs.get(r.timestamp.toISOString())!.values[r.parameter] = r.value;
  return { series: [...byTs.values()], signals: instruments.map((i) => i.name) };
}

export async function runDetector(prisma: PrismaClient, tag: string): Promise<DetectorResult | null> {
  const { series, signals } = await loadHourlySeries(prisma, tag);
  if (!series.length || !signals.length) return null;
  return detect(series, signals);
}

/** Validates the detector against the lead times measured in PRD §6.6 (FR-3.1(b): ±2 h). */
export const PRD_EXPECTED_LEAD_TIMES: Record<string, number> = {
  "PU-2101B": 30,
  "KO-3201": 45,
  "PM-4405B": 33,
  "HE-3301": 27,
  "BL-5702": 39,
};
export const LEAD_TIME_TOLERANCE_H = 2;

export async function validateDetector(prisma: PrismaClient) {
  const tags = (await prisma.productionDataset.findMany({ select: { equipmentTag: true }, orderBy: { equipmentTag: "asc" } })).map((d) => d.equipmentTag);
  const rows = [];
  for (const tag of tags) {
    const r = await runDetector(prisma, tag);
    const expected = PRD_EXPECTED_LEAD_TIMES[tag] ?? null;
    const actual = r?.leadTimeHours ?? null;
    rows.push({
      tag,
      primarySignal: r?.primary.signal ?? "—",
      runnerUp: r?.runnerUp ? `${r.runnerUp.signal} (${r.runnerUp.sustainedZ.toFixed(1)}σ)` : "—",
      sustainedZ: r ? Number(r.primary.sustainedZ.toFixed(1)) : null,
      firstFlag: r?.primary.firstFlagAt?.slice(0, 16) ?? "—",
      trip: r?.tripAt?.slice(0, 16) ?? "—",
      expectedLeadH: expected,
      actualLeadH: actual,
      deltaH: expected != null && actual != null ? actual - expected : null,
      pass: expected != null && actual != null && Math.abs(actual - expected) <= LEAD_TIME_TOLERANCE_H,
      severity: r?.severity ?? "—",
      peakZ: r?.peakSustainedZ ?? null,
      strays: r?.primary.strayExceedances ?? null,
    });
  }
  return rows;
}
