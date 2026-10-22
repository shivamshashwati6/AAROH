# RELIEF-OS Architecture & Decision Engine Pipeline

## System Philosophy
RELIEF-OS is not a passive monitoring dashboard or an unconstrained conversational chatbot. It is a **Disaster Response Decision Engine** built around a deterministic core with AI-assisted situational extraction and explanation.

> **Tagline:** *"It doesn't just show where the disaster is. It decides what should happen next."*

---

## 1. Core Architecture Flow

```
+---------------------------------------------------------------------------------+
|                                 DATA INGESTION                                  |
|  - Citizen Reports (Form/API)  - Road Status  - Shelter Capacity  - Inventory   |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                       AI SITUATION ANALYSIS (Gemini API)                        |
|  - Unstructured Text Extraction -> Structured JSON (Type, Severity, Needs)     |
|  - Schema Validation & Strict Sanitization (Prompt injection defense)           |
|  - Fallback: Pre-cached / Deterministic templates if API is unreachable         |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                     AFFECTED ZONE DETECTION & CLUSTERING                        |
|  - Geo-clustering of reports into operational zones                             |
|  - Aggregation: Affected Population, Severity, Medical Risk, Accessibility     |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                    EXPLAINABLE PRIORITY ENGINE (0 - 100)                        |
|  Score = w1*Pop + w2*Severity + w3*Medical + w4*Shortage + w5*Access + w6*Vuln  |
|  - Configurable weights (Admin settings)                                        |
|  - Banding: Critical (>=85), High (70-84), Medium (50-69), Low (<50)           |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                         RESOURCE DEMAND & ALLOCATION                            |
|  - Deterministic Demand Calculation (Population * Daily Needs * Duration)       |
|  - Greedy priority-ordered allocation respecting stock, vehicles, and distance  |
|  - Honest shortage reporting (Never over-promises when depots run dry)          |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                       DISASTER-AWARE ROUTE OPTIMIZATION                         |
|  - Road network graph with live status: Accessible, Partial, Blocked            |
|  - Cost = Distance + Road Risk + Accessibility Penalty                          |
|  - Automatic recalculation to alternative routes when primary roads flood       |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                       SHELTER ALLOCATION & SUGGESTION                           |
|  - Recommends shelters with active capacity; flags shelters >90% occupancy     |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                         WHAT-IF SIMULATION ENGINE                               |
|  - Operates on immutable state copies; never alters live operational data       |
|  - Scenario testing: Remove vehicles, reduce stock, close shelters, block roads|
|  - Instant side-by-side delta view with mitigation recommendations              |
+---------------------------------------------------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                     MANDATORY HUMAN APPROVAL GATEWAY                            |
|  - AI & algorithms generate draft recommendations with plain-language reasons   |
|  - Actions: [ APPROVE ]  |  [ MODIFY ]  |  [ REJECT ]                           |
|  - Response execution locked until authorized officer sign-off                  |
|  - Full audit trail recorded in audit_log                                       |
+---------------------------------------------------------------------------------+
```

---

## 2. Key Safeguards & Principles
1. **Decision Support, Not Autonomous Action:** RELIEF-OS never executes field dispatches automatically.
2. **Deterministic Source of Truth:** Resource quotas and route costs are calculated deterministically. AI explains and summarizes, but cannot invent stock.
3. **Simulated Data Transparency:** All synthetic demo records are strictly tagged `is_simulated = true` and rendered with persistent UI badges.
