/**
 * RELIEF-OS Deterministic Resource Allocation Engine
 * Implements PRD Module 6 (Intelligent Resource Allocation) specifications.
 * 
 * Core Mandates:
 * - Deterministic, greedy priority & proximity allocation based on actual available inventory.
 * - Never over-promise: accurately flags shortages and unmet gaps (FR-6.4).
 * - Multi-center split delivery when single depot stock is insufficient (FR-6.3).
 * - Produces explainable recommendation records only; NEVER decrements live inventory or dispatches automatically.
 */

import {
  ZoneAllocationResult,
  ResourceAllocationItem,
  CenterAllocationDetail,
  ZoneDemandResult,
} from '@relief-os/shared';
import { calculateZoneDemand, ZoneDemandInput, DemandConfig } from './demand';
import { query } from '../db';

export interface CenterInventoryRecord {
  center_id: string;
  center_name: string;
  distance_km: number;
  lat: number;
  lng: number;
  resource_type: string;
  quantity: number;
  status: string;
}

export interface CenterLocationInfo {
  id: string;
  name: string;
  distance_km: number;
  lat: number;
  lng: number;
  vehicles_available: number;
  boats_available: number;
  medical_teams_available: number;
}

export class AllocationError extends Error {
  constructor(public code: string, message: string) {
    super(`Allocation Engine Error [${code}]: ${message}`);
    this.name = 'AllocationError';
  }
}

/**
 * Normalizes disparate naming conventions into standard demand categories.
 */
export function normalizeResourceType(
  type: string
): 'food_kits' | 'water_units' | 'boats' | 'medical_teams' | null {
  const t = type.toLowerCase().trim();
  if (t === 'food_kits' || t === 'food_kit' || t === 'food') return 'food_kits';
  if (t === 'water_units' || t === 'water_unit' || t === 'water_pack' || t === 'water') return 'water_units';
  if (t === 'boats' || t === 'boat') return 'boats';
  if (t === 'medical_teams' || t === 'medical_team' || t === 'medical_unit' || t === 'medical') return 'medical_teams';
  return null;
}

export interface InventoryPool {
  [centerId: string]: {
    center: CenterLocationInfo;
    stock: {
      food_kits: number;
      water_units: number;
      boats: number;
      medical_teams: number;
    };
  };
}

/**
 * Pure deterministic allocation algorithm.
 * Allocates resources from candidate relief centers to meet zone demand.
 * 
 * Deterministic Selection and Tie-Breaking Rule:
 * 1. Proximity: Centers closer to the zone are prioritized (distance_km ASC).
 * 2. Capacity: Among equidistant centers, centers with larger available stock are preferred.
 * 3. Tie-breaking: Stable alphabetical ordering by center_id ASC.
 */
