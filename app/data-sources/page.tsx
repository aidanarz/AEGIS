import Link from "next/link";
import { ChevronRight, Database, Link2 } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { getDataSourcesOverview } from "@/lib/data/data-sources";
import { getFunctionCoverage } from "@/lib/data/function-coverage";
import { KPI_CATEGORIES } from "@/lib/data/normalize";
import { fmtBytes, fmtInstant, fmtNum } from "@/lib/format";
import { PageHeader, Section } from "@/components/page-header";
import { RevalidateButton } from "@/components/revalidate-button";
import { CheckMark, DqSeverityChip, SourceStatusChip } from "@/components/status-chips";
import { FunctionCoverageGrid } from "@/components/function-coverage-grid";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  equipment: "Equipment Performance",
  incident: "Incident Database",
  production: "Production Data",
  rca: "RCA & Downtime",
  "cross-source": "Cross-source",
};

export default async function DataSourcesPage() {
  const [o, coverage] = await Promise.all([
    getDataSourcesOverview(prisma),
    getFunctionCoverage(prisma),
  ]);
  const totalDq = o.dq.reduce((n, d) => n + d.count, 0);
  const crossSourceDq = o.dq.filter((d) => d.source === "cross-source");

  return (
    <>
      <PageHeader pillar="Pillar 1 · Unified Data Foundation (KQ1)" title="Data sources & governance">
        <RevalidateButton />
      </PageHeader>

      {/* ── 1. Per-source status ─────────────────────────────────────────── */}
      <Section
        title="Source status"
        description="The 4 case datasets, ingested into one common schema. Counts are live from the database; last refresh is the latest load or re-validation run."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {o.sources.map((s) => (
            <div
              key={s.key}
              className="flex flex-col gap-3 rounded border border-[#E5E7EB] bg-white p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
                  <Database className="size-4 text-[#6B7280]" aria-hidden />
                  {s.name}
                </div>
                <SourceStatusChip status={s.status} />
              </div>

              {/* Record count */}
              <div>
                <div className="font-mono text-[26px] font-bold leading-none text-[#111827]">
                  {fmtNum(s.dbCount)}
                </div>
                <div className="mt-0.5 text-[11px] text-[#6B7280]">
                  {s.dbLabel} in DB · grain: {s.grain}
                </div>
              </div>

              {/* Metadata */}
              <dl className="space-y-1 text-[12px]">
                <Row label="Origin" value={s.origin} />
                <Row label="File" value={`mock-data/${s.file} (${fmtBytes(s.fileBytes)})`} />
                <Row label="Last loaded" value={fmtInstant(s.lastLoadAt)} mono />
                <Row
                  label="Last refresh"
                  value={`${fmtInstant(s.lastCheckAt)}${s.lastCheckKind ? ` (${s.lastCheckKind})` : ""}`}
                  mono
                />
                <Row
                  label="SHA-256"
                  value={s.sha256 ? `${s.sha256.slice(0, 12)}…` : "—"}
                  mono
                />
              </dl>

              {s.statusNote && (
                <p className="text-[11px] text-[#6B7280]">{s.statusNote}</p>
              )}

              {/* DQ finding links */}
              {s.dq.length > 0 && (
                <div className="flex flex-wrap gap-1 border-t border-[#F3F4F6] pt-2">
                  {s.dq.map((d) => (
                    <Link
                      key={d.code}
                      href={`/data-sources/dq/${d.code}`}
                      className="rounded border border-[#E5E7EB] bg-[#F9FAFB] px-1.5 py-0.5 font-mono text-[11px] text-[#374151] hover:border-[#93C5FD] hover:text-[#2563EB]"
                    >
                      {d.code} · <span className="font-semibold">{d.count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        {crossSourceDq.length > 0 && (
          <p className="mt-2 text-[12px] text-[#6B7280]">
            Cross-source findings:{" "}
            {crossSourceDq.map((d, i) => (
              <span key={d.code}>
                {i > 0 && " · "}
                <Link
                  className="text-[#2563EB] hover:underline"
                  href={`/data-sources/dq/${d.code}`}
                >
                  {d.code} ({d.count})
                </Link>
              </span>
            ))}
          </p>
        )}
      </Section>

      {/* ── 2. Data-quality findings ─────────────────────────────────────── */}
      <Section
        id="dq"
        title={`Data-quality findings — ${fmtNum(totalDq)} flagged records`}
        description="Every rule runs against the database and writes one DataQualityIssue per affected record. Nothing is silently fixed — click a finding to see the affected records."
      >
        <div className="rounded border border-[#E5E7EB] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <TableHead className="w-16 text-[12px] font-medium text-[#6B7280]">Code</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Finding</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Source</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Severity</TableHead>
                <TableHead className="text-right text-[12px] font-medium text-[#6B7280]">
                  Flagged
                </TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">PRD scale</TableHead>
                <TableHead className="w-[34%] text-[12px] font-medium text-[#6B7280]">
                  Handling
                </TableHead>
                <TableHead className="w-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.dq.map((d) => (
                <TableRow
                  key={d.code}
                  className="group border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]"
                >
                  <TableCell className="font-mono text-[12px] font-semibold">
                    <Link
                      href={`/data-sources/dq/${d.code}`}
                      className="text-[#2563EB] group-hover:underline"
                    >
                      {d.code}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal font-medium text-[13px]">
                    <Link href={`/data-sources/dq/${d.code}`}>{d.title}</Link>
                    <div className="font-mono text-[11px] text-[#9CA3AF]">{d.flag}</div>
                  </TableCell>
                  <TableCell className="text-[12px] text-[#374151]">
                    {SOURCE_LABEL[d.source]}
                  </TableCell>
                  <TableCell>
                    <DqSeverityChip severity={d.severity} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-[14px] font-bold text-[#111827]">
                    {fmtNum(d.count)}
                  </TableCell>
                  <TableCell className="whitespace-normal text-[12px] text-[#6B7280]">
                    {d.prdScale}
                  </TableCell>
                  <TableCell className="whitespace-normal text-[12px] text-[#374151]">
                    {d.handling}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/data-sources/dq/${d.code}`}
                      aria-label={`Open ${d.code} records`}
                    >
                      <ChevronRight className="size-4 text-[#9CA3AF]" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* ── 3. Join-success matrix ───────────────────────────────────────── */}
      <Section
        id="joins"
        title="Cross-source join matrix — 5 focus assets"
        description={
          <>
            Joins use the canonical keys from PRD §6.3: hyphenated <code>equipmentTag</code>{" "}
            (Production writes <code>PU2101B_*</code>), <code>plantCode</code>, and{" "}
            <code>rcaId = arNo = linkedRcaNo</code>. Incident ↔ RCA joins on tag{" "}
            <em>and</em> AR No. Reconciliation columns check that the same fact agrees across
            sources.
          </>
        }
      >
        <div className="rounded border border-[#E5E7EB] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Equipment</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Equipment Perf.</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Incident DB</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Production (PI)</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">RCA & Downtime</TableHead>
                <TableHead className="border-l border-[#E5E7EB] text-center text-[12px] font-medium text-[#6B7280]">
                  AR No.
                </TableHead>
                <TableHead className="text-center text-[12px] font-medium text-[#6B7280]">Plant</TableHead>
                <TableHead className="text-center text-[12px] font-medium text-[#6B7280]">Event date</TableHead>
                <TableHead className="text-center text-[12px] font-medium text-[#6B7280]">Downtime</TableHead>
                <TableHead className="text-center text-[12px] font-medium text-[#6B7280]">Actual loss</TableHead>
                <TableHead className="text-center text-[12px] font-medium text-[#6B7280]">OFF h ±1 h</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.joinMatrix.map((r) => (
                <TableRow
                  key={r.tag}
                  className="border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]"
                >
                  <TableCell>
                    <div className="font-mono font-semibold text-[#111827]">{r.tag}</div>
                    <div className="font-mono text-[11px] text-[#6B7280]">
                      {r.plantCode} · 4/4 sources
                    </div>
                  </TableCell>
                  {(["equipment", "incident", "production", "rca"] as const).map((k) => (
                    <TableCell key={k} className="align-top text-[12px]">
                      <div className="flex items-center gap-1 font-medium">
                        <CheckMark ok={r.cells[k].linked} />
                        <span>{r.cells[k].detail}</span>
                      </div>
                      <div className="font-mono text-[11px] text-[#9CA3AF]">
                        {r.cells[k].key}
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="border-l border-[#E5E7EB] text-center">
                    <CheckMark ok={r.reconciliation.arNo} />
                  </TableCell>
                  <TableCell className="text-center">
                    <CheckMark ok={r.reconciliation.plantCode} />
                  </TableCell>
                  <TableCell className="text-center">
                    <CheckMark ok={r.reconciliation.eventDate} />
                  </TableCell>
                  <TableCell className="text-center">
                    <CheckMark ok={r.reconciliation.downtime} />
                  </TableCell>
                  <TableCell className="text-center">
                    <CheckMark ok={r.reconciliation.actualLoss} />
                  </TableCell>
                  <TableCell className="text-center">
                    <CheckMark ok={r.reconciliation.offHoursWithin1h} />
                    <div className="font-mono text-[11px] text-[#9CA3AF]">
                      {r.offHours} vs {r.downtimeHours} h
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {/* Linked sources per equipment */}
          <div className="rounded border border-[#E5E7EB] bg-white p-4">
            <div className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
              <Link2 className="size-4 text-[#6B7280]" aria-hidden />
              Linked sources per equipment tag
            </div>
            <div className="space-y-2 text-[13px]">
              {o.linkage.equipmentByLinkedSources.map((l) => (
                <div key={l.sources} className="flex items-center gap-3">
                  <span className="w-10 font-mono font-semibold text-[#374151]">
                    {l.sources}/4
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#F3F4F6]">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        l.sources === 4 ? "bg-green-500" : "bg-[#2563EB]",
                      )}
                      style={{
                        width: `${(100 * l.equipment) / Math.max(1, ...o.linkage.equipmentByLinkedSources.map((x) => x.equipment))}%`,
                      }}
                    />
                  </div>
                  <span className="w-20 text-right font-mono text-[12px] text-[#374151]">
                    {fmtNum(l.equipment)} tags
                  </span>
                </div>
              ))}
              <p className="text-[11px] text-[#9CA3AF]">
                Honest limitation: the full multi-source chain exists only for the 5 focus assets.
                Every other tag has an Incident Database record only.
              </p>
            </div>
          </div>

          {/* Incident → RCA linkage */}
          <div className="rounded border border-[#E5E7EB] bg-white p-4">
            <div className="mb-3 text-[13px] font-semibold text-[#111827]">
              Incident → RCA linkage
            </div>
            <dl className="space-y-1.5 text-[13px]">
              <Row label="Incidents" value={fmtNum(o.linkage.incidentsTotal)} mono />
              <Row
                label="…with an AR No."
                value={`${fmtNum(o.linkage.incidentsWithAr)} (${fmtNum(o.linkage.incidentsTotal - o.linkage.incidentsWithAr)} missing — DQ-1)`}
              />
              <Row
                label="…linked to an RCA report"
                value={fmtNum(o.linkage.incidentsWithRca)}
                mono
              />
            </dl>
            <p className="mt-2 text-[11px] text-[#9CA3AF]">
              {fmtNum(o.linkage.incidentsWithAr - o.linkage.incidentsWithRca)} incidents carry an
              AR No. whose RCA deck is not part of the case package, so the AI can only use
              pattern-level context for them.
            </p>
          </div>
        </div>
      </Section>

      {/* ── 4. KPI taxonomy ─────────────────────────────────────────────── */}
      <Section
        id="kpi"
        title="Shared KPI taxonomy"
        description="Every unified record carries exactly one kpiCategory (PRD §6.4); incidents additionally feed risk_exposure through a secondary tag. Production categories are assigned per instrument role, not per file."
      >
        <div className="rounded border border-[#E5E7EB] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Record type</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Source</TableHead>
                {KPI_CATEGORIES.map((k) => (
                  <TableHead
                    key={k}
                    className="text-right font-mono text-[11px] font-medium text-[#6B7280]"
                  >
                    {k}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.kpiCoverage.map((r) => (
                <TableRow
                  key={r.label}
                  className="border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]"
                >
                  <TableCell className="font-medium text-[13px]">{r.label}</TableCell>
                  <TableCell className="text-[12px] text-[#6B7280]">{r.source}</TableCell>
                  {KPI_CATEGORIES.map((k) => (
                    <TableCell
                      key={k}
                      className={
                        r.counts[k]
                          ? "text-right font-mono font-semibold text-[13px] text-[#111827]"
                          : "text-right text-[#D1D5DB]"
                      }
                    >
                      {r.counts[k] ? fmtNum(r.counts[k]) : "·"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* ── 5. Function coverage ────────────────────────────────────────── */}
      <Section
        id="coverage"
        title="Function coverage"
        description="What is governed today for each of the 7 functions in the brief. No data is fabricated for missing functions — the gap is shown as the next integration wave."
      >
        <FunctionCoverageGrid items={coverage} />
      </Section>

      {/* ── 6. Plant lookup ─────────────────────────────────────────────── */}
      <Section
        id="plants"
        title="Plant lookup"
        description="Canonical 3-letter plant code. Names exist only for the 4 plants named in the RCA decks; the other 8 are shown as codes — no names are invented."
      >
        <div className="rounded border border-[#E5E7EB] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Code</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Name</TableHead>
                <TableHead className="text-[12px] font-medium text-[#6B7280]">Spellings seen in sources</TableHead>
                <TableHead className="text-right text-[12px] font-medium text-[#6B7280]">
                  Incidents
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.plants.map((p) => (
                <TableRow
                  key={p.code}
                  className="border-b border-[#F3F4F6] transition-colors hover:bg-[#F9FAFB]"
                >
                  <TableCell className="font-mono font-semibold text-[#111827]">
                    {p.code}
                  </TableCell>
                  <TableCell className="text-[13px] text-[#374151]">
                    {p.name ?? (
                      <span className="text-[12px] italic text-[#9CA3AF]">
                        not provided in case files
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal text-[12px] text-[#9CA3AF]">
                    {p.aliases.map((a) => `"${a}"`).join(" · ") || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-[#374151]">
                    {p.incidents}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-[12px]">
      <dt className="shrink-0 text-[#6B7280]">{label}</dt>
      <dd className={cn("text-right text-[#374151]", mono && "font-mono")}>{value}</dd>
    </div>
  );
}
