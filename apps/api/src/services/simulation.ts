/**
 * RELIEF-OS Deterministic What-If Simulation Engine
 * Implements PRD Module 9 (What-If Simulation) specifications.
 * 
 * Core Mandates:
 * - Operates strictly on in-memory deep copies of operational state.
 * - Zero database mutations on inventory, fleet availability, road status, or response plans.
 * - Deterministic: identical inputs on identical database states produce identical outputs.
 * - Validates all scenario parameters strictly (ranges, entity existence).
 * - Persists run audit record into `simulation_runs` and `audit_log`.
 */

import { query } from '../db';
import {
  computeDeterministicAllocation,
  loadZoneAllocationContext,
  InventoryPool,
  AllocationError,
} from './allocation';
import {
  ZoneDemandResult,
  ZoneAllocationResult,
  RoadSegment,
} from '@relief-os/shared';

export type SimulationScenarioType =
  | 'fleet_reduction'
  | 'inventory_reduction'
  | 'road_blockage'
  | 'compound';

export interface SimulationInput {
  zone_id?: string;
  planning_days?: number;
  scenario_type?: SimulationScenarioType;
  // Fleet scenario
  remove_vehicles?: number;
  remove_boats?: number;
  // Inventory scenario
  reduce_stock_pct?: number; // 1 - 100
  resource_type?: 'food_kits' | 'water_units' | 'boats' | 'medical_teams';
  reduce_quantity?: number;
  // Scoped center (optional)
  center_id?: string;
  // Road scenario
  blocked_road_id?: string;
  blocked_route_ids?: string[];
  // Description / justification (optional)
  description?: string;
}

