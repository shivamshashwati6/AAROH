/**
 * RELIEF-OS Priority & Impact Scoring Engine
 * Implements PRD Module 4 (Priority / Impact Score 0–100) specifications.
 * 
 * Formula:
 * Priority Score = w1 * Pop + w2 * Sev + w3 * Med + w4 * Shortage + w5 * Access + w6 * Vuln
 * 
 * Canonical Weights:
 * - Population Impact: 25% (0.25)
 * - Severity: 20% (0.20)
 * - Medical Risk: 20% (0.20)
 * - Resource Shortage: 15% (0.15)
 * - Accessibility Difficulty: 10% (0.10)
 * - Vulnerability: 10% (0.10)
 */

import { query } from '../db';

export interface PriorityWeights {
  w_population: number;
  w_severity: number;
  w_medical: number;
  w_shortage: number;
  w_accessibility: number;
  w_vulnerability: number;
}

export interface PriorityPercentages {
  population: number;
  severity: number;
  medical: number;
  shortage: number;
  accessibility: number;
  vulnerability: number;
}

export const CANONICAL_PRIORITY_WEIGHTS: Readonly<PriorityWeights> = Object.freeze({
  w_population: 0.25,
  w_severity: 0.20,
  w_medical: 0.20,
  w_shortage: 0.15,
  w_accessibility: 0.10,
  w_vulnerability: 0.10,
});

export const SETTINGS_KEY_PRIORITY_WEIGHTS = 'priority_scoring_weights';

export interface ZoneFactorInputs {
  population_impact: number;      // 0.00 to 1.00
  severity: number;               // 0.00 to 1.00
  medical_risk: number;           // 0.00 to 1.00
  resource_shortage: number;      // 0.00 to 1.00
  accessibility_difficulty: number; // 0.00 to 1.00
  vulnerability: number;          // 0.00 to 1.00
}

export interface FactorBreakdownItem {
  raw_factor: number;
  weight: number;
  weighted_contribution: number;
  percentage_of_total: number;
}

export type PriorityBand = 'Critical' | 'High' | 'Medium' | 'Low';

export interface PriorityCalculationResult {
  priority_score: number;
  band: PriorityBand;
  weights: PriorityWeights;
  percentages: PriorityPercentages;
  factors: {
    population: FactorBreakdownItem;
    severity: FactorBreakdownItem;
    medical: FactorBreakdownItem;
    shortage: FactorBreakdownItem;
    accessibility: FactorBreakdownItem;
    vulnerability: FactorBreakdownItem;
  };
  explanation: string;
}

// In-memory cache for fast calculation without per-request DB round-trips
let cachedWeights: PriorityWeights | null = null;
let cachedUpdatedAt: string | null = null;
let lastCacheFetchTime = 0;
const CACHE_TTL_MS = 60000; // 1 minute TTL

/**
 * Normalizes input weights.
 * Supports percentages (e.g. 25, 20... sum 100) or fractional decimals (e.g. 0.25, 0.20... sum 1.0).
 * Throws an error if invalid, negative, non-finite, or sum doesn't equal 100% / 1.0.
 */
export function validateAndNormalizeWeights(input: Partial<PriorityWeights | Record<string, unknown>>): PriorityWeights {
  const fields = [
    'w_population',
    'w_severity',
    'w_medical',
    'w_shortage',
    'w_accessibility',
    'w_vulnerability',
  ] as const;

  const rawValues: Record<string, number> = {};

  for (const field of fields) {
    const val = input[field];
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0) {
      throw new Error(`Invalid weight for '${field}': must be a non-negative finite number.`);
    }
    rawValues[field] = val;
  }

  const sum = Object.values(rawValues).reduce((acc, v) => acc + v, 0);

  // Check if provided as percentages (sum ~ 100)
  if (Math.abs(sum - 100) <= 0.01) {
    return {
      w_population: parseFloat((rawValues.w_population / 100).toFixed(4)),
      w_severity: parseFloat((rawValues.w_severity / 100).toFixed(4)),
      w_medical: parseFloat((rawValues.w_medical / 100).toFixed(4)),
      w_shortage: parseFloat((rawValues.w_shortage / 100).toFixed(4)),
      w_accessibility: parseFloat((rawValues.w_accessibility / 100).toFixed(4)),
      w_vulnerability: parseFloat((rawValues.w_vulnerability / 100).toFixed(4)),
    };
  }

  // Check if provided as fractional decimals (sum ~ 1.0)
  if (Math.abs(sum - 1.0) <= 0.001) {
    return {
      w_population: parseFloat(rawValues.w_population.toFixed(4)),
      w_severity: parseFloat(rawValues.w_severity.toFixed(4)),
      w_medical: parseFloat(rawValues.w_medical.toFixed(4)),
      w_shortage: parseFloat(rawValues.w_shortage.toFixed(4)),
      w_accessibility: parseFloat(rawValues.w_accessibility.toFixed(4)),
      w_vulnerability: parseFloat(rawValues.w_vulnerability.toFixed(4)),
    };
  }

  throw new Error(
    `Total scoring weights must equal exactly 100% (or 1.00). Current sum: ${sum > 2 ? sum.toFixed(1) + '%' : (sum * 100).toFixed(1) + '%'}.`
  );
}

