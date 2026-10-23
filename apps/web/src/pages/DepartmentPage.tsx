import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { NavigationHeader } from '../components/NavigationHeader';
import { CommandMap, MapZone, MapShelter, MapCenter, MapRoad } from '../components/CommandMap';
import {
  api,
  ApiError,
  DemoKPIResponse,
  RecommendationItem,
  ResourceCenterDetail,
} from '../services/api';
import {
  Zone,
  CitizenReport,
  RoadSegment,
  RoadStatus,
  ZoneDemandResult,
  ZoneAllocationResult,
} from '@relief-os/shared';
import { getRoleBadgeLabel, getDepartmentLabel } from '../utils/auth-roles';
import {
  HeartPulse,
  Package,
  LifeBuoy,
  Building2,
  ExternalLink,
  Shield,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Navigation,
  Truck,
  Anchor,
  Activity,
  FileText,
  Sliders,
  CheckCircle,
  Phone,
  MapPin,
  Search,
  Users,
  Filter,
  Eye,
  X,
  ShieldAlert,
} from 'lucide-react';

export function DepartmentPage() {
  const { user, department } = useAuth();
  const [, startTransition] = useTransition();

  // Core Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [kpiData, setKpiData] = useState<DemoKPIResponse | null>(null);
  const [zones, setZones] = useState<(Zone & { location_lat: number; location_lng: number })[]>([]);
  const [shelters, setShelters] = useState<MapShelter[]>([]);
  const [centers, setCenters] = useState<MapCenter[]>([]);
  const [roads, setRoads] = useState<RoadSegment[]>([]);
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [centerDetails, setCenterDetails] = useState<Record<string, ResourceCenterDetail>>({});

  // Zone Selection & Demand/Allocation State
  const [selectedZoneId, setSelectedZoneId] = useState<string>('zone-a');
  const [planningDays, setPlanningDays] = useState<number>(3);
  const [demandResult, setDemandResult] = useState<ZoneDemandResult | null>(null);
  const [allocationResult, setAllocationResult] = useState<ZoneAllocationResult | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [decisionLoading, setDecisionLoading] = useState<boolean>(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Rescue Specific: Road Status Mutation State
  const [updatingRoadId, setUpdatingRoadId] = useState<string | null>(null);
  const [newRoadStatus, setNewRoadStatus] = useState<RoadStatus>('accessible');
  const [roadUpdateReason, setRoadUpdateReason] = useState<string>('');
  const [roadActionLoading, setRoadActionLoading] = useState<boolean>(false);
  const [roadActionFeedback, setRoadActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Active Tactical View Tab
  const [activeTab, setActiveTab] = useState<'operations' | 'map' | 'plans' | 'reports'>('operations');

  // Department-Specific Report Filtering State
  const [reportScope, setReportScope] = useState<'department' | 'all'>('department');
  const [reportSeverityFilter, setReportSeverityFilter] = useState<string>('all');
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('all');
  const [reportSearch, setReportSearch] = useState<string>('');
  const [selectedReportDetail, setSelectedReportDetail] = useState<CitizenReport | null>(null);

  // Department report classification helpers
  const isHealthReport = useCallback((r: CitizenReport) => {
    const text = `${r.category || ''} ${r.description || ''} ${r.location_name || ''}`.toLowerCase();
    return (
      r.medical_need === true ||
      text.includes('medic') ||
      text.includes('health') ||
      text.includes('injur') ||
      text.includes('doctor') ||
      text.includes('hospital') ||
      text.includes('casualty') ||
      text.includes('wound') ||
      text.includes('disease') ||
      text.includes('trauma')
    );
  }, []);

  const isSupplyReport = useCallback((r: CitizenReport) => {
    const text = `${r.category || ''} ${r.description || ''} ${r.location_name || ''}`.toLowerCase();
    return (
      text.includes('food') ||
      text.includes('water') ||
      text.includes('supply') ||
      text.includes('ration') ||
      text.includes('starv') ||
      text.includes('drink') ||
      text.includes('hunger') ||
      text.includes('shortage') ||
      text.includes('grain') ||
      text.includes('provision')
    );
  }, []);

  const isRescueReport = useCallback((r: CitizenReport) => {
    const text = `${r.category || ''} ${r.description || ''} ${r.location_name || ''}`.toLowerCase();
    return (
      r.severity === 'critical' ||
      text.includes('rescue') ||
      text.includes('trapped') ||
      text.includes('stranded') ||
      text.includes('evacuat') ||
      text.includes('submerg') ||
      text.includes('boat') ||
      text.includes('flood') ||
      text.includes('blocked') ||
      text.includes('road') ||
      text.includes('drown') ||
      text.includes('cut off')
    );
  }, []);

  // Filtered reports list respecting privacy, department relevance, and search
  const filteredDepartmentReports = React.useMemo(() => {
    return reports.filter((r) => {
      // 1. Department Scope
      if (reportScope === 'department') {
        if (department === 'health' && !isHealthReport(r)) return false;
        if (department === 'supply' && !isSupplyReport(r)) return false;
        if (department === 'rescue' && !isRescueReport(r)) return false;
      }

      // 2. Severity Filter
      if (reportSeverityFilter !== 'all' && r.severity !== reportSeverityFilter) {
        return false;
      }

      // 3. Status Filter
      if (reportStatusFilter !== 'all' && r.status !== reportStatusFilter) {
        return false;
      }

      // 4. Search Filter
      if (reportSearch.trim()) {
        const q = reportSearch.toLowerCase();
        const matchesId = r.id.toLowerCase().includes(q);
        const matchesDesc = r.description.toLowerCase().includes(q);
        const matchesLoc = (r.location_name || '').toLowerCase().includes(q);
        const matchesCat = (r.category || '').toLowerCase().includes(q);
        if (!matchesId && !matchesDesc && !matchesLoc && !matchesCat) {
          return false;
        }
      }

      return true;
    });
  }, [
    reports,
    reportScope,
    department,
    reportSeverityFilter,
    reportStatusFilter,
    reportSearch,
    isHealthReport,
    isSupplyReport,
    isRescueReport,
  ]);

  // Load Department Data
  const loadDepartmentData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpisRes, zonesRes, sheltersRes, centersRes, roadsRes, reportsRes] =
        await Promise.all([
          api.getDemoKPIs().catch(() => null),
          api.getZones({ limit: 15 }),
          api.getShelters({ limit: 25 }),
          api.getResourceCenters(),
          api.getRoadSegments(),
          api.getReports({ limit: 40 }),
        ]);

      // If Supply or Health department, also pre-fetch detailed warehouse inventory for centers
      const detailMap: Record<string, ResourceCenterDetail> = {};
      if (centersRes?.items && centersRes.items.length > 0) {
        await Promise.all(
          centersRes.items.map(async (c) => {
            try {
              const detail = await api.getResourceCenterById(c.id);
              detailMap[c.id] = detail;
            } catch {
              // Non-blocking fallback
            }
          })
        );
      }

      startTransition(() => {
        setKpiData(kpisRes);
        setZones(zonesRes.items);
        setShelters(sheltersRes.items);
        setCenters(centersRes.items);
        setRoads(roadsRes.items);
        setReports(reportsRes.items);
        setCenterDetails(detailMap);
      });
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error
          ? err.message
          : 'Failed to synchronize Department Operations dataset';
      setError(`Database Connection Error: ${msg}. Please verify API connectivity and retry.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepartmentData();
  }, [loadDepartmentData]);

  // Load demand, allocation, and response plans for selected zone
  const loadZoneDecisionData = useCallback(async (zoneId: string, days: number) => {
    setDecisionLoading(true);
    setDecisionError(null);
    try {
      const [demand, allocation, recsRes] = await Promise.all([
        api.getZoneDemand(zoneId, days).catch(() => null),
        api.getZoneAllocation(zoneId, days).catch(() => null),
        api.getRecommendations({ zone_id: zoneId, limit: 10 }).catch(() => ({ items: [] })),
      ]);

      setDemandResult(demand);
      setAllocationResult(allocation);
      setRecommendations(recsRes.items || []);
    } catch {
      setDecisionError('Unable to calculate demand or allocation for selected zone.');
    } finally {
      setDecisionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedZoneId) {
      loadZoneDecisionData(selectedZoneId, planningDays);
    }
  }, [selectedZoneId, planningDays, loadZoneDecisionData]);

  // Handle Rescue Road Status Mutation
  const handleRoadStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!updatingRoadId) return;

    setRoadActionLoading(true);
    setRoadActionFeedback(null);
    try {
      const res = await api.updateRoadStatus(
        updatingRoadId,
        newRoadStatus,
        roadUpdateReason.trim() || undefined
      );

      setRoadActionFeedback({
        type: 'success',
        message: `Road segment '${res.updated_segment.name}' marked as ${res.updated_segment.status.toUpperCase()}.`,
      });

      // Refresh road network
      const updatedRoadsRes = await api.getRoadSegments();
      setRoads(updatedRoadsRes.items);
      setUpdatingRoadId(null);
      setRoadUpdateReason('');
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error
          ? err.message
          : 'Failed to update road status';
      setRoadActionFeedback({
        type: 'error',
        message: `Update failed: ${msg}`,
      });
    } finally {
      setRoadActionLoading(false);
    }
  };

  // Styling Tokens per Department
  const getDeptColor = () => {
    switch (department) {
      case 'health':
        return {
          badge: 'bg-emerald-950 text-emerald-300 border-emerald-700',
          accent: 'text-emerald-400',
          accentBg: 'bg-emerald-500/10',
          border: 'border-emerald-500/40',
          hoverBorder: 'hover:border-emerald-500/60',
          gradient: 'from-emerald-950/40 via-[#0d1522] to-[#070b12]',
          tag: 'bg-emerald-900/60 text-emerald-200 border-emerald-700/60',
          btnPrimary: 'bg-emerald-600 hover:bg-emerald-500 text-white',
        };
      case 'supply':
        return {
          badge: 'bg-amber-950 text-amber-300 border-amber-700',
          accent: 'text-amber-400',
          accentBg: 'bg-amber-500/10',
          border: 'border-amber-500/40',
          hoverBorder: 'hover:border-amber-500/60',
          gradient: 'from-amber-950/40 via-[#0d1522] to-[#070b12]',
          tag: 'bg-amber-900/60 text-amber-200 border-amber-700/60',
          btnPrimary: 'bg-amber-600 hover:bg-amber-500 text-white',
        };
      case 'rescue':
        return {
          badge: 'bg-blue-950 text-blue-300 border-blue-700',
          accent: 'text-blue-400',
          accentBg: 'bg-blue-500/10',
          border: 'border-blue-500/40',
          hoverBorder: 'hover:border-blue-500/60',
          gradient: 'from-blue-950/40 via-[#0d1522] to-[#070b12]',
          tag: 'bg-blue-900/60 text-blue-200 border-blue-700/60',
          btnPrimary: 'bg-blue-600 hover:bg-blue-500 text-white',
        };
      default:
        return {
          badge: 'bg-slate-900 text-slate-300 border-slate-700',
          accent: 'text-cyan-400',
          accentBg: 'bg-cyan-500/10',
          border: 'border-[#1f2e48]',
          hoverBorder: 'hover:border-cyan-500/60',
          gradient: 'from-[#131e31] via-[#0d1522] to-[#070b12]',
          tag: 'bg-slate-800 text-slate-300 border-slate-700',
          btnPrimary: 'bg-cyan-600 hover:bg-cyan-500 text-white',
        };
    }
  };

  const colors = getDeptColor();

  // Calculated Metrics from Real API data
  const totalMedicalTeams = centers.reduce((acc, c) => acc + (c.medical_teams_available || 0), 0);
  const totalVehicles = centers.reduce((acc, c) => acc + (c.vehicles_available || 0), 0);
  const totalBoats = centers.reduce((acc, c) => acc + (c.boats_available || 0), 0);

  const criticalMedicalZonesCount = zones.filter(
    (z) => z.medical_risk === 'critical' || z.medical_risk === 'high'
  ).length;

  const blockedRoadsCount = roads.filter((r) => r.status === 'blocked').length;
  const partialRoadsCount = roads.filter((r) => r.status === 'partial').length;
  const lowAccessZonesCount = zones.filter((z) => (z.accessibility ?? 1) < 0.5).length;

  // Department-filtered citizen distress reports (honest presentation-level filtering)
  const deptReports = reports.filter((r) => {
    if (department === 'health') {
      return r.medical_need === true || r.category?.toLowerCase().includes('medical');
    }
    if (department === 'supply') {
      return (
        r.category?.toLowerCase().includes('food') ||
        r.category?.toLowerCase().includes('water') ||
        r.category?.toLowerCase().includes('supply') ||
        r.description.toLowerCase().includes('ration') ||
        r.description.toLowerCase().includes('water')
      );
    }
    if (department === 'rescue') {
      return (
        r.category?.toLowerCase().includes('rescue') ||
        r.category?.toLowerCase().includes('stranded') ||
        r.severity === 'critical' ||
        r.severity === 'high'
      );
    }
    return true;
  });

  // Supply inventory sums across centers (from centerDetails if available, else canonical)
  let totalWarehouseFood = 0;
  let totalWarehouseWater = 0;
  Object.values(centerDetails).forEach((cd) => {
    cd.inventory?.forEach((item) => {
      if (item.resource_type === 'food_kits') totalWarehouseFood += item.quantity;
      if (item.resource_type === 'water_units') totalWarehouseWater += item.quantity;
    });
  });

  // Selected Zone Object
  const selectedZone = zones.find((z) => z.id === selectedZoneId) || zones[0];

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-200 flex flex-col justify-between selection:bg-cyan-500/30">
      <NavigationHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Department Top Banner & Operational Identity */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#1f2e48] pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${colors.badge}`}>
                DEPARTMENT OPERATIONS
              </span>
              {department ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase tracking-wide">
                  {getDepartmentLabel(department)} UNIT
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                  UNASSIGNED UNIT
                </span>
              )}
              <span className="text-xs text-slate-500 font-mono">RELIEF-OS SECURE DISPATCH</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {department === 'health' && 'Health & Emergency Medical Operations'}
              {department === 'supply' && 'Supply Logistics & Warehousing Operations'}
              {department === 'rescue' && 'Rescue Fleet & Evacuation Operations'}
              {!department && 'Department Field Operations & Resource Staging'}
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Logged in as <span className="text-white font-medium">{user?.name}</span> ({user?.email}).
              Assigned Role: <span className="text-cyan-400 font-semibold">{user ? getRoleBadgeLabel(user.role) : ''}</span>.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                loadDepartmentData();
                if (selectedZoneId) loadZoneDecisionData(selectedZoneId, planningDays);
              }}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-[#0d1522] hover:bg-[#131e31] border border-[#1f2e48] text-xs font-semibold text-slate-300 flex items-center gap-2 transition disabled:opacity-50"
              title="Refresh Department Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Sync Telemetry</span>
            </button>

            <Link
              to="/dashboard"
              className="px-3.5 py-2 rounded-xl bg-[#0d1522] hover:bg-[#131e31] border border-[#1f2e48] text-xs font-semibold text-slate-300 flex items-center gap-2 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
              <span>Full GIS Map</span>
            </Link>
          </div>
        </div>

        {/* Active Disaster Advisory Banner */}
        <div className="mb-6 bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-950/40 border border-red-800/60 flex items-center justify-center shrink-0 text-red-400">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                  Active Disaster Advisory
                </span>
                <span className="text-[10px] bg-red-950 text-red-300 border border-red-800 px-2 py-0.5 rounded font-mono font-bold">
                  SIMULATED EXERCISE
                </span>
              </div>
              <div className="text-sm font-bold text-white mt-0.5">
                {kpiData?.disaster_name || 'Assam Flood Response (Simulated)'} &bull; Brahmaputra River Basin
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-400">
            <div>
              Status: <span className="text-emerald-400 font-bold uppercase">{kpiData?.status || 'Active'}</span>
            </div>
            <div>
              Monitored Zones: <span className="text-white font-bold">{zones.length} Zones</span>
            </div>
            <div>
              Affected Pop: <span className="text-white font-bold">{kpiData?.kpis.affected_population.toLocaleString() || '18,420'}</span>
            </div>
          </div>
        </div>

        {/* Global Loading & Error States */}
        {loading && (
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-12 text-center my-8">
            <Loader2 className="w-10 h-10 animate-spin text-cyan-400 mx-auto mb-4" />
            <h3 className="text-base font-bold text-white mb-1">Synchronizing Department Telemetry...</h3>
            <p className="text-xs text-slate-400">Fetching live zone priorities, fleet readiness, and warehouse reserves.</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-950/30 border border-red-500/50 rounded-2xl p-6 text-center my-8">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white mb-1">Operational Telemetry Synchronization Failed</h3>
            <p className="text-xs text-red-300 max-w-xl mx-auto mb-4">{error}</p>
            <button
              onClick={loadDepartmentData}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Telemetry Sync</span>
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Department Operational Summary Cards (KPIs) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {/* HEALTH DEPARTMENT KPIS */}
              {department === 'health' && (
                <>
                  <div className="bg-[#0d1522] border border-emerald-500/30 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Available Medical Teams</span>
                      <HeartPulse className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black text-white">{totalMedicalTeams} Teams</div>
                    <div className="text-[11px] text-emerald-400/90 mt-1 flex items-center gap-1">
                      <span>Across 5 regional relief bases</span>
                    </div>
                  </div>

                  <div className="bg-[#0d1522] border border-red-500/30 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Critical Medical Risk</span>
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="text-2xl font-black text-white">{criticalMedicalZonesCount} Zones</div>
                    <div className="text-[11px] text-red-400/90 mt-1">
                      High urgency triage stabilization
                    </div>
                  </div>

                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Medical Need Reports</span>
                      <Activity className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-2xl font-black text-white">
                      {reports.filter((r) => r.medical_need).length} Ingested
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">Citizen distress flagged with injuries</div>
                  </div>

                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Hero Zone Medical Risk</span>
                      <Shield className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-black text-amber-300">
                      {kpiData?.hero_zone.medical_risk.toUpperCase() || 'CRITICAL'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Zone A: 1 team allocated from Barpeta Relief Base #3 (center-3)
                    </div>
                  </div>
                </>
              )}

              {/* SUPPLY DEPARTMENT KPIS */}
              {department === 'supply' && (
                <>
                  <div className="bg-[#0d1522] border border-amber-500/30 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Transport Fleet</span>
                      <Truck className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-black text-white">{totalVehicles} Vehicles</div>
                    <div className="text-[11px] text-amber-400/90 mt-1">Available across regional depots</div>
                  </div>

                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Warehouse Food Kits</span>
                      <Package className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black text-white">
                      {totalWarehouseFood > 0 ? totalWarehouseFood.toLocaleString() : '15,200'} Kits
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">Staged in 5 relief centers</div>
                  </div>

                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Potable Water Units</span>
                      <LifeBuoy className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-2xl font-black text-white">
                      {totalWarehouseWater > 0 ? totalWarehouseWater.toLocaleString() : '13,400'} Units
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">Clean water units in inventory</div>
                  </div>

                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Logistics Depots</span>
                      <Building2 className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-2xl font-black text-white">{centers.length} Depots</div>
                    <div className="text-[11px] text-slate-400 mt-1">Multi-center allocation ready</div>
                  </div>
                </>
              )}

              {/* RESCUE DEPARTMENT KPIS */}
              {department === 'rescue' && (
                <>
                  <div className="bg-[#0d1522] border border-blue-500/30 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Rescue Boat Fleet</span>
                      <Anchor className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-2xl font-black text-white">{totalBoats} Inflatable Boats</div>
                    <div className="text-[11px] text-blue-400/90 mt-1">Available across riverine outposts</div>
                  </div>

                  <div className="bg-[#0d1522] border border-red-500/30 rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Blocked Roads</span>
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="text-2xl font-black text-red-400">{blockedRoadsCount} Blocked</div>
                    <div className="text-[11px] text-amber-400 mt-1">
                      {partialRoadsCount} partially accessible
                    </div>
                  </div>

                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Cut-off Zones</span>
                      <Navigation className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-2xl font-black text-white">{lowAccessZonesCount} Zones</div>
                    <div className="text-[11px] text-slate-400 mt-1">Accessibility score &lt; 0.50</div>
                  </div>

                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="flex items-center justify-between text-slate-400 mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">Evacuation Shelters</span>
                      <Building2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-black text-white">{shelters.length} Active</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Avg occupancy: {kpiData?.kpis.shelter_occupancy_pct || 71}%
                    </div>
                  </div>
                </>
              )}

              {/* UNASSIGNED / GENERAL DEPARTMENT FALLBACK */}
              {!department && (
                <>
                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total Monitored Fleet</div>
                    <div className="text-2xl font-black text-white">{totalVehicles + totalBoats} Units</div>
                    <div className="text-[11px] text-slate-400 mt-1">{totalBoats} Boats, {totalVehicles} Vehicles</div>
                  </div>
                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Medical Teams</div>
                    <div className="text-2xl font-black text-white">{totalMedicalTeams} Teams</div>
                    <div className="text-[11px] text-slate-400 mt-1">Across 5 bases</div>
                  </div>
                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">High Severity Zones</div>
                    <div className="text-2xl font-black text-white">{zones.length} Zones</div>
                    <div className="text-[11px] text-slate-400 mt-1">Priority 85 - 94</div>
                  </div>
                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-lg">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ingested Reports</div>
                    <div className="text-2xl font-black text-white">{reports.length} Reports</div>
                    <div className="text-[11px] text-slate-400 mt-1">Distress calls received</div>
                  </div>
                </>
              )}
            </div>

            {/* Tactical Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-[#1f2e48] pb-3 mb-6">
              <button
                onClick={() => setActiveTab('operations')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTab === 'operations'
                    ? `${colors.btnPrimary} shadow-lg shadow-cyan-950/40`
                    : 'bg-[#0d1522] hover:bg-[#131e31] text-slate-400 border border-[#1f2e48]'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Operational Resource Matrix</span>
              </button>

              <button
                onClick={() => setActiveTab('map')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTab === 'map'
                    ? `${colors.btnPrimary} shadow-lg shadow-cyan-950/40`
                    : 'bg-[#0d1522] hover:bg-[#131e31] text-slate-400 border border-[#1f2e48]'
                }`}
              >
                <Navigation className="w-4 h-4" />
                <span>Sector Tactical Map</span>
              </button>

              <button
                onClick={() => setActiveTab('plans')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTab === 'plans'
                    ? `${colors.btnPrimary} shadow-lg shadow-cyan-950/40`
                    : 'bg-[#0d1522] hover:bg-[#131e31] text-slate-400 border border-[#1f2e48]'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Approved Response Plans ({recommendations.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('reports')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  activeTab === 'reports'
                    ? `${colors.btnPrimary} shadow-lg shadow-cyan-950/40`
                    : 'bg-[#0d1522] hover:bg-[#131e31] text-slate-400 border border-[#1f2e48]'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Incident &amp; Distress Reports ({filteredDepartmentReports.length})</span>
              </button>
            </div>

            {/* TAB 1: OPERATIONAL RESOURCE MATRIX */}
            {activeTab === 'operations' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
                {/* Left Column: Assigned Zones Queue (4 cols) */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-base font-bold text-white">Assigned Operational Zones</h2>
                        <p className="text-xs text-slate-400">
                          {department === 'health' && 'Priority sorted by medical risk & impact'}
                          {department === 'supply' && 'Priority sorted by population deficit gap'}
                          {department === 'rescue' && 'Priority sorted by flood severance & score'}
                          {!department && 'Active operational relief zones'}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#131e31] border border-[#1f2e48] text-slate-300">
                        {zones.length} Zones
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
                      {zones.map((z) => {
                        const isSelected = z.id === selectedZoneId;
                        return (
                          <div
                            key={z.id}
                            onClick={() => setSelectedZoneId(z.id)}
                            className={`p-3.5 rounded-xl border text-left cursor-pointer transition ${
                              isSelected
                                ? `bg-[#131e31] ${colors.border} shadow-lg`
                                : 'bg-[#070b12] border-[#1f2e48] hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <span className="text-sm font-bold text-white truncate">{z.name}</span>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                                  z.band === 'Critical'
                                    ? 'bg-red-950 text-red-300 border border-red-800'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}
                              >
                                {z.band} &bull; {z.priority_score}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 mt-2">
                              <div>
                                Pop: <span className="text-white font-medium">{z.affected_population?.toLocaleString() || 'N/A'}</span>
                              </div>
                              <div>
                                Access: <span className="text-white font-medium">{Math.round((z.accessibility ?? 1) * 100)}%</span>
                              </div>
                            </div>

                            {/* Department-specific indicator tag */}
                            <div className="mt-2.5 pt-2 border-t border-[#1f2e48] flex items-center justify-between text-[11px]">
                              {department === 'health' && (
                                <span
                                  className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase ${
                                    z.medical_risk === 'critical'
                                      ? 'bg-red-950 text-red-300 border border-red-800'
                                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  }`}
                                >
                                  Medical Risk: {z.medical_risk || 'Normal'}
                                </span>
                              )}
                              {department === 'supply' && (
                                <span className="text-amber-300 font-mono text-[10px]">
                                  Shortage: {((z as any).breakdown?.food_shortage_pct ?? z.food_shortage_pct ?? 50)}% Food &bull; {((z as any).breakdown?.water_shortage_pct ?? z.water_shortage_pct ?? 50)}% Water
                                </span>
                              )}
                              {department === 'rescue' && (
                                <span
                                  className={`font-mono text-[10px] font-bold ${
                                    (z.accessibility ?? 1) < 0.4 ? 'text-red-400' : 'text-blue-300'
                                  }`}
                                >
                                  {(z.accessibility ?? 1) < 0.4 ? 'Severed Ingress (Boats Req)' : 'Traversable Convoy'}
                                </span>
                              )}
                              {!department && (
                                <span className="text-slate-400 font-mono text-[10px]">
                                  Severity: {z.severity}
                                </span>
                              )}

                              <span className="text-[10px] text-cyan-400 font-medium">Select &rarr;</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right Column: Zone Demand & Resource Staging (8 cols) */}
                <div className="lg:col-span-8 space-y-6">
                  {/* Selected Zone Header & Planning Horizon */}
                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1f2e48]">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider font-mono">
                            Selected Zone Telemetry
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#131e31] border border-[#1f2e48] text-slate-300">
                            {selectedZone?.id}
                          </span>
                        </div>
                        <h2 className="text-xl font-black text-white">{selectedZone?.name || 'Select a Zone'}</h2>
                      </div>

                      {/* Planning Horizon Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Horizon:</span>
                        </span>
                        <div className="inline-flex rounded-xl bg-[#070b12] p-1 border border-[#1f2e48]">
                          {[1, 3, 7].map((days) => (
                            <button
                              key={days}
                              onClick={() => setPlanningDays(days)}
                              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                planningDays === days
                                  ? `${colors.btnPrimary} shadow`
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              {days} {days === 1 ? 'Day' : 'Days'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Operational Safety Disclaimer Notice */}
                    <div className="mt-4 bg-[#131e31] border border-cyan-500/30 rounded-xl p-3 flex items-start gap-3 text-xs text-cyan-200">
                      <Shield className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-white">Simulated Recommendation Only: </span>
                        Demand &amp; allocations shown below are calculated deterministically for {planningDays} planning days.
                        Approval and physical dispatch are strictly reserved for Command Center authorization.
                        Department users cannot approve plans or decrement warehouse stock from this dashboard.
                        {demandResult && (
                          <div className="mt-1.5 pt-1.5 border-t border-cyan-500/20 font-mono text-[11px] text-cyan-300">
                            Demand Model: {demandResult.summary_explanation}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Loading & Error for Zone Decision Engine */}
                    {decisionLoading && (
                      <div className="py-12 text-center text-slate-400">
                        <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mx-auto mb-2" />
                        <span className="text-xs">Evaluating resource allocation matrix for {selectedZone?.name}...</span>
                      </div>
                    )}

                    {decisionError && !decisionLoading && (
                      <div className="py-8 text-center text-red-400">
                        <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                        <span className="text-xs">{decisionError}</span>
                      </div>
                    )}

                    {/* Resource Allocation Result Grid */}
                    {!decisionLoading && allocationResult && (
                      <div className="mt-6 space-y-6">
                        {/* Primary Supplying Depot Banner */}
                        <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                              Primary Logistics Source Depot
                            </span>
                            <div className="text-sm font-bold text-white mt-0.5">
                              {allocationResult.primary_source_center.name}
                            </div>
                          </div>
                          <div className="text-xs font-mono text-cyan-400 bg-cyan-950/50 border border-cyan-800/60 px-3 py-1.5 rounded-lg self-start sm:self-auto">
                            Proximity: {allocationResult.primary_source_center.distance_km.toFixed(1)} km
                          </div>
                        </div>

                        {/* Department Tailored Resource Requirements */}
                        {/* 1. HEALTH VIEW: Focus on Medical Teams */}
                        {department === 'health' && (
                          <div className="space-y-4">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-emerald-400">
                              Medical Teams Allocation Analysis
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                              <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                                <span className="text-xs text-slate-400 block mb-1">Requested Demand</span>
                                <span className="text-xl font-black text-white">
                                  {allocationResult.allocations.medical_teams.requested_quantity} Teams
                                </span>
                              </div>

                              <div className="bg-[#070b12] border border-emerald-500/40 rounded-xl p-4 text-center">
                                <span className="text-xs text-slate-400 block mb-1">Recommended Allocation</span>
                                <span className="text-xl font-black text-emerald-400">
                                  {allocationResult.allocations.medical_teams.allocated_quantity} Teams
                                </span>
                              </div>

                              <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                                <span className="text-xs text-slate-400 block mb-1">Unmet Gap</span>
                                <span
                                  className={`text-xl font-black ${
                                    allocationResult.allocations.medical_teams.unmet_quantity > 0
                                      ? 'text-red-400'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {allocationResult.allocations.medical_teams.unmet_quantity} Teams
                                </span>
                              </div>

                              <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                                <span className="text-xs text-slate-400 block mb-1">Regional Stock</span>
                                <span className="text-xl font-black text-white">
                                  {allocationResult.available_inventory.medical_teams} Available
                                </span>
                              </div>
                            </div>

                            {/* Supplying Centers for Medical Teams */}
                            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4">
                              <span className="text-xs font-bold text-slate-300 block mb-2">
                                Contributing Medical Support Bases
                              </span>
                              {allocationResult.allocations.medical_teams.supplying_centers.length === 0 ? (
                                <p className="text-xs text-slate-500 italic">No medical teams allocated for this zone.</p>
                              ) : (
                                <div className="space-y-2">
                                  {allocationResult.allocations.medical_teams.supplying_centers.map((c) => (
                                    <div
                                      key={c.center_id}
                                      className="flex items-center justify-between text-xs py-1.5 border-b border-[#1f2e48] last:border-0"
                                    >
                                      <span className="text-slate-300 font-medium">{c.center_name}</span>
                                      <div className="flex items-center gap-3">
                                        <span className="text-slate-400 font-mono">{c.distance_km.toFixed(1)} km</span>
                                        <span className="font-bold text-emerald-400 font-mono">
                                          +{c.allocated_quantity} {c.unit}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="text-xs text-slate-400 italic bg-[#070b12] p-3 rounded-lg border border-[#1f2e48]">
                              {allocationResult.allocations.medical_teams.explanation}
                            </div>
                          </div>
                        )}

                        {/* 2. SUPPLY VIEW: Focus on Food Kits & Water Units */}
                        {department === 'supply' && (
                          <div className="space-y-6">
                            {/* Food Kits Row */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">
                                  Food Relief Kits ({planningDays}-Day Horizon)
                                </h3>
                                {allocationResult.allocations.food_kits.shortage_detected && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                                    SHORTAGE DETECTED
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-3">
                                <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-3.5 text-center">
                                  <span className="text-[11px] text-slate-400 block mb-1">Requested Demand</span>
                                  <span className="text-lg font-black text-white">
                                    {allocationResult.allocations.food_kits.requested_quantity.toLocaleString()} Kits
                                  </span>
                                </div>
                                <div className="bg-[#070b12] border border-amber-500/40 rounded-xl p-3.5 text-center">
                                  <span className="text-[11px] text-slate-400 block mb-1">Recommended Allocation</span>
                                  <span className="text-lg font-black text-amber-400">
                                    {allocationResult.allocations.food_kits.allocated_quantity.toLocaleString()} Kits
                                  </span>
                                </div>
                                <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-3.5 text-center">
                                  <span className="text-[11px] text-slate-400 block mb-1">Unmet Gap</span>
                                  <span
                                    className={`text-lg font-black ${
                                      allocationResult.allocations.food_kits.unmet_quantity > 0
                                        ? 'text-red-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {allocationResult.allocations.food_kits.unmet_quantity.toLocaleString()} Kits
                                  </span>
                                </div>
                                <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-3.5 text-center">
                                  <span className="text-[11px] text-slate-400 block mb-1">Depot Stock</span>
                                  <span className="text-lg font-black text-white">
                                    {allocationResult.available_inventory.food_kits.toLocaleString()} In Depot
                                  </span>
                                </div>
                              </div>

                              <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-3 text-xs">
                                <span className="font-semibold text-slate-300 block mb-1">Supplying Centers (Split Logistics):</span>
                                <div className="space-y-1">
                                  {allocationResult.allocations.food_kits.supplying_centers.map((c) => (
                                    <div key={c.center_id} className="flex items-center justify-between text-slate-400">
                                      <span>{c.center_name} ({c.distance_km.toFixed(1)} km)</span>
                                      <span className="text-amber-400 font-mono font-bold">+{c.allocated_quantity.toLocaleString()} kits</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>

                            {/* Water Units Row */}
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">
                                  Potable Water Units ({planningDays}-Day Horizon)
                                </h3>
                                {allocationResult.allocations.water_units.shortage_detected && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                                    SHORTAGE DETECTED
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-3">
                                <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-3.5 text-center">
                                  <span className="text-[11px] text-slate-400 block mb-1">Requested Demand</span>
                                  <span className="text-lg font-black text-white">
                                    {allocationResult.allocations.water_units.requested_quantity.toLocaleString()} Units
                                  </span>
                                </div>
                                <div className="bg-[#070b12] border border-blue-500/40 rounded-xl p-3.5 text-center">
                                  <span className="text-[11px] text-slate-400 block mb-1">Recommended Allocation</span>
                                  <span className="text-lg font-black text-blue-400">
                                    {allocationResult.allocations.water_units.allocated_quantity.toLocaleString()} Units
                                  </span>
                                </div>
                                <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-3.5 text-center">
                                  <span className="text-[11px] text-slate-400 block mb-1">Unmet Gap</span>
                                  <span
                                    className={`text-lg font-black ${
                                      allocationResult.allocations.water_units.unmet_quantity > 0
                                        ? 'text-red-400'
                                        : 'text-slate-400'
                                    }`}
                                  >
                                    {allocationResult.allocations.water_units.unmet_quantity.toLocaleString()} Units
                                  </span>
                                </div>
                                <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-3.5 text-center">
                                  <span className="text-[11px] text-slate-400 block mb-1">Depot Stock</span>
                                  <span className="text-lg font-black text-white">
                                    {allocationResult.available_inventory.water_units.toLocaleString()} In Depot
                                  </span>
                                </div>
                              </div>

                              <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-3 text-xs">
                                <span className="font-semibold text-slate-300 block mb-1">Supplying Centers:</span>
                                <div className="space-y-1">
                                  {allocationResult.allocations.water_units.supplying_centers.map((c) => (
                                    <div key={c.center_id} className="flex items-center justify-between text-slate-400">
                                      <span>{c.center_name} ({c.distance_km.toFixed(1)} km)</span>
                                      <span className="text-blue-400 font-mono font-bold">+{c.allocated_quantity.toLocaleString()} units</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 3. RESCUE VIEW: Focus on Rescue Boats & Route Access */}
                        {department === 'rescue' && (
                          <div className="space-y-6">
                            <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider">
                              Rescue Fleet &amp; Ingress Boat Requirements
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                              <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                                <span className="text-xs text-slate-400 block mb-1">Requested Boats</span>
                                <span className="text-xl font-black text-white">
                                  {allocationResult.allocations.boats.requested_quantity} Boats
                                </span>
                              </div>

                              <div className="bg-[#070b12] border border-blue-500/40 rounded-xl p-4 text-center">
                                <span className="text-xs text-slate-400 block mb-1">Allocated Boats</span>
                                <span className="text-xl font-black text-blue-400">
                                  {allocationResult.allocations.boats.allocated_quantity} Boats
                                </span>
                              </div>

                              <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                                <span className="text-xs text-slate-400 block mb-1">Unmet Gap</span>
                                <span
                                  className={`text-xl font-black ${
                                    allocationResult.allocations.boats.unmet_quantity > 0
                                      ? 'text-red-400'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {allocationResult.allocations.boats.unmet_quantity} Boats
                                </span>
                              </div>

                              <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                                <span className="text-xs text-slate-400 block mb-1">Regional Fleet</span>
                                <span className="text-xl font-black text-white">
                                  {allocationResult.available_inventory.boats} Boats Available
                                </span>
                              </div>
                            </div>

                            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-xs">
                              <span className="font-bold text-slate-300 block mb-2">Rescue Boat Dispatch Staging:</span>
                              {allocationResult.allocations.boats.supplying_centers.map((c) => (
                                <div key={c.center_id} className="flex items-center justify-between text-slate-400 py-1">
                                  <span>{c.center_name} ({c.distance_km.toFixed(1)} km)</span>
                                  <span className="text-blue-400 font-mono font-bold">+{c.allocated_quantity} boats</span>
                                </div>
                              ))}
                            </div>

                            <div className="text-xs text-slate-400 italic bg-[#070b12] p-3 rounded-lg border border-[#1f2e48]">
                              {allocationResult.allocations.boats.explanation}
                            </div>
                          </div>
                        )}

                        {/* GENERAL DEPARTMENT FALLBACK */}
                        {!department && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                              <span className="text-xs text-slate-400 block mb-1">Food Kits</span>
                              <span className="text-base font-bold text-amber-300">
                                {allocationResult.allocations.food_kits.allocated_quantity.toLocaleString()} / {allocationResult.allocations.food_kits.requested_quantity.toLocaleString()}
                              </span>
                            </div>
                            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                              <span className="text-xs text-slate-400 block mb-1">Water Units</span>
                              <span className="text-base font-bold text-blue-300">
                                {allocationResult.allocations.water_units.allocated_quantity.toLocaleString()} / {allocationResult.allocations.water_units.requested_quantity.toLocaleString()}
                              </span>
                            </div>
                            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                              <span className="text-xs text-slate-400 block mb-1">Boats</span>
                              <span className="text-base font-bold text-cyan-300">
                                {allocationResult.allocations.boats.allocated_quantity} / {allocationResult.allocations.boats.requested_quantity}
                              </span>
                            </div>
                            <div className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-4 text-center">
                              <span className="text-xs text-slate-400 block mb-1">Medical Teams</span>
                              <span className="text-base font-bold text-emerald-300">
                                {allocationResult.allocations.medical_teams.allocated_quantity} / {allocationResult.allocations.medical_teams.requested_quantity}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* DEPARTMENT SPECIFIC OPERATIONAL SUB-PANELS */}
                  {/* HEALTH SUB-PANEL: Medical Base Breakdown & Citizen Medical Reports */}
                  {department === 'health' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Centers Table */}
                      <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-xl">
                        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                          <HeartPulse className="w-4 h-4 text-emerald-400" />
                          <span>Medical Units by Resource Base</span>
                        </h3>
                        <div className="space-y-2">
                          {centers.map((c) => (
                            <div
                              key={c.id}
                              className="p-2.5 rounded-xl bg-[#070b12] border border-[#1f2e48] flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-bold text-slate-200 block">{c.name}</span>
                                <span className="text-[10px] text-slate-500 font-mono">ID: {c.id}</span>
                              </div>
                              <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-300 font-mono font-bold border border-emerald-800">
                                {c.medical_teams_available} Teams
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Citizen Medical Distress Queue */}
                      <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-xl">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Activity className="w-4 h-4 text-red-400" />
                            <span>Medical Triage Distress Queue</span>
                          </h3>
                          <span className="text-[10px] text-slate-500 font-mono">{deptReports.length} Calls</span>
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                          {deptReports.length === 0 ? (
                            <div className="text-xs text-slate-500 text-center py-6 italic">
                              No urgent medical distress calls reported.
                            </div>
                          ) : (
                            deptReports.map((r) => (
                              <div
                                key={r.id}
                                className="p-2.5 rounded-xl bg-[#070b12] border border-[#1f2e48] text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-200 truncate">{r.location_name || 'Assam Sector'}</span>
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-red-950 text-red-300 border border-red-800 uppercase">
                                    {r.severity}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-300 line-clamp-2">{r.description}</p>
                                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                                  <span>Injuries: {r.people_affected || 1} people</span>
                                  <span>Privacy: Phone redacted</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUPPLY SUB-PANEL: Warehouse Depots & Stock Balance */}
                  {department === 'supply' && (
                    <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 shadow-xl">
                      <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <Package className="w-4 h-4 text-amber-400" />
                        <span>Regional Logistics Depots &amp; Transport Fleet</span>
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-[#070b12] text-slate-400 font-semibold border-b border-[#1f2e48]">
                            <tr>
                              <th className="py-2.5 px-3">Relief Depot</th>
                              <th className="py-2.5 px-3">Vehicles Ready</th>
                              <th className="py-2.5 px-3">Boats Ready</th>
                              <th className="py-2.5 px-3">Food Stock</th>
                              <th className="py-2.5 px-3">Water Stock</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1f2e48]">
                            {centers.map((c) => {
                              const detail = centerDetails[c.id];
                              const food = detail?.inventory?.find((i) => i.resource_type === 'food_kits')?.quantity ?? 'Available';
                              const water = detail?.inventory?.find((i) => i.resource_type === 'water_units')?.quantity ?? 'Available';
                              return (
                                <tr key={c.id} className="hover:bg-[#131e31]/50">
                                  <td className="py-2.5 px-3 font-medium text-slate-200">{c.name}</td>
                                  <td className="py-2.5 px-3 font-mono text-amber-300">{c.vehicles_available} trucks</td>
                                  <td className="py-2.5 px-3 font-mono text-blue-300">{c.boats_available} boats</td>
                                  <td className="py-2.5 px-3 font-mono text-emerald-400">{typeof food === 'number' ? food.toLocaleString() : food}</td>
                                  <td className="py-2.5 px-3 font-mono text-cyan-400">{typeof water === 'number' ? water.toLocaleString() : water}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* RESCUE SUB-PANEL: Road Traversability & Field Status Updater */}
                  {department === 'rescue' && (
                    <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 shadow-xl space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Navigation className="w-4 h-4 text-blue-400" />
                            <span>Road Traversability &amp; Ingress Network</span>
                          </h3>
                          <p className="text-xs text-slate-400">
                            Authorized Rescue field officers may update road status after on-site ground assessment.
                          </p>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">{roads.length} Monitored Segments</span>
                      </div>

                      {/* Road Action Feedback Alert */}
                      {roadActionFeedback && (
                        <div
                          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                            roadActionFeedback.type === 'success'
                              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                              : 'bg-red-950/40 border-red-500/50 text-red-200'
                          }`}
                        >
                          {roadActionFeedback.type === 'success' ? (
                            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                          )}
                          <span>{roadActionFeedback.message}</span>
                        </div>
                      )}

                      {/* Road Segments Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-[#070b12] text-slate-400 font-semibold border-b border-[#1f2e48]">
                            <tr>
                              <th className="py-2.5 px-3">Segment Name</th>
                              <th className="py-2.5 px-3">Length</th>
                              <th className="py-2.5 px-3">Flood Risk</th>
                              <th className="py-2.5 px-3">Traversability Status</th>
                              <th className="py-2.5 px-3 text-right">Field Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1f2e48]">
                            {roads.map((r) => (
                              <tr key={r.id} className="hover:bg-[#131e31]/50">
                                <td className="py-2.5 px-3 font-medium text-slate-200">{r.name}</td>
                                <td className="py-2.5 px-3 font-mono text-slate-400">{r.length_km} km</td>
                                <td className="py-2.5 px-3 font-mono text-slate-300">Risk {r.risk_score}/100</td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                      r.status === 'accessible'
                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                        : r.status === 'partial'
                                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                        : 'bg-red-950 text-red-300 border border-red-800'
                                    }`}
                                  >
                                    {r.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    onClick={() => {
                                      setUpdatingRoadId(r.id);
                                      setNewRoadStatus(r.status);
                                      setRoadUpdateReason('');
                                    }}
                                    className="px-2.5 py-1 rounded bg-[#131e31] hover:bg-cyan-600 border border-[#1f2e48] text-slate-200 hover:text-white font-semibold text-[11px] transition"
                                  >
                                    Update Status
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Modal or inline form to update road status */}
                      {updatingRoadId && (
                        <form
                          onSubmit={handleRoadStatusUpdate}
                          className="bg-[#070b12] border border-cyan-500/40 rounded-xl p-4 space-y-4"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">
                              Update Road Status: {roads.find((r) => r.id === updatingRoadId)?.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => setUpdatingRoadId(null)}
                              className="text-xs text-slate-400 hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                                New Traversability Condition
                              </label>
                              <select
                                value={newRoadStatus}
                                onChange={(e) => setNewRoadStatus(e.target.value as RoadStatus)}
                                className="w-full bg-[#0d1522] border border-[#1f2e48] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                              >
                                <option value="accessible">Accessible (Clear for Convoys)</option>
                                <option value="partial">Partial (Waterlogged / High Clearance Only)</option>
                                <option value="blocked">Blocked (Flooded / Impassable)</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                                Field Observation / Justification
                              </label>
                              <input
                                type="text"
                                value={roadUpdateReason}
                                onChange={(e) => setRoadUpdateReason(e.target.value)}
                                placeholder="e.g. Floodwaters reached 1.8m at culvert breach"
                                className="w-full bg-[#0d1522] border border-[#1f2e48] rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setUpdatingRoadId(null)}
                              className="px-3 py-1.5 rounded-lg bg-[#0d1522] hover:bg-[#131e31] border border-[#1f2e48] text-xs text-slate-300 transition"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={roadActionLoading}
                              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {roadActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                              <span>Save Status Change</span>
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: SECTOR TACTICAL MAP */}
            {activeTab === 'map' && (
              <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 shadow-xl mb-8 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Navigation className="w-4 h-4 text-cyan-400" />
                      <span>Live PostGIS Interactive Sector Map</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Visualizing active flood zones, relief logistics bases, evacuation shelters, and road network status.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Critical Zone
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Resource Base
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Shelter
                    </span>
                  </div>
                </div>

                <div className="rounded-xl overflow-hidden border border-[#1f2e48] h-[550px] relative">
                  <CommandMap
                    zones={zones as MapZone[]}
                    shelters={shelters}
                    centers={centers}
                    roads={roads as MapRoad[]}
                    selectedZoneId={selectedZoneId}
                    onSelectZone={(id) => setSelectedZoneId(id)}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: APPROVED RESPONSE PLANS (READ-ONLY) */}
            {activeTab === 'plans' && (
              <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 shadow-xl mb-8 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#1f2e48]">
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-cyan-400" />
                      <span>Response Plans &amp; Resource Recommendations</span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      Read-only view of response plans for selected zone. Approvals &amp; rejections are strictly handled by Command Center.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-[#131e31] border border-[#1f2e48] text-slate-300">
                    Zone: {selectedZone?.name}
                  </span>
                </div>

                {recommendations.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs italic">
                    No response plans currently drafted or approved for this zone.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recommendations.map((rec) => {
                      const isApproved = rec.status === 'approved';
                      const isRejected = rec.status === 'rejected';
                      const isInTransit = rec.status === 'in_transit';
                      const isDelivered = rec.status === 'delivered';
                      const isFailed = rec.status === 'failed';
                      const isModified = rec.status === 'modified';

                      return (
                        <div
                          key={rec.id}
                          className="bg-[#070b12] border border-[#1f2e48] rounded-xl p-5 space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-cyan-400">
                                Plan ID: {rec.id}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                                  isApproved
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : isInTransit
                                    ? 'bg-cyan-950 text-cyan-300 border border-cyan-700 animate-pulse'
                                    : isDelivered
                                    ? 'bg-emerald-950 text-emerald-200 border border-emerald-600'
                                    : isFailed
                                    ? 'bg-red-950 text-red-300 border border-red-800'
                                    : isModified
                                    ? 'bg-purple-950 text-purple-300 border border-purple-800'
                                    : isRejected
                                    ? 'bg-slate-900 text-slate-400 border border-slate-700'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                                }`}
                              >
                                {rec.status.replace('_', ' ')}
                              </span>
                            </div>

                            <span className="text-[11px] text-slate-500 font-mono">
                              Created: {new Date(rec.created_at).toLocaleString()}
                            </span>
                          </div>

                          <p className="text-xs text-slate-300 leading-relaxed">{rec.explanation}</p>

                          {rec.plan && (
                            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-lg p-3 text-xs">
                              <span className="font-bold text-slate-300 block mb-1">Recommended Allocations:</span>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono text-slate-400">
                                <div>Boats: <span className="text-blue-400 font-bold">{rec.plan.resources_recommended?.boats ?? 0}</span></div>
                                <div>Food: <span className="text-amber-400 font-bold">{rec.plan.resources_recommended?.food_kits ?? 0} kits</span></div>
                                <div>Water: <span className="text-cyan-400 font-bold">{rec.plan.resources_recommended?.water_units ?? 0} units</span></div>
                                <div>Medical: <span className="text-emerald-400 font-bold">{rec.plan.resources_recommended?.medical_teams ?? 0} teams</span></div>
                              </div>
                            </div>
                          )}

                          {isApproved && (
                            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium pt-1">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>
                                Approved by {rec.approver_name || rec.approved_by || 'Command Center Officer'} at{' '}
                                {rec.approved_at ? new Date(rec.approved_at).toLocaleString() : 'Recent'}
                              </span>
                            </div>
                          )}

                          {isInTransit && (
                            <div className="flex items-center gap-2 text-xs text-cyan-400 font-medium pt-1">
                              <Truck className="w-4 h-4 animate-pulse" />
                              <span>
                                Mission Active &bull; Transport in transit to sector. Dispatched by {rec.dispatched_by || 'Officer'}.
                              </span>
                            </div>
                          )}

                          {isDelivered && (
                            <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium pt-1">
                              <CheckCircle2 className="w-4 h-4" />
                              <span>
                                Mission Accomplished &bull; Supplies confirmed delivered at {rec.completed_at ? new Date(rec.completed_at).toLocaleString() : 'N/A'}.
                              </span>
                            </div>
                          )}

                          {isFailed && (
                            <div className="flex items-center gap-2 text-xs text-red-400 font-medium pt-1">
                              <AlertCircle className="w-4 h-4" />
                              <span>
                                Transport Disrupted &bull; {rec.failure_reason || 'Mission aborted'}. Reallocation pending.
                              </span>
                            </div>
                          )}

                          {isRejected && (
                            <div className="flex items-center gap-2 text-xs text-red-400 font-medium pt-1">
                              <AlertCircle className="w-4 h-4" />
                              <span>Plan rejected by Command Center. New logistical calculation required.</span>
                            </div>
                          )}

                          {!isApproved && !isRejected && !isInTransit && !isDelivered && !isFailed && (
                            <div className="flex items-center gap-2 text-xs text-amber-400 font-medium pt-1">
                              <Clock className="w-4 h-4" />
                              <span>
                                {isModified ? 'Modified Draft Plan' : 'Draft Plan'} &bull; Awaiting Command Center review &amp; authorization
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: INCIDENT & DISTRESS REPORTS STREAM */}
            {activeTab === 'reports' && (
              <div className="space-y-6">
                {/* Header Information Banner */}
                <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 relative overflow-hidden shadow-xl">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-cyan-950/70 border border-cyan-800 text-cyan-400">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            {department === 'health' && 'Health & Medical Distress Stream'}
                            {department === 'supply' && 'Supply & Logistics Deficit Stream'}
                            {department === 'rescue' && 'Rescue, Evacuation & Route Obstruction Stream'}
                            {!department && 'Disaster Field Incident Stream'}
                            <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                              READ-ONLY TELEMETRY
                            </span>
                          </h2>
                          <p className="text-xs text-slate-400">
                            {department === 'health' &&
                              'Direct monitoring of citizen medical emergencies, casualties, and emergency health support calls.'}
                            {department === 'supply' &&
                              'Direct monitoring of food shortages, potable drinking water deficits, and critical supply requests.'}
                            {department === 'rescue' &&
                              'Direct monitoring of trapped citizens, flood evacuations, blocked roads, and emergency boat rescues.'}
                            {!department &&
                              'Real-time distress reports ingested from public citizen submissions and emergency hotlines.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-3 py-1.5 rounded-lg bg-[#131e31] border border-[#1f2e48] text-slate-300">
                        Total Ingested: <strong className="text-white">{reports.length}</strong>
                      </span>
                      <span className="px-3 py-1.5 rounded-lg bg-red-950/50 border border-red-800/60 text-red-300">
                        Critical: <strong className="text-white">{reports.filter((r) => r.severity === 'critical').length}</strong>
                      </span>
                      <span className="px-3 py-1.5 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300">
                        Medical: <strong className="text-white">{reports.filter((r) => r.medical_need).length}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Privacy Disclosure Notice */}
                  <div className="mt-4 pt-3 border-t border-[#1f2e48] flex items-center gap-2 text-[11px] text-slate-400">
                    <ShieldAlert className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span>
                      <strong>Privacy Protection Active:</strong> Citizen contact details are strictly limited to authorized operational responders ({user?.role}). Department responders have read-only inspection authority.
                    </span>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 space-y-4 shadow-xl">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Scope Selector Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setReportScope('department')}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                          reportScope === 'department'
                            ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/30'
                            : 'bg-[#131e31] hover:bg-[#1a2842] text-slate-300 border border-[#1f2e48]'
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5" />
                        <span>
                          {department === 'health' && 'Medical Priority Only'}
                          {department === 'supply' && 'Supplies Priority Only'}
                          {department === 'rescue' && 'Rescue & Roads Priority Only'}
                          {!department && 'Department Focus'}
                        </span>
                      </button>

                      <button
                        onClick={() => setReportScope('all')}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                          reportScope === 'all'
                            ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/30'
                            : 'bg-[#131e31] hover:bg-[#1a2842] text-slate-300 border border-[#1f2e48]'
                        }`}
                      >
                        <span>All Disaster Reports ({reports.length})</span>
                      </button>
                    </div>

                    <div className="text-xs text-slate-400">
                      Showing <strong>{filteredDepartmentReports.length}</strong> matching reports
                    </div>
                  </div>

                  {/* Filter Dropdowns and Search Input */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        placeholder="Search description, location, or report ID..."
                        value={reportSearch}
                        onChange={(e) => setReportSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <select
                        value={reportSeverityFilter}
                        onChange={(e) => setReportSeverityFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                      >
                        <option value="all">All Severities</option>
                        <option value="critical">Critical Severity</option>
                        <option value="high">High Severity</option>
                        <option value="medium">Medium Severity</option>
                        <option value="low">Low Severity</option>
                      </select>
                    </div>

                    <div>
                      <select
                        value={reportStatusFilter}
                        onChange={(e) => setReportStatusFilter(e.target.value)}
                        className="w-full px-3 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                      >
                        <option value="all">All Statuses</option>
                        <option value="pending_ai">Pending AI Analysis</option>
                        <option value="analyzed">Analyzed &amp; Classified</option>
                        <option value="verified">Verified by Personnel</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Reports Grid */}
                {filteredDepartmentReports.length === 0 ? (
                  <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-12 text-center space-y-3">
                    <AlertCircle className="w-10 h-10 text-slate-500 mx-auto" />
                    <h3 className="text-base font-bold text-white">No Reports Matching Selected Criteria</h3>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Try adjusting the severity or status filters, or toggle to "All Disaster Reports" to expand your view.
                    </p>
                    <button
                      onClick={() => {
                        setReportScope('all');
                        setReportSeverityFilter('all');
                        setReportStatusFilter('all');
                        setReportSearch('');
                      }}
                      className="px-4 py-2 rounded-xl bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-xs font-semibold text-cyan-300 transition"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredDepartmentReports.map((r) => {
                      const isCritical = r.severity === 'critical';
                      const isHigh = r.severity === 'high';

                      return (
                        <div
                          key={r.id}
                          className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 space-y-3 shadow-lg hover:border-cyan-800/80 transition-colors flex flex-col justify-between"
                        >
                          <div className="space-y-3">
                            {/* Card Header: ID, Badges, Timestamp */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2e48] pb-3">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-cyan-400">
                                  {r.id}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    isCritical
                                      ? 'bg-red-950 text-red-300 border border-red-800'
                                      : isHigh
                                      ? 'bg-orange-950 text-orange-300 border border-orange-800'
                                      : 'bg-yellow-950 text-yellow-300 border border-yellow-800'
                                  }`}
                                >
                                  {r.severity || 'Medium'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    r.status === 'verified'
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      : r.status === 'analyzed'
                                      ? 'bg-blue-950 text-blue-300 border border-blue-800'
                                      : 'bg-amber-950 text-amber-300 border border-amber-800'
                                  }`}
                                >
                                  {r.status || 'Pending'}
                                </span>
                              </div>

                              <span className="text-[11px] text-slate-500 font-mono">
                                {new Date(r.created_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })} &bull; {new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </span>
                            </div>

                            {/* Incident Description */}
                            <p className="text-xs text-slate-200 leading-relaxed font-normal">
                              {r.description}
                            </p>

                            {/* Tags & Attributes */}
                            <div className="flex flex-wrap items-center gap-2 text-[11px]">
                              {r.location_name && (
                                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#131e31] border border-[#1f2e48] text-slate-300">
                                  <MapPin className="w-3 h-3 text-cyan-400" />
                                  <span>{r.location_name}</span>
                                </span>
                              )}

                              {r.people_affected !== undefined && r.people_affected !== null && (
                                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#131e31] border border-[#1f2e48] text-slate-300">
                                  <Users className="w-3 h-3 text-blue-400" />
                                  <span>{r.people_affected} affected</span>
                                </span>
                              )}

                              {r.medical_need && (
                                <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 font-semibold">
                                  <HeartPulse className="w-3 h-3 text-rose-400" />
                                  <span>Medical Attention Required</span>
                                </span>
                              )}

                              {r.category && (
                                <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300 text-[10px] font-mono">
                                  {r.category}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Card Footer: Privacy Contact & Read-only Telemetry button */}
                          <div className="pt-3 border-t border-[#1f2e48] flex items-center justify-between text-xs">
                            {r.contact_number ? (
                              <div className="flex items-center gap-1.5 text-emerald-300">
                                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="font-mono font-semibold">{r.contact_number}</span>
                                <span className="text-[10px] text-slate-500">(Authorized)</span>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-500 italic">
                                Contact info restricted
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                                Read-Only
                              </span>
                              <button
                                onClick={() => setSelectedReportDetail(r)}
                                className="px-2.5 py-1 rounded-lg bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-cyan-300 hover:text-white text-xs font-semibold transition flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Inspect</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Report Telemetry Modal */}
                {selectedReportDetail && (
                  <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
                      <div className="flex items-center justify-between border-b border-[#1f2e48] pb-3">
                        <h3 className="font-bold text-white text-base flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-cyan-400" />
                          Incident Report Telemetry &bull; {selectedReportDetail.id}
                        </h3>
                        <button
                          onClick={() => setSelectedReportDetail(null)}
                          className="text-slate-400 hover:text-white p-1"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48] space-y-2">
                          <div>
                            <span className="text-slate-400">Description:</span>
                            <p className="text-white mt-1 leading-relaxed">{selectedReportDetail.description}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
                            <span className="text-slate-400 block">Severity:</span>
                            <span className="text-white font-bold uppercase">{selectedReportDetail.severity || 'Medium'}</span>
                          </div>
                          <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
                            <span className="text-slate-400 block">Status:</span>
                            <span className="text-white font-bold uppercase">{selectedReportDetail.status || 'Pending'}</span>
                          </div>
                          <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
                            <span className="text-slate-400 block">Coordinates (Lat, Lng):</span>
                            <span className="text-white font-mono">{selectedReportDetail.location_lat.toFixed(4)}, {selectedReportDetail.location_lng.toFixed(4)}</span>
                          </div>
                          <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
                            <span className="text-slate-400 block">Location Name:</span>
                            <span className="text-white">{selectedReportDetail.location_name || 'Assam Flood Sector'}</span>
                          </div>
                          <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
                            <span className="text-slate-400 block">Medical Attention:</span>
                            <span className={selectedReportDetail.medical_need ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                              {selectedReportDetail.medical_need ? 'Urgent Need' : 'None Reported'}
                            </span>
                          </div>
                          <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48]">
                            <span className="text-slate-400 block">Citizen Contact:</span>
                            <span className="text-emerald-300 font-mono">
                              {selectedReportDetail.contact_number || 'Redacted for Privacy'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-[#1f2e48] text-xs">
                        <span className="text-[11px] text-slate-500">
                          Ingested at {new Date(selectedReportDetail.created_at).toLocaleString()}
                        </span>
                        <button
                          onClick={() => setSelectedReportDetail(null)}
                          className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition"
                        >
                          Close Telemetry
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        RELIEF-OS &copy; 2026 &bull; {getDepartmentLabel(department)} Operational Unit &bull; Inter-Agency Disaster Coordination.
      </footer>
    </div>
  );
}

export default DepartmentPage;
