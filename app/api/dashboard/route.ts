import { NextResponse } from "next/server";
import { prisma } from "@/lib/data/prisma";
import { getDashboard, getFunctionKpis } from "@/lib/data/dashboard";
import { functionFromSlug, getFunctionCoverage } from "@/lib/data/function-coverage";

export const dynamic = "force-dynamic";

// PRD §10 — GET /api/dashboard?function=&role= — aggregated KPI widgets.
// `role` only changes emphasis in the UI (FR-2.3); it is echoed back, data is identical.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fnParam = url.searchParams.get("function");
  const fn = fnParam ? functionFromSlug(fnParam) : null;
  if (fnParam && !fn) return NextResponse.json({ error: `Unknown function "${fnParam}"` }, { status: 400 });
  try {
    const [dashboard, coverage, functionKpis] = await Promise.all([getDashboard(prisma, fn), getFunctionCoverage(prisma), getFunctionKpis(prisma)]);
    return NextResponse.json({ role: url.searchParams.get("role") ?? "executive", ...dashboard, coverage, functionKpis });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
