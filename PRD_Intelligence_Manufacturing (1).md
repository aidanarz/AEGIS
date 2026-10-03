# Product Requirements Document (PRD)
## [Solution Name] — Intelligence Manufacturing Platform
### CALIBER 2026 — Case 2: Intelligence Manufacturing (Unified Dashboard, AI Insight, Root Cause Analysis, Follow-up Action Recommendation)

| | |
|---|---|
| **Document type** | Product Requirements Document (build standard for AI coding agents / dev team) |
| **Version** | 0.3 — **All 4 data categories now confirmed against real case files** (Equipment Performance, Incident Database, Production Data, RCA & Downtime) |
| **Status** | Ready for prototype build. Remaining open items are product decisions, not missing data (Section 15) |
| **Owner / Team** | [Team Name] |
| **Last updated** | [Date] |
| **Audience** | AI coding agent (e.g. Claude Code), developers, judges/reviewers |

> **How to use this document:** This PRD is the single source of truth for building the prototype. Every functional requirement has an ID, a description, and acceptance criteria. Every data entity has a concrete schema. Where a decision was needed to remove ambiguity, a default was chosen and flagged **[ASSUMPTION]** — change it if it doesn't fit, but don't leave it unresolved.

### Changelog

| Version | Change |
|---|---|
| 0.2 | Equipment Performance schema confirmed from 5 real RCA workbooks |
| **0.3** | **Incident Database, Production Data, and RCA & Downtime schemas replaced with the real ones (from the case zip). Added: join-key rules, data-quality findings (Section 6.5), measured early-warning lead times (Section 6.6), function-coverage gap and proxy mapping (Section 6.7), leakage-safe AI evaluation (FR-3.6/3.7), real CAPA seed for the Action Tracker (Section 9.3). Fixed broken cross-references (brand tokens → 7.3, KPI taxonomy → 6.4, LLM contract → 8.3).** |

---

## 1. Background & Problem Statement

PT Chandra Asri Pacific Tbk (Chandra Asri Group) operates complex, asset-intensive petrochemical facilities across Southeast Asia. Operational data is fragmented across disconnected systems owned by different functions — **Production, Maintenance, Reliability, Warehouse, Procurement, Energy, and Health/Safety/Environment (HSE)**.

This fragmentation causes:
- **Reactive decision-making** — issues are discovered after they already impact operations.
- **Delayed troubleshooting** — root causes are investigated manually, after the fact, across siloed logs.
- **No single source of truth** — executives and function heads each see a partial picture.

The prototype must demonstrate a credible solution to three mandatory key questions:

1. **KQ1 — Data Foundation:** How to rationalize fragmented dashboards and map manufacturing data (Production Data, Incident Database, Equipment Performance, RCA & Downtime Data) into one governed data foundation.
2. **KQ2 — Executive Visibility:** How to build a "Single Pane of Glass" providing executive visibility of manufacturing performance.
3. **KQ3 — AI Root Cause & Action:** How AI can identify probable root causes and translate insights into prioritized follow-up actions with clear ownership and tracking.

**Why this is solvable — now evidenced across all four sources.** The case package contains one coherent story told five times (PU-2101B, KO-3201, PM-4405B, HE-3301, BL-5702). Each failure appears in:

1. the **Incident Database** (one of 380 incidents, US$67.2M total loss, 2,261 h downtime);
2. **Equipment Performance** (≈14 weeks of drifting weekly readings → `ALARM` → `TRIP`);
3. **Production Data** (hourly PI-tag series where the primary signal departs from baseline **27–45 hours before the trip**, measured in Section 6.6);
4. **RCA & Downtime** (a verified root cause, 4P / 4M+1E evidence, and CAPA actions with owners).

Today those four views live in four places and nobody connects them before the trip. A unified platform plus an AI layer that does connect them is exactly what KQ1–KQ3 ask for. **This PRD is built around that real pattern, not a hypothetical one.**

A second, sharper finding makes the case for AI over plain thresholds: for PU-2101B the hourly vibration peaked at **6.27 mm/s before the trip, below the 7.0 mm/s alarm limit** — a fixed-limit alarm would never have fired, while a baseline-deviation rule fires 30 hours earlier (Section 6.6).

---

## 2. Objectives

| ID | Objective | Maps to |
|---|---|---|
| OBJ-1 | Ingest and unify 4 fragmented data sources into one governed, queryable data model | KQ1 |
| OBJ-2 | Provide one web dashboard giving cross-functional, role-based visibility with prioritized alerts | KQ2 |
| OBJ-3 | Use AI to detect anomalies, rank probable root causes, and generate prioritized, owned, trackable actions | KQ3 |
| OBJ-4 | Be demoable end-to-end in a live walkthrough (seed data → alert → AI diagnosis → assigned action → tracked to closure) | All |

**Out of scope for the prototype:** real plant system integrations (DCS/SCADA/ERP live connections), production-grade authentication/SSO, multi-tenant security hardening, mobile native apps. See Section 5.2.

---

## 3. Users & Personas

| Persona | Needs | Primary screens |
|---|---|---|
| **Executive / Plant Manager** | One glance at overall plant health, biggest risks, trend vs. target | Executive Dashboard |
| **Function Head** (Production / Maintenance / Reliability / Warehouse / Procurement / Energy / HSE) | Visibility into their function, plus how it affects others | Function Dashboard, Alerts |
| **Control Room Operator / Engineer** | Fast root-cause diagnosis and next action when an anomaly fires | Alert Detail, Root Cause view |
| **Action Owner** | Clear task, deadline, and evidence; ability to update/close | Action Tracker |
| **Data/Platform Admin** | Confidence that data sources are connected and governed | Data Sources / Admin panel |

**[ASSUMPTION]** No full auth system for the prototype — use a simple **role switcher** (dropdown to view the app "as" each persona).

---

## 4. Solution Architecture Overview

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Data Sources │ → │ AI Engine     │ → │ Unified       │ → │ End Users     │
│  (4 sources) │   │ (Data Ops +   │   │ Dashboard     │   │ (role-based)  │
│              │   │ pattern +     │   │ (Single Pane  │   │               │
│              │   │ root-cause)   │   │  of Glass)    │   │               │
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
```

**Three pillars** (must be visually/structurally distinct in the product):
1. **Unified Data Foundation** — ingestion, common data model, KPI taxonomy, data quality rules.
2. **Single Pane of Glass** — one web dashboard, cross-functional, alert-prioritized, role-based.
3. **AI Root Cause & Action** — anomaly detection → probable root cause ranking → recommended action → ownership → tracking.

### 4.1 Recommended Tech Stack **[ASSUMPTION — adjust if the team has a preferred stack]**

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | **Next.js 14+ (App Router), TypeScript** | Single deployable app, SSR + API routes in one project |
| Styling / UI | **Tailwind CSS + shadcn/ui** | Fast, consistent, themeable with brand tokens (Section 7.3) |
| Charts | **Recharts** | KPI trends, time-series with alarm/trip reference lines, heatmaps via custom grid |
| Backend | **Next.js API routes** (no separate service) | Keeps prototype deployable as one app |
| Data persistence | **SQLite via Prisma ORM** | Seeded from `/mock-data` at startup |
| AI / LLM layer | **Anthropic Claude API** (`claude-sonnet-4-6` or current default) called server-side | Structured-output prompting, Section 8.3 |
| AI fallback | **Deterministic rule-based engine** (no API key) | Section 8.5 — demo never breaks offline |
| Auth | Role switcher (no real auth) | Section 3 |
| Hosting (demo) | **Vercel** (or local `npm run dev`) | One-command deploy |

### 4.2 Repository Structure **[ASSUMPTION]**

```
/app
  /dashboard                 # KQ2 — Executive & function views
  /alerts                    # KQ3 — alert list + detail
  /actions                   # KQ3 — action tracker
  /data-sources              # KQ1 — admin/governance view
  /dev/ai-eval               # FR-3.6 — leave-one-out accuracy view
  /api
    /ingest                  # mock ingestion endpoints
    /ai/root-cause           # AI root-cause + recommendation endpoint
    /alerts
    /actions