export function computeDeterministicAllocation(
  demand: ZoneDemandResult,
  inventoryPool: InventoryPool
): ZoneAllocationResult {
  // Candidate centers sorted deterministically by proximity (distance_km ASC), then center_id ASC
  const candidateCenters = Object.values(inventoryPool)
    .map((item) => item.center)
    .sort((a, b) => {
      if (Math.abs(a.distance_km - b.distance_km) > 0.001) {
        return a.distance_km - b.distance_km;
      }
      return a.id.localeCompare(b.id);
    });

  if (candidateCenters.length === 0) {
    throw new AllocationError('NO_CENTERS_AVAILABLE', 'No regional relief centers available in inventory pool');
  }

  const primaryCenter = candidateCenters[0];

  // Working copy of stock to guarantee no inventory is counted twice
  const availableStock: {
    [centerId: string]: {
      food_kits: number;
      water_units: number;
      boats: number;
      medical_teams: number;
    };
  } = {};

  for (const center of candidateCenters) {
    availableStock[center.id] = {
      food_kits: Math.max(0, inventoryPool[center.id]?.stock.food_kits ?? 0),
      water_units: Math.max(0, inventoryPool[center.id]?.stock.water_units ?? 0),
      boats: Math.max(0, inventoryPool[center.id]?.stock.boats ?? 0),
      medical_teams: Math.max(0, inventoryPool[center.id]?.stock.medical_teams ?? 0),
    };
  }

  // Allocate single resource category greedily across sorted candidate centers
  function allocateCategory(
    category: 'food_kits' | 'water_units' | 'boats' | 'medical_teams',
    displayName: string,
    unit: string,
    requestedQty: number
  ): ResourceAllocationItem {
    const totalAvailable = candidateCenters.reduce(
      (sum, center) => sum + (inventoryPool[center.id]?.stock[category] ?? 0),
      0
    );

    let remainingNeeded = Math.max(0, requestedQty);
    let totalAllocated = 0;
    const supplyingCenters: CenterAllocationDetail[] = [];

    for (const center of candidateCenters) {
      if (remainingNeeded <= 0) break;

      const currentStock = availableStock[center.id][category];
      if (currentStock > 0) {
        const canTake = Math.min(remainingNeeded, currentStock);
        availableStock[center.id][category] -= canTake;
        remainingNeeded -= canTake;
        totalAllocated += canTake;

        supplyingCenters.push({
          center_id: center.id,
          center_name: center.name,
          distance_km: Math.round(center.distance_km * 10) / 10,
          allocated_quantity: canTake,
          unit,
        });
      }
    }

    const unmetQty = Math.max(0, requestedQty - totalAllocated);
    const shortageDetected = unmetQty > 0;

    let explanation = '';
    if (requestedQty === 0) {
      explanation = `Zero ${displayName.toLowerCase()} required by zone demand.`;
    } else if (!shortageDetected) {
      if (supplyingCenters.length === 1) {
        explanation = `100% fulfilled (${totalAllocated.toLocaleString()} ${unit}) from ${supplyingCenters[0].center_name} (${supplyingCenters[0].distance_km} km away).`;
      } else {
        const centerBreakdown = supplyingCenters
          .map((s) => `${s.allocated_quantity.toLocaleString()} from ${s.center_name}`)
          .join(', ');
        explanation = `100% fulfilled (${totalAllocated.toLocaleString()} ${unit}) split across ${supplyingCenters.length} centers: ${centerBreakdown}.`;
      }
    } else {
      if (totalAllocated === 0) {
        explanation = `⚠️ Critical shortage: 0 / ${requestedQty.toLocaleString()} ${unit} available across all regional depots (unmet deficit: ${unmetQty.toLocaleString()} ${unit}).`;
      } else {
        explanation = `⚠️ Partial fulfillment (${totalAllocated.toLocaleString()} / ${requestedQty.toLocaleString()} ${unit}). Remaining unmet deficit of ${unmetQty.toLocaleString()} ${unit} exceeds regional depot capacity.`;
      }
    }

    return {
      resource_type: category,
      name: displayName,
      unit,
      requested_quantity: requestedQty,
      available_quantity: totalAvailable,
      allocated_quantity: totalAllocated,
      unmet_quantity: unmetQty,
      shortage_detected: shortageDetected,
      supplying_centers: supplyingCenters,
      explanation,
    };
  }

  const foodAlloc = allocateCategory(
    'food_kits',
    'Food Relief Ration Kits',
    'kits',
    demand.demands.food_kits.quantity
  );

  const waterAlloc = allocateCategory(
    'water_units',
    'Potable Drinking Water Units',
    'units',
    demand.demands.water_units.quantity
  );

  const boatsAlloc = allocateCategory(
    'boats',
    'Deployable Rescue Boats',
    'boats',
    demand.demands.boats.quantity
  );

  const medicalAlloc = allocateCategory(
    'medical_teams',
    'Certified Medical Response Teams',
    'teams',
    demand.demands.medical_teams.quantity
  );

  const overallShortage =
    foodAlloc.shortage_detected ||
    waterAlloc.shortage_detected ||
    boatsAlloc.shortage_detected ||
    medicalAlloc.shortage_detected;

  let overallExplanation = '';
  if (!overallShortage) {
    overallExplanation = `Proposed response plan fully satisfied for ${demand.zone_name}. Primary dispatch base: ${primaryCenter.name} (${Math.round(primaryCenter.distance_km * 10) / 10} km). Zero regional deficit.`;
  } else {
    const shortages: string[] = [];
    if (foodAlloc.shortage_detected) shortages.push(`${foodAlloc.unmet_quantity.toLocaleString()} food kits`);
    if (waterAlloc.shortage_detected) shortages.push(`${waterAlloc.unmet_quantity.toLocaleString()} water units`);
    if (boatsAlloc.shortage_detected) shortages.push(`${boatsAlloc.unmet_quantity} rescue boats`);
    if (medicalAlloc.shortage_detected) shortages.push(`${medicalAlloc.unmet_quantity} medical teams`);
    overallExplanation = `⚠️ Regional supply deficit detected for ${demand.zone_name}. Unmet requirements: ${shortages.join(
      ', '
    )}. Mitigation recommendation: mobilize state-level contingency stockpiles.`;
  }

  return {
    zone_id: demand.zone_id,
    zone_name: demand.zone_name,
    priority_score: demand.priority_score,
    priority_band: demand.band,
    is_simulated: true,
    planning_horizon_days: demand.planning_horizon_days,
    demand_summary: {
      affected_population: demand.affected_population,
      food_kits: demand.demands.food_kits.quantity,
      water_units: demand.demands.water_units.quantity,
      boats: demand.demands.boats.quantity,
      medical_teams: demand.demands.medical_teams.quantity,
    },
    available_inventory: {
      food_kits: foodAlloc.available_quantity,
      water_units: waterAlloc.available_quantity,
      boats: boatsAlloc.available_quantity,
      medical_teams: medicalAlloc.available_quantity,
    },
    allocations: {
      food_kits: foodAlloc,
      water_units: waterAlloc,
      boats: boatsAlloc,
      medical_teams: medicalAlloc,
    },
    primary_source_center: {
      id: primaryCenter.id,
      name: primaryCenter.name,
      distance_km: Math.round(primaryCenter.distance_km * 10) / 10,
    },
    overall_shortage: overallShortage,
    overall_explanation: overallExplanation,
    generated_at: new Date().toISOString(),
  };
}