/**
 * Converts fractional decimal weights to whole percentage numbers.
 */
export function weightsToPercentages(w: PriorityWeights): PriorityPercentages {
  return {
    population: Math.round(w.w_population * 100),
    severity: Math.round(w.w_severity * 100),
    medical: Math.round(w.w_medical * 100),
    shortage: Math.round(w.w_shortage * 100),
    accessibility: Math.round(w.w_accessibility * 100),
    vulnerability: Math.round(w.w_vulnerability * 100),
  };
}

/**
 * Retrieves the currently active priority weights.
 * Checks memory cache, queries PostgreSQL `settings` table, and safely falls back
 * to canonical PRD defaults if database is unreachable or table uninitialized.
 */
export async function getActivePriorityWeights(): Promise<{
  weights: PriorityWeights;
  percentages: PriorityPercentages;
  is_default: boolean;
  updated_at: string;
}> {
  const now = Date.now();
  if (cachedWeights && now - lastCacheFetchTime < CACHE_TTL_MS) {
    const isDefault =
      JSON.stringify(cachedWeights) === JSON.stringify(CANONICAL_PRIORITY_WEIGHTS);
    return {
      weights: { ...cachedWeights },
      percentages: weightsToPercentages(cachedWeights),
      is_default: isDefault,
      updated_at: cachedUpdatedAt || new Date().toISOString(),
    };
  }

  try {
    const res = await query<{ value: any; updated_at: string }>(
      'SELECT value, updated_at FROM settings WHERE key = $1',
      [SETTINGS_KEY_PRIORITY_WEIGHTS]
    );

    if (res.rows.length > 0 && res.rows[0].value) {
      const normalized = validateAndNormalizeWeights(res.rows[0].value);
      cachedWeights = normalized;
      cachedUpdatedAt = res.rows[0].updated_at;
      lastCacheFetchTime = now;

      const isDefault =
        JSON.stringify(normalized) === JSON.stringify(CANONICAL_PRIORITY_WEIGHTS);

      return {
        weights: { ...normalized },
        percentages: weightsToPercentages(normalized),
        is_default: isDefault,
        updated_at: res.rows[0].updated_at,
      };
    }
  } catch (err: unknown) {
    console.warn('[Priority Service] Could not fetch settings from DB, falling back to canonical defaults:', err);
  }

  // Fallback to canonical PRD defaults
  cachedWeights = { ...CANONICAL_PRIORITY_WEIGHTS };
  cachedUpdatedAt = new Date().toISOString();
  lastCacheFetchTime = now;

  return {
    weights: { ...CANONICAL_PRIORITY_WEIGHTS },
    percentages: weightsToPercentages(CANONICAL_PRIORITY_WEIGHTS),
    is_default: true,
    updated_at: cachedUpdatedAt,
  };
}

/**
 * Persists new scoring weights in the database `settings` table and invalidates cache.
 * Restricts updates to authenticated administrators and writes an immutable audit record.
 */
