import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/data/prisma";

export const dynamic = "force-dynamic";

// PRD §10 — GET /api/alerts?status=&minPriority=&source= — sorted by priority score.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const where: Prisma.AlertWhereInput = {};
  if (q.get("status")) where.status = q.get("status")!;
  if (q.get("source")) where.source = q.get("source")!;
  if (q.get("minPriority")) where.priorityScore = { gte: Number(q.get("minPriority")) };
  if (q.get("tag")) where.equipmentTag = q.get("tag")!;
  try {
    const alerts = await prisma.alert.findMany({ where, orderBy: [{ priorityScore: "desc" }, { triggeredAt: "desc" }] });
    return NextResponse.json(alerts.map(({ scoreBreakdownJson, detailJson, ...a }) => ({ ...a, scoreBreakdown: JSON.parse(scoreBreakdownJson), detail: JSON.parse(detailJson) })));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
