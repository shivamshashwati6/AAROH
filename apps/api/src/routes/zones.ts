import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { calculateZoneDemand, DemandValidationError, ZoneDemandInput } from '../services/demand';
import { calculateZoneAllocation, AllocationError } from '../services/allocation';
import { requireAuth, requireRole } from '../middleware/auth';
import { UserRole } from '@relief-os/shared';

export const zoneRouter = Router();

// Internal operational planning roles permitted to access demand & allocation data
const PLANNING_ROLES: UserRole[] = ['command_center', 'department', 'officer', 'coordinator', 'team_lead', 'admin'];



const listZonesQuerySchema = z.object({
  disaster_id: z.string().optional(),
  band: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
  min_priority: z.coerce.number().min(0).max(100).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// -----------------------------------------------------------------------------
// GET /api/zones - List zones with geospatial coordinates & priority filters
// -----------------------------------------------------------------------------
zoneRouter.get('/', async (req: Request, res: Response) => {
  const parsed = listZonesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.issues,
    });
  }

  const { disaster_id, band, min_priority, severity, limit, offset } = parsed.data;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (disaster_id) {
    params.push(disaster_id);
    conditions.push(`disaster_id = $${params.length}`);
  }
  if (band) {
    params.push(band);
    conditions.push(`band = $${params.length}`);
  }
  if (min_priority !== undefined) {
    params.push(min_priority);
    conditions.push(`priority_score >= $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    conditions.push(`severity = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await query<{ count: string }>(
      `SELECT count(*) as count FROM zones ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const dataRes = await query(
      `SELECT 
        id, 
        disaster_id, 
        name, 
        ST_Y(geometry::geometry) as lat, 
        ST_X(geometry::geometry) as lng, 
        population, 
        affected_population, 
        severity, 
        medical_risk, 
        accessibility::float as accessibility, 
        vulnerability::float as vulnerability, 
        priority_score, 
        band, 
        breakdown_json, 
        created_at 
      FROM zones 
      ${whereClause} 
      ORDER BY priority_score DESC, affected_population DESC 
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const formattedZones = dataRes.rows.map((row) => ({
      id: row.id,
      disaster_id: row.disaster_id,
      name: row.name,
      location_lat: row.lat !== null ? parseFloat(row.lat) : null,
      location_lng: row.lng !== null ? parseFloat(row.lng) : null,
      population: row.population,
      affected_population: row.affected_population,
      severity: row.severity,
      medical_risk: row.medical_risk,
      accessibility: row.accessibility,
      vulnerability: row.vulnerability,
      priority_score: row.priority_score,
      band: row.band,
      breakdown: row.breakdown_json || null,
      created_at: row.created_at,
    }));

    return res.status(200).json({
      items: formattedZones,
      total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    console.error('[API Zones List Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve zones from database' });
  }
});

// -----------------------------------------------------------------------------
// GET /api/zones/:id - Single Zone Detail with AI Breakdown & Active Plan
// -----------------------------------------------------------------------------
zoneRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const zoneRes = await query(
      `SELECT 
        id, 
        disaster_id, 
        name, 
        ST_Y(geometry::geometry) as lat, 
        ST_X(geometry::geometry) as lng, 
        population, 
        affected_population, 
        severity, 
        medical_risk, 
        accessibility::float as accessibility, 
        vulnerability::float as vulnerability, 
        priority_score, 
        band, 
        breakdown_json, 
        created_at 
      FROM zones 
      WHERE id = $1`,
      [id]
    );

    if (zoneRes.rows.length === 0) {
      return res.status(404).json({ error: `Zone with ID '${id}' not found` });
    }

    const row = zoneRes.rows[0];

    // Fetch existing recommendation or draft plan if available
    const recRes = await query(
      `SELECT id, plan, explanation, status, approved_at, approved_by, created_at 
       FROM recommendations 
       WHERE zone_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [id]
    );

    const rec = recRes.rows[0];

    return res.status(200).json({
      id: row.id,
      disaster_id: row.disaster_id,
      name: row.name,
      location_lat: row.lat !== null ? parseFloat(row.lat) : null,
      location_lng: row.lng !== null ? parseFloat(row.lng) : null,
      population: row.population,
      affected_population: row.affected_population,
      severity: row.severity,
      medical_risk: row.medical_risk,
      accessibility: row.accessibility,
      vulnerability: row.vulnerability,
      priority_score: row.priority_score,
      band: row.band,
      breakdown: row.breakdown_json || null,
      recommendation: rec
        ? {
            id: rec.id,
            plan: rec.plan,
            explanation: rec.explanation,
            status: rec.status,
            approved_at: rec.approved_at,
            approved_by: rec.approved_by,
          }
        : null,
      created_at: row.created_at,
    });
  } catch (err: unknown) {
    console.error(`[API Zone Get Error ${id}]:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve zone detail from database' });
  }
});

// -----------------------------------------------------------------------------
// GET /api/zones/:id/demand - Deterministic Resource Demand Estimation
// -----------------------------------------------------------------------------
const getZoneDemandQuerySchema = z.object({
  planning_days: z.coerce.number().int().min(1).max(30).default(3),
});

