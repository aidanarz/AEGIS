import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { getDashboard, getFunctionKpis } from "@/lib/data/dashboard";
import { getFunctionCoverage } from "@/lib/data/function-coverage";
import type { FunctionName } from "@/lib/data/normalize";
import { fmtNum } from "@/lib/format";
import { FunctionCoverageGrid } from "@/components/function-coverage-grid";
import { RoleEmphasis } from "@/components/role-provider";
import { LossTrendChart } from "@/components/charts/loss-trend-chart";
import { BarList, Counters, DrillLink, Heatmap, TopAlerts, Widget } from "@/components/dashboard/widgets";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  monitoring: "Monitoring",
  closed: "Closed",
  cancelled: "Cancelled",
};

export async function DashboardView({ fn }: { fn: FunctionName | null }) {
  const [d, coverage, kpis, dqTotal, linked] = await Promise.all([
    getDashboard(prisma, fn),
    getFunctionCoverage(prisma),
    getFunctionKpis(prisma),
    prisma.dataQualityIssue.count(),
    prisma.equipment.count({ where: { isFocus: true } }),
  ]);
  const qs = fn ? `fn=${fn.toLowerCase()}` : "";

  return (
    <div className="flex flex-col gap-8">
      {/* KPI counters */}
      <RoleEmphasis roles={["executive", "action_owner"]}>
        <Counters c={d.counters} qs={qs} />
      </RoleEmphasis>

      {/* Function coverage tiles */}
      <RoleEmphasis roles={["executive", "function_head"]}>
        <div>
          <h2 className="mb-3 text-[13px] font-medium text-[#6B7280]">Coverage by function</h2>
          <FunctionCoverageGrid items={coverage} linkTiles kpis={kpis} current={fn} />
        </div>
      </RoleEmphasis>

      {/* Top alerts + loss trend */}
      <div className="grid gap-8 xl:grid-cols-5">
        <RoleEmphasis roles={["operator", "function_head"]} className="xl:col-span-3">
          <Widget
            title={fn ? `Top alerts — ${fn}` : "Top alerts"}
            action={<DrillLink href={`/alerts?${qs}`} label="All alerts" />}
          >
            <TopAlerts alerts={d.topAlerts} />
          </Widget>
        </RoleEmphasis>
        <RoleEmphasis roles={["executive"]} className="xl:col-span-2">
          <Widget
            title="Loss by month"
            action={
              <span className="text-[12px] text-[#9CA3AF]">click a month to drill in</span>
            }
          >
            <LossTrendChart data={d.trend} qs={qs} />
          </Widget>
        </RoleEmphasis>
      </div>

      {/* Heatmap + incident status */}
      <div className="grid gap-8 xl:grid-cols-5">
        <RoleEmphasis roles={["function_head"]} className="xl:col-span-3">
          <Widget
            title="Plant × KPI heatmap"
            action={<DrillLink href={`/incidents?${qs}`} />}
          >
            <Heatmap data={d} qs={qs} />
          </Widget>
        </RoleEmphasis>
        <div className="xl:col-span-2">
          <Widget
            title="Incident status"
            action={
              <DrillLink href={`/incidents?${qs}&status=active`} label="Active records" />
            }
          >
            <BarList
              rows={d.portfolio.byStatus}
              labelFor={(k) => STATUS_LABEL[k] ?? k}
              hrefFor={(k) => `/incidents?${qs}&status=${k}`}
            />
          </Widget>
        </div>
      </div>

      {/* Bottom row: three portfolio breakdowns */}
      <div className="grid gap-8 lg:grid-cols-3">
        <Widget title="By plant">
          <BarList
            rows={d.portfolio.byPlant}
            hrefFor={(k) => `/incidents?${qs}&plant=${k}`}
          />
        </Widget>
        <Widget title="By failure mode">
          <BarList
            rows={d.portfolio.byMechanism.slice(0, 10)}
            hrefFor={(k) => `/incidents?${qs}&mechanism=${encodeURIComponent(k)}`}
          />
        </Widget>
        <Widget title="By discipline">
          <BarList
            rows={d.portfolio.byDiscipline}
            hrefFor={(k) => `/incidents?${qs}&discipline=${k}`}
          />
          <RoleEmphasis roles={["admin"]} className="mt-5">
            <Link
              href="/data-sources"
              className="flex items-center gap-2 rounded border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-[13px] transition-colors hover:border-[#93C5FD] hover:bg-[#EFF6FF]"
            >
              <ShieldCheck className="size-4 text-[#2563EB]" aria-hidden />
              <span className="text-[#374151]">
                {fmtNum(dqTotal)} flagged records · {linked} assets linked
              </span>
            </Link>
          </RoleEmphasis>
        </Widget>
      </div>
    </div>
  );
}
