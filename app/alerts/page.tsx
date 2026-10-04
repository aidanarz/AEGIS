import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Bot, X } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { fromJson } from "@/lib/data/json";
import type { ScoreBreakdown } from "@/lib/alerts/priority";
import { fmtDate, fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { PriorityScore, SeverityChip } from "@/components/severity";
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
    sp.sort === "age"
      ? [{ triggeredAt: "asc" }]
      : sp.sort === "recent"
        ? [{ triggeredAt: "desc" }]
        : [{ priorityScore: "desc" }, { triggeredAt: "desc" }];
  const page = Math.max(1, Number(sp.page) || 1);

  const [alerts, total, , analysed] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        incident: { select: { picRca: true, ownerFunction: true } },
        _count: { select: { actions: true } },
      },
    }),
    prisma.alert.count({ where }),
    prisma.alert.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.aiAnalysis.findMany({ distinct: ["alertId"], select: { alertId: true } }),
  ]);
  const analysedIds = new Set(analysed.map((a) => a.alertId));
  const now = Date.now();

  const href = (patch: SP) => {
    const merged: SP = { ...sp, page: undefined, ...patch };
    const q = new URLSearchParams(
      Object.entries(merged).filter((e): e is [string, string] => !!e[1]),
    );
    return `/alerts${q.size ? `?${q}` : ""}`;
  };

  // Filter chip component
  const Chip = ({ k, v, label }: { k: string; v: string; label: string }) => (
    <Link
      href={href({ [k]: sp[k] === v ? undefined : v })}
      className={cn(
        "rounded border px-2 py-0.5 text-[12px] transition-colors",
        sp[k] === v
          ? "border-[#2563EB] bg-[#EFF6FF] text-[#1D4ED8] font-medium"
          : "border-[#E5E7EB] bg-white text-[#374151] hover:border-[#93C5FD] hover:bg-[#EFF6FF]",
      )}
    >
      {label}
    </Link>
  );

  const hasFilters = Object.values(sp).some(Boolean);

  return (
    <>
      <PageHeader title="Alert feed" />

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#6B7280]">Source</span>
        {SOURCES.map(([v, l]) => (
          <Chip key={v} k="source" v={v} label={l} />
        ))}
        <span className="ml-2 text-[12px] text-[#6B7280]">Severity</span>
        {SEVERITIES.map((v) => (
          <Chip key={v} k="severity" v={v} label={v} />
        ))}
        <span className="ml-2 text-[12px] text-[#6B7280]">Status</span>
        {STATUSES.map((v) => (
          <Chip key={v} k="status" v={v} label={v} />
        ))}
        <Chip k="min" v="0.7" label="score ≥ 0.7" />

        {/* Search input */}
        <form action="/alerts" className="ml-auto flex items-center gap-2">
          {Object.entries(sp)
            .filter(([k, v]) => k !== "q" && k !== "page" && v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="Equipment tag…"
            className="rounded border border-[#E5E7EB] bg-white px-2.5 py-1 text-[13px] text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
          />
        </form>

        {/* Clear all */}
        {hasFilters && (
          <Link
            href="/alerts"
            className="inline-flex items-center gap-0.5 text-[12px] text-red-600 hover:underline"
          >
            <X className="size-3" aria-hidden />
            Clear filters
          </Link>
        )}
      </div>

      {/* Results count */}
      <p className="mb-3 text-[12px] text-[#6B7280]">
        {fmtNum(total)} alert{total !== 1 ? "s" : ""}
        {hasFilters ? " matching filters" : ""}
      </p>

      {/* Table */}
      <div className="rounded border border-[#E5E7EB] bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              <TableHead className="text-[12px] font-medium text-[#6B7280]">
                <Link
                  href={href({ sort: undefined })}
                  className={!sp.sort ? "font-semibold text-[#111827]" : "text-[#6B7280]"}
                >
                  Priority ↓
                </Link>
              </TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Severity</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Source</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Equipment</TableHead>
              <TableHead className="w-[32%] text-[12px] font-medium text-[#6B7280]">Alert</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">
                <Link
                  href={href({ sort: sp.sort === "recent" ? "age" : "recent" })}
                  className={sp.sort ? "font-semibold text-[#111827]" : "text-[#6B7280]"}
                >
                  Triggered {sp.sort === "age" ? "↑" : sp.sort === "recent" ? "↓" : ""}
                </Link>
              </TableHead>
              <TableHead className="text-right text-[12px] font-medium text-[#6B7280]">Age</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Owner</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Status</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">AI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((a) => {
              const isCritical = a.severity === "critical";
              return (
                <TableRow
                  key={a.id}
                  className={cn(
                    "border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]",
                    isCritical && "bg-red-50/60 hover:bg-red-50",
                  )}
                >
                  <TableCell>
                    <PriorityScore
                      score={a.priorityScore}
                      breakdown={fromJson<ScoreBreakdown | null>(a.scoreBreakdownJson, null)}
                    />
                  </TableCell>
                  <TableCell>
                    <SeverityChip severity={a.severity} />
                  </TableCell>
                  <TableCell className="text-[12px] text-[#6B7280]">
                    {SOURCES.find((s) => s[0] === a.source)?.[1]}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/equipment/${a.equipmentTag}`}
                      className="font-mono text-[13px] font-semibold text-[#111827] hover:text-[#2563EB] hover:underline"
                    >
                      {a.equipmentTag}
                    </Link>
                    <div className="font-mono text-[11px] text-[#6B7280]">{a.plantCode}</div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <Link
                      href={`/alerts/${a.id}`}
                      className="text-[13px] font-medium text-[#111827] hover:text-[#2563EB] hover:underline"
                    >
                      {a.title}
                    </Link>
                    <div className="truncate text-[11px] text-[#9CA3AF]">{a.triggeredBy}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[12px] text-[#374151]">
                    {fmtDate(a.triggeredAt)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12px] text-[#374151]">
                    {fmtNum((now - a.triggeredAt.getTime()) / 86_400_000)} d
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-[#374151]">
                    {a.incident?.picRca ?? "—"}
                    <div className="font-sans text-[11px] text-[#9CA3AF]">
                      {a.incident?.ownerFunction}
                    </div>
                  </TableCell>
                  <TableCell className="text-[12px] text-[#374151]">
                    {a.status}
                    {a._count.actions > 0 && (
                      <div className="text-[11px] text-green-700">
                        {a._count.actions} action{a._count.actions > 1 ? "s" : ""}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {analysedIds.has(a.id) && (
                      <Bot
                        className="size-4 text-[#2563EB]"
                        aria-label="AI analysis available"
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > PAGE && (
        <div className="mt-4 flex items-center justify-between text-[12px]">
          <span className="text-[#6B7280]">
            {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {fmtNum(total)}
          </span>
          <span className="flex gap-1">
            {Array.from({ length: Math.ceil(total / PAGE) }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={`${href({})}${href({}).includes("?") ? "&" : "?"}page=${p}`}
                className={cn(
                  "rounded border px-2.5 py-1 font-mono transition-colors",
                  p === page
                    ? "border-[#2563EB] bg-[#2563EB] text-white"
                    : "border-[#E5E7EB] bg-white text-[#374151] hover:border-[#93C5FD]",
                )}
              >
                {p}
              </Link>
            ))}
          </span>
        </div>
      )}
    </>
  );
}
