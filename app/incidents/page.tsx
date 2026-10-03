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
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

type SP = Record<string, string | undefined>;

const PAGE_SIZE = 100;

const FILTERS: { key: string; label: string; apply: (v: string) => Prisma.IncidentWhereInput | null }[] = [
  { key: "fn", label: "Function", apply: (v) => { const f = functionFromSlug(v); return f ? { ownerFunction: f } : null; } },
  { key: "plant", label: "Plant", apply: (v) => ({ plantCode: v }) },
  { key: "mechanism", label: "Mechanism", apply: (v) => ({ failureMechanism: v }) },
  { key: "discipline", label: "Discipline", apply: (v) => ({ discipline: v }) },
  { key: "status", label: "Status", apply: (v) => (v === "active" ? { statusNormalized: { in: ["open", "in_progress", "monitoring"] } } : { statusNormalized: v }) },
  { key: "raw", label: "Source status", apply: (v) => ({ overallStatus: v }) },
  { key: "overdue", label: "RCA overdue", apply: () => ({ rcaOverdue: true }) },
  { key: "month", label: "Month", apply: (v) => ({ monthKey: v }) },
  { key: "risk", label: "Pre-risk", apply: () => ({ preRisk: { in: ["I", "II", "III"] } }) },
  { key: "prerisk", label: "Pre-risk", apply: (v) => ({ preRisk: v }) },
  { key: "impact", label: "Highest impact", apply: (v) => ({ highestImpact: v }) },
  { key: "tag", label: "Equipment", apply: (v) => ({ equipmentTag: v }) },
  { key: "flag", label: "Source DQ flag", apply: (v) => ({ dataQualityFlagsJson: { contains: `"${v}"` } }) },
];

