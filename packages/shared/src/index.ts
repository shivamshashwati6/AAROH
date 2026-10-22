/**
 * @relief-os/shared
 * Core domain types and interfaces shared between web and api services.
 */

export type DisasterType =
  | 'flood'
  | 'cyclone'
  | 'landslide'
  | 'earthquake'
  | 'fire'
  | 'extreme_weather';

export type DisasterStatus = 'active' | 'archived' | 'simulated';

export interface Disaster {
  id: string;
  name: string;
  type: DisasterType;
  region: string;
  start_time: string;
  status: DisasterStatus;
  is_simulated: boolean;
  created_at: string;
}

export type PriorityBand = 'Critical' | 'High' | 'Medium' | 'Low';

export interface PriorityScoreBreakdown {
  population_impact: number;
  severity: number;
  medical_risk: number;
  resource_shortage: number;
  accessibility_difficulty: number;
  vulnerability: number;
  total_score: number; // 0 - 100
  band: PriorityBand;
  explanation: string;
}

export interface Zone {
  id: string;
  disaster_id: string;
  name: string;
  population: number;
  affected_population: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  medical_risk: 'low' | 'medium' | 'high' | 'critical';
  accessibility: number; // 0 (blocked) to 1 (clear)
  vulnerability: number; // 0 to 1
  priority_score: number; // 0 - 100
  band: PriorityBand;
  breakdown?: PriorityScoreBreakdown;
  nearest_shelter_distance_km?: number;
  food_shortage_pct?: number;
  water_shortage_pct?: number;
}

export type ReportCategory =
  | 'food'
  | 'water'
  | 'medicine'
  | 'rescue'
  | 'shelter'
  | 'transportation';

export type ReportStatus = 'pending_ai' | 'analyzed' | 'verified';

export interface CitizenReport {
  id: string;
  disaster_id: string;
  location_lat: number;
  location_lng: number;
  location_name?: string;
  description: string;
  disaster_type?: DisasterType;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  categories?: ReportCategory[];
  category?: string;
  people_affected?: number | null;
  medical_need: boolean;
  confidence: number;
  is_simulated: boolean;
  status: ReportStatus;
  contact_number?: string; // Optional for privacy
  created_at: string;
}

export interface ResourceCenter {
  id: string;
  name: string;
  location_lat: number;
  location_lng: number;
  vehicles_available: number;
  boats_available: number;
  medical_teams_available: number;
}

export interface Shelter {
  id: string;
  name: string;
  location_lat: number;
  location_lng: number;
  capacity: number;
  occupied: number;
  facilities: string[];
}

export type RoadStatus = 'accessible' | 'partial' | 'blocked';

export interface RoadGeometry {
  type: 'LineString';
  coordinates: [number, number][]; // [lng, lat]
}

export interface RoadSegment {
  id: string;
  name: string;
  status: RoadStatus;
  length_km: number;
  risk_score: number;
  geometry?: RoadGeometry | null;
}

export type PlanStatus =
  | 'draft'
  | 'approved'
  | 'modified'
  | 'rejected'
  | 'in_transit'
  | 'delivered'
  | 'failed';

export interface ResponsePlan {
  id: string;
  zone_id: string;
  zone_name: string;
  priority_rank: number;
  resource_center_id: string;
  resource_center_name: string;
  requested_resources: {
    food_kits: number;
    water_units: number;
    medicine_units: number;
    boats: number;
    medical_teams: number;
  };
  allocated_resources: {
    food_kits: number;
    water_units: number;
    medicine_units: number;
    boats: number;
    medical_teams: number;
  };
  shortage_detected: boolean;
  shortage_details?: string;
  route_id: string;
  route_name: string;
  route_status: RoadStatus;
  route_reason: string;
  status: PlanStatus;
  officer_notes?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
}

export interface SimulationChange {
  remove_vehicles?: number;
  reduce_stock_pct?: number;
  blocked_route_ids?: string[];
  closed_shelter_ids?: string[];
  new_critical_zone?: Partial<Zone>;
}

export interface SimulationResult {
  run_id: string;
  changes_applied: SimulationChange;
  baseline_served_population: number;
  simulated_served_population: number;
  new_shortages_detected: Array<{
    zone_id: string;
    zone_name: string;
    resource: string;
    deficit: number;
  }>;
  suggested_mitigations: string[];
  created_at: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface DemandResourceItem {
  resource_type: 'food_kits' | 'water_units' | 'boats' | 'medical_teams';
  name: string;
  quantity: number;
  unit: string;
  formula: string;
  explanation: string;
  is_assumed_param: boolean;
}

export interface ZoneDemandResult {
  zone_id: string;
  zone_name: string;
  affected_population: number;
  priority_score: number;
  band: PriorityBand;
  severity: string;
  medical_risk: string;
  accessibility: number;
  vulnerability: number;
  is_simulated: boolean;
  planning_horizon_days: number;
  demands: {
    food_kits: DemandResourceItem;
    water_units: DemandResourceItem;
    boats: DemandResourceItem;
    medical_teams: DemandResourceItem;
  };
  summary_explanation: string;
  generated_at: string;
}

export interface CenterAllocationDetail {
  center_id: string;
  center_name: string;
  distance_km: number;
  allocated_quantity: number;
  unit: string;
}

export interface ResourceAllocationItem {
  resource_type: 'food_kits' | 'water_units' | 'boats' | 'medical_teams';
  name: string;
  unit: string;
  requested_quantity: number;
  available_quantity: number;
  allocated_quantity: number;
  unmet_quantity: number;
  shortage_detected: boolean;
  supplying_centers: CenterAllocationDetail[];
  explanation: string;
}

export interface ZoneAllocationResult {
  zone_id: string;
  zone_name: string;
  priority_score: number;
  priority_band: PriorityBand;
  is_simulated: boolean;
  planning_horizon_days: number;
  demand_summary: {
    affected_population: number;
    food_kits: number;
    water_units: number;
    boats: number;
    medical_teams: number;
  };
  available_inventory: {
    food_kits: number;
    water_units: number;
    boats: number;
    medical_teams: number;
  };
  allocations: {
    food_kits: ResourceAllocationItem;
    water_units: ResourceAllocationItem;
    boats: ResourceAllocationItem;
    medical_teams: ResourceAllocationItem;
  };
  primary_source_center: {
    id: string;
    name: string;
    distance_km: number;
  };
  overall_shortage: boolean;
  overall_explanation: string;
  generated_at: string;
}

// -----------------------------------------------------------------------------
// User & Authentication Domain Types
// -----------------------------------------------------------------------------
export type CanonicalUserRole = 'citizen' | 'command_center' | 'department';
export type LegacyUserRole = 'admin' | 'officer' | 'coordinator' | 'team_lead';
export type UserRole = CanonicalUserRole | LegacyUserRole;

export type DepartmentType = 'health' | 'supply' | 'rescue';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: DepartmentType | null;
  created_at?: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
  expires_at?: string;
}

