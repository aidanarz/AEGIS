# Intelligence Manufacturing Platform — CALIBER 2026 Case 2

Working prototype for Chandra Asri's *Intelligence Manufacturing* case: one governed data foundation (KQ1), a single pane of glass for executives (KQ2), and AI root-cause analysis with owned, tracked follow-up actions (KQ3).

Built from the 4 real case datasets only — no synthetic records. `PRD_Intelligence_Manufacturing (1).md` is the source of truth.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No other setup. On first run `predev` creates the SQLite database and seeds it from `/mock-data`, printing a record-count check against the PRD. Requires Node 20+.

**Optional — live Claude analysis:** add `ANTHROPIC_API_KEY=...` to `.env` (model defaults to `claude-opus-5-5`, override with `ANTHROPIC_MODEL`). Without a key — or if the API is unreachable — the app uses the deterministic rule-based fallback and every screen still works.

| Script | Does |
|---|---|
| `npm run dev` / `npm run build && npm start` | Run (dev / production). Both seed an empty database automatically. |
| `npm run db:reset` | Drop and reload the database from `/mock-data` (use between demo rehearsals). |
| `npm run verify` | Automated Definition-of-Done checks (PRD §14). Add `-- --http http://localhost:3000` to also hit every route of a running app. |
| `npm run detect:validate` | Detector vs the 5 lead times in PRD §6.6. |
| `npm run typecheck` / `npm run lint` | Static checks. |

## What's where

| Screen | Route | Pillar |
|---|---|---|
| Executive dashboard | `/dashboard` | KQ2 — 7 function tiles with coverage badges, top-5 prioritized alerts, loss trend, plant × KPI heatmap, portfolio breakdowns |
| Function dashboards | `/dashboard/[function]` | KQ2 — filtered by owner-code prefix; Energy/HSE as labelled proxies; Warehouse/Procurement "not in scope" |
| Equipment detail | `/equipment/[tag]` | KQ2 — weekly condition (26 wk) + hourly PI (30 d) with alarm/trip lines and detector flag + RCA/CAPA, on one screen |
| Alert feed / detail | `/alerts`, `/alerts/[id]` | KQ3 — priority-ranked alerts; AI probable causes with confidence, evidence, data gaps; accept / edit / reassign |
| Action tracker | `/actions` | KQ3 — Open / In progress / Done, seeded with the 20 real CAPA items; create, edit, reassign, close, audit trail |
| Incident records | `/incidents` | KQ1/2 — drill-down target for every widget, with data-quality flags per row |
| Data sources | `/data-sources` | KQ1 — source status, DQ-1…DQ-13 findings (clickable), cross-source join matrix, KPI taxonomy, plant lookup |
| AI evaluation | `/dev/ai-eval` | KQ3 — leave-one-out accuracy with leakage audit |

The "View as" switcher in the header previews the app as each persona (PRD §3). It is not authentication.

## Architecture

Next.js 15 (App Router, TypeScript) · Tailwind + shadcn/ui · Recharts · Prisma 6 + SQLite · Anthropic SDK (server-side only).

```
mock-data/            4 real source files (copied unchanged from data/)
prisma/               schema.prisma, seed.ts (load + normalize + DQ + alerts + count checks)
lib/data/             normalization (§6.3), KPI taxonomy (§6.4), DQ engine (§6.5), dashboard & equipment queries
lib/detect/           baseline-deviation detector (§6.6) — signal-agnostic, primary signal chosen from data
lib/alerts/           alert generation (FR-3.1 a/b/c) and the §7.1 priority formula
lib/ai/               context assembly, Claude client, rule-based fallback (fallback-rules.json), similar cases, leave-one-out eval
lib/actions/          Action Tracker service (CRUD + audit trail)
app/                  pages and API routes (PRD §10)
scripts/              ensure-db, validate-detector, verify-dod
```

Key behaviours:

- **Detector** reproduces the 5 PRD lead times exactly (30 / 45 / 33 / 27 / 39 h): baseline = first 120 h (mean, sample σ), flag at the 3rd consecutive hour beyond ±3σ, primary signal = largest sustained |z|.
- **Alert priority** is exactly PRD §7.1: `0.5·severity + 0.3·cost + 0.2·risk`. Hover any score for its breakdown.
- **AI context** uses only data dated at or before the alert (no look-ahead). Leave-one-out mode also strips the case's own answer key and redacts any text quoting it. A leakage audit re-checks the context that was actually sent.
- **Data quality** issues are flagged and shown, never silently fixed.

## Honest limitations (also shown in the UI)

- The full 4-source chain exists for **5 assets** only; the other 374 equipment tags have Incident Database records only.
- **Only 5 labelled failures**, each a different mechanism. AI output is a hypothesis for engineers to verify, not a diagnosis. The fallback's generic rules were written from these same 5 cases, so its leave-one-out score is optimistic.
- **No Warehouse or Procurement data**; Energy (motor current) and HSE (risk register) are proxies only.
- **KO-3201 vibration** is declared mm/s but is microns — handled as microns (DQ-6).
- **CAPA statuses** are a snapshot of unknown date (DQ-12).
- **Deployment:** SQLite needs a writable filesystem. For a hosted demo (e.g. Vercel) swap the datasource for a hosted database; local `npm run dev` is the recommended demo setup.

See `docs/DEMO.md` for the scripted walkthrough and `docs/ASSUMPTIONS.md` for the decisions log.
