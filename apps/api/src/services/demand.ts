/**
 * RELIEF-OS Deterministic Demand Estimation Service
 * Implements PRD Module 5 (Resource Demand Prediction) specifications.
 * 
 * Core Mandate:
 * Deterministic, explainable calculation of emergency relief resource needs
 * without automated dispatch or inventory side-effects.
 */

import { ZoneDemandResult, DemandResourceItem } from '@relief-os/shared';

export interface ZoneDemandInput {
  zone_id: string;
  zone_name: string;
  affected_population: number;
  total_population?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  medical_risk: 'low' | 'medium' | 'high' | 'critical';
  accessibility: number; // 0.000 (cut off) to 1.000 (accessible)
  vulnerability: number; // 0.000 (low) to 1.000 (high)
  priority_score?: number;
  band?: 'Critical' | 'High' | 'Medium' | 'Low';
  food_shortage_pct?: number; // 0 - 100
  water_shortage_pct?: number; // 0 - 100
  is_simulated?: boolean;
}

export interface DemandConfig {
  planning_days?: number; // Default 3 days (emergency relief cycle)
  food_kits_per_person_ratio?: number; // Default 0.4338 (~1 kit / 2.3 people per 3-day baseline cycle, i.e. 0.1446 kits/person/day demo assumption)
  water_units_per_person_ratio?: number; // Default 0.3414 (~1 potable pack / 2.93 people per 3-day baseline cycle, i.e. 0.1138 units/person/day demo assumption)
  stranded_people_per_boat?: number; // Default 720 stranded persons per boat in flood (demo assumption)
  people_per_medical_team?: number; // Default 3500 affected persons per team (demo assumption)
  medical_rounding_mode?: 'round' | 'ceil'; // Default 'round' to preserve PRD canonical 1 team for Zone A (3,842 pop)
}

export class DemandValidationError extends Error {
  constructor(public field: string, message: string) {
    super(`Demand calculation validation error [${field}]: ${message}`);
    this.name = 'DemandValidationError';
  }
}

// Default benchmark parameters documented as configurable demo assumptions
export const DEFAULT_DEMAND_CONFIG: Required<DemandConfig> = {
  planning_days: 3,
  food_kits_per_person_ratio: 0.4338,
  water_units_per_person_ratio: 0.3414,
  stranded_people_per_boat: 720,
  people_per_medical_team: 3500,
  medical_rounding_mode: 'round',
};

/**
 * Validates zone inputs before demand calculation.
 * Rejects negative values, out-of-bound percentages, and invalid types.
 */
export function validateZoneDemandInput(input: ZoneDemandInput): void {
  if (!input.zone_id || typeof input.zone_id !== 'string') {
    throw new DemandValidationError('zone_id', 'Zone ID is required and must be a string');
  }

  if (
    typeof input.affected_population !== 'number' ||
    !Number.isFinite(input.affected_population) ||
    !Number.isInteger(input.affected_population) ||
    input.affected_population < 0
  ) {
    throw new DemandValidationError(
      'affected_population',
      'Affected population must be a non-negative integer'
    );
  }

  if (
    input.total_population !== undefined &&
    (typeof input.total_population !== 'number' ||
      !Number.isFinite(input.total_population) ||
      input.total_population < 0 ||
      input.total_population < input.affected_population)
  ) {
    throw new DemandValidationError(
      'total_population',
      'Total population cannot be negative or less than affected population'
    );
  }

  const validSeverities = ['low', 'medium', 'high', 'critical'];
  if (!validSeverities.includes(input.severity)) {
    throw new DemandValidationError(
      'severity',
      `Severity must be one of: ${validSeverities.join(', ')}`
    );
  }

  const validMedicalRisks = ['low', 'medium', 'high', 'critical'];
  if (!validMedicalRisks.includes(input.medical_risk)) {
    throw new DemandValidationError(
      'medical_risk',
      `Medical risk must be one of: ${validMedicalRisks.join(', ')}`
    );
  }

  if (
    typeof input.accessibility !== 'number' ||
    !Number.isFinite(input.accessibility) ||
    input.accessibility < 0 ||
    input.accessibility > 1
  ) {
    throw new DemandValidationError(
      'accessibility',
      'Accessibility index must be a numeric value between 0.000 and 1.000'
    );
  }

  if (
    typeof input.vulnerability !== 'number' ||
    !Number.isFinite(input.vulnerability) ||
    input.vulnerability < 0 ||
    input.vulnerability > 1
  ) {
    throw new DemandValidationError(
      'vulnerability',
      'Vulnerability index must be a numeric value between 0.000 and 1.000'
    );
  }

  if (input.food_shortage_pct !== undefined) {
    if (
      typeof input.food_shortage_pct !== 'number' ||
      !Number.isFinite(input.food_shortage_pct) ||
      input.food_shortage_pct < 0 ||
      input.food_shortage_pct > 100
    ) {
      throw new DemandValidationError(
        'food_shortage_pct',
        'Food shortage percentage must be a number between 0 and 100'
      );
    }
  }

  if (input.water_shortage_pct !== undefined) {
    if (
      typeof input.water_shortage_pct !== 'number' ||
      !Number.isFinite(input.water_shortage_pct) ||
      input.water_shortage_pct < 0 ||
      input.water_shortage_pct > 100
    ) {
      throw new DemandValidationError(
        'water_shortage_pct',
        'Water shortage percentage must be a number between 0 and 100'
      );
    }
  }
}

