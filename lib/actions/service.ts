// FR-3.4 / §7.2 Action Tracker — create (manual or accepted AI suggestion), edit, reassign, status, close, delete.
// Every change writes an ActionEvent (audit trail) tagged with the acting role from the role switcher.

import { ActionCreatedBy, ActionStatus, type PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { FUNCTIONS, ownerFunctionFromPic, AS_OF_DATE } from "@/lib/data/normalize";
import { fromJson } from "@/lib/data/json";
import type { AnalysisResult } from "@/lib/ai/schema";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "ISO date (YYYY-MM-DD)");
const PRIORITY = z.enum(["critical", "high", "medium", "low"]);

export const CreateActionInput = z.object({
  title: z.string().trim().min(3),
  description: z.string().trim().optional().nullable(),
  ownerCode: z.string().trim().optional().nullable(),
  ownerFunction: z.enum(FUNCTIONS).optional().nullable(),
  dueDate: isoDate.optional().nullable(),
  priority: PRIORITY.optional().nullable(),
  alertId: z.string().optional().nullable(),
  aiAnalysisId: z.number().int().optional().nullable(),
  rcaId: z.string().optional().nullable(),
});

export const UpdateActionInput = z.object({
  title: z.string().trim().min(3).optional(),
  description: z.string().trim().nullable().optional(),
  ownerCode: z.string().trim().nullable().optional(),
  ownerFunction: z.enum(FUNCTIONS).nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  priority: PRIORITY.nullable().optional(),
  status: z.enum(["open", "in_progress", "done"]).optional(),
});

/** API/UI spelling of createdBy (PRD FR-3.4 uses hyphens; the Prisma enum keys use underscores). */
export const createdByLabel = (c: string) => c.replace(/_/g, "-");

const toDate = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : null);
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");

/** Owner code wins: its §6.7 prefix decides the function; otherwise keep the function given. */
function resolveOwner(code: string | null | undefined, fn: string | null | undefined) {
  const mapped = ownerFunctionFromPic(code ?? null);
  return { ownerCode: code || null, ownerFunction: mapped ?? fn ?? null };
}

export async function createAction(prisma: PrismaClient, raw: unknown, byRole: string | null = null) {
  const input = CreateActionInput.parse(raw);
  let createdBy: ActionCreatedBy = ActionCreatedBy.user;
  let rcaId = input.rcaId ?? null;

  // Accepting an AI suggestion: unchanged → "ai", any edit → "user-edited" (FR-3.4). Decided server-side.
  if (input.aiAnalysisId) {
    const a = await prisma.aiAnalysis.findUnique({ where: { id: input.aiAnalysisId } });
    if (!a) throw new Error(`AI analysis ${input.aiAnalysisId} not found`);
    const s = fromJson<AnalysisResult | null>(a.responseJson, null)?.response.recommendedAction;
    if (!s) throw new Error("AI analysis has no recommended action");
    const same =
      s.title === input.title &&
      s.description === (input.description ?? "") &&
      (s.suggestedOwnerCode ?? null) === (input.ownerCode ?? null) &&
      s.suggestedDueDate.slice(0, 10) === (input.dueDate ?? "").slice(0, 10) &&
      s.priority === input.priority;
    createdBy = same ? ActionCreatedBy.ai : ActionCreatedBy.user_edited;
  }
  if (input.alertId && !rcaId) {
    rcaId = (await prisma.alert.findUnique({ where: { id: input.alertId } }))?.rcaId ?? null;
  }

  const owner = resolveOwner(input.ownerCode, input.ownerFunction);
  const action = await prisma.action.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      ...owner,
      dueDate: toDate(input.dueDate),
      priority: input.priority ?? null,
      status: ActionStatus.open,
      createdBy,
      alertId: input.alertId ?? null,
      aiAnalysisId: input.aiAnalysisId ?? null,
      rcaId,
      events: {
        create: {
          kind: "created",
          byRole,
          detail:
            createdBy === ActionCreatedBy.ai
              ? `Accepted AI recommendation (analysis #${input.aiAnalysisId}) unchanged — owner ${owner.ownerCode ?? owner.ownerFunction ?? "unassigned"}, due ${input.dueDate ?? "—"}`
              : createdBy === ActionCreatedBy.user_edited
                ? `Accepted AI recommendation (analysis #${input.aiAnalysisId}) with edits — owner ${owner.ownerCode ?? owner.ownerFunction ?? "unassigned"}, due ${input.dueDate ?? "—"}`
                : `Created manually — owner ${owner.ownerCode ?? owner.ownerFunction ?? "unassigned"}, due ${input.dueDate ?? "—"}`,
        },
      },
    },
  });
  if (input.alertId) await prisma.alert.update({ where: { id: input.alertId }, data: { status: "acknowledged" } });
  return action;
}

