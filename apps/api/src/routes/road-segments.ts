import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

export const roadSegmentRouter = Router();

const listRoadsQuerySchema = z.object({
  status: z.enum(['accessible', 'partial', 'blocked']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const patchRoadStatusSchema = z.object({
  status: z.enum(['accessible', 'partial', 'blocked']),
  reason: z.string().max(255).optional(),
});

// -----------------------------------------------------------------------------
// GET /api/road-segments - List road network segments and condition
// -----------------------------------------------------------------------------
roadSegmentRouter.get('/', async (req: Request, res: Response) => {
  const parsed = listRoadsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid query parameters',
      details: parsed.error.issues,
    });
  }

  const { status, limit, offset } = parsed.data;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const countRes = await query<{ count: string }>(
      `SELECT count(*) as count FROM road_segments ${whereClause}`,
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
        length_km::float as length_km, 
        status, 
        risk_score, 
        ST_AsGeoJSON(geometry)::json as geometry,
        created_at 
      FROM road_segments 
      ${whereClause} 
      ORDER BY risk_score DESC 
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return res.status(200).json({
      items: dataRes.rows,
      total,
      limit,
      offset,
    });
  } catch (err: unknown) {
    console.error('[API Road Segments List Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve road segments from database' });
  }
});

// -----------------------------------------------------------------------------
// PATCH /api/road-segments/:id - Update road status (e.g. mark flooded / blocked)
// -----------------------------------------------------------------------------
roadSegmentRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['command_center', 'officer', 'admin', 'department', 'coordinator', 'team_lead']),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const parsed = patchRoadStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid road status payload',
        details: parsed.error.issues,
      });
    }

    const { status, reason } = parsed.data;

    try {
      const updateRes = await query(
        `UPDATE road_segments 
         SET status = $1 
         WHERE id = $2 
         RETURNING id, name, length_km::float as length_km, status, risk_score, ST_AsGeoJSON(geometry)::json as geometry, created_at`,
        [status, id]
      );

      if (updateRes.rows.length === 0) {
        return res.status(404).json({ error: `Road segment with ID '${id}' not found` });
      }

      const updated = updateRes.rows[0];

      // Audit action in audit_log
      try {
        await query(
          `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
          [
            req.user?.id || null,
            'ROAD_STATUS_UPDATED',
            JSON.stringify({
              road_id: id,
              new_status: status,
              reason: reason || 'Manual officer update',
              actor_role: req.user?.role,
            }),
          ]
        );
      } catch (auditErr) {
        console.warn('[Audit Log Warning]: Could not record road status update:', auditErr);
      }

      return res.status(200).json({
        success: true,
        updated_segment: updated,
        note: `Road '${updated.name}' updated to status: ${status}`,
      });
    } catch (err: unknown) {
      console.error(`[API Road Segment Patch Error ${id}]:`, err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to update road segment in database' });
    }
  }
);