/lib
  /ai                        # prompt templates, LLM client, rule-based fallback, similar-case retrieval
  /detect                    # baseline-deviation detector (Section 6.6)
  /data                      # Prisma client, seed scripts, key-normalization helpers (Section 6.3)
/prisma
  schema.prisma
  seed.ts
/mock-data                   # ALL REAL DATA — no fabricated records
  equipment_performance.json # 5 equipment × 26 weekly readings   (converted earlier; see 6.2.1)
  incidents.json             # 380 incidents                        (Section 6.2.2)
  production.json            # 5 equipment × 720 hourly rows        (Section 6.2.3)
  rca_downtime.json          # 5 structured RCA/CAPA reports        (Section 6.2.4)
/scripts
  convert_equipment.py                    # xlsx → equipment_performance.json
  convert_incident_production_rca.py      # xlsx/pptx → incidents/production/rca_downtime.json
```

---

## 5. Scope

### 5.1 In scope (must be built)
- [ ] Ingestion of the 4 real data sources (Section 6)
- [ ] Unified data model, join-key normalization, and KPI taxonomy mapping (Sections 6.3–6.4)
- [ ] Executive dashboard with cross-functional widgets (Section 7.2)
- [ ] Alert feed with AI-driven prioritization (Section 7.2)
- [ ] Root-cause detail view with AI-generated probable causes + confidence (Section 8)
- [ ] Action tracker: create, assign owner, due date, status, close — seeded with real CAPA items (Section 9.3)
- [ ] Role switcher to preview Executive / Function Head / Operator views
- [ ] Data-quality surfacing in the Data Sources admin view (Section 6.5)

### 5.2 Out of scope (explicitly deferred — do not build)
- Real-time integration with plant DCS/SCADA/historian systems
- Production-grade authentication, SSO, or RBAC enforcement at the database level
- Multi-tenant / multi-plant architecture
- Mobile native apps
- Data retention, audit logging, and compliance (HSE regulatory) workflows beyond what's needed to demo the case
- **Synthetic data generation** — Section 9 is now fully real-data-driven

---

## 6. Module A — Data Foundation & Rationalization (KQ1)

> **Source confirmation status (v0.3):** all four data categories are now confirmed against real files. The case brief's broader list ("Production, Downtime, Equipment, Incident, Engineering, Energy & HSE Data") collapses into these four deliverable categories. Schemas below are **as found in the files**; derived/normalized fields are marked *(derived)*.

### 6.1 Functional Requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-1.1 | System ingests all 4 data categories into a common schema | All 4 source types load without error into their Prisma tables (record counts in Section 6.2 match) |
| FR-1.2 | System applies a shared KPI taxonomy across sources (Section 6.4) | Each record is tagged with a standardized `kpiCategory` and `plantCode` |
| FR-1.3 | "Data Sources" admin view shows source, last refresh, record count, and data-quality status | Counts are live from the DB, not hardcoded; DQ flags from Section 6.5 are counted and clickable |
| FR-1.4 | Each unified record keeps a reference back to its originating source and raw ID | `sourceSystem` and `sourceRecordId` present on every unified record |
| FR-1.5 | Equipment records preserve **asset-specific monitored parameters** and alarm/trip limits | `monitoredParameters[]` is data-driven, not hardcoded per equipment type in UI code |
| FR-1.6 | Cross-source joins use the normalized keys in Section 6.3 | Opening any of the 5 focus equipment shows linked records from all 4 sources; join success is displayed in the admin view |
| FR-1.7 | Source anomalies found in Section 6.5 are **flagged, not silently fixed** | `dataQualityFlags[]` persisted per record and visible in the drill-down table |

### 6.2 Data Sources & Schema

#### Source inventory

| # | Category | Source file(s) | Grain | Volume |
|---|---|---|---|---|
| 1 | Equipment Performance | 5 RCA-case workbooks (`Equipment Info`, `Condition History`, `Performance Summary`) | weekly reading per asset | 5 assets × 26 weeks |
| 2 | Incident Database | `Incident Database.xlsx` (sheets `Dashboard`, `Incident Database`) | one row per risk case | **380** incidents, 2024-01-04 → 2026-07-25, 12 plants |
| 3 | Production Data | `Production Data - RCA{1..5} <TAG>.xlsx` (sheets `PI Tag` = instrument metadata, `Sheet2` = time series) | hourly | 5 assets × **720** rows (30 days) × 7 tags |
| 4 | RCA & Downtime Data | `RCA{1..5} - <title>.pptx` (11-slide RCA & CAPA/PAA report each) | one report per failure | 5 reports |

#### 6.2.1 Equipment Performance — **[CONFIRMED]**

One workbook per RCA case. The **4 monitored parameters differ per equipment type** (pump: vibration / seal-flush flow / pressure / bearing temp; heat exchanger: dP / heat duty / outlet temp / fouling; compressor: radial vibration / lube-oil water / lube-oil pressure / bearing-metal temp). The schema must be **parameter-agnostic**.

```json
{
  "equipmentTag": "PU-2101B",
  "equipmentName": "Feed Charge Pump PU-2101B",
  "equipmentType": "Centrifugal Pump",
  "equipmentClass": "A | B | C",
  "plantUnit": "Resin Plant (ARP)",
  "discipline": "ROT | STA | ELE | INS",
  "criticality": "Low | Medium | High",
  "designLife": "string",
  "monitoringMethod": "string",
  "linkedRcaNo": "AR-2026-ARP-0117",
  "failureDate": "2026-03-12",
  "dominantFailureMode": "Mechanical Seal Leakage",
  "monitoredParameters": [
    { "parameter": "Overall Vibration (mm/s)", "alarm": 7.0, "trip": 11.0 },
    { "parameter": "Seal Flush Flow (L/min)", "alarm": 5.0, "trip": 4.0 },
    { "parameter": "Discharge Pressure (barg)", "alarm": 8.5, "trip": 7.5 },
    { "parameter": "Bearing Temp (°C)", "alarm": 80.0, "trip": 95.0 }
  ],
  "conditionHistory": [
    {
      "week": 1, "date": "2025-10-23",
      "readings": { "Overall Vibration (mm/s)": 3.893, "Seal Flush Flow (L/min)": 6.529, "Discharge Pressure (barg)": 9.576, "Bearing Temp (°C)": 62.025 },
      "healthStatus": "NORMAL | ALARM | TRIP",
      "remark": "string | null"
    }
  ],
  "performanceSummary": {
    "Monitoring Period (weeks)": 26, "Total Downtime (hours)": 18.5, "Period Hours": 4368,
    "Availability (%)": 99.58, "No. of Failures (period)": 1, "MTBF (hours)": 4368, "MTTR (hours)": 18.5,
    "ALARM readings": 6, "TRIP readings": 1, "NORMAL readings": 19,
    "PM Compliance (%)": 92, "Production Loss (ton)": 251.6, "Estimated Loss (k USD)": 226.44
  }
}
```

| Equipment Tag | Type | Plant code | Dominant Failure Mode | Failure Date | Est. Loss (k USD) |
|---|---|---|---|---|---|
| PU-2101B | Centrifugal Pump | ARP | Mechanical Seal Leakage | 2026-03-12 | 226.4 |
| KO-3201 | Centrifugal Compressor | ZCU | High Radial Vibration Trip (Bearing Distress) | 2026-04-29 | 1,584.0 |
| PM-4405B | Centrifugal Pump / Electric Motor | NUP | Motor Bearing Failure (Overheating) | 2026-07-08 | 112.0 |
| HE-3301 | Shell & Tube Heat Exchanger | ZCU | High Fouling — Duty Loss & High dP | 2026-05-21 | 183.6 |
| BL-5702 | Centrifugal Blower | OPP | High Vibration (Coupling Misalignment) | 2026-06-17 | 478.8 |

> The zip delivered with v0.3 does **not** contain the Equipment Performance workbooks; `equipment_performance.json` from v0.2 stays as-is. Its failure dates, loss, and downtime were cross-checked against the three new sources and **match exactly** (Section 6.6).

#### 6.2.2 Incident Database — **[CONFIRMED]** · `mock-data/incidents.json`

Title in file: *"Equipment Related Risk — Incident Database (RCA & CAPA/PAA)"*. Workbook has a `Dashboard` sheet (summary) and a 380-row data sheet (header on row 3). The summary dashboard totals reconcile exactly with the row data: **380 incidents · 2,261.1 h downtime · US$67,194k total loss · US$176.8k average**. Note that "Total Loss" = Actual Loss + Potential Loss.

```json
{
  "incidentId": "INC-0001",               // (derived) from Serial No — the ONLY reliable unique key
  "sourceSystem": "Incident Database",
  "sourceRecordId": 1,                     // Serial No
  "kpiCategory": "cost_impact",            // (derived) primary; also feeds reliability/availability
  "serialNo": 1,
  "mtoNo": "MTO-2026-ARP-0031",
  "arNo": "AR-2026-ARP-0117",              // null for 226 of 380 rows
  "plant": "ARP",                          // 12 codes: ZCU ARP OPP SMX OP2 OP3 BRP CRP NUP BDX OPU TKX
  "equipmentTag": "PU-2101B",
  "equipmentClass": "A | B | C",
  "dateOfOccurrence": "2026-03-12",
  "riskCaseTitle": "Feed — Mechanical Seal Leakage",
  "highestImpact": "Uptime Loss | Class A Eq. Breakdown | Equipment Bad Actor | UPSD / Delay Start-up | Inspection Report | Quality Loss",
  "preRisk": "I | II | III | IV",
  "riskScore": 200,                        // 6 … 40000
  "picRca": "REL-05",                      // owner code, see 6.7
  "overallStatus": "NEW REGISTERED | RCA PROCESS | CA/PA EXECUTION | MONITORING RESULT | RISK CLOSED | RISK CANCELED",
  "statusNormalized": "open | in_progress | monitoring | closed | cancelled",   // (derived)
  "discipline": "ROT | STA | INS | ELE",
  "equipmentType": "PU | CO | BL | EM | TX | CD | PZ | SW | RX | HB | SX | TR | TK | FA | VA",
  "component": "Mechanical Seal",
  "failureMechanism": "Leakage | High Vibration | Worn Out | Crack | Fouling | Error | Loose | Stuck | Overheat | Breakage | Malfunction | Low Performance",
  "downtimeHours": 18.5,
  "actualLossKUSD": 226.44,
  "potentialLossKUSD": 67.93,
  "totalLossKUSD": 294.37,
  "rcaDueDate": "2026-04-26",              // null for 197 rows
  "rcaOverdue": true,                      // (derived) not closed/cancelled AND due < 2026-10-03
  "monthYear": "Mar-2026",
  "dataQualityFlags": ["missing_ar_no", "truncated_f_mechanism", "duplicate_ar_no", "duplicate_mto_no", "duplicate_tag_number"]
}
```

Distribution (use for dashboard seed sanity-checks):

| Dimension | Values |
|---|---|
| Discipline | ROT 145 · INS 87 · STA 87 · ELE 61 |
| Equipment class | A 243 · B 118 · C 19 |
| Pre-risk | IV 201 · III 149 · II 29 · I 1 |
| Highest impact | Uptime Loss 148 · Class A Breakdown 110 · Bad Actor 68 · UPSD/Delay Start-up 42 · Inspection Report 10 · Quality Loss 2 |
| Status | Closed 113 · CA/PA Execution 92 · RCA Process 71 · Canceled 47 · Monitoring 37 · New 20 |
| Top failure mechanisms by total loss | Leakage 101 cases / $17.0M · High Vibration 57 / $9.9M · Worn Out 47 / $8.2M · Crack 20 / $6.6M · Fouling 20 / $3.7M |
| Still active (open + in progress + monitoring) | **220** incidents · **$44.3M** total loss · **183** with RCA due date already passed (as of 2026-10-03) |
| Largest single incident | KO-3201, $2,059k total loss — one of the 5 focus cases |

The 5 focus cases are **Serial No 1–5** and carry the same AR numbers, downtime, and actual loss as the RCA decks.

#### 6.2.3 Production Data — **[CONFIRMED]** · `mock-data/production.json`

One workbook per focus asset: sheet `PI Tag` (instrument metadata, 7 rows) + sheet `Sheet2` (hourly series, 720 rows, no missing values). **Hours are not continuous across files** — each file is a different 30-day window.

| Asset | Window | Hours `OFF` | Primary precursor signal |
|---|---|---|---|
| PU-2101B | 2026-03-01 → 03-30 | 18 | `PU2101B_VIB` ↑ |
| KO-3201 | 2026-04-01 → 04-30 | 32 | `KO3201_VIB` ↑ |
| HE-3301 | 2026-05-01 → 05-30 | 13 | `HE3301_FEED` ↓ |
| BL-5702 | 2026-06-01 → 06-30 | 14 | `BL5702_VIB` ↑ |
| PM-4405B | 2026-07-01 → 07-30 | 8 | `PM4405B_TEMP` ↑ |

The 7 tags per file are always the same *roles* (prefix differs): `FEED` (T/H), `DISP` (discharge pressure, barg), `VIB`, `TEMP` (bearing/process °C), `AMP` (motor current, A), `PLANT_RATE` (unit production rate, T/H), `RUN_STATUS` (`ON` / `OFF`).

```json
{
  "equipmentTag": "PU-2101B",
  "plantCode": "ARP",
  "sourceSystem": "Production Data (PI Tag)",
  "kpiCategory": "throughput",
  "period": { "start": "2026-03-01T00:00:00", "end": "2026-03-30T23:00:00", "rows": 720 },
  "instruments": [
    {
      "name": "PU2101B_VIB", "description": "PU-2101B VIBRATION", "engUnits": "MM/S",
      "engUnitsObserved": "MM/S", "span": 20, "typicalValue": 10, "zero": 0,
      "instrumentTag": "PU2101BV.PV", "digitalSet": null, "parameter": "vibration",
      "dataQualityNote": null
    }
  ],
  "series": [
    { "timestamp": "2026-03-01T00:00:00",
      "values": { "PU2101B_FEED": 14.06, "PU2101B_DISP": 9.221, "PU2101B_VIB": 3.129, "PU2101B_TEMP": 66.49, "PU2101B_AMP": 143.52, "PLANT_RATE": 14.029 },
      "runStatus": "ON" }
  ],
  "derived": {
    "offlineHours": 18, "offlineStart": "2026-03-12T03:00:00", "offlineEnd": "2026-03-12T20:00:00",
    "primarySignal": "PU2101B_VIB", "baselineWindowHours": 120, "baselineMean": 3.782, "baselineStd": 0.251,
    "rule": "3 consecutive hourly readings beyond baseline mean ± 3 sigma",
    "firstDetection": "2026-03-10T21:00:00", "leadTimeHours": 30.0
  }
}
```

**[ASSUMPTION]** For DB storage, flatten `series` to a long table `ProductionReading(equipmentTag, timestamp, parameter, value, unit)` (5 × 720 × 6 = 21,600 numeric rows) plus a `RunStatus(equipmentTag, timestamp, status)` table.

#### 6.2.4 RCA & Downtime Data — **[CONFIRMED]** · `mock-data/rca_downtime.json`

Each deck is the company's standard *Abnormality Report — RCA & CAPA/PAA* (Procedure RCA-P-0050-03, Form RCA-F-0075-02), 11 slides: cover → problem identification → chronology → past performance → target → **4P verification** → **4M+1E verification** → impact/control matrix → **CAPA** → preventive & risk → closure summary. All decks have identical structure, so parsing is deterministic.

```json
{
  "rcaId": "AR-2026-ARP-0117",                 // == arNo in Incident Database == linkedRcaNo in Equipment Performance
  "sourceSystem": "RCA & Downtime Data (RCA pptx)",
  "kpiCategory": "availability",
  "equipmentTag": "PU-2101B",
  "plantCode": "ARP",
  "plantName": "Aurora Resin Plant",
  "equipmentClass": "B",
  "discipline": "ROT",
  "title": "Feed Charge Pump PU-2101B — Mechanical Seal Leakage",
  "dateOccurrence": "2026-03-12",
  "dateReported": "2026-03-13",
  "immediateAction": "Isolate PU-2101B, swap to spare PU-2101A, replace mechanical seal cartridge",
  "severity": "Catastrophic | Major | Moderate",
  "preRisk": "III",
  "preRiskScore": 200,
  "picRca": "REL-05",
  "downtimeHours": 18.5,
  "productionLossTon": 251.6,
  "estimatedLossKUSD": 226.44,
  "problemStatement": "string",
  "historicalEvidence": "string (past-performance narrative with baselines and trends)",
  "targetCondition": "string",
  "chronology": [ { "time": "12-Mar-2026 02:15", "event": "string" } ],
  "fourP": [ { "id": "P3", "parameterOrFactor": "Seal flush flow below minimum", "result": "NG | G", "evidence": "string" } ],
  "fourMPlusOneE": [ { "id": "X1", "parameterOrFactor": "string", "result": "NG | G", "evidence": "string" } ],
  "verifiedRootCause": "string",
  "methodology": ["4P", "4M+1E"],
  "capa": {
    "corrective":  [ { "rootCauseRef": "P3", "action": "string", "planDate": "2026-04-24", "pic": "REL-05", "status": "Open | In Progress | Closed" } ],
    "proactive":   [ { "rootCauseRef": "X1", "action": "string", "planDate": "2026-07-24", "pic": "REL-02", "status": "string" } ],
    "preventive":  [ { "ref": "P2", "possibleRootCause": "string", "action": "string", "planDate": "2026-04-24", "pic": "ROT-01" } ],
    "riskOfCorrectiveAction": [ { "action": "string", "potentialRisk": "string", "countermeasure": "string", "planDate": "2026-05-24", "pic": "REL-05" } ]
  },
  "pmSchedule": [ { "pmNo": "PM-1", "description": "string", "group": "Rotating", "interval": "Weekly" } ],
  "capaSummary": { "total": 4, "closed": 0, "overdueAsOf2026-10-03": 4 }
}
```

Summary of the 5 reports:

| rcaId | Tag | Plant | Severity | Pre-risk | Downtime | Prod. loss | Loss | Verified root cause (short) |
|---|---|---|---|---|---|---|---|---|
| AR-2026-ARP-0117 | PU-2101B | ARP | Major | III (200) | 18.5 h | 251.6 t | $226.4k | Intermittent dry-running: suction cavitation + seal-flush < 6 L/min, no interlock |
| AR-2026-ZCU-0142 | KO-3201 | ZCU | Catastrophic | II (4000) | 32.0 h | 1,760 t | $1,584.0k | Water ingress via leaking lube-oil cooler → oil-film loss → journal-bearing distress; no online water-in-oil monitoring |
| AR-2026-NUP-0089 | PM-4405B | NUP | Moderate | III (200) | 8.0 h | 160 t | $112.0k | Grease degradation from over-extended, non-risk-based re-lube interval; no bearing-temp trending |
| AR-2026-ZCU-0165 | HE-3301 | ZCU | Moderate | III (400) | 12.0 h | 216 t | $183.6k | Tube-side coke/polymer fouling from high feed heavy-ends; no dP-based cleaning trigger / fouling KPI |
| AR-2026-OPP-0203 | BL-5702 | OPP | Major | III (400) | 14.0 h | 532 t | $478.8k | Coupling misalignment + soft-foot + over-aged elastomer element; alignment check missing from PM, vibration route too long |

Each report has 5 × 4P checks, 4 × 4M+1E checks, 4 CAPA items (2 corrective + 2 pro-active), 2 preventive items, 1 risk-of-corrective-action row, and 2–3 PM schedule lines.

### 6.3 Cross-Source Join Keys & Normalization

This is the concrete answer to **KQ1** — the same asset is spelled differently in every source:

| Concept | Equipment Performance | Incident DB | Production Data | RCA deck | **Canonical (store this)** |
|---|---|---|---|---|---|
| Equipment tag | `PU-2101B` | `PU-2101B` | `PU2101B_*` (no hyphen) | `PU-2101B` | `PU-2101B` |
| Plant | `Resin Plant (ARP)` | `ARP` | `ARP PRODUCTION RATE` (in description) | `ARP (Aurora Resin Plant)` | `plantCode = ARP`; names kept in a lookup table |
| Failure/RCA id | `linkedRcaNo` | `arNo` | — (filename `RCA1`) | `AR NUMBER` | `rcaId` |
| Time | weekly date | `Date of Occur.` (date) | hourly timestamp | `12 Mar 2026` / `12-Mar-2026 02:15` | ISO 8601 |

Normalization rules (implement in `/lib/data`):
1. **Tag:** insert a hyphen after the 2-letter prefix when absent (`PU2101B` → `PU-2101B`; `PM4405B` → `PM-4405B`).
2. **Plant:** extract the 3-letter code; maintain a `Plant(code, name)` table. Known names (from RCA decks): ARP = Aurora Resin Plant, ZCU = Zeta Cracker Unit, NUP = Nova Utility Plant, OPP = Orion Polypropylene Plant. The other 8 codes (SMX, OP2, OP3, BRP, CRP, BDX, OPU, TKX) have **no name in the case files** — display the code only; do not invent names.
3. **Primary keys:** `Incident.serialNo` only. `arNo` is null on 226/380 rows and duplicated on 2 pairs; `mtoNo` is duplicated once. Use `arNo` solely as a *foreign key to RCA* where it exists.
4. **Equipment ↔ Incident:** join on `equipmentTag` **and** `arNo` for the 5 focus cases; on `equipmentTag` alone elsewhere (and treat `CV-5846`, which appears twice, as two distinct incidents on one tag).

### 6.4 KPI Taxonomy Mapping (shared across all 4 sources)

| kpiCategory | Applies to | Example parameters |
|---|---|---|
| `reliability` | Equipment Performance, Incident DB | health-status transitions, MTBF, MTTR, PM compliance, failure mechanism frequency, pre-risk |
| `availability` | Equipment Performance, RCA & Downtime, Production `RUN_STATUS` | uptime %, downtime hours, offline hours |
| `throughput` | Production Data | `FEED`, `PLANT_RATE` |
| `risk_exposure` | Incident Database | `preRisk`, `riskScore`, `highestImpact`, potential loss |
| `cost_impact` | Equipment Performance, Incident DB, RCA & Downtime | actual / potential / total loss (k USD), production loss (ton) |
| `condition` | Production Data | `VIB`, `TEMP`, `DISP`, `AMP` (equipment-health signals) |

Changed from v0.2: the old `safety` category is replaced by `risk_exposure` because **the Incident Database is an equipment-related-risk register, not an HSE incident log** — it has no injury, environmental, or process-safety fields. Presenting it as "safety" would be misleading to judges who know the data. A new `condition` category separates equipment-health signals from `throughput`. Every ingested record maps to exactly one `kpiCategory`; Incident rows may additionally contribute to `cost_impact` aggregates via a secondary tag (`secondaryKpi`).

### 6.5 Data-Quality Findings (surface these in `/data-sources`; they are a feature for KQ1, not a bug to hide)

| # | Finding | Where | Scale | Handling |
|---|---|---|---|---|
| DQ-1 | `AR No.` missing | Incident DB | **226 / 380** (59%) | Flag `missing_ar_no`; these incidents have no linked RCA report, so AI can only use pattern-level context |
| DQ-2 | `AR No.` duplicated across unrelated incidents | Incident DB | 2 pairs (4 rows) — e.g. `AR-2026-OP2-0171` on both BL-2287A and HE-4689A | Flag `duplicate_ar_no`; never use as unique key |
| DQ-3 | `MTO No.` duplicated | Incident DB | 1 pair — `MTO-2026-OPP-0096` on both BL-5702 (focus case) and KO-6912A | Flag `duplicate_mto_no` |
| DQ-4 | `F Mechanism` truncated/mis-split on the 5 focus rows | Incident DB serial 1–5 | 5 rows hold `Mechanical`, `High`, `Motor`, `High`, `High` instead of a full mechanism | Flag `truncated_f_mechanism`; for AI context use `riskCaseTitle` + `component` instead |
| DQ-5 | `RCA Due Date` missing | Incident DB | 197 / 380 | Overdue logic only evaluated when a due date exists |
| DQ-6 | **Unit mismatch** — KO-3201 vibration declared `MM/S`, span 20, typical 10; actual values 25–73 and the RCA deck quotes the baseline as **25–30 micron** | Production Data | 1 tag | Store `engUnitsObserved = micron`, keep note; **never** compare against a 20 mm/s span |
| DQ-7 | Template tags irrelevant to the asset: HE-3301 (a static exchanger) has `VIB` and `AMP` tags; real fouling indicators (tube-side dP, duty) are **not** in the PI set | Production Data | HE-3301 | Primary precursor signal for HE-3301 is `FEED` (it declines as fouling grows); document that dP/duty exist only in the RCA narrative |
| DQ-8 | Causal parameters are **not in the PI tags** for several cases: seal-flush flow and NPSH (PU-2101B), lube-oil water ppm (KO-3201), alignment (BL-5702) | Production vs RCA | 3 cases | AI must combine weak PI precursors with RCA knowledge / similar cases — this is the honest reason a unified RCA corpus matters |
| DQ-9 | `RUN_STATUS=OFF` hours differ slightly from reported downtime (PU 18 vs 18.5 h; HE 13 vs 12 h) | Production vs Incident/RCA | 2 of 5 | Hourly sampling granularity; treat as consistent within ±1 h |
| DQ-10 | Plant naming differs between sources ("Resin Plant (ARP)" vs "Aurora Resin Plant") | Equipment vs RCA | all | Resolved by `plantCode` (6.3) |
| DQ-11 | Status/enum mismatch — Incident DB has 6 statuses; original PRD enum had 3 | Incident DB | all | Mapped to `open / in_progress / monitoring / closed / cancelled` |
| DQ-12 | CAPA statuses are a **snapshot of unknown date** — 18 of 19 non-closed CAPA items have plan dates earlier than 2026-10-03 | RCA decks | 18 / 20 items | Show as "overdue per source snapshot"; label the snapshot caveat in the UI tooltip |

Reconciliation results (a positive KQ1 proof point — show it on the admin page): for all 5 focus assets, **downtime hours, actual loss, AR number, plant code, and event date agree across Incident DB ↔ RCA deck** exactly, and Equipment Performance's loss/downtime match them too. Production `OFF` hours match within ±1 h.

### 6.6 Measured Early-Warning Evidence (drives FR-3.1 and the demo narrative)

Rule tested: baseline = first 120 hourly readings of the file; flag when **3 consecutive hours** deviate beyond **±3σ** on the primary signal. No tuning per asset.

| Asset | Primary signal | Baseline (mean ± σ) | First flag | Trip (`OFF`) | **Lead time** |
|---|---|---|---|---|---|
| PU-2101B | Vibration | 3.78 ± 0.25 mm/s | 2026-03-10 21:00 | 2026-03-12 03:00 | **30 h** |
| KO-3201 | Vibration | 28.80 ± 0.25 µm | 2026-04-27 10:00 | 2026-04-29 07:00 | **45 h** |
| PM-4405B | Bearing/process temp | 65.11 ± 1.38 °C | 2026-07-07 05:00 | 2026-07-08 14:00 | **33 h** |
| HE-3301 | Feed rate (decline) | 29.97 ± 0.60 T/H | 2026-05-20 06:00 | 2026-05-21 09:00 | **27 h** |
| BL-5702 | Vibration | 3.76 ± 0.25 mm/s | 2026-06-15 14:00 | 2026-06-17 05:00 | **39 h** |

Observations to use in the pitch:
- Lead time is **27–45 hours** for all 5, with only 1–4 stray single-hour exceedances beforehand on the full file — low false-alarm noise for a prototype.
- **Fixed limits would have missed PU-2101B**: peak hourly vibration before the trip was 6.27 mm/s vs 7.0 alarm. Baseline-deviation detection is what makes the early warning possible.
- Three different physical signatures appear (vibration rise, bearing-temperature ramp, throughput decline) — the detector must therefore be **signal-agnostic**, with the primary signal chosen per asset from data (largest sustained z-score), not hardcoded.
- Equipment Performance's weekly data provides the *slow* warning (weeks); Production Data provides the *fast* one (≈1–2 days); the RCA corpus provides the *why*. That layering is the product story.

### 6.7 Function Coverage Gap & Proxy Mapping

The brief names 7 functions. The 4 case datasets carry owner codes for only a subset:

| Function | Source evidence in files | Coverage |
|---|---|---|
| Production | `OPS-01` PIC code (29 incidents); Production Data (feed, plant rate, run status) | ✅ Direct |
| Maintenance | Disciplines `ROT`/`STA`/`ELE`/`INS`; PIC prefixes `ROT-`, `STA-`, `ELE-`, `INS-`; PM schedules in RCA decks | ✅ Direct |
| Reliability | PIC prefix `REL-` (88 incidents — the largest owner group); equipment condition & CAPA | ✅ Direct |
| Energy | Motor ampere (`*_AMP`) is the only energy-related tag | ⚠️ Proxy only |
| HSE | `preRisk` I–IV and `riskScore` exist, but no injury/environment/process-safety data | ⚠️ Proxy only (risk exposure) |
| Warehouse | none (spare parts / stock not in files) | ❌ No data |
| Procurement | none (PO / lead-time not in files) | ❌ No data |

**[ASSUMPTION — decision for the team]** Do **not** fabricate data for the missing functions. FR-2.1 is amended: all 7 function tiles render, but each shows an explicit **coverage badge** — *Connected*, *Proxy (explained in tooltip)*, or *Data source not in scope of this dataset*. This turns the gap into a KQ1 point ("here is what is governed today, and what the next integration waves would add"). Owner-code → function mapping:

| PIC prefix | Function |
|---|---|
| `REL-` | Reliability |
| `ROT-`, `STA-`, `ELE-`, `INS-` | Maintenance |
| `OPS-` | Production |

---

## 7. Module B — Single Pane of Glass Dashboard (KQ2)

### 7.1 Functional Requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-2.1 | Executive Dashboard shows a cross-functional KPI summary (all 7 functions) on one screen | 7 tiles render simultaneously, no scroll-per-function; each carries a coverage badge (Section 6.7) |
| FR-2.2 | Alerts are ranked by a computed priority score, not just recency | Priority formula below |
| FR-2.3 | Dashboard supports role-based view switching | Switching role changes which widgets/functions are emphasized without a full reload |
| FR-2.4 | Any KPI widget can be drilled into to see the underlying unified records | Click-through from widget → filtered table of source records, with `dataQualityFlags` visible |
| FR-2.5 | Equipment detail page overlays the **three time scales** for one asset | Weekly condition (26 wk) + hourly PI signal (30 d) with alarm/trip reference lines and the detector's first-flag marker + RCA/CAPA panel, all on one screen |
| FR-2.6 | Plant-wide portfolio widgets use the full Incident DB | Loss by plant, by failure mechanism, by discipline, active-vs-closed, RCA-overdue count (183) all computed from the DB |

**Alert priority formula [ASSUMPTION — simple, explainable, adjustable]:**
```
priority_score = (severity_weight * 0.5)
              + (normalized_cost_impact * 0.3)
              + (risk_flag ? 0.2 : 0)

