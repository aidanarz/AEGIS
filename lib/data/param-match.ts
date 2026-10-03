// Generic matching between weekly Equipment Performance parameters (free-text labels with units) and
// hourly PI instrument roles. One rule set for every asset — no per-equipment-type logic (FR-1.5).

import type { MonitoredParameter } from "./source-types";

/** Weekly label keyword → PI `parameter` role. */
export const LABEL_TO_PI_ROLE: [RegExp, string][] = [
  [/\bvibration\b/i, "vibration"],
  [/\btemp\b|temperature/i, "temperature"],
  [/\bampere\b|\bcurrent\b/i, "motor_current"],
  [/discharge press/i, "discharge_pressure"],
  [/\bfeed rate\b/i, "feed_rate"],
];

export function piRoleForLabel(label: string): string | null {
  return LABEL_TO_PI_ROLE.find(([re]) => re.test(label))?.[1] ?? null;
}

/** Unit string → comparable token. Qualifiers in parentheses are dropped:
 *  "micron (pk-pk)" → "micron"; "DEG C" / "°C" → "c"; "MM/S" → "mm/s". */
export function normalizeUnit(u: string | null | undefined): string {
  if (!u) return "";
  const s = u.toLowerCase().replace(/\(.*?\)/g, "").replace(/deg\s*|°/g, "").replace(/\s+/g, "").trim();
  if (s === "µm" || s === "um" || s.startsWith("micron")) return "micron";
  return s;
}

const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));

export interface ParamMatch {
  parameter: MonitoredParameter;
  unitsAgree: boolean;
  weeklyUnit: string;
  hourlyUnit: string;
}

/** Best weekly parameter for a PI instrument: same role, then most shared words with the instrument description. */
export function matchWeeklyParameter(
  instrument: { parameter: string; description: string; engUnitsObserved: string },
  params: MonitoredParameter[],
): ParamMatch | null {
  const candidates = params.filter((p) => piRoleForLabel(p.parameter) === instrument.parameter);
  if (!candidates.length) return null;
  const desc = tokens(instrument.description);
  const best = candidates
    .map((p) => ({ p, score: [...tokens(p.parameter)].filter((t) => desc.has(t)).length }))
    .sort((a, b) => b.score - a.score)[0].p;
  const weeklyUnit = normalizeUnit(/\(([^)]+)\)\s*$/.exec(best.parameter)?.[1] ?? "");
  const hourlyUnit = normalizeUnit(instrument.engUnitsObserved);
  return { parameter: best, unitsAgree: !!weeklyUnit && weeklyUnit === hourlyUnit, weeklyUnit, hourlyUnit };
}

/** Rising limit (alarm < trip) vs falling limit (alarm > trip, e.g. seal-flush flow). Derived from the data. */
export const limitDirection = (p: MonitoredParameter): "rising" | "falling" => (p.trip >= p.alarm ? "rising" : "falling");

/** May the weekly alarm/trip limits be drawn on the hourly signal? Only when it is plausibly the same measurement:
 *  same unit, hourly baseline on the healthy side of the alarm, and same magnitude as the early weekly readings. */
export function limitsComparable(m: ParamMatch, hourlyBaseline: number, weeklyBaseline: number | null): { ok: boolean; reason: string } {
  if (!m.unitsAgree) return { ok: false, reason: `units differ (weekly ${m.weeklyUnit || "?"} vs hourly ${m.hourlyUnit || "?"})` };
  const healthy = limitDirection(m.parameter) === "rising" ? hourlyBaseline < m.parameter.alarm : hourlyBaseline > m.parameter.alarm;
  if (!healthy)
    return { ok: false, reason: `hourly baseline ${hourlyBaseline.toFixed(1)} is already beyond the weekly alarm ${m.parameter.alarm} — likely a different measurement point` };
  if (weeklyBaseline != null && weeklyBaseline !== 0) {
    const ratio = hourlyBaseline / weeklyBaseline;
    if (ratio < 0.5 || ratio > 2)
      return { ok: false, reason: `hourly baseline ${hourlyBaseline.toFixed(1)} vs weekly ${weeklyBaseline.toFixed(1)} — magnitudes differ, likely a different measurement point` };
  }
  return { ok: true, reason: `limits from weekly "${m.parameter.parameter}"` };
}
