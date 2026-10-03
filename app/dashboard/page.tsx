import { PageHeader } from "@/components/page-header";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <>
      <PageHeader pillar="Pillar 2 · Single Pane of Glass (KQ2)" title="Executive Dashboard">
        <p className="max-w-md text-right text-xs text-muted-foreground">
          All figures computed live from the unified database · overdue logic as of 3 Oct 2026 · 12 plants, 380 incidents, 5 assets with full 4-source linkage
        </p>
      </PageHeader>
      <DashboardView fn={null} />
    </>
  );
}