zoneRouter.get('/:id/demand', requireAuth, requireRole(PLANNING_ROLES), async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = getZoneDemandQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters for demand calculation',
      details: parsed.error.issues,
    });
  }

  const { planning_days } = parsed.data;

  try {
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
        d.is_simulated
      FROM zones z
      LEFT JOIN disasters d ON d.id = z.disaster_id
      WHERE z.id = $1`,
      [id]
    );

    if (zoneRes.rows.length === 0) {
      return res.status(404).json({ error: `Zone with ID '${id}' not found` });
    }

    const row = zoneRes.rows[0];
    const breakdown = row.breakdown_json || {};

    const demandInput: ZoneDemandInput = {
      zone_id: row.id,
      zone_name: row.name,
      affected_population: row.affected_population,
      total_population: row.population,
      severity: row.severity,
      medical_risk: row.medical_risk,
      accessibility: row.accessibility,
      vulnerability: row.vulnerability,
      priority_score: row.priority_score,
      band: row.band,
      food_shortage_pct: breakdown.food_shortage_pct,
      water_shortage_pct: breakdown.water_shortage_pct,
      is_simulated: row.is_simulated !== null ? Boolean(row.is_simulated) : true,
    };

    const result = calculateZoneDemand(demandInput, { planning_days });

    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof DemandValidationError) {
      return res.status(400).json({ error: err.message, field: err.field });
    }
    console.error(`[API Zone Demand Error ${id}]:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to calculate resource demand for zone' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/zones/:id/demand - Calculate Demand with Custom Scenario Overrides
// -----------------------------------------------------------------------------
const postZoneDemandBodySchema = z.object({
  planning_days: z.number().int().min(1).max(30).optional(),
  affected_population: z.number().int().min(0).optional(),
  total_population: z.number().int().min(0).optional(),
  food_shortage_pct: z.number().min(0).max(100).optional(),
  water_shortage_pct: z.number().min(0).max(100).optional(),
  accessibility: z.number().min(0).max(1).optional(),
  vulnerability: z.number().min(0).max(1).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  medical_risk: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  medical_rounding_mode: z.enum(['round', 'ceil']).optional(),
}).strict();

zoneRouter.post('/:id/demand', requireAuth, requireRole(PLANNING_ROLES), async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = postZoneDemandBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid demand calculation override payload',
      details: parsed.error.issues,
    });
  }

  const overrides = parsed.data;

  try {
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
        d.is_simulated
      FROM zones z
      LEFT JOIN disasters d ON d.id = z.disaster_id
      WHERE z.id = $1`,
      [id]
    );

    if (zoneRes.rows.length === 0) {
      return res.status(404).json({ error: `Zone with ID '${id}' not found` });
    }

    const row = zoneRes.rows[0];
    const breakdown = row.breakdown_json || {};

    const effAffected = overrides.affected_population ?? row.affected_population;
    const effTotal = overrides.total_population ?? Math.max(row.population, effAffected);

    const demandInput: ZoneDemandInput = {
      zone_id: row.id,
      zone_name: row.name,
      affected_population: effAffected,
      total_population: effTotal,
      severity: overrides.severity ?? row.severity,
      medical_risk: overrides.medical_risk ?? row.medical_risk,
      accessibility: overrides.accessibility ?? row.accessibility,
      vulnerability: overrides.vulnerability ?? row.vulnerability,
      priority_score: row.priority_score,
      band: row.band,
      food_shortage_pct: overrides.food_shortage_pct ?? breakdown.food_shortage_pct,
      water_shortage_pct: overrides.water_shortage_pct ?? breakdown.water_shortage_pct,
      is_simulated: row.is_simulated !== null ? Boolean(row.is_simulated) : true,
    };

    const result = calculateZoneDemand(demandInput, {
      planning_days: overrides.planning_days ?? 3,
      medical_rounding_mode: overrides.medical_rounding_mode,
    });

    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof DemandValidationError) {
      return res.status(400).json({ error: err.message, field: err.field });
    }
    console.error(`[API Zone Demand POST Error ${id}]:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to calculate resource demand for zone' });
  }
});

// -----------------------------------------------------------------------------
// GET /api/zones/:id/allocation - Deterministic Resource Allocation Recommendation
// -----------------------------------------------------------------------------
const getZoneAllocationQuerySchema = z.object({
  planning_days: z.coerce.number().int().min(1).max(30).default(3),
});

zoneRouter.get('/:id/allocation', requireAuth, requireRole(PLANNING_ROLES), async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = getZoneAllocationQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters for allocation calculation',
      details: parsed.error.issues,
    });
  }

  const { planning_days } = parsed.data;

  try {
    const result = await calculateZoneAllocation(id, { planning_days });
    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof AllocationError) {
      if (err.code === 'ZONE_NOT_FOUND') {
        return res.status(404).json({ error: err.message, code: err.code });
      }
      return res.status(400).json({ error: err.message, code: err.code });
    }
    if (err instanceof DemandValidationError) {
      return res.status(400).json({ error: err.message, field: err.field });
    }
    console.error(`[API Zone Allocation Error ${id}]:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to calculate resource allocation for zone' });
  }
});

