// PRD §8.2 — AI pipeline: context assembly → LLM call (or rule-based fallback) → post-processing → stored for
// human-in-the-loop review. Acceptance into the Action Tracker happens via POST /api/actions.

import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { fromJson, toJson } from "@/lib/data/json";
import { ownerFunctionFromPic } from "@/lib/data/normalize";
import { buildContext, type AnalysisMode, type BuiltContext } from "./context";
import { runFallback } from "./fallback";
import { callStructured, llmConfigured, LlmError, MODEL, ROOT_CAUSE_SYSTEM_PROMPT } from "./llm";
import { ROOT_CAUSE_JSON_SCHEMA, RootCauseResponseSchema, type AnalysisResult, type RootCauseResponse } from "./schema";

export type EnginePreference = "auto" | "llm" | "fallback";

export async function runAnalysis(
  prisma: PrismaClient,
  alertId: string,
  mode: AnalysisMode,
  engine: EnginePreference = "auto",
  opts: { persist?: boolean } = {},
): Promise<AnalysisResult> {
  const persist = opts.persist ?? true;
  const started = Date.now();
  const built = await buildContext(prisma, alertId, mode);

  let response: RootCauseResponse;
  let usedEngine: "llm" | "fallback" = "fallback";
  let model: string | null = null;
  let note: string;
  let attempts = 1;

  const wantLlm = engine === "llm" || (engine === "auto" && llmConfigured());
  if (wantLlm && llmConfigured()) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await callStructured({
        label: `${mode}:${alertId}`,
        system: ROOT_CAUSE_SYSTEM_PROMPT,
        user: `Today's date: ${today}\n\nContext (JSON):\n${JSON.stringify(built.context)}`,
        jsonSchema: ROOT_CAUSE_JSON_SCHEMA as unknown as Record<string, unknown>,
        zod: RootCauseResponseSchema,
        effort: "medium",
      });
      response = r.data;
      usedEngine = "llm";
      model = r.model;
      attempts = r.attempts;
      note = `Claude (${r.model}) · ${r.attempts} attempt(s) · schema-validated`;
    } catch (e) {
      const reason =
        e instanceof Anthropic.AuthenticationError
          ? "authentication failed"
          : e instanceof Anthropic.RateLimitError
            ? "rate limited"
            : e instanceof Anthropic.APIError
              ? `API error ${e.status}`
              : e instanceof LlmError
                ? e.message
                : `unavailable (${String(e).slice(0, 120)})`;
      console.warn(`[ai] LLM ${reason} — using rule-based fallback`);
      const fb = runFallback(built);
      response = fb.response;
      note = `LLM ${reason}; ${fb.note}`;
    }
  } else {
    const fb = runFallback(built);
    response = fb.response;
    note = engine === "fallback" ? fb.note : `No LLM API key configured — ${fb.note}`;
  }

  // ── Post-processing (§8.2 step 4) ─────────────────────────────────────
  response = normalizeOwner(response);
  const outside = new Map<string, { kind: string; href: string | null }>();
  for (const r of await prisma.rcaReport.findMany({ select: { rcaId: true, equipmentTag: true } }))
    if (!built.meta.knownIds.has(r.rcaId)) outside.set(r.rcaId, { kind: "RCA report (rule knowledge base — not in prompt context)", href: `/equipment/${r.equipmentTag}` });
  const evidenceLinks = linkEvidence(response, built, outside);
  const result: Omit<AnalysisResult, "analysisId" | "createdAt"> = {
    alertId,
    mode,
    engine: usedEngine,
    model: usedEngine === "llm" ? model ?? MODEL : null,
    engineNote: note,
    response,
    evidenceLinks,
    similarCases: built.meta.similarCases.map((s) => ({ rcaId: s.rcaId, equipmentTag: s.equipmentTag, score: s.score, basis: s.basis, verifiedRootCause: s.verifiedRootCause })),
    contextSummary: { cutoff: built.meta.cutoff, included: built.meta.included, stripped: built.meta.stripped, redactions: built.meta.redactions },
    latencyMs: Date.now() - started,
    attempts,
  };

  if (!persist) return { ...result, analysisId: null, createdAt: new Date().toISOString() };
  const row = await prisma.aiAnalysis.create({
    data: {
      alertId,
      mode,
      engine: usedEngine,
      model: result.model,
      requestJson: toJson({ context: built.context, meta: { ...built.meta, knownIds: [...built.meta.knownIds.keys()] } }),
      responseJson: toJson(result),
      latencyMs: result.latencyMs,
      attempts,
    },
  });
  console.info(`[ai] analysis #${row.id} ${alertId} mode=${mode} engine=${usedEngine} ${result.latencyMs} ms`);
  return { ...result, analysisId: row.id, createdAt: row.createdAt.toISOString() };
}

export async function getLatestAnalysis(prisma: PrismaClient, alertId: string, mode: AnalysisMode): Promise<AnalysisResult | null> {
  const row = await prisma.aiAnalysis.findFirst({ where: { alertId, mode }, orderBy: { id: "desc" } });
  if (!row) return null;
  const r = fromJson<AnalysisResult | null>(row.responseJson, null);
  return r ? { ...r, analysisId: row.id, createdAt: row.createdAt.toISOString() } : null;
}

/** Owner code → function via the §6.7 PIC-prefix mapping; the code wins when the two disagree. */
function normalizeOwner(r: RootCauseResponse): RootCauseResponse {
  const fn = ownerFunctionFromPic(r.recommendedAction.suggestedOwnerCode);
  if (fn && fn !== r.recommendedAction.suggestedOwnerFunction) {
    return { ...r, recommendedAction: { ...r.recommendedAction, suggestedOwnerFunction: fn } };
  }
  return r;
}

/** Attach links to every record id an evidence string cites; unverified = cites nothing that exists in the context. */
function linkEvidence(r: RootCauseResponse, built: BuiltContext, outside: Map<string, { kind: string; href: string | null }>): AnalysisResult["evidenceLinks"] {
  const ids = [...built.meta.knownIds.entries()].sort((a, b) => b[0].length - a[0].length);
  const outsideIds = [...outside.entries()];
  return r.rootCauses.map((c) =>
    c.evidence.map((text) => {
      const refs: { id: string; kind: string; href: string | null }[] = [];
      let rest = text;
      for (const [id, v] of ids) {
        if (rest.includes(id)) {
          refs.push({ id, kind: v.kind, href: v.href });
          rest = rest.split(id).join(" ");
        }
      }
      const verified = refs.length > 0;
      for (const [id, v] of outsideIds) if (rest.includes(id)) refs.push({ id, kind: v.kind, href: v.href });
      return { text, refs, verified };
    }),
  );
}