severity_weight: critical=1.0, high=0.7, medium=0.4, low=0.2
normalized_cost_impact: totalLossKUSD scaled 0-1 against the dataset max (2,059.2 = KO-3201)
risk_flag: true if preRisk in ('I','II') OR equipmentClass == 'A'
```
Severity for incident-derived alerts is derived from `preRisk` — `I`,`II` → critical; `III` → high; `IV` → medium **[ASSUMPTION]**. For detector-derived alerts, severity comes from the deviation size (≥ 6σ critical, ≥ 4σ high, else medium) **[ASSUMPTION]**. Alerts sort descending; score ≥ 0.7 is flagged "Critical — review now."

### 7.2 Screens

| Screen | Route | Contents |
|---|---|---|
| Executive Dashboard | `/dashboard` | 7 function tiles w/ coverage badges, top 5 prioritized alerts, plant-wide loss trend (by `monthYear`), heatmap (plant × kpiCategory), active-RCA / overdue counters |
| Function Dashboard | `/dashboard/[function]` | Same pattern, filtered to one function (owner-prefix mapping, 6.7) |
| Equipment Detail | `/equipment/[tag]` | Three-scale overlay (FR-2.5), linked incidents, RCA report, CAPA list |
| Alert Feed | `/alerts` | Sortable/filterable list: priority score, status, age, source (`healthStatus` / `detector` / `incident`) |
| Alert / Root Cause Detail | `/alerts/[id]` | Raw signal, AI probable root causes + confidence + evidence, similar past cases, recommended action |
| Action Tracker | `/actions` | Kanban/table: Open / In Progress / Done, owner, due date, overdue flag; seeded from real CAPA |
| Data Sources (Admin) | `/data-sources` | Per-source status, last refresh, record count, DQ flag counts, join-success matrix |
| AI Evaluation (dev) | `/dev/ai-eval` | FR-3.6 leave-one-out results |

### 7.3 UI Design Tokens (reuse CALIBER/Chandra Asri brand)

```css
--color-navy: #24417B;      /* primary */
--color-navy-deep: #162A52; /* dark bg / depth */
--color-cyan: #4DC1DA;      /* secondary / links / highlights */
--color-cyan-deep: #1F8FAE; /* text-on-white accents */
--color-lime: #8CC63E;      /* positive / success accent */
--color-lime-deep: #3AB54A;
--color-bg: #F5F9FC;        /* app background */
--color-card-border: #E1E9F2;
--font-heading: "Cambria", serif;
--font-body: "Calibri", "Inter", sans-serif;
```
Severity colors: critical = `#E4572E`, high = `#F2994A`, medium = `#F2C94C`, low = `#8CC63E`.

