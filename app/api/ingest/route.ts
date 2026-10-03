import { NextResponse } from "next/server";
import { prisma } from "@/lib/data/prisma";
import { revalidateSources } from "@/lib/data/sources";

export const dynamic = "force-dynamic";

// Mock ingestion endpoint (§4.2): re-reads the 4 source files, verifies them against the loaded data
// (hash + record count), re-runs every DQ rule and logs an IngestRun per source.
// It never rewrites rows — a full reload is `npm run db:reset`, so tracked actions are not lost.
export async function POST() {
  try {
    const result = await revalidateSources(prisma);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
