"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunLlmEvalButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={!enabled || busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/ai/eval", { method: "POST" });
            if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
            router.refresh();
          } catch (e) {
            setError(String(e instanceof Error ? e.message : e));
          } finally {
            setBusy(false);
          }
        }}
        className="gap-1.5"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        Run LLM evaluation (5 cases + judge)
      </Button>
      <span className="text-[11px] text-muted-foreground">{enabled ? "Calls the Claude API 10 times; takes a few minutes." : "Set ANTHROPIC_API_KEY to enable."}</span>
      {error && <span className="text-xs text-sev-critical">{error}</span>}
    </div>
  );
}
