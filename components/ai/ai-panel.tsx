"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bot, CheckCircle2, ClipboardCheck, FlaskConical, Loader2, Pencil, Search, ShieldAlert, Sparkles } from "lucide-react";
import type { AnalysisResult } from "@/lib/ai/schema";
import { FUNCTIONS } from "@/lib/data/normalize";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRoleFetch } from "@/components/role-provider";

type Mode = "live" | "leave-one-out";

export function AiPanel({
  alertId,
  initial,
  canLeaveOneOut,
  llmConfigured,
  ownerOptions,
  existingActions,
}: {
  alertId: string;
  initial: { live: AnalysisResult | null; "leave-one-out": AnalysisResult | null };
  canLeaveOneOut: boolean;
  llmConfigured: boolean;
  ownerOptions: { code: string; fn: string; incidents: number }[];
  existingActions: { id: number; title: string; status: string; createdBy: string }[];
}) {
  const [mode, setMode] = useState<Mode>("live");
  const [results, setResults] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = results[mode];

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/root-cause", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ alertId, mode }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setResults((prev) => ({ ...prev, [mode]: body }));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-card-border bg-white p-0.5 text-sm">
          {(["live", "leave-one-out"] as Mode[]).map((m) => (
            <button
              key={m}
              disabled={m === "leave-one-out" && !canLeaveOneOut}
              onClick={() => setMode(m)}
              className={cn("rounded-md px-3 py-1", mode === m ? "bg-navy text-white" : "text-navy hover:bg-muted", m === "leave-one-out" && !canLeaveOneOut && "cursor-not-allowed opacity-40")}
              title={m === "leave-one-out" ? "Evaluation mode: this case's own answer key is stripped from the context (FR-3.6)" : "Normal analysis"}
            >
              {m === "live" ? "Live analysis" : "Leave-one-out (eval)"}
            </button>
          ))}
        </div>
        <Button onClick={run} disabled={busy} size="sm" className="gap-1.5">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {r ? "Re-run analysis" : "Run AI analysis"}
        </Button>
        <span className="text-[11px] text-muted-foreground">{llmConfigured ? "Claude API configured" : "No API key — deterministic rule-based fallback"}</span>
      </div>
      {error && <div className="rounded-md border border-sev-critical/40 bg-sev-critical/10 p-2 text-sm text-sev-critical">{error}</div>}

      {!r ? (
        <div className="rounded-lg border border-dashed border-card-border bg-white p-6 text-center text-sm text-muted-foreground">
          {busy ? "Assembling context and analysing…" : "No analysis yet for this mode."}
        </div>
      ) : (
        <AnalysisView r={r} />
      )}

      {r && mode === "live" && (
        <ActionForm key={r.analysisId ?? r.createdAt} r={r} alertId={alertId} ownerOptions={ownerOptions} existingActions={existingActions} />
      )}
      {r && mode === "leave-one-out" && (
        <p className="rounded-md bg-app-bg p-2 text-xs text-muted-foreground">
          Leave-one-out output is for evaluation only (see <Link href="/dev/ai-eval" className="text-cyan-deep underline">/dev/ai-eval</Link>) and cannot be accepted as an
          action.
        </p>
      )}
    </div>
  );
}

