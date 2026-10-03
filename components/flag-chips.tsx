import Link from "next/link";

/** FR-1.7 — per-record data-quality flags: the source file's own flags + the DQ codes our rules assigned. */
export function FlagChips({ flags, codes }: { flags: string[]; codes: string[] }) {
  if (!flags.length && !codes.length) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex max-w-52 flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className="rounded border border-sev-high/40 bg-sev-high/10 px-1 font-mono text-[10px] text-[#a4520b]">
          {f}
        </span>
      ))}
      {codes.map((c) => (
        <Link
          key={c}
          href={`/data-sources/dq/${c}`}
          className="rounded border border-card-border bg-app-bg px-1 font-mono text-[10px] text-cyan-deep hover:border-cyan"
        >
          {c}
        </Link>
      ))}
    </div>
  );
}
