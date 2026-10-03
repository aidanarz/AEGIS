import { prisma } from "@/lib/data/prisma";
import { getFunctionCoverage } from "@/lib/data/function-coverage";
import { PageHeader, Section } from "@/components/page-header";
import { FunctionCoverageGrid } from "@/components/function-coverage-grid";

export const dynamic = "force-dynamic";

// FR-2.1 host screen. Phase 1 ships the 7 function tiles with §6.7 coverage badges;
// Phase 2 adds KPIs, prioritized alerts, loss trend, heatmap and RCA counters.
export default async function DashboardPage() {
  const coverage = await getFunctionCoverage(prisma);
  return (
    <>
      <PageHeader pillar="Pillar 2 · Single Pane of Glass (KQ2)" title="Executive Dashboard" />
      <Section title="Functions" description="All 7 functions from the brief, each with an explicit data-coverage badge. Hover a badge for why.">
        <FunctionCoverageGrid items={coverage} />
      </Section>
    </>
  );
}
