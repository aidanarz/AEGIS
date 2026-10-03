// FR-3.7 — similar-case retrieval over the RCA corpus.
// Score = equipment-type similarity + discipline + failure signature (the detector's primary-signal role and
// direction on that case's own hourly data). Leave-one-out: the target's own report is never a candidate.
// The RCA corpus is treated as a knowledge base (not time-cut): with only 5 reports, a strict "prior reports only"
// rule would leave the earliest case with nothing. This is disclosed in the UI.

import type { PrismaClient } from "@prisma/client";
import { runDetector } from "@/lib/detect/run";

export interface Signature {
  role: string | null; // primary PI role (vibration / temperature / feed_rate …)
  direction: "up" | "down" | null;
}

export interface SimilarCase {
  rcaId: string;
  equipmentTag: string;
  equipmentType: string | null;
  score: number;
  basis: string;
  verifiedRootCause: string;
  ngFindings: { id: string; method: string; factor: string; evidence: string }[];
}

const tokens = (s: string | null | undefined) => new Set((s ?? "").toLowerCase().split(/[^a-z]+/).filter((t) => t.length > 2));
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / (a.size + b.size - inter);
};

export async function signatureFor(prisma: PrismaClient, tag: string): Promise<Signature> {
  const det = await runDetector(prisma, tag);
  if (!det) return { role: null, direction: null };
  const ins = await prisma.productionInstrument.findFirst({ where: { equipmentTag: tag, name: det.primary.signal } });
  return { role: ins?.parameter ?? null, direction: det.primary.sustainedZ >= 0 ? "up" : "down" };
}

export async function findSimilarCases(
  prisma: PrismaClient,
  target: { tag: string; typeName: string | null; typeCode: string | null; discipline: string | null; signature: Signature | null },
  limit = 3,
): Promise<SimilarCase[]> {
  const reports = await prisma.rcaReport.findMany({
    where: { equipmentTag: { not: target.tag } }, // never the target's own report
    include: { equipment: true, verifications: true, incidents: { select: { equipmentType: true } } },
  });

  const scored = await Promise.all(
    reports.map(async (r) => {
      const typeName = r.equipment.equipmentTypeName;
      const typeCode = r.incidents[0]?.equipmentType ?? r.equipment.equipmentTypeCode;
      const typeSim = Math.max(jaccard(tokens(target.typeName), tokens(typeName)), target.typeCode && typeCode === target.typeCode ? 1 : 0);
      const discSim = target.discipline && target.discipline === r.discipline ? 1 : 0;
      let sigSim = 0;
      let sigNote = "";
      if (target.signature?.role) {
        const s = await signatureFor(prisma, r.equipmentTag);
        sigSim = (s.role === target.signature.role ? 0.6 : 0) + (s.role === target.signature.role && s.direction === target.signature.direction ? 0.4 : 0);
        sigNote = `signature ${s.role ?? "?"} ${s.direction === "up" ? "↑" : s.direction === "down" ? "↓" : "?"}`;
      }
      const weights = target.signature?.role ? { type: 0.4, disc: 0.2, sig: 0.4 } : { type: 0.7, disc: 0.3, sig: 0 };
      const score = Math.round((weights.type * typeSim + weights.disc * discSim + weights.sig * sigSim) * 100) / 100;
      const basis = [
        `type "${typeName ?? typeCode}" sim ${typeSim.toFixed(2)}`,
        `discipline ${r.discipline}${discSim ? " (same)" : ""}`,
        target.signature?.role ? `${sigNote} sim ${sigSim.toFixed(2)}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        rcaId: r.rcaId,
        equipmentTag: r.equipmentTag,
        equipmentType: typeName,
        score,
        basis,
        // §8.3: verifiedRootCause + 4P/4M+1E NG items only
        verifiedRootCause: r.verifiedRootCause,
        ngFindings: r.verifications
          .filter((v) => v.result === "NG")
          .map((v) => ({ id: `${r.rcaId}:${v.ref}`, method: v.method, factor: v.parameterOrFactor, evidence: v.evidence })),
      };
    }),
  );
  // Zero-score reports share nothing with the target — returning them would only pad the prompt.
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** FR-3.7 — aggregate incident stats for the same equipmentType (+ failureMechanism when known and allowed). */
export async function incidentPatternStats(
  prisma: PrismaClient,
  opts: { equipmentType: string | null; failureMechanism: string | null; cutoff: Date; excludeSerial?: number | null },
) {
  if (!opts.equipmentType) return null;
  const rows = await prisma.incident.findMany({
    where: {
      equipmentType: opts.equipmentType,
      dateOfOccurrence: { lte: opts.cutoff },
      ...(opts.excludeSerial ? { serialNo: { not: opts.excludeSerial } } : {}),
    },
    select: { failureMechanism: true, component: true, totalLossKUSD: true, statusNormalized: true },
  });
  const count = (key: (r: (typeof rows)[number]) => string) =>
    Object.entries(rows.reduce<Record<string, number>>((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {}))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, n]) => ({ value: k, incidents: n }));
  const sameMech = opts.failureMechanism ? rows.filter((r) => r.failureMechanism === opts.failureMechanism) : [];
  return {
    equipmentType: opts.equipmentType,
    incidentsOfThisType: rows.length,
    totalLossKUSD: Math.round(rows.reduce((a, r) => a + r.totalLossKUSD, 0) * 10) / 10,
    topFailureMechanisms: count((r) => r.failureMechanism),
    topComponents: count((r) => r.component),
    sameMechanism: opts.failureMechanism
      ? { failureMechanism: opts.failureMechanism, incidents: sameMech.length, totalLossKUSD: Math.round(sameMech.reduce((a, r) => a + r.totalLossKUSD, 0) * 10) / 10 }
      : null,
    note: `Incident DB rows of equipment type ${opts.equipmentType} dated on/before ${opts.cutoff.toISOString().slice(0, 10)}`,
  };
}
