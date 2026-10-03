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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  equipment: "Equipment Performance",
  incident: "Incident Database",
  production: "Production Data",
  rca: "RCA & Downtime",
  "cross-source": "Cross-source",
};

export default async function DataSourcesPage() {
  const [o, coverage] = await Promise.all([getDataSourcesOverview(prisma), getFunctionCoverage(prisma)]);
  const totalDq = o.dq.reduce((n, d) => n + d.count, 0);
  const crossSourceDq = o.dq.filter((d) => d.source === "cross-source");

  return (
    <>
      <PageHeader pillar="Pillar 1 · Unified Data Foundation (KQ1)" title="Data Sources & Governance">
        <RevalidateButton />
      </PageHeader>

      {/* ── 1. Per-source status (FR-1.3) ─────────────────────────────── */}
      <Section
        title="Source status"
        description="The 4 case datasets, ingested into one common schema. Counts are live from the database; last refresh is the latest load or re-validation run."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {o.sources.map((s) => (
            <Card key={s.key} className="border-card-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 font-heading text-base text-navy">
                    <Database className="size-4 text-cyan-deep" aria-hidden />
                    {s.name}
                  </CardTitle>
                </div>
                <SourceStatusChip status={s.status} />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-3xl font-bold tabular-nums text-navy">{fmtNum(s.dbCount)}</div>
                  <div className="text-xs text-muted-foreground">{s.dbLabel} in DB · grain: {s.grain}</div>
                </div>
                <dl className="space-y-1 text-xs">
                  <Row label="Origin" value={s.origin} />
                  <Row label="File" value={`mock-data/${s.file} (${fmtBytes(s.fileBytes)})`} />
                  <Row label="Last loaded" value={fmtInstant(s.lastLoadAt)} />
                  <Row label="Last refresh" value={`${fmtInstant(s.lastCheckAt)}${s.lastCheckKind ? ` (${s.lastCheckKind})` : ""}`} />
                  <Row label="SHA-256" value={s.sha256 ? `${s.sha256.slice(0, 12)}…` : "—"} mono />
                </dl>
                {s.statusNote && <p className="text-xs text-muted-foreground">{s.statusNote}</p>}
                <div className="flex flex-wrap gap-1.5 border-t border-card-border pt-2">
                  {s.dq.map((d) => (
                    <Link
                      key={d.code}
                      href={`/data-sources/dq/${d.code}`}
                      className="rounded-md border border-card-border bg-app-bg px-1.5 py-0.5 text-xs hover:border-cyan hover:text-cyan-deep"
                    >
                      {d.code} · <span className="font-semibold tabular-nums">{d.count}</span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Cross-source findings:{" "}
          {crossSourceDq.map((d, i) => (
            <span key={d.code}>
              {i > 0 && " · "}
              <Link className="text-cyan-deep hover:underline" href={`/data-sources/dq/${d.code}`}>
                {d.code} ({d.count})
              </Link>
            </span>
          ))}
        </p>
      </Section>

      {/* ── 2. Data-quality findings (§6.5, FR-1.7) ───────────────────── */}
      <Section
        id="dq"
        title={`Data-quality findings (${fmtNum(totalDq)} flagged records)`}
        description="Every rule runs against the database and writes one DataQualityIssue per affected record. Nothing is silently fixed — click a finding to see the affected records."
      >
        <Card className="border-card-border py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Code</TableHead>
                <TableHead>Finding</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead className="text-right">Flagged</TableHead>
                <TableHead>PRD scale</TableHead>
                <TableHead className="w-[34%]">Handling</TableHead>
                <TableHead className="w-6" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.dq.map((d) => (
                <TableRow key={d.code} className="group">
                  <TableCell className="font-mono text-xs font-semibold">
                    <Link href={`/data-sources/dq/${d.code}`} className="text-cyan-deep group-hover:underline">
                      {d.code}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-normal font-medium">
                    <Link href={`/data-sources/dq/${d.code}`}>{d.title}</Link>
                    <div className="font-mono text-[11px] text-muted-foreground">{d.flag}</div>
                  </TableCell>
                  <TableCell className="text-xs">{SOURCE_LABEL[d.source]}</TableCell>
                  <TableCell>
                    <DqSeverityChip severity={d.severity} />
                  </TableCell>
                  <TableCell className="text-right text-base font-bold tabular-nums text-navy">{fmtNum(d.count)}</TableCell>
                  <TableCell className="whitespace-normal text-xs text-muted-foreground">{d.prdScale}</TableCell>
                  <TableCell className="whitespace-normal text-xs">{d.handling}</TableCell>
                  <TableCell>
                    <Link href={`/data-sources/dq/${d.code}`} aria-label={`Open ${d.code} records`}>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      {/* ── 3. Join-success matrix (FR-1.6) ───────────────────────────── */}
      <Section
        id="joins"
        title="Cross-source join matrix — 5 focus assets"
        description={
          <>
            Joins use the canonical keys from PRD §6.3: hyphenated <code>equipmentTag</code> (Production writes <code>PU2101B_*</code>),{" "}
            <code>plantCode</code>, and <code>rcaId = arNo = linkedRcaNo</code>. Incident ↔ RCA joins on tag <em>and</em> AR No. Reconciliation
            columns check that the same fact agrees across sources.
          </>
        }
      >
        <Card className="border-card-border py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipment</TableHead>
                <TableHead>Equipment Perf.</TableHead>
                <TableHead>Incident DB</TableHead>
                <TableHead>Production (PI)</TableHead>
                <TableHead>RCA & Downtime</TableHead>
                <TableHead className="border-l border-card-border text-center">AR No.</TableHead>
                <TableHead className="text-center">Plant</TableHead>
                <TableHead className="text-center">Event date</TableHead>
                <TableHead className="text-center">Downtime</TableHead>
                <TableHead className="text-center">Actual loss</TableHead>
                <TableHead className="text-center">OFF h ±1 h</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.joinMatrix.map((r) => (
                <TableRow key={r.tag}>
                  <TableCell>
                    <div className="font-semibold text-navy">{r.tag}</div>
                    <div className="text-xs text-muted-foreground">{r.plantCode} · 4/4 sources</div>
                  </TableCell>
                  {(["equipment", "incident", "production", "rca"] as const).map((k) => (
                    <TableCell key={k} className="align-top">
                      <div className="flex items-center gap-1 font-medium">
                        <CheckMark ok={r.cells[k].linked} />
                        <span className="text-xs">{r.cells[k].detail}</span>
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">{r.cells[k].key}</div>
                    </TableCell>
                  ))}
                  <TableCell className="border-l border-card-border text-center">
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
                    <div className="text-[11px] text-muted-foreground">
                      {r.offHours} vs {r.downtimeHours} h
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card className="border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-heading text-base text-navy">
                <Link2 className="size-4 text-cyan-deep" aria-hidden /> Linked sources per equipment tag
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {o.linkage.equipmentByLinkedSources.map((l) => (
                <div key={l.sources} className="flex items-center gap-3">
                  <span className="w-12 font-mono font-semibold text-navy">{l.sources}/4</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className={l.sources === 4 ? "h-full bg-lime" : "h-full bg-cyan"}
                      style={{ width: `${(100 * l.equipment) / Math.max(1, ...o.linkage.equipmentByLinkedSources.map((x) => x.equipment))}%` }}
                    />
                  </div>
                  <span className="w-24 text-right tabular-nums">{fmtNum(l.equipment)} tags</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Honest limitation: the full multi-source chain exists only for the 5 focus assets. Every other tag has an Incident Database record only.
              </p>
            </CardContent>
          </Card>
          <Card className="border-card-border">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base text-navy">Incident → RCA linkage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <Row label="Incidents" value={fmtNum(o.linkage.incidentsTotal)} />
              <Row label="…with an AR No." value={`${fmtNum(o.linkage.incidentsWithAr)} (${fmtNum(o.linkage.incidentsTotal - o.linkage.incidentsWithAr)} missing — DQ-1)`} />
              <Row label="…linked to an RCA report in the dataset" value={fmtNum(o.linkage.incidentsWithRca)} />
              <p className="pt-1 text-xs text-muted-foreground">
                {fmtNum(o.linkage.incidentsWithAr - o.linkage.incidentsWithRca)} incidents carry an AR No. whose RCA deck is not part of the case package, so the AI
                can only use pattern-level context for them.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ── 4. KPI taxonomy (FR-1.2) ──────────────────────────────────── */}
      <Section
        id="kpi"
        title="Shared KPI taxonomy"
        description="Every unified record carries exactly one kpiCategory (PRD §6.4); incidents additionally feed risk_exposure through a secondary tag. Production categories are assigned per instrument role, not per file."
      >
        <Card className="border-card-border py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Record type</TableHead>
                <TableHead>Source</TableHead>
                {KPI_CATEGORIES.map((k) => (
                  <TableHead key={k} className="text-right font-mono text-xs">
                    {k}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.kpiCoverage.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.source}</TableCell>
                  {KPI_CATEGORIES.map((k) => (
                    <TableCell key={k} className={r.counts[k] ? "text-right font-semibold tabular-nums text-navy" : "text-right text-muted-foreground/50"}>
                      {r.counts[k] ? fmtNum(r.counts[k]) : "·"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>

      {/* ── 5. Function coverage (§6.7) ───────────────────────────────── */}
      <Section
        id="coverage"
        title="Function coverage"
        description="What is governed today for each of the 7 functions in the brief. No data is fabricated for missing functions — the gap is shown as the next integration wave."
      >
        <FunctionCoverageGrid items={coverage} />
      </Section>

      {/* ── 6. Plants (§6.3 rule 2) ───────────────────────────────────── */}
      <Section
        id="plants"
        title="Plant lookup"
        description="Canonical 3-letter plant code. Names exist only for the 4 plants named in the RCA decks; the other 8 are shown as codes — no names are invented."
      >
        <Card className="border-card-border py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Spellings seen in sources</TableHead>
                <TableHead className="text-right">Incidents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {o.plants.map((p) => (
                <TableRow key={p.code}>
                  <TableCell className="font-mono font-semibold text-navy">{p.code}</TableCell>
                  <TableCell>{p.name ?? <span className="text-xs italic text-muted-foreground">not provided in case files</span>}</TableCell>
                  <TableCell className="whitespace-normal text-xs text-muted-foreground">{p.aliases.map((a) => `“${a}”`).join(" · ") || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.incidents}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </Section>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={mono ? "truncate text-right font-mono" : "text-right"}>{value}</dd>
    </div>
  );
}