---

## 8. Module C — AI Root Cause Analysis & Recommendations (KQ3)

### 8.1 Functional Requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| FR-3.1 | System detects anomalies across sources | (a) **Equipment Performance:** Alert created when weekly `healthStatus` transitions to `ALARM` or `TRIP`. (b) **Production Data:** baseline-deviation detector — baseline = first 120 h, flag on 3 consecutive hours beyond ±3σ on the asset's primary signal (Section 6.6); must reproduce the 5 lead times in 6.6 (±2 h). (c) **Incident Database:** Alert for incidents with `statusNormalized ∈ {open, in_progress}` and `rcaOverdue = true` |
| FR-3.2 | For each alert, AI returns ranked probable root causes with confidence and supporting evidence | 1–4 candidate causes, each with `confidence` (0–1) and `evidence[]` referencing specific unified records (by `incidentId`, `rcaId`, reading timestamp) |
| FR-3.3 | AI translates the top root cause into a recommended action with suggested owner and due date | Action has `title`, `description`, `suggestedOwnerFunction`, `suggestedOwnerCode` (e.g. `REL-05`), `suggestedDueDate`, `priority` |
| FR-3.4 | User can accept, edit, or reassign the AI-suggested action before it becomes a tracked task | Action Tracker entry stores `createdBy: 'ai' | 'user-edited' | 'imported-capa'` |
| FR-3.5 | If no LLM API key is configured, deterministic rule-based fallback is used | Fallback produces plausible, deterministic output from `/lib/ai/fallback-rules.json` |
| FR-3.6 | **Leakage-safe self-evaluation** of AI root-cause accuracy | For each of the 5 focus cases, run in *leave-one-out* mode (below); compare the AI's top-ranked cause to `rca.verifiedRootCause` using semantic match; display match / partial / no-match in `/dev/ai-eval` |
| FR-3.7 | **Similar-case retrieval** feeds the LLM prompt | Context includes up to 3 prior RCA reports ranked by `equipmentType` + failure signature similarity, plus aggregate incident stats for the same `equipmentType` + `failureMechanism` |
| FR-3.8 | **CAPA import** | The 20 real CAPA items load into the Action Tracker with `createdBy: 'imported-capa'`, owner code, plan date, source status |

