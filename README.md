# AAROH

> **AI-Powered Disaster Response & Resource Intelligence**  
> *"Turning Disaster Data Into Actionable Intelligence."*  
> *(Formerly code-named RELIEF-OS during early architecture prototyping)*

---

## 1. Project Overview

### 1.1 The Problem
During sudden-onset natural disasters—such as floods, cyclones, landslides, and earthquakes—emergency operations centers face severe information fragmentation. First responders and disaster management authorities must simultaneously process:
- Hundreds of unstructured, desperate citizen reports across social media and phone lines.
- Shifting flood levels, submerged infrastructure, and road washouts.
- Evacuees arriving at emergency shelters with unknown remaining capacity.
- Depleted stock across scattered regional warehouses and relief depots.

Traditional emergency dashboards only plot historical or observational data on a map. They show **where** the crisis is happening, but leave authorities to manually answer critical operational questions under acute time pressure:
- *Which zone requires intervention first?*
- *What specific supplies are needed, and from which depot should they be dispatched?*
- *Which route is actually safe and passable right now?*
- *What happens when a critical access bridge is submerged?*

Turning fragmented data into coordinated action takes hours—and in a disaster, delay costs lives.

### 1.2 The Proposed Solution
**AAROH** is an **AI-Powered Disaster Response & Resource Intelligence Platform**. It transforms raw, chaotic emergency inputs into prioritized, transparent, and actionable response plans:
1. **Understands Distress Signals:** Normalizes incoming citizen distress reports into structured needs.
2. **Computes Transparent Priorities:** Ranks affected zones using an explainable 0–100 **Relief Priority Score**.
3. **Optimizes Resource Allocation:** Calculates precise resource deficits (food kits, potable water, medical units, rescue boats) and allocates available depot inventories without over-promising.
4. **Selects Safe Routes:** Dispatches aid along disaster-aware routes, evaluating impassable roads and automatically routing around flooded sectors.
5. **Directs Shelter Operations:** Suggests shelters with verifiable capacity and alerts coordinators when shelters exceed 90% occupancy.
6. **Facilitates What-If Simulations:** Enables command officers to simulate contingencies (e.g., losing 2 supply trucks or closing a bridge) and inspect immediate outcome deltas before committing real-world assets.

### 1.3 Decision-Support System & Human-in-the-Loop Mandate
> [!IMPORTANT]
> **AAROH is strictly an operational decision-support system.**  
> It does **not** autonomously dispatch rescue teams, reallocate government stocks, or execute emergency orders without oversight. Every generated plan must be reviewed, optionally adjusted, and explicitly approved by an authorized emergency officer before response execution.

### 1.4 Intended Users & Personas
| Persona | Role | Primary Use in RELIEF-OS |
|---|---|---|
| **District Emergency Officer** *(Primary)* | Incident Commander / Emergency Operations Center (EOC) | Reviews prioritized zones, inspects plain-language explanations, executes What-If simulations, and approves or modifies dispatch orders. |
| **Relief Coordinator** | NGO, Red Cross, Humanitarian Agency Director | Monitors regional warehouse inventory, tracks supply shortages, and coordinates inter-depot resource transfers. |
| **Field Team Lead** | First Responder, Search & Rescue, Medical Corps Lead | Receives verified task orders detailing exact destination coordinates, requested gear, and verified passable routes. |
| **Citizen Reporter** | Affected resident or community volunteer | Submits quick, low-bandwidth emergency reports with optional location information without requiring account registration. |
| **System Administrator** | IT Operations / GIS Specialist | Configures priority scoring weights, manages shelter/depot directories, and maintains geospatial infrastructure layers. |

---

## 2. Core MVP Features

The platform's functional scope is organized around the PRD "Core 7" capabilities plus the What-If simulation engine.

```
+----------------------------------------------------------------------------------------------------+
|                                    DECISION ENGINE PIPELINE                                        |
|                                                                                                    |
|  [Citizen Reports] ──> [AI Extraction] ──> [Zone Detection] ──> [Priority Scoring (0-100)]         |
|                                                                         │                          |
|  [Human Approval]  <── [Response Plan] <── [Route & Shelter Engine] <── [Resource Allocator]       |
+----------------------------------------------------------------------------------------------------+
```

### Feature Implementation Status
To provide complete transparency for developers and auditors, the table below distinguishes implemented foundational deliverables from planned roadmap components.

