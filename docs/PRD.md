# RELIEF-OS — Product Requirements Document (PRD)

**Product:** RELIEF-OS — AI-Powered Disaster Response & Resource Intelligence Platform
**Document type:** PRD for the web application (MVP / hackathon build, with roadmap)
**Version:** 1.0
**Status:** Draft for build

> **One-line pitch:** RELIEF-OS doesn't just show where the disaster is. It decides what should happen next.

---

## 1. Overview

### 1.1 Summary
RELIEF-OS is a web-based **Disaster Response Decision Engine**. It ingests fragmented emergency information (citizen reports, weather, GIS, authority data), turns it into structured intelligence, and produces **prioritized, explainable response plans**: which zone needs help first, what resources, how much, from which relief center, and by which route. A human officer reviews and approves every plan before execution.

### 1.2 Positioning
- It is **not** a monitoring dashboard or a disaster chatbot.
- It is a **decision-support system**: data in, ranked and justified actions out.
- Core flow: *Information Overload → AI Understanding → Priority Detection → Resource Calculation → Resource Allocation → Route Optimization → Explainable Decision → Human Approval → Response.*

### 1.3 Problem Statement
After a flood, cyclone, landslide, earthquake, fire, or extreme weather event, authorities must answer at once:
- Which areas are worst affected, and how many people are stranded?
- Who should get help first?
- Which shelters have capacity?
- Where are food, water, or medicine shortages?
- Where should limited resources go, and by which usable route?
- What happens when a major route is blocked?

Information is spread across citizen reports, government data, weather data, GIS, shelter data, and inventories, and is combined manually. **There is a lot of information, but turning it into an actionable decision takes time, and in a disaster that delay is critical.**

---

## 2. Goals and Non-Goals

### 2.1 Goals
1. Convert raw, unstructured reports into structured, zone-level situation data automatically.
2. Rank affected zones with a transparent 0–100 **Relief Priority Score**.
3. Estimate resource demand per zone (food, water, medicine, boats, medical teams).
4. Allocate limited resources across relief centers and zones, flagging shortages honestly.
5. Recommend disaster-aware routes (not just shortest distance).
6. Recommend suitable shelters based on live capacity.
7. Let officers run **What-If simulations** when constraints change.
8. Keep a **human in the loop**: Approve / Modify / Reject before execution.
9. Make every recommendation **explainable**.

### 2.2 Non-Goals (explicitly out of MVP)
Drone integration, satellite AI built from scratch, IoT sensors, live integration with government systems, dozens of external APIs, a separate mobile app, blockchain, complex computer vision, fully autonomous rescue operations. These remain future scope.

### 2.3 Success Metrics
| Metric | Target (MVP demo) |
|---|---|
| Time from report ingestion to a generated response plan | < 10 seconds on the demo dataset |
| Reports correctly categorized (type, need, severity) on labelled sample set | ≥ 85% |
| Recommendation includes score breakdown + plain-language reason | 100% of plans |
| Route recalculation after a blocked road | < 3 seconds |
| What-If simulation result after a constraint change | < 3 seconds |
| Demo flows complete end to end without error | 100% across the 3-minute script |

---

## 3. Users and Personas

| Persona | Role | Needs |
|---|---|---|
| **District Officer (primary)** | District administration / emergency operations center | One screen to see priorities, approve plans, handle changes fast |
| **Relief Coordinator** | NGO / humanitarian organization | See shortages, available stock, where to send supplies |
| **Field Team Lead** | Rescue, medical, volunteer teams | Clear tasking: where, what, which route |
| **Citizen Reporter** | Affected resident | Submit a report simply (text, optional location) |
| **Admin** | System operator | Manage users, resources, centers, shelters, scoring weights |

### Roles and permissions
- **Admin:** full access, edit scoring weights, manage data.
- **Officer:** view all, generate plans, approve/modify/reject, run simulations.
- **Coordinator / Team Lead:** view plans and routes relevant to them; update resource and team status.
- **Citizen (public form):** submit reports only; no dashboard access.

---