/**
 * Deterministically computes required emergency relief resources for a zone.
 * 
 * Rounding Policy:
 * Standard half-up integer rounding (Math.round).
 * Bounded below by 0. If affected population is 0, demands evaluate to 0.
 */
export function calculateZoneDemand(
  input: ZoneDemandInput,
  customConfig?: DemandConfig
): ZoneDemandResult {
  validateZoneDemandInput(input);

  const config: Required<DemandConfig> = {
    ...DEFAULT_DEMAND_CONFIG,
    ...customConfig,
  };

  if (config.planning_days < 1) {
    throw new DemandValidationError('planning_days', 'Planning horizon must be at least 1 day');
  }

  const { affected_population, accessibility, severity, medical_risk } = input;

  // Zero-population boundary case
  if (affected_population === 0) {
    const emptyItem = (
      type: DemandResourceItem['resource_type'],
      name: string,
      unit: string
    ): DemandResourceItem => ({
      resource_type: type,
      name,
      quantity: 0,
      unit,
      formula: '0 affected population yields 0 demand',
      explanation: 'No population affected in this zone.',
      is_assumed_param: false,
    });

    return {
      zone_id: input.zone_id,
      zone_name: input.zone_name,
      affected_population: 0,
      priority_score: input.priority_score ?? 0,
      band: input.band ?? 'Low',
      severity: input.severity,
      medical_risk: input.medical_risk,
      accessibility: input.accessibility,
      vulnerability: input.vulnerability,
      is_simulated: Boolean(input.is_simulated ?? true),
      planning_horizon_days: config.planning_days,
      demands: {
        food_kits: emptyItem('food_kits', 'Food Relief Kits', 'kits'),
        water_units: emptyItem('water_units', 'Potable Water Units', 'units'),
        boats: emptyItem('boats', 'Rescue Boats', 'boats'),
        medical_teams: emptyItem('medical_teams', 'Medical Response Teams', 'teams'),
      },
      summary_explanation: 'Zone has zero affected population; no immediate dispatch demand required.',
      generated_at: new Date().toISOString(),
    };
  }

  // Duration scaling factor: default baseline cycle is 3 days.
  // Consumable supplies (food kits, potable water) scale linearly with planning horizon duration.
  // Capital equipment (boats) and clinical response units (medical teams) represent standing deployment capacity.
  const durationFactor = config.planning_days / 3;

  // 1. Food Kits Calculation
  // Derived from shortage percentage or fallback severity multiplier, scaled by planning horizon duration
  const foodShortageRatio =
    input.food_shortage_pct !== undefined
      ? input.food_shortage_pct / 100
      : severity === 'critical'
      ? 0.7
      : severity === 'high'
      ? 0.5
      : severity === 'medium'
      ? 0.3
      : 0.15;

  const rawFoodKits = affected_population * foodShortageRatio * config.food_kits_per_person_ratio * durationFactor;
  const foodKitsQty = Math.max(0, Math.round(rawFoodKits));

  const foodItem: DemandResourceItem = {
    resource_type: 'food_kits',
    name: 'Food Relief Ration Kits',
    quantity: foodKitsQty,
    unit: 'kits',
    formula: `round(affected_population * food_shortage_ratio * ${config.food_kits_per_person_ratio} * (planning_days / 3))`,
    explanation: `Estimated at ${foodKitsQty.toLocaleString()} kits based on ${affected_population.toLocaleString()} affected residents, ${(
      foodShortageRatio * 100
    ).toFixed(0)}% food deficit gap, and a ${config.planning_days}-day planning horizon (${(
      config.food_kits_per_person_ratio / 3
    ).toFixed(4)} kits/person/day configurable demo assumption).`,
    is_assumed_param: true,
  };

  // 2. Water Units Calculation
  const waterShortageRatio =
    input.water_shortage_pct !== undefined
      ? input.water_shortage_pct / 100
      : severity === 'critical'
      ? 0.6
      : severity === 'high'
      ? 0.45
      : severity === 'medium'
      ? 0.25
      : 0.1;

  const rawWaterUnits = affected_population * waterShortageRatio * config.water_units_per_person_ratio * durationFactor;
  const waterUnitsQty = Math.max(0, Math.round(rawWaterUnits));

  const waterItem: DemandResourceItem = {
    resource_type: 'water_units',
    name: 'Potable Drinking Water Units',
    quantity: waterUnitsQty,
    unit: 'units',
    formula: `round(affected_population * water_shortage_ratio * ${config.water_units_per_person_ratio} * (planning_days / 3))`,
    explanation: `Estimated at ${waterUnitsQty.toLocaleString()} units based on ${affected_population.toLocaleString()} affected residents, ${(
      waterShortageRatio * 100
    ).toFixed(0)}% potable water deficit, and a ${config.planning_days}-day planning horizon (${(
      config.water_units_per_person_ratio / 3
    ).toFixed(4)} units/person/day configurable demo assumption).`,
    is_assumed_param: true,
  };

  // 3. Rescue Boats Calculation
  // Driven by cut-off stranded population: affected * (1 - accessibility)
  let boatsQty = 0;
  let boatExplanation = '';
  const strandedHeadcount = Math.max(0, affected_population * (1 - accessibility));

  if (accessibility < 0.85 && (severity === 'critical' || severity === 'high')) {
    const rawBoats = strandedHeadcount / config.stranded_people_per_boat;
    boatsQty = Math.max(0, Math.round(rawBoats));
    boatExplanation = `Estimated at ${boatsQty} deployable rescue boats for ${Math.round(
      strandedHeadcount
    ).toLocaleString()} cut-off residents (${((1 - accessibility) * 100).toFixed(0)}% access restriction / index ${accessibility.toFixed(
      3
    )}) using flood evacuation model assumption (${config.stranded_people_per_boat} stranded persons/boat demo parameter).`;
  } else {
    boatsQty = 0;
    boatExplanation = `No rescue boats required; road accessibility (${accessibility.toFixed(
      2
    )}) is sufficient for land-based transport.`;
  }

  const boatItem: DemandResourceItem = {
    resource_type: 'boats',
    name: 'Deployable Rescue Boats',
    quantity: boatsQty,
    unit: 'boats',
    formula: `round((affected_population * (1 - accessibility)) / ${config.stranded_people_per_boat})`,
    explanation: boatExplanation,
    is_assumed_param: true,
  };

  // 4. Medical Response Teams Calculation
  // Supports configurable medical_rounding_mode ('round' default preserves PRD canonical Zone A 1 team)
  let medicalTeamsQty = 0;
  let medicalExplanation = '';

  if (medical_risk === 'critical' || medical_risk === 'high') {
    const rawTeams = affected_population / config.people_per_medical_team;
    const computedTeams =
      config.medical_rounding_mode === 'ceil'
        ? Math.ceil(rawTeams)
        : Math.round(rawTeams);
    medicalTeamsQty = Math.max(1, computedTeams);
    medicalExplanation = `Estimated at ${medicalTeamsQty} certified medical response unit(s) based on ${medical_risk.toUpperCase()} urgency using a configurable demo planning assumption of 1 team per ${config.people_per_medical_team.toLocaleString()} affected residents (${
      config.medical_rounding_mode === 'ceil' ? 'ceiling capacity rule' : 'nearest-load rounding rule'
    }).`;
  } else if (medical_risk === 'medium') {
    medicalTeamsQty = affected_population >= 2000 ? 1 : 0;
    medicalExplanation =
      medicalTeamsQty > 0
        ? `Estimated at 1 mobile medical unit for moderate health risks across ${affected_population.toLocaleString()} affected residents (demo threshold: >= 2,000 headcount).`
        : `No dedicated medical team required for medium urgency under 2,000 headcount (demo threshold); routine paramedic support sufficient.`;
  } else {
    medicalTeamsQty = 0;
    medicalExplanation = `No specialized emergency medical team required for low medical risk category.`;
  }

  const medicalFormula =
    config.medical_rounding_mode === 'ceil'
      ? `max(1, ceil(affected_population / ${config.people_per_medical_team})) for critical/high medical risk`
      : `max(1, round(affected_population / ${config.people_per_medical_team})) for critical/high medical risk`;

  const medicalItem: DemandResourceItem = {
    resource_type: 'medical_teams',
    name: 'Certified Medical Response Teams',
    quantity: medicalTeamsQty,
    unit: 'teams',
    formula: medicalFormula,
    explanation: medicalExplanation,
    is_assumed_param: true,
  };

  const summaryExplanation = `Calculated demand for ${input.zone_name}: ${foodKitsQty.toLocaleString()} food kits, ${waterUnitsQty.toLocaleString()} water units, ${boatsQty} rescue boat(s), and ${medicalTeamsQty} medical team(s) over a ${config.planning_days}-day planning horizon.`;

  return {
    zone_id: input.zone_id,
    zone_name: input.zone_name,
    affected_population,
    priority_score: input.priority_score ?? 0,
    band: input.band ?? 'Critical',
    severity: input.severity,
    medical_risk: input.medical_risk,
    accessibility: input.accessibility,
    vulnerability: input.vulnerability,
    is_simulated: Boolean(input.is_simulated ?? true),
    planning_horizon_days: config.planning_days,
    demands: {
      food_kits: foodItem,
      water_units: waterItem,
      boats: boatItem,
      medical_teams: medicalItem,
    },
    summary_explanation: summaryExplanation,
    generated_at: new Date().toISOString(),
  };
}
