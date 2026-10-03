# Assumptions & decisions log

PRD §14 requires every **[ASSUMPTION]** to be reviewed and confirmed or updated by the team. This log lists each one, what the prototype does, and its sign-off status.

**Status key:** **Confirmed** = approved by the team lead during the build · **Default kept** = PRD default implemented unchanged, still needs a team decision · **Added** = a decision the PRD did not cover, made during the build and flagged at the time.

## PRD assumptions (§15 and inline)

| # | Assumption | Implemented as | Status |
|---|---|---|---|
| 1 | No real auth; role switcher only (§3) | "View as" dropdown with 5 personas (+ function / owner code). Writes record the acting persona in the audit trail. | Default kept — confirm judges don't expect a login |
| 2 | Next.js + SQLite/Prisma single app (§4.1) | Next.js 15.5, Prisma 6.19, SQLite | Confirmed |
| 3 | Claude API for AI, rule-based fallback | `claude-opus-5-5` (current default; `ANTHROPIC_MODEL` overrides), server-side refusal fallback enabled; full offline fallback | Default kept — confirm API budget / key for the live demo |
| 4 | Static seed dataset | `/mock-data` copied unchanged from `/data`; `npm run db:reset` reloads | Confirmed |
| 7 | `safety` KPI → `risk_exposure` (+ `condition`) | As specified; Incident primary KPI kept as the file's `cost_impact`, secondary `risk_exposure` | Default kept — confirm slide wording |
| 8 | Missing functions shown with coverage badges, no fabricated data | Connected / Proxy / "Data source not in scope of this dataset" | Default kept — product decision for the team |
| 9 | Severity from pre-risk (I/II critical, III high, IV medium); detector sigma bands (≥6σ critical, ≥4σ high) | As specified | Default kept — confirm with domain owner |
| 10 | Detector: 120 h baseline, 3 h persistence, ±3σ | As specified; reproduces all 5 lead times exactly. Presented as a demonstration, not a validated model. | Confirmed |
| 11 | CAPA statuses are a snapshot of unknown date | "Overdue per source snapshot" with DQ-12 tooltip | Default kept — ask organizers for the snapshot date |
| 12 | 8 of 12 plant names unknown | Shown as codes only | Confirmed |
| 13 | Leave-one-out results reported honestly, even if low | `/dev/ai-eval` with disclosures and leakage audit | Confirmed — agree how to present in the pitch |
| §4.2 | Repository structure | As specified (`/mock-data`, `/lib/ai`, `/lib/detect`, `/lib/data`) | Confirmed |
| §6.2.3 | Long-format `ProductionReading` + `RunStatus` table | As specified | Confirmed |
| §7.1 | Priority formula weights 0.5 / 0.3 / 0.2, review-now at ≥ 0.7 | Exactly as specified; not tuned | Confirmed — demo leads with KO-3201, then PU-2101B |
| §8.3 | JSON response schema, server-side validation, reject + retry | Structured outputs + zod validation, up to 3 attempts with error feedback | Confirmed |

## Decisions added during the build

| Decision | Why | Status |
|---|---|---|
| Detector severity escalates hourly to the peak sustained deviation reached before the trip | At first flag every deviation is barely > 3σ | Confirmed (decision B) |
| Detector / weekly alert cost term = realised loss of the linked event, labelled "retrospective" | Loss is only known after the trip; the formula needs a cost | Confirmed (decision B) |
| Weekly health severity: ALARM → high, TRIP → critical; recovery to NORMAL is not an alert | PRD gives no mapping | Confirmed (decision D) |
| AI context time cutoff: the asset's own records only up to the alert time (both modes) | Prevents look-ahead | Confirmed (decision C) |
| Leave-one-out also strips the incident `component` (eval mode only) and redacts free text quoting stripped values | `component` ("Coupling", "Tube Bundle") nearly names the answer | Confirmed (decision C) |
| Live mode hides Equipment-Performance `dominantFailureMode` when the failure date is after the alert | Same look-ahead principle as the time cutoff | Added — flagged in Phase 3 |
| Similar-case retrieval treats the 5 RCA reports as a knowledge base (not time-cut); the target's own report is always excluded | Strict "earlier reports only" leaves the earliest case with none | Added — flagged in Phase 3 |
| Top-5 dashboard alerts = one row per asset (+N more) | Strict ranking fills 4 of 5 rows with KO-3201 | Added — flagged in Phase 2 |
| Heatmap cell metrics (incidents, downtime h, production loss t, pre-risk I–III count, total loss, weekly ALARM/TRIP) | PRD names categories, not measures; risk scores are too skewed to sum | Added — flagged in Phase 2 |
| Weekly alarm/trip limits are drawn on an hourly signal only when it is plausibly the same measurement | HE-3301 weekly "Cold Outlet Temp" (~120 °C) ≠ hourly TEMP (~65 °C) | Added — flagged in Phase 2 |
| DQ-13 `duplicate_tag_number` (CV-5846 in two plants) | Flag present in the source file, not in PRD §6.5 | Added — flagged in Phase 1 |
| `createdBy` adds `user` for manually created actions | FR-3.4 lists only ai / user-edited / imported-capa | Added — flagged in Phase 0 |
| Fallback rules: incident-mechanism matching + a default "complete the RCA" rule | Otherwise the 375 incident-only assets get no suggestion | Added — flagged in Phase 3 |
| Imported CAPA items can be closed but not deleted | They are real source records | Added — Phase 4 |
| Extra models: `ProductionDataset`, `AiAnalysis`, `IngestRun`, `ActionEvent` | Validation reference, AI audit/cache, "last refresh", action audit trail | Added — flagged per phase |

## Still open for the team

1. Login expectation (assumption 1).
2. Live-demo API key and budget (assumption 3).
3. Slide wording for `risk_exposure` vs safety (assumption 7).
4. Accept "no fabricated data" coverage badges with judges (assumption 8).
5. Domain-owner sign-off on the severity mappings (assumption 9).
6. CAPA snapshot date from organizers (assumption 11).
7. How to present the leave-one-out results in the pitch (assumption 13).