## 4. Scope

### 4.1 MVP "Core 7" + What-If
1. Disaster creation
2. Report ingestion
3. Affected zone generation
4. Priority scoring
5. Resource demand calculation
6. Resource allocation
7. Route recommendation
8. ⭐ What-If simulation

Supported in MVP: shelter recommendation, human approval workflow, command-center map, KPIs, AI explanation panel.

### 4.2 Data policy
For the MVP, **synthetic disaster data combined with real map data** (OpenStreetMap) is used. All synthetic data must be **visibly labelled "Simulated"** in the UI.

---

## 5. User Flows

### 5.1 Primary flow (Officer)
```
Create disaster → Reports ingested → Zones generated → Scores computed
→ Demand estimated → Allocation generated → Routes selected
→ AI recommendation shown → Officer approves / modifies / rejects
→ Execution status → Live updates
```

### 5.2 Citizen report flow
Open public report page → enter description (+ optional location/photo placeholder) → submit → confirmation → report appears in officer feed after AI extraction.

### 5.3 Route failure flow
Officer (or data feed) marks a road segment blocked → route engine recalculates affected plans → UI shows "Route A blocked, Route C selected" with updated ETA and reason.

### 5.4 What-If flow
Officer opens Simulate → changes a constraint (remove 2 trucks, reduce stock, block a route, close a shelter) → system recomputes allocation → shows diff vs current plan, flags zones below minimum requirement, suggests a mitigation.

---

## 6. Functional Requirements

Priority key: **P0** = must have for MVP, **P1** = should have, **P2** = later.

### 6.1 Module 1 — Disaster Intelligence (Ingestion)
| ID | Requirement | Priority |
|---|---|---|
| FR-1.1 | Create a disaster event with type, name, region, start time, and status | P0 |
| FR-1.2 | Accept citizen reports (free text, location, optional contact) via public form and API | P0 |
| FR-1.3 | Bulk-import simulated reports (JSON/CSV) for demo seeding | P0 |
| FR-1.4 | Ingest weather data (rainfall, temperature, wind, storm info) from API or seeded values | P1 |
| FR-1.5 | Store geospatial data: roads, rivers, elevation, population, settlements, shelters | P0 |
| FR-1.6 | Store authority data: shelter capacity, vehicles, food/water/medical stock, rescue teams | P0 |
| FR-1.7 | Deduplicate reports by location + time window + text similarity | P1 |
| FR-1.8 | Attach a confidence value to each report and aggregate to a zone confidence | P1 |

### 6.2 Module 2 — AI Situation Analysis
| ID | Requirement | Priority |
|---|---|---|
| FR-2.1 | Extract structured fields from each report: disaster type, location, water/severity level, people affected (or unknown), medical requirement, requirement category, urgency | P0 |
| FR-2.2 | Classify disaster type: flood, cyclone, landslide, earthquake, fire, extreme weather | P0 |
| FR-2.3 | Classify requirement: food, water, medicine, rescue, shelter, transportation (multi-label) | P0 |
| FR-2.4 | Geocode extracted place names (Nominatim) and fall back to user-supplied coordinates | P0 |
| FR-2.5 | Summarize hundreds of reports into a concise situation summary per zone and overall | P0 |
| FR-2.6 | Validate AI output against a strict JSON schema; retry once, then flag for manual review | P0 |
| FR-2.7 | Cache AI responses for demo reliability (fallback when API fails or is rate limited) | P0 |

**Example extraction**

Input: *"The water has risen a lot and has entered the house. My mother needs medicine."*
```json
{
  "disaster": "flood",
  "location": "XYZ Village",
  "water_severity": "high",
  "people_affected": null,
  "medical_need": true,
  "requirements": ["medicine", "rescue"],
  "urgency": "critical"
}
```

### 6.3 Module 3 — Affected Zone Detection
| ID | Requirement | Priority |
|---|---|---|
| FR-3.1 | Cluster geocoded reports into zones (grid, admin boundary, or spatial clustering) | P0 |
| FR-3.2 | Compute per-zone: report count, estimated population affected, severity, medical risk, accessibility | P0 |
| FR-3.3 | Estimate population affected from reports combined with population data when reports are incomplete | P0 |
| FR-3.4 | Recompute zones as new reports arrive | P1 |

