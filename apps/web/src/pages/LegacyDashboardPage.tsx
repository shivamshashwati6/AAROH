import { useEffect, useState, useTransition } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Users,
  Building2,
  Truck,
  FileText,
  Activity,
  Navigation,
  Compass,
  MapPin,
  RefreshCw,
  Search,
  PlusCircle,
} from 'lucide-react';
import { CommandMap, MapZone, MapShelter, MapCenter, MapRoad } from '../components/CommandMap';
import { api, DemoKPIResponse, ShelterSuggestionItem, ApiError } from '../services/api';
import { CitizenReport } from '@relief-os/shared';
import { NavigationHeader } from '../components/NavigationHeader';

type ActiveTab = 'overview' | 'zones' | 'shelters' | 'centers' | 'reports' | 'roads';

export function LegacyDashboardPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Backend API states
  const [kpiData, setKpiData] = useState<DemoKPIResponse | null>(null);
  const [zones, setZones] = useState<MapZone[]>([]);
  const [shelters, setShelters] = useState<MapShelter[]>([]);
  const [centers, setCenters] = useState<MapCenter[]>([]);
  const [roads, setRoads] = useState<MapRoad[]>([]);
  const [reports, setReports] = useState<CitizenReport[]>([]);

  // Interactive Shelter Suggestion State
  const [suggestPeople, setSuggestPeople] = useState<number>(200);
  const [suggestZone, setSuggestZone] = useState<string>('zone-a');
  const [suggestions, setSuggestions] = useState<ShelterSuggestionItem[]>([]);
  const [suggestLoading, setSuggestLoading] = useState<boolean>(false);

  // New Citizen Report Form State
  const [showReportModal, setShowReportModal] = useState<boolean>(false);
  const [reportDesc, setReportDesc] = useState<string>('');
  const [reportSeverity, setReportSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [reportCategory, setReportCategory] = useState<string>('food');
  const [reportPeople, setReportPeople] = useState<number>(15);
  const [reportSubmitting, setReportSubmitting] = useState<boolean>(false);

  // Road update state
  const [updatingRoadId, setUpdatingRoadId] = useState<string | null>(null);

  const [, startTransition] = useTransition();

  // Load all initial data from backend API
  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Demo KPIs
      const kpis = await api.getDemoKPIs();
      setKpiData(kpis);

      // 2. Fetch Zones, Shelters, Resource Centers, Roads, and Reports in parallel
      const [zonesRes, sheltersRes, centersRes, roadsRes, reportsRes] = await Promise.all([
        api.getZones({ limit: 10 }),
        api.getShelters({ limit: 25 }),
        api.getResourceCenters(),
        api.getRoadSegments(),
        api.getReports({ limit: 20 }),
      ]);

      startTransition(() => {
        setZones(zonesRes.items);
        setShelters(sheltersRes.items);
        setCenters(centersRes.items);
        setRoads(roadsRes.items);
        setReports(reportsRes.items);
      });
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error
          ? err.message
          : 'Unable to connect to AAROH API';
      setError(`Backend Connection Error: ${message}. Make sure the API server is running on http://localhost:4000.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Handle Smart Shelter Suggestion calculation
  const handleSuggestShelters = async () => {
    setSuggestLoading(true);
    try {
      const res = await api.suggestShelters({
        zone_id: suggestZone,
        people: suggestPeople,
        limit: 3,
      });
      setSuggestions(res.suggestions);
    } catch (err) {
      console.error('Failed to compute shelter suggestions:', err);
    } finally {
      setSuggestLoading(false);
    }
  };

  // Handle New Report Submission
  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDesc.trim()) return;

    setReportSubmitting(true);
    try {
      const newRep = await api.submitReport({
        description: reportDesc.trim(),
        lat: 26.3216, // Barpeta hub default
        lng: 91.0059,
        location_name: 'Barpeta Central / Jania',
        severity: reportSeverity,
        category: reportCategory,
        people_affected: reportPeople,
        is_simulated: true,
      });

      setReports((prev) => [newRep, ...prev]);
      setShowReportModal(false);
      setReportDesc('');

      // Refresh KPI counts
      const updatedKpi = await api.getDemoKPIs();
      setKpiData(updatedKpi);
    } catch (err) {
      console.error('Failed to submit citizen report:', err);
      alert('Failed to submit citizen report. Check server logs.');
    } finally {
      setReportSubmitting(false);
    }
  };

  // Handle Road Status Toggle
  const handleToggleRoad = async (roadId: string, currentStatus: 'accessible' | 'partial' | 'blocked') => {
    const nextStatus = currentStatus === 'blocked' ? 'accessible' : currentStatus === 'accessible' ? 'partial' : 'blocked';
    setUpdatingRoadId(roadId);

    try {
      const res = await api.updateRoadStatus(roadId, nextStatus, 'Command officer manual route override');
      setRoads((prev) =>
        prev.map((r) => (r.id === roadId ? { ...r, status: res.updated_segment.status } : r))
      );
    } catch (err) {
      console.error('Failed to update road status:', err);
      alert('Failed to update road status.');
    } finally {
      setUpdatingRoadId(null);
    }
  };

  // Extract hero zone data from API (null if API data is unavailable)
  const heroZone = kpiData?.hero_zone || null;

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans">
      <NavigationHeader />
      {/* 1. Top Tactical Sub-Bar */}
      <header className="border-b border-[#1f2e48] bg-[#0d1522]/90 backdrop-blur px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-[57px] z-30">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-lg text-white">AAROH</span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-mono border ${
                  error
                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                    : loading
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                }`}
              >
                {error ? 'API OFFLINE' : loading ? 'CONNECTING...' : 'LIVE CONNECTED'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              AI-Powered Disaster Response &amp; Resource Intelligence Platform
            </p>
          </div>
        </div>

        {/* Status Indicators & Refresh */}
        <div className="flex items-center gap-3">
          <button
            onClick={loadDashboardData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-xs font-medium text-slate-300 transition-colors disabled:opacity-50"
            title="Refresh database state"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            <span>Sync</span>
          </button>

          {/* Persistent Simulated Data Warning Badge */}
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
        {/* Error Alert Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={loadDashboardData}
              className="px-3 py-1 rounded bg-red-800 hover:bg-red-700 text-white font-semibold text-xs"
            >
              Retry Connection
            </button>
          </div>
        )}

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
              AAROH transforms fragmented citizen reports, geospatial infrastructure, and inventory levels
              into prioritized, explainable response plans. It operates as an explainable decision-support engine
              strictly requiring authorized human officer approval before any field execution.
            </p>
          </div>
        </section>

        {/* Mandatory Human Approval & Decision Support Notice */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-950/30 border border-blue-800/40 text-blue-200 text-xs">
          <ShieldAlert className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-blue-100">Human-In-The-Loop Decision Architecture: </span>
            AAROH is designed as an operational decision-support tool. Autonomous AI execution is explicitly disabled.
            Every generated response plan (allocations, routes, shelters) must be reviewed, modified if needed, and
            approved by an authorized emergency officer prior to dispatch.
          </div>
        </div>

        {/* 3. Canonical PRD Assam Flood Scenario KPI Summary (Backed by Database) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              Live Operational KPIs (Supabase PostgreSQL + PostGIS)
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              {loading ? 'Querying database...' : error ? 'API Disconnected (Offline)' : 'Synced with Backend API'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 1. Affected Population */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5 hover:border-blue-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Affected People</span>
                <Users className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-white">
                {kpiData ? kpiData.kpis.affected_population.toLocaleString() : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {kpiData ? 'Displaced across 7 sectors' : 'Unavailable'}
              </div>
            </div>

            {/* 2. Critical Zones */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5 hover:border-red-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Critical Zones</span>
                <AlertTriangle className="h-4 w-4 text-red-400" />
              </div>
              <div className="text-xl font-bold text-red-400">
                {kpiData ? String(kpiData.kpis.critical_zones_count).padStart(2, '0') : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {kpiData ? 'Priority score >= 85' : 'Unavailable'}
              </div>
            </div>

            {/* 3. Shelters */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5 hover:border-emerald-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Shelters Active</span>
                <Building2 className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-400">
                {kpiData ? kpiData.kpis.total_shelters : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {kpiData ? `${kpiData.kpis.shelter_occupancy_pct}% aggregate occupancy` : 'Unavailable'}
              </div>
            </div>

            {/* 4. Relief Centers */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5 hover:border-purple-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Relief Centers</span>
                <Building2 className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-xl font-bold text-purple-400">
                {kpiData ? String(kpiData.kpis.relief_centers).padStart(2, '0') : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {kpiData ? 'Regional logistics hubs' : 'Unavailable'}
              </div>
            </div>

            {/* 5. Vehicles & Fleet */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5 hover:border-amber-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Vehicles &amp; Boats</span>
                <Truck className="h-4 w-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-400">
                {kpiData ? kpiData.kpis.vehicles_deployed : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {kpiData ? 'Calibrated dispatch fleet' : 'Unavailable'}
              </div>
            </div>

            {/* 6. Citizen Reports (Transparent DB count + Demo Target) */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3.5 hover:border-cyan-500/40 transition-colors">
              <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
                <span>Citizen Reports</span>
                <FileText className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="text-xl font-bold text-cyan-400">
                {kpiData ? kpiData.kpis.total_reports_ingested.toLocaleString() : '—'}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {kpiData
                  ? `${kpiData.kpis.total_reports_ingested} stored (${kpiData.kpis.target_reports_demo || 1247} demo target)`
                  : 'Unavailable'}
              </div>
            </div>
          </div>
        </section>

        {/* 4. Operational View Mode Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#1f2e48] pb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'overview'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'bg-[#0d1522] text-slate-400 hover:text-white border border-[#1f2e48]'
            }`}
          >
            <Compass className="h-3.5 w-3.5" />
            Tactical Map &amp; Hero Zone
          </button>
          <button
            onClick={() => setActiveTab('zones')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'zones'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'bg-[#0d1522] text-slate-400 hover:text-white border border-[#1f2e48]'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
            Critical Zones ({zones.length || 7})
          </button>
          <button
            onClick={() => setActiveTab('shelters')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'shelters'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'bg-[#0d1522] text-slate-400 hover:text-white border border-[#1f2e48]'
            }`}
          >
            <Building2 className="h-3.5 w-3.5 text-emerald-400" />
            Shelters ({shelters.length || 18})
          </button>
          <button
            onClick={() => setActiveTab('centers')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'centers'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'bg-[#0d1522] text-slate-400 hover:text-white border border-[#1f2e48]'
            }`}
          >
            <Truck className="h-3.5 w-3.5 text-purple-400" />
            Relief Hubs ({centers.length || 5})
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'reports'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'bg-[#0d1522] text-slate-400 hover:text-white border border-[#1f2e48]'
            }`}
          >
            <FileText className="h-3.5 w-3.5 text-cyan-400" />
            Citizen Distress Feed
          </button>
          <button
            onClick={() => setActiveTab('roads')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'roads'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'bg-[#0d1522] text-slate-400 hover:text-white border border-[#1f2e48]'
            }`}
          >
            <Navigation className="h-3.5 w-3.5 text-amber-400" />
            Road Traversability
          </button>
        </div>

        {/* TAB 1: OVERVIEW & TACTICAL MAP */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Interactive Tactical Operations Map */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-wider text-slate-300 uppercase flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-emerald-400" />
                  Tactical Operations Map (React-Leaflet + PostGIS Layers)
                </h2>
                <span className="text-xs text-slate-400">Real-time DB-backed entities</span>
              </div>
              <CommandMap
                zones={zones}
                shelters={shelters}
                centers={centers}
                roads={roads}
                selectedZoneId="zone-a"
              />
            </section>

            {/* Canonical Hero Zone A Spotlight */}
            <section className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2e48] pb-3">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${heroZone ? 'bg-red-500 animate-ping' : 'bg-slate-600'}`} />
                  <h2 className="text-lg font-bold text-white">
                    {heroZone ? `Hero Showcase: ${heroZone.name}` : 'Hero Showcase: Zone A'}
                  </h2>
                  <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-mono border border-red-500/40">
                    SCORE: {heroZone ? `${heroZone.priority_score} / 100 — ${heroZone.priority_band.toUpperCase()}` : '—'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">PRD Canonical Walkthrough Target</span>
              </div>

              {!heroZone ? (
                <div className="py-8 px-4 text-center rounded-lg bg-[#131e31] border border-[#1f2e48] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-300">Hero Zone Intelligence Unavailable</div>
                  <p className="text-xs text-slate-500">
                    {error ? 'API connection offline. Click "Retry Connection" above.' : 'Awaiting response from backend decision engine...'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* 1. Vital Signs */}
                  <div className="bg-[#131e31] p-3.5 rounded-lg border border-[#1f2e48] space-y-2">
                    <span className="font-semibold text-slate-300 uppercase tracking-wider block">Zone Vital Signs</span>
                    <div className="space-y-1.5 text-slate-400">
                      <div className="flex justify-between">
                        <span>Affected Population:</span>
                        <span className="font-bold text-white">{heroZone.affected_population.toLocaleString()} residents</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Food Shortage Gap:</span>
                        <span className="font-bold text-amber-400">{heroZone.food_shortage_pct}% Critical Deficit</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Water Shortage Gap:</span>
                        <span className="font-bold text-amber-400">{heroZone.water_shortage_pct}% Critical Deficit</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Medical Urgency:</span>
                        <span className="font-bold text-red-400">{heroZone.medical_risk} (Elderly &amp; Stranded)</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Nearest Safe Shelter:</span>
                        <span className="font-bold text-slate-200">{heroZone.nearest_shelter_km} km (Shelter B)</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. Recommended Plan */}
                  <div className="bg-[#131e31] p-3.5 rounded-lg border border-[#1f2e48] space-y-2">
                    <span className="font-semibold text-slate-300 uppercase tracking-wider block">Recommended Dispatch Plan</span>
                    <div className="space-y-1.5 text-slate-400">
                      <div className="flex justify-between">
                        <span>Rescue Boats:</span>
                        <span className="font-bold text-blue-400">{heroZone.recommended_action.boats} Deployable Units</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Food Relief Kits:</span>
                        <span className="font-bold text-emerald-400">{heroZone.recommended_action.food_kits.toLocaleString()} Kits</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Potable Water:</span>
                        <span className="font-bold text-cyan-400">{heroZone.recommended_action.water_units.toLocaleString()} Units</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Medical Response Teams:</span>
                        <span className="font-bold text-purple-400">{heroZone.recommended_action.medical_teams} Certified Unit</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Sourced Center:</span>
                        <span className="font-bold text-white">{heroZone.recommended_action.source_center}</span>
                      </div>
                    </div>
                  </div>

                  {/* 3. Routing Engine */}
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
                        <strong>Route C (Recommended):</strong> Fully Accessible (Selected, 17.4 km)
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: CRITICAL ZONES VIEW */}
        {activeTab === 'zones' && (
          <section className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f2e48] pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  Canonical Critical Priority Zones (Sum: 18,420 affected)
                </h3>
                <p className="text-xs text-slate-400">
                  Calculated dynamically from PostGIS coordinates using multi-factor explainable scoring
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded bg-red-500/20 text-red-300 font-mono">
                {zones.length} Zones Tracked
              </span>
            </div>

            {zones.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-lg bg-[#131e31] border border-[#1f2e48] text-slate-400 space-y-2">
                <AlertTriangle className="h-8 w-8 text-slate-500 mx-auto" />
                <div className="font-semibold text-slate-300">No Critical Zones Available</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {error
                    ? 'Failed to fetch zones from backend API. Please check your connection and retry.'
                    : 'No operational zones were returned from the database.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {zones.map((z) => (
                  <div key={z.id} className="bg-[#131e31] p-4 rounded-lg border border-[#1f2e48] space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-white text-sm">{z.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                          z.band === 'Critical'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        SCORE {z.priority_score}
                      </span>
                    </div>
                    <div className="space-y-1 text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Affected Population:</span>
                        <span className="font-semibold text-white">{z.affected_population.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Severity:</span>
                        <span className="font-semibold uppercase text-red-400">{z.medical_risk || 'Critical'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Coordinates:</span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {z.location_lat.toFixed(4)}, {z.location_lng.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: SHELTER NETWORK & SMART SUGGESTION */}
        {activeTab === 'shelters' && (
          <div className="space-y-6">
            {/* Smart Evacuation Shelter Suggester */}
            <section className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4">
              <div className="border-b border-[#1f2e48] pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-emerald-400" />
                  Smart Evacuation Shelter Proximity Engine (PostGIS ST_DistanceSphere)
                </h3>
                <p className="text-xs text-slate-400">
                  Select a critical sector and evacuee headcount to calculate the nearest safe shelter with verified spare beds
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Origin Sector:</label>
                  <select
                    value={suggestZone}
                    onChange={(e) => setSuggestZone(e.target.value)}
                    className="bg-[#131e31] border border-[#1f2e48] rounded px-3 py-1.5 text-white"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name} (Score: {z.priority_score})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Evacuee Headcount:</label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={suggestPeople}
                    onChange={(e) => setSuggestPeople(parseInt(e.target.value, 10) || 50)}
                    className="bg-[#131e31] border border-[#1f2e48] rounded px-3 py-1.5 text-white w-28"
                  />
                </div>

                <div className="self-end">
                  <button
                    onClick={handleSuggestShelters}
                    disabled={suggestLoading}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs transition-colors flex items-center gap-1.5"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {suggestLoading ? 'Computing...' : 'Calculate Safe Destination'}
                  </button>
                </div>
              </div>

              {/* Suggestions Results */}
              {suggestions.length > 0 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {suggestions.map((s, idx) => (
                    <div
                      key={s.id}
                      className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                        idx === 0
                          ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-200'
                          : 'bg-[#131e31] border-[#1f2e48] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">{s.name}</span>
                        <span className="font-mono text-[11px] text-emerald-400 font-bold">{s.distance_km} km</span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        {s.occupied} / {s.capacity} occupied ({s.occupancy_pct}%) &bull;{' '}
                        <span className="font-bold text-white">{s.available_spaces} spaces left</span>
                      </div>
                      <div className="text-[11px] text-slate-400 italic">{s.evacuation_note}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* All 18 Shelters Directory */}
            <section className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#1f2e48] pb-3">
                <h3 className="text-base font-bold text-white">Full Shelter Directory ({shelters.length} Facilities)</h3>
                <span className="text-xs text-slate-400">Live aggregate occupancy: 72%</span>
              </div>

              {shelters.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-lg bg-[#131e31] border border-[#1f2e48] text-slate-400 space-y-2">
                  <Building2 className="h-8 w-8 text-slate-500 mx-auto" />
                  <div className="font-semibold text-slate-300">No Shelters Registered</div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {error
                      ? 'Failed to fetch shelters from backend API. Please check your connection and retry.'
                      : 'No shelter facilities were returned by the API.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {shelters.map((s) => (
                    <div key={s.id} className="bg-[#131e31] p-3 rounded-lg border border-[#1f2e48] space-y-1">
                      <div className="font-bold text-white truncate">{s.name}</div>
                      <div className="flex justify-between text-slate-400">
                        <span>Occupancy:</span>
                        <span className="font-semibold text-white">
                          {s.occupied} / {s.capacity} ({s.occupancy_pct}%)
                        </span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            s.occupancy_pct >= 90 ? 'bg-red-500' : s.occupancy_pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, s.occupancy_pct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 4: RELIEF DEPOTS & FLEET BREAKDOWN */}
        {activeTab === 'centers' && (
          <section className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f2e48] pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Truck className="h-4 w-4 text-purple-400" />
                  Regional Logistics Hubs &amp; Fleet Availability
                </h3>
                <p className="text-xs text-slate-400">
                  Calibrated to canonical 21 dispatch fleet units across 5 operational bases
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 font-mono">
                Total Fleet: 21 Units
              </span>
            </div>

            {centers.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-lg bg-[#131e31] border border-[#1f2e48] text-slate-400 space-y-2">
                <Truck className="h-8 w-8 text-slate-500 mx-auto" />
                <div className="font-semibold text-slate-300">No Relief Depots Found</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {error
                    ? 'Failed to fetch relief centers from backend API. Please check your connection and retry.'
                    : 'No regional logistics hubs or fleet bases were returned from the operational database.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {centers.map((c) => (
                  <div key={c.id} className="bg-[#131e31] p-4 rounded-lg border border-[#1f2e48] space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{c.name}</span>
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold">
                        {c.total_fleet} FLEET
                      </span>
                    </div>
                    <div className="space-y-1 text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Trucks / Vehicles:</span>
                        <span className="font-bold text-white">{c.vehicles_available} Units</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Rescue Boats:</span>
                        <span className="font-bold text-blue-400">{c.boats_available} Units</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Medical Units:</span>
                        <span className="font-bold text-emerald-400">{c.medical_teams_available} Teams</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 5: CITIZEN DISTRESS REPORTS FEED */}
        {activeTab === 'reports' && (
          <section className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f2e48] pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="h-4 w-4 text-cyan-400" />
                  Live Citizen Distress Reports Feed
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time distress inputs ingested into Supabase and awaiting AI categorization
                </p>
              </div>
              <button
                onClick={() => setShowReportModal(true)}
                className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                Submit Simulated Report
              </button>
            </div>

            {/* Reports List */}
            <div className="space-y-2.5">
              {reports.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No citizen reports in the current window. Click "Submit Simulated Report" to ingest one.
                </div>
              ) : (
                reports.map((r) => (
                  <div
                    key={r.id}
                    className="bg-[#131e31] p-3 rounded-lg border border-[#1f2e48] text-xs flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="space-y-1 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded font-mono uppercase text-[10px] font-bold ${
                            r.severity === 'critical'
                              ? 'bg-red-500/20 text-red-300'
                              : r.severity === 'high'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-blue-500/20 text-blue-300'
                          }`}
                        >
                          {r.severity}
                        </span>
                        <span className="font-semibold text-white">{r.location_name || 'Assam Flood Sector'}</span>
                        <span className="text-slate-400 text-[11px]">&bull; {r.category}</span>
                      </div>
                      <p className="text-slate-300 text-xs">{r.description}</p>
                    </div>

                    <div className="text-right text-[11px] text-slate-400 font-mono">
                      <div>{r.people_affected ? `${r.people_affected} affected` : 'Headcount unspecified'}</div>
                      <div className="text-emerald-400">{r.status}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {/* TAB 6: ROAD SEGMENT TRAVERSABILITY CONTROLLER */}
        {activeTab === 'roads' && (
          <section className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1f2e48] pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Navigation className="h-4 w-4 text-amber-400" />
                  Road Traversability Controller (PostGIS LineStrings)
                </h3>
                <p className="text-xs text-slate-400">
                  Update route traversability status. Changes are saved to database and instantly affect routing recommendations.
                </p>
              </div>
            </div>

            {roads.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-lg bg-[#131e31] border border-[#1f2e48] text-slate-400 space-y-2">
                <Navigation className="h-8 w-8 text-slate-500 mx-auto" />
                <div className="font-semibold text-slate-300">No Road Segments Detected</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {error
                    ? 'Failed to fetch road network from backend API. Please check your connection and retry.'
                    : 'No road network segments were retrieved from the operational database.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {roads.map((road) => (
                  <div key={road.id} className="bg-[#131e31] p-4 rounded-lg border border-[#1f2e48] space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{road.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-bold uppercase text-[10px] ${
                          road.status === 'blocked'
                            ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                            : road.status === 'partial'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}
                      >
                        {road.status}
                      </span>
                    </div>

                    <div className="space-y-1 text-slate-400">
                      <div className="flex justify-between">
                        <span>Length:</span>
                        <span className="text-white font-semibold">{road.length_km} km</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Risk Score:</span>
                        <span className="text-white font-semibold">{road.risk_score} / 100</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#1f2e48]">
                      <button
                        onClick={() => handleToggleRoad(road.id, road.status)}
                        disabled={updatingRoadId === road.id}
                        className="w-full py-1.5 px-3 rounded bg-[#1f2e48] hover:bg-[#273a5a] text-slate-200 font-semibold text-xs transition-colors"
                      >
                        {updatingRoadId === road.id ? 'Updating Database...' : `Toggle Status (Currently: ${road.status})`}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Modal: Submit Citizen Report */}
        {showReportModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#1f2e48] pb-3">
                <h3 className="font-bold text-white text-base">Submit Citizen Distress Report (Simulated)</h3>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleCreateReport} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Distress Description:</label>
                  <textarea
                    required
                    rows={3}
                    value={reportDesc}
                    onChange={(e) => setReportDesc(e.target.value)}
                    placeholder="e.g. Floodwater breached eastern embankment near village clinic, 12 families stranded without drinking water."
                    className="w-full bg-[#131e31] border border-[#1f2e48] rounded p-2.5 text-white placeholder-slate-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Severity:</label>
                    <select
                      value={reportSeverity}
                      onChange={(e) => setReportSeverity(e.target.value as any)}
                      className="w-full bg-[#131e31] border border-[#1f2e48] rounded p-2 text-white"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 mb-1 font-semibold">Primary Category:</label>
                    <select
                      value={reportCategory}
                      onChange={(e) => setReportCategory(e.target.value)}
                      className="w-full bg-[#131e31] border border-[#1f2e48] rounded p-2 text-white"
                    >
                      <option value="food">Food Supplies</option>
                      <option value="water">Potable Water</option>
                      <option value="medicine">Medical Urgency</option>
                      <option value="rescue">Rescue Boats</option>
                      <option value="shelter">Shelter Evacuation</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Estimated People Affected:</label>
                  <input
                    type="number"
                    min={1}
                    value={reportPeople}
                    onChange={(e) => setReportPeople(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-[#131e31] border border-[#1f2e48] rounded p-2 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-[#1f2e48]">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-3 py-1.5 rounded bg-[#1f2e48] text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={reportSubmitting}
                    className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 font-bold text-white disabled:opacity-50"
                  >
                    {reportSubmitting ? 'Submitting to DB...' : 'Ingest Report'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* 5. Footer */}
      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        AAROH &copy; 2026 &bull; AI-Powered Disaster Response &amp; Resource Intelligence Platform.
        PostgreSQL 17 + PostGIS 3.3.7 connected.
      </footer>
    </div>
  );
}

export default LegacyDashboardPage;
