import { NextResponse } from "next/server";
import { prisma } from "@/lib/data/prisma";
import { getDataSourcesOverview } from "@/lib/data/data-sources";
import { getFunctionCoverage } from "@/lib/data/function-coverage";

export const dynamic = "force-dynamic";

// PRD §10 — GET /api/data-sources: status, counts, DQ flag totals, join-success matrix.
export async function GET() {
  try {
    const [overview, functionCoverage] = await Promise.all([getDataSourcesOverview(prisma), getFunctionCoverage(prisma)]);
    return NextResponse.json({ ...overview, functionCoverage });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