| Module / PRD Feature | Description | Status | Implementation Details |
|---|---|---|---|
| **1. Disaster Creation & Report Ingestion** | Ingestion of disaster events and raw citizen distress reports (text, geo-point, severity, needs). | **Implemented (Phase 1)** | Core DB schema (`disasters`, `reports`), shared TypeScript types (`Disaster`, `CitizenReport`), API contracts, and UI shell. Bulk simulation seeding supported via SQL. |
| **2. AI Situation Analysis & Extraction** | Natural Language Processing to extract structured disaster fields and generate situation summaries. | **Planned (Phase 2)** | Gemini API extraction pipeline, schema validation, and prompt-injection defense layers designed; DB includes `status = 'pending_ai'` queue and fallback templates. |
| **3. Affected Zone Detection & Priority Scoring** | Spatial clustering of reports into zones and computing an explainable 0–100 Relief Priority Score. | **Implemented (Phase 1 Baseline)** | Configurable multi-factor weighting schema (`settings` table), 4 priority bands (`Critical`, `High`, `Medium`, `Low`), and canonical Assam flood zones seeded. |
| **4. Resource Demand & Allocation** | Deterministic demand modeling and depot inventory allocation with honest shortage detection. | **Implemented (Phase 1 Schema / Metrics)** | Data models for depots, items, quotas, and shortage flags. Canonical numbers verified for Assam Flood scenario. Algorithmic optimizer solver planned for Phase 2. |
| **5. Disaster-Aware Routing** | Graph-based route recommendations prioritizing safety and traversability over shortest distance. | **Implemented (Phase 1 Schema / Scenarios)** | Road segment data model with statuses (`accessible`, `partial`, `blocked`). Canonical scenario (Route A flooded → Route C selected) modeled and seeded. |
| **6. Smart Shelter Recommendations** | Capacity-aware evacuation routing directing displaced populations away from overcrowded shelters. | **Implemented (Phase 1 Schema / Data)** | Schema tracking total capacity vs. live occupancy, 18 seeded shelters in the Assam region, and >90% occupancy warning thresholds. |
| **7. What-If Scenario Simulation** | Non-destructive sandbox allowing officers to modify constraints and preview allocation deltas. | **Implemented (Phase 1 Schema / Contracts)** | Data contracts and schema for base snapshots, constraint deltas, and mitigation outputs. Interactive UI simulation workbench planned for Phase 3. |
| **8. Human Approval & Audit Trail** | Mandatory officer gate (`Approve`, `Modify`, `Reject`) and full immutable action logging. | **Implemented (Phase 1 Architecture)** | Workflow states (`draft` → `approved` → `in_transit` → `delivered`), `audit_log` database table, and UI approval state indicators. |

---

## 3. Technology Stack

RELIEF-OS is engineered as an enterprise-grade TypeScript monorepo designed for mission-critical reliability, fast cold-start performance, and strict geospatial precision.