export async function updateAction(prisma: PrismaClient, id: number, raw: unknown, byRole: string | null = null) {
  const input = UpdateActionInput.parse(raw);
  const current = await prisma.action.findUnique({ where: { id } });
  if (!current) return null;

  const data: Prisma.ActionUpdateInput = {};
  const events: { kind: string; detail: string; byRole: string | null }[] = [];
  const ev = (kind: string, detail: string) => events.push({ kind, detail, byRole });

  if (input.title !== undefined && input.title !== current.title) {
    data.title = input.title;
    ev("edit", `Title: “${current.title}” → “${input.title}”`);
  }
  if (input.description !== undefined && (input.description ?? null) !== current.description) {
    data.description = input.description;
    ev("edit", "Description updated");
  }
  if (input.ownerCode !== undefined || input.ownerFunction !== undefined) {
    const next = resolveOwner(input.ownerCode !== undefined ? input.ownerCode : current.ownerCode, input.ownerFunction ?? current.ownerFunction);
    if (next.ownerCode !== current.ownerCode || next.ownerFunction !== current.ownerFunction) {
      Object.assign(data, next);
      ev("owner", `Reassigned ${current.ownerCode ?? current.ownerFunction ?? "unassigned"} → ${next.ownerCode ?? next.ownerFunction ?? "unassigned"}${next.ownerFunction ? ` (${next.ownerFunction})` : ""}`);
    }
  }
  if (input.dueDate !== undefined && day(toDate(input.dueDate)) !== day(current.dueDate)) {
    data.dueDate = toDate(input.dueDate);
    ev("due", `Due date ${day(current.dueDate)} → ${input.dueDate ?? "—"}`);
  }
  if (input.priority !== undefined && input.priority !== current.priority) {
    data.priority = input.priority;
    ev("edit", `Priority ${current.priority ?? "—"} → ${input.priority ?? "—"}`);
  }
  if (input.status !== undefined && input.status !== current.status) {
    data.status = input.status as ActionStatus;
    data.closedAt = input.status === "done" ? new Date() : null;
    ev("status", `Status ${current.status.replace("_", " ")} → ${input.status.replace("_", " ")}${input.status === "done" ? " (closed)" : ""}`);
  }
  if (!events.length) return current;

  const action = await prisma.action.update({ where: { id }, data: { ...data, events: { create: events } } });

  // An alert is resolved when every action raised from it is done.
  if (action.alertId) {
    const open = await prisma.action.count({ where: { alertId: action.alertId, status: { not: ActionStatus.done } } });
    await prisma.alert.update({ where: { id: action.alertId }, data: { status: open === 0 ? "resolved" : "acknowledged" } });
  }
  return action;
}

export class ActionConflict extends Error {}

/** Imported CAPA items are real source records — they can be closed, not deleted. */
export async function deleteAction(prisma: PrismaClient, id: number) {
  const current = await prisma.action.findUnique({ where: { id } });
  if (!current) return null;
  if (current.createdBy === ActionCreatedBy.imported_capa) throw new ActionConflict("Imported CAPA items come from the RCA decks and cannot be deleted — close them instead.");
  await prisma.action.delete({ where: { id } });
  if (current.alertId) {
    const remaining = await prisma.action.count({ where: { alertId: current.alertId } });
    const open = await prisma.action.count({ where: { alertId: current.alertId, status: { not: ActionStatus.done } } });
    await prisma.alert.update({ where: { id: current.alertId }, data: { status: remaining === 0 ? "open" : open === 0 ? "resolved" : "acknowledged" } });
  }
  return current;
}

export async function listActions(prisma: PrismaClient, f: { status?: string | null; owner?: string | null; overdue?: boolean; createdBy?: string | null } = {}) {
  const where: Prisma.ActionWhereInput = {};
  if (f.status) where.status = f.status as ActionStatus;
  if (f.owner) where.OR = [{ ownerCode: f.owner }, { ownerFunction: f.owner }];
  if (f.overdue) Object.assign(where, { status: { not: ActionStatus.done }, dueDate: { lt: AS_OF_DATE } });
  if (f.createdBy) where.createdBy = f.createdBy.replace(/-/g, "_") as ActionCreatedBy;
  return prisma.action.findMany({
    where,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: {
      rcaReport: { select: { rcaId: true, equipmentTag: true } },
      alert: { select: { id: true, equipmentTag: true, title: true } },
      capaAction: { select: { kind: true, ref: true } },
      events: { orderBy: { at: "desc" } },
    },
  });
}

/** Overdue = not done and due date before today. */
export function isOverdue(a: { status: string; dueDate: Date | null }) {
  const today = new Date(Math.max(Date.now(), AS_OF_DATE.getTime()));
  return a.status !== "done" && !!a.dueDate && a.dueDate < new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
}