export class SimulationValidationError extends Error {
  constructor(public field: string, message: string, public status: number = 400) {
    super(`Simulation validation error [${field}]: ${message}`);
    this.name = 'SimulationValidationError';
  }
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

export interface SimulationRunResult {
  simulation_id: string;
  zone_id: string;
  zone_name: string;
  planning_days: number;
  scenario_type: SimulationScenarioType;
  changes_applied: SimulationInput;
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

/**
 * Validates simulation input parameters and verifies entities exist in DB.
 */
export async function validateSimulationInput(input: SimulationInput): Promise<{
  targetZoneId: string;
  targetPlanningDays: number;
  resolvedScenarioType: SimulationScenarioType;
  targetCenter?: { id: string; name: string; vehicles_available: number; boats_available: number } | null;
  targetRoads: RoadSegment[];
}> {
  const targetZoneId = (input.zone_id || 'zone-a').trim();
  const targetPlanningDays = input.planning_days ?? 3;

  if (
    typeof targetPlanningDays !== 'number' ||
    !Number.isInteger(targetPlanningDays) ||
    targetPlanningDays < 1 ||
    targetPlanningDays > 30
  ) {
    throw new SimulationValidationError(
      'planning_days',
      'Planning horizon days must be an integer between 1 and 30'
    );
  }

  // 1. Verify zone exists
  const zoneCheck = await query('SELECT id, name FROM zones WHERE id = $1', [targetZoneId]);
  if (zoneCheck.rows.length === 0) {
    throw new SimulationValidationError('zone_id', `Zone with ID '${targetZoneId}' not found`, 404);
  }

  // 2. Determine scenario type
  let resolvedScenarioType = input.scenario_type;
  if (!resolvedScenarioType) {
    if (input.remove_vehicles !== undefined || input.remove_boats !== undefined) {
      resolvedScenarioType = 'fleet_reduction';
    } else if (input.reduce_stock_pct !== undefined || input.reduce_quantity !== undefined) {
      resolvedScenarioType = 'inventory_reduction';
    } else if (input.blocked_road_id || (input.blocked_route_ids && input.blocked_route_ids.length > 0)) {
      resolvedScenarioType = 'road_blockage';
    } else {
      resolvedScenarioType = 'compound';
    }
  }

  const validTypes: SimulationScenarioType[] = [
    'fleet_reduction',
    'inventory_reduction',
    'road_blockage',
    'compound',
  ];
  if (!validTypes.includes(resolvedScenarioType)) {
    throw new SimulationValidationError(
      'scenario_type',
      `Unsupported scenario type '${resolvedScenarioType}'. Supported: ${validTypes.join(', ')}`
    );
  }

  // 3. Verify target center if provided
  let targetCenter: { id: string; name: string; vehicles_available: number; boats_available: number } | null = null;
  if (input.center_id) {
    const centerRes = await query<{
      id: string;
      name: string;
      vehicles_available: number;
      boats_available: number;
    }>(
      'SELECT id, name, vehicles_available, boats_available FROM resource_centers WHERE id = $1',
      [input.center_id]
    );
    if (centerRes.rows.length === 0) {
      throw new SimulationValidationError('center_id', `Resource center with ID '${input.center_id}' not found`, 404);
    }
    targetCenter = centerRes.rows[0];
  }

  // 4. Validate fleet scenario
  if (resolvedScenarioType === 'fleet_reduction' || resolvedScenarioType === 'compound') {
    if (input.remove_vehicles !== undefined) {
      if (
        typeof input.remove_vehicles !== 'number' ||
        !Number.isInteger(input.remove_vehicles) ||
        input.remove_vehicles < 0
      ) {
        throw new SimulationValidationError('remove_vehicles', 'remove_vehicles must be a non-negative integer');
      }
    }
    if (input.remove_boats !== undefined) {
      if (
        typeof input.remove_boats !== 'number' ||
        !Number.isInteger(input.remove_boats) ||
        input.remove_boats < 0
      ) {
        throw new SimulationValidationError('remove_boats', 'remove_boats must be a non-negative integer');
      }
    }

    if (
      resolvedScenarioType === 'fleet_reduction' &&
      (input.remove_vehicles === undefined || input.remove_vehicles === 0) &&
      (input.remove_boats === undefined || input.remove_boats === 0)
    ) {
      throw new SimulationValidationError(
        'fleet_reduction',
        'Fleet reduction scenario requires either remove_vehicles or remove_boats to be greater than 0'
      );
    }
  }

  // 5. Validate inventory scenario
  if (resolvedScenarioType === 'inventory_reduction' || resolvedScenarioType === 'compound') {
    if (input.reduce_stock_pct !== undefined) {
      if (
        typeof input.reduce_stock_pct !== 'number' ||
        input.reduce_stock_pct <= 0 ||
        input.reduce_stock_pct > 100
      ) {
        throw new SimulationValidationError(
          'reduce_stock_pct',
          'reduce_stock_pct must be a percentage between 1 and 100'
        );
      }
    }

    if (input.reduce_quantity !== undefined) {
      if (
        typeof input.reduce_quantity !== 'number' ||
        !Number.isInteger(input.reduce_quantity) ||
        input.reduce_quantity <= 0
      ) {
        throw new SimulationValidationError('reduce_quantity', 'reduce_quantity must be a positive integer');
      }
    }

    if (input.resource_type) {
      const validResources = ['food_kits', 'water_units', 'boats', 'medical_teams'];
      if (!validResources.includes(input.resource_type)) {
        throw new SimulationValidationError(
          'resource_type',
          `resource_type must be one of: ${validResources.join(', ')}`
        );
      }
    }

    if (
      resolvedScenarioType === 'inventory_reduction' &&
      input.reduce_stock_pct === undefined &&
      input.reduce_quantity === undefined
    ) {
      throw new SimulationValidationError(
        'inventory_reduction',
        'Inventory reduction scenario requires either reduce_stock_pct (1-100) or reduce_quantity'
      );
    }
  }

  // 6. Validate road scenario
  const targetRoads: RoadSegment[] = [];
  const roadIdsToCheck = new Set<string>();
  if (input.blocked_road_id) roadIdsToCheck.add(input.blocked_road_id.trim());
  if (input.blocked_route_ids && Array.isArray(input.blocked_route_ids)) {
    input.blocked_route_ids.forEach((id) => roadIdsToCheck.add(id.trim()));
  }

  if (roadIdsToCheck.size > 0) {
    for (const rId of roadIdsToCheck) {
      const roadRes = await query<{
        id: string;
        name: string;
        length_km: number;
        status: string;
        risk_score: number;
      }>('SELECT id, name, length_km, status, risk_score FROM road_segments WHERE id = $1', [rId]);

      if (roadRes.rows.length === 0) {
        throw new SimulationValidationError('road_id', `Road segment with ID '${rId}' not found`, 404);
      }
      targetRoads.push(roadRes.rows[0] as any);
    }
  } else if (resolvedScenarioType === 'road_blockage') {
    throw new SimulationValidationError(
      'blocked_road_id',
      'Road blockage scenario requires at least one blocked_road_id or blocked_route_ids'
    );
  }

  return {
    targetZoneId,
    targetPlanningDays,
    resolvedScenarioType,
    targetCenter,
    targetRoads,
  };
}

/**
 * Pure simulation runner. Loads baseline state, clones inventory in memory, applies
 * constraints, re-computes allocation, compares diffs, and saves audit record.
 */
export async function runWhatIfSimulation(
  input: SimulationInput,
  userId?: string | null,
  userRole?: string
): Promise<SimulationRunResult> {
  // 1. Validation
  const { targetZoneId, targetPlanningDays, resolvedScenarioType, targetCenter, targetRoads } =
    await validateSimulationInput(input);

  // 2. Load pristine baseline allocation context
  const baselineContext = await loadZoneAllocationContext(targetZoneId, {
    planning_days: targetPlanningDays,
  });

  const baselineDemand = baselineContext.demandResult;
  const baselineAllocation = baselineContext.baselineAllocation;

  // 3. Deep-clone the inventory pool to guarantee zero mutation of real database state
  const simulatedPool: InventoryPool = JSON.parse(JSON.stringify(baselineContext.inventoryPool));

  // 4. Apply Fleet Reduction Scenario
  if (input.remove_vehicles !== undefined && input.remove_vehicles > 0) {
    if (input.center_id) {
      const center = simulatedPool[input.center_id];
      if (center) {
        if (input.remove_vehicles > center.center.vehicles_available) {
          throw new SimulationValidationError(
            'remove_vehicles',
            `Cannot remove ${input.remove_vehicles} vehicles from ${center.center.name}; only ${center.center.vehicles_available} available.`
          );
        }
        center.center.vehicles_available = Math.max(0, center.center.vehicles_available - input.remove_vehicles);
      }
    } else {
      let rem = input.remove_vehicles;
      const totalVehiclesAvailable = Object.values(simulatedPool).reduce(
        (acc, c) => acc + c.center.vehicles_available,
        0
      );
      if (input.remove_vehicles > totalVehiclesAvailable) {
        throw new SimulationValidationError(
          'remove_vehicles',
          `Cannot remove ${input.remove_vehicles} vehicles; only ${totalVehiclesAvailable} total vehicles available across all depots.`
        );
      }
      for (const c of Object.values(simulatedPool)) {
        if (rem <= 0) break;
        const take = Math.min(rem, c.center.vehicles_available);
        c.center.vehicles_available -= take;
        rem -= take;
      }
    }
  }

  if (input.remove_boats !== undefined && input.remove_boats > 0) {
    if (input.center_id) {
      const center = simulatedPool[input.center_id];
      if (center) {
        if (input.remove_boats > center.stock.boats) {
          throw new SimulationValidationError(
            'remove_boats',
            `Cannot remove ${input.remove_boats} boats from ${center.center.name}; only ${center.stock.boats} available.`
          );
        }
        center.stock.boats = Math.max(0, center.stock.boats - input.remove_boats);
        center.center.boats_available = Math.max(0, center.center.boats_available - input.remove_boats);
      }
    } else {
      let rem = input.remove_boats;
      const totalBoatsAvailable = Object.values(simulatedPool).reduce(
        (acc, c) => acc + c.stock.boats,
        0
      );
      if (input.remove_boats > totalBoatsAvailable) {
        throw new SimulationValidationError(
          'remove_boats',
          `Cannot remove ${input.remove_boats} boats; only ${totalBoatsAvailable} total boats available across all riverine bases.`
        );
      }
      for (const c of Object.values(simulatedPool)) {
        if (rem <= 0) break;
        const take = Math.min(rem, c.stock.boats);
        c.stock.boats -= take;
        c.center.boats_available -= take;
        rem -= take;
      }
    }
  }

  // 5. Apply Inventory Reduction Scenario
  if (input.reduce_stock_pct !== undefined && input.reduce_stock_pct > 0) {
    const factor = (100 - input.reduce_stock_pct) / 100;
    for (const [cId, poolItem] of Object.entries(simulatedPool)) {
      if (!input.center_id || input.center_id === cId) {
        if (!input.resource_type || input.resource_type === 'food_kits') {
          poolItem.stock.food_kits = Math.floor(poolItem.stock.food_kits * factor);
        }
        if (!input.resource_type || input.resource_type === 'water_units') {
          poolItem.stock.water_units = Math.floor(poolItem.stock.water_units * factor);
        }
        if (input.resource_type === 'boats') {
          poolItem.stock.boats = Math.floor(poolItem.stock.boats * factor);
          poolItem.center.boats_available = poolItem.stock.boats;
        }
        if (input.resource_type === 'medical_teams') {
          poolItem.stock.medical_teams = Math.floor(poolItem.stock.medical_teams * factor);
          poolItem.center.medical_teams_available = poolItem.stock.medical_teams;
        }
      }
    }
  } else if (input.reduce_quantity !== undefined && input.reduce_quantity > 0 && input.resource_type) {
    const rType = input.resource_type;
    if (input.center_id) {
      const center = simulatedPool[input.center_id];
      if (center) {
        if (input.reduce_quantity > center.stock[rType]) {
          throw new SimulationValidationError(
            'reduce_quantity',
            `Cannot reduce ${input.reduce_quantity} ${rType} from ${center.center.name}; only ${center.stock[rType]} in stock.`
          );
        }
        center.stock[rType] = Math.max(0, center.stock[rType] - input.reduce_quantity);
      }
    } else {
      let rem = input.reduce_quantity;
      for (const c of Object.values(simulatedPool)) {
        if (rem <= 0) break;
        const take = Math.min(rem, c.stock[rType]);
        c.stock[rType] -= take;
        rem -= take;
      }
    }
  }

  // 6. Run Deterministic Allocation Engine on Simulated In-Memory Pool
  const simulatedAllocation = computeDeterministicAllocation(baselineDemand, simulatedPool);

  // 7. Compute Baseline-versus-Scenario Diff
  const resourceCategories: Array<'food_kits' | 'water_units' | 'boats' | 'medical_teams'> = [
    'food_kits',
    'water_units',
    'boats',
    'medical_teams',
  ];

  const resourceDiffs: ResourceDiffItem[] = [];
  const newShortages: Array<{ resource: string; deficit: number }> = [];

  for (const cat of resourceCategories) {
    const bItem = baselineAllocation.allocations[cat];
    const sItem = simulatedAllocation.allocations[cat];

    const baselineAlloc = bItem.allocated_quantity;
    const simulatedAlloc = sItem.allocated_quantity;
    const baselineUnmet = bItem.unmet_quantity;
    const simulatedUnmet = sItem.unmet_quantity;
    const unmetIncrease = Math.max(0, simulatedUnmet - baselineUnmet);

    let status: 'fulfilled' | 'new_shortage' | 'worsened' | 'unchanged' = 'unchanged';
    if (simulatedUnmet > 0 && baselineUnmet === 0) {
      status = 'new_shortage';
      newShortages.push({ resource: bItem.name, deficit: simulatedUnmet });
    } else if (simulatedUnmet > baselineUnmet) {
      status = 'worsened';
      newShortages.push({ resource: bItem.name, deficit: unmetIncrease });
    } else if (simulatedUnmet === 0 && baselineUnmet === 0) {
      status = 'fulfilled';
    }

    resourceDiffs.push({
      resource_type: cat,
      name: bItem.name,
      unit: bItem.unit,
      requested_quantity: bItem.requested_quantity,
      baseline_allocated: baselineAlloc,
      simulated_allocated: simulatedAlloc,
      baseline_unmet: baselineUnmet,
      simulated_unmet: simulatedUnmet,
      unmet_increase: unmetIncrease,
      shortage_status: status,
    });
  }

  // 8. Track Supplying Centers Changes
  const centerDiffs: CenterSupplyDiffItem[] = [];
  for (const cat of resourceCategories) {
    const bCenters = baselineAllocation.allocations[cat].supplying_centers || [];
    const sCenters = simulatedAllocation.allocations[cat].supplying_centers || [];

    const centerMap = new Map<string, { name: string; bQty: number; sQty: number }>();
    bCenters.forEach((c) => {
      centerMap.set(c.center_id, { name: c.center_name, bQty: c.allocated_quantity, sQty: 0 });
    });
    sCenters.forEach((c) => {
      const existing = centerMap.get(c.center_id) || { name: c.center_name, bQty: 0, sQty: 0 };
      existing.sQty = c.allocated_quantity;
      centerMap.set(c.center_id, existing);
    });

    for (const [cId, item] of centerMap.entries()) {
      if (item.bQty !== item.sQty) {
        centerDiffs.push({
          center_id: cId,
          center_name: item.name,
          resource_type: cat,
          baseline_quantity: item.bQty,
          simulated_quantity: item.sQty,
          delta: item.sQty - item.bQty,
        });
      }
    }
  }

  // 9. Compute Road Impact if road blockage simulated
  let roadImpactReport: RoadImpactReport | null = null;
  if (targetRoads.length > 0) {
    const primaryRoad = targetRoads[0];
    const isRouteC = primaryRoad.id.toLowerCase().includes('route-c');

    roadImpactReport = {
      road_id: primaryRoad.id,
      road_name: primaryRoad.name,
      original_status: primaryRoad.status,
      simulated_status: 'blocked',
      length_km: Number(primaryRoad.length_km),
      risk_score: Number(primaryRoad.risk_score),
      routing_impact_notice: isRouteC
        ? `Simulated severance of primary accessible corridor (${primaryRoad.name}). Alternative routes (Route A: blocked, Route B: partial) are high-risk. Note: Automated algorithmic graph rerouting is not implemented in the current backend engine; tactical field reconnaissance required.`
        : `Road segment '${primaryRoad.name}' marked as blocked for simulated emergency convoy access. Note: Automated algorithmic graph rerouting is not implemented in the current backend engine; visual route evaluation required.`,
    };
  }

  // 10. Generate Suggested Mitigations & Summary
  const mitigations: string[] = [];
  if (newShortages.length > 0) {
    newShortages.forEach((s) => {
      mitigations.push(
        `Deficit alert: Mobilize contingency stocks from Guwahati Central Logistics Hub (Center 1) to cover unmet deficit of ${s.deficit.toLocaleString()} ${s.resource}.`
      );
    });
    mitigations.push('Coordinate with State Disaster Management Authority (SDMA) for inter-district fleet mutual aid.');
  } else {
    mitigations.push(
      'Regional inventory pool demonstrates resilience: neighboring depots successfully absorb simulated constraints without inducing new shortages.'
    );
  }

  if (targetRoads.length > 0) {
    mitigations.push(
      'Due to simulated road blockage, dispatch helicopter airdrop or shallow-draft motorized boats for severed ingress points.'
    );
  }

  const summaryExplanation = `What-If scenario '${resolvedScenarioType}' evaluated for ${baselineDemand.zone_name} over a ${targetPlanningDays}-day horizon. ${
    newShortages.length > 0
      ? `Simulated constraints induced ${newShortages.length} resource deficit(s): ${newShortages.map((s) => `${s.resource} (gap: ${s.deficit.toLocaleString()})`).join(', ')}.`
      : 'All requested relief demands remain 100% fulfilled by available multi-center regional reserves.'
  } No live database state or inventory was altered.`;

  // 11. Persist Run in simulation_runs and audit_log
  const runId = `sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  let persisted = false;

  const baseSnapshot = {
    zone_id: baselineDemand.zone_id,
    zone_name: baselineDemand.zone_name,
    affected_population: baselineDemand.affected_population,
    planning_days: targetPlanningDays,
    baseline_demands: baselineDemand.demands,
    baseline_allocations: baselineAllocation.allocations,
  };

  const changesSnapshot = {
    scenario_type: resolvedScenarioType,
    remove_vehicles: input.remove_vehicles ?? null,
    remove_boats: input.remove_boats ?? null,
    reduce_stock_pct: input.reduce_stock_pct ?? null,
    reduce_quantity: input.reduce_quantity ?? null,
    resource_type: input.resource_type ?? null,
    center_id: input.center_id ?? null,
    blocked_road_id: input.blocked_road_id ?? null,
    blocked_route_ids: input.blocked_route_ids ?? null,
    description: input.description ?? null,
  };

  const resultSnapshot = {
    simulated_allocations: simulatedAllocation.allocations,
    new_shortages: newShortages,
    resource_diffs: resourceDiffs,
    center_diffs: centerDiffs,
    road_impact: roadImpactReport,
    suggested_mitigations: mitigations,
    summary_explanation: summaryExplanation,
  };

  try {
    await query(
      `INSERT INTO simulation_runs (id, user_id, base_snapshot, changes, result)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        runId,
        userId || null,
        JSON.stringify(baseSnapshot),
        JSON.stringify(changesSnapshot),
        JSON.stringify(resultSnapshot),
      ]
    );
    persisted = true;

