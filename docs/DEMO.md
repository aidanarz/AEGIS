# Demo walkthrough — CALIBER 2026 Case 2

**Primary path:** KO-3201 (the #1 critical alert) → PU-2101B (the "fixed limits would have missed it" story). About 8–10 minutes, then Q&A.

All numbers below come from the live app and the real case files. If something on screen differs, trust the screen.

---

## Before you present

1. `npm run db:reset` — clean database (removes actions created in rehearsal).
2. `npm run dev`, open `http://localhost:3000` in a browser at least 1440 px wide.
3. Header: **View as → Executive / Plant Manager**.
4. With an `ANTHROPIC_API_KEY` in `.env`, the AI panel calls Claude (10–40 s per analysis — run KO-3201 and PU-2101B once beforehand so results are cached). Without a key the rule-based fallback answers instantly. Both are legitimate; say which one is running (the badge on the AI panel shows it).
5. Optional safety net: `npm run verify` — all checks should pass.

---

## 1. KQ1 — one governed data foundation (≈1.5 min) · `/data-sources`

- **Four sources, one schema.** Point at the 4 cards: 130 weekly readings, 380 incidents, 21,600 hourly values, 5 RCA reports. Counts are live from the database. Click **Re-validate sources**: files are re-read, hashed and checked against what was loaded.
- **Data quality is shown, not hidden.** 13 findings, 851 flagged records. Click **DQ-6** — KO-3201 vibration is declared mm/s but the values are microns; we store the observed unit and never compare it with the declared span. Back, then **DQ-8** — causal parameters (seal-flush flow, lube-oil water, coupling offset, tube dP) exist only weekly, not in the hourly PI tags.
- **The same asset, joined across four systems.** Join matrix: all 5 focus assets link across all 4 sources, and AR number, plant, event date, downtime and loss **agree exactly** across them.
- **Honest coverage.** Function coverage: Production, Maintenance, Reliability connected; Energy and HSE are proxies; Warehouse and Procurement are not in this dataset — we show the gap instead of inventing data.

> Line: *"Every number in the next screens comes from this governed layer — and where the data is weak, the product says so."*

## 2. KQ2 — single pane of glass (≈1.5 min) · `/dashboard`

- **Headline:** 380 incidents, **$67.2M** total loss, **220** still active ($44.3M exposure), **183** RCAs past their due date.
- **Seven functions on one screen**, each with its coverage badge (hover a badge for why).
- **Alerts ranked by priority, not recency.** Top row: **KO-3201, score 1.00**. Hover the score: severity critical (0.5) + highest loss in the dataset (0.3) + pre-risk II / class A (0.2). One row per asset; "+3 more alerts on this asset".
- **Heatmap:** plant × KPI category. Hatched cells = no source data for that plant (throughput and condition exist only where a focus asset is). Click any cell → the underlying records with their data-quality flags.
- **Role switch:** change *View as* to **Control Room Operator** — the alert list moves to the top and is highlighted, no reload. Switch back to Executive.

## 3. KQ3 — from early warning to an owned action: KO-3201 (≈3 min)

1. On the top-alert row, click the tag **KO-3201** → **equipment detail**.
   - Timeline strip: *weekly ALARM on 11 Feb → detector flag 27 Apr 10:00 → trip 29 Apr 07:00 → RCA reported*.
   - **① Weekly (slow warning):** radial vibration and **lube-oil water content** climb for weeks; ALARM from week 10.
   - **② Hourly (fast warning):** detector flags KO3201_VIB **45 hours before the trip**. The orange note is DQ-6 (microns). Alarm 45 / trip 75 lines come from the matching weekly parameter.
   - **③ RCA & CAPA — the why:** verified root cause (water ingress via a leaking lube-oil cooler), 4P / 4M+1E checks, CAPA with owners.
2. In *Alerts on KO-3201*, click **KO3201_VIB deviating above baseline** → **alert detail**.
   - Left: the raw signal. Right: **AI probable root causes**, each with **confidence** and **evidence** that links to the exact records (✓ = cites a record in the context).
   - **Data gaps:** lube-oil water content at hourly resolution, cooler integrity — what would confirm the cause but is not in the data.
   - Open **Context used**: only data up to the alert time (27 Apr 10:00) is used.
3. *(Credibility moment)* Click **Leave-one-out (eval)** → **Re-run analysis**. The case's own RCA is removed from the context. Without its answer key the rule-based fallback ranks *misalignment* first and *oil contamination / bearing distress* second (with Claude configured, show whatever it returns — it is not scripted). Say it plainly: *"Five labelled cases, five different mechanisms — this is a hard test and we show the honest result."* Switch back to **Live analysis**.
4. **Recommended action** (owner STA-02, due date, priority). Optionally click **Edit / reassign** to show it can be changed (it would then be recorded as *user-edited*). Click **Accept recommended action** → "Added to the Action Tracker" → **Open tracker**.
5. **Action Tracker:** the new card carries an **AI** badge. Click **In progress**, then **Mark done**. Click the **history** icon: created → status changes, each with the acting role. The alert is now resolved. The other cards are the **20 real CAPA items** from the RCA decks; "overdue per source snapshot" (hover) is the DQ-12 caveat.

## 4. Why AI beats fixed limits: PU-2101B (≈1.5 min)

1. **Alerts** → filter **Detector** → **PU2101B_VIB deviating above baseline** (score 0.54 — *high*, not critical: class B, pre-risk III, $294k loss. The formula is applied as specified; it is not tuned to the demo.)
2. On the hourly chart: vibration peaks at **6.27 mm/s — below the 7.0 mm/s alarm**. A fixed-limit alarm never fires. The baseline-deviation detector flags it **30 hours before the trip**.
3. AI panel: dry-running / cavitation of the mechanical seal; **data gaps:** seal-flush flow at hourly resolution and suction pressure / NPSH — the causal parameters are not in the PI tags (DQ-8). This is exactly why a unified RCA corpus matters.

## 5. Honest evaluation (≈30 s) · `/dev/ai-eval`

- Leave-one-out on all 5 cases. Rule-based fallback: **3/5 correct at top-1, 4/5 within the top 3** — and the page says why that is optimistic (rules derived from the same cases).
- **Leakage audit: passed 5/5** — no stripped answer-key text reached the model.
- With an API key: **Run LLM evaluation** adds Claude's results, judged by a separate Claude call.

## Close (≈30 s)

*"One governed foundation over four fragmented sources; one screen that ranks what matters; and an AI layer that explains itself — evidence, confidence, data gaps — and turns insight into an owned, tracked action. And where the data is thin, it tells you."*

---

## Backup facts for Q&A

| Question | Answer |
|---|---|
| Early-warning lead time? | 27–45 h before trip on all 5 assets (30 / 45 / 33 / 27 / 39), measured, reproduced exactly. 1–4 stray single-hour exceedances per file. |
| How is the primary signal chosen? | From data: the tag with the largest sustained 3-hour deviation. Vibration for 3 assets, bearing temperature for PM-4405B, feed-rate decline for HE-3301. Nothing hard-coded per equipment type. |
| Why isn't PU-2101B "critical"? | §7.1 formula, unchanged: class B, pre-risk III, $294k loss → 0.54. KO-3201 is class A, pre-risk II, $2.06M → 1.00. |
| What if the LLM is down? | Deterministic rule-based fallback (PRD §8.5), same output contract. The demo runs fully offline. |
| How do you stop the AI cheating in the eval? | Leave-one-out strips the case's RCA, failure mode, risk-case title, mechanism and component; only data up to the alert is used; an automated audit checks the final context. |
| Data quality? | 13 findings, 851 flagged records, all visible in `/data-sources` and per record. Computed flags agree 1:1 with the flags already in the source file. |
| What's missing? | Warehouse and Procurement data; true energy and HSE data; more labelled failures to validate the AI. Shown as the next integration waves. |
| Plant names? | Only 4 of 12 plants are named in the files; the other 8 are shown as codes — nothing invented. |

## Reset after the demo

`npm run db:reset`
