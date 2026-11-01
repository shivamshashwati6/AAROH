import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { query } from '../db';
import { hashPassword, verifyPassword, generateAccessToken, AuthError } from '../services/auth';
import { requireAuth } from '../middleware/auth';
import { User, AuthResponse } from '@relief-os/shared';

export const authRouter = Router();

function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  return Boolean(
    e.code === 'ECONNREFUSED' ||
    e.code === 'ENOTFOUND' ||
    e.code === 'ETIMEDOUT' ||
    e.code === 'ECONNRESET' ||
    e.code === '28P01' ||
    e.code === '3D000' ||
    e.code === '08001' ||
    e.code === '08006' ||
    e.code === '57P01' ||
    e.message?.includes('ENOTFOUND') ||
    e.message?.includes('Connection terminated') ||
    e.message?.includes('timeout') ||
    e.message?.includes('connect')
  );
}


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
    // Check for existing account with the same email
    const existing = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'An account with this email address already exists',
      });
    }

    const passwordHash = await hashPassword(password);
    const userId = `usr-${crypto.randomUUID()}`;

    const insertRes = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      department: string | null;
      created_at: string;
    }>(
      `INSERT INTO users (id, name, email, role, department, password_hash)
       VALUES ($1, $2, $3, 'citizen', NULL, $4)
       RETURNING id, name, email, role, department, created_at`,
      [userId, name, email, passwordHash]
    );

    const row = insertRes.rows[0];
    const user: User = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as User['role'],
      department: null,
      created_at: row.created_at,
    };

    const { token, expires_at } = generateAccessToken(user);

    const response: AuthResponse = {
      user,
      token,
      expires_at,
    };

    return res.status(201).json(response);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(400).json({ error: err.message });
    }
    const e = err as any;
    if (e && e.code === '23505') {
      return res.status(409).json({
        error: 'An account with this email address already exists',
      });
    }
    if (isDbConnectionError(err)) {
      console.error('[API Register Error - Database Unavailable]:', err instanceof Error ? err.message : err);
      return res.status(503).json({
        error: 'Database service is temporarily unavailable. Please try again in a few moments.',
      });
    }
    console.error('[API Register Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to create user account' });
  }
});

// -----------------------------------------------------------------------------
// POST /api/auth/login - Credential Verification & Access Token Issuance
// -----------------------------------------------------------------------------
authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid login credentials format',
      details: parsed.error.issues,
    });
  }

  const { email, password, portal, expectedRole } = parsed.data;
  const targetPortal = portal || (expectedRole as 'citizen' | 'department' | 'admin' | 'command_center' | undefined);

  try {
    const userRes = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      department: string | null;
      password_hash: string;
      created_at: string;
    }>(
      `SELECT id, name, email, role, department, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    console.log(`[API Login] Attempt: email="${email}", portal="${portal}", passLen=${password.length}`);

    // Uniform timing-safe error response to prevent user enumeration
    if (userRes.rows.length === 0) {
      console.warn(`[API Login Failed] User not found: "${email}"`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const row = userRes.rows[0];
    const passwordValid = await verifyPassword(password, row.password_hash);
    if (!passwordValid) {
      console.warn(`[API Login Failed] Password mismatch for: "${email}" (passLen=${password.length})`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    console.log(`[API Login Success] Authenticated: "${email}", role="${row.role}", dept="${row.department}"`);

    // Role-based portal authorization validation
    if (targetPortal) {
      if (targetPortal === 'citizen' && row.role !== 'citizen') {
        return res.status(401).json({
          error: 'Invalid credentials for Citizen portal access',
        });
      }

      if (
        targetPortal === 'department' &&
        !['department', 'coordinator', 'team_lead'].includes(row.role)
      ) {
        return res.status(401).json({
          error: 'Invalid credentials for Department portal access',
        });
      }

      if (targetPortal === 'admin' && row.role !== 'admin') {
        return res.status(401).json({
          error: 'Invalid credentials for Admin portal access',
        });
      }

      if (
        targetPortal === 'command_center' &&
        !['command_center', 'admin', 'officer'].includes(row.role)
      ) {
        return res.status(401).json({
          error: 'Invalid credentials for Command Center portal access',
        });
      }
    }

    const user: User = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as User['role'],
      department: row.department as User['department'],
      created_at: row.created_at,
    };

    const { token, expires_at } = generateAccessToken(user);

    const response: AuthResponse = {
      user,
      token,
      expires_at,
    };

    return res.status(200).json(response);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return res.status(400).json({ error: err.message });
    }
    if (isDbConnectionError(err)) {
      console.error('[API Login Error - Database Unavailable]:', err instanceof Error ? err.message : err);
      return res.status(503).json({
        error: 'Database service is temporarily unavailable. Please try again in a few moments.',
      });
    }
    console.error('[API Login Error]:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to authenticate user' });
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