### 6.4 Module 4 — Priority / Impact Score
Each zone receives a **Relief Priority Score (0–100)**.

```
Priority Score = normalize(
    w1 × Population Impact
  + w2 × Severity
  + w3 × Medical Risk
  + w4 × Resource Shortage
  + w5 × Accessibility Difficulty
  + w6 × Vulnerability
)
```

| ID | Requirement | Priority |
|---|---|---|
| FR-4.1 | Compute each factor on a normalized 0–1 scale, then apply weights and scale to 0–100 | P0 |
| FR-4.2 | Weights are **configurable** (Admin) with documented defaults; show active weights in the UI | P0 |
| FR-4.3 | Band scores: Critical (≥ 85), High (70–84), Medium (50–69), Low (< 50) | P0 |
| FR-4.4 | Display a per-factor contribution breakdown for every zone | P0 |
| FR-4.5 | Generate a plain-language explanation, e.g. *"Zone A ranked #1 because 3,842 people are affected, medical need is high, food availability is critically low, and the nearest accessible shelter is 7.2 km away."* | P0 |
| FR-4.6 | Vulnerability factor uses simple inputs (elderly/children share, disabled, remote location) from seeded data | P1 |

**Default weights (configurable):** Population 25%, Severity 20%, Medical 20%, Shortage 15%, Accessibility 10%, Vulnerability 10%.

**Example output**

| Zone | Score | Priority |
|---|---:|---|
| Zone A | 94 | 🔴 Critical |
| Zone B | 81 | 🔴 High |
| Zone C | 63 | 🟠 Medium |
| Zone D | 31 | 🟢 Low |

### 6.5 Module 5 — Resource Demand Prediction
| ID | Requirement | Priority |
|---|---|---|
| FR-5.1 | Deterministic base calculation, e.g. `Food Demand = Affected Population × Daily Food Requirement × Duration` | P0 |
| FR-5.2 | Apply contextual modifiers: medical urgency, expected duration, vulnerability, existing stock | P0 |
| FR-5.3 | Output per zone: food kits, water units, medicine level, rescue boats, medical teams | P0 |
| FR-5.4 | Parameters (per-person daily requirements, boats per N stranded, etc.) are editable in settings | P1 |
| FR-5.5 | AI may adjust or explain demand within bounded ranges; deterministic value remains the source of truth | P1 |

**Example (Zone A, ~3,000 affected):** Food 1,800 kits, Water 3,500 units, Medicine High, Boats 4, Medical teams 2.

### 6.6 Module 6 — Intelligent Resource Allocation
| ID | Requirement | Priority |
|---|---|---|
| FR-6.1 | Allocate stock from relief centers to zones in priority order, respecting each center's inventory | P0 |
| FR-6.2 | Respect vehicle and team limits and road accessibility | P0 |
| FR-6.3 | Prefer nearer accessible centers; split a zone's demand across centers when needed | P0 |
| FR-6.4 | **Never over-promise.** If demand exceeds supply, show "⚠️ Food shortage detected" with the exact gap | P0 |
| FR-6.5 | On shortage, recommend mitigation: reallocate from lower-priority zones, or request external supply | P0 |
| FR-6.6 | Enforce a **minimum coverage floor** per zone so small or remote zones are not starved by pure maximization | P1 |
| FR-6.7 | MVP algorithm: greedy priority-ordered allocation with feasibility checks. Production path: linear/integer programming (objective: maximize population served, minimize response cost; constraints: stock, vehicles, teams, accessibility, shelter capacity) | P0 / P2 |

**Example**
```
Center C → Zone A : Food 1,800, Water 1,500
Center A → Zone B : Food 900,   Water 1,500
```

### 6.7 Module 7 — Route Intelligence
> Shortest route ≠ best relief route.