/**
 * Loads actual database inventory and generates a deterministic allocation plan for a zone.
 */
export async function calculateZoneAllocation(
  zoneId: string,
  options?: {
    planning_days?: number;
    customDemandInput?: ZoneDemandInput;
    customConfig?: DemandConfig;
  }
): Promise<ZoneAllocationResult> {
  // 1. Fetch zone details
  const zoneRes = await query(
    `SELECT 
      z.id, 
      z.disaster_id, 
      z.name, 
      z.population, 
      z.affected_population, 
      z.severity, 
      z.medical_risk, 
      z.accessibility::float as accessibility, 
      z.vulnerability::float as vulnerability, 
      z.priority_score, 
      z.band, 
      z.breakdown_json, 
      d.is_simulated,
      z.geometry
    FROM zones z
    LEFT JOIN disasters d ON d.id = z.disaster_id
    WHERE z.id = $1`,
    [zoneId]
  );

  if (zoneRes.rows.length === 0) {
    throw new AllocationError('ZONE_NOT_FOUND', `Zone with ID '${zoneId}' not found`);
  }

  const zoneRow = zoneRes.rows[0];
  const breakdown = zoneRow.breakdown_json || {};

  // 2. Compute Zone Demand using the existing Deterministic Demand Engine
  const demandInput: ZoneDemandInput = options?.customDemandInput ?? {
    zone_id: zoneRow.id,
    zone_name: zoneRow.name,
    affected_population: zoneRow.affected_population,
    total_population: zoneRow.population,
    severity: zoneRow.severity,
    medical_risk: zoneRow.medical_risk,
    accessibility: zoneRow.accessibility,
    vulnerability: zoneRow.vulnerability,
    priority_score: zoneRow.priority_score,
    band: zoneRow.band,
    food_shortage_pct: breakdown.food_shortage_pct,
    water_shortage_pct: breakdown.water_shortage_pct,
    is_simulated: zoneRow.is_simulated !== null ? Boolean(zoneRow.is_simulated) : true,
  };

  const demandResult = calculateZoneDemand(demandInput, {
    planning_days: options?.planning_days ?? 3,
    ...options?.customConfig,
  });

  // 3. Fetch all relief centers with PostGIS spatial distance relative to the zone
  const centersRes = await query(
    `SELECT 
      c.id, 
      c.name, 
      ST_Y(c.location::geometry) as lat, 
      ST_X(c.location::geometry) as lng, 
      (ST_Distance(c.location::geography, $1::geography) / 1000.0) as distance_km,
      c.vehicles_available, 
      c.boats_available, 
      c.medical_teams_available
    FROM resource_centers c
    ORDER BY distance_km ASC, c.id ASC`,
    [zoneRow.geometry]
  );

  if (centersRes.rows.length === 0) {
    throw new AllocationError('NO_RESOURCE_CENTERS', 'No resource centers found in database');
  }

  // 4. Fetch available warehouse inventory from resources table
  const resourcesRes = await query(
    `SELECT 
      id, 
      center_id, 
      resource_type, 
      quantity, 
      status 
    FROM resources 
    WHERE status = 'available'`
  );

  // Group inventory by center
  const inventoryPool: InventoryPool = {};

  for (const c of centersRes.rows) {
    const distanceKm = typeof c.distance_km === 'string' ? parseFloat(c.distance_km) : c.distance_km ?? 0;

    inventoryPool[c.id] = {
      center: {
        id: c.id,
        name: c.name,
        distance_km: distanceKm,
        lat: parseFloat(c.lat),
        lng: parseFloat(c.lng),
        vehicles_available: c.vehicles_available ?? 0,
        boats_available: c.boats_available ?? 0,
        medical_teams_available: c.medical_teams_available ?? 0,
      },
      stock: {
        food_kits: 0,
        water_units: 0,
        // Default fleet and clinical teams directly from resource_centers columns
        boats: c.boats_available ?? 0,
        medical_teams: c.medical_teams_available ?? 0,
      },
    };
  }

  // Populate or augment with rows from resources table
  for (const r of resourcesRes.rows) {
    const center = inventoryPool[r.center_id];
    if (!center) continue;

    const normType = normalizeResourceType(r.resource_type);
    if (!normType) continue;

    if (normType === 'food_kits' || normType === 'water_units') {
      center.stock[normType] += Math.max(0, r.quantity);
    } else if (normType === 'boats') {
      // If explicit warehouse boat rows exist, use them as definitive available boat quantity
      center.stock.boats = Math.max(0, r.quantity);
    } else if (normType === 'medical_teams') {
      center.stock.medical_teams = Math.max(0, r.quantity);
    }
  }

  // 5. Run deterministic allocation algorithm
  return computeDeterministicAllocation(demandResult, inventoryPool);
}
