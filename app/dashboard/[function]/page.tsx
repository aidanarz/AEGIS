import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CircleSlash } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { functionFromSlug, getFunctionCoverage, picPrefixesFor } from "@/lib/data/function-coverage";
import { BASELINE_HOURS } from "@/lib/detect/baseline-detector";
import { fmtDate, fmtKUsd, fmtNum } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { CoverageBadge } from "@/components/coverage-badge";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { BarList, DrillLink, Widget } from "@/components/dashboard/widgets";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function FunctionDashboardPage({ params }: { params: Promise<{ function: string }> }) {
  const { function: slug } = await params;
  const fn = functionFromSlug(slug);
  if (!fn) notFound();
  const cov = (await getFunctionCoverage(prisma)).find((c) => c.fn === fn)!;
  const prefixes = picPrefixesFor(fn);

  return (
    <>
      <Link href="/dashboard" className="mb-3 inline-flex items-center gap-1 text-sm text-cyan-deep hover:underline">
        <ArrowLeft className="size-4" /> Executive Dashboard
      </Link>
      <PageHeader pillar="Pillar 2 · Function Dashboard" title={fn}>
        <div className="flex flex-col items-end gap-1 text-right">
          <CoverageBadge level={cov.level} tooltip={cov.tooltip} />
          <span className="max-w-md text-xs text-muted-foreground">
            {cov.level === "connected"
              ? `Filtered to incidents owned by PIC prefix ${prefixes.map((p) => `${p}-`).join(", ")} (PRD §6.7)`
              : cov.tooltip}
          </span>
        </div>
      </PageHeader>
      {cov.level === "connected" && <DashboardView fn={fn} />}
      {fn === "Energy" && <EnergyProxy />}
      {fn === "HSE" && <HseProxy />}
      {cov.level === "none" && <NotInScope fn={fn} />}
    </>
  );
}

function ProxyBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-sev-medium/60 bg-sev-medium/15 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#8a6d00]" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

async function EnergyProxy() {
  const instruments = await prisma.productionInstrument.findMany({ where: { parameter: "motor_current" }, include: { equipment: true }, orderBy: { equipmentTag: "asc" } });
  const template = new Set((await prisma.dataQualityIssue.findMany({ where: { code: "DQ-7" } })).map((d) => d.recordId));
  const rows = await Promise.all(
    instruments.map(async (ins) => {
      const readings = await prisma.productionReading.findMany({ where: { equipmentTag: ins.equipmentTag, parameter: ins.name }, orderBy: { timestamp: "asc" } });
      const status = await prisma.runStatus.findMany({ where: { equipmentTag: ins.equipmentTag }, orderBy: { timestamp: "asc" } });
      const tripIdx = status.findIndex((s, i) => i >= BASELINE_HOURS && s.status === "OFF");
      const base = readings.slice(0, BASELINE_HOURS).map((r) => r.value);
      const campaign = readings.slice(BASELINE_HOURS, tripIdx >= 0 ? tripIdx : undefined).map((r) => r.value);
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const bMean = mean(base);
      const cMean = mean(campaign);
      return {
        tag: ins.equipmentTag,
        name: ins.name,
        type: ins.equipment.equipmentTypeName,
        unit: ins.engUnitsObserved,
        baseline: bMean,
        campaign: cMean,
        change: ((cMean - bMean) / bMean) * 100,
        max: Math.max(...campaign),
        offHours: status.filter((s) => s.status === "OFF").length,
        template: template.has(`${ins.equipmentTag}:${ins.name}`),
      };
    }),
  );
  return (
    <>
      <ProxyBanner>
        <strong>Proxy view.</strong> The case files contain <strong>no energy-consumption data</strong> (power, steam, fuel, utilities). The only energy-related
        signal is motor current (<code>*_AMP</code>) on the 5 focus assets. Figures below describe motor load, not energy performance.
      </ProxyBanner>
      <Widget title="Motor current — baseline vs operating campaign (focus assets)">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead className="text-right">Baseline mean (first {BASELINE_HOURS} h)</TableHead>
              <TableHead className="text-right">Campaign mean (to trip)</TableHead>
              <TableHead className="text-right">Δ</TableHead>
              <TableHead className="text-right">Campaign max</TableHead>
              <TableHead className="text-right">Hours OFF</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell>
                  <Link href={`/equipment/${r.tag}`} className="font-semibold text-navy hover:underline">
                    {r.tag}
                  </Link>
                  <div className="text-xs text-muted-foreground">{r.type}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(r.baseline, 1)} {r.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(r.campaign, 1)} {r.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtNum(r.change, 1)}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmtNum(r.max, 1)} {r.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.offHours}</TableCell>
                <TableCell className="text-xs">
                  {r.template ? (
                    <Link href="/data-sources/dq/DQ-7" className="text-[#a4520b] hover:underline">
                      DQ-7: template tag on static equipment — not meaningful
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Widget>
    </>
  );
}

