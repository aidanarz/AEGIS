import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/data/prisma";
import { ActionConflict, createdByLabel, deleteAction, updateAction } from "@/lib/actions/service";

export const dynamic = "force-dynamic";

const parseId = async (params: Promise<{ id: string }>) => {
  const id = Number((await params).id);
  return Number.isInteger(id) ? id : null;
};

// PRD §10 — PATCH /api/actions/:id — update status / owner / due date / fields.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await parseId(params);
  if (id == null) return NextResponse.json({ error: "Invalid action id" }, { status: 400 });
  try {
    const a = await updateAction(prisma, id, await req.json(), req.headers.get("x-role"));
    if (!a) return NextResponse.json({ error: `Action ${id} not found` }, { status: 404 });
    return NextResponse.json({ ...a, createdBy: createdByLabel(a.createdBy) });
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// DELETE /api/actions/:id — manual / AI actions only; imported CAPA → 409 (close it instead).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await parseId(params);
  if (id == null) return NextResponse.json({ error: "Invalid action id" }, { status: 400 });
  try {
    const a = await deleteAction(prisma, id);
    if (!a) return NextResponse.json({ error: `Action ${id} not found` }, { status: 404 });
    return NextResponse.json({ deleted: id });
  } catch (e) {
    if (e instanceof ActionConflict) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
