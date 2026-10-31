import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { calculateZoneDemand, DemandValidationError, ZoneDemandInput } from '../services/demand';
import { calculateZoneAllocation, loadZoneAllocationContext, AllocationError } from '../services/allocation';
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

// -----------------------------------------------------------------------------
// POST /api/zones/:id/plan - Generate Response Plan for Zone (PRD Module 6 & 10)
// -----------------------------------------------------------------------------
const generateZonePlanBodySchema = z.object({
  planning_days: z.number().int().min(1).max(30).default(3).optional(),
  notes: z.string().max(1000).optional(),
});

zoneRouter.post(
  '/:id/plan',
  requireAuth,
  requireRole(['command_center', 'officer', 'admin']),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const parsed = generateZonePlanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid response plan generation payload',
        details: parsed.error.issues,
      });
    }

    const { planning_days, notes } = parsed.data;

    try {
      // 1. Validate zone exists in database
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
          z.geometry,
          d.is_simulated
        FROM zones z
        LEFT JOIN disasters d ON d.id = z.disaster_id
        WHERE z.id = $1`,
        [id]
      );

      if (zoneRes.rows.length === 0) {
        return res.status(404).json({ error: `Zone with ID '${id}' not found` });
      }

      const zoneRow = zoneRes.rows[0];

      // 2. Prevent accidental duplicate plan creation:
      // An active plan is in status 'draft', 'approved', 'modified', or 'in_transit'.
      // If previous plan was 'rejected', 'delivered', or 'failed', a new draft plan is permitted.
      const activePlanRes = await query<{ id: string; status: string; created_at: string }>(
        `SELECT id, status, created_at 
         FROM recommendations 
         WHERE zone_id = $1 
           AND status IN ('draft', 'approved', 'modified', 'in_transit')
         ORDER BY created_at DESC 
         LIMIT 1`,
        [id]
      );

      if (activePlanRes.rows.length > 0) {
        const existing = activePlanRes.rows[0];
        return res.status(409).json({
          error: `An active response plan already exists for this zone (Status: '${existing.status}', ID: '${existing.id}'). Reject or complete the active plan before generating a new one.`,
          code: 'ACTIVE_PLAN_EXISTS',
          active_plan_id: existing.id,
          status: existing.status,
        });
      }

      // 3. Compute deterministic resource demand & allocation against current live inventory
      const context = await loadZoneAllocationContext(id, { planning_days: planning_days ?? 3 });
      const baselineAllocation = context.baselineAllocation;

      // 4. Road accessibility checks: Query candidate road corridors to identify safe traversable route
      const roadsRes = await query<{
        id: string;
        name: string;
        status: string;
        length_km: string;
        risk_score: number;
      }>(
        `SELECT id, name, status, length_km, risk_score 
         FROM road_segments 
         ORDER BY 
           CASE status 
             WHEN 'accessible' THEN 1 
             WHEN 'partial' THEN 2 
             ELSE 3 
           END ASC, 
           risk_score ASC`
      );

      const candidateRoutes = roadsRes.rows;
      // Prioritize accessible route first, then partial, avoiding blocked roads
      const bestRoute =
        candidateRoutes.find((r) => r.status === 'accessible') ||
        candidateRoutes.find((r) => r.status === 'partial') ||
        candidateRoutes[0];

      const selectedRouteStr = bestRoute
        ? `${bestRoute.name} (${bestRoute.length_km} km, ${
            bestRoute.status === 'accessible' ? 'Accessible' : 'Partial access with hazard'
          })`
        : 'Standard Operational Transit Corridor';

      const alternateRoutes = candidateRoutes
        .filter((r) => !bestRoute || r.id !== bestRoute.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          reason:
            r.status === 'blocked'
              ? 'Flooded / impassable hazard'
              : r.status === 'partial'
              ? 'Waterlogged shoulders / caution advised'
              : 'Accessible alternate route',
        }));

      // 5. Nearest shelter proximity check
      const shelterRes = await query<{
        id: string;
        name: string;
        capacity: number;
        occupied: number;
        available_spaces: number;
        distance_km: string;
      }>(
        `SELECT 
          id, 
          name, 
          capacity, 
          occupied, 
          (capacity - occupied) as available_spaces,
          round((ST_DistanceSphere(location, $1::geometry) / 1000.0)::numeric, 1) as distance_km
        FROM shelters
        ORDER BY 
          CASE WHEN (capacity - occupied) > 0 THEN 0 ELSE 1 END ASC,
          distance_km ASC
        LIMIT 1`,
        [zoneRow.geometry]
      );

      const nearestShelter = shelterRes.rows[0];
      const shelterAllocation = nearestShelter
        ? {
            shelter_id: nearestShelter.id,
            distance_km: parseFloat(nearestShelter.distance_km || '0'),
            shelter_name: nearestShelter.name,
            allocated_evacuees: Math.min(200, Math.max(0, nearestShelter.available_spaces || 0)),
          }
        : null;

      // 6. Compute zone priority rank relative to other zones
      const rankRes = await query<{ rank: string }>(
        `SELECT count(*) + 1 as rank FROM zones WHERE priority_score > $1`,
        [zoneRow.priority_score]
      );
      const priorityRank = parseInt(rankRes.rows[0]?.rank || '1', 10);

      // 7. Identify resource shortages / gaps
      const shortageList: string[] = [];
      if (baselineAllocation.allocations.food_kits.shortage_detected) {
        shortageList.push(
          `${baselineAllocation.allocations.food_kits.unmet_quantity.toLocaleString()} food kits`
        );
      }
      if (baselineAllocation.allocations.water_units.shortage_detected) {
        shortageList.push(
          `${baselineAllocation.allocations.water_units.unmet_quantity.toLocaleString()} water units`
        );
      }
      if (baselineAllocation.allocations.boats.shortage_detected) {
        shortageList.push(
          `${baselineAllocation.allocations.boats.unmet_quantity} rescue boats`
        );
      }
      if (baselineAllocation.allocations.medical_teams.shortage_detected) {
        shortageList.push(
          `${baselineAllocation.allocations.medical_teams.unmet_quantity} medical teams`
        );
      }

      // 8. Construct canonical plan JSON
      const planJson = {
        score: zoneRow.priority_score,
        zone_name: zoneRow.name,
        priority_rank: priorityRank,
        source_center: baselineAllocation.primary_source_center.name,
        source_center_id: baselineAllocation.primary_source_center.id,
        selected_route: selectedRouteStr,
        selected_route_id: bestRoute?.id || null,
        alternate_routes: alternateRoutes,
        shelter_allocation: shelterAllocation,
        resources_recommended: {
          boats: baselineAllocation.allocations.boats.allocated_quantity,
          food_kits: baselineAllocation.allocations.food_kits.allocated_quantity,
          water_units: baselineAllocation.allocations.water_units.allocated_quantity,
          medical_teams: baselineAllocation.allocations.medical_teams.allocated_quantity,
        },
        allocations: baselineAllocation.allocations,
        demand_summary: baselineAllocation.demand_summary,
        planning_horizon_days: planning_days ?? 3,
      };

      // 9. Generate plain-language explainable recommendation rationale
      let explanation = `${zoneRow.name} ranked #${priorityRank} ${zoneRow.band} Priority (Score ${
        zoneRow.priority_score
      }/100) because ${zoneRow.affected_population.toLocaleString()} people are affected, medical urgency is ${
        zoneRow.medical_risk
      }, and regional accessibility is ${Math.round(
        zoneRow.accessibility * 100
      )}%. Primary dispatch base: ${baselineAllocation.primary_source_center.name} (${
        baselineAllocation.primary_source_center.distance_km
      } km away). Recommended safe route: ${bestRoute ? bestRoute.name : 'Standard Transit Route'}.`;

      if (shortageList.length > 0) {
        explanation += ` ⚠️ Resource Gaps Detected: Unmet requirements for ${shortageList.join(
          ', '
        )} due to regional depot stock limits. Mobilization of state-level reserve stockpile recommended.`;
      } else {
        explanation += ` 100% of required resources allocated from active regional inventories without deficit.`;
      }

      // 10. Persist new plan strictly as 'draft' recommendation linked to zone
      const planId = `rec-${id}-${Date.now().toString(36)}`;
      const insertRes = await query(
        `INSERT INTO recommendations (
          id, zone_id, plan, explanation, status, created_at
        ) VALUES ($1, $2, $3, $4, 'draft', CURRENT_TIMESTAMP)
        RETURNING id, zone_id, plan, explanation, approved_by, approved_at, status, created_at`,
        [planId, id, JSON.stringify(planJson), explanation]
      );

      const createdPlan = insertRes.rows[0];

      // 11. Record immutable audit log event
      try {
        await query(
          `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
          [
            req.user!.id,
            'RESPONSE_PLAN_GENERATED',
            JSON.stringify({
              recommendation_id: planId,
              zone_id: id,
              actor_id: req.user!.id,
              actor_name: req.user!.name,
              actor_role: req.user!.role,
              planning_days: planning_days ?? 3,
              notes: notes || null,
            }),
          ]
        );
      } catch (auditErr) {
        console.warn('[Audit Log Warning]: Could not record plan generation:', auditErr);
      }

      // 12. Return saved draft plan (Zero inventory deducted)
      return res.status(201).json({
        success: true,
        message: `Response plan drafted successfully for ${zoneRow.name}. Status: DRAFT. Zero inventory deducted.`,
        recommendation: createdPlan,
        plan: createdPlan.plan,
        explanation: createdPlan.explanation,
      });
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
      console.error(`[API Zone Plan Generation Error ${id}]:`, err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to generate response plan for zone' });
    }
  }
);