**Leave-one-out rule (critical for a credible demo):** the target case's own answer key must never reach the prompt. When evaluating case *N*, exclude from context: that case's `verifiedRootCause`, `fourP`, `fourMPlusOneE`, `capa`, `pmSchedule`, `historicalEvidence`, `chronology`, **and** its Equipment-Performance `dominantFailureMode`, and its Incident `riskCaseTitle` / `failureMechanism` (the title itself names the failure). Retrieval for similar cases may use the *other four* reports only. Note that the five cases cover five different mechanisms, so leave-one-out similar-case retrieval gives limited help by design — this is a *hard* test, and the results should be presented as such, not inflated.

### 8.2 AI Pipeline

```
1. Anomaly Detection  → flags a record / signal / transition as an Alert (FR-3.1)
2. Context Assembly   → gather related records across all 4 sources for the
                         same asset: ±7 d hourly PI window, last 8 weekly readings,
                         related incidents on same tag, similar RCA cases (FR-3.7)
3. LLM Call           → send structured context, request ranked root causes
                         + recommended action (schema 8.3)
4. Post-processing    → validate JSON, attach evidence links, map owner code → function
5. Human-in-the-loop  → user reviews, accepts/edits, action becomes tracked
```

### 8.3 LLM Request/Response Contract

**Request context** (assembled server-side, not a raw dump). Example for the PU-2101B detector alert, in leave-one-out mode:
```json
{
  "alert": { "id": "...", "equipmentTag": "PU-2101B", "plantCode": "ARP",
             "triggeredBy": "detector: PU2101B_VIB > baseline+3σ for 3h", "timestamp": "2026-03-10T21:00:00" },
  "equipment": {
    "equipmentType": "Centrifugal Pump", "equipmentClass": "B", "discipline": "ROT",
    "monitoredParameters": [ "...alarm/trip limits..." ],
    "recentConditionHistory": [ "...last 6-8 weekly readings + healthStatus..." ]
  },
  "hourlySignals": {
    "baseline": { "PU2101B_VIB": { "mean": 3.78, "std": 0.25 } },
    "last168h": [ "...hourly values for FEED/DISP/VIB/TEMP/AMP/PLANT_RATE..." ],
    "runStatus": "ON"
  },
  "relatedIncidents": [ "...other incidents on this tag / same equipmentType + failureMechanism stats..." ],
  "similarRcaCases": [ "...up to 3 prior RCA reports (verifiedRootCause + 4P/4M+1E NG items only)..." ]
}
```

