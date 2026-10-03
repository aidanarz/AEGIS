import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleSlash, MinusCircle, ShieldCheck, ShieldX } from "lucide-react";
import { prisma } from "@/lib/data/prisma";
import { runEval, type EvalRow } from "@/lib/ai/eval";
import { MODEL } from "@/lib/ai/llm";
import type { Verdict } from "@/lib/ai/concepts";
import { PageHeader, Section } from "@/components/page-header";
import { RunLlmEvalButton } from "@/components/ai/run-llm-eval-button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const V: Record<Verdict, { label: string; Icon: typeof CheckCircle2; cls: string }> = {
  match: { label: "match", Icon: CheckCircle2, cls: "bg-lime/20 text-lime-deep border-lime/50" },
  partial: { label: "partial", Icon: MinusCircle, cls: "bg-sev-medium/25 text-[#8a6d00] border-sev-medium/60" },
  "no-match": { label: "no-match", Icon: CircleSlash, cls: "bg-sev-critical/10 text-sev-critical border-sev-critical/40" },
};

function VerdictChip({ v }: { v: Verdict | null | undefined }) {
  if (!v) return <span className="text-xs text-muted-foreground">—</span>;
  const s = V[v];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", s.cls)}>
      <s.Icon className="size-3" aria-hidden /> {s.label}
    </span>
  );
}

function tally(rows: EvalRow[], engine: "fallback" | "llm", pick: (e: EvalRow["engines"][number]) => Verdict | null | undefined) {
  const t = { match: 0, partial: 0, "no-match": 0, notRun: 0 };
  for (const r of rows) {
    const e = r.engines.find((x) => x.engine === engine);
    const v = e ? pick(e) : null;
    if (v) t[v]++;
    else t.notRun++;
  }
  return t;
}

