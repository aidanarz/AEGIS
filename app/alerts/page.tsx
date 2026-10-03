import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Bot, X } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { fromJson } from "@/lib/data/json";
import type { ScoreBreakdown } from "@/lib/alerts/priority";
import { fmtDate, fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { PriorityScore, SeverityChip } from "@/components/severity";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
const PAGE = 50;
const SOURCES = [
  ["detector", "Detector"],
  ["healthStatus", "Weekly health"],
  ["incident", "Incident DB"],
] as const;
const SEVERITIES = ["critical", "high", "medium", "low"];
const STATUSES = ["open", "acknowledged", "resolved"];

export default async function AlertsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const where: Prisma.AlertWhereInput = {};
  if (sp.source) where.source = sp.source;
  if (sp.severity) where.severity = sp.severity;
  if (sp.status) where.status = sp.status;
  if (sp.min) where.priorityScore = { gte: Number(sp.min) };
  if (sp.q) where.equipmentTag = { contains: sp.q.toUpperCase() };
  const orderBy: Prisma.AlertOrderByWithRelationInput[] =
    sp.sort === "age" ? [{ triggeredAt: "asc" }] : sp.sort === "recent" ? [{ triggeredAt: "desc" }] : [{ priorityScore: "desc" }, { triggeredAt: "desc" }];
  const page = Math.max(1, Number(sp.page) || 1);

  const [alerts, total, counts, analysed] = await Promise.all([
    prisma.alert.findMany({ where, orderBy, skip: (page - 1) * PAGE, take: PAGE, include: { incident: { select: { picRca: true, ownerFunction: true } }, _count: { select: { actions: true } } } }),
    prisma.alert.count({ where }),
    prisma.alert.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.aiAnalysis.findMany({ distinct: ["alertId"], select: { alertId: true } }),
  ]);
  const analysedIds = new Set(analysed.map((a) => a.alertId));
  const now = Date.now();

  const href = (patch: SP) => {
    const merged: SP = { ...sp, page: undefined, ...patch };
    const q = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => !!e[1]));
    return `/alerts${q.size ? `?${q}` : ""}`;
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
      <PageHeader pillar="Pillar 3 · AI Root Cause & Action" title="Alert feed">
        <div className="text-right text-xs text-muted-foreground">
          {counts.map((c) => `${c._count._all} ${SOURCES.find((s) => s[0] === c.source)?.[1] ?? c.source}`).join(" · ")}
          <div>Ranked by PRD §7.1 priority score, not recency. Hover a score for its breakdown.</div>
        </div>
      </PageHeader>

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/alerts">
        <span className="text-xs text-muted-foreground">Source</span>
        {SOURCES.map(([v, l]) => (
          <Chip key={v} k="source" v={v} label={l} />
        ))}
        <span className="ml-3 text-xs text-muted-foreground">Severity</span>
        {SEVERITIES.map((v) => (
          <Chip key={v} k="severity" v={v} label={v} />
        ))}
        <span className="ml-3 text-xs text-muted-foreground">Status</span>
        {STATUSES.map((v) => (
          <Chip key={v} k="status" v={v} label={v} />
        ))}
        <Chip k="min" v="0.7" label="score ≥ 0.7" />
        <input name="q" defaultValue={sp.q} placeholder="Equipment tag…" className="ml-auto rounded-md border border-card-border px-2 py-1 text-sm" />
        {Object.entries(sp)
          .filter(([k, v]) => k !== "q" && k !== "page" && v)
          .map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        {Object.values(sp).some(Boolean) && (
          <Link href="/alerts" className="inline-flex items-center gap-0.5 text-xs text-sev-critical hover:underline">
            <X className="size-3" /> clear
          </Link>
        )}
      </form>

      <Card className="border-card-border py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Link href={href({ sort: undefined })} className={!sp.sort ? "font-bold text-navy" : "text-cyan-deep"}>
                  Priority ↓
                </Link>
              </TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead className="w-[34%]">Alert</TableHead>
              <TableHead>
                <Link href={href({ sort: sp.sort === "recent" ? "age" : "recent" })} className={sp.sort ? "font-bold text-navy" : "text-cyan-deep"}>
                  Triggered {sp.sort === "age" ? "↑" : sp.sort === "recent" ? "↓" : ""}
                </Link>
              </TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>AI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <PriorityScore score={a.priorityScore} breakdown={fromJson<ScoreBreakdown | null>(a.scoreBreakdownJson, null)} />
                </TableCell>
                <TableCell>
                  <SeverityChip severity={a.severity} />
                </TableCell>
                <TableCell className="text-xs">{SOURCES.find((s) => s[0] === a.source)?.[1]}</TableCell>
                <TableCell>
                  <Link href={`/equipment/${a.equipmentTag}`} className="font-semibold text-navy hover:underline">
                    {a.equipmentTag}
                  </Link>
                  <div className="text-[10px] text-muted-foreground">{a.plantCode}</div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <Link href={`/alerts/${a.id}`} className="font-medium text-navy hover:text-cyan-deep hover:underline">
                    {a.title}
                  </Link>
                  <div className="truncate text-[11px] text-muted-foreground">{a.triggeredBy}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{fmtDate(a.triggeredAt)}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{fmtNum((now - a.triggeredAt.getTime()) / 86_400_000)} d</TableCell>
                <TableCell className="font-mono text-xs">
                  {a.incident?.picRca ?? "—"}
                  <div className="font-sans text-[10px] text-muted-foreground">{a.incident?.ownerFunction}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {a.status}
                  {a._count.actions > 0 && <div className="text-[10px] text-lime-deep">{a._count.actions} action(s)</div>}
                </TableCell>
                <TableCell>{analysedIds.has(a.id) && <Bot className="size-4 text-cyan-deep" aria-label="AI analysis available" />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {total > PAGE && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total}
          </span>
          <span className="flex gap-1">
            {Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`${href({})}${href({}).includes("?") ? "&" : "?"}page=${p}`}
                className={p === page ? "rounded bg-navy px-2.5 py-1 text-white" : "rounded border border-card-border bg-white px-2.5 py-1 text-navy hover:border-cyan"}
              >
                {p}
              </Link>
            ))}
          </span>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Age is measured from the trigger time to today. Incident alerts trigger on their RCA due date (FR-3.1c); detector and weekly alerts on the reading that raised them.
      </p>
    </>
  );
}
