import { NextResponse } from "next/server";
import { prisma } from "@/lib/data/prisma";
import { getUnifiedEquipment } from "@/lib/data/equipment";

export const dynamic = "force-dynamic";

// PRD §10 — GET /api/equipment/:tag — unified view: weekly + hourly series, incidents, RCA, CAPA.
// Accepts any spelling of the tag (PU2101B, pu-2101b) — normalized per §6.3 rule 1.
export async function GET(_req: Request, { params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  try {
    const data = await getUnifiedEquipment(prisma, tag);
    if (!data) return NextResponse.json({ error: `Equipment "${tag}" not found` }, { status: 404 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
