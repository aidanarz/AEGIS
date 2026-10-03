"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, CalendarClock, CheckCircle2, FileInput, History, Loader2, Pencil, Plus, Trash2, User, UserCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useRole, useRoleFetch } from "@/components/role-provider";
import { ActionDialog, EMPTY_ACTION, type ActionFormValues } from "@/components/actions/action-dialog";
import { cn } from "@/lib/utils";

export interface BoardAction {
  id: number;
  title: string;
  description: string | null;
  ownerCode: string | null;
  ownerFunction: string | null;
  dueDate: string | null;
  status: "open" | "in_progress" | "done";
  sourceStatus: string | null;
  priority: string | null;
  createdBy: string;
  overdue: boolean;
  closedAt: string | null;
  source: { label: string; href: string } | null;
  capaRef: string | null;
  rcaId: string | null;
  events: { at: string; kind: string; detail: string; byRole: string | null }[];
}

const COLUMNS = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
] as const;

const ORIGIN: Record<string, { label: string; Icon: typeof Bot; cls: string }> = {
  imported_capa: { label: "imported CAPA", Icon: FileInput, cls: "bg-muted text-navy" },
  ai: { label: "AI", Icon: Bot, cls: "bg-navy text-white" },
  user_edited: { label: "AI · user-edited", Icon: Pencil, cls: "bg-cyan/20 text-cyan-deep" },
  user: { label: "manual", Icon: User, cls: "bg-lime/20 text-lime-deep" },
};

