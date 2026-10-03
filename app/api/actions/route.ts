import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/data/prisma";
import { createAction, createdByLabel, listActions } from "@/lib/actions/service";

export const dynamic = "force-dynamic";

const role = (req: Request) => req.headers.get("x-role");
const err = (e: unknown) =>
  e instanceof ZodError
    ? NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 })
    : NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 400 });

// PRD §10 — GET /api/actions?status=&owner=&overdue=&createdBy=
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  try {
    const rows = await listActions(prisma, { status: q.get("status"), owner: q.get("owner"), overdue: q.get("overdue") === "1" || q.get("overdue") === "true", createdBy: q.get("createdBy") });
    return NextResponse.json(rows.map((a) => ({ ...a, createdBy: createdByLabel(a.createdBy) })));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PRD §10 — POST /api/actions — create / accept an action (from AI suggestion or manual).
export async function POST(req: Request) {
  try {
    const a = await createAction(prisma, await req.json(), role(req));
    return NextResponse.json({ ...a, createdBy: createdByLabel(a.createdBy) }, { status: 201 });
  } catch (e) {
    return err(e);
  }
}
