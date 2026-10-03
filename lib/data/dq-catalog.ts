// PRD §6.5 data-quality findings (+ DQ-13 found in the incident file's own flags).
// Text is the PRD's; detection logic lives in lib/data/dq.ts.

export type DqSource = "equipment" | "incident" | "production" | "rca" | "cross-source";

export interface DqDefinition {
  code: string;
  flag: string;
  title: string;
  source: DqSource;
  severity: "warning" | "info";
  handling: string;
  prdScale: string; // what the PRD says the scale is — shown next to the live count
}

export const DQ_CATALOG: DqDefinition[] = [
  {
    code: "DQ-1",
    flag: "missing_ar_no",
    title: "AR No. missing",
    source: "incident",
    severity: "warning",
    prdScale: "226 / 380",
    handling: "No linked RCA report — AI can only use pattern-level context for these incidents.",
  },
  {
    code: "DQ-2",
    flag: "duplicate_ar_no",
    title: "AR No. duplicated across unrelated incidents",
    source: "incident",
    severity: "warning",
    prdScale: "2 pairs (4 rows)",
    handling: "Never used as a unique key; Incident.serialNo is the primary key.",
  },
  {
    code: "DQ-3",
    flag: "duplicate_mto_no",
    title: "MTO No. duplicated",
    source: "incident",
    severity: "warning",
    prdScale: "1 pair",
    handling: "Never used as a key.",
  },
  {
    code: "DQ-4",
    flag: "truncated_f_mechanism",
    title: "Failure mechanism truncated / mis-split",
    source: "incident",
    severity: "warning",
    prdScale: "5 focus rows",
    handling: "Raw value kept; AI context uses riskCaseTitle + component instead.",
  },
  {
    code: "DQ-5",
    flag: "missing_rca_due_date",
    title: "RCA due date missing",
    source: "incident",
    severity: "info",
    prdScale: "197 / 380",
    handling: "Overdue logic is only evaluated when a due date exists.",
  },
  {
    code: "DQ-6",
    flag: "unit_mismatch",
    title: "Declared unit / span inconsistent with observed values",
    source: "production",
    severity: "warning",
    prdScale: "1 tag (KO-3201 vibration)",
    handling: "Observed unit stored (engUnitsObserved); values are never compared against the declared span.",
  },
  {
    code: "DQ-7",
    flag: "template_tag_not_applicable",
    title: "Template PI tag irrelevant to the asset type",
    source: "production",
    severity: "info",
    prdScale: "HE-3301 (VIB, AMP)",
    handling:
      "Tag kept but not treated as an equipment-health signal; the detector picks the primary signal from data (HE-3301 → FEED decline).",
  },
  {
    code: "DQ-8",
    flag: "causal_parameter_not_in_pi",
    title: "Causal parameter absent from hourly PI tags",
    source: "cross-source",
    severity: "warning",
    prdScale: "3 cases (+ HE-3301 via DQ-7)",
    handling:
      "Parameter exists only in the weekly Equipment Performance readings (and RCA narrative). AI must combine weak hourly precursors with weekly data, RCA knowledge and similar cases, and report the gap in dataGaps.",
  },
  {
    code: "DQ-9",
    flag: "offline_hours_vs_downtime",
    title: "RUN_STATUS OFF hours differ from reported downtime",
    source: "cross-source",
    severity: "info",
    prdScale: "2 of 5 (PU 18 vs 18.5 h; HE 13 vs 12 h)",
    handling: "Hourly sampling granularity — treated as consistent within ±1 h.",
  },
  {
    code: "DQ-10",
    flag: "plant_name_inconsistent",
    title: "Plant naming differs between sources",
    source: "cross-source",
    severity: "info",
    prdScale: "all focus plants",
    handling: "Resolved by canonical plantCode; raw spellings kept as aliases. 8 of 12 codes have no name in the files and are shown as codes only.",
  },
  {
    code: "DQ-11",
    flag: "status_enum_mapped",
    title: "Source status enum (6 values) mapped to normalized status",
    source: "incident",
    severity: "info",
    prdScale: "all incidents",
    handling: "Mapped to open / in_progress / monitoring / closed / cancelled; raw overallStatus kept.",
  },
  {
    code: "DQ-12",
    flag: "capa_status_snapshot",
    title: "CAPA status is a snapshot of unknown date",
    source: "rca",
    severity: "warning",
    prdScale: "18 / 20 items",
    handling: 'Shown as "overdue per source snapshot" with a tooltip caveat; no status is inferred.',
  },
  {
    code: "DQ-13",
    flag: "duplicate_tag_number",
    title: "Same equipment tag on two incidents in different plants",
    source: "incident",
    severity: "warning",
    prdScale: "CV-5846 ×2 (not in PRD §6.5; flagged in the source file)",
    handling:
      "Treated as two distinct incidents (§6.3 rule 4). The Equipment row takes the plant of the earliest serial; each incident keeps its own plant.",
  },
];

export const DQ_BY_CODE = Object.fromEntries(DQ_CATALOG.map((d) => [d.code, d])) as Record<string, DqDefinition>;
