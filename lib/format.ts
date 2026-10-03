// Source timestamps are stored as UTC wall-clock (see parseSourceDate) — always format in UTC.

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export const fmtDateTime = (d: Date | string | null | undefined) =>
  d
    ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })
    : "—";

/** Real wall-clock instants (e.g. ingestion runs) — shown in the viewer's local time. */
export const fmtInstant = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

export const fmtNum = (n: number | null | undefined, dp = 0) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtKUsd = (k: number | null | undefined) => (k == null ? "—" : `$${fmtNum(k, 1)}k`);

export const fmtBytes = (b: number | null | undefined) => (b == null ? "—" : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} kB`);