| ID | Requirement | Priority |
|---|---|---|
| FR-7.1 | Model roads as a graph of segments with status: Accessible, Partial, Blocked | P0 |
| FR-7.2 | Route with A* (Dijkstra acceptable fallback); cost = distance + road risk + accessibility penalty + estimated travel time | P0 |
| FR-7.3 | Blocked segments are excluded; partial segments carry a penalty | P0 |
| FR-7.4 | Return top route plus alternatives, each with distance, ETA, status, and reason for choice | P0 |
| FR-7.5 | Officer can mark a segment blocked/open; dependent routes recompute immediately | P0 |
| FR-7.6 | Display routes on the map with color by status | P0 |

**Example:** Route A (10 km) ❌ Flooded · Route B (14 km) ⚠️ Partial · Route C (17 km) ✅ Accessible → **Route C selected**, with the reason shown.

### 6.8 Module 8 — Smart Shelter Allocation
| ID | Requirement | Priority |
|---|---|---|
| FR-8.1 | Maintain shelter capacity, occupancy, location, and facilities | P0 |
| FR-8.2 | Given N people to evacuate, return suitable shelters (free capacity ≥ N, or split across several) and mark unsuitable ones with reason | P0 |
| FR-8.3 | Recommend the safest available route to the chosen shelter | P0 |
| FR-8.4 | Flag shelters above 90% occupancy as near capacity | P0 |

**Example:** Shelter A 480/500 ✗, Shelter B 300/800 ✓, Shelter C 390/400 ✗ → 200 evacuees go to Shelter B.

### 6.9 Module 9 — What-If Simulation ⭐
| ID | Requirement | Priority |
|---|---|---|
| FR-9.1 | "Simulate Scenario" panel works on a **copy** of current state; it never alters live data | P0 |
| FR-9.2 | Adjustable constraints: remove/add vehicles, change stock, block or reopen a route, close a shelter, add a new critical zone | P0 |
| FR-9.3 | Re-run allocation and routing; show a side-by-side diff (current vs simulated) per zone | P0 |
| FR-9.4 | Flag zones that fall below minimum requirement | P0 |
| FR-9.5 | Suggest a mitigation (e.g. "Redirect a truck from Resource Center B") with AI-generated explanation | P0 |
| FR-9.6 | Allow the officer to promote a simulation into a draft plan | P1 |
| FR-9.7 | Persist runs in `simulation_runs` for audit | P1 |

### 6.10 Module 10 — Recommendation, Approval and Execution
| ID | Requirement | Priority |
|---|---|---|
| FR-10.1 | Generate a **Response Plan** per zone: resources, source center, route, shelter (if relevant), reason | P0 |
| FR-10.2 | AI Recommendation panel (hero component) shows the top alert and recommended actions | P0 |
| FR-10.3 | Officer actions: **Approve**, **Modify**, **Reject** (with optional note) | P0 |
| FR-10.4 | "EXECUTE RESPONSE PLAN" is enabled only after approval; AI never auto-executes | P0 |
| FR-10.5 | Plan statuses: Draft → Approved → In Transit → Delivered / Failed; shown live | P0 |
| FR-10.6 | Approved plans deduct stock from centers; delivery updates adjust zone shortage | P1 |
| FR-10.7 | Full audit log: who approved or changed what, and when | P1 |

**Example recommendation (Zone A):** Priority 1 · 4 rescue boats · 1,200 food kits · 800 water units · 1 medical team · Source: Relief Center #3 · Route C · Reason: *Route A inaccessible; high population impact + medical emergency + low shelter capacity.*

---

## 7. AI Requirements

### 7.1 Role of AI (genuine tasks only)
1. **NLP**: understand citizen reports
2. **Classification**: disaster, requirement, severity
3. **Summarization**: condense hundreds of reports
4. **Demand estimation assist** (bounded)
5. **Decision explanation**: why a zone was prioritized
6. **What-If reasoning**: mitigation suggestions when constraints change

### 7.2 Architecture principle
AI does **not** directly control decisions.