**Required JSON response schema [ASSUMPTION — enforce via prompt + server-side validation; reject/retry on malformed output]:**
```json
{
  "rootCauses": [
    { "cause": "string, concise", "confidence": 0.0, "evidence": ["record id or short justification"] }
  ],
  "recommendedAction": {
    "title": "string",
    "description": "string",
    "suggestedOwnerFunction": "Production | Maintenance | Reliability | Warehouse | Procurement | Energy | HSE",
    "suggestedOwnerCode": "REL-05",
    "suggestedDueDate": "ISO 8601 date",
    "priority": "critical | high | medium | low"
  },
  "dataGaps": ["string — parameters that would confirm/refute the top cause but are not in the provided data"]
}
```
`dataGaps` is new in v0.3: because causal parameters are often absent from the PI set (DQ-8), the model should say what it *would need* (e.g., "seal-flush flow, suction pressure/NPSH") instead of overclaiming. This is honest and explainable.

### 8.4 Prompt Template (starting point)

```
System: You are a reliability and process-safety analyst for a petrochemical
plant. Given structured operational context, identify the most probable
root cause(s) of the flagged anomaly and recommend one prioritized,
owned follow-up action. Respond ONLY with JSON matching the schema below.
Be concise, specific, and ground every cause in the evidence provided —
never invent data not present in the context. If the available signals cannot
confirm a cause, lower the confidence and list what is missing in dataGaps.

Schema: <insert schema from 8.3>

User: <insert assembled context from 8.3>
```

