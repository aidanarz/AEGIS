// PRD §7.1 alert priority formula — implemented EXACTLY as specified. Do not change weights without
// flagging the change to the team (PRD assumption log #9).
//
//   priority_score = severity_weight * 0.5 + normalized_cost_impact * 0.3 + (risk_flag ? 0.2 : 0)
//   severity_weight: critical=1.0, high=0.7, medium=0.4, low=0.2
//   normalized_cost_impact: totalLossKUSD / dataset max totalLossKUSD
//   risk_flag: preRisk in (I, II) OR equipmentClass == A
//   score ≥ 0.7 → "Critical — review now"

export type Severity = "critical" | "high" | "medium" | "low";

export const WEIGHTS = { severity: 0.5, cost: 0.3, risk: 0.2 } as const;
export const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 1.0, high: 0.7, medium: 0.4, low: 0.2 };
export const REVIEW_NOW_THRESHOLD = 0.7;

/** [ASSUMPTION §7.1] incident-derived severity from pre-risk: I, II → critical; III → high; IV → medium. */
export function severityFromPreRisk(preRisk: string): Severity {
  if (preRisk === "I" || preRisk === "II") return "critical";
  if (preRisk === "III") return "high";
  return "medium";
}

/** [ASSUMPTION — agreed decision D] weekly health-status transition severity. */
export function severityFromHealthStatus(status: string): Severity | null {
  if (status === "TRIP") return "critical";
  if (status === "ALARM") return "high";
  return null;
}

export function riskFlag(preRisk: string | null | undefined, equipmentClass: string | null | undefined): boolean {
  return preRisk === "I" || preRisk === "II" || equipmentClass === "A";
}

export interface ScoreBreakdown {
  severity: Severity;
  severityWeight: number;
  totalLossKUSD: number | null;
  datasetMaxLossKUSD: number;
  normalizedCost: number;
  costBasis: string;
  riskFlag: boolean;
  riskBasis: string;
  terms: { severity: number; cost: number; risk: number };
  score: number;
  reviewNow: boolean;
}

export function priorityScore(input: {
  severity: Severity;
  totalLossKUSD: number | null;
  datasetMaxLossKUSD: number;
  costBasis: string;
  preRisk: string | null;
  equipmentClass: string | null;
}): ScoreBreakdown {
  const severityWeight = SEVERITY_WEIGHT[input.severity];
  const normalizedCost = input.totalLossKUSD != null && input.datasetMaxLossKUSD > 0 ? Math.min(1, input.totalLossKUSD / input.datasetMaxLossKUSD) : 0;
  const rf = riskFlag(input.preRisk, input.equipmentClass);
  const terms = {
    severity: severityWeight * WEIGHTS.severity,
    cost: normalizedCost * WEIGHTS.cost,
    risk: rf ? WEIGHTS.risk : 0,
  };
  const score = Math.round((terms.severity + terms.cost + terms.risk) * 1000) / 1000;
  const riskReasons = [];
  if (input.preRisk === "I" || input.preRisk === "II") riskReasons.push(`pre-risk ${input.preRisk}`);
  if (input.equipmentClass === "A") riskReasons.push("equipment class A");
  return {
    severity: input.severity,
    severityWeight,
    totalLossKUSD: input.totalLossKUSD,
    datasetMaxLossKUSD: input.datasetMaxLossKUSD,
    normalizedCost: Math.round(normalizedCost * 1000) / 1000,
    costBasis: input.costBasis,
    riskFlag: rf,
    riskBasis: riskReasons.length ? riskReasons.join(" + ") : `pre-risk ${input.preRisk ?? "—"}, class ${input.equipmentClass ?? "—"}`,
    terms,
    score,
    reviewNow: score >= REVIEW_NOW_THRESHOLD,
  };
}