    // Audit log
    await query(
      `INSERT INTO audit_log (user_id, action, details)
       VALUES ($1, $2, $3)`,
      [
        userId || null,
        'SIMULATION_RUN',
        JSON.stringify({
          simulation_id: runId,
          scenario_type: resolvedScenarioType,
          zone_id: targetZoneId,
          actor_role: userRole || 'operational_officer',
          new_shortages_count: newShortages.length,
        }),
      ]
    );
  } catch (dbErr) {
    console.warn('[Simulation DB Warning]: Failed to persist simulation run to database:', dbErr);
  }

  return {
    simulation_id: runId,
    zone_id: targetZoneId,
    zone_name: baselineDemand.zone_name,
    planning_days: targetPlanningDays,
    scenario_type: resolvedScenarioType,
    changes_applied: input,
    baseline: {
      demand: baselineDemand,
      allocation: baselineAllocation,
    },
    simulated: {
      allocation: simulatedAllocation,
    },
    comparison: {
      resources: resourceDiffs,
      supplying_centers_diff: centerDiffs,
      new_shortages_detected: newShortages,
      road_impact: roadImpactReport,
    },
    suggested_mitigations: mitigations,
    summary_explanation: summaryExplanation,
    is_simulated: true,
    persisted,
    disclaimer: 'SIMULATION ONLY — No live operational inventory, vehicle availability, road status, or response plans were altered.',
    created_at: new Date().toISOString(),
  };
}