### 8.5 Rule-Based Fallback (no API key)

`/lib/ai/fallback-rules.json`: lookup keyed by `equipmentTag` (exact) first, then by `equipmentType` + dominant signal pattern. The 5 exact rules use the **verified** content from the RCA decks:

| Trigger | Fallback root cause | Fallback action | Owner |
|---|---|---|---|
| `PU-2101B` | Premature mechanical seal failure from intermittent dry-running: suction cavitation + seal-flush flow below 6 L/min, no protection interlock | Install seal-flush flow switch with DCS alarm; add low-NPSH / loss-of-flush trip interlock | Reliability · `REL-05` |
| `KO-3201` | Journal-bearing babbitt distress from water ingress via leaking lube-oil cooler tube; no online water-in-oil monitoring | Repair/plug lube-oil cooler tube and retest; install online water-in-oil sensor; tighten vibration alert to 45 µm | Maintenance (Static) · `STA-02` + Reliability · `REL-05` |
| `PM-4405B` | Motor DE bearing failure from grease degradation — fixed 12-month re-lube interval, no bearing-temperature trending | Move to risk-based 4-monthly re-greasing; add bearing-temp trending/alert in CMMS | Reliability · `REL-02` |
| `HE-3301` | Tube-side coke/polymer fouling from high feed heavy-ends; no dP-based cleaning trigger | Add dP-based cleaning trigger and alarm; tighten feed heavy-ends control & filtration | Maintenance (Static) · `STA-02` |
| `BL-5702` | Coupling misalignment with soft-foot and over-aged elastomer element; no alignment check in PM | Add 6-monthly laser alignment & soft-foot check to PM; track coupling-element life (12 mo) | Maintenance (Rotating) · `ROT-01` |

Generic rules (from the signatures in 6.6 and the 4P patterns), used for any unmapped asset:

| Pattern | Fallback root cause | Fallback action | Owner |
|---|---|---|---|
| Vibration ↑ on rotating equipment, bearing temp normal | Developing misalignment or looseness (check 2X harmonic, soft-foot, coupling) | Laser alignment + soft-foot check within 72 h | Maintenance (Rotating) |
| Bearing/winding temperature ramps, vibration flat, motor-driven | Lubrication degradation (grease/oil) in motor bearing | Inspect grease condition, shorten re-lube interval, add temp trending | Reliability |
| Vibration ↑ with lube-oil system on machine | Oil contamination / bearing distress | Lube-oil sample (water, particles); inspect cooler integrity | Reliability |
| Throughput/duty ↓ on exchanger with dP ↑ | Fouling | Review cleaning trigger; schedule cleaning | Maintenance (Static) |
| Seal-flush / discharge pressure ↓ on pump | Seal dry-running or cavitation | Check flush plan, NPSH margin, feed-swing ramp rate | Reliability |

The table is stored as JSON — not hardcoded in UI code — and is extendable.

---

## 9. Seed / Mock Dataset Requirements

### 9.1 All four sources are real — load as-is

| File | Records | Notes |
|---|---|---|
| `equipment_performance.json` | 5 assets × 26 weeks | from v0.2 |
| `incidents.json` | 380 | Section 6.2.2; includes `dataQualityFlags`, `statusNormalized`, `rcaOverdue` |
| `production.json` | 5 assets × 720 h × 6 values + run status | Section 6.2.3; includes `derived` detector baseline and lead time |
| `rca_downtime.json` | 5 reports | Section 6.2.4 |

**Do not generate synthetic records.** The earlier plan to fabricate Incident / Production / RCA placeholders (v0.2 §9.2) is withdrawn. The converter `scripts/convert_incident_production_rca.py` reproduces the three new files from the original zip (`python convert_incident_production_rca.py <extracted_zip_dir> mock-data`).

### 9.2 Demo story coherence

The same five failures run through all sources, giving one consistent story per asset:

```
weekly drift in Equipment Performance
  → hourly deviation flagged 27–45 h before the trip (Production Data)
  → trip / OFF window and loss recorded (Incident DB, serial 1–5)
  → verified root cause + CAPA (RCA deck)
```
The other 375 incidents provide plant-wide portfolio context (loss by plant/mechanism, active backlog, overdue RCAs) so the executive view is not just five assets.

**Honest limitation to state in the demo:** the full multi-source chain exists for 5 assets; for the other 375 incidents only the Incident Database record exists. The platform should show that distinction (a "linked sources: 4/4 vs 1/4" indicator).

### 9.3 Action Tracker seed — real CAPA

Load the 20 CAPA items (4 per case × 5; corrective + pro-active) as initial tracked actions: `title` = action text, `ownerCode` = `pic`, `ownerFunction` via the mapping in 6.7, `dueDate` = `planDate`, `status` from source, `createdBy = 'imported-capa'`, `rcaId` link, `rootCauseRef` link. Result: 20 actions, 1 closed, 19 not closed, 18 past their plan date as of 2026-10-03 (DQ-12 caveat applies). This gives the tracker realistic overdue content without inventing anything, and lets a reviewer demo closing an item or reassigning an owner.

### 9.4 Suggested Prisma entities

| Entity | Source | Key |
|---|---|---|
| `Plant` | lookup (6.3) | `code` |
| `Equipment` | Equipment Performance + Incident tags | `tag` |
| `ConditionReading` | Equipment Performance | `(tag, week)` |
| `Incident` | Incident Database | `serialNo` |
| `ProductionInstrument` | Production `PI Tag` sheet | `instrumentTag` |
| `ProductionReading` | Production time series (long format) | `(tag, timestamp, parameter)` |
| `RcaReport` | RCA decks | `rcaId` |
| `RcaVerification` | RCA 4P / 4M+1E rows | `(rcaId, id)` |
| `CapaAction` | RCA CAPA rows → also `Action` | `(rcaId, ref, kind)` |
| `PmSchedule` | RCA decks | `(rcaId, pmNo)` |
| `Alert` | detector / transition / incident rules | `id` |
| `Action` | AI-suggested, user-created, imported CAPA | `id` |
| `DataQualityIssue` | flags from 6.5 | `(entity, recordId, code)` |

---