### 3.1 Implemented & Configured Stack
- **Frontend Application (`apps/web`):**
  - **Framework:** [React 18](https://react.dev/) with [Vite 5](https://vitejs.dev/) (fast HMR, lightweight client bundle).
  - **Language:** [TypeScript 5](https://www.typescriptlang.org/) (strict mode, shared domain models).
  - **Styling:** [Tailwind CSS 3](https://tailwindcss.com/) with a custom military/emergency command-center dark theme (`#070b12` background, tactical slate accents, high-contrast WCAG AA indicators).
  - **Icons:** [Lucide React](https://lucide.dev/) (standardized emergency, infrastructure, and status iconography).
  - **GIS & Interactive Mapping (Implemented in Phase 1):** [React-Leaflet 4](https://react-leaflet.js.org/) & [Leaflet 1.9](https://leafletjs.com/) with [OpenStreetMap](https://www.openstreetmap.org/) base tiles, legal attribution, and custom tactical map pins.
  - **Planned UI Additions (Phase 2/3):** [Recharts](https://recharts.org/) for shortage trend visualization, and [Framer Motion](https://www.framer.com/motion/) for micro-interactions.
- **Backend API Service (`apps/api`):**
  - **Runtime:** [Node.js](https://nodejs.org/) (LTS 20+ / tested up to Node 25).
  - **Server:** [Express 4](https://expressjs.com/) with CORS and JSON streaming middleware.
  - **Validation:** [Zod 3](https://zod.dev/) for runtime contract and payload validation.
  - **Database Driver:** `pg` (Node-Postgres) configured for pooled PostGIS queries.
  - **Development Execution:** `tsx` for high-performance TypeScript script execution and live reload.
- **Shared Domain Core (`packages/shared`):**
  - Zero-dependency TypeScript library defining all domain interfaces, enums, priority scoring weights, and API schemas shared between web and api services.
- **Database & Spatial Engine (`database/`):**
  - **RDBMS:** [PostgreSQL 14+](https://www.postgresql.org/).
  - **Spatial Extension:** [PostGIS 3+](https://postgis.net/) utilizing spatial data types (`GEOMETRY(Point, 4326)`, `GEOMETRY(LineString, 4326)`, `GEOMETRY(Polygon, 4326)`) and GIST spatial indexing.
- **Artificial Intelligence (Planned for Phase 2):**
  - [Google Gemini API](https://ai.google.dev/) (`gemini-1.5-pro`) for zero-shot distress report extraction, multi-lingual emergency translation, and explainable decision text generation.

---

## 4. Project Structure

The project is organized as an npm workspaces monorepo:

```
reliefnew/
├── .env.example                     # Root environment configuration template
├── .gitignore                       # Standardized git ignore rules
├── package.json                     # Monorepo root configuration & orchestrator scripts
├── README.md                        # Primary project documentation (this document)
├── apps/
│   ├── api/                         # Backend Decision Engine Service
│   │   ├── .env.example             # API service environment template
│   │   ├── package.json             # API dependencies and scripts
│   │   ├── tsconfig.json            # TypeScript NodeNext configuration
│   │   └── src/
│   │       └── index.ts             # Express server entry point & health endpoint
│   └── web/                         # Tactical Command Center Frontend
│       ├── .env.example             # Web client environment template
│       ├── index.html               # Web application HTML shell
│       ├── package.json             # Web dependencies and scripts
│       ├── postcss.config.js        # PostCSS pipeline configuration
│       ├── tailwind.config.js       # Tactical command center color theme
│       ├── tsconfig.json            # TypeScript React configuration
│       ├── vite.config.ts           # Vite build and dev server configuration
│       └── src/
│           ├── components/          # Reusable tactical UI components
│           │   └── CommandMap.tsx   # React-Leaflet OpenStreetMap tactical map
│           ├── App.tsx              # Phase 1 Command Center overview & demo metrics
│           ├── index.css            # Tailwind directives and tactical dark tokens
│           └── main.tsx             # React DOM entry point
├── database/
│   ├── migrations/                  # Versioned DDL migration scripts
│   │   └── 001_initial_schema.sql   # PostGIS extension, spatial tables, and indexes
│   └── seeds/                       # Seed datasets & reset procedures
│       ├── 001_assam_flood_seed.sql # Canonical PRD Assam flood scenario dataset
│       └── reset_demo_data.sql      # Idempotent cleanup script to reset demo state
├── docs/                            # Architectural specifications & requirements
│   ├── ARCHITECTURE.md              # Decision engine pipeline & approval architecture
│   └── PRD.md                       # Canonical Product Requirements Document
└── packages/
    └── shared/                      # Cross-tier contract library
        ├── package.json             # Package manifest (@relief-os/shared)
        ├── tsconfig.json            # Shared TypeScript configuration
        └── src/
            └── index.ts             # Domain models, enums, and API interfaces
```

---

## 5. Prerequisites

Before installing RELIEF-OS, ensure your development environment satisfies the following software requirements:

| Software | Required Version | Verification Command | Purpose |
|---|---|---|---|
| **Node.js** | `>= 18.18.0` (Recommended: `20.x` or `25.x`) | `node -v` | JavaScript runtime for frontend build tooling and Express API |
| **npm** | `>= 9.0.0` (Tested: `11.x`) | `npm -v` | Monorepo package manager and workspace orchestrator |
| **PostgreSQL** | `>= 14.0` | `psql --version` | Relational database engine |
| **PostGIS** | `>= 3.0` | `psql -c "SELECT PostGIS_Version();"` | Geospatial querying and indexing extension |
| **Git** | `>= 2.30.0` | `git --version` | Version control |

---

## 6. Installation and Setup

Follow these verified, step-by-step instructions to set up RELIEF-OS locally.

### Step 1: Open the Project Directory
Navigate to the root directory where the repository is located:
```bash
cd c:\Users\Hp\Desktop\programs\antigravity\reliefnew
```
*(If checking out from a remote repository once published: `git clone <repository-url> && cd relief-os`)*

### Step 2: Install Workspace Dependencies
Install dependencies across all workspaces (`apps/web`, `apps/api`, `packages/shared`) from the monorepo root:
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy the root `.env.example` template to `.env`:
```bash
# On Linux / macOS / Git Bash:
cp .env.example .env

# On Windows PowerShell:
Copy-Item .env.example .env
```
*(Optional: Also copy `.env.example` inside `apps/api` and `apps/web` if running services independently).*

### Step 4: Configure Supabase PostgreSQL with PostGIS
RELIEF-OS uses **Supabase PostgreSQL** with the PostGIS extension. No local PostgreSQL engine or `psql` binary is required.
1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Project Settings** ➔ **Database** ➔ **Connection string** ➔ Select **URI** (Transaction/Session Pooler on port `6543` or Direct on `5432`).
3. Set your connection URI and password in the root `.env`:
   ```bash
   DATABASE_URL="postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require"
   DB_SSL=true
   ```

### Step 5: Execute Database Migrations
Run the native Node.js migration runner to enable PostGIS and apply all spatial tables and indexes:
```bash
npm run db:migrate
```

### Step 6: Load Simulated Demo Seed Data & Verify
Load the canonical Assam Flood demonstration dataset and verify database health:
```bash
# Seed canonical PRD dataset (18,420 affected, 7 critical zones, etc.)
npm run db:seed

# Verify PostGIS version, schema tables, and canonical PRD figures via SQL
npm run db:verify
```

### Step 7: Start the Development Servers
You can launch both the frontend and backend services concurrently or start them in separate terminals:

```bash
# Launch both frontend and backend concurrently across workspaces:
npm run dev

# OR launch specifically from the root:
npm run dev:web    # Starts Vite on http://localhost:5173
npm run dev:api    # Starts Express API on http://localhost:4000
```

### Step 8: Code Quality, Verification & Production Builds
Execute verification scripts directly supported in `package.json`:
```bash
# Run linting across all packages
npm run lint

# Run TypeScript type-checking across all packages
npm run typecheck

# Run test suites across all packages
npm run test

# Compile production bundles
npm run build
```

---

## 7. Environment Variables

All configuration is managed via environment variables. Create a local `.env` file in the root based on `.env.example`.

> [!CAUTION]
> **Never commit real secrets or `.env` files to version control.**  
> The `.env` file is explicitly ignored in `.gitignore`. The placeholders below indicate the expected variable names and types.

| Variable Name | Purpose | Required / Optional | Default / Example Placeholder |
|---|---|---|---|
| `NODE_ENV` | Application environment lifecycle mode | Required | `development` |
| `PORT` | Local network port for the Express API | Required | `4000` |
| `API_HOST` | Host binding for the backend API | Optional | `localhost` |
| `CORS_ORIGIN` | Allowed cross-origin origin for web client | Required | `http://localhost:5173` |
| `DB_HOST` | PostgreSQL server hostname | Required | `localhost` |
| `DB_PORT` | PostgreSQL server port | Required | `5432` |
| `DB_NAME` | PostGIS database name | Required | `relief_os_db` |
| `DB_USER` | PostgreSQL user account | Required | `postgres` |
| `DB_PASSWORD` | PostgreSQL user password | Required | `your_secure_postgres_password_here` |
| `DB_SSL` | Enable TLS/SSL for database connection | Optional | `false` |
| `DATABASE_URL` | Complete connection string for drivers | Optional | `postgresql://postgres:your_secure_postgres_password_here@localhost:5432/relief_os_db` |
| `VITE_API_URL` | API base endpoint consumed by web client | Required | `http://localhost:4000/api` |
| `VITE_APP_NAME` | Client application display title | Optional | `RELIEF-OS` |
| `VITE_ENABLE_SIMULATED_DATA_BADGE` | Forces simulated-data warning banner | Required | `true` |
| `GEMINI_API_KEY` | Google Gemini API key (Phase 2 AI engine) | Optional (Phase 1) / Required (Phase 2) | `your_gemini_api_key_here` |
| `GEMINI_MODEL` | Gemini model variant for NLP extraction | Optional | `gemini-1.5-pro` |

---

## 8. Database and Demo Data

### 8.1 PostGIS Setup & Workflow
RELIEF-OS utilizes spatial geometries to calculate distances between relief centers, zones, and road networks. The migration script in `database/migrations/001_initial_schema.sql` establishes:
- GIST spatial indexes on `zones.geometry`, `reports.location`, `shelters.location`, `resource_centers.location`, and `road_segments.geometry`.
- Standardized coordinate reference system: `EPSG:4326` (WGS 84 latitude/longitude).

### 8.2 Seeding & Safe Reset Procedure
The simulated demo scenario is contained in `database/seeds/001_assam_flood_seed.sql`. If you need to wipe simulated operations and return to a clean baseline:
```bash
psql -U postgres -d relief_os_db -f database/seeds/reset_demo_data.sql
psql -U postgres -d relief_os_db -f database/seeds/001_assam_flood_seed.sql
```

### 8.3 Persistent Simulated-Data Labeling
> [!WARNING]
> **Emergency Data Integrity Notice:**  
> All demo datasets are strictly synthetic. The application enforces a visible, persistent **"SIMULATED DATA ENVIRONMENT"** badge in the user interface to ensure that training runs, demos, or drills are never confused with live emergency alerts.

### 8.4 Canonical Assam Flood Demo Figures (PRD Reference)
The project is calibrated around the canonical Assam Flood scenario documented in the PRD. These figures are hardcoded into seed scripts and verified across the application:

```
+----------------------------------------------------------------------------------------------------+
|                         CANONICAL ASSAM FLOOD DEMO SCENARIO METRICS                                |
|                                                                                                    |
|  • Total Affected Population: 18,420 citizens             • Critical Priority Zones: 07            |
|  • Active Relief Centers:     05 operational bases        • Dispatched Fleet:        21 units      |
|  • Emergency Shelters:        18 shelters (71% occupancy) • Ingested Reports:        1,247         |
+----------------------------------------------------------------------------------------------------+
```

#### Hero Walkthrough Focus: Zone A (Barpeta Central / Jania)
- **Affected Population:** 3,842 residents.
- **Relief Priority Score:** **94 / 100** (`Critical Priority` band).
- **Supply Deficits:** 72% food shortage gap, 61% potable water deficit.
- **Medical Urgency:** High (elderly and vulnerable populations stranded in rising water).
- **Shelter Destination:** Howly Community Relief Center (Shelter B) — 5.4 km away (300/800 capacity).
- **Recommended Resource Allocation:**
  - `4 Rescue Boats`
  - `1,200 Food Kits`
  - `800 Potable Water Units`
  - `1 Medical Response Unit`
  - **Source Depot:** Relief Center #3 (Barpeta).
- **Disaster-Aware Routing Decision:**
  - `Route A` (10.2 km): Flooded (1.8m water level) ➔ **Blocked**
  - `Route B` (14.1 km): Waterlogged shoulders ➔ **Partial / High Risk**
  - `Route C` (17.4 km): High-elevation bypass ➔ **Accessible & Selected**

---

## 9. Application URLs and API Specification

### 9.1 Local Service URLs
- **Frontend Command Center:** `http://localhost:5173`
- **Backend Decision Engine API:** `http://localhost:4000`
- **Backend Health Check:** `http://localhost:4000/api/health`
- **Demo Scenario KPI Endpoint:** `http://localhost:4000/api/disasters/demo-kpis`

### 9.2 API Route Registry
The following table details current Phase 1 operational routes alongside planned endpoints for upcoming phases.

| HTTP Method | Route Endpoint | Purpose / Description | Implementation Status |
|---|---|---|---|
| `GET` | `/api/health` | Service health, version, and environment status | **Implemented (Phase 1)** |
| `GET` | `/api/disasters/demo-kpis` | Summary KPIs and Zone A hero metrics for Assam Flood | **Implemented (Phase 1)** |
| `POST` | `/api/disasters` | Create a new disaster event | *Planned (Phase 2)* |
| `GET` | `/api/disasters/:id/dashboard` | Aggregated dashboard state (zones, depots, shortages) | *Planned (Phase 2)* |
| `POST` | `/api/reports` | Ingest an individual citizen distress report | *Planned (Phase 2)* |
| `POST` | `/api/reports/bulk` | Bulk import simulated citizen distress reports | *Planned (Phase 2)* |
| `GET` | `/api/reports?disaster=:id` | List ingested reports with AI-extracted categories | *Planned (Phase 2)* |
| `POST` | `/api/disasters/:id/analyze` | Execute AI NLP extraction, zone clustering, and scoring | *Planned (Phase 2)* |
| `GET` | `/api/zones/:id` | Detailed zone metrics, score breakdown, and explanation | *Planned (Phase 2)* |
| `POST` | `/api/zones/:id/plan` | Generate draft response plan with depot & route | *Planned (Phase 2)* |
| `POST` | `/api/plans/:id/approve` | Human officer approval of a generated response plan | *Planned (Phase 2)* |
| `POST` | `/api/plans/:id/modify` | Human officer modification of resource quantities | *Planned (Phase 2)* |
| `POST` | `/api/plans/:id/reject` | Human officer rejection of response plan with rationale | *Planned (Phase 2)* |
| `POST` | `/api/plans/:id/execute` | Dispatch execution trigger (enabled only after approval) | *Planned (Phase 2)* |
| `GET` | `/api/shelters/suggest` | Capacity-aware shelter suggestions for evacuation | *Planned (Phase 2)* |
| `POST` | `/api/routes/compute` | Compute optimal disaster-aware route and alternatives | *Planned (Phase 2)* |
| `PATCH`| `/api/road-segments/:id` | Update road segment status (`accessible`, `blocked`) | *Planned (Phase 2)* |
| `POST` | `/api/simulations` | Run What-If contingency scenario and return deltas | *Planned (Phase 3)* |
| `GET`  | `/api/settings/weights` | Inspect current priority scoring weights | *Planned (Phase 2)* |
| `PUT`  | `/api/settings/weights` | Update priority scoring weights (Admin only) | *Planned (Phase 2)* |

---

## 10. Development and Troubleshooting

### 10.1 Common Issues & Resolutions

#### 1. PostgreSQL Connection Refused (`ECONNREFUSED 127.0.0.1:5432`)
- **Cause:** PostgreSQL service is stopped or listening on a different port.
- **Resolution:**
  - Verify PostgreSQL service status:
    - *Windows:* Open `services.msc` and confirm `postgresql-x64-<version>` is **Running**.
    - *Linux:* `sudo systemctl status postgresql`
  - Confirm connection credentials in `.env` match your local PostgreSQL installation.

#### 2. PostGIS Extension Missing Error
- **Error:** `ERROR: could not open extension control file "postgis.control": No such file or directory`
- **Cause:** PostgreSQL is installed, but the PostGIS spatial extension package is missing.
- **Resolution:**
  - *Windows:* Launch the EnterpriseDB Application Stack Builder, select your PostgreSQL version, and install **PostGIS Bundle**.
  - *Ubuntu/Debian:* `sudo apt-get install postgresql-14-postgis-3`
  - *macOS:* `brew install postgis`

#### 3. Port Conflicts (`EADDRINUSE: address already in use :::4000` or `:::5173`)
- **Cause:** Another process is utilizing port 4000 (API) or 5173 (Vite).
- **Resolution:**
  - On Windows, identify and terminate the occupying process:
    ```powershell
    Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process
    ```
  - Alternatively, change `PORT=4001` in `.env` and update `VITE_API_URL=http://localhost:4001/api`.

#### 4. Missing Environment Variables
- **Symptom:** API fails to start with undefined database parameters or CORS errors.
- **Resolution:** Ensure `.env` exists in the project root. If running `apps/api` directly, confirm variables are exported or that `apps/api/.env` is present.

#### 5. OpenStreetMap Tile Attribution Requirement
- **Requirement:** Any map component utilizing OpenStreetMap tiles must maintain proper legal attribution.
- **Attribution String:**
  ```html
  &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors
  ```
  Ensure this attribution string remains active on all Leaflet map views.

### 10.2 Service Verification Checklist
To confirm all layers of the monorepo are operating correctly:
1. **Database:** Execute `psql -U postgres -d relief_os_db -c "SELECT count(*) FROM zones;"` — should return `7`.
2. **Backend API:** Open `http://localhost:4000/api/health` in a browser — should return `{ status: "healthy", phase: "Phase 1 - Monorepo Foundation" }`.
3. **Frontend Client:** Open `http://localhost:5173` — should render the Command Center shell displaying the persistent `SIMULATED DATA ENVIRONMENT` badge and canonical Assam flood figures.

---

## 11. Security, Privacy and Limitations

### 11.1 Secret Management
- API keys (including Gemini API credentials), database passwords, and session secrets are strictly forbidden from source repositories.
- Environment variables are injected at runtime via `.env` files which are excluded via `.gitignore`.
- CI/CD workflows must inject secrets via secure vault or runner secrets.

### 11.2 Input Sanitization & Validation
- All inbound API payloads are parsed against strict **Zod schemas**.
- Free-form citizen reports are treated as untrusted text. Citizen text is strictly parameterized and escaped before database insertion or prompt assembly to protect against SQL injection and prompt-injection attacks.

### 11.3 Citizen Privacy Protection
- Citizen distress reports require only emergency descriptions and location data. Contact numbers and reporter identities are **strictly optional**.
- Personal identifiers are excluded from public operational feeds and shared only with verified rescue team leads when critical for evacuation locating.

### 11.4 Synthetic Data Boundaries
- All mock records are permanently marked `is_simulated = true`.
- Seed data uses synthetic citizen names, randomized contact placeholders, and fictionalized distress messages mapped over genuine OpenStreetMap geographic coordinates in Assam.

### 11.5 Deterministic Primacy & AI Fallback
- RELIEF-OS adheres to the principle of **Deterministic Primacy**:
  - Priority scores, stock balances, and route costs are computed by deterministic algorithms, not generative AI.
  - Generative AI is restricted to summarization, classification, and drafting explanations.
  - If the Gemini API is unreachable, times out, or encounters rate limits, RELIEF-OS falls back seamlessly to deterministic rule-based explanations without interrupting response workflows.

### 11.6 Human-in-the-Loop Safeguard
- Autonomous field dispatch is architecturally impossible in RELIEF-OS.
- Response plans remain in `draft` status until an officer with verified authorization triggers `POST /api/plans/:id/approve`.
- All approval, modification, and rejection decisions are logged permanently in `audit_log`.

---

## 12. Roadmap and Contribution

### 12.1 Project Development Phases
```
Phase 1: Foundation (COMPLETED)
  ├── Monorepo Scaffolding (apps/web, apps/api, packages/shared)
  ├── PostGIS Spatial Database Schema & Spatial Indexes
  ├── Canonical Assam Flood Demo Scenario Dataset
  ├── Command Center UI Foundation & Tactical Shell
  └── Comprehensive Architecture & Developer Documentation (README.md)

Phase 2: Core Intelligence & AI Integration (PLANNED)
  ├── Gemini API 1.5 Pro Natural Language Extraction Pipeline
  ├── Dynamic Citizen Report Ingestion & Spatial Geo-clustering
  ├── Explainable 0–100 Priority Scoring Engine
  ├── Shortage-Aware Greedy Resource Allocation Solver
  └── Interactive Leaflet Command Map with Blocked Road Recalculation

Phase 3: What-If Simulation & Tactical Execution (PLANNED)
  ├── Sandbox What-If Simulation Lab with Side-by-Side Deltas
  ├── Automated Mitigation Recommendations
  ├── Shelter Recommendation Engine (>90% Capacity Alerts)
  └── Role-Based Human Approval Gateway & Dispatch Tracking

Phase 4: National Scale & Multi-Agency Coordination (FUTURE ROADMAP)
  ├── District ➔ State ➔ National Command Center Hierarchy
  ├── Inter-district Cross-depot Supply Redistribution
  └── Multi-lingual Voice & SMS Emergency Intake
```

### 12.2 Contribution Guidelines
We welcome contributions to RELIEF-OS. To maintain mission-critical stability:
1. **Branching Strategy:** Create topic branches off `main` using descriptive prefixes:
   - `feature/` for new capabilities (e.g., `feature/route-engine`)
   - `fix/` for bug fixes (e.g., `fix/postgis-query-index`)
   - `docs/` for documentation updates
2. **Commit Standards:** Write clear, professional commit messages detailing the functional change.
3. **Verification Before PR:** Prior to submitting a pull request, ensure all checks pass cleanly:
   ```bash
   npm run lint
   npm run typecheck
   npm run test
   npm run build
   ```
4. **No Secrets:** Ensure zero API keys, personal credentials, or un-sanitized private data are included in pull requests.

---

## 13. License and Acknowledgments

- **License:** Proprietary / Hackathon Project — All rights reserved.
- **Geographic Data:** &copy; [OpenStreetMap](https://www.openstreetmap.org/) contributors.
- **Scenario Inspiration:** Built using publicly available disaster management frameworks from the Assam State Disaster Management Authority (ASDMA) and National Disaster Management Authority (NDMA) guidelines for educational, humanitarian research, and demonstration purposes.
