import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { UserRole } from '@relief-os/shared';

export const recommendationRouter = Router();

// Internal operational roles allowed to view recommendations
const VIEW_RECOMMENDATION_ROLES: UserRole[] = [
  'command_center',
  'department',
  'officer',
  'coordinator',
  'team_lead',
  'admin',
];

// Roles with decision authority to approve or reject response plans (PRD Section 3 & 6.10)
const APPROVAL_ROLES: UserRole[] = ['command_center', 'officer', 'admin'];

const listRecommendationsQuerySchema = z.object({
  zone_id: z.string().optional(),
  status: z.enum(['draft', 'approved', 'modified', 'rejected']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const reviewBodySchema = z.object({
  notes: z.string().max(1000).optional(),
  reason: z.string().max(1000).optional(),
});

// -----------------------------------------------------------------------------
// GET /api/recommendations (or /api/plans) - List recommendations
// -----------------------------------------------------------------------------
recommendationRouter.get(
  '/',
  requireAuth,
  requireRole(VIEW_RECOMMENDATION_ROLES),
  async (req: Request, res: Response) => {
    const parsed = listRecommendationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: parsed.error.issues,
      });
    }

    const { zone_id, status, limit, offset } = parsed.data;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (zone_id) {
      params.push(zone_id);
      conditions.push(`r.zone_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const countRes = await query<{ count: string }>(
        `SELECT count(*) as count FROM recommendations r ${whereClause}`,
        params
      );
      const total = parseInt(countRes.rows[0]?.count || '0', 10);

      params.push(limit);
      const limitIdx = params.length;
      params.push(offset);
      const offsetIdx = params.length;

      const dataRes = await query(
        `SELECT 
          r.id, 
          r.zone_id, 
          r.plan, 
          r.explanation, 
          r.approved_by, 
          u.name as approver_name,
          r.approved_at, 
          r.status, 
          r.created_at
        FROM recommendations r
        LEFT JOIN users u ON u.id = r.approved_by
        ${whereClause}
        ORDER BY r.created_at DESC
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
      console.error('[API Recommendations List Error]:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to retrieve recommendations from database' });
    }
  }
);

// -----------------------------------------------------------------------------
// GET /api/recommendations/:id (or /api/plans/:id) - Single recommendation detail
// -----------------------------------------------------------------------------
recommendationRouter.get(
  '/:id',
  requireAuth,
  requireRole(VIEW_RECOMMENDATION_ROLES),
  async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      const recRes = await query(
        `SELECT 
          r.id, 
          r.zone_id, 
          r.plan, 
          r.explanation, 
          r.approved_by, 
          u.name as approver_name,
          r.approved_at, 
          r.status, 
          r.created_at
        FROM recommendations r
        LEFT JOIN users u ON u.id = r.approved_by
        WHERE r.id = $1`,
        [id]
      );

      if (recRes.rows.length === 0) {
        return res.status(404).json({ error: `Recommendation with ID '${id}' not found` });
      }

      return res.status(200).json(recRes.rows[0]);
    } catch (err: unknown) {
      console.error(`[API Recommendation Get Error ${id}]:`, err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to retrieve recommendation from database' });
    }
  }
);

// -----------------------------------------------------------------------------
// POST /api/recommendations/:id/approve - Approve Response Plan (Human in the loop)
// -----------------------------------------------------------------------------
recommendationRouter.post(
  '/:id/approve',
  requireAuth,
  requireRole(APPROVAL_ROLES),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const parsed = reviewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid review payload',
        details: parsed.error.issues,
      });
    }

    const { notes } = parsed.data;

    try {
      // 1. Verify recommendation exists
      const existingRes = await query<{ id: string; status: string; zone_id: string }>(
        `SELECT id, status, zone_id FROM recommendations WHERE id = $1`,
        [id]
      );

      if (existingRes.rows.length === 0) {
        return res.status(404).json({ error: `Recommendation with ID '${id}' not found` });
      }

      // 2. Update recommendation status to 'approved' and record approver
      const updateRes = await query(
        `UPDATE recommendations
         SET status = 'approved',
             approved_by = $1,
             approved_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, zone_id, plan, explanation, approved_by, approved_at, status, created_at`,
        [req.user!.id, id]
      );

      const updated = updateRes.rows[0];

      // 3. Record audit log event with actor details
      try {
        await query(
          `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
          [
            req.user!.id,
            'RECOMMENDATION_APPROVED',
            JSON.stringify({
              recommendation_id: id,
              zone_id: updated.zone_id,
              actor_id: req.user!.id,
              actor_name: req.user!.name,
              actor_role: req.user!.role,
              notes: notes || null,
            }),
          ]
        );
      } catch (auditErr) {
        console.warn('[Audit Log Warning]: Could not record recommendation approval:', auditErr);
      }

      // Strict PRD safety: Never automatically dispatch or decrement inventory on approval
      return res.status(200).json({
        success: true,
        message: `Response plan '${id}' successfully approved by ${req.user!.name}.`,
        recommendation: updated,
      });
    } catch (err: unknown) {
      console.error(`[API Recommendation Approve Error ${id}]:`, err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to approve recommendation in database' });
    }
  }
);

// -----------------------------------------------------------------------------
// POST /api/recommendations/:id/reject - Reject Response Plan
// -----------------------------------------------------------------------------
recommendationRouter.post(
  '/:id/reject',
  requireAuth,
  requireRole(APPROVAL_ROLES),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const parsed = reviewBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid review payload',
        details: parsed.error.issues,
      });
    }

    const reason = parsed.data.reason || parsed.data.notes;

    try {
      // 1. Verify recommendation exists
      const existingRes = await query<{ id: string; status: string; zone_id: string }>(
        `SELECT id, status, zone_id FROM recommendations WHERE id = $1`,
        [id]
      );

      if (existingRes.rows.length === 0) {
        return res.status(404).json({ error: `Recommendation with ID '${id}' not found` });
      }

      // 2. Update recommendation status to 'rejected'
      const updateRes = await query(
        `UPDATE recommendations
         SET status = 'rejected',
             approved_by = $1,
             approved_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, zone_id, plan, explanation, approved_by, approved_at, status, created_at`,
        [req.user!.id, id]
      );

      const updated = updateRes.rows[0];

      // 3. Record audit log event with actor details
      try {
        await query(
          `INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)`,
          [
            req.user!.id,
            'RECOMMENDATION_REJECTED',
            JSON.stringify({
              recommendation_id: id,
              zone_id: updated.zone_id,
              actor_id: req.user!.id,
              actor_name: req.user!.name,
              actor_role: req.user!.role,
              reason: reason || 'Officer rejected plan',
            }),
          ]
        );
      } catch (auditErr) {
        console.warn('[Audit Log Warning]: Could not record recommendation rejection:', auditErr);
      }

      return res.status(200).json({
        success: true,
        message: `Response plan '${id}' rejected by ${req.user!.name}.`,
        recommendation: updated,
      });
    } catch (err: unknown) {
      console.error(`[API Recommendation Reject Error ${id}]:`, err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to reject recommendation in database' });
    }
  }
);
