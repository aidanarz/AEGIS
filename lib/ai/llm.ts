// PRD §8.2 step 3 — LLM call. Anthropic Claude API, server-side only.
// • Structured outputs (`output_config.format`) + zod validation; malformed output is rejected and retried.
// • Server-side refusal fallback (`fallbacks: "default"`) so a declined request is re-run on Anthropic's recommended model.
// • Every call is logged (prompt size, response, latency, usage) — NFR observability.
// Without credentials the pipeline never calls this module (rule-based fallback, FR-3.5).

import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

/** LLM is used only when credentials exist and AI_ENGINE is not forced to "fallback". */
export function llmConfigured(): boolean {
  if (process.env.AI_ENGINE === "fallback") return false;
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 120_000 }));

export class LlmError extends Error {}

export interface StructuredCallResult<T> {
  data: T;
  model: string;
  attempts: number;
  latencyMs: number;
  rawText: string;
}

export async function callStructured<T>(opts: {
  label: string;
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  zod: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
  maxAttempts?: number;
}): Promise<StructuredCallResult<T>> {
  const started = Date.now();
  const maxAttempts = opts.maxAttempts ?? 3;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.user }];
  let lastError = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const t0 = Date.now();
    console.info(`[ai:${opts.label}] → ${MODEL} attempt ${attempt}/${maxAttempts} · prompt ${opts.system.length + opts.user.length} chars`);
    console.info(`[ai:${opts.label}] prompt (truncated):`, opts.user.slice(0, 2000));

    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      messages,
      output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: opts.jsonSchema } },
    });

    const latency = Date.now() - t0;
    console.info(`[ai:${opts.label}] ← ${response.model} stop=${response.stop_reason} ${latency} ms usage=${JSON.stringify(response.usage)}`);

    if (response.stop_reason === "refusal") {
      throw new LlmError(`Model declined the request (${response.stop_details?.category ?? "unspecified"}).`);
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    console.info(`[ai:${opts.label}] response:`, text.slice(0, 4000));

    if (response.stop_reason === "max_tokens") {
      lastError = "output truncated at max_tokens";
    } else {
      try {
        const parsed = opts.zod.safeParse(JSON.parse(text));
        if (parsed.success) {
          return { data: parsed.data, model: response.model, attempts: attempt, latencyMs: Date.now() - started, rawText: text };
        }
        lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      } catch (e) {
        lastError = `invalid JSON: ${String(e)}`;
      }
    }
    console.warn(`[ai:${opts.label}] rejected attempt ${attempt}: ${lastError}`);
    // Retry with the validation error fed back (append-only history).
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: `Your previous output was rejected by server-side validation: ${lastError}. Return the full corrected JSON object only.` });
  }
  throw new LlmError(`No valid output after ${maxAttempts} attempts: ${lastError}`);
}

export const ROOT_CAUSE_SYSTEM_PROMPT = `You are a reliability and process-safety analyst for a petrochemical plant. Given structured operational context, identify the most probable root cause(s) of the flagged anomaly and recommend one prioritized, owned follow-up action. Respond ONLY with JSON matching the schema.

Be concise, specific, and ground every cause in the evidence provided — never invent data not present in the context. If the available signals cannot confirm a cause, lower the confidence and list what is missing in dataGaps.

Guidance:
- Return 1–4 candidate causes, most probable first. Confidence is 0–1 and must reflect how strongly the provided evidence supports the cause; with only weak precursors and no direct measurement of the causal parameter, stay below 0.6.
- Each evidence item should cite record ids exactly as they appear in the context (incidentId such as INC-0002, rcaId such as AR-2026-ZCU-0142, an RCA finding id such as AR-2026-ZCU-0142:X1, a weekly reading id such as KO-3201#w20, or a PI tag name such as KO3201_VIB) followed by a short justification.
- Similar RCA cases are other assets' verified causes: use them as patterns, not as facts about this asset.
- Fields shown as "[redacted — answer key]" were deliberately removed; do not speculate about their content.
- dataGaps: list the specific parameters that would confirm or refute the top cause but are not in the provided data (for example a parameter monitored only weekly, or one that appears only in RCA narratives).
- Owner: choose suggestedOwnerFunction from the allowed list and, when one fits, a real owner code from ownerDirectory.codesInThisPlant (PIC prefixes: REL- Reliability; ROT-/STA-/ELE-/INS- Maintenance; OPS- Production). Use null for suggestedOwnerCode if none fits.
- suggestedDueDate: an ISO date appropriate to the alert severity (critical ≈ 3 days, high ≈ 7 days, medium ≈ 14 days) counted from today's date given in the request.`;
