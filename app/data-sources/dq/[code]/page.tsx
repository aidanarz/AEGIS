import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { DQ_BY_CODE } from "@/lib/data/dq-catalog";
import { fromJson } from "@/lib/data/json";
import { fmtDate, fmtKUsd } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { DqSeverityChip } from "@/components/status-chips";
import { FlagChips } from "@/components/flag-chips";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DqDrillPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const def = DQ_BY_CODE[code.toUpperCase()];
  if (!def) notFound();

  const issues = await prisma.dataQualityIssue.findMany({ where: { code: def.code }, orderBy: [{ entity: "asc" }, { id: "asc" }] });
  const incidentIds = issues.filter((i) => i.entity === "Incident").map((i) => Number(i.recordId));
  const incidents = incidentIds.length ? await prisma.incident.findMany({ where: { serialNo: { in: incidentIds } }, orderBy: { serialNo: "asc" } }) : [];
  const issueByRecord = new Map(issues.map((i) => [i.recordId, i]));

  // All DQ codes on each shown incident (a record can carry several findings).
  const allCodes = incidentIds.length
    ? await prisma.dataQualityIssue.findMany({ where: { entity: "Incident", recordId: { in: incidentIds.map(String) } }, select: { recordId: true, code: true } })
    : [];
  const codesFor = (serial: number) => allCodes.filter((c) => c.recordId === String(serial)).map((c) => c.code);

  return (
    <>
      <Link href="/data-sources#dq" className="mb-3 inline-flex items-center gap-1 text-sm text-cyan-deep hover:underline">
        <ArrowLeft className="size-4" /> Data Sources
      </Link>
      <PageHeader pillar={`Data-quality finding · ${def.code}`} title={def.title}>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums text-navy">{issues.length}</div>
          <div className="text-xs text-muted-foreground">flagged records (PRD: {def.prdScale})</div>
        </div>
      </PageHeader>

      <Card className="mb-6 border-card-border p-4 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <DqSeverityChip severity={def.severity} />
          <span className="font-mono text-xs text-muted-foreground">flag: {def.flag}</span>
        </div>
        <p className="mt-2">
          <span className="font-semibold text-navy">Handling: </span>
          {def.handling}
        </p>
      </Card>

      {incidents.length > 0 ? (
        <Card className="border-card-border py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incident</TableHead>
                <TableHead>Plant</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Risk case</TableHead>
                <TableHead>Mechanism (raw)</TableHead>
                <TableHead>AR No.</TableHead>
                <TableHead>MTO No.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>RCA due</TableHead>
                <TableHead className="text-right">Total loss</TableHead>
                <TableHead>Source flags · DQ codes</TableHead>
                <TableHead className="w-[22%]">Finding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.map((i) => (
                <TableRow key={i.serialNo}>
                  <TableCell className="font-mono text-xs">
                    {i.incidentId}
                    <div className="text-muted-foreground">serial {i.serialNo}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{i.plantCode}</TableCell>
                  <TableCell className="font-semibold text-navy">{i.equipmentTag}</TableCell>
                  <TableCell className="max-w-56 whitespace-normal text-xs">{i.riskCaseTitle}</TableCell>
                  <TableCell className="text-xs">{i.failureMechanism}</TableCell>
                  <TableCell className="font-mono text-xs">{i.arNo ?? <span className="text-sev-critical">null</span>}</TableCell>
                  <TableCell className="font-mono text-xs">{i.mtoNo}</TableCell>
                  <TableCell className="text-xs">
                    {i.statusNormalized}
                    <div className="text-muted-foreground">{i.overallStatus}</div>
                  </TableCell>
                  <TableCell className="text-xs">{i.rcaDueDate ? fmtDate(i.rcaDueDate) : <span className="text-muted-foreground">null</span>}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmtKUsd(i.totalLossKUSD)}</TableCell>
                  <TableCell>
                    <FlagChips flags={fromJson<string[]>(i.dataQualityFlagsJson, [])} codes={codesFor(i.serialNo)} />
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs text-muted-foreground">{issueByRecord.get(String(i.serialNo))?.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="border-card-border py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead>Plant</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-1/2">Finding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {issues.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-xs">{i.entity}</TableCell>
                  <TableCell className="font-mono text-xs">{i.recordId}</TableCell>
                  <TableCell className="font-semibold text-navy">{i.equipmentTag ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{i.plantCode ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{i.sourceSystem}</TableCell>
                  <TableCell className="whitespace-normal text-sm">{i.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