function AnalysisView({ r }: { r: AnalysisResult }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold", r.engine === "llm" ? "bg-navy text-white" : "bg-sev-medium/30 text-[#8a6d00]")}>
          {r.engine === "llm" ? <Bot className="size-3.5" /> : <FlaskConical className="size-3.5" />}
          {r.engine === "llm" ? `Claude · ${r.model}` : "Rule-based fallback"}
        </span>
        <span className="text-muted-foreground">{r.engineNote}</span>
      </div>

      <div className="rounded-md border border-sev-high/30 bg-sev-high/5 p-2 text-[11px] text-[#8a4a0b]">
        <ShieldAlert className="mr-1 inline size-3.5" aria-hidden />
        Hypothesis for engineers to verify — only 5 labelled failure cases exist, so this is not a confirmed diagnosis.
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">Probable root causes</h3>
        <ol className="space-y-3">
          {r.response.rootCauses.map((c, i) => (
            <li key={i} className={cn("rounded-lg border p-3", i === 0 ? "border-navy/40 bg-white" : "border-card-border bg-white/70")}>
              <div className="flex items-start gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-navy">{c.cause}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="h-2 w-32 overflow-hidden rounded bg-muted">
                      <span className="block h-full rounded bg-cyan-deep" style={{ width: `${c.confidence * 100}%` }} />
                    </span>
                    <span className="font-mono text-xs font-semibold tabular-nums">{Math.round(c.confidence * 100)}% confidence</span>
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    {r.evidenceLinks[i]?.map((e, k) => (
                      <li key={k} className="flex gap-1.5">
                        <span className={cn("mt-0.5 shrink-0", e.verified ? "text-lime-deep" : "text-muted-foreground")} title={e.verified ? "cites a record present in the context" : "justification without a record id"}>
                          {e.verified ? <CheckCircle2 className="size-3.5" /> : <Search className="size-3.5" />}
                        </span>
                        <span>
                          {e.text}
                          {e.refs.length > 0 && (
                            <span className="ml-1">
                              {e.refs.map((ref) =>
                                ref.href ? (
                                  <Link key={ref.id} href={ref.href} className="ml-1 rounded bg-app-bg px-1 font-mono text-[10px] text-cyan-deep hover:underline" title={ref.kind}>
                                    {ref.id}
                                  </Link>
                                ) : null,
                              )}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="rounded-lg border border-sev-medium/60 bg-sev-medium/10 p-3">
        <h3 className="mb-1 text-sm font-bold">Data gaps</h3>
        <p className="mb-1 text-[11px] text-muted-foreground">Parameters that would confirm or refute the top cause but are not in the available data.</p>
        <ul className="list-disc space-y-0.5 pl-5 text-xs">
          {r.response.dataGaps.length ? r.response.dataGaps.map((g) => <li key={g}>{g}</li>) : <li>None reported.</li>}
        </ul>
      </div>

      <details className="rounded-lg border border-card-border bg-white p-3 text-xs">
        <summary className="cursor-pointer font-semibold text-navy">Context used ({r.contextSummary.included.length} sources · cutoff {r.contextSummary.cutoff.slice(0, 16).replace("T", " ")})</summary>
        <ul className="mt-2 list-disc space-y-0.5 pl-5">
          {r.contextSummary.included.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {r.contextSummary.stripped.length > 0 && (
          <p className="mt-2">
            <span className="font-semibold">Stripped (leave-one-out):</span> {r.contextSummary.stripped.join(", ")} · {r.contextSummary.redactions} free-text redaction(s)
          </p>
        )}
        <p className="mt-2 text-muted-foreground">
          Only records dated at or before the alert are used for this asset; similar cases come from the other RCA reports. {r.latencyMs} ms · {r.attempts} attempt(s)
          {r.analysisId ? ` · analysis #${r.analysisId}` : ""}
        </p>
      </details>
    </div>
  );
}

function ActionForm({
  r,
  alertId,
  ownerOptions,
  existingActions,
}: {
  r: AnalysisResult;
  alertId: string;
  ownerOptions: { code: string; fn: string; incidents: number }[];
  existingActions: { id: number; title: string; status: string; createdBy: string }[];
}) {
  const router = useRouter();
  const roleFetch = useRoleFetch();
  const s = r.response.recommendedAction;
  const [form, setForm] = useState({
    title: s.title,
    description: s.description,
    ownerCode: s.suggestedOwnerCode ?? "",
    ownerFunction: s.suggestedOwnerFunction as string,
    dueDate: s.suggestedDueDate.slice(0, 10),
    priority: s.priority as string,
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ id: number; createdBy: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const edited =
    form.title !== s.title ||
    form.description !== s.description ||
    form.ownerCode !== (s.suggestedOwnerCode ?? "") ||
    form.dueDate !== s.suggestedDueDate.slice(0, 10) ||
    form.priority !== s.priority;

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      const res = await roleFetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          ownerCode: form.ownerCode || null,
          alertId,
          aiAnalysisId: r.analysisId,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setCreated({ id: body.id, createdBy: body.createdBy });
      router.refresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="rounded-lg border-2 border-navy/30 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold">Recommended action</h3>
        {!created && (
          <button onClick={() => setEditing(!editing)} className="inline-flex items-center gap-1 text-xs text-cyan-deep hover:underline">
            <Pencil className="size-3" /> {editing ? "Done editing" : "Edit / reassign"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="grid gap-2 text-sm">
          <label className="grid gap-0.5">
            <span className="text-xs text-muted-foreground">Title</span>
            <input value={form.title} onChange={set("title")} className="rounded border border-card-border px-2 py-1" />
          </label>
          <label className="grid gap-0.5">
            <span className="text-xs text-muted-foreground">Description</span>
            <textarea value={form.description} onChange={set("description")} rows={3} className="rounded border border-card-border px-2 py-1" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-0.5">
              <span className="text-xs text-muted-foreground">Owner code</span>
              <input list={`owners-${alertId}`} value={form.ownerCode} onChange={set("ownerCode")} className="rounded border border-card-border px-2 py-1 font-mono" />
              <datalist id={`owners-${alertId}`}>
                {ownerOptions.map((o) => (
                  <option key={o.code} value={o.code}>{`${o.fn} · ${o.incidents} incidents in plant`}</option>
                ))}
              </datalist>
            </label>
            <label className="grid gap-0.5">
              <span className="text-xs text-muted-foreground">Function (derived from code when it maps)</span>
              <select value={form.ownerFunction} onChange={set("ownerFunction")} className="rounded border border-card-border px-2 py-1">
                {FUNCTIONS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-0.5">
              <span className="text-xs text-muted-foreground">Due date</span>
              <input type="date" value={form.dueDate} onChange={set("dueDate")} className="rounded border border-card-border px-2 py-1" />
            </label>
            <label className="grid gap-0.5">
              <span className="text-xs text-muted-foreground">Priority</span>
              <select value={form.priority} onChange={set("priority")} className="rounded border border-card-border px-2 py-1">
                {["critical", "high", "medium", "low"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-sm">
          <div className="font-semibold text-navy">{form.title}</div>
          <p className="text-xs">{form.description}</p>
          <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
            <span>
              Owner <strong className="font-mono text-navy">{form.ownerCode || "—"}</strong> ({form.ownerFunction})
            </span>
            <span>
              Due <strong className="text-navy">{form.dueDate}</strong>
            </span>
            <span>
              Priority <strong className="text-navy">{form.priority}</strong>
            </span>
          </div>
        </div>
      )}
      {error && <div className="mt-2 text-xs text-sev-critical">{error}</div>}
      {created ? (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-lime/15 p-2 text-sm text-lime-deep">
          <ClipboardCheck className="size-4" />
          Added to the Action Tracker as #{created.id} (createdBy: {created.createdBy.replace("_", "-")}).
          <Link href="/actions" className="ml-auto font-semibold underline">
            Open tracker →
          </Link>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={accept} disabled={saving || !r.analysisId} className="gap-1.5">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
            {edited ? "Save edited action to tracker" : "Accept recommended action"}
          </Button>
          <span className="text-[11px] text-muted-foreground">{edited ? "will be recorded as user-edited" : "will be recorded as ai"}</span>
        </div>
      )}
      {existingActions.length > 0 && (
        <div className="mt-3 border-t border-card-border pt-2 text-xs text-muted-foreground">
          Already tracked from this alert:{" "}
          {existingActions.map((a) => (
            <Link key={a.id} href="/actions" className="mr-2 text-cyan-deep hover:underline">
              #{a.id} {a.title.slice(0, 40)} ({a.status.replace("_", " ")})
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