const filterValueLabel = (key: string, v: string) =>
  key === "overdue" ? "yes" : key === "risk" ? "I–III (elevated)" : key === "status" && v === "active" ? "active (open + in progress + monitoring)" : v;

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const active = FILTERS.filter((f) => sp[f.key]);
  const where: Prisma.IncidentWhereInput = { AND: active.map((f) => f.apply(sp[f.key]!)).filter(Boolean) as Prisma.IncidentWhereInput[] };
  const orderBy: Prisma.IncidentOrderByWithRelationInput = sp.sort === "loss" ? { totalLossKUSD: "desc" } : sp.sort === "risk" ? { riskScore: "desc" } : { serialNo: "asc" };

  const page = Math.max(1, Number(sp.page) || 1);
  const [rows, agg, dq] = await Promise.all([
    prisma.incident.findMany({ where, orderBy, include: { equipment: { select: { isFocus: true } } }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.incident.aggregate({ where, _sum: { totalLossKUSD: true, downtimeHours: true }, _count: { _all: true } }),
    prisma.dataQualityIssue.findMany({ where: { entity: "Incident" }, select: { recordId: true, code: true } }),
  ]);
  const codes = new Map<string, string[]>();
  for (const d of dq) codes.set(d.recordId, [...(codes.get(d.recordId) ?? []), d.code].filter((c) => c !== "DQ-11"));

  const without = (key: string) => {
    const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== key && k !== "page" && v) as [string, string][]);
    return `/incidents${q.size ? `?${q}` : ""}`;
  };
  const withSort = (s: string) => {
    const q = new URLSearchParams(Object.entries({ ...sp, sort: s, page: undefined }).filter(([, v]) => v) as [string, string][]);
    return `/incidents?${q}`;
  };

  return (
    <>
      <PageHeader pillar="Unified records · Incident Database (FR-2.4)" title="Incident records">
        <div className="text-right text-sm">
          <div className="text-2xl font-bold tabular-nums text-navy">{fmtNum(agg._count._all)}</div>
          <div className="text-xs text-muted-foreground">
            {fmtKUsd(agg._sum.totalLossKUSD ?? 0)} total loss · {fmtNum(agg._sum.downtimeHours ?? 0, 1)} h downtime
          </div>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Filters:</span>
        {active.length === 0 && <span className="text-muted-foreground">none (all 380)</span>}
        {active.map((f) => (
          <Link key={f.key} href={without(f.key)} className="inline-flex items-center gap-1 rounded-full border border-navy/30 bg-white px-2 py-0.5 text-xs hover:border-sev-critical">
            {f.label}: <strong>{filterValueLabel(f.key, sp[f.key]!)}</strong>
            <X className="size-3" aria-label="remove filter" />
          </Link>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          Sort:{" "}
          {[
            ["serial", "serial"],
            ["loss", "loss"],
            ["risk", "risk score"],
          ].map(([k, l]) => (
            <Link key={k} href={withSort(k)} className={(sp.sort ?? "serial") === k ? "font-semibold text-navy" : "text-cyan-deep hover:underline"}>
              {" "}
              {l}
            </Link>
          ))}
        </span>
      </div>

      <Card className="border-card-border py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Incident</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Plant</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Risk case</TableHead>
              <TableHead>Mechanism</TableHead>
              <TableHead>Pre-risk</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>RCA due</TableHead>
              <TableHead className="text-right">Downtime</TableHead>
              <TableHead className="text-right">Total loss</TableHead>
              <TableHead>Data-quality flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.serialNo}>
                <TableCell className="font-mono text-xs">
                  {i.incidentId}
                  <div className="text-muted-foreground">{i.arNo ?? "no AR No."}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{fmtDate(i.dateOfOccurrence)}</TableCell>
                <TableCell className="font-mono text-xs">{i.plantCode}</TableCell>
                <TableCell>
                  <Link href={`/equipment/${i.equipmentTag}`} className="font-semibold text-navy hover:underline">
                    {i.equipmentTag}
                  </Link>
                  <div className="text-[10px] text-muted-foreground">
                    {i.equipmentType} · class {i.equipmentClass} · {i.equipment.isFocus ? "4/4 sources" : "1/4 sources"}
                  </div>
                </TableCell>
                <TableCell className="max-w-60 whitespace-normal text-xs">{i.riskCaseTitle}</TableCell>
                <TableCell className="text-xs">{i.failureMechanism}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="w-6 font-mono text-xs">{i.preRisk}</span>
                    <SeverityChip severity={severityFromPreRisk(i.preRisk)} className="scale-90" />
                  </div>
                </TableCell>
                <TableCell className="text-xs">
                  {i.statusNormalized}
                  {i.rcaOverdue && <div className="font-semibold text-sev-critical">RCA overdue</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {i.picRca}
                  <div className="font-sans text-[10px] text-muted-foreground">{i.ownerFunction}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs">{i.rcaDueDate ? fmtDate(i.rcaDueDate) : <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{fmtNum(i.downtimeHours, 1)} h</TableCell>
                <TableCell className="text-right text-xs font-semibold tabular-nums">{fmtKUsd(i.totalLossKUSD)}</TableCell>
                <TableCell>
                  <FlagChips flags={fromJson<string[]>(i.dataQualityFlagsJson, [])} codes={codes.get(String(i.serialNo)) ?? []} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <Pager page={page} total={agg._count._all} sp={sp} />
      <p className="mt-2 text-[11px] text-muted-foreground">
        DQ-11 (status mapping) applies to every row and is omitted from the chips. Pre-risk severity colour uses the PRD §7.1 assumption (I/II critical, III
        high, IV medium).
      </p>
    </>
  );
}

function Pager({ page, total, sp }: { page: number; total: number; sp: SP }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1) return null;
  const href = (p: number) => `/incidents?${new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        Rows {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
      </span>
      <span className="flex gap-1">
        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
          <Link
            key={p}
            href={href(p)}
            className={p === page ? "rounded bg-navy px-2.5 py-1 text-white" : "rounded border border-card-border bg-white px-2.5 py-1 text-navy hover:border-cyan"}
          >
            {p}
          </Link>
        ))}
      </span>
    </div>
  );
}
