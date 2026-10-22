import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserRole, DepartmentType } from '@relief-os/shared';

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  department: DepartmentType | null;
  iat?: number;
  exp?: number;
}

const SALT_ROUNDS = 10;

/**
 * Returns the JWT secret from environment configuration.
 * Fails safely if missing; never uses a hardcoded production fallback.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new AuthError(
      'JWT_SECRET_MISSING',
      'JWT_SECRET environment variable is not configured. Server cannot sign or verify tokens.'
    );
  }
  return secret.trim();
}

/**
 * Hashes a plaintext password using bcrypt with standard salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new AuthError('PASSWORD_TOO_SHORT', 'Password must be at least 8 characters in length');
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  return bcrypt.compare(password, hash);
}

/**
 * Issues a signed, expiring JWT access token for an authenticated user.
 */
export function generateAccessToken(
  user: User,
  customExpiresIn?: string | number
): { token: string; expires_at: string } {
  const secret = getJwtSecret();
  const expiresIn = customExpiresIn || process.env.JWT_EXPIRES_IN || '24h';

  const payload: TokenPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    department: user.department || null,
  };

  const token = jwt.sign(payload, secret, { expiresIn: expiresIn as jwt.SignOptions['expiresIn'] });
  const decoded = jwt.decode(token) as jwt.JwtPayload | null;

  const expires_at = decoded?.exp
    ? new Date(decoded.exp * 1000).toISOString()
    : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  return { token, expires_at };
}

/**
 * Verifies a JWT access token signature and expiry.
 * Throws AuthError with appropriate error codes on failure.
 */
export function verifyAccessToken(token: string): TokenPayload {
  const secret = getJwtSecret();

  try {
    const verified = jwt.verify(token, secret) as jwt.JwtPayload;
    return {
      sub: verified.sub as string,
      email: verified.email as string,
      role: verified.role as UserRole,
      department: (verified.department as DepartmentType) || null,
      iat: verified.iat,
      exp: verified.exp,
    };
  } catch (err: unknown) {
    const errorName = (err as { name?: string })?.name;
    if (err instanceof jwt.TokenExpiredError || errorName === 'TokenExpiredError') {
      throw new AuthError('TOKEN_EXPIRED', 'Access token has expired');
    }
    if (
      err instanceof jwt.JsonWebTokenError ||
      errorName === 'JsonWebTokenError' ||
      errorName === 'NotBeforeError' ||
      err instanceof SyntaxError ||
      errorName === 'SyntaxError'
    ) {
      throw new AuthError('TOKEN_INVALID', 'Access token signature or format is invalid');
    }
    throw new AuthError('AUTH_FAILED', 'Failed to authenticate token');
  }
}
