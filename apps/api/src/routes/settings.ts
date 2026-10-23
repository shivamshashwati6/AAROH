import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  getActivePriorityWeights,
  updatePriorityWeights,
  resetPriorityWeights,
  CANONICAL_PRIORITY_WEIGHTS,
  validateAndNormalizeWeights,
  weightsToPercentages,
} from '../services/priority';
import { DEFAULT_DEMAND_CONFIG } from '../services/demand';

export const settingsRouter = Router();

// Zod schema for updating priority scoring weights
const updateWeightsSchema = z
  .object({
    w_population: z.number().finite().nonnegative('Population weight must be non-negative'),
    w_severity: z.number().finite().nonnegative('Severity weight must be non-negative'),
    w_medical: z.number().finite().nonnegative('Medical risk weight must be non-negative'),
    w_shortage: z.number().finite().nonnegative('Shortage weight must be non-negative'),
    w_accessibility: z.number().finite().nonnegative('Accessibility weight must be non-negative'),
    w_vulnerability: z.number().finite().nonnegative('Vulnerability weight must be non-negative'),
  })
  .refine(
    (data) => {
      try {
        validateAndNormalizeWeights(data);
        return true;
      } catch {
        return false;
      }
    },
    {
      message: 'Total scoring weights must equal exactly 100% (or 1.00).',
      path: ['total'],
    }
  );

// -----------------------------------------------------------------------------
// GET /api/settings/weights - Retrieve currently active priority scoring weights
// -----------------------------------------------------------------------------
settingsRouter.get('/weights', async (_req: Request, res: Response) => {
  try {
    const active = await getActivePriorityWeights();
    return res.status(200).json(active);
  } catch (err: unknown) {
    console.error('[API Settings Weights GET Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve active scoring weights' });
  }
});

// -----------------------------------------------------------------------------
// PUT /api/settings/weights - Update priority scoring weights (Admin-only)
// -----------------------------------------------------------------------------
settingsRouter.put(
  '/weights',
  requireAuth,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    const parsed = updateWeightsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid scoring weights configuration',
        details: parsed.error.issues,
      });
    }

    try {
      const updated = await updatePriorityWeights(parsed.data, req.user?.id);
      return res.status(200).json({
        message: 'Priority scoring weights updated successfully.',
        ...updated,
      });
    } catch (err: unknown) {
      console.error('[API Settings Weights PUT Error]:', err instanceof Error ? err.message : err);
      const msg = err instanceof Error ? err.message : 'Failed to update scoring weights';
      return res.status(400).json({ error: msg });
    }
  }
);

// -----------------------------------------------------------------------------
// POST /api/settings/weights/reset - Reset scoring weights to canonical defaults (Admin-only)
// -----------------------------------------------------------------------------
settingsRouter.post(
  '/weights/reset',
  requireAuth,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const reset = await resetPriorityWeights(req.user?.id);
      return res.status(200).json({
        message: 'Priority scoring weights reset to canonical PRD defaults.',
        ...reset,
      });
    } catch (err: unknown) {
      console.error('[API Settings Weights Reset Error]:', err instanceof Error ? err.message : err);
      return res.status(500).json({ error: 'Failed to reset scoring weights' });
    }
  }
);

// -----------------------------------------------------------------------------
// GET /api/settings - Retrieve all system settings (Weights & Demand Parameters)
// -----------------------------------------------------------------------------
settingsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const activeWeights = await getActivePriorityWeights();

    return res.status(200).json({
      priority_weights: activeWeights,
      demand_parameters: DEFAULT_DEMAND_CONFIG,
      canonical_defaults: {
        priority_weights: {
          weights: CANONICAL_PRIORITY_WEIGHTS,
          percentages: weightsToPercentages(CANONICAL_PRIORITY_WEIGHTS),
        },
        demand_parameters: DEFAULT_DEMAND_CONFIG,
      },
    });
  } catch (err: unknown) {
    console.error('[API Settings GET Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to retrieve system settings' });
  }
});
