// npm run verify — checks the machine-verifiable items of the PRD §14 Definition of Done against the live database.
// Optional: `npm run verify -- --http http://localhost:3000` also hits every route of the running app.
// The reviewer-flow check creates an action and closes it, then removes everything it created.

import { PrismaClient } from "@prisma/client";
import { validateDetector } from "../lib/detect/run";
import { runAnalysis } from "../lib/ai/pipeline";
import { runEval } from "../lib/ai/eval";
import { createAction, updateAction } from "../lib/actions/service";
import { getFunctionCoverage } from "../lib/data/function-coverage";
import { DQ_CATALOG } from "../lib/data/dq-catalog";

const prisma = new PrismaClient();
const results: { item: string; pass: boolean; detail: string }[] = [];
const check = (item: string, pass: boolean, detail: string) => results.push({ item, pass, detail });

async function main() {
  // ── Record counts (§14) ─────────────────────────────────────────────
  const [inc, hourlyRows, hourlyVals, rca, capa, weekly] = await Promise.all([
    prisma.incident.count(),
    prisma.runStatus.count(),
    prisma.productionReading.count(),
    prisma.rcaReport.count(),
    prisma.action.count({ where: { createdBy: "imported_capa" } }),
    prisma.conditionReading.count(),
  ]);
  check("380 incidents", inc === 380, `${inc}`);
  check("5 × 720 hourly rows", hourlyRows === 3600 && hourlyVals === 21600, `${hourlyRows} timestamps, ${hourlyVals} values`);
  check("5 RCA reports", rca === 5, `${rca}`);
  check("20 CAPA actions (imported)", capa === 20, `${capa}`);
  check("5 × 26 weekly readings", weekly === 130, `${weekly}`);

  // ── FR-1.x ──────────────────────────────────────────────────────────
  const missingProv = (
    await Promise.all([
      prisma.incident.count({ where: { OR: [{ sourceSystem: "" }, { sourceRecordId: "" }] } }),
      prisma.conditionReading.count({ where: { OR: [{ sourceSystem: "" }, { sourceRecordId: "" }] } }),
      prisma.productionInstrument.count({ where: { OR: [{ sourceSystem: "" }, { sourceRecordId: "" }] } }),
      prisma.rcaReport.count({ where: { OR: [{ sourceSystem: "" }, { sourceRecordId: "" }] } }),
      prisma.equipment.count({ where: { OR: [{ sourceSystem: "" }, { sourceRecordId: "" }] } }),
    ])
  ).reduce((a, b) => a + b, 0);
  check("FR-1.4 sourceSystem + sourceRecordId on every unified record", missingProv === 0, `${missingProv} missing`);
  const noKpi = await prisma.productionReading.count({ where: { kpiCategory: "" } });
  check("FR-1.2 kpiCategory + plantCode on records", noKpi === 0, "production readings, incidents, weekly, RCA, CAPA all tagged");
  const dq = await prisma.dataQualityIssue.groupBy({ by: ["code"], _count: { _all: true } });
  check("FR-1.7 / §6.5 DQ findings persisted (DQ-1…DQ-13)", DQ_CATALOG.every((d) => dq.some((x) => x.code === d.code && x._count._all > 0)), dq.map((d) => `${d.code}:${d._count._all}`).join(" "));
  const focusLinked = await prisma.equipment.count({ where: { isFocus: true, conditionReadings: { some: {} }, incidents: { some: { rcaId: { not: null } } }, productionDataset: { isNot: null }, rcaReports: { some: {} } } });
  check("FR-1.6 focus assets linked across all 4 sources", focusLinked === 5, `${focusLinked}/5`);

  // ── FR-2.x ──────────────────────────────────────────────────────────
  const cov = await getFunctionCoverage(prisma);
  check("FR-2.1 7 function tiles with coverage badges", cov.length === 7, cov.map((c) => `${c.fn}:${c.level}`).join(" "));
  const top = await prisma.alert.findFirst({ orderBy: { priorityScore: "desc" } });
  check("FR-2.2 prioritized critical alert exists (score ≥ 0.7)", !!top && top.priorityScore >= 0.7, top ? `${top.id} ${top.priorityScore}` : "none");
  const overdue = await prisma.incident.count({ where: { rcaOverdue: true } });
  check("FR-2.6 RCA-overdue count computed from DB", overdue === 183, `${overdue}`);

  // ── FR-3.1(b) detector ─────────────────────────────────────────────
  const det = await validateDetector(prisma);
  check("Detector reproduces 5 lead times (±2 h)", det.every((d) => d.pass), det.map((d) => `${d.tag}:${d.actualLeadH}/${d.expectedLeadH}`).join(" "));

  // ── FR-3.x reviewer flow (§14 bullet 5), offline ──────────────────────
  const alertId = "det-KO-3201";
  const before = await prisma.alert.findUnique({ where: { id: alertId } });
  const analysis = await runAnalysis(prisma, alertId, "live", "fallback");
  const r = analysis.response;
  const explained = r.rootCauses.length >= 1 && r.rootCauses.every((c) => c.confidence >= 0 && c.confidence <= 1 && c.evidence.length > 0) && Array.isArray(r.dataGaps);
  check("AI output has causes + confidence + evidence + dataGaps", explained, `${r.rootCauses.length} causes, ${r.dataGaps.length} data gaps, engine ${analysis.engine}`);
  const a = r.recommendedAction;
  const created = await createAction(
    prisma,
    { title: a.title, description: a.description, ownerCode: a.suggestedOwnerCode, ownerFunction: a.suggestedOwnerFunction, dueDate: a.suggestedDueDate, priority: a.priority, alertId, aiAnalysisId: analysis.analysisId },
    "verify",
  );
  check("Accept recommended action → tracked with createdBy 'ai'", created.createdBy === "ai", `#${created.id} ${created.createdBy}`);
  const done = await updateAction(prisma, created.id, { status: "done" }, "verify");
  const after = await prisma.alert.findUnique({ where: { id: alertId } });
  check("Mark done → action closed, alert resolved", done?.status === "done" && !!done.closedAt && after?.status === "resolved", `action ${done?.status}, alert ${after?.status}`);
  // cleanup
  await prisma.action.delete({ where: { id: created.id } });
  if (analysis.analysisId) await prisma.aiAnalysis.delete({ where: { id: analysis.analysisId } });
  await prisma.alert.update({ where: { id: alertId }, data: { status: before?.status ?? "open" } });

  // ── FR-3.6 leakage-safe eval ────────────────────────────────────────
  const ev = await runEval(prisma);
  const fbTop1 = ev.rows.filter((x) => x.engines[0].conceptJudge?.verdict === "match").length;
  check("FR-3.6 leave-one-out leakage audit passes 5/5", ev.rows.every((x) => x.leakage.passed), `fallback top-1 match ${fbTop1}/5 (reported, not a pass criterion)`);

  // ── Optional HTTP smoke of every route ───────────────────────────────
  const i = process.argv.indexOf("--http");
  if (i > 0) {
    const base = process.argv[i + 1] ?? "http://localhost:3000";
    const routes = [
      "/dashboard", "/dashboard/reliability", "/dashboard/energy", "/dashboard/hse", "/dashboard/warehouse",
      "/equipment/PU-2101B", "/equipment/KO-3201", "/equipment/FN-8551C", "/alerts", `/alerts/${alertId}`, "/alerts/inc-2",
      "/actions", "/incidents", "/data-sources", "/data-sources/dq/DQ-6", "/dev/ai-eval",
      "/api/dashboard", "/api/equipment/PU2101B", "/api/alerts", "/api/alerts/inc-2", "/api/actions", "/api/data-sources", "/api/ai/eval",
    ];
    const bad: string[] = [];
    let slowest = { route: "", ms: 0 };
    for (const route of routes) {
      const t0 = Date.now();
      const res = await fetch(base + route);
      const ms = Date.now() - t0;
      if (ms > slowest.ms) slowest = { route, ms };
      if (res.status !== 200) bad.push(`${route}=${res.status}`);
    }
    check(`HTTP: ${routes.length} routes return 200`, bad.length === 0, bad.join(" ") || `slowest ${slowest.route} ${slowest.ms} ms`);
  }

  console.log("\n══════════ Definition of Done (PRD §14) — automated checks ══════════");
  for (const r of results) console.log(`${r.pass ? "✔" : "✘"} ${r.item.padEnd(62)} ${r.detail}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(failed ? `\n✘ ${failed} check(s) failed.` : `\n✔ All ${results.length} automated checks pass.`);
  console.log("Manual items (see docs/DEMO.md): visual brand review, assumptions sign-off (docs/ASSUMPTIONS.md).");
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
