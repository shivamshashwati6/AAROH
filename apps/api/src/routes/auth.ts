import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  AuthService,
  AuthError,
  isDbConnectionError,
  DatabaseUnavailableError,
} from '../services/auth';
import { requireAuth } from '../middleware/auth';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(255),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters in length').max(128),
  role: z.string().optional(),
  department: z.string().nullable().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  portal: z.enum(['citizen', 'department', 'admin', 'command_center']).optional(),
  expectedRole: z.string().optional(),
});

/**
 * Maps authentication and database errors to standardized HTTP responses.
 */
function handleAuthRouteError(res: Response, err: unknown, fallbackMessage: string): Response {
  if (err instanceof AuthError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
    });
  }

  if (isDbConnectionError(err)) {
    console.error('[API Auth Database Unavailable]:', err instanceof Error ? err.message : err);
    return res.status(503).json({
      error: 'Database service is temporarily unavailable. Please try again in a few moments.',
      code: 'DATABASE_UNAVAILABLE',
    });
  }

  const e = err as any;
  if (e && e.code === '23505') {
    return res.status(409).json({
      error: 'An account with this email address already exists',
      code: 'EMAIL_ALREADY_EXISTS',
    });
  }

  console.error('[API Auth Unhandled Error]:', err instanceof Error ? err.message : err);
  return res.status(500).json({
    error: fallbackMessage,
  });
}

// -----------------------------------------------------------------------------
// POST /api/auth/register - Public Citizen Account Registration
// -----------------------------------------------------------------------------
authRouter.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstErrorMessage = parsed.error.issues[0]?.message || 'Invalid registration input';
    return res.status(400).json({
      error: firstErrorMessage,
      details: parsed.error.issues,
    });
  }

  const { name, email, password, role, department } = parsed.data;

  // Enforce role privilege security: public registration is strictly for CITIZEN accounts
  if ((role && role !== 'citizen') || (department && department !== null)) {
    return res.status(403).json({
      error: 'Public registration is restricted to citizen accounts only. Privileged roles require administrative provisioning.',
    });
  }

  try {
    const result = await AuthService.registerCitizen({ name, email, password });
    return res.status(201).json(result);
  } catch (err: unknown) {
    return handleAuthRouteError(res, err, 'Failed to create user account');
  }
});

// -----------------------------------------------------------------------------
// POST /api/auth/login - Credential Verification & Access Token Issuance
// -----------------------------------------------------------------------------
authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstErrorMessage = parsed.error.issues[0]?.message || 'Invalid login credentials format';
    return res.status(400).json({
      error: firstErrorMessage,
      details: parsed.error.issues,
    });
  }

  const { email, password, portal, expectedRole } = parsed.data;
  const targetPortal = portal || (expectedRole as 'citizen' | 'department' | 'admin' | 'command_center' | undefined);

  try {
    const result = await AuthService.authenticate(email, password, targetPortal);
    return res.status(200).json(result);
  } catch (err: unknown) {
    return handleAuthRouteError(res, err, 'Failed to authenticate user');
  }
});

// -----------------------------------------------------------------------------
// GET /api/auth/me - Authenticated User Profile
// -----------------------------------------------------------------------------
authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  return res.status(200).json({
    user: req.user,
  });
});
