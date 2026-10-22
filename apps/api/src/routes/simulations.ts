import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  runWhatIfSimulation,
  SimulationValidationError,
} from '../services/simulation';
import { UserRole } from '@relief-os/shared';

export const simulationRouter = Router();

// Only authorized operational officers and command personnel can run simulations (PRD Section 3 & Module 9)
const SIMULATION_ROLES: UserRole[] = ['command_center', 'officer', 'admin'];

const runSimulationBodySchema = z
  .object({
    zone_id: z.string().optional(),
    planning_days: z.number().int().min(1).max(30).optional(),
    scenario_type: z
      .enum(['fleet_reduction', 'inventory_reduction', 'road_blockage', 'compound'])
      .optional(),
    remove_vehicles: z.number().int().min(0).optional(),
    remove_boats: z.number().int().min(0).optional(),
    reduce_stock_pct: z.number().min(0).max(100).optional(),
    reduce_quantity: z.number().int().min(0).optional(),
    resource_type: z.enum(['food_kits', 'water_units', 'boats', 'medical_teams']).optional(),
    center_id: z.string().optional(),
    blocked_road_id: z.string().optional(),
    blocked_route_ids: z.array(z.string()).optional(),
    description: z.string().max(500).optional(),
  })
  .strict();

const listRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

// -----------------------------------------------------------------------------
// POST /api/simulation/run (or /api/simulations) - Run What-If Scenario
// -----------------------------------------------------------------------------
async function handleRunSimulation(req: Request, res: Response) {
  const parsed = runSimulationBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid simulation parameters',
      details: parsed.error.issues,
    });
  }

  try {
    const result = await runWhatIfSimulation(
      parsed.data,
      req.user?.id || null,
      req.user?.role
    );
    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof SimulationValidationError) {
      return res.status(err.status).json({
        error: err.message,
        field: err.field,
      });
    }
    console.error('[API Simulation Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to execute What-If simulation' });
  }
}

simulationRouter.post('/run', requireAuth, requireRole(SIMULATION_ROLES), handleRunSimulation);
simulationRouter.post('/', requireAuth, requireRole(SIMULATION_ROLES), handleRunSimulation);

// -----------------------------------------------------------------------------
// GET /api/simulation/runs (or /api/simulations) - List Historical Simulation Runs
// -----------------------------------------------------------------------------
async function handleListSimulationRuns(req: Request, res: Response) {
  const parsed = listRunsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.issues,
    });
  }

  const { limit, offset } = parsed.data;

  try {
    const countRes = await query<{ count: string }>('SELECT count(*) as count FROM simulation_runs');
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const dataRes = await query(
      `SELECT 
        sr.id, 
        sr.user_id, 
        u.name as runner_name,
        sr.base_snapshot, 
        sr.changes, 
        sr.result, 
        sr.created_at
       FROM simulation_runs sr
       LEFT JOIN users u ON u.id = sr.user_id
       ORDER BY sr.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return res.status(200).json({
      items: dataRes.rows,
      total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    console.error('[API Simulation Runs List Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve simulation history from database' });
  }
}

simulationRouter.get('/runs', requireAuth, requireRole(SIMULATION_ROLES), handleListSimulationRuns);
simulationRouter.get('/', requireAuth, requireRole(SIMULATION_ROLES), handleListSimulationRuns);

// -----------------------------------------------------------------------------
// GET /api/simulation/runs/:id - Single Simulation Run Detail
// -----------------------------------------------------------------------------
simulationRouter.get(
  '/runs/:id',
  requireAuth,
  requireRole(SIMULATION_ROLES),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const runRes = await query(
        `SELECT 
          sr.id, 
          sr.user_id, 
          u.name as runner_name,
          sr.base_snapshot, 
          sr.changes, 
          sr.result, 
          sr.created_at
         FROM simulation_runs sr
         LEFT JOIN users u ON u.id = sr.user_id
         WHERE sr.id = $1`,
        [id]
      );

      if (runRes.rows.length === 0) {
        return res.status(404).json({ error: `Simulation run with ID '${id}' not found` });
      }

      return res.status(200).json(runRes.rows[0]);
    } catch (err: unknown) {
      console.error(`[API Simulation Run Get Error ${id}]:`, err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to retrieve simulation run from database' });
    }
  }
);
