import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { NavigationHeader } from '../components/NavigationHeader';
import {
  api,
  ApiError,
  AdminSystemOverview,
  AdminUserItem,
} from '../services/api';
import {
  UserRole,
  DepartmentType,
  PriorityWeights,
  PriorityWeightsPercentages,
  PrioritySettingsResponse,
} from '@relief-os/shared';
import { getRoleBadgeLabel, getDepartmentLabel } from '../utils/auth-roles';
import {
  ShieldAlert,
  Users,
  FileText,
  HeartPulse,
  Package,
  LifeBuoy,
  RefreshCw,
  Search,
  UserPlus,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Server,
  Activity,
  Layers,
  Lock,
  Sliders,
  RotateCcw,
  Save,
  Loader2,
} from 'lucide-react';

export function AdminPage() {
  const { user } = useAuth();

  // State
  const [overview, setOverview] = useState<AdminSystemOverview | null>(null);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters for user directory
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  // Role Edit Modal State
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('citizen');
  const [editDept, setEditDept] = useState<DepartmentType | ''>('');
  const [isUpdatingRole, setIsUpdatingRole] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // User Provisioning Modal State
  const [showProvisionModal, setShowProvisionModal] = useState<boolean>(false);
  const [provName, setProvName] = useState<string>('');
  const [provEmail, setProvEmail] = useState<string>('');
  const [provPassword, setProvPassword] = useState<string>('');
  const [provRole, setProvRole] = useState<UserRole>('department');
  const [provDept, setProvDept] = useState<DepartmentType | ''>('health');
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);
  const [provError, setProvError] = useState<string | null>(null);

  // Active Tab View Navigation ('overview' | 'users' | 'settings' | 'all')
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'settings' | 'all'>('overview');

  // Priority Scoring Weights & Settings State (PRD Module 4)
  const [prioritySettings, setPrioritySettings] = useState<PrioritySettingsResponse | null>(null);
  const [weightInputs, setWeightInputs] = useState<PriorityWeightsPercentages>({
    population: 25,
    severity: 20,
    medical: 20,
    shortage: 15,
    accessibility: 10,
    vulnerability: 10,
  });
  const [weightsSaving, setWeightsSaving] = useState<boolean>(false);
  const [weightsResetting, setWeightsResetting] = useState<boolean>(false);
  const [weightsFeedback, setWeightsFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Live total weights sum validation
  const totalWeightPercentage = useMemo(() => {
    return (
      (Number(weightInputs.population) || 0) +
      (Number(weightInputs.severity) || 0) +
      (Number(weightInputs.medical) || 0) +
      (Number(weightInputs.shortage) || 0) +
      (Number(weightInputs.accessibility) || 0) +
      (Number(weightInputs.vulnerability) || 0)
    );
  }, [weightInputs]);

  // Load Admin Data
  const loadAdminData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [overviewData, usersData, weightsData] = await Promise.all([
        api.getAdminOverview(),
        api.getAdminUsers(),
        api.getPriorityWeights().catch((err) => {
          console.warn('[Admin Settings Warning] Could not load weights:', err);
          return null;
        }),
      ]);
      setOverview(overviewData);
      setUsers(usersData.items);
      if (weightsData) {
        setPrioritySettings(weightsData);
        setWeightInputs(weightsData.percentages);
      }
    } catch (err: unknown) {
      console.error('[Admin Data Load Error]:', err);
      const msg = err instanceof ApiError ? err.message : 'Failed to load administrative console data.';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Handle single weight input change
  const handleWeightChange = (key: keyof PriorityWeightsPercentages, val: number) => {
    const clamped = Math.max(0, Math.min(100, isNaN(val) ? 0 : Math.round(val)));
    setWeightInputs((prev) => ({
      ...prev,
      [key]: clamped,
    }));
    setWeightsFeedback(null);
  };

  // Handle Save Scoring Weights
  const handleSaveWeights = async () => {
    if (totalWeightPercentage !== 100) {
      setWeightsFeedback({
        type: 'error',
        message: `Total weights must equal exactly 100% (currently ${totalWeightPercentage}%). Please adjust sliders.`,
      });
      return;
    }

    setWeightsSaving(true);
    setWeightsFeedback(null);

    try {
      const payload: PriorityWeights = {
        w_population: weightInputs.population / 100,
        w_severity: weightInputs.severity / 100,
        w_medical: weightInputs.medical / 100,
        w_shortage: weightInputs.shortage / 100,
        w_accessibility: weightInputs.accessibility / 100,
        w_vulnerability: weightInputs.vulnerability / 100,
      };

      const res = await api.updatePriorityWeights(payload);
      setPrioritySettings({
        weights: res.weights,
        percentages: res.percentages,
        is_default: res.is_default,
        updated_at: res.updated_at,
      });
      setWeightInputs(res.percentages);
      setWeightsFeedback({
        type: 'success',
        message: res.message || 'Priority scoring weights updated and persisted to database.',
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to persist scoring weights.';
      setWeightsFeedback({ type: 'error', message: msg });
    } finally {
      setWeightsSaving(false);
    }
  };

  // Handle Reset Scoring Weights to Canonical PRD Defaults
  const handleResetWeights = async () => {
    setWeightsResetting(true);
    setWeightsFeedback(null);

    try {
      const res = await api.resetPriorityWeights();
      setPrioritySettings({
        weights: res.weights,
        percentages: res.percentages,
        is_default: res.is_default,
        updated_at: res.updated_at,
      });
      setWeightInputs(res.percentages);
      setWeightsFeedback({
        type: 'success',
        message: 'Priority weights successfully reset to canonical PRD defaults (25%, 20%, 20%, 15%, 10%, 10%).',
      });
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to reset scoring weights.';
      setWeightsFeedback({ type: 'error', message: msg });
    } finally {
      setWeightsResetting(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  // Handle Role Edit Submit
  const handleRoleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsUpdatingRole(true);
    setEditError(null);

    const payloadDept = editRole === 'department' ? (editDept ? editDept : null) : null;

    if (editRole === 'department' && !payloadDept) {
      setEditError("Please select an operational department ('health', 'supply', or 'rescue').");
      setIsUpdatingRole(false);
      return;
    }

    try {
      const res = await api.updateUserRole(editingUser.id, {
        role: editRole,
        department: payloadDept,
      });

      setSuccessMessage(res.message);
      setEditingUser(null);
      await loadAdminData(true);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to update user role.';
      setEditError(msg);
    } finally {
      setIsUpdatingRole(false);
    }
  };

  // Handle Provisioning Submit
  const handleProvisionUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProvisioning(true);
    setProvError(null);

    const payloadDept = provRole === 'department' ? (provDept ? provDept : null) : null;

    if (provRole === 'department' && !payloadDept) {
      setProvError("Please select an operational department ('health', 'supply', or 'rescue').");
      setIsProvisioning(false);
      return;
    }

    try {
      const res = await api.createAdminUser({
        name: provName,
        email: provEmail,
        password: provPassword,
        role: provRole,
        department: payloadDept,
      });

      setSuccessMessage(res.message);
      setShowProvisionModal(false);
      // Reset form
      setProvName('');
      setProvEmail('');
      setProvPassword('');
      setProvRole('department');
      setProvDept('health');
      await loadAdminData(true);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : 'Failed to provision user.';
      setProvError(msg);
    } finally {
      setIsProvisioning(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (u: AdminUserItem) => {
    setEditingUser(u);
    setEditRole(u.role);
    setEditDept(u.department || (u.role === 'department' ? 'health' : ''));
    setEditError(null);
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole =
        roleFilter === 'all'
          ? true
          : roleFilter === 'command_staff'
          ? u.role === 'command_center' || u.role === 'officer'
          : roleFilter === 'department_staff'
          ? u.role === 'department' || u.role === 'coordinator' || u.role === 'team_lead'
          : u.role === roleFilter;

      const matchesDept =
        deptFilter === 'all' ? true : u.department === deptFilter;

      return matchesSearch && matchesRole && matchesDept;
    });
  }, [users, searchQuery, roleFilter, deptFilter]);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans">
      <NavigationHeader />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Top Header Banner */}
        <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-400">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
                    System Administration Console
                    <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                      SECURE ROOT
                    </span>
                  </h1>
                  <p className="text-sm text-slate-400">
                    Administrator: <strong className="text-white">{user?.name || 'Authorized Admin'}</strong> ({user?.email}) &bull; System governance, role-based access control &amp; inter-departmental oversight
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-slate-300">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#131e31] border border-[#1f2e48]">
                  <Server className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Scenario: <strong>{overview?.system.active_disaster_scenario || 'Assam Floods 2026'}</strong></span>
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-950/50 border border-emerald-800/60 text-emerald-300">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Engine: <strong>PostgreSQL + PostGIS</strong></span>
                </span>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-300">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Human-in-the-Loop Governance: <strong>Enforced</strong></span>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => loadAdminData(true)}
                disabled={refreshing || loading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-slate-200 text-sm font-semibold transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 text-cyan-400 ${refreshing ? 'animate-spin' : ''}`} />
                <span>Sync Metrics</span>
              </button>

              <button
                onClick={() => setShowProvisionModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold shadow-lg shadow-cyan-900/30 transition"
              >
                <UserPlus className="w-4 h-4" />
                <span>Provision User</span>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="flex items-center gap-2 border-b border-[#1f2e48] pb-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'overview'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                : 'text-slate-400 hover:text-white hover:bg-[#131e31]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>System Overview</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'users'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                : 'text-slate-400 hover:text-white hover:bg-[#131e31]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>User Directory ({users.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/30'
                : 'text-slate-400 hover:text-white hover:bg-[#131e31]'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>System Settings &amp; Scoring Weights</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition whitespace-nowrap ml-auto ${
              activeTab === 'all'
                ? 'bg-[#1f2e48] text-cyan-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>Show All Sections</span>
          </button>
        </div>

        {/* Global Feedback Messages */}
        {error && (
          <div className="bg-red-950/50 border border-red-500/40 rounded-xl p-4 flex items-center justify-between gap-3 text-red-200 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="p-1 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-xl p-4 flex items-center justify-between gap-3 text-emerald-200 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="p-1 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* System Overview KPI Grid */}
        {(activeTab === 'overview' || activeTab === 'all') && (
          <>
            <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              System Overview &amp; Incident Metrics
            </h2>
            <span className="text-xs text-slate-400">
              Live database state across all modules
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Users KPI */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>REGISTERED USERS</span>
                <Users className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-3xl font-extrabold text-white">
                {overview?.users_summary.total ?? '—'}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-[#1f2e48]">
                <span>Citizens: {overview?.users_summary.citizens ?? 0}</span>
                <span>Command: {overview?.users_summary.command_staff ?? 0}</span>
                <span>Dept: {overview?.users_summary.department_staff ?? 0}</span>
              </div>
            </div>

            {/* Total Reports KPI */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>INGESTED REPORTS</span>
                <FileText className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-3xl font-extrabold text-white">
                {overview?.reports_summary.total ?? '—'}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-[#1f2e48]">
                <span className="text-amber-400">Pending: {overview?.reports_summary.by_status.pending_ai ?? 0}</span>
                <span className="text-blue-400">Analyzed: {overview?.reports_summary.by_status.analyzed ?? 0}</span>
                <span className="text-emerald-400">Verified: {overview?.reports_summary.by_status.verified ?? 0}</span>
              </div>
            </div>

            {/* Critical Severity KPI */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>CRITICAL SEVERITY</span>
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-3xl font-extrabold text-red-400">
                {overview?.reports_summary.by_severity.critical ?? '—'}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-[#1f2e48]">
                <span>High: {overview?.reports_summary.by_severity.high ?? 0}</span>
                <span>Medium: {overview?.reports_summary.by_severity.medium ?? 0}</span>
                <span>Low: {overview?.reports_summary.by_severity.low ?? 0}</span>
              </div>
            </div>

            {/* Medical Emergencies KPI */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>MEDICAL DISTRESS</span>
                <HeartPulse className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-3xl font-extrabold text-rose-400">
                {overview?.reports_summary.medical_urgency_count ?? '—'}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-[#1f2e48]">
                <span>Health Teams: {overview?.departments_overview.health.medical_teams_available ?? 0}</span>
                <span>Monitored: {overview?.departments_overview.health.resource_centers_monitored ?? 0}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Department Operational Readiness Cards */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              Inter-Department Operational Readiness
            </h2>
            <span className="text-xs text-slate-400">
              Health, Supply &amp; Rescue tactical metrics
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Health Department Card */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-400">
                    <HeartPulse className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Health Department</h3>
                    <p className="text-xs text-slate-400">Emergency Medical &amp; Triage</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                  {overview?.users_summary.by_department.health ?? 0} Staff
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div className="bg-[#131e31] p-3 rounded-lg border border-[#1f2e48]">
                  <div className="text-slate-400">Medical Teams Ready</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {overview?.departments_overview.health.medical_teams_available ?? 0}
                  </div>
                </div>
                <div className="bg-[#131e31] p-3 rounded-lg border border-[#1f2e48]">
                  <div className="text-slate-400">Medical Incidents</div>
                  <div className="text-xl font-bold text-rose-400 mt-1">
                    {overview?.departments_overview.health.medical_distress_reports ?? 0}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-[#1f2e48] pt-2">
                <span>Facilities Monitored</span>
                <span className="font-semibold text-white">
                  {overview?.departments_overview.health.resource_centers_monitored ?? 0} Centers
                </span>
              </div>
            </div>

            {/* Supply Department Card */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-950/60 border border-amber-800 text-amber-400">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Supply Department</h3>
                    <p className="text-xs text-slate-400">Food, Water &amp; Warehousing</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                  {overview?.users_summary.by_department.supply ?? 0} Staff
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div className="bg-[#131e31] p-3 rounded-lg border border-[#1f2e48]">
                  <div className="text-slate-400">Food Kits in Stock</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {overview?.departments_overview.supply.food_kits_inventory?.toLocaleString() ?? 0}
                  </div>
                </div>
                <div className="bg-[#131e31] p-3 rounded-lg border border-[#1f2e48]">
                  <div className="text-slate-400">Water Units in Stock</div>
                  <div className="text-xl font-bold text-cyan-400 mt-1">
                    {overview?.departments_overview.supply.water_units_inventory?.toLocaleString() ?? 0}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-[#1f2e48] pt-2">
                <span>Active Warehouses</span>
                <span className="font-semibold text-white">
                  {overview?.departments_overview.supply.active_warehouses ?? 0} Hubs
                </span>
              </div>
            </div>

            {/* Rescue Department Card */}
            <div className="bg-[#0d1522] border border-[#1f2e48] rounded-xl p-5 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-950/60 border border-blue-800 text-blue-400">
                    <LifeBuoy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Rescue Department</h3>
                    <p className="text-xs text-slate-400">Fleet, Evacuation &amp; Road Access</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                  {overview?.users_summary.by_department.rescue ?? 0} Staff
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div className="bg-[#131e31] p-3 rounded-lg border border-[#1f2e48]">
                  <div className="text-slate-400">Total Rescue Fleet</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {overview?.departments_overview.rescue.total_fleet ?? 0}
                  </div>
                </div>
                <div className="bg-[#131e31] p-3 rounded-lg border border-[#1f2e48]">
                  <div className="text-slate-400">Blocked Roads</div>
                  <div className="text-xl font-bold text-red-400 mt-1">
                    {overview?.departments_overview.rescue.blocked_roads ?? 0}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between border-t border-[#1f2e48] pt-2">
                <span>Vehicles: {overview?.departments_overview.rescue.vehicles_available ?? 0} | Boats: {overview?.departments_overview.rescue.boats_available ?? 0}</span>
                <span className="font-semibold text-amber-300">
                  {overview?.departments_overview.rescue.rescue_priority_reports ?? 0} Rescue Urgencies
                </span>
              </div>
            </div>
          </div>
        </section>
          </>
        )}

        {/* User Directory & Role Governance Section */}
        {(activeTab === 'users' || activeTab === 'all') && (
        <section className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                Authorized User Directory &amp; Access Control
              </h2>
              <p className="text-xs text-slate-400">
                Manage system roles, department assignments, and operational permissions (passwords sanitized)
              </p>
            </div>

            <div className="text-xs text-slate-400">
              Showing <strong>{filteredUsers.length}</strong> of <strong>{users.length}</strong> users
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search by name, email, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Roles</option>
                <option value="citizen">Citizen Only</option>
                <option value="command_staff">Command Center / Officer</option>
                <option value="department_staff">Department / Field Leads</option>
                <option value="admin">System Administrator</option>
              </select>
            </div>

            <div>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Departments</option>
                <option value="health">Health &amp; Medical</option>
                <option value="supply">Supply &amp; Logistics</option>
                <option value="rescue">Rescue &amp; Evacuation</option>
              </select>
            </div>
          </div>

          {/* User Table */}
          <div className="overflow-x-auto border border-[#1f2e48] rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#131e31] text-slate-400 font-semibold border-b border-[#1f2e48]">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department Assignment</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2e48] text-slate-300">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No user accounts found matching current search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-[#131e31]/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white">{u.name}</div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{u.id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-medium text-[11px] border ${
                            u.role === 'admin'
                              ? 'bg-purple-950/70 text-purple-300 border-purple-800'
                              : u.role === 'command_center' || u.role === 'officer'
                              ? 'bg-blue-950/70 text-blue-300 border-blue-800'
                              : u.role === 'department' || u.role === 'coordinator' || u.role === 'team_lead'
                              ? 'bg-cyan-950/70 text-cyan-300 border-cyan-800'
                              : 'bg-slate-800/80 text-slate-300 border-slate-700'
                          }`}
                        >
                          {getRoleBadgeLabel(u.role)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {u.department ? (
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-medium text-[11px] border ${
                              u.department === 'health'
                                ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                                : u.department === 'supply'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                                : 'bg-blue-950/60 text-blue-300 border-blue-800'
                            }`}
                          >
                            {getDepartmentLabel(u.department)}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">None (Global / Citizen)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(u.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openEditModal(u)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a2842] hover:bg-[#233556] border border-[#2b3e64] text-cyan-300 hover:text-white text-xs font-semibold transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Modify Role</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {/* Reports Pipeline & Status Overview */}
        {(activeTab === 'overview' || activeTab === 'all') && (
        <section className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-cyan-400" />
              Incident Reports Status &amp; Severity Breakdown
            </h2>
            <span className="text-xs text-slate-400">
              Total Ingested: <strong>{overview?.reports_summary.total ?? 0}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Status Breakdown */}
            <div className="bg-[#131e31] p-5 rounded-xl border border-[#1f2e48] space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Verification Pipeline
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-400 font-semibold">Pending AI Analysis</span>
                  <span className="font-bold text-white">{overview?.reports_summary.by_status.pending_ai ?? 0}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full"
                    style={{
                      width: `${
                        overview?.reports_summary.total
                          ? ((overview.reports_summary.by_status.pending_ai || 0) / overview.reports_summary.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-2">
                  <span className="text-blue-400 font-semibold">Analyzed &amp; Classified</span>
                  <span className="font-bold text-white">{overview?.reports_summary.by_status.analyzed ?? 0}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-400 h-full"
                    style={{
                      width: `${
                        overview?.reports_summary.total
                          ? ((overview.reports_summary.by_status.analyzed || 0) / overview.reports_summary.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-2">
                  <span className="text-emerald-400 font-semibold">Verified by Responders</span>
                  <span className="font-bold text-white">{overview?.reports_summary.by_status.verified ?? 0}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-400 h-full"
                    style={{
                      width: `${
                        overview?.reports_summary.total
                          ? ((overview.reports_summary.by_status.verified || 0) / overview.reports_summary.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Severity Breakdown */}
            <div className="bg-[#131e31] p-5 rounded-xl border border-[#1f2e48] space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Severity Distribution
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-red-400 font-semibold">Critical Distress</span>
                  <span className="font-bold text-white">{overview?.reports_summary.by_severity.critical ?? 0}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-red-500 h-full"
                    style={{
                      width: `${
                        overview?.reports_summary.total
                          ? ((overview.reports_summary.by_severity.critical || 0) / overview.reports_summary.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-2">
                  <span className="text-orange-400 font-semibold">High Priority</span>
                  <span className="font-bold text-white">{overview?.reports_summary.by_severity.high ?? 0}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-orange-400 h-full"
                    style={{
                      width: `${
                        overview?.reports_summary.total
                          ? ((overview.reports_summary.by_severity.high || 0) / overview.reports_summary.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-2">
                  <span className="text-yellow-400 font-semibold">Medium</span>
                  <span className="font-bold text-white">{overview?.reports_summary.by_severity.medium ?? 0}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-yellow-400 h-full"
                    style={{
                      width: `${
                        overview?.reports_summary.total
                          ? ((overview.reports_summary.by_severity.medium || 0) / overview.reports_summary.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs pt-2">
                  <span className="text-slate-400 font-semibold">Low</span>
                  <span className="font-bold text-white">{overview?.reports_summary.by_severity.low ?? 0}</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-slate-400 h-full"
                    style={{
                      width: `${
                        overview?.reports_summary.total
                          ? ((overview.reports_summary.by_severity.low || 0) / overview.reports_summary.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* System Settings & Scoring Weights Section (PRD Module 4 & 5) */}
        {(activeTab === 'settings' || activeTab === 'all') && (
          <section className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1f2e48] pb-5">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-400">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
                      Priority Scoring Weights &amp; System Settings
                      {prioritySettings?.is_default && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          PRD CANONICAL DEFAULTS ACTIVE
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      PRD Module 4 &amp; 5: Configure multi-factor weights (0–100 formula) and inspect demand prediction parameters
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleResetWeights}
                  disabled={weightsSaving || weightsResetting}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-slate-300 hover:text-white text-xs font-semibold transition disabled:opacity-50"
                  title="Restore PRD canonical baseline weights (25%, 20%, 20%, 15%, 10%, 10%)"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${weightsResetting ? 'animate-spin' : ''}`} />
                  <span>Reset to Defaults</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveWeights}
                  disabled={weightsSaving || totalWeightPercentage !== 100}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:border-slate-700 text-white text-xs font-bold shadow-lg shadow-cyan-900/30 transition"
                >
                  {weightsSaving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save Scoring Weights</span>
                </button>
              </div>
            </div>

            {/* Weights Specific Feedback Banner */}
            {weightsFeedback && (
              <div
                className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                  weightsFeedback.type === 'success'
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
                    : 'bg-red-950/60 border-red-500/50 text-red-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {weightsFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span>{weightsFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setWeightsFeedback(null)}
                  className="p-1 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Total Weight Validation Gauge */}
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs transition-colors ${
                totalWeightPercentage === 100
                  ? 'bg-emerald-950/40 border-emerald-800/70 text-emerald-200'
                  : 'bg-amber-950/40 border-amber-800/70 text-amber-200'
              }`}
            >
              <div className="flex items-center gap-3">
                {totalWeightPercentage === 100 ? (
                  <div className="p-2 rounded-lg bg-emerald-900/60 text-emerald-300">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-amber-900/60 text-amber-300">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <div className="font-bold text-sm">
                    {totalWeightPercentage === 100
                      ? 'Valid Configuration (Total = 100%)'
                      : `Weight Allocation Sum: ${totalWeightPercentage}% (Must equal 100%)`}
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {totalWeightPercentage === 100
                      ? 'The six composite impact scoring dimensions total 100%. Ready to persist.'
                      : `Weights must sum to 100% to save. Delta: ${
                          100 - totalWeightPercentage > 0
                            ? `+${100 - totalWeightPercentage}% needed`
                            : `${totalWeightPercentage - 100}% over limit`
                        }.`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center font-mono">
                <div className="text-right">
                  <span className="text-2xl font-black text-white">{totalWeightPercentage}%</span>
                  <span className="block text-[10px] text-slate-400">TARGET: 100%</span>
                </div>
              </div>
            </div>

            {/* 6 Dimension Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* 1. Population Impact */}
              <div className="bg-[#131e31] border border-[#1f2e48] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>1. Population Impact</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">(w1)</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                    Default: 25%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Weight applied to affected population count relative to maximum zone risk.
                </p>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Allocation:</span>
                    <span className="font-bold text-cyan-400 font-mono">{weightInputs.population}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={weightInputs.population}
                    onChange={(e) => handleWeightChange('population', parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* 2. Disaster Severity */}
              <div className="bg-[#131e31] border border-[#1f2e48] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>2. Disaster Severity</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">(w2)</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 font-mono">
                    Default: 20%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Inundation level, structural damage, and physical flood surge severity.
                </p>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Allocation:</span>
                    <span className="font-bold text-blue-400 font-mono">{weightInputs.severity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={weightInputs.severity}
                    onChange={(e) => handleWeightChange('severity', parseInt(e.target.value, 10))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* 3. Medical Risk */}
              <div className="bg-[#131e31] border border-[#1f2e48] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>3. Medical Risk</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">(w3)</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 font-mono">
                    Default: 20%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Reported casualties, medical emergencies, trapped citizens, and epidemic exposure.
                </p>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Allocation:</span>
                    <span className="font-bold text-rose-400 font-mono">{weightInputs.medical}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={weightInputs.medical}
                    onChange={(e) => handleWeightChange('medical', parseInt(e.target.value, 10))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* 4. Resource Shortage */}
              <div className="bg-[#131e31] border border-[#1f2e48] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>4. Resource Shortage</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">(w4)</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-mono">
                    Default: 15%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Deficit of food kits, drinking water, and essential field survival supplies.
                </p>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Allocation:</span>
                    <span className="font-bold text-amber-400 font-mono">{weightInputs.shortage}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={weightInputs.shortage}
                    onChange={(e) => handleWeightChange('shortage', parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* 5. Accessibility Difficulty */}
              <div className="bg-[#131e31] border border-[#1f2e48] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>5. Accessibility Difficulty</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">(w5)</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                    Default: 10%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Road blockage penalty, isolation index, and watercraft transit necessity.
                </p>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Allocation:</span>
                    <span className="font-bold text-emerald-400 font-mono">{weightInputs.accessibility}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={weightInputs.accessibility}
                    onChange={(e) => handleWeightChange('accessibility', parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {/* 6. Population Vulnerability */}
              <div className="bg-[#131e31] border border-[#1f2e48] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs flex items-center gap-1.5">
                    <span>6. Population Vulnerability</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">(w6)</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-mono">
                    Default: 10%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Demographic vulnerability: elderly, children, disability index, and geographic remoteness.
                </p>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Allocation:</span>
                    <span className="font-bold text-purple-400 font-mono">{weightInputs.vulnerability}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={weightInputs.vulnerability}
                    onChange={(e) => handleWeightChange('vulnerability', parseInt(e.target.value, 10))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Governance & Non-Mutation Notice */}
            <div className="bg-[#131e31] border border-[#1f2e48] rounded-xl p-4 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-cyan-400 font-bold">
                <Lock className="w-4 h-4 shrink-0" />
                <span>Operational Governance &amp; Non-Mutation Guarantee</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Updating scoring weights tunes the composite impact score (0–100) and factor explanation breakdowns for subsequent priority calculations.
                Saving settings <strong>never</strong> approves draft response plans, modifies road segment states, dispatches transport fleet units, or decrements warehouse inventory.
              </p>
            </div>

            {/* Demand Estimation Configuration Card (PRD Module 5) */}
            <div className="border-t border-[#1f2e48] pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Package className="w-4 h-4 text-cyan-400" />
                    Resource Demand Estimation Benchmarks (PRD Module 5)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Deterministic baseline formulas used for rapid resource requirement calculation
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                  Canonical Seed Matrix
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48] space-y-1">
                  <span className="text-slate-400 block text-[11px]">Emergency Planning Horizon</span>
                  <span className="font-bold text-white text-sm">3 Days</span>
                  <span className="text-[10px] text-slate-500 block">Configurable per request (1–30 days)</span>
                </div>

                <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48] space-y-1">
                  <span className="text-slate-400 block text-[11px]">Food Kit Allocation Ratio</span>
                  <span className="font-bold text-white text-sm">0.4338 kits / person</span>
                  <span className="text-[10px] text-slate-500 block">~1 ration kit per 2.3 people per cycle</span>
                </div>

                <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48] space-y-1">
                  <span className="text-slate-400 block text-[11px]">Potable Water Ratio</span>
                  <span className="font-bold text-white text-sm">0.3414 units / person</span>
                  <span className="text-[10px] text-slate-500 block">~1 potable water pack per 2.93 people</span>
                </div>

                <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48] space-y-1">
                  <span className="text-slate-400 block text-[11px]">Watercraft Dispatch Ratio</span>
                  <span className="font-bold text-white text-sm">720 people / boat</span>
                  <span className="text-[10px] text-slate-500 block">Standard rescue boat capacity in floods</span>
                </div>

                <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48] space-y-1">
                  <span className="text-slate-400 block text-[11px]">Medical Team Dispatch Ratio</span>
                  <span className="font-bold text-white text-sm">3,500 people / team</span>
                  <span className="text-[10px] text-slate-500 block">Mobile emergency response medical crew</span>
                </div>

                <div className="bg-[#131e31] p-3 rounded-xl border border-[#1f2e48] space-y-1">
                  <span className="text-slate-400 block text-[11px]">Medical Rounding Strategy</span>
                  <span className="font-bold text-white text-sm">Nearest Integer (round)</span>
                  <span className="text-[10px] text-slate-500 block">Preserves PRD Zone A 1 team baseline</span>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Role Modification Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-[#1f2e48] pb-4">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-cyan-400" />
                Modify User Permissions
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#131e31] p-3.5 rounded-xl border border-[#1f2e48] text-xs space-y-1">
              <div>
                <span className="text-slate-400">Account: </span>
                <strong className="text-white">{editingUser.name}</strong>
              </div>
              <div>
                <span className="text-slate-400">Email: </span>
                <span className="text-slate-300 font-mono">{editingUser.email}</span>
              </div>
              <div>
                <span className="text-slate-400">Current Role: </span>
                <span className="text-cyan-400 font-semibold">{editingUser.role}</span>
              </div>
            </div>

            {editError && (
              <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-xs text-red-200">
                {editError}
              </div>
            )}

            <form onSubmit={handleRoleUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Assigned Security Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => {
                    const newRole = e.target.value as UserRole;
                    setEditRole(newRole);
                    if (newRole !== 'department') {
                      setEditDept('');
                    } else if (!editDept) {
                      setEditDept('health');
                    }
                  }}
                  className="w-full px-3 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="citizen">Citizen (Public Reporter)</option>
                  <option value="command_center">Command Center Officer</option>
                  <option value="department">Department Responder</option>
                  <option value="admin">System Administrator</option>
                </select>
              </div>

              {/* Department selector (strictly visible & required when role is department) */}
              {editRole === 'department' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Department Assignment <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={editDept}
                    onChange={(e) => setEditDept(e.target.value as DepartmentType)}
                    required
                    className="w-full px-3 py-2 bg-[#131e31] border border-cyan-800/80 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="health">Health &amp; Medical</option>
                    <option value="supply">Supply &amp; Logistics</option>
                    <option value="rescue">Rescue &amp; Evacuation</option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Database schema strictly requires valid department assignment for department users.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1f2e48]">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingRole}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-lg shadow-cyan-900/30 transition disabled:opacity-50"
                >
                  {isUpdatingRole ? 'Updating Permissions...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Provisioning Modal */}
      {showProvisionModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0d1522] border border-[#1f2e48] rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-[#1f2e48] pb-4">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                Provision Operational User
              </h3>
              <button
                onClick={() => setShowProvisionModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {provError && (
              <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-xs text-red-200">
                {provError}
              </div>
            )}

            <form onSubmit={handleProvisionUser} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Priya Das"
                  value={provName}
                  onChange={(e) => setProvName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Official Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. priya.das@relief.internal"
                  value={provEmail}
                  onChange={(e) => setProvEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Temporary Secure Password (min 8 chars)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••••••"
                  value={provPassword}
                  onChange={(e) => setProvPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Role Authorization
                </label>
                <select
                  value={provRole}
                  onChange={(e) => {
                    const newRole = e.target.value as UserRole;
                    setProvRole(newRole);
                    if (newRole !== 'department') {
                      setProvDept('');
                    } else if (!provDept) {
                      setProvDept('health');
                    }
                  }}
                  className="w-full px-3 py-2 bg-[#131e31] border border-[#1f2e48] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="department">Department Personnel</option>
                  <option value="command_center">Command Center Officer</option>
                  <option value="admin">System Administrator</option>
                </select>
              </div>

              {provRole === 'department' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Department Assignment <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={provDept}
                    onChange={(e) => setProvDept(e.target.value as DepartmentType)}
                    required
                    className="w-full px-3 py-2 bg-[#131e31] border border-cyan-800/80 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="health">Health &amp; Medical</option>
                    <option value="supply">Supply &amp; Logistics</option>
                    <option value="rescue">Rescue &amp; Evacuation</option>
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#1f2e48]">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#131e31] hover:bg-[#1a2842] border border-[#1f2e48] text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProvisioning}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white shadow-lg shadow-cyan-900/30 transition disabled:opacity-50"
                >
                  {isProvisioning ? 'Provisioning...' : 'Provision Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
