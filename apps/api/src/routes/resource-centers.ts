import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db';

export const resourceCenterRouter = Router();

const listCentersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// -----------------------------------------------------------------------------
// GET /api/resource-centers - List all regional logistics depots & fleet levels
// -----------------------------------------------------------------------------
resourceCenterRouter.get('/', async (req: Request, res: Response) => {
  const parsed = listCentersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.issues,
    });
  }

  const { limit, offset } = parsed.data;

  try {
    const countRes = await query<{ count: string }>(
      'SELECT count(*) as count FROM resource_centers'
    );
    const total = parseInt(countRes.rows[0]?.count || '0', 10);

    const dataRes = await query(
      `SELECT 
        id, 
        name, 
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng, 
        vehicles_available, 
        boats_available, 
        medical_teams_available, 
        (vehicles_available + boats_available) as total_fleet, 
        created_at 
      FROM resource_centers 
      ORDER BY total_fleet DESC, id ASC 
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const items = dataRes.rows.map((c) => ({
      id: c.id,
      name: c.name,
      location_lat: parseFloat(c.lat),
      location_lng: parseFloat(c.lng),
      vehicles_available: c.vehicles_available,
      boats_available: c.boats_available,
      medical_teams_available: c.medical_teams_available,
      total_fleet: c.total_fleet,
      created_at: c.created_at,
    }));

    return res.status(200).json({
      items,
      total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    console.error('[API Resource Centers List Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve resource centers from database' });
  }
});

// -----------------------------------------------------------------------------
// GET /api/resource-centers/:id - Single Resource Center Detail & Supplies
// -----------------------------------------------------------------------------
resourceCenterRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const centerRes = await query(
      `SELECT 
        id, 
        name, 
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng, 
        vehicles_available, 
        boats_available, 
        medical_teams_available, 
        (vehicles_available + boats_available) as total_fleet, 
        created_at 
      FROM resource_centers 
      WHERE id = $1`,
      [id]
    );

    if (centerRes.rows.length === 0) {
      return res.status(404).json({ error: `Resource center with ID '${id}' not found` });
    }

    const c = centerRes.rows[0];

    // Fetch warehouse stock from resources inventory table
    const inventoryRes = await query(
      `SELECT id, resource_type, quantity, status, created_at 
       FROM resources 
       WHERE center_id = $1 
       ORDER BY resource_type ASC`,
      [id]
    );

    return res.status(200).json({
      id: c.id,
      name: c.name,
      location_lat: parseFloat(c.lat),
      location_lng: parseFloat(c.lng),
      vehicles_available: c.vehicles_available,
      boats_available: c.boats_available,
      medical_teams_available: c.medical_teams_available,
      total_fleet: c.total_fleet,
      inventory: inventoryRes.rows,
      created_at: c.created_at,
    });
  } catch (err: unknown) {
    console.error(`[API Resource Center Get Error ${id}]:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve resource center from database' });
  }
});