```
Raw Data → AI Extraction → Structured Data → Deterministic Algorithms
        → Recommendation → AI Explanation
```

- Scores, allocations, and routes come from deterministic code and are reproducible.
- AI output is schema-validated before use.
- Explanations must cite only values present in the computed data (no invented numbers).

### 7.3 Provider and reliability
- Primary: **Gemini API**.
- Cached/fallback responses for the demo dataset.
- Timeouts and graceful degradation: if AI is unavailable, show deterministic template explanations.
- Prompt injection hygiene: citizen report text is treated as untrusted data, never as instructions.

---

## 8. UI / UX Requirements

### 8.1 Design direction
An **Emergency Operations Command Center**: dark interface, large interactive map, critical alerts, real-time resource status, clear priority indicators, minimal but information-rich panels. Accessibility: do not rely on color alone (use icons + labels), WCAG AA contrast, keyboard navigable.

### 8.2 Pages
| Page | Purpose | Access |
|---|---|---|
| **Landing / Home** | Product pitch, problem, workflow, CTA to open the demo | Public |
| **Command Center (Dashboard)** | Main operational view | Officer, Admin |
| **Zone Detail** | Deep dive on a zone: score breakdown, reports, plan | Officer, Admin |
| **Reports Feed** | Incoming reports with AI-extracted fields and confidence | Officer, Admin |
| **Resources & Centers** | Inventory, vehicles, teams, shelters | Officer, Coordinator, Admin |
| **Response Plans** | List, approve/modify/reject, track execution | Officer, Coordinator |
| **Simulation Lab** | What-If scenarios and diff view | Officer |
| **Report an Emergency** | Public citizen report form | Public |
| **Admin / Settings** | Weights, demand parameters, users, data import | Admin |
| **Login** | Authentication | All |

### 8.3 Command Center layout
```
┌─────────────────────────────────────────────┐
│ RELIEF-OS       FLOOD EVENT       LIVE ●   │
├──────────┬──────────────────────┬───────────┤
│ PRIORITY │       LIVE MAP       │ RESOURCE  │
│ ZONES    │                      │ STATUS    │
│ Zone A   │    🔴 🔴 🟠 🟡       │ Food 72%  │
│ Zone B   │                      │ Water 48% │
│ Zone C   │                      │ Teams 12  │
├──────────┴──────────────────────┴───────────┤
│ AI RECOMMENDATION                           │
│ Zone A → Deploy 4 boats + medical team     │
└─────────────────────────────────────────────┘
```

### 8.4 KPI bar (top)
Active Disaster · Affected People · Critical Zones · Resource Shortages · Active Teams · Shelter Occupancy (e.g. 01 · 18,420 · 07 · 04 · 23 · 71%).

### 8.5 Map layers (toggleable)
🔴 Critical zones · 🟠 High · 🟡 Medium · 🟢 Low · 🏠 Shelters · 📦 Resource centers · 🚑 Medical facilities · 🚧 Blocked roads · 🚚 Active relief routes. Stack: Leaflet / React-Leaflet on OpenStreetMap tiles.

### 8.6 Zone popup / panel (on click)
Zone name and band · Population affected · Priority score /100 · Food shortage % · Water shortage % · Medical risk · Nearest shelter distance · Recommended action list · "Generate Response Plan" button · "Why this score?" expandable explanation.

### 8.7 AI Recommendation panel (hero)
Alert title ("AI PRIORITY ALERT") · key stats · recommended actions with icons (🚤 boats, 📦 food, 💧 water, 🏥 medical team) · reason · buttons **Approve / Modify / Reject** and **EXECUTE RESPONSE PLAN** (enabled after approval).

### 8.8 Other UI requirements
- Real-time-feeling updates (polling or WebSocket/SSE) for reports, statuses, and routes.
- Persistent "Simulated data" badge when synthetic data is in use.
- Smooth, restrained motion (Framer Motion); no animation that delays critical actions.
- Responsive down to tablet; mobile-friendly public report form.
- Charts (Recharts): shortage over time, shelter occupancy, resource utilization, zones by priority band.

