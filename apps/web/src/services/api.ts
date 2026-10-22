/**
 * RELIEF-OS Frontend API Client Service
 * Connects React UI to the Express + Supabase PostGIS backend.
 * Uses VITE_API_URL with safe fallback to http://localhost:4000/api.
 */

import {
  Zone,
  Shelter,
  ResourceCenter,
  CitizenReport,
  RoadSegment,
  RoadStatus,
  PaginatedResult,
  ZoneDemandResult,
  ZoneAllocationResult,
  User,
  AuthResponse,
  Disaster,
} from '@relief-os/shared';
import { safeStorage } from '../utils/storage';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../utils/auth-roles';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  'http://localhost:4000/api';

export interface DemoKPIResponse {
  disaster_id: string;
  disaster_name: string;
  status: string;
  is_simulated: boolean;
  kpis: {
    active_disaster_count: number;
    affected_population: number;
    critical_zones_count: number;
    resource_shortages_count: number;
    active_teams_count: number;
    shelter_occupancy_pct: number;
    total_shelters: number;
    relief_centers: number;
    vehicles_deployed: number;
    total_reports_ingested: number;
    target_reports_demo?: number;
  };
  hero_zone: {
    id: string;
    name: string;
    priority_score: number;
    priority_band: string;
    affected_population: number;
    food_shortage_pct: number;
    water_shortage_pct: number;
    medical_risk: string;
    nearest_shelter_km: number;
    recommended_action: {
      boats: number;
      food_kits: number;
      water_units: number;
      medical_teams: number;
      source_center: string;
      selected_route: string;
    };
  };
}

export interface ShelterSuggestionItem {
  id: string;
  name: string;
  location_lat: number;
  location_lng: number;
  capacity: number;
  occupied: number;
  available_spaces: number;
  occupancy_pct: number;
  distance_km: number;
  facilities: string[];
  can_accommodate: boolean;
  recommended: boolean;
  evacuation_note: string;
}

export interface ShelterSuggestResponse {
  target_location: { lat: number; lng: number; zone_id: string | null };
  requested_evacuees: number;
  suggestions_count: number;
  suggestions: ShelterSuggestionItem[];
}

export interface CreateReportPayload {
  description: string;
  lat: number;
  lng: number;
  location_name?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  people_affected?: number;
  medical_need?: boolean;
  contact_number?: string;
  is_simulated?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// In-memory token reference with storage synchronization
let activeAuthToken: string | null = safeStorage.getItem(AUTH_TOKEN_KEY);

type AuthErrorListener = () => void;
const authErrorListeners = new Set<AuthErrorListener>();

function getRequestHeaders(customHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...customHeaders };
  const token = api.getToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMsg = `API request failed with HTTP ${res.status}`;
    let details: unknown;
    try {
      const errBody = await res.json();
      errorMsg = errBody.error || errorMsg;
      details = errBody.details;
    } catch {
      // response was not JSON
    }

    if (res.status === 401) {
      authErrorListeners.forEach((listener) => {
        try {
          listener();
        } catch {
          // ignore callback error
        }
      });
    }

    throw new ApiError(res.status, errorMsg, details);
  }
  return res.json() as Promise<T>;
}

