// FR-3.6 — leakage-safe self-evaluation. For each of the 5 focus cases, analyse its detector alert in
// leave-one-out mode and compare the top-ranked cause to rca.verifiedRootCause.
// Judges: (a) offline concept matcher (always), (b) Claude as semantic judge (only when an API key is set).
// Results are reported as they come out — no tuning against the answer key.

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { toJson, fromJson } from "@/lib/data/json";
import { buildContext } from "./context";
import { compareConcepts, type Verdict } from "./concepts";
import { callStructured, llmConfigured } from "./llm";
import { getLatestAnalysis, runAnalysis } from "./pipeline";
import type { AnalysisResult } from "./schema";

const JudgeSchema = z.object({ verdict: z.enum(["match", "partial", "no-match"]), rationale: z.string() });
const JUDGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "rationale"],
  properties: { verdict: { type: "string", enum: ["match", "partial", "no-match"] }, rationale: { type: "string" } },
};
const JUDGE_SYSTEM = `You grade root-cause hypotheses against a verified root cause from a completed RCA.
Verdict "match": the hypothesis identifies the same primary failure mechanism as the verified cause (wording may differ).
Verdict "partial": it identifies a contributing factor, the affected component, or a closely related mechanism, but not the primary mechanism.
Verdict "no-match": it points to a different mechanism.
Be strict and do not reward vague hypotheses. Respond only with JSON.`;

export interface LeakCheck {
  term: string;
  field: string;
  foundInContext: boolean;
  foundOnlyInSensorLabels: boolean;
}

export interface EvalRow {
  rcaId: string;
  equipmentTag: string;
  alertId: string;
  verifiedRootCause: string;
  leakage: { passed: boolean; checks: LeakCheck[]; redactions: number };
  engines: {
    engine: "fallback" | "llm";
    available: boolean;
    note: string;
    result: AnalysisResult | null;
    topCause: string | null;
    topConfidence: number | null;
    conceptJudge: ReturnType<typeof compareConcepts> | null;
    bestInTop3: Verdict | null;
    llmJudge: { verdict: Verdict; rationale: string } | null;
  }[];
}

