import { NextResponse } from "next/server";
import { prisma } from "@/lib/data/prisma";
import { runEval } from "@/lib/ai/eval";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

// PRD §10 — GET /api/ai/eval — FR-3.6 leave-one-out results (fallback fresh, LLM from cache).
export async function GET() {
  try {
    return NextResponse.json(await runEval(prisma));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/ai/eval — re-run the LLM leave-one-out analyses + LLM judge (needs ANTHROPIC_API_KEY).
export async function POST() {
  try {
    return NextResponse.json(await runEval(prisma, { runLlm: true }));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
