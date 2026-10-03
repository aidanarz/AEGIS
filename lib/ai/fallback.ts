// FR-3.5 — deterministic rule-based fallback (no API key). Rules live in fallback-rules.json (PRD §8.5).
// Exact-tag rules are skipped in leave-one-out mode: they ARE the verified answer.

import rules from "./fallback-rules.json";
import type { BuiltContext, Facts, SignalFact } from "./context";
import type { RootCauseResponse } from "./schema";
import { compareConcepts } from "./concepts";
import { piRoleForLabel } from "@/lib/data/param-match";
import type { FunctionName } from "@/lib/data/normalize";

type Generic = (typeof rules.generic)[number] & {
  when: {
    primaryRole?: string;
    primaryDirection?: "up" | "down";
    flatRoles?: string[];
    disciplines?: string[];
    motorDriven?: boolean;
    monitoredParameterMatches?: string;
    equipmentTypeMatches?: string;
    deviatingRoles?: { role: string; direction: "up" | "down" }[];
    weeklyTrendBonus?: { parameterMatches: string; direction: "up" | "down" };
  };
  whenIncident?: { mechanisms: string[]; typeCodes: string[]; componentMatches?: string };
};

const SIGMA = 3;
const DUE_DAYS: Record<string, number> = { critical: 3, high: 7, medium: 14, low: 30 };

const sig = (s: SignalFact) => `${s.signal}@${s.firstFlagAt ?? "baseline"}`;
const fmtZ = (z: number) => `${z >= 0 ? "+" : ""}${z.toFixed(1)}σ`;
const dir = (z: number) => (z >= 0 ? "up" : "down");

interface Candidate {
  ruleId: string;
  cause: string;
  confidence: number;
  evidence: string[];
  action: { title: string; description: string };
  ownerFunction: FunctionName;
  ownerCode: string | null;
  ownerBasis: string;
  dataGaps: string[];
}

function weeklyEvidence(f: Facts, role: string): string | null {
  const p = f.monitoredParameters.find((m) => piRoleForLabel(m.parameter) === role);
  const last = f.weekly[f.weekly.length - 1];
  if (!p || !last || last.readings[p.parameter] == null) return null;
  return `${f.tag}#w${last.week}: ${p.parameter} = ${last.readings[p.parameter]} (alarm ${p.alarm}, trip ${p.trip}; health ${last.healthStatus})`;
}

function weeklyTrend(f: Facts, re: RegExp): { label: string; first: number; last: number } | null {
  const p = f.monitoredParameters.find((m) => re.test(m.parameter));
  if (!p || f.weekly.length < 2) return null;
  const first = f.weekly[0].readings[p.parameter];
  const last = f.weekly[f.weekly.length - 1].readings[p.parameter];
  return first == null || last == null ? null : { label: p.parameter, first, last };
}

function ownerFor(f: Facts, fn: FunctionName, prefix: string | null): { code: string | null; basis: string } {
  if (f.subjectPicRca && f.subjectPicRca.startsWith(`${prefix}-`)) return { code: f.subjectPicRca, basis: "the incident's own PIC" };
  const list = (f.ownerCodesByFunction[fn] ?? []).filter((o) => !prefix || o.code.startsWith(`${prefix}-`));
  if (list[0]) return { code: list[0].code, basis: `most frequent ${prefix ?? fn} owner in ${f.plantCode} (${list[0].incidents} incidents)` };
  return { code: null, basis: `no ${prefix ?? fn} owner code found in ${f.plantCode}` };
}

