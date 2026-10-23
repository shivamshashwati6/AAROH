import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { UserRole } from '@relief-os/shared';
import {
  getPlanById,
  modifyResponsePlan,
  dispatchResponsePlan,
  markPlanDelivered,
  markPlanFailed,
  reallocateFailedPlan,
  promoteSimulationToDraft,
  PlanLifecycleError,
} from '../services/plans';

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

// Roles with executive decision authority (PRD Section 3 & 6.10)
const DECISION_ROLES: UserRole[] = ['command_center', 'officer', 'admin'];

// Field operational roles allowed to confirm physical delivery or report transport failure
const FIELD_UPDATE_ROLES: UserRole[] = [
  'command_center',
  'officer',
  'admin',
  'department',
  'coordinator',
  'team_lead',
];

const listRecommendationsQuerySchema = z.object({
  zone_id: z.string().optional(),
  status: z
    .enum(['draft', 'approved', 'modified', 'rejected', 'in_transit', 'delivered', 'failed'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const reviewBodySchema = z.object({
  notes: z.string().max(1000).optional(),
  reason: z.string().max(1000).optional(),
});

const modifyPlanBodySchema = z.object({
  resources_recommended: z
    .object({
      boats: z.number().int().optional(),
      food_kits: z.number().int().optional(),
      water_units: z.number().int().optional(),
      medical_teams: z.number().int().optional(),
    })
    .optional(),
  resources: z
    .object({
      boats: z.number().int().optional(),
      food_kits: z.number().int().optional(),
      water_units: z.number().int().optional(),
      medical_teams: z.number().int().optional(),
    })
    .optional(),
  source_center_id: z.string().optional(),
  supplying_center_id: z.string().optional(),
  source_center: z.string().optional(),
  selected_route: z.string().optional(),
  reason: z.string().optional(),
});

const dispatchPlanBodySchema = z.object({
  execution_notes: z.string().max(1000).optional(),
});

const failPlanBodySchema = z.object({
  failure_reason: z.string().max(1000).optional(),
  reason: z.string().max(1000).optional(),
  disposition: z.enum(['stock_lost', 'stock_returned']).default('stock_returned'),
  notes: z.string().max(1000).optional(),
});

const reallocatePlanBodySchema = z.object({
  planning_days: z.number().int().min(1).max(30).optional(),
  reason: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
});

const promoteSimulationBodySchema = z.object({
  simulation_id: z.string().min(1, 'Simulation ID is required'),
  zone_id: z.string().optional(),
  notes: z.string().max(1000).optional(),
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
          r.dispatched_by,
          ud.name as dispatcher_name,
          r.dispatched_at,
          r.completed_at,
          r.failure_reason,
          r.execution_notes,
          r.source_simulation_id,
          r.status, 
          r.created_at
        FROM recommendations r
        LEFT JOIN users u ON u.id = r.approved_by
        LEFT JOIN users ud ON ud.id = r.dispatched_by
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
// POST /api/recommendations/promote (or /api/plans/promote) - Promote Simulation to Draft Plan
// -----------------------------------------------------------------------------
recommendationRouter.post(
  '/promote',
  requireAuth,
  requireRole(DECISION_ROLES),
  async (req: Request, res: Response) => {
    const parsed = promoteSimulationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid simulation promotion payload',
        details: parsed.error.issues,
      });
    }

    try {
      const draftPlan = await promoteSimulationToDraft(parsed.data, {
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      });

      return res.status(201).json({
        success: true,
        message: `What-If simulation #${parsed.data.simulation_id} promoted to DRAFT response plan #${draftPlan.id}. Zero inventory deducted.`,
        recommendation: draftPlan,
        plan: draftPlan,
      });
    } catch (err: unknown) {
      if (err instanceof PlanLifecycleError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      console.error('[API Simulation Promote Error]:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to promote simulation to draft plan' });
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
      const plan = await getPlanById(id);
      return res.status(200).json(plan);
    } catch (err: unknown) {
      if (err instanceof PlanLifecycleError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
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
  requireRole(DECISION_ROLES),
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

      const currentStatus = existingRes.rows[0].status;

      // Idempotency check: if already approved, return success
      if (currentStatus === 'approved') {
        const current = await getPlanById(id);
        return res.status(200).json({
          success: true,
          message: `Response plan '${id}' is already approved.`,
          recommendation: current,
        });
      }

      // Reject invalid state transitions (cannot approve already dispatched, completed, or failed plans)
      if (currentStatus !== 'draft' && currentStatus !== 'modified') {
        return res.status(400).json({
          error: `Invalid transition from '${currentStatus}' to 'approved'. Plan must be in draft or modified status before approval.`,
        });
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
  requireRole(DECISION_ROLES),
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
      const existingRes = await query<{ id: string; status: string; zone_id: string }>(
        `SELECT id, status, zone_id FROM recommendations WHERE id = $1`,
        [id]
      );

      if (existingRes.rows.length === 0) {
        return res.status(404).json({ error: `Recommendation with ID '${id}' not found` });
      }

      const currentStatus = existingRes.rows[0].status;

      // Idempotency check: if already rejected, return success
      if (currentStatus === 'rejected') {
        const current = await getPlanById(id);
        return res.status(200).json({
          success: true,
          message: `Response plan '${id}' is already rejected.`,
          recommendation: current,
        });
      }

      // Cannot reject plans that are already in transit, delivered, or failed
      if (currentStatus === 'in_transit' || currentStatus === 'delivered' || currentStatus === 'failed') {
        return res.status(400).json({
          error: `Cannot reject plan with status '${currentStatus}'. Plan is already dispatched or finalized.`,
        });
      }

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

// -----------------------------------------------------------------------------
// PATCH & PUT /api/recommendations/:id (or /api/plans/:id) - Modify Plan Before Approval
// -----------------------------------------------------------------------------
async function handleModifyPlan(req: Request, res: Response) {
  const { id } = req.params;
  const parsed = modifyPlanBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid plan modification payload',
      details: parsed.error.issues,
    });
  }

  try {
    const updated = await modifyResponsePlan(id, parsed.data, {
      id: req.user!.id,
      name: req.user!.name,
      role: req.user!.role,
    });

    return res.status(200).json({
      success: true,
      message: `Response plan #${id} modified successfully. Audit trail recorded.`,
      recommendation: updated,
    });
  } catch (err: unknown) {
    if (err instanceof PlanLifecycleError) {
      return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    }
    console.error(`[API Plan Modify Error ${id}]:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to modify response plan' });
  }
}

recommendationRouter.patch('/:id', requireAuth, requireRole(DECISION_ROLES), handleModifyPlan);
recommendationRouter.put('/:id', requireAuth, requireRole(DECISION_ROLES), handleModifyPlan);

// -----------------------------------------------------------------------------
// POST /api/recommendations/:id/dispatch (or /execute) - Execute Approved Plan
// -----------------------------------------------------------------------------
async function handleDispatchPlan(req: Request, res: Response) {
  const { id } = req.params;
  const parsed = dispatchPlanBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid dispatch payload',
      details: parsed.error.issues,
    });
  }

  try {
    const result = await dispatchResponsePlan(id, parsed.data, {
      id: req.user!.id,
      name: req.user!.name,
      role: req.user!.role,
    });

    return res.status(200).json(result);
  } catch (err: unknown) {
    if (err instanceof PlanLifecycleError) {
      return res.status(err.status).json({ error: err.message, code: err.code, details: err.details });
    }
    console.error(`[API Plan Dispatch Error ${id}]:`, err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to dispatch response plan' });
  }
}

recommendationRouter.post('/:id/dispatch', requireAuth, requireRole(DECISION_ROLES), handleDispatchPlan);
recommendationRouter.post('/:id/execute', requireAuth, requireRole(DECISION_ROLES), handleDispatchPlan);

// -----------------------------------------------------------------------------
// POST /api/recommendations/:id/deliver - Mark Plan as Delivered
// -----------------------------------------------------------------------------
recommendationRouter.post(
  '/:id/deliver',
  requireAuth,
  requireRole(FIELD_UPDATE_ROLES),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const notes = typeof req.body.notes === 'string' ? req.body.notes : undefined;

    try {
      const updated = await markPlanDelivered(id, { notes }, {
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      });

      return res.status(200).json({
        success: true,
        message: `Response plan #${id} marked as delivered. Mission verified.`,
        recommendation: updated,
      });
    } catch (err: unknown) {
      if (err instanceof PlanLifecycleError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      console.error(`[API Plan Deliver Error ${id}]:`, err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to mark plan as delivered' });
    }
  }
);

// -----------------------------------------------------------------------------
// POST /api/recommendations/:id/fail - Mark Plan Delivery as Failed
// -----------------------------------------------------------------------------
recommendationRouter.post(
  '/:id/fail',
  requireAuth,
  requireRole(FIELD_UPDATE_ROLES),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const parsed = failPlanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid failure declaration payload',
        details: parsed.error.issues,
      });
    }

    try {
      const updated = await markPlanFailed(id, parsed.data, {
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      });

      return res.status(200).json({
        success: true,
        message: `Plan #${id} marked as failed. Inventory disposition: '${parsed.data.disposition}'. Logged in audit registry.`,
        recommendation: updated,
      });
    } catch (err: unknown) {
      if (err instanceof PlanLifecycleError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      console.error(`[API Plan Fail Error ${id}]:`, err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to record plan failure' });
    }
  }
);

// -----------------------------------------------------------------------------
// POST /api/recommendations/:id/reallocate - Generate Reallocation Draft Plan
// -----------------------------------------------------------------------------
recommendationRouter.post(
  '/:id/reallocate',
  requireAuth,
  requireRole(DECISION_ROLES),
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const parsed = reallocatePlanBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid reallocation payload',
        details: parsed.error.issues,
      });
    }

    try {
      const newDraft = await reallocateFailedPlan(id, parsed.data, {
        id: req.user!.id,
        name: req.user!.name,
        role: req.user!.role,
      });

      return res.status(201).json({
        success: true,
        message: `New response plan #${newDraft.id} drafted following failure of plan #${id}. Non-mutating draft ready for review.`,
        recommendation: newDraft,
        plan: newDraft,
      });
    } catch (err: unknown) {
      if (err instanceof PlanLifecycleError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      console.error(`[API Plan Reallocate Error ${id}]:`, err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to generate reallocation plan' });
    }
  }
);
