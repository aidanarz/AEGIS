"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FUNCTIONS, ownerFunctionFromPic } from "@/lib/data/normalize";

export interface ActionFormValues {
  title: string;
  description: string;
  ownerCode: string;
  ownerFunction: string;
  dueDate: string;
  priority: string;
  rcaId: string;
}

export const EMPTY_ACTION: ActionFormValues = { title: "", description: "", ownerCode: "", ownerFunction: "Reliability", dueDate: "", priority: "medium", rcaId: "" };

/** Create / edit / reassign dialog for the Action Tracker. */
export function ActionDialog({
  open,
  title,
  initial,
  ownerCodes,
  rcaOptions,
  submitLabel,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial: ActionFormValues;
  ownerCodes: { code: string; fn: string | null; incidents: number }[];
  rcaOptions?: { rcaId: string; equipmentTag: string }[];
  submitLabel: string;
  onClose: () => void;
  onSubmit: (v: ActionFormValues) => Promise<void>;
}) {
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setV(initial);
      setError(null);
    }
  }, [open, initial]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;

  const set = (k: keyof ActionFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setV((cur) => {
      const next = { ...cur, [k]: value };
      // Owner code decides the function when its prefix maps (§6.7).
      if (k === "ownerCode") next.ownerFunction = ownerFunctionFromPic(value) ?? cur.ownerFunction;
      return next;
    });
  };
  const mapped = ownerFunctionFromPic(v.ownerCode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(v);
      onClose();
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-deep/50 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label={title} className="mt-12 w-full max-w-lg rounded-xl border border-card-border bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Title *</span>
            <input required minLength={3} value={v.title} onChange={set("title")} className="rounded-md border border-card-border px-2 py-1.5" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Description / evidence</span>
            <textarea rows={3} value={v.description} onChange={set("description")} className="rounded-md border border-card-border px-2 py-1.5" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Owner code</span>
              <input list="action-owner-codes" value={v.ownerCode} onChange={set("ownerCode")} placeholder="e.g. REL-05" className="rounded-md border border-card-border px-2 py-1.5 font-mono" />
              <datalist id="action-owner-codes">
                {ownerCodes.map((o) => (
                  <option key={o.code} value={o.code}>{`${o.fn ?? "unmapped"} · ${o.incidents} incidents`}</option>
                ))}
              </datalist>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Function {mapped && "(from code prefix)"}</span>
              <select value={v.ownerFunction} onChange={set("ownerFunction")} disabled={!!mapped} className="rounded-md border border-card-border px-2 py-1.5 disabled:bg-muted">
                {FUNCTIONS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Due date</span>
              <input type="date" value={v.dueDate} onChange={set("dueDate")} className="rounded-md border border-card-border px-2 py-1.5" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Priority</span>
              <select value={v.priority} onChange={set("priority")} className="rounded-md border border-card-border px-2 py-1.5">
                {["critical", "high", "medium", "low"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          {rcaOptions && (
            <label className="grid gap-1">
              <span className="text-xs font-medium text-muted-foreground">Link to RCA (optional)</span>
              <select value={v.rcaId} onChange={set("rcaId")} className="rounded-md border border-card-border px-2 py-1.5">
                <option value="">— none —</option>
                {rcaOptions.map((r) => (
                  <option key={r.rcaId} value={r.rcaId}>
                    {r.rcaId} · {r.equipmentTag}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {error && <div className="mt-3 rounded-md bg-sev-critical/10 p-2 text-xs text-sev-critical">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
