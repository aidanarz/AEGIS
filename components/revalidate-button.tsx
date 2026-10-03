"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RevalidateButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ingest", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={run} disabled={busy || pending} className="gap-2">
        <RefreshCw className={busy || pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
        Re-validate sources
      </Button>
      <span className="text-xs text-muted-foreground">Re-reads files, verifies hash + counts, re-runs DQ rules</span>
      {error && <span className="text-xs text-sev-critical">{error}</span>}
    </div>
  );
}
