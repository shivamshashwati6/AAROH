import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  MapPin,
  FileText,
  Cpu,
  Users,
  Compass,
  Radio,
  ChevronRight,
  Menu,
  X,
  Lock,
  Building2,
  Warehouse,
} from 'lucide-react';

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200 selection:bg-cyan-500 selection:text-black">
      {/* ----------------------------------------------------------------------- */}
      {/* TOP EMERGENCY ALERT BANNER                                             */}
      {/* ----------------------------------------------------------------------- */}
      <aside aria-label="Emergency notice" className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2 text-center text-xs text-amber-300">
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-semibold">Immediate flood or disaster emergency?</span>
          <span>You do not need to log in to request rescue or report distress.</span>
          <Link
            to="/report"
            className="font-bold underline text-amber-200 hover:text-white inline-flex items-center gap-1 transition"
          >
            Submit an Emergency Report &rarr;
          </Link>
        </div>
      </aside>

      {/* ----------------------------------------------------------------------- */}
      {/* NAVBAR                                                                  */}
      {/* ----------------------------------------------------------------------- */}
      <header className="sticky top-0 z-50 bg-[#070b12]/90 backdrop-blur-md border-b border-[#1f2e48]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-950/50 group-hover:shadow-cyan-500/20 transition">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white block leading-none">
                RELIEF<span className="text-cyan-400">-OS</span>
              </span>
              <span className="text-[10px] text-slate-400 tracking-wider uppercase block font-medium mt-0.5">
                Disaster Intelligence Platform
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
            <a href="#overview" className="hover:text-cyan-400 transition">
              Overview
            </a>
            <a href="#capabilities" className="hover:text-cyan-400 transition">
              Capabilities
            </a>
            <a href="#how-it-works" className="hover:text-cyan-400 transition">
              How It Works
            </a>
            <a href="#workspaces" className="hover:text-cyan-400 transition">
              Workspaces
            </a>
            <Link to="/report" className="text-amber-400 hover:text-amber-300 transition flex items-center gap-1">
              <Radio className="w-3.5 h-3.5" />
              <span>Public Reports</span>
            </Link>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              to="/signup"
              className="text-xs font-semibold px-4 py-2 rounded-lg text-slate-300 hover:text-white border border-[#1f2e48] hover:border-slate-500 transition"
            >
              Citizen Sign Up
            </Link>
            <Link
              to="/login"
              className="text-xs font-bold px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950 transition flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-[#131e31] transition"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-[#1f2e48] bg-[#0d1522] px-4 py-4 space-y-3">
            <a
              href="#overview"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-300 hover:text-cyan-400"
            >
              Overview
            </a>
            <a
              href="#capabilities"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-300 hover:text-cyan-400"
            >
              Capabilities
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-300 hover:text-cyan-400"
            >
              How It Works
            </a>
            <a
              href="#workspaces"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-slate-300 hover:text-cyan-400"
            >
              Workspaces
            </a>
            <Link
              to="/report"
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-amber-400 hover:text-amber-300"
            >
              Submit Emergency Report
            </Link>
            <div className="pt-3 border-t border-[#1f2e48] flex gap-2">
              <Link
                to="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="flex-1 text-center text-xs font-semibold py-2.5 rounded-lg border border-[#1f2e48] text-slate-300"
              >
                Sign Up
              </Link>
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="flex-1 text-center text-xs font-bold py-2.5 rounded-lg bg-cyan-600 text-white"
              >
                Sign In
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* ----------------------------------------------------------------------- */}
      {/* HERO SECTION                                                            */}
      {/* ----------------------------------------------------------------------- */}
      <section
        id="overview"
        className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-[#1f2e48]"
      >
        {/* Background flood operation image with multi-stage gradient overlay */}
        <div className="absolute inset-0 z-0">
          <img
            src="/images/flood-hero.jpg"
            alt="Aerial perspective of humanitarian flood disaster response embankment and staged relief operations"
            className="w-full h-full object-cover object-center filter saturate-75 brightness-75 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#070b12] via-[#070b12]/85 to-[#070b12]/80" />
          <div className="absolute inset-0 bg-radial-gradient from-transparent via-[#070b12]/50 to-[#070b12]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* Platform category pill */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/70 border border-cyan-800/60 text-cyan-300 text-xs font-semibold tracking-wider uppercase mb-6 shadow-lg shadow-cyan-950/50">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>AI-Powered Disaster Response &amp; Resource Intelligence</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-tight sm:leading-none mb-6">
            From Disaster Data to <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300">
              Decisive Action.
            </span>
          </h1>

          {/* Tagline & Subheading */}
          <p className="text-lg sm:text-xl text-cyan-200 font-semibold mb-3 tracking-wide">
            Turning Disaster Data Into Actionable Intelligence.
          </p>

          <p className="text-sm sm:text-base text-slate-300 max-w-3xl mx-auto leading-relaxed mb-8">
            RELIEF-OS aggregates community distress reports, pinpoints high-priority cut-off zones with
            transparent multi-factor scoring, calculates critical food, potable water, boat, and medical demand,
            and coordinates regional resource allocation for response teams.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-xl shadow-cyan-950/60 transition group cursor-pointer"
            >
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
            </Link>

            <a
              href="#capabilities"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#0d1522]/90 hover:bg-[#131e31] text-slate-200 font-semibold text-sm border border-[#1f2e48] hover:border-slate-400 transition"
            >
              <span>Explore Capabilities</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </a>
          </div>

          {/* Live System Operational Context Badge Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto pt-6 border-t border-[#1f2e48]/80 text-left">
            <div className="bg-[#0d1522]/80 border border-[#1f2e48] p-3 rounded-xl backdrop-blur">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Incident Scenario</span>
              <span className="text-sm font-bold text-white block mt-0.5">Assam Floods 2026</span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                Active Operations
              </span>
            </div>

            <div className="bg-[#0d1522]/80 border border-[#1f2e48] p-3 rounded-xl backdrop-blur">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Tracked Population</span>
              <span className="text-sm font-bold text-cyan-400 block mt-0.5">18,420 Residents</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Across 7 Priority Zones</span>
            </div>

            <div className="bg-[#0d1522]/80 border border-[#1f2e48] p-3 rounded-xl backdrop-blur">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Response Fleet</span>
              <span className="text-sm font-bold text-white block mt-0.5">21 Available Units</span>
              <span className="text-[10px] text-slate-400 mt-1 block">13 Trucks &bull; 8 Boats</span>
            </div>

            <div className="bg-[#0d1522]/80 border border-[#1f2e48] p-3 rounded-xl backdrop-blur">
              <span className="text-[11px] text-slate-400 uppercase font-semibold block">Human Decision Safety</span>
              <span className="text-sm font-bold text-emerald-400 block mt-0.5">100% In-The-Loop</span>
              <span className="text-[10px] text-slate-400 mt-1 block">Zero Autonomous Dispatch</span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------------- */}
      {/* CAPABILITIES SECTION                                                    */}
      {/* ----------------------------------------------------------------------- */}
      <section id="capabilities" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest block mb-2">
            System Capabilities
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-4">
            Ground-Truth Intelligence for Disaster Operations
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Every capability in RELIEF-OS is deterministically modeled, backed by PostGIS spatial queries,
            and engineered to provide actionable visibility without inventing data or replacing human command.
          </p>
        </div>

        {/* 4 Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Emergency Reports */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 sm:p-8 hover:border-cyan-500/40 transition group shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400 mb-6 group-hover:scale-105 transition">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center justify-between">
              <span>1. Emergency Reports Processing</span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[#131e31] text-cyan-300 border border-[#1f2e48]">
                Public Access
              </span>
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Collects community distress calls with PostGIS GPS coordinates, severity ratings, people affected,
              and urgent medical flags. Citizens can report immediately without account friction, feeding real-time
              data into operations.
            </p>
            <div className="pt-4 border-t border-[#1f2e48] flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Geospatial Coordinates</span>
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Medical Urgency Tagging</span>
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Zero-Barrier Reporting</span>
            </div>
          </div>

          {/* Card 2: Priority Zones */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 sm:p-8 hover:border-cyan-500/40 transition group shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-blue-950/80 border border-blue-800/50 flex items-center justify-center text-blue-400 mb-6 group-hover:scale-105 transition">
              <MapPin className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center justify-between">
              <span>2. Explainable Priority Zones</span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[#131e31] text-blue-300 border border-[#1f2e48]">
                Multi-Factor
              </span>
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Ranks flood-impacted sectors with a transparent 0–100 priority score. The engine weighs population
              impact, food and potable water shortage percentages, road accessibility impairment, and social
              vulnerability index into clear priority bands.
            </p>
            <div className="pt-4 border-t border-[#1f2e48] flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Auditable Breakdown</span>
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Accessibility Weighting</span>
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Critical Zone Focus</span>
            </div>
          </div>

          {/* Card 3: Resource Planning */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 sm:p-8 hover:border-cyan-500/40 transition group shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-indigo-950/80 border border-indigo-800/50 flex items-center justify-center text-indigo-400 mb-6 group-hover:scale-105 transition">
              <Compass className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center justify-between">
              <span>3. Deterministic Resource Planning</span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[#131e31] text-indigo-300 border border-[#1f2e48]">
                Decision Support
              </span>
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Calculates emergency food ration kits, potable water units, rescue boats, and certified medical teams
              over a standard 3-day horizon. Evaluates live stocks across 5 regional bases and recommends optimal
              sources without taking autonomous action.
            </p>
            <div className="pt-4 border-t border-[#1f2e48] flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Nearest-Depot Matching</span>
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Deficit Gap Tracking</span>
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Multi-Base Sourcing</span>
            </div>
          </div>

          {/* Card 4: What-If Simulation */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 sm:p-8 hover:border-cyan-500/40 transition group shadow-xl">
            <div className="w-12 h-12 rounded-xl bg-purple-950/80 border border-purple-800/50 flex items-center justify-center text-purple-400 mb-6 group-hover:scale-105 transition">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center justify-between">
              <span>4. What-If Simulation Sandbox</span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[#131e31] text-purple-300 border border-[#1f2e48]">
                Non-Mutating
              </span>
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Stress-test operational plans against simulated disruptions: road washouts, vehicle losses, or warehouse
              depletions. Compares baseline and scenario outcomes side-by-side with zero mutation to live operational data.
            </p>
            <div className="pt-4 border-t border-[#1f2e48] flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Compound Disruptions</span>
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Live Inventory Safety</span>
              <span className="bg-[#131e31] px-2.5 py-1 rounded-md text-slate-300">Audit-Logged Runs</span>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------------- */}
      {/* HOW IT WORKS SECTION                                                    */}
      {/* ----------------------------------------------------------------------- */}
      <section id="how-it-works" className="py-20 bg-[#0d1522]/60 border-y border-[#1f2e48]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest block mb-2">
              Operational Sequence
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-4">
              Structured Workflow for Emergency Coordinators
            </h2>
            <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
              From the first community distress call to the commander’s final approval, RELIEF-OS ensures
              every step is grounded in verified data.
            </p>
          </div>

          {/* 4 Steps Sequence */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {/* Step 1 */}
            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-6 relative">
              <div className="text-3xl font-black text-cyan-500/30 mb-3">01</div>
              <h3 className="text-base font-bold text-white mb-2">Reports &amp; Ingest</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Citizens submit distress calls with location, family count, and urgent medical flags. Field teams
                log infrastructure updates.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-6 relative">
              <div className="text-3xl font-black text-blue-500/30 mb-3">02</div>
              <h3 className="text-base font-bold text-white mb-2">Prioritize Urgency</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                The platform scores each zone using population impact, flood damage, shortage percentages, and
                road cut-offs.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-6 relative">
              <div className="text-3xl font-black text-indigo-500/30 mb-3">03</div>
              <h3 className="text-base font-bold text-white mb-2">Plan Resources</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                The allocation engine calculates 3-day supply requirements and maps candidate regional hubs by
                spatial proximity.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-6 relative">
              <div className="text-3xl font-black text-purple-500/30 mb-3">04</div>
              <h3 className="text-base font-bold text-white mb-2">Human Review</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Commanders review recommendations and test What-If scenarios. Authorization is required before
                plans are acted upon.
              </p>
            </div>
          </div>

          {/* Human-in-the-Loop Callout */}
          <div className="mt-12 bg-gradient-to-r from-emerald-950/40 via-[#0d1522] to-cyan-950/40 border border-emerald-500/30 rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="w-12 h-12 rounded-xl bg-emerald-900/40 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div className="flex-1">
              <h4 className="text-base font-bold text-white mb-1">
                Human-in-the-Loop Safety Governance
              </h4>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                RELIEF-OS provides decision support and predictive recommendations. The platform strictly does
                <strong> not autonomously dispatch vehicles</strong>, decrement live warehouse stocks, or alter
                field resources without explicit human authorization.
              </p>
            </div>
            <Link
              to="/login"
              className="text-xs font-bold px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 transition"
            >
              Sign In to Command Center
            </Link>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------------- */}
      {/* WORKSPACES SECTION                                                      */}
      {/* ----------------------------------------------------------------------- */}
      <section id="workspaces" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest block mb-2">
            Role-Aware Entry
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-4">
            Specialized Workspaces for Every Responder
          </h2>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            When you sign in, RELIEF-OS verifies your role and routes you directly to your operational workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Workspace 1: Citizen Portal */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 flex flex-col justify-between hover:border-slate-400 transition shadow-lg">
            <div>
              <div className="w-10 h-10 rounded-lg bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 mb-4">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Citizen Portal</h3>
              <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider block mb-3">
                Route: /citizen
              </span>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Public emergency alerts, shelter occupancy and distance estimates, personal distress report
                tracking, and emergency hotlines.
              </p>
              <ul className="text-xs text-slate-300 space-y-1.5 mb-6">
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Public Shelter Directory &amp; Occupancy</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Emergency Distress Report Submission</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  <span>Verified Public Safety Advisories</span>
                </li>
              </ul>
            </div>
            <div className="space-y-2 mt-4">
              <Link
                to="/signup"
                className="w-full block text-center text-xs font-semibold py-2.5 rounded-lg border border-[#1f2e48] hover:border-cyan-500 text-slate-300 hover:text-white transition"
              >
                Sign Up as Citizen
              </Link>
              <p className="text-center text-xs text-slate-400">
                Already have an account?{' '}
                <Link to="/login" className="text-cyan-400 hover:text-cyan-300 font-semibold underline">
                  Sign in
                </Link>
              </p>
            </div>
          </div>

          {/* Workspace 2: Command Center */}
          <div className="bg-[#0d1522] border border-cyan-500/40 rounded-2xl p-6 flex flex-col justify-between relative shadow-xl shadow-cyan-950/40">
            <div className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-cyan-500 text-black text-[10px] font-black uppercase tracking-wider">
              High Authority
            </div>
            <div>
              <div className="w-10 h-10 rounded-lg bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400 mb-4">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Command Center</h3>
              <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider block mb-3">
                Route: /command
              </span>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                District-level operations overview, live zone priority map, response plan approval workflow,
                and What-If crisis simulation engine.
              </p>
              <ul className="text-xs text-slate-300 space-y-1.5 mb-6">
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Regional KPIs &amp; Zone Priority Ranking</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>Response Plan Recommendation Approval</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span>What-If Crisis Simulation Sandbox</span>
                </li>
              </ul>
            </div>
            <Link
              to="/login"
              className="w-full text-center text-xs font-bold py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 transition shadow-md shadow-cyan-950"
            >
              Sign In to Command Center
            </Link>
          </div>

          {/* Workspace 3: Department Operations */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 flex flex-col justify-between hover:border-slate-400 transition shadow-lg">
            <div>
              <div className="w-10 h-10 rounded-lg bg-indigo-950 border border-indigo-800 flex items-center justify-center text-indigo-400 mb-4">
                <Warehouse className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">Department Operations</h3>
              <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider block mb-3">
                Route: /department
              </span>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                Dedicated interfaces for Health, Supply, and Rescue units to monitor domain supplies, available
                teams, and update road conditions.
              </p>
              <ul className="text-xs text-slate-300 space-y-1.5 mb-6">
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Health: Medical Teams &amp; Triage Priority</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Supply: Food Kits &amp; Water Unit Warehouses</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>Rescue: Boats &amp; Road Condition Updates</span>
                </li>
              </ul>
            </div>
            <Link
              to="/login"
              className="w-full text-center text-xs font-semibold py-2.5 rounded-lg border border-[#1f2e48] hover:border-indigo-500 text-slate-300 hover:text-white transition"
            >
              Sign In to Department
            </Link>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-8 bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 flex items-center gap-3 text-xs text-slate-400">
          <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            <strong className="text-slate-300">Role-Guarded Access:</strong> Operational and administrative
            accounts are provisioned directly by disaster administration. Public signup is strictly restricted to
            citizen accounts.
          </span>
        </div>
      </section>

      {/* ----------------------------------------------------------------------- */}
      {/* FOOTER                                                                  */}
      {/* ----------------------------------------------------------------------- */}
      <footer className="border-t border-[#1f2e48] bg-[#070b12] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            {/* Col 1: Brand & Purpose */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <span className="text-lg font-black tracking-tight text-white">
                  RELIEF<span className="text-cyan-400">-OS</span>
                </span>
              </div>
              <p className="text-xs text-cyan-300 font-medium mb-3">
                Turning Disaster Data Into Actionable Intelligence.
              </p>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                An AI-powered disaster response and resource intelligence platform designed to support emergency
                commanders with deterministic demand estimation, multi-factor zone priority scoring, and What-If crisis
                simulations.
              </p>
            </div>

            {/* Col 2: Platform Links */}
            <div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-3">
                Navigation
              </span>
              <ul className="text-xs space-y-2 text-slate-400">
                <li>
                  <a href="#overview" className="hover:text-cyan-400 transition">
                    Overview
                  </a>
                </li>
                <li>
                  <a href="#capabilities" className="hover:text-cyan-400 transition">
                    Capabilities
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="hover:text-cyan-400 transition">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#workspaces" className="hover:text-cyan-400 transition">
                    Workspaces
                  </a>
                </li>
                <li>
                  <Link to="/report" className="hover:text-amber-400 transition">
                    Emergency Reports
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="hover:text-cyan-400 transition">
                    Operational Map
                  </Link>
                </li>
              </ul>
            </div>

            {/* Col 3: Secure Entry */}
            <div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-3">
                Authentication
              </span>
              <ul className="text-xs space-y-2 text-slate-400">
                <li>
                  <Link to="/login" className="hover:text-cyan-400 transition">
                    Sign In
                  </Link>
                </li>
                <li>
                  <Link to="/signup" className="hover:text-cyan-400 transition">
                    Citizen Sign Up
                  </Link>
                </li>
                <li>
                  <Link to="/report" className="hover:text-amber-400 transition">
                    Public Distress Form
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-[#1f2e48] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>RELIEF-OS &bull; National Disaster Response &amp; Resource Intelligence Platform &copy; 2026.</p>
            <p className="text-[11px] text-slate-500">
              Deterministic PostGIS Models &bull; Human-in-the-Loop Operational Safety
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