export async function updatePriorityWeights(
  newWeightsInput: Partial<PriorityWeights>,
  userId?: string | null
): Promise<{
  weights: PriorityWeights;
  percentages: PriorityPercentages;
  is_default: boolean;
  updated_at: string;
}> {
  const normalized = validateAndNormalizeWeights(newWeightsInput);

  // Fetch current weights for audit log diff
  const current = await getActivePriorityWeights();

  const insertQuery = `
    INSERT INTO settings (key, value, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    RETURNING value, updated_at;
  `;

  const res = await query<{ value: any; updated_at: string }>(insertQuery, [
    SETTINGS_KEY_PRIORITY_WEIGHTS,
    JSON.stringify(normalized),
  ]);

  // Invalidate cache immediately
  cachedWeights = normalized;
  cachedUpdatedAt = res.rows[0]?.updated_at || new Date().toISOString();
  lastCacheFetchTime = Date.now();

  // Log to immutable audit_log table
  try {
    await query(
      `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
      [
        userId || null,
        'PRIORITY_WEIGHTS_UPDATED',
        JSON.stringify({
          previous_weights: current.weights,
          new_weights: normalized,
          updated_at: cachedUpdatedAt,
        }),
      ]
    );
  } catch (auditErr) {
    console.warn('[Audit Log Warning] Could not record priority weight update:', auditErr);
  }

  const isDefault =
    JSON.stringify(normalized) === JSON.stringify(CANONICAL_PRIORITY_WEIGHTS);

  return {
    weights: normalized,
    percentages: weightsToPercentages(normalized),
    is_default: isDefault,
    updated_at: cachedUpdatedAt,
  };
}

/**
 * Resets priority scoring weights back to canonical PRD defaults.
 */
export async function resetPriorityWeights(userId?: string | null): Promise<{
  weights: PriorityWeights;
  percentages: PriorityPercentages;
  is_default: boolean;
  updated_at: string;
}> {
  return updatePriorityWeights(CANONICAL_PRIORITY_WEIGHTS, userId);
}

/**
 * Determines priority band according to PRD Section 6.4:
 * Critical: >= 85
 * High:     70 - 84
 * Medium:   50 - 69
 * Low:      < 50
 */
export function getPriorityBand(score: number): PriorityBand {
  if (score >= 85) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 50) return 'Medium';
  return 'Low';
}

/**
 * Calculates priority score and factor contribution breakdown for a zone.
 * Uses active or provided weights.
 */
export function calculatePriorityScore(
  input: ZoneFactorInputs,
  weights: PriorityWeights = CANONICAL_PRIORITY_WEIGHTS
): PriorityCalculationResult {
  const w = weights;

  const cPop = input.population_impact * w.w_population;
  const cSev = input.severity * w.w_severity;
  const cMed = input.medical_risk * w.w_medical;
  const cShort = input.resource_shortage * w.w_shortage;
  const cAcc = input.accessibility_difficulty * w.w_accessibility;
  const cVuln = input.vulnerability * w.w_vulnerability;

  const rawSum = cPop + cSev + cMed + cShort + cAcc + cVuln;
  // Scaled 0 - 100 with strict rounding to integer
  const score = Math.min(100, Math.max(0, Math.round(rawSum * 100)));
  const band = getPriorityBand(score);

  const totalScoreVal = score || 1; // prevent div by zero for zero-score edge cases

  const factors = {
    population: {
      raw_factor: input.population_impact,
      weight: w.w_population,
      weighted_contribution: parseFloat((cPop * 100).toFixed(2)),
      percentage_of_total: Math.round(((cPop * 100) / totalScoreVal) * 100),
    },
    severity: {
      raw_factor: input.severity,
      weight: w.w_severity,
      weighted_contribution: parseFloat((cSev * 100).toFixed(2)),
      percentage_of_total: Math.round(((cSev * 100) / totalScoreVal) * 100),
    },
    medical: {
      raw_factor: input.medical_risk,
      weight: w.w_medical,
      weighted_contribution: parseFloat((cMed * 100).toFixed(2)),
      percentage_of_total: Math.round(((cMed * 100) / totalScoreVal) * 100),
    },
    shortage: {
      raw_factor: input.resource_shortage,
      weight: w.w_shortage,
      weighted_contribution: parseFloat((cShort * 100).toFixed(2)),
      percentage_of_total: Math.round(((cShort * 100) / totalScoreVal) * 100),
    },
    accessibility: {
      raw_factor: input.accessibility_difficulty,
      weight: w.w_accessibility,
      weighted_contribution: parseFloat((cAcc * 100).toFixed(2)),
      percentage_of_total: Math.round(((cAcc * 100) / totalScoreVal) * 100),
    },
    vulnerability: {
      raw_factor: input.vulnerability,
      weight: w.w_vulnerability,
      weighted_contribution: parseFloat((cVuln * 100).toFixed(2)),
      percentage_of_total: Math.round(((cVuln * 100) / totalScoreVal) * 100),
    },
  };

  // Generate plain-language explanation citing top contributing factors
  const ranked = [
    { name: 'population impact', share: factors.population.percentage_of_total, raw: input.population_impact },
    { name: 'disaster severity', share: factors.severity.percentage_of_total, raw: input.severity },
    { name: 'medical risk', share: factors.medical.percentage_of_total, raw: input.medical_risk },
    { name: 'resource shortages', share: factors.shortage.percentage_of_total, raw: input.resource_shortage },
    { name: 'accessibility difficulty', share: factors.accessibility.percentage_of_total, raw: input.accessibility_difficulty },
    { name: 'population vulnerability', share: factors.vulnerability.percentage_of_total, raw: input.vulnerability },
  ].sort((a, b) => b.share - a.share);

  const topTwo = ranked.slice(0, 2).map((r) => `${r.name} (${r.share}% contribution)`).join(' and ');
  const explanation = `Priority score of ${score}/100 (${band} band) driven primarily by ${topTwo} under active scoring weights.`;

  return {
    priority_score: score,
    band,
    weights: w,
    percentages: weightsToPercentages(w),
    factors,
    explanation,
  };
}
