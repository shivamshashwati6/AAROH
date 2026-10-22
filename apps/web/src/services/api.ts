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
} from '@relief-os/shared';

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

  /** Check API and PostGIS database health */
  async checkHealth(): Promise<{ status: string; database?: { connected: boolean } }> {
    const res = await fetch(`${API_BASE_URL}/health`);
    return handleResponse(res);
  },

  /** Fetch canonical demo KPIs & Hero Zone metrics */
  async getDemoKPIs(): Promise<DemoKPIResponse> {
    const res = await fetch(`${API_BASE_URL}/disasters/demo-kpis`);
    return handleResponse<DemoKPIResponse>(res);
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
    const res = await fetch(`${API_BASE_URL}/zones${qs}`);
    return handleResponse(res);
  },

  /** Get single zone details with full AI breakdown & plan */
  async getZoneById(id: string): Promise<Zone & { recommendation?: any }> {
    const res = await fetch(`${API_BASE_URL}/zones/${encodeURIComponent(id)}`);
    return handleResponse(res);
  },

  /** Get deterministic resource demand estimation for a zone */
  async getZoneDemand(id: string, planningDays?: number): Promise<ZoneDemandResult> {
    const qs = planningDays ? `?planning_days=${encodeURIComponent(planningDays)}` : '';
    const res = await fetch(`${API_BASE_URL}/zones/${encodeURIComponent(id)}/demand${qs}`);
    return handleResponse<ZoneDemandResult>(res);
  },

  /** Get deterministic resource allocation recommendation for a zone */
  async getZoneAllocation(id: string, planningDays?: number): Promise<ZoneAllocationResult> {
    const qs = planningDays ? `?planning_days=${encodeURIComponent(planningDays)}` : '';
    const res = await fetch(`${API_BASE_URL}/zones/${encodeURIComponent(id)}/allocation${qs}`);
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
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${API_BASE_URL}/shelters${qs}`);
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

    const res = await fetch(`${API_BASE_URL}/shelters/suggest?${query.toString()}`);
    return handleResponse(res);
  },

  /** List regional resource centers with fleet status */
  async getResourceCenters(): Promise<PaginatedResult<ResourceCenter & { total_fleet: number }>> {
    const res = await fetch(`${API_BASE_URL}/resource-centers`);
    return handleResponse(res);
  },

  /** List road segments with traversability status */
  async getRoadSegments(): Promise<PaginatedResult<RoadSegment>> {
    const res = await fetch(`${API_BASE_URL}/road-segments`);
    return handleResponse(res);
  },

  /** Update road segment traversability status (blocked/partial/accessible) */
  async updateRoadStatus(id: string, status: RoadStatus, reason?: string): Promise<{ success: boolean; updated_segment: RoadSegment }> {
    const res = await fetch(`${API_BASE_URL}/road-segments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason }),
    });
    return handleResponse(res);
  },

  /** List citizen distress reports */
  async getReports(params?: {
    severity?: string;
    status?: string;
    category?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResult<CitizenReport>> {
    const query = new URLSearchParams();
    if (params?.severity) query.set('severity', params.severity);
    if (params?.status) query.set('status', params.status);
    if (params?.category) query.set('category', params.category);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`${API_BASE_URL}/reports${qs}`);
    return handleResponse(res);
  },

  /** Ingest a new citizen distress report */
  async submitReport(payload: CreateReportPayload): Promise<CitizenReport> {
    const res = await fetch(`${API_BASE_URL}/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse(res);
  },
};
