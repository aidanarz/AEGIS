// Key normalization rules (PRD §6.3) and KPI taxonomy mapping (PRD §6.4).
// Pure functions — shared by the seed script, API routes and UI.

/** Rule 1 — insert a hyphen after the 2-letter prefix when absent: PU2101B → PU-2101B. */
export function canonicalTag(raw: string): string {
  const t = raw.trim().toUpperCase();
  if (/^[A-Z]{2}-/.test(t)) return t;
  const m = /^([A-Z]{2})(\d.*)$/.exec(t);
  return m ? `${m[1]}-${m[2]}` : t;
}

/** Production instrument names carry the tag without hyphen: PU2101B_VIB → PU-2101B. PLANT_RATE → null. */
export function tagFromInstrumentName(name: string): string | null {
  const m = /^([A-Z]{2}\d+[A-Z]?)_/.exec(name);
  return m ? canonicalTag(m[1]) : null;
}

/** Rule 2 — extract the 3-letter plant code from any spelling:
 *  "ARP", "Resin Plant (ARP)", "ARP  (Aurora Resin Plant)", "ARP PRODUCTION RATE". */
export function extractPlantCode(raw: string): string | null {
  const s = raw.trim();
  const paren = /\(([A-Z0-9]{3})\)/.exec(s);
  if (paren) return paren[1];
  const lead = /^([A-Z0-9]{3})\b/.exec(s);
  return lead ? lead[1] : null;
}

/** Plant name from an RCA deck spelling "ARP  (Aurora Resin Plant)" → "Aurora Resin Plant". */
export function plantNameFromRca(raw: string): string | null {
  const m = /^[A-Z0-9]{3}\s*\((.+)\)\s*$/.exec(raw.trim());
  return m ? m[1].trim() : null;
}

/** §6.7 — owner-code prefix → function. Returns null for unknown prefixes (never guessed). */
export const PIC_PREFIX_FUNCTION: Record<string, FunctionName> = {
  REL: "Reliability",
  ROT: "Maintenance",
  STA: "Maintenance",
  ELE: "Maintenance",
  INS: "Maintenance",
  OPS: "Production",
};

export function ownerFunctionFromPic(pic: string | null | undefined): FunctionName | null {
  if (!pic) return null;
  const prefix = pic.split("-")[0]?.toUpperCase();
  return PIC_PREFIX_FUNCTION[prefix] ?? null;
}

export const FUNCTIONS = [
  "Production",
  "Maintenance",
  "Reliability",
  "Warehouse",
  "Procurement",
  "Energy",
  "HSE",
] as const;
export type FunctionName = (typeof FUNCTIONS)[number];

/** §6.4 KPI taxonomy. */
export const KPI_CATEGORIES = [
  "reliability",
  "availability",
  "throughput",
  "risk_exposure",
  "cost_impact",
  "condition",
] as const;
export type KpiCategory = (typeof KPI_CATEGORIES)[number];

/** §6.4 — Production instrument role → kpiCategory. Keyed on the file's `parameter` field, not on tag names. */
const PRODUCTION_PARAMETER_KPI: Record<string, KpiCategory> = {
  feed_rate: "throughput",
  production_rate: "throughput",
  vibration: "condition",
  temperature: "condition",
  discharge_pressure: "condition",
  motor_current: "condition",
  run_status: "availability",
};

export function kpiForProductionParameter(parameter: string): KpiCategory {
  const k = PRODUCTION_PARAMETER_KPI[parameter];
  if (!k) throw new Error(`No §6.4 kpiCategory mapping for production parameter "${parameter}"`);
  return k;
}

/** "Mar-2026" → "2026-03". */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthKeyFromMonthYear(monthYear: string): string {
  const [mon, year] = monthYear.split("-");
  const idx = MONTHS.indexOf(mon);
  if (idx < 0 || !year) throw new Error(`Unrecognised monthYear "${monthYear}"`);
  return `${year}-${String(idx + 1).padStart(2, "0")}`;
}

/** Source timestamps are plant-local without offset; store them as UTC wall-clock so they round-trip unchanged. */
export function parseSourceDate(s: string): Date {
  const iso = s.length === 10 ? `${s}T00:00:00Z` : s.endsWith("Z") ? s : `${s}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable date "${s}"`);
  return d;
}

/** Reference "today" for overdue logic — matches the source's derived rcaOverdue / capaSummary (PRD §6.2.2, DQ-12). */
export const AS_OF_DATE = parseSourceDate("2026-10-03");
