// The 4 governed sources (PRD §6.2) and their ingestion log (FR-1.3).

import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { runDataQualityChecks } from "./dq";

export const MOCK_DATA_DIR = path.join(process.cwd(), "mock-data");

export interface SourceDef {
  key: "equipment" | "incident" | "production" | "rca";
  name: string;
  file: string;
  origin: string; // original system / file family per §6.2 source inventory
  grain: string;
  /** Records in the source file, counted the same way the DB rows are counted. */
  countInFile: (json: unknown) => number;
  /** Live DB count of the primary unified table for this source. */
  countInDb: (prisma: PrismaClient) => Promise<number>;
  dbLabel: string;
}

export const SOURCES: SourceDef[] = [
  {
    key: "equipment",
    name: "Equipment Performance",
    file: "equipment_performance.json",
    origin: "5 RCA-case workbooks (Equipment Info / Condition History / Performance Summary)",
    grain: "weekly reading per asset",
    countInFile: (j) => (j as { conditionHistory: unknown[] }[]).reduce((n, e) => n + e.conditionHistory.length, 0),
    countInDb: (p) => p.conditionReading.count(),
    dbLabel: "weekly condition readings",
  },
  {
    key: "incident",
    name: "Incident Database",
    file: "incidents.json",
    origin: "Incident Database.xlsx (Equipment Related Risk register)",
    grain: "one row per risk case",
    countInFile: (j) => (j as unknown[]).length,
    countInDb: (p) => p.incident.count(),
    dbLabel: "incidents",
  },
  {
    key: "production",
    name: "Production Data",
    file: "production.json",
    origin: "Production Data – RCA{1..5} <TAG>.xlsx (PI Tag + hourly series)",
    grain: "hourly PI-tag value",
    countInFile: (j) => (j as { series: { values: object }[] }[]).reduce((n, p) => n + p.series.reduce((m, s) => m + Object.keys(s.values).length, 0), 0),
    countInDb: (p) => p.productionReading.count(),
    dbLabel: "hourly values",
  },
  {
    key: "rca",
    name: "RCA & Downtime",
    file: "rca_downtime.json",
    origin: "RCA{1..5} – <title>.pptx (Abnormality Report — RCA & CAPA/PAA)",
    grain: "one report per failure",
    countInFile: (j) => (j as unknown[]).length,
    countInDb: (p) => p.rcaReport.count(),
    dbLabel: "RCA reports",
  },
];

export function fingerprint(file: string) {
  const full = path.join(MOCK_DATA_DIR, file);
  const buf = readFileSync(full);
  return {
    bytes: statSync(full).size,
    sha256: createHash("sha256").update(buf).digest("hex"),
    json: JSON.parse(buf.toString("utf-8")) as unknown,
  };
}

/** Called by the seed after a full load. */
export async function logLoad(prisma: PrismaClient, startedAt: Date) {
  for (const s of SOURCES) {
    const fp = fingerprint(s.file);
    await prisma.ingestRun.create({
      data: {
        source: s.name,
        file: s.file,
        kind: "load",
        status: "ok",
        recordCount: await s.countInDb(prisma),
        fileBytes: fp.bytes,
        sha256: fp.sha256,
        startedAt,
        finishedAt: new Date(),
      },
    });
  }
}

/** POST /api/ingest — re-reads every source file, verifies it against the loaded data and re-runs DQ rules.
 *  Does not reload rows (that would discard tracked actions); `npm run db:reset` does a full reload. */
export async function revalidateSources(prisma: PrismaClient) {
  const results = [];
  for (const s of SOURCES) {
    const startedAt = new Date();
    try {
      const fp = fingerprint(s.file);
      const lastLoad = await prisma.ingestRun.findFirst({ where: { source: s.name, kind: "load" }, orderBy: { finishedAt: "desc" } });
      const inFile = s.countInFile(fp.json);
      const inDb = await s.countInDb(prisma);
      const changed = lastLoad ? lastLoad.sha256 !== fp.sha256 : true;
      const status = changed || inFile !== inDb ? "changed" : "ok";
      const note =
        status === "ok"
          ? `File unchanged since last load; ${inDb} ${s.dbLabel} in DB match the file.`
          : `${changed ? "File content differs from last load. " : ""}File has ${inFile} ${s.dbLabel}, DB has ${inDb}. Run "npm run db:reset" to reload.`;
      results.push(
        await prisma.ingestRun.create({
          data: { source: s.name, file: s.file, kind: "revalidate", status, recordCount: inDb, fileBytes: fp.bytes, sha256: fp.sha256, note, startedAt, finishedAt: new Date() },
        }),
      );
    } catch (e) {
      results.push(
        await prisma.ingestRun.create({
          data: { source: s.name, file: s.file, kind: "revalidate", status: "failed", recordCount: 0, fileBytes: 0, sha256: "", note: String(e), startedAt, finishedAt: new Date() },
        }),
      );
    }
  }
  const dq = await runDataQualityChecks(prisma);
  return { runs: results, dq };
}