export function ActionBoard({
  actions,
  ownerCodes,
  rcaOptions,
}: {
  actions: BoardAction[];
  ownerCodes: { code: string; fn: string | null; incidents: number }[];
  rcaOptions: { rcaId: string; equipmentTag: string }[];
}) {
  const router = useRouter();
  const roleFetch = useRoleFetch();
  const { role, ownerCode } = useRole();
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; action: BoardAction } | null>(null);
  const [historyOpen, setHistoryOpen] = useState<number | null>(null);
  const [mineOnly, setMineOnly] = useState(false);

  const isMine = useCallback((a: BoardAction) => role === "action_owner" && a.ownerCode === ownerCode, [role, ownerCode]);
  const shown = useMemo(() => (mineOnly && role === "action_owner" ? actions.filter(isMine) : actions), [mineOnly, role, actions, isMine]);

  async function api(url: string, method: string, body?: unknown) {
    const res = await roleFetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? res.statusText);
    return json;
  }

  async function act(id: number, fn: () => Promise<unknown>) {
    setPending(id);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setPending(null);
    }
  }

  const toForm = (a: BoardAction): ActionFormValues => ({
    title: a.title,
    description: a.description ?? "",
    ownerCode: a.ownerCode ?? "",
    ownerFunction: a.ownerFunction ?? "Reliability",
    dueDate: a.dueDate ?? "",
    priority: a.priority ?? "medium",
    rcaId: a.rcaId ?? "",
  });
  const createInitial = useMemo(() => ({ ...EMPTY_ACTION, ownerCode: role === "action_owner" ? ownerCode : "" }), [role, ownerCode]);
  const editInitial = useMemo(() => (dialog?.mode === "edit" ? toForm(dialog.action) : EMPTY_ACTION), [dialog]);
  const closeDialog = useCallback(() => setDialog(null), []);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => setDialog({ mode: "create" })} className="gap-1.5">
          <Plus className="size-4" /> New action
        </Button>
        {role === "action_owner" && (
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            Only my actions (<span className="font-mono">{ownerCode}</span>: {actions.filter(isMine).length})
          </label>
        )}
        {error && <div className="ml-auto rounded-md border border-sev-critical/40 bg-sev-critical/10 px-2 py-1 text-sm text-sev-critical">{error}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col, ci) => {
          const items = shown.filter((a) => a.status === col.id);
          return (
            <section key={col.id} className="rounded-xl border border-card-border bg-white/60 p-3" aria-label={col.label}>
              <h2 className="mb-3 flex items-center justify-between text-base font-bold">
                {col.label}
                <span className="rounded-full bg-navy px-2 text-xs font-semibold text-white">{items.length}</span>
              </h2>
              <ul className="space-y-2">
                {items.map((a) => {
                  const o = ORIGIN[a.createdBy] ?? ORIGIN.user;
                  const mine = isMine(a);
                  const busy = pending === a.id;
                  return (
                    <li
                      key={a.id}
                      className={cn("rounded-lg border bg-white p-3 shadow-sm", a.overdue ? "border-sev-critical/50" : "border-card-border", mine && "ring-2 ring-cyan")}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                        <span className="font-mono text-muted-foreground">#{a.id}</span>
                        <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-semibold", o.cls)}>
                          <o.Icon className="size-3" aria-hidden /> {o.label}
                        </span>
                        {a.capaRef && <span className="rounded bg-app-bg px-1 font-mono">{a.capaRef}</span>}
                        {a.priority && <span className="rounded bg-app-bg px-1">{a.priority}</span>}
                        {mine && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-cyan px-1.5 py-0.5 font-semibold text-navy-deep">
                            <UserCheck className="size-3" /> assigned to you
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-navy">{a.title}</div>
                      {a.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span>
                          <span className="font-mono font-semibold text-navy">{a.ownerCode ?? "unassigned"}</span> {a.ownerFunction && `· ${a.ownerFunction}`}
                        </span>
                        <span className={cn("inline-flex items-center gap-1", a.overdue && "font-semibold text-sev-critical")}>
                          <CalendarClock className="size-3" aria-hidden /> due {a.dueDate ?? "—"}
                        </span>
                        {a.overdue &&
                          (a.createdBy === "imported_capa" ? (
                            <Tooltip>
                              <TooltipTrigger render={<span tabIndex={0} className="cursor-help font-semibold text-sev-critical underline decoration-dotted" />}>
                                overdue per source snapshot
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                DQ-12: imported from the RCA deck (source status “{a.sourceStatus}”), a snapshot of unknown date. The plan date has passed, but the item may have
                                progressed since the snapshot.
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="font-semibold text-sev-critical">overdue</span>
                          ))}
                        {a.status === "done" && a.closedAt && (
                          <span className="inline-flex items-center gap-1 text-lime-deep">
                            <CheckCircle2 className="size-3" /> closed {a.closedAt}
                          </span>
                        )}
                      </div>
                      {a.source && (
                        <Link href={a.source.href} className="mt-1 block text-[11px] text-cyan-deep hover:underline">
                          {a.source.label}
                        </Link>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {ci > 0 && (
                          <button
                            onClick={() => act(a.id, () => api(`/api/actions/${a.id}`, "PATCH", { status: COLUMNS[ci - 1].id }))}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded border border-card-border px-2 py-0.5 text-xs hover:border-cyan"
                          >
                            <ArrowLeft className="size-3" /> {COLUMNS[ci - 1].label}
                          </button>
                        )}
                        <button onClick={() => setDialog({ mode: "edit", action: a })} className="inline-flex items-center gap-1 rounded border border-card-border px-2 py-0.5 text-xs hover:border-cyan" title="Edit details or reassign owner">
                          <Pencil className="size-3" /> Edit / reassign
                        </button>
                        <button
                          onClick={() => setHistoryOpen(historyOpen === a.id ? null : a.id)}
                          className="inline-flex items-center gap-1 rounded border border-card-border px-2 py-0.5 text-xs hover:border-cyan"
                          aria-expanded={historyOpen === a.id}
                        >
                          <History className="size-3" /> {a.events.length}
                        </button>
                        {a.createdBy !== "imported_capa" && (
                          <button
                            onClick={() => confirm(`Delete action #${a.id}?`) && act(a.id, () => api(`/api/actions/${a.id}`, "DELETE"))}
                            className="inline-flex items-center gap-1 rounded border border-card-border px-2 py-0.5 text-xs text-sev-critical hover:border-sev-critical"
                            aria-label={`Delete action ${a.id}`}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                        {ci < COLUMNS.length - 1 && (
                          <button
                            onClick={() => act(a.id, () => api(`/api/actions/${a.id}`, "PATCH", { status: COLUMNS[ci + 1].id }))}
                            disabled={busy}
                            className="ml-auto inline-flex items-center gap-1 rounded bg-navy px-2 py-0.5 text-xs text-white hover:bg-navy-deep"
                          >
                            {busy && <Loader2 className="size-3 animate-spin" />}
                            {ci + 1 === COLUMNS.length - 1 ? "Mark done" : COLUMNS[ci + 1].label} <ArrowRight className="size-3" />
                          </button>
                        )}
                      </div>

                      {historyOpen === a.id && (
                        <ol className="mt-2 space-y-1 border-t border-card-border pt-2 text-[11px]">
                          {a.events.map((e, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="shrink-0 font-mono text-muted-foreground">{e.at.slice(0, 16).replace("T", " ")}</span>
                              <span>
                                {e.detail}
                                {e.byRole && <span className="text-muted-foreground"> — by {e.byRole.replace("_", " ")}</span>}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  );
                })}
                {items.length === 0 && <li className="rounded-lg border border-dashed border-card-border p-4 text-center text-xs text-muted-foreground">Nothing here.</li>}
              </ul>
            </section>
          );
        })}
      </div>

      <ActionDialog
        open={dialog?.mode === "create"}
        title="New action"
        initial={createInitial}
        ownerCodes={ownerCodes}
        rcaOptions={rcaOptions}
        submitLabel="Create action"
        onClose={closeDialog}
        onSubmit={async (v) => {
          await api("/api/actions", "POST", {
            title: v.title,
            description: v.description || null,
            ownerCode: v.ownerCode || null,
            ownerFunction: v.ownerFunction,
            dueDate: v.dueDate || null,
            priority: v.priority,
            rcaId: v.rcaId || null,
          });
          router.refresh();
        }}
      />
      <ActionDialog
        open={dialog?.mode === "edit"}
        title={dialog?.mode === "edit" ? `Edit action #${dialog.action.id}` : ""}
        initial={editInitial}
        ownerCodes={ownerCodes}
        submitLabel="Save changes"
        onClose={closeDialog}
        onSubmit={async (v) => {
          if (dialog?.mode !== "edit") return;
          await api(`/api/actions/${dialog.action.id}`, "PATCH", {
            title: v.title,
            description: v.description || null,
            ownerCode: v.ownerCode || null,
            ownerFunction: v.ownerFunction,
            dueDate: v.dueDate || null,
            priority: v.priority,
          });
          router.refresh();
        }}
      />
    </>
  );
}
