import { DashboardView } from "@/components/dashboard/dashboard-view";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <DashboardView fn={null} />
    </>
  );
}