function evaluateSignalRule(r: Generic, f: Facts): { n: number; evidence: string[] } | null {
  const w = r.when;
  const ev: string[] = [];
  let n = 0;
  const health = f.signals.filter((s) => !s.templateTag);
  if (w.primaryRole) {
    const p = f.primary;
    if (!p || p.role !== w.primaryRole || Math.abs(p.sustainedZ) <= SIGMA) return null;
    if (w.primaryDirection && dir(p.sustainedZ) !== w.primaryDirection) return null;
    ev.push(`${sig(p)}: ${p.signal} (${p.role}) sustained ${fmtZ(p.sustainedZ)} vs baseline ${p.baselineMean} ± ${p.baselineStd} ${p.unit}`);
    const wk = weeklyEvidence(f, p.role);
    if (wk) ev.push(wk);
    n += 2;
  }
  if (w.deviatingRoles) {
    for (const d of w.deviatingRoles) {
      const s = health.find((x) => x.role === d.role && Math.abs(x.sustainedZ) > SIGMA && dir(x.sustainedZ) === d.direction);
      if (!s) return null;
      ev.push(`${sig(s)}: ${s.signal} (${s.role}) sustained ${fmtZ(s.sustainedZ)}`);
      const wk = weeklyEvidence(f, s.role);
      if (wk) ev.push(wk);
      n += 1;
    }
  }
  if (w.flatRoles) {
    for (const role of w.flatRoles) {
      const s = health.filter((x) => x.role === role);
      if (!s.length || s.some((x) => Math.abs(x.sustainedZ) >= SIGMA)) return null;
      ev.push(`${s.map((x) => `${x.signal} ${fmtZ(x.sustainedZ)}`).join(", ")}: ${role} within ±3σ (flat)`);
      n += 1;
    }
  }
  if (w.disciplines) {
    if (!f.discipline || !w.disciplines.includes(f.discipline)) return null;
    ev.push(`discipline ${f.discipline} (rotating / electrical)`);
    n += 1;
  }
  if (w.motorDriven) {
    const amp = health.find((x) => x.role === "motor_current");
    if (!amp && !/motor/i.test(f.typeName ?? "")) return null;
    ev.push(`motor-driven: ${amp ? `${amp.signal} present` : f.typeName}`);
    n += 1;
  }
  if (w.monitoredParameterMatches) {
    const re = new RegExp(w.monitoredParameterMatches, "i");
    const p = f.monitoredParameters.filter((m) => re.test(m.parameter));
    if (!p.length) return null;
    const t = weeklyTrend(f, re);
    ev.push(`monitored: ${p.map((x) => x.parameter).join(", ")}${t ? ` — weekly ${t.label} ${t.first} → ${t.last}` : ""}`);
    n += 1;
  }
  if (w.equipmentTypeMatches) {
    if (!new RegExp(w.equipmentTypeMatches, "i").test(f.typeName ?? "")) return null;
    ev.push(`equipment type: ${f.typeName}`);
    n += 1;
  }
  if (w.weeklyTrendBonus) {
    const t = weeklyTrend(f, new RegExp(w.weeklyTrendBonus.parameterMatches, "i"));
    if (t && (w.weeklyTrendBonus.direction === "up" ? t.last > t.first * 1.1 : t.last < t.first * 0.9)) {
      ev.push(`weekly ${t.label} ${t.first} → ${t.last} (${w.weeklyTrendBonus.direction === "up" ? "rising" : "falling"})`);
      n += 1;
    }
  }
  return { n, evidence: ev };
}

function evaluateIncidentRule(r: Generic, f: Facts): { n: number; evidence: string[] } | null {
  const w = r.whenIncident;
  if (!w || !f.incidentMechanism || !f.typeCode) return null;
  if (!w.mechanisms.includes(f.incidentMechanism) || !w.typeCodes.includes(f.typeCode)) return null;
  const ev = [`incident failure mechanism "${f.incidentMechanism}" on equipment type ${f.typeCode}`];
  let n = 2;
  if (w.componentMatches) {
    if (!f.incidentComponent || !new RegExp(w.componentMatches, "i").test(f.incidentComponent)) return null;
    ev.push(`component "${f.incidentComponent}"`);
    n += 1;
  }
  return { n, evidence: ev };
}

