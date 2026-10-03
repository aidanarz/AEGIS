import { NextResponse } from "next/server";
import { prisma } from "@/lib/data/prisma";
import { getUnifiedEquipment } from "@/lib/data/equipment";
import { getLatestAnalysis } from "@/lib/ai/pipeline";

export const dynamic = "force-dynamic";

// PRD §10 — GET /api/alerts/:id — alert detail incl. related unified records and latest AI analyses.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const alert = await prisma.alert.findUnique({ where: { id }, include: { incident: true, actions: true } });
    if (!alert) return NextResponse.json({ error: `Alert "${id}" not found` }, { status: 404 });
    const [equipment, live, loo] = await Promise.all([
      getUnifiedEquipment(prisma, alert.equipmentTag),
      getLatestAnalysis(prisma, id, "live"),
      getLatestAnalysis(prisma, id, "leave-one-out"),
    ]);
    const { scoreBreakdownJson, detailJson, ...rest } = alert;
    return NextResponse.json({ ...rest, scoreBreakdown: JSON.parse(scoreBreakdownJson), detail: JSON.parse(detailJson), equipment, analyses: { live, leaveOneOut: loo } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
