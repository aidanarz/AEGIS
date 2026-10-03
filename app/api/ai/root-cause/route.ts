import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/data/prisma";
import { runAnalysis } from "@/lib/ai/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Body = z.object({
  alertId: z.string().min(1),
  mode: z.enum(["live", "leave-one-out"]).default("live"),
  engine: z.enum(["auto", "llm", "fallback"]).default("auto"),
});

// PRD §10 — POST /api/ai/root-cause { alertId, mode? } → §8.3 schema (+ provenance / evidence links).
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  try {
    const result = await runAnalysis(prisma, parsed.data.alertId, parsed.data.mode, parsed.data.engine);
    return NextResponse.json(result);
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    return NextResponse.json({ error: msg }, { status: /not found/.test(msg) ? 404 : /Leave-one-out/.test(msg) ? 400 : 500 });
  }
}