export default async function AiEvalPage() {
  const { rows, llmAvailable } = await runEval(prisma);
  const fbTop = tally(rows, "fallback", (e) => e.conceptJudge?.verdict);
  const fbTop3 = tally(rows, "fallback", (e) => e.bestInTop3);
  const llmTop = tally(rows, "llm", (e) => e.llmJudge?.verdict ?? e.conceptJudge?.verdict);
  const leakOk = rows.every((r) => r.leakage.passed);

  return (
    <>
      <PageHeader pillar="Developer · FR-3.6 leakage-safe self-evaluation" title="AI root-cause evaluation (leave-one-out)">
        <RunLlmEvalButton enabled={llmAvailable} />
      </PageHeader>

      <div className="mb-6 rounded-lg border border-sev-high/40 bg-sev-high/5 p-4 text-sm">
        <div className="mb-1 flex items-center gap-2 font-semibold text-[#8a4a0b]">
          <AlertTriangle className="size-4" /> Read these results with their limits
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs">
          <li>
            Only <strong>5 labelled failures</strong> exist, each a <strong>different mechanism</strong>. Similar-case retrieval can only draw on the other 4 — this is a hard
            test by design, and 5 cases cannot establish accuracy. AI output is a hypothesis for engineers to verify.
          </li>
          <li>
            The <strong>rule-based fallback&apos;s generic rules were written from these same 5 cases</strong> (PRD §8.5 derives them from the §6.6 signatures and 4P patterns). Its
            leave-one-out score is therefore <strong>optimistic, not an independent test</strong>. Exact-tag rules are disabled in this mode.
          </li>
          <li>
            The offline <strong>concept judge</strong> is a keyword lexicon (also written with knowledge of the decks). When an API key is set, Claude acts as an independent
            semantic judge for the LLM results.
          </li>
          <li>Each case is analysed from its detector alert, using only data dated at or before the alert (no look-ahead).</li>
        </ul>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Summary title="Fallback — top-1" t={fbTop} note="generic rules only · concept judge" />
        <Summary title="Fallback — correct cause in top 3" t={fbTop3} note="any of the top 3 candidates" />
        <Summary title={`LLM (${MODEL}) — top-1`} t={llmTop} note={llmAvailable ? "Claude judge where run, else concept judge" : "not run: no API key configured"} />
        <div className={cn("rounded-lg border p-3", leakOk ? "border-lime/50 bg-lime/10" : "border-sev-critical/50 bg-sev-critical/10")}>
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            {leakOk ? <ShieldCheck className="size-5 text-lime-deep" /> : <ShieldX className="size-5 text-sev-critical" />} Leakage audit
          </div>
          <div className={cn("text-2xl font-bold", leakOk ? "text-lime-deep" : "text-sev-critical")}>{leakOk ? "Passed 5/5" : "FAILED"}</div>
          <div className="text-[11px] text-muted-foreground">No stripped answer-key text found in any context sent to the model.</div>
        </div>
      </div>

      <Section title="Per case">
        <Card className="border-card-border py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case</TableHead>
                <TableHead className="w-[24%]">Verified root cause (answer key)</TableHead>
                <TableHead className="w-[24%]">Fallback — top cause</TableHead>
                <TableHead>Top-1</TableHead>
                <TableHead>Top-3</TableHead>
                <TableHead className="w-[22%]">LLM — top cause</TableHead>
                <TableHead>LLM verdict</TableHead>
                <TableHead>Leakage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const fb = r.engines.find((e) => e.engine === "fallback")!;
                const llm = r.engines.find((e) => e.engine === "llm")!;
                return (
                  <TableRow key={r.rcaId} className="align-top">
                    <TableCell>
                      <Link href={`/alerts/${r.alertId}`} className="font-semibold text-navy hover:underline">
                        {r.equipmentTag}
                      </Link>
                      <div className="font-mono text-[10px] text-muted-foreground">{r.rcaId}</div>
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs">{r.verifiedRootCause}</TableCell>
                    <TableCell className="whitespace-normal text-xs">
                      <div className="font-medium">{fb.topCause}</div>
                      <div className="text-muted-foreground">confidence {fb.topConfidence?.toFixed(2)}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{fb.conceptJudge?.rationale}</div>
                      {fb.result && fb.result.response.rootCauses.length > 1 && (
                        <div className="mt-1 text-[11px]">
                          also: {fb.result.response.rootCauses.slice(1, 3).map((c) => c.cause).join(" · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <VerdictChip v={fb.conceptJudge?.verdict} />
                    </TableCell>
                    <TableCell>
                      <VerdictChip v={fb.bestInTop3} />
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs">
                      {llm.topCause ? (
                        <>
                          <div className="font-medium">{llm.topCause}</div>
                          <div className="text-muted-foreground">confidence {llm.topConfidence?.toFixed(2)}</div>
                          {llm.llmJudge && <div className="mt-1 text-[11px] text-muted-foreground">Judge: {llm.llmJudge.rationale}</div>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">{llm.note}</span>
                      )}
                    </TableCell>
                    <TableCell className="space-y-1">
                      {llm.llmJudge && (
                        <div>
                          <VerdictChip v={llm.llmJudge.verdict} /> <span className="text-[10px] text-muted-foreground">Claude judge</span>
                        </div>
                      )}
                      {llm.conceptJudge && (
                        <div>
                          <VerdictChip v={llm.conceptJudge.verdict} /> <span className="text-[10px] text-muted-foreground">concept judge</span>
                        </div>
                      )}
                      {!llm.topCause && <VerdictChip v={null} />}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.leakage.passed ? <span className="font-semibold text-lime-deep">pass</span> : <span className="font-semibold text-sev-critical">FAIL</span>}
                      <div className="text-[10px] text-muted-foreground">
                        {r.leakage.checks.length} strings checked · {r.leakage.redactions} redaction(s)
                      </div>
                      {r.leakage.checks
                        .filter((c) => c.foundInContext || c.foundOnlyInSensorLabels)
                        .map((c) => (
                          <div key={c.field} className={cn("text-[10px]", c.foundInContext ? "text-sev-critical" : "text-muted-foreground")}>
                            {c.foundInContext ? `LEAK: ${c.field}` : `“${c.term}” appears only as a sensor label (allowed)`}
                          </div>
                        ))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section
        title="What was stripped"
        description="For case N the context never contains N's RCA report (verified root cause, 4P, 4M+1E, CAPA, PM schedule, historical evidence, chronology), N's Equipment-Performance dominantFailureMode, or N's incident riskCaseTitle / failureMechanism / component. Free text quoting any of them is redacted, and the leakage audit above re-checks the final context. Similar cases come from the other 4 reports only."
      >
        <span />
      </Section>
    </>
  );
}

function Summary({ title, t, note }: { title: string; t: ReturnType<typeof tally>; note: string }) {
  const run = 5 - t.notRun;
  return (
    <div className="rounded-lg border border-card-border bg-white p-3">
      <div className="text-sm font-semibold text-navy">{title}</div>
      {run === 0 ? (
        <div className="py-2 text-2xl font-bold text-muted-foreground">not run</div>
      ) : (
        <div className="text-2xl font-bold text-navy">
          {t.match}/{run} <span className="text-sm font-normal text-muted-foreground">match</span>
        </div>
      )}
      <div className="mt-1 flex gap-2 text-xs">
        <span className="text-lime-deep">{t.match} match</span>
        <span className="text-[#8a6d00]">{t.partial} partial</span>
        <span className="text-sev-critical">{t["no-match"]} no-match</span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>
    </div>
  );
}
