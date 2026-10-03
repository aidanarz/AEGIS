// Baseline-deviation detector (PRD FR-3.1(b), §6.6). Pure, signal-agnostic, no per-asset tuning.
//
// Rule: baseline = first 120 hourly readings of the file (mean, sample σ).
//       Flag when 3 consecutive hours deviate beyond ±3σ. The flag is raised at the 3rd (confirming) hour.
// Primary signal: chosen per asset FROM DATA — the instrument with the largest sustained |z|
//       (max over 3-hour windows of the smallest |z| in the window) during the operating campaign
//       (end of baseline → first RUN_STATUS = OFF). Nothing is hardcoded per equipment type.

export const BASELINE_HOURS = 120;
export const SIGMA_THRESHOLD = 3;
export const PERSISTENCE_HOURS = 3;

export interface HourlyPoint {
  timestamp: string; // ISO
  values: Record<string, number>;
  runStatus: "ON" | "OFF";
}

export interface SignalStats {
  signal: string;
  baselineMean: number;
  baselineStd: number;
  sustainedZ: number; // signed: + = rising, − = falling
  firstFlagIndex: number | null;
  firstFlagAt: string | null;
  strayExceedances: number; // single-hour |z|>3 before the first flag (noise indicator)
}

export interface Escalation {
  severity: DetectorSeverity;
  at: string;
  sustainedZ: number;
}

export type DetectorSeverity = "critical" | "high" | "medium";

export interface DetectorResult {
  rule: string;
  campaignStart: string;
  tripAt: string | null; // first RUN_STATUS OFF hour
  offHours: number;
  primary: SignalStats;
  runnerUp: SignalStats | null;
  candidates: SignalStats[];
  leadTimeHours: number | null;
  /** Severity escalates hourly as the sustained deviation grows (PRD §7.1 bands: ≥6σ critical, ≥4σ high, else medium). */
  escalations: Escalation[];
  peakSustainedZ: number;
  severity: DetectorSeverity | null;
  zSeries: { timestamp: string; z: number }[]; // primary signal, for charts
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sampleStd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

export function severityForSigma(absZ: number): DetectorSeverity {
  if (absZ >= 6) return "critical";
  if (absZ >= 4) return "high";
  return "medium";
}

/** Smallest |z| over the 3-hour window ending at i, signed by the window's direction (0 if directions disagree). */
function windowZ(z: number[], i: number): number {
  const w = z.slice(i - PERSISTENCE_HOURS + 1, i + 1);
  const allPos = w.every((v) => v > 0);
  const allNeg = w.every((v) => v < 0);
  if (!allPos && !allNeg) return 0;
  const m = Math.min(...w.map(Math.abs));
  return allPos ? m : -m;
}

export function analyseSignal(series: HourlyPoint[], signal: string, campaignEnd: number): SignalStats & { z: number[] } {
  const values = series.map((p) => p.values[signal]);
  const base = values.slice(0, BASELINE_HOURS);
  const m = mean(base);
  const sd = sampleStd(base);
  const z = values.map((v) => (sd > 0 ? (v - m) / sd : 0));

  let sustained = 0;
  for (let i = BASELINE_HOURS + PERSISTENCE_HOURS - 1; i < campaignEnd; i++) {
    const wz = windowZ(z, i);
    if (Math.abs(wz) > Math.abs(sustained)) sustained = wz;
  }

  let firstFlagIndex: number | null = null;
  for (let i = BASELINE_HOURS + PERSISTENCE_HOURS - 1; i < campaignEnd; i++) {
    let ok = true;
    for (let j = i - PERSISTENCE_HOURS + 1; j <= i; j++) if (Math.abs(z[j]) <= SIGMA_THRESHOLD) ok = false;
    if (ok) {
      firstFlagIndex = i; // confirming (3rd) hour
      break;
    }
  }

  const strayEnd = firstFlagIndex == null ? campaignEnd : firstFlagIndex - PERSISTENCE_HOURS + 1;
  let stray = 0;
  for (let i = BASELINE_HOURS; i < strayEnd; i++) if (Math.abs(z[i]) > SIGMA_THRESHOLD) stray++;

  return {
    signal,
    baselineMean: m,
    baselineStd: sd,
    sustainedZ: sustained,
    firstFlagIndex,
    firstFlagAt: firstFlagIndex == null ? null : series[firstFlagIndex].timestamp,
    strayExceedances: stray,
    z,
  };
}

/** @param signals numeric instrument names to consider (all of them — the detector decides which matters). */
export function detect(series: HourlyPoint[], signals: string[]): DetectorResult | null {
  if (series.length <= BASELINE_HOURS + PERSISTENCE_HOURS) return null;
  const tripIndex = series.findIndex((p, i) => i >= BASELINE_HOURS && p.runStatus === "OFF");
  const campaignEnd = tripIndex >= 0 ? tripIndex : series.length;

  const analysed = signals.map((s) => analyseSignal(series, s, campaignEnd));
  analysed.sort((a, b) => Math.abs(b.sustainedZ) - Math.abs(a.sustainedZ));
  const [primaryFull, runnerFull] = analysed;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const strip = ({ z: _z, ...rest }: SignalStats & { z: number[] }): SignalStats => rest;
  const primary = strip(primaryFull);

  const tripAt = tripIndex >= 0 ? series[tripIndex].timestamp : null;
  const leadTimeHours =
    primary.firstFlagAt && tripAt ? (Date.parse(tripAt) - Date.parse(primary.firstFlagAt)) / 3_600_000 : null;

  // Escalation: from the first flag until the trip, re-evaluate the 3-hour sustained |z| every hour.
  const escalations: Escalation[] = [];
  let peak = 0;
  if (primaryFull.firstFlagIndex != null) {
    let current: DetectorSeverity | null = null;
    for (let i = primaryFull.firstFlagIndex; i < campaignEnd; i++) {
      const wz = Math.abs(windowZ(primaryFull.z, i));
      peak = Math.max(peak, wz);
      const sev = severityForSigma(peak);
      if (sev !== current) {
        escalations.push({ severity: sev, at: series[i].timestamp, sustainedZ: round(peak, 2) });
        current = sev;
      }
    }
  }

  return {
    rule: `baseline = first ${BASELINE_HOURS} h (mean, sample σ); flag on ${PERSISTENCE_HOURS} consecutive hours beyond ±${SIGMA_THRESHOLD}σ; primary signal = largest sustained |z|`,
    campaignStart: series[BASELINE_HOURS].timestamp,
    tripAt,
    offHours: series.filter((p) => p.runStatus === "OFF").length,
    primary,
    runnerUp: runnerFull ? strip(runnerFull) : null,
    candidates: analysed.map(strip),
    leadTimeHours,
    escalations,
    peakSustainedZ: round(peak, 2),
    severity: escalations.length ? escalations[escalations.length - 1].severity : null,
    zSeries: series.map((p, i) => ({ timestamp: p.timestamp, z: round(primaryFull.z[i], 3) })),
  };
}

function round(n: number, dp: number) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
