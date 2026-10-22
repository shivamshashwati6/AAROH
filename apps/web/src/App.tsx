import {
  ShieldAlert,
  AlertTriangle,
  Users,
  Building2,
  Truck,
  FileText,
  Activity,
  CheckCircle2,
  Navigation,
  Compass,
  MapPin,
} from 'lucide-react';
import { CommandMap } from './components/CommandMap';

export function App() {
  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans">
      {/* 1. Top Tactical Navigation Bar */}
      <header className="border-b border-[#1f2e48] bg-[#0d1522]/90 backdrop-blur px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-lg text-white">RELIEF-OS</span>
              <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono">
                PHASE 1 MONOREPO
              </span>
            </div>
            <p className="text-xs text-slate-400">
              AI-Powered Disaster Response & Resource Intelligence Platform
            </p>
          </div>
        </div>

        {/* Persistent Simulated Data Warning Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold tracking-wide uppercase">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            Simulated Data Environment
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Event: Assam Flood (Simulated)
          </div>
        </div>
      </header>

      {/* 2. Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6">
        {/* Hero Tagline & Core Philosophy Banner */}
        <section className="bg-gradient-to-r from-[#0d1522] via-[#131e31] to-[#0d1522] border border-[#1f2e48] rounded-xl p-6 shadow-xl relative overflow-hidden">
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 tracking-wider uppercase bg-blue-500/10 px-2.5 py-1 rounded border border-blue-500/20">
              <Compass className="h-3.5 w-3.5" />
              Decision Engine Core Mandate
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              "It doesn't just show where the disaster is. It decides what should happen next."
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              RELIEF-OS transforms fragmented citizen reports, geospatial infrastructure, and inventory levels
              into prioritized, explainable response plans. It acts as an explainable decision-support engine
              strictly requiring human officer verification and approval before any action is executed.
            </p>
          </div>
        </section>

        {/* Mandatory Human Approval & Decision Support Notice */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-950/30 border border-blue-800/40 text-blue-200 text-xs">
          <ShieldAlert className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-blue-100">Human-In-The-Loop Decision Architecture: </span>
            RELIEF-OS is designed as an operational decision-support tool. Autonomous AI execution is explicitly disabled.
            Every generated response plan (allocations, routes, shelters) must be reviewed, modified if needed, and
            approved by an authorized emergency officer prior to dispatch.
          </div>
        </div>

        {/* 3. Canonical PRD Assam Flood Scenario KPI Summary */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              Canonical Demo Scenario Metrics (Assam Flood PRD)
            </h2>
            <span className="text-xs text-slate-400">Canonical Baseline Data</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Affected People</span>
                <Users className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-white">18,420</div>
              <div className="text-[11px] text-slate-400 mt-1">Total displaced & affected</div>
            </div>

            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Critical Zones</span>
                <AlertTriangle className="h-4 w-4 text-red-400" />
              </div>
              <div className="text-xl font-bold text-red-400">07</div>
              <div className="text-[11px] text-slate-400 mt-1">Priority score &gt;= 85</div>
            </div>

            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Shelters Active</span>
                <Building2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-400">18</div>
              <div className="text-[11px] text-slate-400 mt-1">71% aggregate occupancy</div>
            </div>

            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Relief Centers</span>
                <Building2 className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-xl font-bold text-purple-400">05</div>
              <div className="text-[11px] text-slate-400 mt-1">Operational depots</div>
            </div>

            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Vehicles &amp; Boats</span>
                <Truck className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-400">21</div>
              <div className="text-[11px] text-slate-400 mt-1">In dispatch fleet</div>
            </div>

            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Citizen Reports</span>
                <FileText className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="text-xl font-bold text-cyan-400">1,247</div>
              <div className="text-[11px] text-slate-400 mt-1">Clustered &amp; geo-tagged</div>
            </div>
          </div>
        </section>

        {/* 4. Interactive Tactical Operations Map (Leaflet / OpenStreetMap) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-400" />
              Tactical Operations Map (React-Leaflet + OpenStreetMap)
            </h2>
            <span className="text-xs text-slate-400">Centered on Assam Flood Demo Area</span>
          </div>
          <CommandMap />
        </section>

        {/* 5. Canonical Hero Zone A Spotlight */}
        <section className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2e48] pb-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
              <h2 className="text-lg font-bold text-white">Hero Showcase: Zone A (Barpeta District Hub)</h2>
              <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-mono border border-red-500/40">
                SCORE: 94 / 100 — CRITICAL
              </span>
            </div>
            <span className="text-xs text-slate-400">PRD Canonical Walkthrough Target</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-[#131e31] p-3.5 rounded-lg border border-[#1f2e48] space-y-2">
              <span className="font-semibold text-slate-300 uppercase tracking-wider block">Zone Vital Signs</span>
              <div className="space-y-1.5 text-slate-400">
                <div className="flex justify-between">
                  <span>Affected Population:</span>
                  <span className="font-bold text-white">3,842 residents</span>
                </div>
                <div className="flex justify-between">
                  <span>Food Shortage Gap:</span>
                  <span className="font-bold text-amber-400">72% Critical Deficit</span>
                </div>
                <div className="flex justify-between">
                  <span>Water Shortage Gap:</span>
                  <span className="font-bold text-amber-400">61% Critical Deficit</span>
                </div>
                <div className="flex justify-between">
                  <span>Medical Urgency:</span>
                  <span className="font-bold text-red-400">High (Elderly &amp; Stranded)</span>
                </div>
                <div className="flex justify-between">
                  <span>Nearest Safe Shelter:</span>
                  <span className="font-bold text-slate-200">5.4 km (Shelter B)</span>
                </div>
              </div>
            </div>

            <div className="bg-[#131e31] p-3.5 rounded-lg border border-[#1f2e48] space-y-2">
              <span className="font-semibold text-slate-300 uppercase tracking-wider block">Recommended Dispatch Plan</span>
              <div className="space-y-1.5 text-slate-400">
                <div className="flex justify-between">
                  <span>Rescue Boats:</span>
                  <span className="font-bold text-blue-400">4 Deployable Units</span>
                </div>
                <div className="flex justify-between">
                  <span>Food Relief Kits:</span>
                  <span className="font-bold text-emerald-400">1,200 Kits</span>
                </div>
                <div className="flex justify-between">
                  <span>Potable Water:</span>
                  <span className="font-bold text-cyan-400">800 Units</span>
                </div>
                <div className="flex justify-between">
                  <span>Medical Response Teams:</span>
                  <span className="font-bold text-purple-400">1 Certified Unit</span>
                </div>
                <div className="flex justify-between">
                  <span>Sourced Center:</span>
                  <span className="font-bold text-white">Relief Center #3</span>
                </div>
              </div>
            </div>

            <div className="bg-[#131e31] p-3.5 rounded-lg border border-[#1f2e48] space-y-2">
              <span className="font-semibold text-slate-300 uppercase tracking-wider block flex items-center gap-1.5">
                <Navigation className="h-3.5 w-3.5 text-emerald-400" />
                Disaster-Aware Routing
              </span>
              <div className="space-y-1.5 text-slate-400">
                <div className="p-2 rounded bg-red-950/40 border border-red-800/40 text-red-300 text-[11px]">
                  <strong>Route A (Primary):</strong> Flooded &amp; Inaccessible (Blocked)
                </div>
                <div className="p-2 rounded bg-amber-950/30 border border-amber-800/30 text-amber-300 text-[11px]">
                  <strong>Route B (Secondary):</strong> Partial Waterlogging (Severe Delay)
                </div>
                <div className="p-2 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-[11px]">
                  <strong>Route C (Recommended):</strong> Fully Accessible (Selected, 17 km)
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Phase 1 Monorepo Status Checklist */}
        <section className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            Phase 1 Monorepo Verification Status
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-[#131e31] border border-emerald-500/30 text-emerald-300">
              <div className="font-bold">apps/web</div>
              <div className="text-slate-400 text-[11px] mt-0.5">React + Vite + TS + Tailwind</div>
            </div>
            <div className="p-3 rounded-lg bg-[#131e31] border border-emerald-500/30 text-emerald-300">
              <div className="font-bold">apps/api</div>
              <div className="text-slate-400 text-[11px] mt-0.5">Express + Node + TS + Zod</div>
            </div>
            <div className="p-3 rounded-lg bg-[#131e31] border border-emerald-500/30 text-emerald-300">
              <div className="font-bold">packages/shared</div>
              <div className="text-slate-400 text-[11px] mt-0.5">Core Domain Contracts &amp; Types</div>
            </div>
            <div className="p-3 rounded-lg bg-[#131e31] border border-emerald-500/30 text-emerald-300">
              <div className="font-bold">database/migrations</div>
              <div className="text-slate-400 text-[11px] mt-0.5">PostgreSQL + PostGIS Schema</div>
            </div>
          </div>
        </section>
      </main>

      {/* 6. Footer */}
      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        RELIEF-OS &copy; 2026 — AI-Powered Disaster Response &amp; Resource Intelligence Platform.
        Simulated Data Mode active for demonstration.
      </footer>
    </div>
  );
}

export default App;