async function HseProxy() {
  const incidents = await prisma.incident.findMany({
    select: { serialNo: true, incidentId: true, equipmentTag: true, plantCode: true, preRisk: true, riskScore: true, highestImpact: true, statusNormalized: true, totalLossKUSD: true, riskCaseTitle: true, dateOfOccurrence: true },
  });
  const active = incidents.filter((i) => ["open", "in_progress", "monitoring"].includes(i.statusNormalized));
  const groupBy = (xs: typeof incidents, key: (i: (typeof incidents)[number]) => string) =>
    [...xs.reduce((m, i) => m.set(key(i), [...(m.get(key(i)) ?? []), i]), new Map<string, typeof incidents>()).entries()]
      .map(([k, v]) => ({ key: k, count: v.length, lossKUSD: Math.round(v.reduce((a, b) => a + b.totalLossKUSD, 0) * 10) / 10 }))
      .sort((a, b) => b.lossKUSD - a.lossKUSD);
  const preRiskOrder = ["I", "II", "III", "IV"];
  const top = [...active].sort((a, b) => b.riskScore - a.riskScore).slice(0, 10);
  return (
    <>
      <ProxyBanner>
        <strong>Proxy view — risk exposure, not HSE performance.</strong> The Incident Database is an <em>equipment-related risk register</em>: it has pre-risk
        (I–IV) and risk scores but <strong>no injury, environmental or process-safety fields</strong>. That is why the KPI taxonomy calls this{" "}
        <code>risk_exposure</code>, not <code>safety</code> (PRD §6.4).
      </ProxyBanner>
      <div className="grid gap-6 lg:grid-cols-3">
        <Widget title="Active incidents by pre-risk" action={<DrillLink href="/incidents?status=active&risk=elevated" label="Elevated (I–III)" />}>
          <BarList
            rows={groupBy(active, (i) => i.preRisk).sort((a, b) => preRiskOrder.indexOf(a.key) - preRiskOrder.indexOf(b.key))}
            labelFor={(k) => `Pre-risk ${k}`}
            hrefFor={(k) => `/incidents?status=active&prerisk=${k}`}
          />
        </Widget>
        <Widget title="All incidents by highest impact">
          <BarList rows={groupBy(incidents, (i) => i.highestImpact)} hrefFor={(k) => `/incidents?impact=${encodeURIComponent(k)}`} />
        </Widget>
        <Widget title="Highest risk score — active">
          <ul className="space-y-1.5 text-sm">
            {top.map((i) => (
              <li key={i.serialNo} className="flex items-baseline justify-between gap-2">
                <span className="truncate">
                  <Link href={`/equipment/${i.equipmentTag}`} className="font-semibold text-navy hover:underline">
                    {i.equipmentTag}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">
                    {i.plantCode} · {fmtDate(i.dateOfOccurrence)}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums">
                  {i.preRisk} · {fmtNum(i.riskScore)} · {fmtKUsd(i.totalLossKUSD)}
                </span>
              </li>
            ))}
          </ul>
        </Widget>
      </div>
    </>
  );
}

function NotInScope({ fn }: { fn: string }) {
  const next: Record<string, string[]> = {
    Warehouse: ["Spare-parts master & stock levels (SAP MM / IM)", "Critical-spares availability for the 5 focus assets", "Reservation-to-issue lead time"],
    Procurement: ["Purchase orders & requisitions linked to CAPA actions", "Supplier lead times for long-lead parts (e.g. seals, bearings)", "PO status for overdue CAPA items"],
  };
  return (
    <div className="rounded-lg border border-dashed border-card-border bg-white p-8 text-center">
      <CircleSlash className="mx-auto mb-3 size-10 text-muted-foreground" aria-hidden />
      <h2 className="text-xl font-bold">Data source not in scope of this dataset</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        None of the 4 case datasets contains {fn.toLowerCase()} data, and no owner code maps to {fn}. Nothing is shown rather than fabricated. This is the
        governance gap a next integration wave would close:
      </p>
      <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-sm">
        {(next[fn] ?? []).map((n) => (
          <li key={n} className="flex gap-2">
            <span className="text-cyan-deep">→</span>
            {n}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] text-muted-foreground">Integration candidates are suggestions for the roadmap, not data.</p>
    </div>
  );
}