// -----------------------------------------------------------------------------
// API Service Methods
// -----------------------------------------------------------------------------
export const api = {
  getBaseUrl(): string {
    return API_BASE_URL;
  },

  /** Store active bearer token in memory & storage */
  setToken(token: string | null): void {
    activeAuthToken = token;
    if (token) {
      safeStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      safeStorage.removeItem(AUTH_TOKEN_KEY);
      safeStorage.removeItem(AUTH_USER_KEY);
    }
  },

  /** Get active bearer token */
  getToken(): string | null {
    if (activeAuthToken) return activeAuthToken;
    const stored = safeStorage.getItem(AUTH_TOKEN_KEY);
    if (stored) {
      activeAuthToken = stored;
      return stored;
    }
    return null;
  },

  /** Listen for 401 unauthorized / session expiration events */
  onAuthError(callback: AuthErrorListener): () => void {
    authErrorListeners.add(callback);
    return () => {
      authErrorListeners.delete(callback);
    };
  },

  /** Remove current session */
  logout(): void {
    api.setToken(null);
  },

  /** Authenticate user with credentials */
  async login(payload: { email: string; password: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
      }),
    });
    const data = await handleResponse<AuthResponse>(res);
    if (data.token) {
      api.setToken(data.token);
      safeStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    }
    return data;
  },

  /** Register public citizen account strictly */
  async registerCitizen(payload: {
    name: string;
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    // Note: Do not send role or department; public registration is citizen-only
    const res = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        password: payload.password,
      }),
    });
    const data = await handleResponse<AuthResponse>(res);
    if (data.token) {
      api.setToken(data.token);
      safeStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    }
    return data;
  },

  /** Retrieve authenticated user profile */
  async getMe(): Promise<{ user: User }> {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: getRequestHeaders(),
    });
    return handleResponse<{ user: User }>(res);
  },

  /** Check API and PostGIS database health */
  async checkHealth(): Promise<{ status: string; database?: { connected: boolean } }> {
    const res = await fetch(`${API_BASE_URL}/health`, {
      headers: getRequestHeaders(),
    });
    return handleResponse(res);
  },

  /** Fetch canonical demo KPIs & Hero Zone metrics */
  async getDemoKPIs(): Promise<DemoKPIResponse> {
    const res = await fetch(`${API_BASE_URL}/disasters/demo-kpis`, {
      headers: getRequestHeaders(),
    });
    return handleResponse<DemoKPIResponse>(res);
  },

  /** List active and monitored disaster events */
  async getDisasters(params?: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResult<Disaster>> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.type) query.set('type', params.type);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/disasters${qs}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse<PaginatedResult<Disaster>>(res);
  },

  /** List operational zones with priority scores and PostGIS coordinates */
  async getZones(params?: {
    band?: string;
    min_priority?: number;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResult<Zone & { location_lat: number; location_lng: number }>> {
    const query = new URLSearchParams();
    if (params?.band) query.set('band', params.band);
    if (params?.min_priority !== undefined) query.set('min_priority', String(params.min_priority));
    if (params?.severity) query.set('severity', params.severity);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/zones${qs}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse(res);
  },

  /** Get single zone details with full AI breakdown & plan */
  async getZoneById(id: string): Promise<Zone & { recommendation?: any }> {
    const res = await fetch(`${API_BASE_URL}/zones/${encodeURIComponent(id)}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse(res);
  },

  /** Get deterministic resource demand estimation for a zone */
  async getZoneDemand(id: string, planningDays?: number): Promise<ZoneDemandResult> {
    const qs = planningDays ? `?planning_days=${encodeURIComponent(planningDays)}` : '';
    const res = await fetch(`${API_BASE_URL}/zones/${encodeURIComponent(id)}/demand${qs}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse<ZoneDemandResult>(res);
  },

  /** Get deterministic resource allocation recommendation for a zone */
  async getZoneAllocation(id: string, planningDays?: number): Promise<ZoneAllocationResult> {
    const qs = planningDays ? `?planning_days=${encodeURIComponent(planningDays)}` : '';
    const res = await fetch(`${API_BASE_URL}/zones/${encodeURIComponent(id)}/allocation${qs}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse<ZoneAllocationResult>(res);
  },

  /** Calculate resource demand with custom scenario overrides */
  async postZoneDemand(
    id: string,
    overrides: {
      planning_days?: number;
      affected_population?: number;
      food_shortage_pct?: number;
      water_shortage_pct?: number;
      accessibility?: number;
      vulnerability?: number;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      medical_risk?: 'low' | 'medium' | 'high' | 'critical';
    }
  ): Promise<ZoneDemandResult> {
    const res = await fetch(`${API_BASE_URL}/zones/${encodeURIComponent(id)}/demand`, {
      method: 'POST',
      headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(overrides),
    });
    return handleResponse<ZoneDemandResult>(res);
  },

  /** List all emergency shelters with occupancy rates */
  async getShelters(params?: {
    available_only?: boolean;
    min_capacity?: number;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResult<Shelter & { available_spaces: number; occupancy_pct: number; is_overcrowded: boolean }>> {
    const query = new URLSearchParams();
    if (params?.available_only) query.set('available_only', 'true');
    if (params?.min_capacity !== undefined) query.set('min_capacity', String(params.min_capacity));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/shelters${qs}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse(res);
  },

  /** Smart capacity & proximity shelter recommendations */
  async suggestShelters(params: {
    zone_id?: string;
    lat?: number;
    lng?: number;
    people?: number;
    limit?: number;
  }): Promise<ShelterSuggestResponse> {
    const query = new URLSearchParams();
    if (params.zone_id) query.set('zone_id', params.zone_id);
    if (params.lat !== undefined) query.set('lat', String(params.lat));
    if (params.lng !== undefined) query.set('lng', String(params.lng));
    if (params.people !== undefined) query.set('people', String(params.people));
    if (params.limit !== undefined) query.set('limit', String(params.limit));

    const res = await fetch(`${API_BASE_URL}/shelters/suggest?${query.toString()}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse(res);
  },

  /** List regional resource centers with fleet status */
  async getResourceCenters(): Promise<PaginatedResult<ResourceCenter & { total_fleet: number }>> {
    const res = await fetch(`${API_BASE_URL}/resource-centers`, {
      headers: getRequestHeaders(),
    });
    return handleResponse(res);
  },

  /** Get single resource center detail with warehouse stock inventory */
  async getResourceCenterById(id: string): Promise<ResourceCenterDetail> {
    const res = await fetch(`${API_BASE_URL}/resource-centers/${encodeURIComponent(id)}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse<ResourceCenterDetail>(res);
  },

  /** List road segments with traversability status */
  async getRoadSegments(): Promise<PaginatedResult<RoadSegment>> {
    const res = await fetch(`${API_BASE_URL}/road-segments`, {
      headers: getRequestHeaders(),
    });
    return handleResponse(res);
  },

  /** Update road segment traversability status (blocked/partial/accessible) */
  async updateRoadStatus(
    id: string,
    status: RoadStatus,
    reason?: string
  ): Promise<{ success: boolean; updated_segment: RoadSegment }> {
    const res = await fetch(`${API_BASE_URL}/road-segments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status, reason }),
    });
    return handleResponse(res);
  },

  /** List citizen distress reports */
  async getReports(params?: {
    severity?: string;
    status?: string;
    category?: string;
    medical_need?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResult<CitizenReport>> {
    const query = new URLSearchParams();
    if (params?.severity) query.set('severity', params.severity);
    if (params?.status) query.set('status', params.status);
    if (params?.category) query.set('category', params.category);
    if (params?.medical_need !== undefined) query.set('medical_need', String(params.medical_need));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/reports${qs}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse(res);
  },

  /** Ingest a new citizen distress report */
  async submitReport(payload: CreateReportPayload): Promise<CitizenReport> {
    const res = await fetch(`${API_BASE_URL}/reports`, {
      method: 'POST',
      headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },

  /** List recommendations / response plans */
  async getRecommendations(params?: {
    zone_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResult<RecommendationItem>> {
    const query = new URLSearchParams();
    if (params?.zone_id) query.set('zone_id', params.zone_id);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/recommendations${qs}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse<PaginatedResult<RecommendationItem>>(res);
  },

  /** Get single recommendation detail */
  async getRecommendationById(id: string): Promise<RecommendationItem> {
    const res = await fetch(`${API_BASE_URL}/recommendations/${encodeURIComponent(id)}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse<RecommendationItem>(res);
  },

  /** Approve response plan (Human-in-the-loop decision) */
  async approveRecommendation(
    id: string,
    notes?: string
  ): Promise<{ success: boolean; message: string; recommendation: RecommendationItem }> {
    const res = await fetch(`${API_BASE_URL}/recommendations/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ notes }),
    });
    return handleResponse(res);
  },

  /** Reject response plan with stated reason */
  async rejectRecommendation(
    id: string,
    reason?: string
  ): Promise<{ success: boolean; message: string; recommendation: RecommendationItem }> {
    const res = await fetch(`${API_BASE_URL}/recommendations/${encodeURIComponent(id)}/reject`, {
      method: 'POST',
      headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason }),
    });
    return handleResponse(res);
  },

  /** Execute What-If constraint simulation (PRD Module 9) */
  async runSimulation(payload: SimulationPayload): Promise<SimulationRunResponse> {
    const res = await fetch(`${API_BASE_URL}/simulation/run`, {
      method: 'POST',
      headers: getRequestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handleResponse<SimulationRunResponse>(res);
  },

  /** List historical simulation runs */
  async getSimulationRuns(params?: { limit?: number; offset?: number }): Promise<PaginatedResult<any>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/simulation/runs${qs}`, {
      headers: getRequestHeaders(),
    });
    return handleResponse<PaginatedResult<any>>(res);
  },
};

export interface RecommendationItem {
  id: string;
  zone_id: string;
  plan: any;
  explanation: string;
  approved_by?: string | null;
  approver_name?: string | null;
  approved_at?: string | null;
  status: 'draft' | 'approved' | 'modified' | 'rejected';
  created_at: string;
}

export interface ResourceInventoryItem {
  id: string;
  resource_type: string;
  quantity: number;
  status: string;
  created_at: string;
}

export interface ResourceCenterDetail extends ResourceCenter {
  total_fleet: number;
  inventory: ResourceInventoryItem[];
  created_at: string;
}

export interface SimulationPayload {
  zone_id?: string;
  planning_days?: number;
  scenario_type?: 'fleet_reduction' | 'inventory_reduction' | 'road_blockage' | 'compound';
  remove_vehicles?: number;
  remove_boats?: number;
  reduce_stock_pct?: number;
  reduce_quantity?: number;
  resource_type?: 'food_kits' | 'water_units' | 'boats' | 'medical_teams';
  center_id?: string;
  blocked_road_id?: string;
  blocked_route_ids?: string[];
  description?: string;
}

export interface ResourceDiffItem {
  resource_type: 'food_kits' | 'water_units' | 'boats' | 'medical_teams';
  name: string;
  unit: string;
  requested_quantity: number;
  baseline_allocated: number;
  simulated_allocated: number;
  baseline_unmet: number;
  simulated_unmet: number;
  unmet_increase: number;
  shortage_status: 'fulfilled' | 'new_shortage' | 'worsened' | 'unchanged';
}

export interface CenterSupplyDiffItem {
  center_id: string;
  center_name: string;
  resource_type: string;
  baseline_quantity: number;
  simulated_quantity: number;
  delta: number;
}

export interface RoadImpactReport {
  road_id: string;
  road_name: string;
  original_status: string;
  simulated_status: 'blocked';
  length_km: number;
  risk_score: number;
  routing_impact_notice: string;
}

export interface SimulationRunResponse {
  simulation_id: string;
  zone_id: string;
  zone_name: string;
  planning_days: number;
  scenario_type: 'fleet_reduction' | 'inventory_reduction' | 'road_blockage' | 'compound';
  changes_applied: SimulationPayload;
  baseline: {
    demand: ZoneDemandResult;
    allocation: ZoneAllocationResult;
  };
  simulated: {
    allocation: ZoneAllocationResult;
  };
  comparison: {
    resources: ResourceDiffItem[];
    supplying_centers_diff: CenterSupplyDiffItem[];
    new_shortages_detected: Array<{ resource: string; deficit: number }>;
    road_impact?: RoadImpactReport | null;
  };
  suggested_mitigations: string[];
  summary_explanation: string;
  is_simulated: true;
  persisted: boolean;
  disclaimer: string;
  created_at: string;
}