export async function runEval(prisma: PrismaClient, opts: { runLlm?: boolean } = {}): Promise<{ rows: EvalRow[]; llmAvailable: boolean }> {
  const reports = await prisma.rcaReport.findMany({ orderBy: { dateOccurrence: "asc" }, include: { equipment: true } });
  const incidents = await prisma.incident.findMany({ where: { rcaId: { in: reports.map((r) => r.rcaId) } } });
  const rows: EvalRow[] = [];
  const llmAvailable = llmConfigured();

  for (const r of reports) {
    const alertId = `det-${r.equipmentTag}`;
    const inc = incidents.find((i) => i.rcaId === r.rcaId);
    const built = await buildContext(prisma, alertId, "leave-one-out");
    const leakage = auditLeakage(built.context, [
      { term: r.verifiedRootCause, field: "rca.verifiedRootCause" },
      { term: r.rcaId, field: "rca.rcaId (own report)" },
      { term: r.historicalEvidence.slice(0, 60), field: "rca.historicalEvidence" },
      ...fromJson<{ event: string }[]>(r.chronologyJson, []).map((c) => ({ term: c.event.slice(0, 60), field: "rca.chronology" })),
      { term: r.equipment.dominantFailureMode ?? "", field: "equipment.dominantFailureMode" },
      { term: inc?.riskCaseTitle ?? "", field: "incident.riskCaseTitle" },
      { term: inc?.component ?? "", field: "incident.component" },
    ]);
    leakage.redactions = built.meta.redactions;

    const engines: EvalRow["engines"] = [];

    // (1) rule-based fallback — always run fresh, not persisted (deterministic, ~100 ms)
    const fb = await runAnalysis(prisma, alertId, "leave-one-out", "fallback", { persist: false });
    engines.push(judgeRow("fallback", true, fb.engineNote, fb, r.verifiedRootCause, null));

    // (2) LLM — latest cached LOO run, or a new run when requested
    let llm: AnalysisResult | null = null;
    if (llmAvailable && opts.runLlm) llm = await runAnalysis(prisma, alertId, "leave-one-out", "llm");
    else {
      const cached = await getLatestAnalysis(prisma, alertId, "leave-one-out");
      llm = cached?.engine === "llm" ? cached : null;
    }
    let llmJudge: { verdict: Verdict; rationale: string } | null = llm ? ((llm as AnalysisResult & { llmJudge?: { verdict: Verdict; rationale: string } }).llmJudge ?? null) : null;
    if (llm && llm.engine === "llm" && llmAvailable && opts.runLlm) {
      try {
        const j = await callStructured({
          label: `judge:${r.rcaId}`,
          system: JUDGE_SYSTEM,
          user: `Verified root cause:\n${r.verifiedRootCause}\n\nHypothesis (top-ranked):\n${llm.response.rootCauses[0].cause}`,
          jsonSchema: JUDGE_JSON_SCHEMA,
          zod: JudgeSchema,
          effort: "low",
        });
        llmJudge = j.data;
        if (llm.analysisId) {
          const row = await prisma.aiAnalysis.findUnique({ where: { id: llm.analysisId } });
          if (row) await prisma.aiAnalysis.update({ where: { id: row.id }, data: { responseJson: toJson({ ...fromJson(row.responseJson, {}), llmJudge }) } });
        }
      } catch (e) {
        console.warn(`[eval] LLM judge failed for ${r.rcaId}: ${String(e)}`);
      }
    }
    engines.push(
      judgeRow(
        "llm",
        llmAvailable,
        llmAvailable ? (llm ? llm.engineNote : "Not run yet — use “Run LLM evaluation”.") : "No ANTHROPIC_API_KEY configured — LLM evaluation not run.",
        llm && llm.engine === "llm" ? llm : null,
        r.verifiedRootCause,
        llmJudge,
      ),
    );

    rows.push({ rcaId: r.rcaId, equipmentTag: r.equipmentTag, alertId, verifiedRootCause: r.verifiedRootCause, leakage, engines });
  }
  return { rows, llmAvailable };
}

function judgeRow(
  engine: "fallback" | "llm",
  available: boolean,
  note: string,
  result: AnalysisResult | null,
  reference: string,
  llmJudge: { verdict: Verdict; rationale: string } | null,
): EvalRow["engines"][number] {
  if (!result) return { engine, available, note, result: null, topCause: null, topConfidence: null, conceptJudge: null, bestInTop3: null, llmJudge };
  const top = result.response.rootCauses[0];
  const order: Verdict[] = ["match", "partial", "no-match"];
  const best = result.response.rootCauses
    .slice(0, 3)
    .map((c) => compareConcepts(c.cause, reference).verdict)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  return { engine, available, note, result, topCause: top.cause, topConfidence: top.confidence, conceptJudge: compareConcepts(top.cause, reference), bestInTop3: best, llmJudge };
}

/** Does any stripped answer-key string appear in the context actually sent? Sensor labels (monitored-parameter
 *  names, reading keys) are physical measurements, not answer key — reported separately. */
function auditLeakage(context: Record<string, unknown>, terms: { term: string; field: string }[]): EvalRow["leakage"] {
  const full = JSON.stringify(context).toLowerCase();
  const eq = context.equipment as { monitoredParameters: unknown; recentConditionHistory: { readings: unknown }[] };
  const withoutLabels = JSON.stringify({
    ...context,
    equipment: { ...eq, monitoredParameters: "[sensor labels]", recentConditionHistory: eq.recentConditionHistory.map((w) => ({ ...w, readings: "[readings]" })) },
  }).toLowerCase();
  const checks = terms
    .filter((t) => t.term && t.term.trim().length >= 4)
    .map((t) => {
      const needle = t.term.toLowerCase();
      const inText = withoutLabels.includes(needle);
      return { term: t.term, field: t.field, foundInContext: inText, foundOnlyInSensorLabels: !inText && full.includes(needle) };
    });
  return { passed: checks.every((c) => !c.foundInContext), checks, redactions: 0 };
}