---

## 9. System Architecture

```
DATA SOURCES (citizen, weather, GIS, authority)
        ↓
AI PROCESSING (Gemini: extraction, classification, summary)
        ↓
SITUATION ENGINE → PRIORITY ENGINE (0–100)
        ↓
RESOURCE OPTIMIZER        ROUTE ENGINE
        ↓                       ↓
        AI RESPONSE PLAN (+ explanation)
        ↓
HUMAN APPROVAL → EXECUTION → LIVE UPDATES
```

### 9.1 Technology stack
| Layer | Choice |
|---|---|
| Frontend | React + Vite, Tailwind CSS, React-Leaflet, Recharts, Framer Motion |
| Backend | Node.js + Express (API → AI processing → priority engine → optimizer → route engine → DB) |
| Database | PostgreSQL + PostGIS (POINT, LINESTRING, POLYGON; spatial queries such as shelters within 10 km of a zone) |
| AI | Gemini API |
| Maps / Geocoding | OpenStreetMap, Nominatim |
| Weather | OpenWeather (or seeded values) |
| Optional data | NASA, USGS, open government datasets for simulated history |

---

## 10. Data Model

Tables: `users`, `disasters`, `zones`, `reports`, `resources`, `resource_centers`, `shelters`, `routes`, `road_segments`, `allocations`, `response_teams`, `recommendations`, `simulation_runs` (plus `audit_log`, `settings`).

Key tables:

```text
reports:          id, disaster_id, user_id, location (POINT), description, severity,
                  category, people_affected, medical_need, confidence, is_simulated, created_at
zones:            id, disaster_id, geometry (POLYGON), population, affected_population,
                  severity, medical_risk, accessibility, vulnerability, priority_score, band
resources:        id, resource_type, quantity, center_id, status
resource_centers: id, name, location (POINT), vehicles_available
shelters:         id, name, location (POINT), capacity, occupied, facilities
road_segments:    id, geometry (LINESTRING), length_km, status, risk_score
allocations:      id, zone_id, resource_id, quantity, priority, recommended_route,
                  status (draft/approved/in_transit/delivered/failed)
recommendations:  id, zone_id, plan (JSON), explanation, approved_by, approved_at, status
simulation_runs:  id, user_id, base_snapshot, changes (JSON), result (JSON), created_at
```

---

## 11. API Specification (indicative)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/disasters` | Create disaster |
| GET | `/api/disasters/:id/dashboard` | KPIs + zones + resources snapshot |
| POST | `/api/reports` | Submit a citizen report |
| POST | `/api/reports/bulk` | Import simulated reports |
| GET | `/api/reports?disaster=:id` | List reports with AI fields |
| POST | `/api/disasters/:id/analyze` | Run extraction → zones → scoring |
| GET | `/api/zones/:id` | Zone detail + score breakdown + explanation |
| POST | `/api/zones/:id/plan` | Generate response plan |
| POST | `/api/plans/:id/approve` · `/modify` · `/reject` | Human review actions |
| POST | `/api/plans/:id/execute` | Execute approved plan |
| GET | `/api/shelters/suggest?people=N&zone=:id` | Shelter recommendation |
| POST | `/api/routes/compute` | Compute best route with alternatives |
| PATCH | `/api/road-segments/:id` | Mark blocked/partial/accessible |
| POST | `/api/simulations` | Run What-If scenario |
| GET/PUT | `/api/settings/weights` | Read/update scoring weights |

---

## 12. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Performance** | Dashboard load < 3 s on demo data; analysis pipeline < 10 s; route and simulation recompute < 3 s |
| **Reliability** | AI fallback and caching; deterministic engines work without AI; graceful error states |
| **Security** | Authentication, role-based access, input validation, rate-limit public report endpoint, sanitize report text, secrets in environment variables |
| **Privacy** | Collect minimal personal data; contact info optional; clear notice on the report form |
| **Explainability** | Every score and plan shows contributing factors and a reason |
| **Auditability** | Log approvals, modifications, rejections, and weight changes |
| **Transparency** | "Simulated" labelling on synthetic data; show data freshness timestamps and confidence |
| **Accessibility** | Keyboard support, contrast, non-color cues |
| **Scalability (design)** | Modular engines so the stack can grow to District → State → National |

