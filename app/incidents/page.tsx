import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { X } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { functionFromSlug } from "@/lib/data/function-coverage";
import { fromJson } from "@/lib/data/json";
import { fmtDate, fmtKUsd, fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { FlagChips } from "@/components/flag-chips";
import { SeverityChip } from "@/components/severity";
import { severityFromPreRisk } from "@/lib/alerts/priority";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;
const PAGE_SIZE = 100;

const FILTERS: {
  key: string;
  label: string;
  apply: (v: string) => Prisma.IncidentWhereInput | null;
}[] = [
  {
    key: "fn",
    label: "Function",
    apply: (v) => {
      const f = functionFromSlug(v);
      return f ? { ownerFunction: f } : null;
    },
  },
  { key: "plant", label: "Plant", apply: (v) => ({ plantCode: v }) },
  { key: "mechanism", label: "Mechanism", apply: (v) => ({ failureMechanism: v }) },
  { key: "discipline", label: "Discipline", apply: (v) => ({ discipline: v }) },
  {
    key: "status",
    label: "Status",
    apply: (v) =>
      v === "active"
        ? { statusNormalized: { in: ["open", "in_progress", "monitoring"] } }
        : { statusNormalized: v },
  },
  { key: "raw", label: "Source status", apply: (v) => ({ overallStatus: v }) },
  { key: "overdue", label: "RCA overdue", apply: () => ({ rcaOverdue: true }) },
  { key: "month", label: "Month", apply: (v) => ({ monthKey: v }) },
  { key: "risk", label: "Pre-risk", apply: () => ({ preRisk: { in: ["I", "II", "III"] } }) },
  { key: "prerisk", label: "Pre-risk", apply: (v) => ({ preRisk: v }) },
  { key: "impact", label: "Highest impact", apply: (v) => ({ highestImpact: v }) },
  { key: "tag", label: "Equipment", apply: (v) => ({ equipmentTag: v }) },
  {
    key: "flag",
    label: "DQ flag",
    apply: (v) => ({ dataQualityFlagsJson: { contains: `"${v}"` } }),
  },
];

const filterValueLabel = (key: string, v: string) =>
  key === "overdue"
    ? "yes"
    : key === "risk"
      ? "I–III elevated"
      : key === "status" && v === "active"
        ? "active"
        : v;

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const active = FILTERS.filter((f) => sp[f.key]);
  const where: Prisma.IncidentWhereInput = {
    AND: active
      .map((f) => f.apply(sp[f.key]!))
      .filter(Boolean) as Prisma.IncidentWhereInput[],
  };
  const orderBy: Prisma.IncidentOrderByWithRelationInput =
    sp.sort === "loss"
      ? { totalLossKUSD: "desc" }
      : sp.sort === "risk"
        ? { riskScore: "desc" }
        : { serialNo: "asc" };

  const page = Math.max(1, Number(sp.page) || 1);
  const [rows, agg, dq] = await Promise.all([
    prisma.incident.findMany({
      where,
      orderBy,
      include: { equipment: { select: { isFocus: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.incident.aggregate({
      where,
      _sum: { totalLossKUSD: true, downtimeHours: true },
      _count: { _all: true },
    }),
    prisma.dataQualityIssue.findMany({
      where: { entity: "Incident" },
      select: { recordId: true, code: true },
    }),
  ]);
  const codes = new Map<string, string[]>();
  for (const d of dq)
    codes.set(d.recordId, [
      ...(codes.get(d.recordId) ?? []),
      d.code,
    ].filter((c) => c !== "DQ-11"));

  const without = (key: string) => {
    const q = new URLSearchParams(
      Object.entries(sp).filter(
        ([k, v]) => k !== key && k !== "page" && v,
      ) as [string, string][],
    );
    return `/incidents${q.size ? `?${q}` : ""}`;
  };
  const withSort = (s: string) => {
    const q = new URLSearchParams(
      Object.entries({ ...sp, sort: s, page: undefined }).filter(
        ([, v]) => v,
      ) as [string, string][],
    );
    return `/incidents?${q}`;
  };

  return (
    <>
      <PageHeader title="Incidents">
        {/* Summary aggregates in the header */}
        <div className="flex items-center gap-5">
          <div>
            <div className="font-mono text-[22px] font-bold leading-none text-[#111827]">
              {fmtNum(agg._count._all)}
            </div>
            <div className="text-[11px] text-[#6B7280]">records</div>
          </div>
          <div>
            <div className="font-mono text-[22px] font-bold leading-none text-[#111827]">
              {fmtKUsd(agg._sum.totalLossKUSD ?? 0)}
            </div>
            <div className="text-[11px] text-[#6B7280]">total loss</div>
          </div>
        </div>
      </PageHeader>

      {/* Active filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {active.length === 0 ? (
          <span className="text-[12px] text-[#9CA3AF]">No filters active</span>
        ) : (
          active.map((f) => (
            <Link
              key={f.key}
              href={without(f.key)}
              className="inline-flex items-center gap-1 rounded border border-[#93C5FD] bg-[#EFF6FF] px-2 py-0.5 text-[12px] text-[#1D4ED8] hover:border-[#2563EB]"
            >
              {f.label}: <strong>{filterValueLabel(f.key, sp[f.key]!)}</strong>
              <X className="size-3" aria-label="Remove filter" />
            </Link>
          ))
        )}

        {/* Sort controls */}
        <div className="ml-auto flex items-center gap-1 text-[12px]">
          <span className="text-[#6B7280]">Sort:</span>
          {(
            [
              ["serial", "Serial"],
              ["loss", "Loss"],
              ["risk", "Risk"],
            ] as const
          ).map(([k, l]) => (
            <Link
              key={k}
              href={withSort(k)}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors",
                (sp.sort ?? "serial") === k
                  ? "bg-[#111827] text-white font-medium"
                  : "text-[#6B7280] hover:text-[#111827]",
              )}
            >
              {l}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded border border-[#E5E7EB] bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Incident</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Date</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Plant</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Equipment</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Mechanism</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Pre-risk</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Status</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">Owner</TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">RCA due</TableHead>
              <TableHead className="text-right text-[12px] font-medium text-[#6B7280]">
                Loss
              </TableHead>
              <TableHead className="text-[12px] font-medium text-[#6B7280]">DQ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => {
              const isOverdue = i.rcaOverdue;
              return (
                <TableRow
                  key={i.serialNo}
                  className={cn(
                    "border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]",
                    isOverdue && "bg-red-50/50 hover:bg-red-50",
                  )}
                >
                  <TableCell className="font-mono text-[12px] text-[#111827]">
                    {i.incidentId}
                    <div className="text-[11px] text-[#9CA3AF]">{i.arNo ?? "—"}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[12px] text-[#374151]">
                    {fmtDate(i.dateOfOccurrence)}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-[#374151]">
                    {i.plantCode}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/equipment/${i.equipmentTag}`}
                      className="font-mono text-[13px] font-semibold text-[#111827] hover:text-[#2563EB] hover:underline"
                    >
                      {i.equipmentTag}
                    </Link>
                    <div className="text-[11px] text-[#9CA3AF]">{i.equipmentType}</div>
                  </TableCell>
                  <TableCell className="text-[12px] text-[#374151]">
                    {i.failureMechanism}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-[12px] font-semibold text-[#374151]">
                        {i.preRisk}
                      </span>
                      <SeverityChip
                        severity={severityFromPreRisk(i.preRisk)}
                        className="scale-90"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-[12px] text-[#374151]">
                    {i.statusNormalized}
                    {isOverdue && (
                      <div className="text-[11px] font-semibold text-red-600">RCA overdue</div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-[#374151]">
                    {i.picRca}
                    <div className="font-sans text-[11px] text-[#9CA3AF]">{i.ownerFunction}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-[12px] text-[#374151]">
                    {i.rcaDueDate ? (
                      fmtDate(i.rcaDueDate)
                    ) : (
                      <span className="text-[#9CA3AF]">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12px] font-semibold text-[#111827]">
                    {fmtKUsd(i.totalLossKUSD)}
                  </TableCell>
                  <TableCell>
                    <FlagChips
                      flags={fromJson<string[]>(i.dataQualityFlagsJson, [])}
                      codes={codes.get(String(i.serialNo)) ?? []}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Pager page={page} total={agg._count._all} sp={sp} />
    </>
  );
}

function Pager({ page, total, sp }: { page: number; total: number; sp: SP }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1) return null;
  const href = (p: number) =>
    `/incidents?${new URLSearchParams(
      Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][],
    )}`;
  return (
    <div className="mt-4 flex items-center justify-between text-[12px]">
      <span className="text-[#6B7280]">
        Rows {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of{" "}
        {fmtNum(total)}
      </span>
      <span className="flex gap-1">
        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
          <Link
            key={p}
            href={href(p)}
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
  );
}