export function runFallback(built: BuiltContext): { response: RootCauseResponse; note: string } {
  const f = built.facts;
  const loo = built.meta.mode === "leave-one-out";
  const candidates: Candidate[] = [];

  // 1) exact equipmentTag rule (live mode only)
  const exact = loo ? undefined : rules.exact.find((e) => e.equipmentTag === f.tag);
  if (exact) {
    candidates.push({
      ruleId: `exact:${exact.equipmentTag}`,
      cause: exact.rootCause,
      confidence: 0.85,
      evidence: [
        `${exact.sourceRcaId}: verified root cause of this asset's RCA (rule-base knowledge, PRD §8.5)`,
        ...(f.primary ? [`${sig(f.primary)}: ${f.primary.signal} sustained ${fmtZ(f.primary.sustainedZ)}`] : []),
      ],
      action: exact.action,
      ownerFunction: exact.owner.function as FunctionName,
      ownerCode: exact.owner.code,
      ownerBasis: `RCA ${exact.sourceRcaId} owner`,
      dataGaps: exact.dataGaps,
    });
  }

  // 2) generic pattern rules
  for (const r of rules.generic as Generic[]) {
    const hit = evaluateSignalRule(r, f) ?? evaluateIncidentRule(r, f);
    if (!hit) continue;
    const similarSupport = built.meta.similarCases.filter((s) => compareConcepts(r.rootCause, s.verifiedRootCause).verdict === "match");
    const owner = ownerFor(f, r.ownerFunction as FunctionName, r.ownerPrefix);
    candidates.push({
      ruleId: r.id,
      cause: r.rootCause,
      // Deterministic: more satisfied conditions → higher confidence; capped well below certainty.
      confidence: Math.min(0.7, 0.25 + 0.08 * hit.n + 0.05 * similarSupport.length) * (exact ? 0.5 : 1),
      evidence: [`rule ${r.id} — ${r.pattern}`, ...hit.evidence, ...similarSupport.map((s) => `${s.rcaId}: similar case with the same mechanism (${s.equipmentTag})`)],
      action: r.action,
      ownerFunction: r.ownerFunction as FunctionName,
      ownerCode: owner.code,
      ownerBasis: owner.basis,
      dataGaps: r.dataGaps,
    });
  }

  // 3) nothing matched → default
  if (!candidates.length) {
    const d = rules.default;
    const owner = ownerFor(f, d.ownerFunction as FunctionName, d.ownerPrefix);
    candidates.push({
      ruleId: "default",
      cause: d.rootCause,
      confidence: 0.2,
      evidence: [
        f.primary ? `${sig(f.primary)}: strongest deviation ${f.primary.signal} ${fmtZ(f.primary.sustainedZ)} matched no pattern` : "no hourly condition data for this asset",
        ...(f.incidentMechanism ? [`incident mechanism "${f.incidentMechanism}" on type ${f.typeCode} matched no pattern`] : []),
      ],
      action: d.action,
      ownerFunction: d.ownerFunction as FunctionName,
      ownerCode: owner.code,
      ownerBasis: owner.basis,
      dataGaps: d.dataGaps,
    });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0];
  const base = new Date(Math.max(Date.now(), Date.parse(built.meta.cutoff)));
  const due = new Date(base.getTime() + (DUE_DAYS[f.severity] ?? 14) * 86_400_000);

  const dataGaps = [
    ...new Set([
      ...top.dataGaps,
      ...f.weeklyOnlyParameters.map((p) => `${p} — monitored weekly only, not in the hourly PI tags (DQ-8)`),
      ...(f.signals.length ? [] : ["Hourly PI data for this asset at the alert time"]),
    ]),
  ];

  return {
    response: {
      rootCauses: candidates.slice(0, 4).map((c) => ({ cause: c.cause, confidence: Math.round(c.confidence * 100) / 100, evidence: c.evidence })),
      recommendedAction: {
        title: top.action.title,
        description: `${top.action.description} (Owner: ${top.ownerCode ?? top.ownerFunction} — ${top.ownerBasis}.)`,
        suggestedOwnerFunction: top.ownerFunction,
        suggestedOwnerCode: top.ownerCode,
        suggestedDueDate: due.toISOString().slice(0, 10),
        priority: (["critical", "high", "medium", "low"].includes(f.severity) ? f.severity : "medium") as RootCauseResponse["recommendedAction"]["priority"],
      },
      dataGaps,
    },
    note: exact
      ? `Rule-based fallback: exact rule for ${f.tag} from its verified RCA (${exact.sourceRcaId}). In a real deployment this is prior knowledge for a recurrence; in this dataset the RCA post-dates the alert.`
      : loo
        ? "Rule-based fallback in leave-one-out mode: exact rules disabled; generic pattern rules only."
        : `Rule-based fallback: generic pattern rules (${candidates.map((c) => c.ruleId).join(", ")}).`,
  };
}
