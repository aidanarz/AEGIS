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
  open: "Open (new)",
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
    <div className="flex flex-col gap-6">
      <RoleEmphasis roles={["executive", "action_owner"]}>
        <Counters c={d.counters} qs={qs} />
      </RoleEmphasis>

      <RoleEmphasis roles={["executive", "function_head"]}>
        <FunctionCoverageGrid items={coverage} linkTiles kpis={kpis} current={fn} />
      </RoleEmphasis>

      <div className="grid gap-6 xl:grid-cols-5">
        <RoleEmphasis roles={["operator", "function_head"]} className="xl:col-span-3">
          <Widget
            title={fn ? `Top prioritized alerts — ${fn}` : "Top 5 prioritized alerts"}
            action={<span className="text-[11px] text-muted-foreground">ranked by PRD §7.1 score · one row per asset · hover score for breakdown</span>}
          >
            <TopAlerts alerts={d.topAlerts} />
          </Widget>
        </RoleEmphasis>
        <RoleEmphasis roles={["executive"]} className="xl:col-span-2">
          <Widget title="Loss trend by month" action={<span className="text-[11px] text-muted-foreground">click a month to drill in</span>}>
            <LossTrendChart data={d.trend} qs={qs} />
          </Widget>
        </RoleEmphasis>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <RoleEmphasis roles={["function_head"]} className="xl:col-span-3">
          <Widget title="Heatmap — plant × KPI category" action={<DrillLink href={`/incidents?${qs}`} label="All records" />}>
            <Heatmap data={d} qs={qs} />
          </Widget>
        </RoleEmphasis>
        <div className="xl:col-span-2">
          <Widget title="Status — active vs closed" action={<DrillLink href={`/incidents?${qs}&status=active`} label="Active records" />}>
            <BarList rows={d.portfolio.byStatus} labelFor={(k) => STATUS_LABEL[k] ?? k} hrefFor={(k) => `/incidents?${qs}&status=${k}`} />
            <p className="mt-2 text-[11px] text-muted-foreground">6 source statuses mapped to 5 normalized ones (DQ-11). Bar = total loss; (n) = incidents.</p>
          </Widget>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Widget title="Loss by plant">
          <BarList rows={d.portfolio.byPlant} hrefFor={(k) => `/incidents?${qs}&plant=${k}`} />
        </Widget>
        <Widget title="Loss by failure mechanism">
          <BarList
            rows={d.portfolio.byMechanism.slice(0, 12)}
            hrefFor={(k) => `/incidents?${qs}&mechanism=${encodeURIComponent(k)}`}
            flagNote="Truncated source value on focus rows (DQ-4) — shown as-is, not fixed"
          />
        </Widget>
        <Widget title="Loss by discipline">
          <BarList rows={d.portfolio.byDiscipline} hrefFor={(k) => `/incidents?${qs}&discipline=${k}`} />
          <RoleEmphasis roles={["admin"]} className="mt-4">
            <Link href="/data-sources" className="flex items-center gap-2 rounded-lg border border-card-border bg-app-bg p-3 text-sm hover:border-cyan">
              <ShieldCheck className="size-5 text-lime-deep" aria-hidden />
              <span>
                <span className="font-semibold text-navy">Data governance:</span> {fmtNum(dqTotal)} flagged records across 13 DQ rules · {linked} assets linked
                across 4/4 sources
              </span>
            </Link>
          </RoleEmphasis>
        </Widget>
      </div>
    </div>
  );
}