## 10. API Specification (prototype)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/dashboard?function=&role=` | Aggregated KPI widgets |
| GET | `/api/equipment/:tag` | Unified view: weekly + hourly series, incidents, RCA, CAPA |
| GET | `/api/alerts?status=&minPriority=&source=` | List alerts, sorted by priority |
| GET | `/api/alerts/:id` | Alert detail incl. related unified records |
| POST | `/api/ai/root-cause` | Trigger AI analysis (body: `{ alertId, mode?: 'live' | 'leave-one-out' }`) → schema in 8.3 |
| GET | `/api/ai/eval` | FR-3.6 results |
| GET | `/api/actions?status=&owner=&overdue=` | List tracked actions |
| POST | `/api/actions` | Create/accept an action (from AI suggestion or manual) |
| PATCH | `/api/actions/:id` | Update status/owner/due date |
| GET | `/api/data-sources` | Status, counts, DQ flag totals, join-success matrix |

All responses: `application/json`. Errors: `{ "error": "message" }` with appropriate HTTP status.

---

## 11. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Dashboard initial load < 2 s on the seeded dataset (≈ 380 incidents + ≈ 20k hourly values); equipment detail overlay < 1 s |
| Reliability | Runs and demos fully with **no internet / no LLM API key** via fallback (FR-3.5) |
| Responsiveness | Desktop primary, tablet usable; mobile not required |
| Accessibility | Sufficient contrast on severity colors; don't rely on color alone (icon/label too) |
| Explainability | Every AI output shows its evidence/confidence/dataGaps — no black-box numbers |
| Observability | Console/server logging of AI calls (prompt, response, latency) |
| Data honesty | Never invent plant names, units, or function data absent from the files (Sections 6.3, 6.7); data-quality issues are shown, not hidden |

---

## 12. Success Metrics (for the business case narrative, not literal prototype telemetry)

| Metric | Target narrative | Evidence available from the case data |
|---|---|---|
| Unplanned downtime reduction | `[–XX%]` | Incident DB: 2,261 h across 380 incidents; the 5 focus cases total 84.5 h |
| Early-warning lead time | **27–45 h** before trip (measured, Section 6.6) | Production Data detector |
| Loss exposure addressed | `[XX%]` | $67.2M total loss; $44.3M tied to still-active incidents; $2.06M for the largest (KO-3201) |
| Root-cause resolution speed | `[+XX%]` faster | 183 active incidents have a passed RCA due date |
| CAPA follow-through | `[XX%]` on-time | 18 of 19 open CAPA items past plan date in the source snapshot |
| Manual reporting time saved | `[XX hrs]` / month | — |
| Cross-functional decision speed | `[XX%]` faster | — |

Keep these consistent with the pitch deck's "Business Impact" slide. Fill the `[XX]` values from team estimates; the right-hand column gives defensible anchors. Avoid claiming dollar savings that the data cannot support.

---

## 13. Build Plan / Milestones

| Phase | Deliverable | Depends on |
|---|---|---|
| 0 — Setup | Repo scaffold (4.2), Prisma schema (9.4), seed script loads all 4 JSON files | — |
| 1 — Data Foundation | FR-1.1 – FR-1.7; normalization (6.3); `/data-sources` with DQ + join matrix | Phase 0 |
| 2 — Dashboard | FR-2.1 – FR-2.6; Executive, Function, Equipment Detail screens | Phase 1 |
| 3 — AI Engine | FR-3.1 – FR-3.8; detector, retrieval, LLM + fallback, leave-one-out eval | Phase 1, 2 |
| 4 — Action Tracker & polish | Action CRUD, CAPA import, role switcher, brand polish (7.3) | Phase 2, 3 |
| 5 — Demo readiness | Scripted walkthrough using PU-2101B → KO-3201 | All above |

---

## 14. Definition of Done (prototype)

- [ ] All FR-1.x, FR-2.x, FR-3.x acceptance criteria pass
- [ ] `npm install && npm run dev` runs end-to-end with zero external config (LLM key optional, fallback works)
- [ ] Record counts match: 380 incidents, 5 × 720 hourly rows, 5 RCA reports, 20 CAPA actions, 5 × 26 weekly readings
- [ ] Detector reproduces the 5 lead times in 6.6 (±2 h)
- [ ] A reviewer can: open Executive Dashboard → see a prioritized critical alert → open it → see three-scale equipment view + AI root cause with evidence and data gaps → accept the recommended action → see it in Action Tracker → mark it done
- [ ] `/data-sources` shows the DQ findings and the cross-source join matrix
- [ ] Visual style matches brand tokens (7.3)
- [ ] Assumptions flagged **[ASSUMPTION]** have been reviewed and confirmed or updated by the team

---

## 15. Open Questions / Assumptions Log

| # | Assumption / decision | Why | Needs confirmation? |
|---|---|---|---|
| 1 | No real auth, role switcher only | Prototype speed | Confirm if judges expect login |
| 2 | Next.js + SQLite/Prisma single-app stack | Zero external infra | Confirm if team has a preferred stack |
| 3 | Claude API for AI layer, with rule-based fallback | Reliability offline | Confirm API budget/key availability |
| 4 | Static seed dataset, no live generator | Repeatable demo | None |
| 5 | Equipment Performance schema from the 5 real RCA workbooks | Real data | None — confirmed |
| 6 | ~~Incident / Production / RCA schemas inferred~~ → **now confirmed from the real zip** | Closed in v0.3 | **Resolved** |
| 7 | `safety` KPI replaced by `risk_exposure` (+ `condition`) | Incident DB is an equipment-risk register, not HSE | Team to confirm wording on slides |
| 8 | Missing functions (Warehouse, Procurement; weak Energy/HSE) shown with coverage badges, no fabricated data | Honesty + KQ1 narrative | **Yes — product decision**: acceptable to judges, or add clearly-labelled illustrative data? |
| 9 | Severity derived from `preRisk` (I/II critical, III high, IV medium) and detector sigma bands | Needs a mapping; not in source | Confirm with domain owner |
| 10 | Detector rule: 120 h baseline, 3 h persistence, ±3σ | Reproduces 27–45 h lead on all 5 assets with minimal tuning | Validate on more assets if available; with only 5 assets this is a **demonstration, not a validated model** — say so |
| 11 | CAPA statuses treated as a snapshot of unknown date | Decks carry no "as of" date | Ask organizers for snapshot date; until then label "per source snapshot" |
| 12 | Plant names for 8 of 12 codes unknown | Not in files | Leave as codes |
| 13 | Leave-one-out evaluation reports honest results, even if the match rate is low | Five different mechanisms limit similar-case help | Agree on how to present in the pitch |

---

## 16. Appendix — Glossary

- **Single Pane of Glass (SPoG):** one unified interface surfacing data from multiple previously-siloed systems.
- **Root cause confidence:** a 0–1 score for how strongly the evidence supports a candidate cause.
- **KPI taxonomy:** shared categorization (Section 6.4) letting metrics from different sources be compared and aggregated.
- **Priority score:** computed ranking (Section 7.1) used to sort alerts.
- **4P / 4M+1E:** the company's two RCA verification methods — *4P* checks process parameters against standard (OK/NG); *4M+1E* checks Man / Machine / Method / Material / Environment factors.
- **CAPA / PAA:** Corrective and Preventive Action / Pro-Active Action (the RCA report's action plan).
- **AR No.:** Abnormality Report number; **MTO No.:** the register number of the risk case.
- **PIC:** Person In Charge — an owner *code* (e.g. `REL-05`), not a name.
- **PI tag:** historian instrument tag (e.g. `PU2101BV.PV`) carrying hourly process values.
- **Plant codes:** ARP (Aurora Resin Plant), ZCU (Zeta Cracker Unit), NUP (Nova Utility Plant), OPP (Orion Polypropylene Plant); SMX, OP2, OP3, BRP, CRP, BDX, OPU, TKX (names not provided).
- **Lead time:** hours between the detector's first flag and the trip (`RUN_STATUS` turning `OFF`).
