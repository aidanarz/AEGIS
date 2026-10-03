// PRD §8.3 — LLM response contract. Enforced server-side twice:
//   1. as a JSON-schema `output_config.format` on the request (structured outputs), and
//   2. by zod validation of whatever comes back — malformed output is rejected and retried.

import { z } from "zod";
import { FUNCTIONS } from "@/lib/data/normalize";

export const PRIORITIES = ["critical", "high", "medium", "low"] as const;

export const RootCauseResponseSchema = z.object({
  rootCauses: z
    .array(
      z.object({
        cause: z.string().min(3),
        confidence: z.number().min(0).max(1),
        evidence: z.array(z.string().min(1)).min(1),
      }),
    )
    .min(1)
    .max(4),
  recommendedAction: z.object({
    title: z.string().min(3),
    description: z.string().min(3),
    suggestedOwnerFunction: z.enum(FUNCTIONS),
    suggestedOwnerCode: z.string().nullable(),
    suggestedDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "ISO 8601 date"),
    priority: z.enum(PRIORITIES),
  }),
  dataGaps: z.array(z.string()),
});

export type RootCauseResponse = z.infer<typeof RootCauseResponseSchema>;

/** Same contract as JSON Schema for `output_config.format` (structured outputs need additionalProperties:false + required). */
export const ROOT_CAUSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rootCauses", "recommendedAction", "dataGaps"],
  properties: {
    rootCauses: {
      type: "array",
      description: "1 to 4 candidate causes, most probable first",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cause", "confidence", "evidence"],
        properties: {
          cause: { type: "string", description: "concise probable root cause" },
          confidence: { type: "number", description: "0.0–1.0, how strongly the provided evidence supports this cause" },
          evidence: {
            type: "array",
            items: { type: "string" },
            description: "record ids from the context (incidentId, rcaId, signal@timestamp, tag#wN) or short justifications",
          },
        },
      },
    },
    recommendedAction: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "suggestedOwnerFunction", "suggestedOwnerCode", "suggestedDueDate", "priority"],
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        suggestedOwnerFunction: { type: "string", enum: [...FUNCTIONS] },
        suggestedOwnerCode: { type: ["string", "null"], description: "owner code such as REL-05, or null if none fits" },
        suggestedDueDate: { type: "string", description: "ISO 8601 date (YYYY-MM-DD)" },
        priority: { type: "string", enum: [...PRIORITIES] },
      },
    },
    dataGaps: {
      type: "array",
      items: { type: "string" },
      description: "parameters that would confirm or refute the top cause but are NOT in the provided data",
    },
  },
} as const;

/** What the pipeline returns to the UI: the contract plus provenance and post-processing results. */
export interface AnalysisResult {
  analysisId: number | null;
  alertId: string;
  mode: "live" | "leave-one-out";
  engine: "llm" | "fallback";
  model: string | null;
  engineNote: string;
  response: RootCauseResponse;
  evidenceLinks: { text: string; refs: { id: string; kind: string; href: string | null }[]; verified: boolean }[][];
  similarCases: { rcaId: string; equipmentTag: string; score: number; basis: string; verifiedRootCause: string }[];
  contextSummary: { cutoff: string; included: string[]; stripped: string[]; redactions: number };
  latencyMs: number;
  attempts: number;
  createdAt: string;
}