---

## 13. Demo Dataset — Assam Flood Scenario

Initial state: Affected population **18,420** · Critical zones **7** · Shelters **18** · Relief centers **5** · Vehicles **21** · Reports **1,247**.

**Zone A (hero zone), canonical numbers used everywhere in the UI:**
Population affected 3,842 · Priority 94/100 (Critical) · Food shortage 72% · Water shortage 61% · Medical risk High · Nearest shelter 5.4 km · Recommended: 4 boats, 1,200 food kits, 800 water units, 1 medical team · Source: Relief Center #3 · Route A flooded → **Route C** selected.

### 3-minute demo script
| Time | Beat |
|---|---|
| 0:00–0:20 | Hook: map view. *"The problem isn't lack of information; it's deciding what to do with it fast enough."* |
| 0:20–0:50 | Reports feed: 1,247 reports grouped automatically into zones |
| 0:50–1:20 | Click Zone A: score 94, explanation of why |
| 1:20–1:50 | Generate Response Plan: resources + best relief center |
| 1:50–2:15 | Route A blocked → instant recalculation to Route C |
| 2:15–2:40 | What-If: remove 2 trucks → allocation recomputes, shortage flagged |
| 2:40–3:00 | Close: *"AI doesn't replace the disaster response team. It gives them the right decision, faster."* |

---

## 14. Release Plan

### Phase 1 — MVP (hackathon)
Core 7 + What-If, command-center UI, human approval, Assam flood demo dataset.

### Phase 2
Live weather and rainfall, satellite imagery, automatic flood-risk layers, multilingual voice reports, WhatsApp/SMS intake, volunteer coordination, inter-district resource sharing, predictive demand, historical disaster learning.

### Phase 3 — National scale
District → State → National command hierarchy with cross-district redistribution recommendations.

### Suggested MVP build order
1. Schema, seed data, map base layer
2. Report ingestion + Gemini extraction (with cache)
3. Zone generation + priority engine + explanations
4. Demand calculation + greedy allocation
5. Road graph + A* route engine + block/unblock
6. Command Center UI + zone panel + recommendation panel + approval flow
7. Shelter suggestion
8. What-If simulation + diff view
9. Polish, demo rehearsal, fallback checks

---

## 15. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Unreliable, duplicate, or false citizen reports | Wrong zone estimates | Deduplication, confidence scores, officer review, show uncertainty |
| Unexplained scoring weights | Loss of trust | Configurable weights, shown in UI, per-factor breakdown |
| Pure maximization starves remote zones | Unfair distribution | Minimum coverage floor, fairness term |
| Real-time road/shelter data unavailable | Stale plans | Manual officer updates, timestamps, labelled simulated data |
| LP/IP too heavy for MVP | Schedule slip | Greedy allocation for MVP; LP as production path |
| AI hallucination or API failure | Bad or missing explanations | Schema validation, number-grounded prompts, caching, template fallback |
| Prompt injection via report text | Manipulated output | Treat reports as data, strict output schema, no tool execution from AI |
| Over-reliance on AI in life-critical decisions | Harm | Mandatory human approval, audit trail, clear "decision support" framing |

---

## 16. Open Questions
1. Zone definition: administrative boundaries, uniform grid, or spatial clustering for the demo?
2. Final default scoring weights and band thresholds, to be confirmed with a domain expert if available.
3. Authentication level for the demo (single seeded officer vs. full login)?
4. Languages for the report form in MVP (English only, or English + Assamese/Hindi)?
5. Real-time transport: polling vs. WebSocket/SSE?

---

## 17. Final Positioning Statement

> **RELIEF-OS is an AI-powered disaster response decision engine that transforms fragmented emergency data into prioritized, explainable resource allocation and route plans.**
>
> *It doesn't just show where the disaster is. It decides what should happen next.*
