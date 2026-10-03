// Shapes of the 4 real source files in /mock-data, as found (not as the PRD examples suggest).

export interface MonitoredParameter {
  parameter: string;
  alarm: number;
  trip: number;
}

export interface EquipmentPerformanceRecord {
  equipmentTag: string;
  equipmentName: string;
  equipmentType: string;
  equipmentClass: string;
  plantUnit: string;
  discipline: string;
  criticality: string;
  designLife: string;
  monitoringMethod: string;
  linkedRcaNo: string;
  failureDate: string;
  dominantFailureMode: string;
  monitoredParameters: MonitoredParameter[];
  conditionHistory: {
    week: number;
    date: string;
    readings: Record<string, number>;
    healthStatus: "NORMAL" | "ALARM" | "TRIP";
    remark: string | null;
  }[];
  performanceSummary: Record<string, number>;
}

export interface IncidentRecord {
  incidentId: string;
  sourceSystem: string;
  sourceRecordId: number;
  kpiCategory: string;
  serialNo: number;
  mtoNo: string;
  arNo: string | null;
  plant: string;
  equipmentTag: string;
  equipmentClass: string;
  dateOfOccurrence: string;
  riskCaseTitle: string;
  highestImpact: string;
  preRisk: string;
  riskScore: number;
  picRca: string;
  overallStatus: string;
  statusNormalized: string;
  discipline: string;
  equipmentType: string;
  component: string;
  failureMechanism: string;
  downtimeHours: number;
  actualLossKUSD: number;
  potentialLossKUSD: number;
  totalLossKUSD: number;
  rcaDueDate: string | null;
  rcaOverdue: boolean;
  monthYear: string;
  dataQualityFlags: string[];
}

export interface ProductionInstrumentRecord {
  name: string;
  description: string;
  engUnits: string;
  span: number;
  typicalValue: number;
  zero: number;
  instrumentTag: string;
  digitalSet: string | null;
  parameter: string;
  engUnitsObserved: string;
  dataQualityNote: string | null;
}

export interface ProductionRecord {
  equipmentTag: string;
  plantCode: string;
  sourceSystem: string;
  kpiCategory: string;
  linkedRcaIndex: number;
  period: { start: string; end: string; rows: number };
  instruments: ProductionInstrumentRecord[];
  series: { timestamp: string; values: Record<string, number>; runStatus: "ON" | "OFF" }[];
  derived: {
    offlineHours: number;
    offlineStart: string;
    offlineEnd: string;
    primarySignal: string;
    baselineWindowHours: number;
    baselineMean: number;
    baselineStd: number;
    rule: string;
    firstDetection: string;
    leadTimeHours: number;
  };
}

export interface CapaItem {
  rootCauseRef: string;
  action: string;
  planDate: string;
  pic: string;
  status: string;
}
export interface PreventiveItem {
  ref: string;
  possibleRootCause: string;
  action: string;
  planDate: string;
  pic: string;
}
export interface RiskItem {
  action: string;
  potentialRisk: string;
  countermeasure: string;
  planDate: string;
  pic: string;
}
export interface VerificationItem {
  id: string;
  parameterOrFactor: string;
  result: "G" | "NG";
  evidence: string;
}

export interface RcaRecord {
  rcaId: string;
  sourceSystem: string;
  kpiCategory: string;
  equipmentTag: string;
  plantCode: string;
  plantName: string;
  equipmentClass: string;
  discipline: string;
  title: string;
  dateOccurrence: string;
  dateReported: string;
  immediateAction: string;
  severity: string;
  preRisk: string;
  preRiskScore: number;
  picRca: string;
  downtimeHours: number;
  productionLossTon: number;
  estimatedLossKUSD: number;
  problemStatement: string;
  historicalEvidence: string;
  targetCondition: string;
  chronology: { time: string; event: string }[];
  fourP: VerificationItem[];
  fourMPlusOneE: VerificationItem[];
  verifiedRootCause: string;
  methodology: string[];
  capa: {
    corrective: CapaItem[];
    proactive: CapaItem[];
    preventive: PreventiveItem[];
    riskOfCorrectiveAction: RiskItem[];
  };
  pmSchedule: { pmNo: string; description: string; group: string; interval: string }[];
  capaSummary: Record<string, number>;
}

export const SOURCE_SYSTEMS = {
  equipment: "Equipment Performance (RCA workbook)",
  incident: "Incident Database",
  production: "Production Data (PI Tag)",
  rca: "RCA & Downtime Data (RCA pptx)",
} as const;
