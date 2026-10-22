import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db';

export const shelterRouter = Router();

const listSheltersQuerySchema = z.object({
  available_only: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  min_capacity: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const suggestSheltersQuerySchema = z.object({
  zone_id: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  people: z.coerce.number().int().min(1).default(50),
  limit: z.coerce.number().int().min(1).max(10).default(3),
});

// -----------------------------------------------------------------------------
// GET /api/shelters - List all emergency shelters with live occupancy
// -----------------------------------------------------------------------------
shelterRouter.get('/', async (req: Request, res: Response) => {
  const parsed = listSheltersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.issues,
    });
  }

  const { available_only, min_capacity, limit, offset } = parsed.data;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (available_only) {
    conditions.push('occupied < capacity');
  }
  if (min_capacity !== undefined) {
    params.push(min_capacity);
    conditions.push(`capacity >= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await query<{ count: string }>(
      `SELECT count(*) as count FROM shelters ${whereClause}`,
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
        name, 
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng, 
        capacity, 
        occupied, 
        (capacity - occupied) as available_spaces, 
        round((occupied::numeric / nullif(capacity, 0)::numeric * 100), 1) as occupancy_pct, 
        facilities, 
        created_at 
      FROM shelters 
      ${whereClause} 
      ORDER BY occupancy_pct DESC, capacity DESC 
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const items = dataRes.rows.map((r) => ({
      id: r.id,
      name: r.name,
      location_lat: parseFloat(r.lat),
      location_lng: parseFloat(r.lng),
      capacity: r.capacity,
      occupied: r.occupied,
      available_spaces: Math.max(0, r.available_spaces),
      occupancy_pct: parseFloat(r.occupancy_pct || '0'),
      facilities: r.facilities || [],
      is_overcrowded: parseFloat(r.occupancy_pct || '0') >= 90.0,
      created_at: r.created_at,
    }));

    return res.status(200).json({
      items,
      total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    console.error('[API Shelters List Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve shelters from database' });
  }
});

// -----------------------------------------------------------------------------
// GET /api/shelters/suggest - Smart Capacity & Spatial Proximity Recommendation
// -----------------------------------------------------------------------------
shelterRouter.get('/suggest', async (req: Request, res: Response) => {
  const parsed = suggestSheltersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.issues,
    });
  }

  let { zone_id, lat, lng, people, limit } = parsed.data;

  // Resolve coordinates from zone_id if lat/lng not explicitly provided
  if (zone_id && (lat === undefined || lng === undefined)) {
    try {
      const zoneRes = await query(
        `SELECT ST_Y(geometry::geometry) as lat, ST_X(geometry::geometry) as lng, name FROM zones WHERE id = $1`,
        [zone_id]
      );
      if (zoneRes.rows.length === 0) {
        return res.status(404).json({ error: `Zone with ID '${zone_id}' not found` });
      }
      lat = parseFloat(zoneRes.rows[0].lat);
      lng = parseFloat(zoneRes.rows[0].lng);
    } catch (err: unknown) {
      console.error('[API Shelter Suggest Zone Lookup Error]:', err);
      return res.status(500).json({ error: 'Failed to lookup zone coordinates' });
    }
  }

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({
      error: 'Either zone_id or both lat and lng parameters are required to calculate shelter proximity',
    });
  }

  try {
    // PostGIS distance computation in kilometers using ST_DistanceSphere
    const suggestionsRes = await query(
      `SELECT 
        id, 
        name, 
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng, 
        capacity, 
        occupied, 
        (capacity - occupied) as available_spaces, 
        round((occupied::numeric / nullif(capacity, 0)::numeric * 100), 1) as occupancy_pct, 
        facilities, 
        round((ST_DistanceSphere(location, ST_SetSRID(ST_MakePoint($1, $2), 4326)) / 1000.0)::numeric, 1) as distance_km 
      FROM shelters 
      WHERE (capacity - occupied) > 0 
      ORDER BY 
        CASE WHEN (capacity - occupied) >= $3 THEN 0 ELSE 1 END ASC, 
        distance_km ASC 
      LIMIT $4`,
      [lng, lat, people, limit]
    );

    const suggestions = suggestionsRes.rows.map((s) => {
      const available = Math.max(0, s.available_spaces);
      const occupancy = parseFloat(s.occupancy_pct || '0');
      const dist = parseFloat(s.distance_km || '0');
      return {
        id: s.id,
        name: s.name,
        location_lat: parseFloat(s.lat),
        location_lng: parseFloat(s.lng),
        capacity: s.capacity,
        occupied: s.occupied,
        available_spaces: available,
        occupancy_pct: occupancy,
        distance_km: dist,
        facilities: s.facilities || [],
        can_accommodate: available >= people,
        recommended: available >= people && occupancy < 85,
        evacuation_note:
          available >= people
            ? `Can accommodate all ${people} evacuees (${dist} km away).`
            : `Partial capacity only (${available} of ${people} spaces available).`,
      };
    });

    return res.status(200).json({
      target_location: { lat, lng, zone_id: zone_id || null },
      requested_evacuees: people,
      suggestions_count: suggestions.length,
      suggestions,
    });
  } catch (err: unknown) {
    console.error('[API Shelters Suggest Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to compute shelter suggestions from database' });
  }
});

// -----------------------------------------------------------------------------
// GET /api/shelters/:id - Single Shelter Detail
// -----------------------------------------------------------------------------
shelterRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const resDb = await query(
      `SELECT 
        id, 
        name, 
        ST_Y(location::geometry) as lat, 
        ST_X(location::geometry) as lng, 
        capacity, 
        occupied, 
        (capacity - occupied) as available_spaces, 
        round((occupied::numeric / nullif(capacity, 0)::numeric * 100), 1) as occupancy_pct, 
        facilities, 
        created_at 
      FROM shelters 
      WHERE id = $1`,
      [id]
    );

    if (resDb.rows.length === 0) {
      return res.status(404).json({ error: `Shelter with ID '${id}' not found` });
    }

    const s = resDb.rows[0];
    return res.status(200).json({
      id: s.id,
      name: s.name,
      location_lat: parseFloat(s.lat),
      location_lng: parseFloat(s.lng),
      capacity: s.capacity,
      occupied: s.occupied,
      available_spaces: Math.max(0, s.available_spaces),
      occupancy_pct: parseFloat(s.occupancy_pct || '0'),
      facilities: s.facilities || [],
      is_overcrowded: parseFloat(s.occupancy_pct || '0') >= 90.0,
      created_at: s.created_at,
    });
  } catch (err: unknown) {
    console.error(`[API Shelter Get Error ${id}]:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve shelter from database' });
  }
});
