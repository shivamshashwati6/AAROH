import { useState, useEffect, useCallback, useMemo, useTransition } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavigationHeader } from '../components/NavigationHeader';
import { CommandMap, MapZone, MapShelter, MapCenter, MapRoad } from '../components/CommandMap';
import {
  api,
  ApiError,
  DemoKPIResponse,
  RecommendationItem,
  SimulationPayload,
  SimulationRunResponse,
} from '../services/api';
import {
  CitizenReport,
  ZoneDemandResult,
  ZoneAllocationResult,
  ResourceAllocationItem,
} from '@relief-os/shared';
import { getRoleBadgeLabel } from '../utils/auth-roles';
import {
  Activity,
  CheckCircle,
  Truck,
  Shield,
  AlertTriangle,
  Users,
  Building2,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Phone,
  FileText,
  AlertCircle,
  Loader2,
  Navigation,
  Sliders,
  Sparkles,
  RotateCcw,
  Check,
  Edit3,
  PackageCheck,
  RotateCw,
} from 'lucide-react';

export function CommandCenterPage() {
  const { user } = useAuth();
  const [, startTransition] = useTransition();

  // Role Permissions
  const canManagePlans = user?.role === 'command_center' || user?.role === 'admin' || user?.role === 'officer';
  const canExecuteDelivery =
    canManagePlans ||
    user?.role === 'department' ||
    user?.department === 'health' ||
    user?.department === 'supply' ||
    user?.department === 'rescue';

  // Core Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [kpiData, setKpiData] = useState<DemoKPIResponse | null>(null);
  const [zones, setZones] = useState<MapZone[]>([]);
  const [shelters, setShelters] = useState<MapShelter[]>([]);
  const [centers, setCenters] = useState<MapCenter[]>([]);
  const [roads, setRoads] = useState<MapRoad[]>([]);
  const [reports, setReports] = useState<CitizenReport[]>([]);

  // Selected Zone & Decision Intelligence
  const [selectedZoneId, setSelectedZoneId] = useState<string>('zone-a');
  const [planningDays, setPlanningDays] = useState<number>(3);
  const [demandResult, setDemandResult] = useState<ZoneDemandResult | null>(null);
  const [allocationResult, setAllocationResult] = useState<ZoneAllocationResult | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [decisionLoading, setDecisionLoading] = useState<boolean>(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Approval / Rejection Action States
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [approvalNotes, setApprovalNotes] = useState<string>('');

  // Plan Lifecycle Modals & Action States
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editQuantities, setEditQuantities] = useState<{
    boats: number;
    food_kits: number;
    water_units: number;
    medical_teams: number;
  }>({ boats: 0, food_kits: 0, water_units: 0, medical_teams: 0 });
  const [editCenterId, setEditCenterId] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);

  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);
  const [dispatchNotes, setDispatchNotes] = useState<string>('');
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const [showFailModal, setShowFailModal] = useState<boolean>(false);
  const [failReason, setFailReason] = useState<string>('');
  const [failDisposition, setFailDisposition] = useState<'stock_lost' | 'stock_returned'>('stock_returned');
  const [failError, setFailError] = useState<string | null>(null);

  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [promoteLoading, setPromoteLoading] = useState<boolean>(false);

  // What-If Simulation State (PRD Module 9)
  const [simScenarioType, setSimScenarioType] = useState<
    'fleet_reduction' | 'inventory_reduction' | 'road_blockage'
  >('fleet_reduction');
  const [simScopeCenter, setSimScopeCenter] = useState<string>('');
  const [simRemoveVehicles, setSimRemoveVehicles] = useState<number>(2);
  const [simRemoveBoats, setSimRemoveBoats] = useState<number>(2);
  const [simReduceStockPct, setSimReduceStockPct] = useState<number>(50);
  const [simResourceType, setSimResourceType] = useState<'food_kits' | 'water_units' | ''>('');
  const [simBlockedRoadId, setSimBlockedRoadId] = useState<string>('route-c');
  const [simLoading, setSimLoading] = useState<boolean>(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<SimulationRunResponse | null>(null);

  // Active Bottom Tab
  const [activeTab, setActiveTab] = useState<'reports' | 'roads' | 'simulation'>('reports');

  // Load all initial operational datasets
  const loadCommandData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [kpisRes, zonesRes, sheltersRes, centersRes, roadsRes, reportsRes] =
        await Promise.all([
          api.getDemoKPIs().catch(() => null),
          api.getZones({ limit: 10 }),
          api.getShelters({ limit: 25 }),
          api.getResourceCenters(),
          api.getRoadSegments(),
          api.getReports({ limit: 30 }),
        ]);

      startTransition(() => {
        setKpiData(kpisRes);
        setZones(zonesRes.items);
        setShelters(sheltersRes.items);
        setCenters(centersRes.items);
        setRoads(roadsRes.items);
        setReports(reportsRes.items);
      });
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error
          ? err.message
          : 'Failed to synchronize Command Center dataset';
      setError(`Database Connection Error: ${msg}. Please verify connection and retry.`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCommandData();
  }, [loadCommandData]);

  // Load demand, allocation, and response plan whenever selected zone or planning days change
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
    } catch (err: unknown) {
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

  // Handle Plan Approval
  const handleApprovePlan = async (recId: string) => {
    setActionLoading(true);
    setActionFeedback(null);
    try {
      await api.approveRecommendation(recId, approvalNotes.trim() || undefined);
      setActionFeedback({
        type: 'success',
        message: `Plan #${recId} successfully approved. Action recorded in tamper-evident audit log. Note: Approval authorizes field tasking; physical dispatch is executed by designated departments.`,
      });
      // Refresh recommendations list
      await loadZoneDecisionData(selectedZoneId, planningDays);
      setApprovalNotes('');
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Approval failed.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Plan Rejection
  const handleRejectPlan = async (recId: string) => {
    if (!rejectReason.trim()) {
      setActionFeedback({
        type: 'error',
        message: 'A rejection reason is required to reject a generated response plan.',
      });
      return;
    }

    setActionLoading(true);
    setActionFeedback(null);
    try {
      await api.rejectRecommendation(recId, rejectReason.trim());
      setActionFeedback({
        type: 'success',
        message: `Plan #${recId} rejected. Reason logged in audit registry. AI recommendation engine notified.`,
      });
      setShowRejectModal(false);
      setRejectReason('');
      await loadZoneDecisionData(selectedZoneId, planningDays);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Rejection failed.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal with current plan allocations
  const handleOpenEditModal = () => {
    if (!activePlan) return;
    const planRec = activePlan.plan?.resources_recommended || {};
    setEditQuantities({
      boats: planRec.boats ?? 0,
      food_kits: planRec.food_kits ?? 0,
      water_units: planRec.water_units ?? 0,
      medical_teams: planRec.medical_teams ?? 0,
    });
    setEditCenterId(activePlan.plan?.source_center_id || centers[0]?.id || '');
    setEditReason('');
    setEditError(null);
    setShowEditModal(true);
  };

  // Save Modified Plan before Approval
  const handleSavePlanEdit = async () => {
    if (!activePlan) return;
    if (!editReason.trim()) {
      setEditError('A modification reason is required for the audit registry.');
      return;
    }
    if (
      editQuantities.boats < 0 ||
      editQuantities.food_kits < 0 ||
      editQuantities.water_units < 0 ||
      editQuantities.medical_teams < 0
    ) {
      setEditError('Resource quantities cannot be negative.');
      return;
    }

    setActionLoading(true);
    setEditError(null);
    try {
      await api.modifyPlan(activePlan.id, {
        supplying_center_id: editCenterId,
        resources: editQuantities,
        reason: editReason.trim(),
      });
      setActionFeedback({
        type: 'success',
        message: `Plan #${activePlan.id} modified successfully. Changes logged to audit log. Status updated to MODIFIED.`,
      });
      setShowEditModal(false);
      await loadZoneDecisionData(selectedZoneId, planningDays);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Plan modification failed.';
      setEditError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Open Dispatch Modal
  const handleOpenDispatchModal = () => {
    if (!activePlan) return;
    setDispatchNotes('');
    setDispatchError(null);
    setShowDispatchModal(true);
  };

  // Execute / Dispatch Approved Plan (Atomic Inventory Deduction)
  const handleDispatchPlan = async () => {
    if (!activePlan) return;
    setActionLoading(true);
    setDispatchError(null);
    try {
      await api.dispatchPlan(activePlan.id, {
        execution_notes: dispatchNotes.trim() || undefined,
      });
      setActionFeedback({
        type: 'success',
        message: `Plan #${activePlan.id} dispatched! Inventory deducted in atomic transaction. Status is now IN TRANSIT.`,
      });
      setShowDispatchModal(false);
      setDispatchNotes('');
      await loadZoneDecisionData(selectedZoneId, planningDays);
      const centersRes = await api.getResourceCenters();
      setCenters(centersRes.items);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Dispatch failed.';
      setDispatchError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Confirm Delivery Complete
  const handleDeliverPlan = async () => {
    if (!activePlan) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      await api.deliverPlan(activePlan.id, deliveryNotes.trim() || undefined);
      setActionFeedback({
        type: 'success',
        message: `Plan #${activePlan.id} marked as DELIVERED. Transport mission successfully completed.`,
      });
      setDeliveryNotes('');
      await loadZoneDecisionData(selectedZoneId, planningDays);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to mark plan as delivered.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(false);
    }
  };

  // Report Transport Failure
  const handleFailPlan = async () => {
    if (!activePlan) return;
    if (!failReason.trim()) {
      setFailError('A failure reason is required.');
      return;
    }
    setActionLoading(true);
    setFailError(null);
    try {
      await api.failPlan(activePlan.id, {
        failure_reason: failReason.trim(),
        disposition: failDisposition,
      });
      setActionFeedback({
        type: 'success',
        message: `Plan #${activePlan.id} marked as FAILED. Disposition: ${failDisposition}. Reallocation workflow enabled.`,
      });
      setShowFailModal(false);
      setFailReason('');
      await loadZoneDecisionData(selectedZoneId, planningDays);
      const centersRes = await api.getResourceCenters();
      setCenters(centersRes.items);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update plan status.';
      setFailError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // Reallocate Replacement Plan
  const handleReallocatePlan = async () => {
    if (!activePlan) return;
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await api.reallocatePlan(activePlan.id, {
        planning_days: planningDays,
        notes: 'Reallocated after transport disruption',
      });
      setActionFeedback({
        type: 'success',
        message: `Replacement response plan #${res.plan.id} drafted against live stock! Status: DRAFT.`,
      });
      await loadZoneDecisionData(selectedZoneId, planningDays);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Reallocation failed.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(false);
    }
  };

  // Promote Simulation to Draft Plan
  const handlePromoteSimulation = async () => {
    if (!simResult?.simulation_id) return;
    setPromoteLoading(true);
    setActionFeedback(null);
    try {
      const res = await api.promoteSimulationToDraft(simResult.simulation_id);
      setActionFeedback({
        type: 'success',
        message: `Simulation #${simResult.simulation_id} promoted to DRAFT response plan #${res.recommendation.id}! No operational stock mutated.`,
      });
      await loadZoneDecisionData(selectedZoneId, planningDays);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Simulation promotion failed.';
      setActionFeedback({ type: 'error', message: msg });
    } finally {
      setPromoteLoading(false);
    }
  };

  // Handle What-If Simulation Execution (PRD Module 9)
  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimLoading(true);
    setSimError(null);

    const payload: SimulationPayload = {
      zone_id: selectedZoneId,
      planning_days: planningDays,
      scenario_type: simScenarioType,
      center_id: simScopeCenter ? simScopeCenter : undefined,
    };

    if (simScenarioType === 'fleet_reduction') {
      if (simRemoveVehicles > 0) payload.remove_vehicles = simRemoveVehicles;
      if (simRemoveBoats > 0) payload.remove_boats = simRemoveBoats;
    } else if (simScenarioType === 'inventory_reduction') {
      payload.reduce_stock_pct = simReduceStockPct;
      if (simResourceType) payload.resource_type = simResourceType;
    } else if (simScenarioType === 'road_blockage') {
      payload.blocked_road_id = simBlockedRoadId;
    }

    try {
      const res = await api.runSimulation(payload);
      setSimResult(res);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error
          ? err.message
          : 'Failed to execute What-If simulation';
      setSimError(msg);
    } finally {
      setSimLoading(false);
    }
  };

  // Selected Zone Details
  const selectedZone = useMemo(() => {
    return zones.find((z) => z.id === selectedZoneId) || zones[0] || null;
  }, [zones, selectedZoneId]);

  // Active Plan (for current zone)
  const activePlan = useMemo(() => {
    return recommendations.length > 0 ? recommendations[0] : null;
  }, [recommendations]);

  // Aggregate Total Shelter Capacity
  const shelterStats = useMemo(() => {
    const totalCap = shelters.reduce((acc, s) => acc + (s.capacity || 0), 0);
    const totalOcc = shelters.reduce((acc, s) => acc + (s.occupied || 0), 0);
    const available = Math.max(0, totalCap - totalOcc);
    return { totalCap, totalOcc, available };
  }, [shelters]);

  // Aggregate Total Fleet Units
  const totalFleetUnits = useMemo(() => {
    return centers.reduce((acc, c) => acc + (c.total_fleet || c.vehicles_available || 0), 0);
  }, [centers]);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      <NavigationHeader />

      {/* Tactical Sub-Header */}
      <div className="border-b border-[#1f2e48] bg-[#0d1522]/90 backdrop-blur px-4 sm:px-8 py-3 sticky top-[57px] z-30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-200">
              Command Center District Operations
            </span>
            <span className="text-slate-500">&bull;</span>
            <span className="text-xs text-slate-400 font-mono">
              {kpiData?.disaster_name || 'Assam Flood Response'} (Active)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-[11px] text-slate-400">
            Clearance: <strong className="text-cyan-400">{user ? getRoleBadgeLabel(user.role) : 'Officer'}</strong>
          </div>
          <button
            type="button"
            onClick={loadCommandData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-xs font-semibold text-slate-300 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Error Alert Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-red-950/60 border border-red-800 text-red-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={loadCommandData}
              className="px-3 py-1 rounded bg-red-800 hover:bg-red-700 text-white font-semibold text-xs cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* 1. Command Center Data-Backed KPI Cards (Section 2) */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {/* KPI 1: Affected Population */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-4 hover:border-cyan-500/40 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Affected Population</span>
              <Users className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white">
              {loading ? (
                <div className="h-7 w-20 bg-slate-800 rounded animate-pulse" />
              ) : (
                kpiData?.kpis.affected_population.toLocaleString() || '18,420'
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Across 7 critical sectors</div>
          </div>

          {/* KPI 2: Critical Zones */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-4 hover:border-red-500/40 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Critical Zones</span>
              <AlertTriangle className="w-4 h-4 text-red-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-red-400">
              {loading ? (
                <div className="h-7 w-12 bg-slate-800 rounded animate-pulse" />
              ) : (
                zones.filter((z) => z.band === 'Critical').length || kpiData?.kpis.critical_zones_count || '7'
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Zone A Priority: 94/100</div>
          </div>

          {/* KPI 3: Active Disaster */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-4 hover:border-amber-500/40 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Active Disaster</span>
              <Shield className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-sm font-black text-white truncate" title={kpiData?.disaster_name || 'Assam Flood'}>
              {loading ? <div className="h-5 w-24 bg-slate-800 rounded animate-pulse" /> : 'Assam Monsoon'}
            </div>
            <div className="text-[11px] text-amber-300 font-semibold mt-1">Threat Level 4 &bull; Active</div>
          </div>

          {/* KPI 4: Available Shelters & Capacity */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-4 hover:border-emerald-500/40 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Shelter Capacity</span>
              <Building2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">
              {loading ? (
                <div className="h-7 w-16 bg-slate-800 rounded animate-pulse" />
              ) : (
                `${shelterStats.available.toLocaleString()}`
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {shelters.length} Shelters &bull; {shelterStats.totalCap.toLocaleString()} Cap
            </div>
          </div>

          {/* KPI 5: Available Response Fleet */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-4 hover:border-blue-500/40 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Available Response Fleet</span>
              <Truck className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-white">
              {loading ? (
                <div className="h-7 w-12 bg-slate-800 rounded animate-pulse" />
              ) : (
                totalFleetUnits || kpiData?.kpis.total_fleet || kpiData?.kpis.vehicles_deployed || '21'
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{centers.length || 5} Centers Staged (Available)</div>
          </div>

          {/* KPI 6: Ingested Citizen Reports */}
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-4 hover:border-teal-500/40 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
              <span>Distress Reports</span>
              <FileText className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-teal-400">
              {loading ? (
                <div className="h-7 w-12 bg-slate-800 rounded animate-pulse" />
              ) : (
                reports.length || kpiData?.kpis.total_reports_ingested || '32'
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Queued for AI extraction</div>
          </div>
        </section>

        {/* 2. Interactive Disaster Map & Priority Queue & Decision Intelligence */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (7 cols): Map & Critical Zones Queue */}
          <div className="lg:col-span-7 space-y-6">
            {/* Interactive PostGIS Map Container */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-[#1f2e48] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-bold text-sm text-white">Tactical GIS Operations Map</h3>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Critical Zone
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Shelter
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Depot
                  </span>
                </div>
              </div>

              {/* Leaflet Map Integration */}
              <div className="h-[420px] w-full relative">
                {loading ? (
                  <div className="h-full w-full bg-[#070b12] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
                  </div>
                ) : (
                  <CommandMap
                    zones={zones}
                    shelters={shelters}
                    centers={centers}
                    roads={roads}
                    selectedZoneId={selectedZoneId}
                    onSelectZone={(id) => setSelectedZoneId(id)}
                  />
                )}
              </div>
            </div>

            {/* Critical Zones Priority Queue */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <span>Prioritized Affected Zones Queue</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ranked by AI Priority Score (0–100). Click any zone to evaluate demand and inspect response plan.
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono">{zones.length} Sectors Active</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#131e31] text-slate-400 uppercase font-semibold">
                    <tr>
                      <th className="p-2.5 rounded-l-lg">Zone</th>
                      <th className="p-2.5">Priority</th>
                      <th className="p-2.5">Severity</th>
                      <th className="p-2.5">Affected People</th>
                      <th className="p-2.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2e48]">
                    {zones.map((zone) => {
                      const isSelected = zone.id === selectedZoneId;
                      return (
                        <tr
                          key={zone.id}
                          onClick={() => setSelectedZoneId(zone.id)}
                          className={`hover:bg-[#131e31]/80 cursor-pointer transition ${
                            isSelected ? 'bg-cyan-950/40 border-l-2 border-cyan-400' : ''
                          }`}
                        >
                          <td className="p-2.5 font-bold text-white flex items-center gap-2">
                            <span>{zone.name}</span>
                            {isSelected && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700">
                                SELECTED
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                zone.priority_score >= 85
                                  ? 'bg-red-950 text-red-300 border border-red-800'
                                  : 'bg-amber-950 text-amber-300 border border-amber-800'
                              }`}
                            >
                              {zone.priority_score}/100 ({zone.band})
                            </span>
                          </td>
                          <td className="p-2.5 uppercase font-medium text-slate-300">{zone.medical_risk || 'Critical'}</td>
                          <td className="p-2.5 text-slate-300 font-mono">
                            {zone.affected_population.toLocaleString()}
                          </td>
                          <td className="p-2.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedZoneId(zone.id);
                              }}
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                                isSelected
                                  ? 'bg-cyan-600 text-white'
                                  : 'bg-[#1f2e48] text-slate-300 hover:text-white'
                              }`}
                            >
                              Inspect Plan
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Demand & Allocation Recommendation & Human Approval (Sections 5 & 6) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-5">
              {/* Zone Header & Planning Days Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1f2e48]">
                <div>
                  <div className="text-[11px] font-bold uppercase text-cyan-400 tracking-wider">
                    Target Sector Analysis
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {selectedZone?.name || 'Zone A - Barpeta Urban Core'}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 font-bold">
                      Priority {selectedZone?.priority_score || 94} ({selectedZone?.band || 'Critical'})
                    </span>
                    <span className="text-xs text-slate-400">
                      Pop: {selectedZone?.affected_population.toLocaleString()}
                      {demandResult && ` • Planning Horizon: ${demandResult.planning_horizon_days}d`}
                    </span>
                  </div>
                </div>

                {/* Planning Horizon Selector (1, 3, 7 days) */}
                <div className="flex items-center gap-1.5 bg-[#131e31] p-1 rounded-xl border border-[#1f2e48] text-xs">
                  <span className="text-slate-400 px-1 text-[11px] hidden sm:inline">Days:</span>
                  {[1, 3, 7].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setPlanningDays(days)}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        planningDays === days
                          ? 'bg-cyan-600 text-white shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              {/* Feedback Alert */}
              {actionFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    actionFeedback.type === 'success'
                      ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
                      : 'bg-red-950/40 border-red-800 text-red-200'
                  }`}
                >
                  {actionFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">{actionFeedback.message}</div>
                </div>
              )}

              {/* Loading / Error States for Decision Math */}
              {decisionLoading && (
                <div className="p-8 text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mx-auto" />
                  <p className="text-xs text-slate-400">Evaluating demand and inventory allocation...</p>
                </div>
              )}

              {decisionError && !decisionLoading && (
                <div className="p-4 rounded-xl bg-red-950/30 border border-red-800 text-xs text-red-300">
                  {decisionError}
                </div>
              )}

              {/* Demand vs Allocation Comparison Table */}
              {!decisionLoading && allocationResult && (
                <div className="space-y-4">
                  {/* Shortage Warning if Detected */}
                  {allocationResult.overall_shortage && (
                    <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-600/50 text-amber-200 text-xs flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold text-white">Supply Deficit Detected: </strong>
                        Local center inventories are insufficient to satisfy total demand for this zone. Inter-district staging recommended.
                      </div>
                    </div>
                  )}

                  {/* Resource Matrix */}
                  <div className="overflow-hidden rounded-xl border border-[#1f2e48]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#131e31] text-slate-400 font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="p-2.5">Resource</th>
                          <th className="p-2.5">Demand</th>
                          <th className="p-2.5">Allocated</th>
                          <th className="p-2.5">Deficit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1f2e48]">
                        {(Object.entries(allocationResult.allocations) as [string, ResourceAllocationItem][]).map(([key, item]) => {
                          const hasShortage = item.shortage_detected || item.unmet_quantity > 0;
                          return (
                            <tr key={key} className="hover:bg-[#131e31]/50">
                              <td className="p-2.5 font-bold text-white">{item.name}</td>
                              <td className="p-2.5 font-mono text-slate-200">
                                {item.requested_quantity.toLocaleString()} {item.unit}
                              </td>
                              <td className="p-2.5 font-mono font-bold text-emerald-400">
                                {item.allocated_quantity.toLocaleString()} {item.unit}
                              </td>
                              <td className="p-2.5 font-mono font-bold">
                                {hasShortage ? (
                                  <span className="text-red-400">-{item.unmet_quantity}</span>
                                ) : (
                                  <span className="text-slate-500">0</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Plain Language Engine Explanation */}
                  <div className="p-3.5 bg-[#131e31]/80 rounded-xl border border-[#1f2e48] space-y-1.5 text-xs">
                    <div className="font-bold text-cyan-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Deterministic Recommendation Rationale</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      {allocationResult.overall_explanation}
                    </p>
                    <div className="text-[11px] text-slate-400 pt-1">
                      Primary Hub: <strong className="text-white">{allocationResult.primary_source_center.name}</strong> ({allocationResult.primary_source_center.distance_km} km away)
                    </div>
                  </div>

                  {/* Strict Independence Constraint Notice (PRD Section 5) */}
                  <div className="text-[11px] text-slate-400 bg-[#070b12] p-2.5 rounded-lg border border-[#1f2e48] leading-tight">
                    <strong className="text-slate-300">Operational Policy: </strong>
                    Allocation calculations are strictly independent per zone. Recommendations must never be summed across different sectors into an aggregated plan. Approval records decision intent without mutating warehouse inventory.
                  </div>
                </div>
              )}

              {/* 3. Human-in-the-Loop Response Plan Lifecycle (PRD Phase 2) */}
              <div className="pt-4 border-t border-[#1f2e48] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-white flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span>Response Plan Lifecycle</span>
                    </h4>
                    <p className="text-xs text-slate-400">
                      Review, edit allocations, authorize, and safely execute inventory dispatch.
                    </p>
                  </div>
                  {activePlan ? (
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider ${
                        activePlan.status === 'approved'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                          : activePlan.status === 'in_transit'
                          ? 'bg-cyan-950 text-cyan-300 border border-cyan-500 animate-pulse'
                          : activePlan.status === 'delivered'
                          ? 'bg-emerald-950 text-emerald-200 border border-emerald-500'
                          : activePlan.status === 'failed'
                          ? 'bg-red-950 text-red-300 border border-red-700'
                          : activePlan.status === 'modified'
                          ? 'bg-purple-950 text-purple-300 border border-purple-700'
                          : activePlan.status === 'rejected'
                          ? 'bg-slate-900 text-slate-400 border border-slate-700'
                          : 'bg-amber-950 text-amber-300 border border-amber-700'
                      }`}
                    >
                      {activePlan.status.replace('_', ' ')}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                      NO PLAN DRAFTED
                    </span>
                  )}
                </div>

                {/* Lifecycle Stepper */}
                {activePlan && (
                  <div className="bg-[#070b12] p-3 rounded-xl border border-[#1f2e48]">
                    <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-semibold">
                      {/* Step 1: Draft / Modified */}
                      <div
                        className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 ${
                          activePlan.status === 'draft' || activePlan.status === 'modified'
                            ? 'bg-amber-950/60 text-amber-300 border border-amber-800'
                            : 'text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span>1. DRAFT</span>
                          {(activePlan.status === 'approved' ||
                            activePlan.status === 'in_transit' ||
                            activePlan.status === 'delivered') && (
                            <Check className="w-3 h-3 text-emerald-400" />
                          )}
                        </div>
                        {activePlan.status === 'modified' && (
                          <span className="text-[9px] text-purple-400 font-mono">(Edited)</span>
                        )}
                      </div>

                      {/* Step 2: Approved */}
                      <div
                        className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 ${
                          activePlan.status === 'approved'
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                            : 'text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span>2. APPROVED</span>
                          {(activePlan.status === 'in_transit' || activePlan.status === 'delivered') && (
                            <Check className="w-3 h-3 text-emerald-400" />
                          )}
                        </div>
                      </div>

                      {/* Step 3: In Transit */}
                      <div
                        className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 ${
                          activePlan.status === 'in_transit'
                            ? 'bg-cyan-950/60 text-cyan-300 border border-cyan-700 animate-pulse'
                            : 'text-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span>3. DISPATCH</span>
                          {activePlan.status === 'delivered' && <Check className="w-3 h-3 text-emerald-400" />}
                        </div>
                      </div>

                      {/* Step 4: Outcome (Delivered / Failed / Rejected) */}
                      <div
                        className={`py-1.5 px-1 rounded flex flex-col items-center gap-1 ${
                          activePlan.status === 'delivered'
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                            : activePlan.status === 'failed'
                            ? 'bg-red-950/60 text-red-300 border border-red-800'
                            : activePlan.status === 'rejected'
                            ? 'bg-slate-900 text-slate-400 border border-slate-700'
                            : 'text-slate-500'
                        }`}
                      >
                        <span>
                          {activePlan.status === 'failed'
                            ? 'FAILED'
                            : activePlan.status === 'rejected'
                            ? 'REJECTED'
                            : '4. DELIVERED'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {activePlan ? (
                  <div className="space-y-3">
                    {/* Plan Details & Audit Timeline */}
                    <div className="text-xs text-slate-300 bg-[#131e31] p-3.5 rounded-xl border border-[#1f2e48] space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-cyan-400 font-bold">Plan #{activePlan.id}</span>
                        <span className="text-slate-500 font-mono">
                          Created: {new Date(activePlan.created_at).toLocaleString()}
                        </span>
                      </div>

                      {/* Planned Allocations Summary */}
                      {activePlan.plan?.resources_recommended && (
                        <div className="bg-[#070b12] p-2.5 rounded-lg border border-[#1f2e48] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                          <div>
                            <span className="text-slate-500">Boats:</span>{' '}
                            <strong className="text-cyan-300">{activePlan.plan.resources_recommended.boats ?? 0}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Food:</span>{' '}
                            <strong className="text-amber-300">{activePlan.plan.resources_recommended.food_kits ?? 0}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Water:</span>{' '}
                            <strong className="text-blue-300">{activePlan.plan.resources_recommended.water_units ?? 0}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500">Medical:</span>{' '}
                            <strong className="text-emerald-300">{activePlan.plan.resources_recommended.medical_teams ?? 0}</strong>
                          </div>
                        </div>
                      )}

                      <div className="text-slate-400">
                        Source Center: <strong className="text-slate-200">{activePlan.plan?.source_center || activePlan.plan?.primary_source_center?.name || 'Barpeta Base #3'}</strong>
                      </div>

                      {activePlan.source_simulation_id && (
                        <div className="text-[11px] text-purple-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                          <span>Promoted from What-If Simulation Run: <strong className="font-mono">{activePlan.source_simulation_id}</strong></span>
                        </div>
                      )}

                      {/* Audit Sign-offs */}
                      <div className="space-y-1 pt-1 text-[11px] text-slate-400 border-t border-[#1f2e48]/60">
                        {activePlan.approved_by && (
                          <div className="flex items-center gap-1.5 text-emerald-400">
                            <Check className="w-3.5 h-3.5" />
                            <span>
                              Approved by <strong>{activePlan.approver_name || activePlan.approved_by}</strong> at{' '}
                              {activePlan.approved_at ? new Date(activePlan.approved_at).toLocaleString() : 'N/A'}
                            </span>
                          </div>
                        )}

                        {activePlan.dispatched_by && (
                          <div className="flex items-center gap-1.5 text-cyan-400">
                            <Truck className="w-3.5 h-3.5" />
                            <span>
                              Dispatched by <strong>{activePlan.dispatched_by}</strong> at{' '}
                              {activePlan.dispatched_at ? new Date(activePlan.dispatched_at).toLocaleString() : 'N/A'}
                            </span>
                          </div>
                        )}

                        {activePlan.completed_at && (
                          <div
                            className={`flex items-center gap-1.5 ${
                              activePlan.status === 'delivered' ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {activePlan.status === 'delivered' ? (
                              <PackageCheck className="w-3.5 h-3.5" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {activePlan.status === 'delivered' ? 'Delivered' : 'Failed'} at{' '}
                              {new Date(activePlan.completed_at).toLocaleString()}
                            </span>
                          </div>
                        )}

                        {activePlan.failure_reason && (
                          <div className="text-red-300 bg-red-950/40 p-2 rounded border border-red-900/60 mt-1">
                            <strong>Failure Cause:</strong> {activePlan.failure_reason}
                          </div>
                        )}

                        {activePlan.execution_notes && (
                          <div className="text-slate-300 italic pt-0.5">
                            &ldquo;{activePlan.execution_notes}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Controls by Lifecycle Phase */}
                    {(activePlan.status === 'draft' || activePlan.status === 'modified') && canManagePlans && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={approvalNotes}
                          onChange={(e) => setApprovalNotes(e.target.value)}
                          placeholder="Optional approval authorization notes..."
                          className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => handleApprovePlan(activePlan.id)}
                            disabled={actionLoading}
                            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Approve Plan</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleOpenEditModal}
                            disabled={actionLoading}
                            className="py-2.5 rounded-xl bg-[#1f2e48] hover:bg-[#283b5c] text-cyan-300 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 border border-cyan-800/40"
                          >
                            <Edit3 className="w-4 h-4 text-cyan-400" />
                            <span>Edit Allocations</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowRejectModal(true)}
                            disabled={actionLoading}
                            className="py-2.5 rounded-xl bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Approved -> Dispatch Control */}
                    {activePlan.status === 'approved' && canManagePlans && (
                      <div className="space-y-2 bg-[#070b12] p-3 rounded-xl border border-emerald-900/40">
                        <div className="text-[11px] text-emerald-300 flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>Authorized by Command Officer. Ready for physical inventory dispatch.</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenDispatchModal}
                          disabled={actionLoading}
                          className="w-full py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/50 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <Truck className="w-4 h-4" />
                          <span>Execute &amp; Dispatch Response Plan (Deduct Inventory)</span>
                        </button>
                      </div>
                    )}

                    {/* In Transit -> Field Delivery or Failure */}
                    {activePlan.status === 'in_transit' && canExecuteDelivery && (
                      <div className="space-y-2 bg-[#070b12] p-3 rounded-xl border border-cyan-900/40">
                        <div className="text-[11px] text-cyan-300 flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />
                          <span>Mission Active. Vehicles deployed to zone. Awaiting field confirmation.</span>
                        </div>
                        <input
                          type="text"
                          value={deliveryNotes}
                          onChange={(e) => setDeliveryNotes(e.target.value)}
                          placeholder="Field delivery confirmation notes (optional)..."
                          className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={handleDeliverPlan}
                            disabled={actionLoading}
                            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <PackageCheck className="w-4 h-4" />
                            <span>Confirm Delivery</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setFailReason('');
                              setFailError(null);
                              setShowFailModal(true);
                            }}
                            disabled={actionLoading}
                            className="py-2.5 rounded-xl bg-red-950/70 hover:bg-red-900 border border-red-800 text-red-300 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            <span>Report Failure</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Failed -> Reallocation Workflow */}
                    {activePlan.status === 'failed' && canManagePlans && (
                      <div className="space-y-2 bg-[#070b12] p-3 rounded-xl border border-red-900/40">
                        <div className="text-[11px] text-red-300 flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                          <span>Transport disrupted. Run reallocation to draft replacement against live stock.</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleReallocatePlan}
                          disabled={actionLoading}
                          className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <RotateCw className={`w-4 h-4 ${actionLoading ? 'animate-spin' : ''}`} />
                          <span>Reallocate Replacement Plan (Audited Draft)</span>
                        </button>
                      </div>
                    )}

                    {/* Delivered Message */}
                    {activePlan.status === 'delivered' && (
                      <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Mission completed successfully. Supplies delivered to designated relief sector.</span>
                      </div>
                    )}

                    {/* Rejected Message */}
                    {activePlan.status === 'rejected' && (
                      <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <span>Plan rejected. New demand calculation or parameters required.</span>
                      </div>
                    )}

                    {!canManagePlans && !canExecuteDelivery && (
                      <div className="text-[11px] text-slate-500 italic p-2 bg-[#070b12] rounded-lg">
                        Clearance Note: Executive plan modification and dispatch authorization is restricted to Command Center Officers.
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    No active recommendation drafted for {selectedZone?.name}. Select <button type="button" onClick={() => setSelectedZoneId('zone-a')} className="text-cyan-400 underline font-semibold cursor-pointer">Zone A</button> to inspect the canonical response plan.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4. Bottom Operational Management Tabs (Reports Queue, Roads, Simulation Spec) */}
        <section className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl overflow-hidden shadow-2xl">
          {/* Tab Navigation */}
          <div className="flex items-center gap-2 border-b border-[#1f2e48] p-3 bg-[#131e31]">
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'reports'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Incoming Citizen Distress Reports ({reports.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('roads')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'roads'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Navigation className="w-4 h-4" />
              <span>Road Segments &amp; Hazards ({roads.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('simulation')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
                activeTab === 'simulation'
                  ? 'bg-cyan-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>What-If Simulation Engine</span>
            </button>
          </div>

          <div className="p-5">
            {/* Tab 1: Citizen Distress Reports Table */}
            {activeTab === 'reports' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Displaying live citizen situations ingested via public channels and web forms.</span>
                  <span className="text-[11px] text-cyan-400">Clearance: Contact details revealed to verified officers</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#131e31] text-slate-400 uppercase font-semibold text-[10px]">
                      <tr>
                        <th className="p-2.5">ID / Category</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5">Location</th>
                        <th className="p-2.5">People</th>
                        <th className="p-2.5">Urgency</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Contact Number</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f2e48]">
                      {reports.map((rep) => (
                        <tr key={rep.id} className="hover:bg-[#131e31]/40">
                          <td className="p-2.5 font-bold text-white whitespace-nowrap">
                            <div>{rep.id}</div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 uppercase">
                              {rep.category || 'emergency'}
                            </span>
                          </td>
                          <td className="p-2.5 text-slate-300 max-w-xs truncate" title={rep.description}>
                            {rep.description}
                          </td>
                          <td className="p-2.5 text-slate-400 whitespace-nowrap">
                            {rep.location_name || `Lat ${rep.location_lat.toFixed(2)}, Lng ${rep.location_lng.toFixed(2)}`}
                          </td>
                          <td className="p-2.5 font-mono text-white whitespace-nowrap">
                            {rep.people_affected || 1}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            {rep.medical_need ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-300 border border-red-800">
                                CRITICAL MEDICAL
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                                Standard
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
                              {rep.status}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-xs text-white whitespace-nowrap">
                            {rep.contact_number ? (
                              <span className="flex items-center gap-1 text-emerald-400">
                                <Phone className="w-3 h-3" />
                                {rep.contact_number}
                              </span>
                            ) : (
                              <span className="text-slate-500">Not provided</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 2: Road Segments Table */}
            {activeTab === 'roads' && (
              <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#131e31] text-slate-400 uppercase font-semibold text-[10px]">
                      <tr>
                        <th className="p-2.5">Road Name</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Length</th>
                        <th className="p-2.5">Risk Score</th>
                        <th className="p-2.5">Condition Guidance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1f2e48]">
                      {roads.map((road) => (
                        <tr key={road.id} className="hover:bg-[#131e31]/40">
                          <td className="p-2.5 font-bold text-white">{road.name}</td>
                          <td className="p-2.5 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                road.status === 'blocked'
                                  ? 'bg-red-950 text-red-300 border border-red-800'
                                  : road.status === 'partial'
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              }`}
                            >
                              {road.status}
                            </span>
                          </td>
                          <td className="p-2.5 font-mono text-slate-300">{road.length_km} km</td>
                          <td className="p-2.5 font-mono text-slate-300">{road.risk_score}/100</td>
                          <td className="p-2.5 text-slate-400">
                            {road.status === 'blocked' && 'Deep inundation. High vehicle danger.'}
                            {road.status === 'partial' && 'Caution: Water across shoulder.'}
                            {road.status === 'accessible' && 'Traversable for emergency transport.'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 3: What-If Simulation Engine (PRD Module 9) */}
            {activeTab === 'simulation' && (
              <div className="bg-[#131e31] p-6 rounded-2xl border border-cyan-500/40 space-y-6 shadow-2xl">
                {/* Header & Purpose */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1f2e48]">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 uppercase tracking-wider font-mono">
                        PRD MODULE 9 &bull; WHAT-IF SIMULATION ENGINE
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        Target Zone: <span className="text-white font-bold">{selectedZone?.name || selectedZoneId}</span>
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-white">
                      Disaster Constraint Stress-Test Simulation
                    </h3>
                    <p className="text-xs text-slate-300 max-w-2xl mt-0.5 leading-relaxed">
                      Evaluate hypothetical fleet losses, depot inventory reductions, or road severance against deterministic zone demand without altering live operational data.
                    </p>
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-[#0d1522] border border-cyan-500/30 text-[11px] font-mono text-cyan-300 self-start sm:self-auto flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-cyan-400" />
                    <span>In-Memory Sandbox</span>
                  </div>
                </div>

                {/* Simulation Only Non-Mutation Disclaimer */}
                <div className="p-3 bg-[#0d1522] rounded-xl border border-amber-500/40 flex items-start gap-2.5 text-xs text-amber-200">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white">Simulation only — no real resources or routes changed: </span>
                    Calculations run deterministically on an in-memory clone of live database telemetry. Real inventory levels, fleet availability, road statuses, and approved response plans remain 100% untouched.
                  </div>
                </div>

                {/* Scenario Form */}
                <form onSubmit={handleRunSimulation} className="space-y-5 bg-[#0d1522] p-5 rounded-xl border border-[#1f2e48]">
                  {/* Scenario Type Selection */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2">
                      Select Stress-Test Scenario Type:
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSimScenarioType('fleet_reduction');
                          setSimError(null);
                        }}
                        className={`p-3 rounded-xl border text-left transition ${
                          simScenarioType === 'fleet_reduction'
                            ? 'bg-cyan-950/60 border-cyan-500 text-white shadow-lg shadow-cyan-950/50'
                            : 'bg-[#131e31] border-[#1f2e48] text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-xs mb-1">
                          <Truck className="w-4 h-4 text-cyan-400" />
                          <span>Fleet Reduction</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Simulate sudden loss of vehicles or rescue boats due to water inundation.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSimScenarioType('inventory_reduction');
                          setSimError(null);
                        }}
                        className={`p-3 rounded-xl border text-left transition ${
                          simScenarioType === 'inventory_reduction'
                            ? 'bg-amber-950/60 border-amber-500 text-white shadow-lg shadow-amber-950/50'
                            : 'bg-[#131e31] border-[#1f2e48] text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-xs mb-1">
                          <Activity className="w-4 h-4 text-amber-400" />
                          <span>Stock Depletion</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Simulate percentage loss of food ration packs or potable water stock.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSimScenarioType('road_blockage');
                          setSimError(null);
                        }}
                        className={`p-3 rounded-xl border text-left transition ${
                          simScenarioType === 'road_blockage'
                            ? 'bg-red-950/60 border-red-500 text-white shadow-lg shadow-red-950/50'
                            : 'bg-[#131e31] border-[#1f2e48] text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold text-xs mb-1">
                          <Navigation className="w-4 h-4 text-red-400" />
                          <span>Road Cut-off</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Simulate sudden embankment collapse or flooding on critical bypass routes.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Scenario Inputs */}
                  <div className="pt-2 border-t border-[#1f2e48]">
                    {/* 1. Fleet Reduction Inputs */}
                    {simScenarioType === 'fleet_reduction' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Target Depot Scope
                          </label>
                          <select
                            value={simScopeCenter}
                            onChange={(e) => setSimScopeCenter(e.target.value)}
                            className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500"
                          >
                            <option value="">All Regional Depots (Greedy Distribution)</option>
                            {centers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.vehicles_available} veh, {c.boats_available} boats)
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Simulated Vehicles to Remove
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="21"
                            value={simRemoveVehicles}
                            onChange={(e) => setSimRemoveVehicles(parseInt(e.target.value || '0', 10))}
                            className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Simulated Rescue Boats to Remove
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="8"
                            value={simRemoveBoats}
                            onChange={(e) => setSimRemoveBoats(parseInt(e.target.value || '0', 10))}
                            className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* 2. Stock Reduction Inputs */}
                    {simScenarioType === 'inventory_reduction' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Target Depot Scope
                          </label>
                          <select
                            value={simScopeCenter}
                            onChange={(e) => setSimScopeCenter(e.target.value)}
                            className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500"
                          >
                            <option value="">All Regional Depots (Proportional)</option>
                            {centers.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Target Resource Category
                          </label>
                          <select
                            value={simResourceType}
                            onChange={(e) => setSimResourceType(e.target.value as any)}
                            className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500"
                          >
                            <option value="">All Consumables (Food &amp; Water)</option>
                            <option value="food_kits">Food Relief Ration Kits</option>
                            <option value="water_units">Potable Water Units</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Stock Reduction Deficit: <span className="text-amber-400 font-bold">{simReduceStockPct}%</span>
                          </label>
                          <input
                            type="range"
                            min="10"
                            max="90"
                            step="5"
                            value={simReduceStockPct}
                            onChange={(e) => setSimReduceStockPct(parseInt(e.target.value, 10))}
                            className="w-full accent-amber-500 cursor-pointer mt-2"
                          />
                        </div>
                      </div>
                    )}

                    {/* 3. Road Blockage Inputs */}
                    {simScenarioType === 'road_blockage' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                            Simulate Severed Road Segment
                          </label>
                          <select
                            value={simBlockedRoadId}
                            onChange={(e) => setSimBlockedRoadId(e.target.value)}
                            className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500"
                          >
                            {roads.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name} ({r.length_km} km &bull; Current: {r.status.toUpperCase()})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="text-xs text-slate-400 flex flex-col justify-center">
                          <span className="font-semibold text-slate-300">Simulated Consequence:</span>
                          <span className="text-[11px] mt-0.5">
                            Evaluates whether primary convoy route from Barpeta Base #3 is severed and flags emergency transport constraints.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Error Notification */}
                  {simError && (
                    <div className="p-3 bg-red-950/40 border border-red-500/50 rounded-xl text-xs text-red-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{simError}</span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-slate-500 font-mono">
                      Evaluating Zone: {selectedZone?.name || selectedZoneId} &bull; {planningDays} Planning Days
                    </span>

                    <button
                      type="submit"
                      disabled={simLoading}
                      className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/50 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {simLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                          <span>Executing Deterministic Simulation...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-cyan-200" />
                          <span>Run What-If Simulation &rarr;</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* Simulation Output & Baseline Comparison */}
                {simResult && (
                  <div className="space-y-6 pt-2">
                    {/* Result Header & Persisted Run Info */}
                    <div className="bg-[#0d1522] p-4 rounded-xl border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-cyan-400">
                            Run ID: {simResult.simulation_id}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                            PERSISTED TO AUDIT
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {new Date(simResult.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                          {simResult.summary_explanation}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                        {canManagePlans && (
                          <button
                            type="button"
                            onClick={handlePromoteSimulation}
                            disabled={promoteLoading}
                            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-950/40"
                          >
                            {promoteLoading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                            )}
                            <span>Promote to Draft Plan</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSimResult(null)}
                          className="px-3 py-1.5 rounded-lg bg-[#131e31] hover:bg-[#1a2942] border border-[#1f2e48] text-xs text-slate-300 flex items-center gap-1.5 transition cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Clear Results</span>
                        </button>
                      </div>
                    </div>

                    {/* Baseline vs Scenario Diff Table */}
                    <div className="bg-[#0d1522] rounded-xl border border-[#1f2e48] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                          Baseline vs. Simulated Allocation Comparison
                        </h4>
                        <span className="text-[11px] font-mono text-slate-400">
                          Horizon: {simResult.planning_days} Days
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-[#131e31] text-slate-400 uppercase font-semibold text-[10px]">
                            <tr>
                              <th className="p-2.5">Resource</th>
                              <th className="p-2.5">Requested Demand</th>
                              <th className="p-2.5">Baseline Allocated</th>
                              <th className="p-2.5">Simulated Allocated</th>
                              <th className="p-2.5">Simulated Unmet</th>
                              <th className="p-2.5">Deficit Increase</th>
                              <th className="p-2.5 text-right">Outcome Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1f2e48]">
                            {simResult.comparison.resources.map((r) => (
                              <tr key={r.resource_type} className="hover:bg-[#131e31]/40">
                                <td className="p-2.5 font-bold text-white">{r.name}</td>
                                <td className="p-2.5 font-mono text-slate-300">
                                  {r.requested_quantity.toLocaleString()} {r.unit}
                                </td>
                                <td className="p-2.5 font-mono text-slate-300">
                                  {r.baseline_allocated.toLocaleString()} {r.unit}
                                </td>
                                <td className="p-2.5 font-mono font-bold text-cyan-300">
                                  {r.simulated_allocated.toLocaleString()} {r.unit}
                                </td>
                                <td className="p-2.5 font-mono">
                                  <span className={r.simulated_unmet > 0 ? 'text-red-400 font-bold' : 'text-slate-400'}>
                                    {r.simulated_unmet.toLocaleString()} {r.unit}
                                  </span>
                                </td>
                                <td className="p-2.5 font-mono">
                                  {r.unmet_increase > 0 ? (
                                    <span className="text-red-400 font-bold">+{r.unmet_increase.toLocaleString()} {r.unit}</span>
                                  ) : (
                                    <span className="text-slate-500">0</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      r.shortage_status === 'fulfilled'
                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                        : r.shortage_status === 'new_shortage'
                                        ? 'bg-red-950 text-red-300 border border-red-800'
                                        : r.shortage_status === 'worsened'
                                        ? 'bg-red-950 text-red-300 border border-red-800'
                                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                                    }`}
                                  >
                                    {r.shortage_status === 'fulfilled' && '100% Fulfilled'}
                                    {r.shortage_status === 'new_shortage' && 'New Shortage'}
                                    {r.shortage_status === 'worsened' && 'Deficit Worsened'}
                                    {r.shortage_status === 'unchanged' && 'Unchanged'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Supplying Centers Shift (if any) */}
                    {simResult.comparison.supplying_centers_diff.length > 0 && (
                      <div className="bg-[#0d1522] rounded-xl border border-[#1f2e48] p-4 space-y-2">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                          Supplying Depot Dispatch Shift (Multi-Center Split)
                        </h4>
                        <div className="space-y-1.5">
                          {simResult.comparison.supplying_centers_diff.map((diff, idx) => (
                            <div
                              key={idx}
                              className="text-xs flex items-center justify-between text-slate-300 py-1 border-b border-[#1f2e48] last:border-0"
                            >
                              <span>
                                {diff.center_name} &bull; <span className="text-slate-400">{diff.resource_type}</span>
                              </span>
                              <div className="font-mono text-xs flex items-center gap-3">
                                <span className="text-slate-500">
                                  {diff.baseline_quantity.toLocaleString()} &rarr; {diff.simulated_quantity.toLocaleString()}
                                </span>
                                <span
                                  className={`font-bold ${
                                    diff.delta > 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}
                                >
                                  {diff.delta > 0 ? `+${diff.delta.toLocaleString()}` : diff.delta.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Road Impact Notice (if road blockage simulated) */}
                    {simResult.comparison.road_impact && (
                      <div className="bg-[#0d1522] rounded-xl border border-red-500/40 p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <Navigation className="w-4 h-4 text-red-400" />
                          <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">
                            Simulated Road Network Severance Notice
                          </h4>
                        </div>
                        <div className="text-xs text-slate-300 leading-relaxed">
                          <span className="font-bold text-white">
                            {simResult.comparison.road_impact.road_name}:{' '}
                          </span>
                          {simResult.comparison.road_impact.routing_impact_notice}
                        </div>
                      </div>
                    )}

                    {/* AI Mitigations */}
                    <div className="bg-[#0d1522] rounded-xl border border-cyan-500/30 p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                          Suggested Mitigations &amp; Contingency Actions
                        </h4>
                      </div>
                      <ul className="space-y-1.5 list-disc list-inside text-xs text-slate-300">
                        {simResult.suggested_mitigations.map((m, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Rejection Modal Dialog */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0d1522] border border-red-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-400 font-bold text-base">
              <XCircle className="w-5 h-5" />
              <span>Reject Response Plan</span>
            </div>
            <p className="text-xs text-slate-300">
              State the operational reason for rejecting Plan #{activePlan?.id}. This feedback will be recorded in the audit log for algorithmic retraining.
            </p>
            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Route A impassable; recalculate using Route C from Depot 3..."
              className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-red-500 rounded-xl p-3 text-xs text-white placeholder-slate-500 outline-none"
            />
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-xl bg-[#131e31] text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => activePlan && handleRejectPlan(activePlan.id)}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Plan Before Approval Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0d1522] border border-cyan-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-base">
              <Edit3 className="w-5 h-5" />
              <span>Modify Response Plan Allocations</span>
            </div>
            <p className="text-xs text-slate-300">
              Operator override before final approval. Adjust proposed supply quantities or supplying hub. Changes and operator justification are permanently recorded in the audit registry.
            </p>

            {editError && (
              <div className="p-3 bg-red-950/60 border border-red-700 rounded-xl text-xs text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Supplying Resource Depot
                </label>
                <select
                  value={editCenterId}
                  onChange={(e) => setEditCenterId(e.target.value)}
                  className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-500"
                >
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Hub #{c.id})
                    </option>
                  ))}
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Route feasibility will be validated server-side. Blocked segments (e.g. Route A) will be rejected.
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Boats</label>
                  <input
                    type="number"
                    min="0"
                    value={editQuantities.boats}
                    onChange={(e) =>
                      setEditQuantities({ ...editQuantities, boats: Math.max(0, parseInt(e.target.value || '0', 10)) })
                    }
                    className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Food Kits</label>
                  <input
                    type="number"
                    min="0"
                    value={editQuantities.food_kits}
                    onChange={(e) =>
                      setEditQuantities({ ...editQuantities, food_kits: Math.max(0, parseInt(e.target.value || '0', 10)) })
                    }
                    className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Water Units</label>
                  <input
                    type="number"
                    min="0"
                    value={editQuantities.water_units}
                    onChange={(e) =>
                      setEditQuantities({ ...editQuantities, water_units: Math.max(0, parseInt(e.target.value || '0', 10)) })
                    }
                    className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Med Teams</label>
                  <input
                    type="number"
                    min="0"
                    value={editQuantities.medical_teams}
                    onChange={(e) =>
                      setEditQuantities({
                        ...editQuantities,
                        medical_teams: Math.max(0, parseInt(e.target.value || '0', 10)),
                      })
                    }
                    className="w-full bg-[#131e31] border border-[#1f2e48] rounded-xl p-2 text-xs text-white outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Reason for Plan Modification <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Higher water shortage observed by ground teams; adjusting quantity from 600 to 750..."
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-xl bg-[#131e31] text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePlanEdit}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50 shadow-md"
              >
                {actionLoading ? 'Saving...' : 'Save Modifications'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Confirmation Modal (Safe Inventory Deduction) */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-[#0d1522] border border-cyan-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-base">
              <Truck className="w-5 h-5" />
              <span>Confirm Response Plan Dispatch &amp; Stock Deduction</span>
            </div>

            <p className="text-xs text-slate-300">
              Executing this approved plan will initiate convoy dispatch. Warehouse inventory will be deducted immediately in an atomic PostgreSQL transaction with row locks.
            </p>

            {/* Atomic Protection Banner */}
            <div className="p-3 bg-[#070b12] border border-cyan-900/60 rounded-xl text-xs space-y-1">
              <div className="font-bold text-slate-200">Pre-Flight Safety Check:</div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Stock availability is verified inside the transaction before any deduction. If any resource is deficient, the transaction aborts with zero inventory mutated.
              </p>
            </div>

            {/* Shortage Error Banner (PRD FR-6.3) */}
            {dispatchError && (
              <div className="p-3.5 bg-red-950/70 border border-red-600 rounded-xl text-xs text-red-200 space-y-1">
                <div className="flex items-center gap-2 font-bold text-red-300">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Insufficient Warehouse Stock</span>
                </div>
                <div className="text-[11px] text-red-200 leading-relaxed font-mono">
                  {dispatchError}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Dispatch Execution Notes (Optional)
              </label>
              <textarea
                rows={2}
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                placeholder="e.g. Escort vehicle NDRF-4 assigned; departure via Route C at 13:00 hrs..."
                className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-cyan-500 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                className="px-4 py-2 rounded-xl bg-[#131e31] text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDispatchPlan}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-950/50 flex items-center gap-1.5"
              >
                <Truck className="w-4 h-4" />
                <span>{actionLoading ? 'Executing Atomic Dispatch...' : 'Authorize & Dispatch'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transport Failure Modal */}
      {showFailModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0d1522] border border-red-500/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-400 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>Report Response Plan Transport Failure</span>
            </div>

            <p className="text-xs text-slate-300">
              State the operational disruption reason and declare the inventory disposition. All records are permanently audited.
            </p>

            {failError && (
              <div className="p-3 bg-red-950/60 border border-red-700 rounded-xl text-xs text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{failError}</span>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Disruption / Failure Reason <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={failReason}
                  onChange={(e) => setFailReason(e.target.value)}
                  placeholder="e.g. Bridge submerged at Route C km 8; convoy forced to abort..."
                  className="w-full bg-[#131e31] border border-[#1f2e48] focus:border-red-500 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                  Inventory Disposition
                </label>
                <div className="space-y-2 text-xs">
                  <label className="flex items-start gap-2 p-2.5 rounded-xl bg-[#131e31] border border-[#1f2e48] cursor-pointer hover:border-cyan-500/50">
                    <input
                      type="radio"
                      name="disposition"
                      value="stock_returned"
                      checked={failDisposition === 'stock_returned'}
                      onChange={() => setFailDisposition('stock_returned')}
                      className="mt-0.5"
                    />
                    <div>
                      <strong className="text-emerald-400 block">Stock Returned to Depot (Restitution)</strong>
                      <span className="text-[11px] text-slate-400">
                        Supplies were safely brought back to warehouse and inventory restored.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2 p-2.5 rounded-xl bg-[#131e31] border border-[#1f2e48] cursor-pointer hover:border-red-500/50">
                    <input
                      type="radio"
                      name="disposition"
                      value="stock_lost"
                      checked={failDisposition === 'stock_lost'}
                      onChange={() => setFailDisposition('stock_lost')}
                      className="mt-0.5"
                    />
                    <div>
                      <strong className="text-red-400 block">Stock Lost / Destroyed</strong>
                      <span className="text-[11px] text-slate-400">
                        Supplies were washed away, damaged, or lost in transit. Inventory is NOT refunded.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowFailModal(false)}
                className="px-4 py-2 rounded-xl bg-[#131e31] text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFailPlan}
                disabled={actionLoading}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Logging Failure...' : 'Confirm Failure Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#1f2e48] bg-[#0d1522] px-6 py-4 text-center text-xs text-slate-500">
        AAROH &copy; 2026 &bull; Command Center &amp; District Decision Intelligence.
      </footer>
    </div>
  );
}

export default CommandCenterPage;
