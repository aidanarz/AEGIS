import Link from "next/link";
import { X } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { isOverdue, listActions } from "@/lib/actions/service";
import { fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { ActionBoard, type BoardAction } from "@/components/actions/action-board";
import { cn } from "@/lib/utils";
import { ownerFunctionFromPic } from "@/lib/data/normalize";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

export default async function ActionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const all = await listActions(prisma, { owner: sp.owner ?? null, createdBy: sp.origin ?? null, overdue: sp.overdue === "1" });
  const actions: BoardAction[] = all.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    ownerCode: a.ownerCode,
    ownerFunction: a.ownerFunction,
    dueDate: a.dueDate?.toISOString().slice(0, 10) ?? null,
    status: a.status,
    sourceStatus: a.sourceStatus,
    priority: a.priority,
    createdBy: a.createdBy,
    overdue: isOverdue(a),
    closedAt: a.closedAt?.toISOString().slice(0, 10) ?? null,
    source: a.alert
      ? { label: `from alert: ${a.alert.title} (${a.alert.equipmentTag})`, href: `/alerts/${a.alert.id}` }
      : a.rcaReport
        ? { label: `CAPA of ${a.rcaReport.rcaId} (${a.rcaReport.equipmentTag})`, href: `/equipment/${a.rcaReport.equipmentTag}` }
        : null,
    capaRef: a.capaAction ? `${a.capaAction.kind === "corrective" ? "CA" : "PA"} · ${a.capaAction.ref}` : null,
    rcaId: a.rcaId,
    events: a.events.map((e) => ({ at: e.at.toISOString(), kind: e.kind, detail: e.detail, byRole: e.byRole })),
  }));
  const ownerCodes = (await prisma.incident.groupBy({ by: ["picRca"], _count: { _all: true } }))
    .map((o) => ({ code: o.picRca, fn: ownerFunctionFromPic(o.picRca), incidents: o._count._all }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const rcaOptions = await prisma.rcaReport.findMany({ select: { rcaId: true, equipmentTag: true }, orderBy: { rcaId: "asc" } });

  const totals = await prisma.action.groupBy({ by: ["status"], _count: { _all: true } });
  const count = (s: string) => totals.find((t) => t.status === s)?._count._all ?? 0;
  const overdue = actions.filter((a) => a.overdue).length;
  const owners = [...new Set((await prisma.action.findMany({ select: { ownerFunction: true } })).map((a) => a.ownerFunction).filter(Boolean))] as string[];

  const href = (patch: SP) => {
    const q = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/actions${q.size ? `?${q}` : ""}`;
  };
  const Chip = ({ k, v, label }: { k: string; v: string; label: string }) => (
    <Link
      href={href({ [k]: sp[k] === v ? undefined : v })}
      className={cn("rounded-full border px-2 py-0.5 text-xs", sp[k] === v ? "border-navy bg-navy text-white" : "border-card-border bg-white text-navy hover:border-cyan")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader pillar="Pillar 3 · Ownership & tracking" title="Action Tracker">
        <div className="text-right text-sm">
          <span className="font-bold text-navy">{fmtNum(count("open"))}</span> open · <span className="font-bold text-navy">{fmtNum(count("in_progress"))}</span> in progress ·{" "}
          <span className="font-bold text-lime-deep">{fmtNum(count("done"))}</span> done · <span className="font-bold text-sev-critical">{overdue}</span> overdue (shown)
          <div className="text-xs text-muted-foreground">Seeded with the 20 real CAPA items (corrective + pro-active) from the 5 RCA decks — nothing invented.</div>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Owner function</span>
        {owners.map((o) => (
          <Chip key={o} k="owner" v={o} label={o} />
        ))}
        <span className="ml-3 text-xs text-muted-foreground">Origin</span>
        <Chip k="origin" v="imported-capa" label="imported CAPA" />
        <Chip k="origin" v="ai" label="AI" />
        <Chip k="origin" v="user-edited" label="user-edited" />
        <Chip k="origin" v="user" label="manual" />
        <Chip k="overdue" v="1" label="overdue only" />
        {Object.values(sp).some(Boolean) && (
          <Link href="/actions" className="inline-flex items-center gap-0.5 text-xs text-sev-critical hover:underline">
            <X className="size-3" /> clear
          </Link>
        )}
      </div>

      <ActionBoard actions={actions} ownerCodes={ownerCodes} rcaOptions={rcaOptions} />
    </>
  );
}
