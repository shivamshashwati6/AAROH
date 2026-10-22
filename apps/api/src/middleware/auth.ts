import { Request, Response, NextFunction } from 'express';
import { User, UserRole, DepartmentType } from '@relief-os/shared';
import { verifyAccessToken, AuthError } from '../services/auth';
import { query } from '../db';

// Extend Express Request with authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Helper to extract and verify a user from the Authorization header.
 * Returns the verified User or null if no header / invalid token.
 */
async function extractUserFromHeader(authHeader?: string): Promise<{ user: User | null; error?: string; status?: number }> {
  if (!authHeader) {
    return { user: null };
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1].trim()) {
    return { user: null, error: 'Malformed Authorization header. Format must be: Bearer <token>', status: 401 };
  }

  const token = parts[1].trim();

  try {
    const payload = verifyAccessToken(token);

    // Verify user exists in database
    const userRes = await query<{
      id: string;
      name: string;
      email: string;
      role: string;
      department: string | null;
      created_at: string;
    }>(
      `SELECT id, name, email, role, department, created_at
       FROM users
       WHERE id = $1`,
      [payload.sub]
    );

    if (userRes.rows.length === 0) {
      return { user: null, error: 'Authenticated user account no longer exists in the system.', status: 401 };
    }

    const row = userRes.rows[0];
    const user: User = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role as UserRole,
      department: row.department as DepartmentType | null,
      created_at: row.created_at,
    };

    return { user };
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      if (err.code === 'TOKEN_EXPIRED') {
        return { user: null, error: 'Access token has expired. Please log in again.', status: 401 };
      }
      return { user: null, error: err.message, status: 401 };
    }
    if (err && typeof err === 'object' && 'name' in err && ((err as any).name === 'JsonWebTokenError' || (err as any).name === 'TokenExpiredError' || (err as any).name === 'NotBeforeError')) {
      return { user: null, error: 'Invalid or unauthorized access token.', status: 401 };
    }
    console.error('[Auth Middleware] Database error verifying user:', err);
    return { user: null, error: 'Database service unavailable during authentication.', status: 503 };
  }
}

/**
 * Reusable Express middleware for authenticating requests using JWT access tokens.
 * Extracts Bearer token from the Authorization header and attaches the verified user to req.user.
 * Returns 401 if missing, invalid, or expired.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'Authentication required. Authorization header missing.',
    });
  }

  const { user, error, status } = await extractUserFromHeader(authHeader);
  if (!user) {
    return res.status(status || 401).json({
      error: error || 'Authentication required. Invalid access token.',
    });
  }

  req.user = user;
  return next();
}

/**
 * Optional authentication middleware.
 * If a valid Bearer token is provided, attaches req.user.
 * If no token is provided, proceeds anonymously without error.
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return next();
  }

  const { user } = await extractUserFromHeader(authHeader);
  if (user) {
    req.user = user;
  }
  return next();
}

/**
 * Role-based authorization middleware.
 * Verifies that the authenticated user possesses one of the allowed roles.
 * If user is role 'department' and allowedDepartments is specified, also checks department match.
 * Returns 401 if unauthenticated, 403 if unauthorized.
 */
export function requireRole(allowedRoles: UserRole[], allowedDepartments?: DepartmentType[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required. Please provide a valid access token.',
      });
    }

    const hasRole = allowedRoles.includes(req.user.role);
    if (!hasRole) {
      return res.status(403).json({
        error: `Forbidden: User role '${req.user.role}' is not authorized to perform this action.`,
      });
    }

    if (req.user.role === 'department' && allowedDepartments && allowedDepartments.length > 0) {
      if (!req.user.department || !allowedDepartments.includes(req.user.department)) {
        return res.status(403).json({
          error: `Forbidden: Department '${req.user.department || 'unassigned'}' is not authorized for this resource.`,
        });
      }
    }

    return next();
  };
}

