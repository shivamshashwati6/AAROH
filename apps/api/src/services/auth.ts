import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User, UserRole, DepartmentType, AuthResponse } from '@relief-os/shared';
import { query } from '../db';

// -----------------------------------------------------------------------------
// Authentication Domain Errors
// -----------------------------------------------------------------------------
export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message = 'Invalid email or password') {
    super('INVALID_CREDENTIALS', message, 401);
  }
}

export class PortalAccessError extends AuthError {
  constructor(message: string) {
    super('PORTAL_ACCESS_DENIED', message, 401);
  }
}

export class UserNotFoundError extends AuthError {
  constructor(message = 'Authenticated user account no longer exists in the system.') {
    super('USER_NOT_FOUND', message, 401);
  }
}

export class TokenExpiredError extends AuthError {
  constructor(message = 'Access token has expired') {
    super('TOKEN_EXPIRED', message, 401);
  }
}

export class TokenInvalidError extends AuthError {
  constructor(message = 'Access token signature or format is invalid') {
    super('TOKEN_INVALID', message, 401);
  }
}

export class EmailAlreadyExistsError extends AuthError {
  constructor(message = 'An account with this email address already exists') {
    super('EMAIL_ALREADY_EXISTS', message, 409);
  }
}

export class DatabaseUnavailableError extends AuthError {
  constructor(message = 'Database service is temporarily unavailable. Please try again in a few moments.') {
    super('DATABASE_UNAVAILABLE', message, 503);
  }
}

/**
 * Checks whether an unknown caught error corresponds to a database connectivity or pooler failure.
 */
export function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;

  // Known PostgreSQL and network connection error codes
  const connCodes = [
    'XX000', // Supabase pooler tenant unmapped / internal error
    '53300', // Too many connections
    '53400', // Configuration limit exceeded
    '57P01', // Admin shutdown / terminating connection
    '08001', // Unable to establish SQL connection
    '08003', // Connection does not exist
    '08004', // Connection rejected
    '08006', // Connection failure
    '08007', // Transaction resolution unknown
    '28P01', // Invalid password / pooler auth failed
    '3D000', // Database does not exist
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'EPIPE',
  ];

  if (connCodes.includes(e.code)) {
    return true;
  }

  const msg = String(e.message || '').toLowerCase();
  return (
    msg.includes('tenant/user') ||
    msg.includes('not found') ||
    msg.includes('connection terminated') ||
    msg.includes('closed network connection') ||
    msg.includes('connection timeout') ||
    msg.includes('connect etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('remaining connection slots') ||
    msg.includes('no pg_hba.conf entry') ||
    msg.includes('ssl') ||
    msg.includes('handshake')
  );
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

// Explicitly documented development & local testing fallback secret (DO NOT USE IN PRODUCTION)
const DEV_ONLY_TESTING_SECRET = 'relief_os_jwt_secret_dev_2026_9b8c2d1e4f3a7650821b0dc3729e41';

// Dummy hash used for timing-safe password comparison when user is not found
const TIMING_SAFE_DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/**
 * Validates JWT configuration at server startup.
 * Throws a fatal security error if production lacks an explicit, strong JWT_SECRET.
 */
export function validateJwtConfigAtStartup(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET?.trim();

  if (isProduction) {
    if (!secret || secret.length === 0) {
      throw new Error(
        '[FATAL SECURITY CONFIGURATION ERROR] JWT_SECRET must be explicitly set in production. Startup aborted.'
      );
    }
    if (secret === 'dev-secret' || secret === DEV_ONLY_TESTING_SECRET || secret.length < 32) {
      throw new Error(
        '[FATAL SECURITY CONFIGURATION ERROR] Insecure or default JWT_SECRET detected in production. Minimum 32 characters required. Startup aborted.'
      );
    }
  }
}

/**
 * Returns the active JWT secret.
 * Enforces production safety; allows safe explicitly documented testing secret in dev/test.
 */
export function getJwtSecret(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret || secret.length === 0) {
    if (isProduction) {
      throw new AuthError(
        'JWT_SECRET_MISSING',
        'JWT_SECRET environment variable is not configured.',
        500
      );
    }
    // Safe testing fallback strictly for dev/test environments
    return DEV_ONLY_TESTING_SECRET;
  }

  if (isProduction) {
    if (secret === 'dev-secret' || secret === DEV_ONLY_TESTING_SECRET || secret.length < 32) {
      throw new AuthError(
        'JWT_SECRET_INSECURE',
        'Insecure JWT_SECRET configured in production. Must be at least 32 characters.',
        500
      );
    }
  }

  return secret;
}

/**
 * Hashes a plaintext password using bcrypt with standard salt rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new AuthError('PASSWORD_TOO_SHORT', 'Password must be at least 8 characters in length', 400);
  }
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 * Safely handles invalid hash strings without throwing unhandled exceptions.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
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
      throw new TokenExpiredError();
    }
    if (
      err instanceof jwt.JsonWebTokenError ||
      errorName === 'JsonWebTokenError' ||
      errorName === 'NotBeforeError' ||
      err instanceof SyntaxError ||
      errorName === 'SyntaxError'
    ) {
      throw new TokenInvalidError();
    }
    throw new AuthError('AUTH_FAILED', 'Failed to authenticate token', 401);
  }
}

// -----------------------------------------------------------------------------
// Centralized Authentication Service
// -----------------------------------------------------------------------------
export const AuthService = {
  /**
   * Authenticates user credentials, validates portal role permissions,
   * and generates a valid JWT access token.
   */
  async authenticate(
    email: string,
    password: string,
    portal?: 'citizen' | 'department' | 'admin' | 'command_center'
  ): Promise<AuthResponse> {
    const normalizedEmail = email.trim().toLowerCase();

    let userRow: {
      id: string;
      name: string;
      email: string;
      role: string;
      department: string | null;
      password_hash: string;
      created_at: string;
    } | null = null;

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
        [normalizedEmail]
      );

      if (userRes.rows.length > 0) {
        userRow = userRes.rows[0];
      }
    } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        console.error('[AuthService.authenticate] Database unavailable:', err instanceof Error ? err.message : err);
        throw new DatabaseUnavailableError();
      }
      throw err;
    }

    // Timing-safe password verification
    if (!userRow) {
      await verifyPassword(password, TIMING_SAFE_DUMMY_HASH);
      throw new InvalidCredentialsError();
    }

    const passwordValid = await verifyPassword(password, userRow.password_hash);
    if (!passwordValid) {
      throw new InvalidCredentialsError();
    }

    // Role-based portal validation
    if (portal) {
      if (portal === 'citizen' && userRow.role !== 'citizen') {
        throw new PortalAccessError('Invalid credentials for Citizen portal access');
      }

      if (
        portal === 'department' &&
        !['department', 'coordinator', 'team_lead'].includes(userRow.role)
      ) {
        throw new PortalAccessError('Invalid credentials for Department portal access');
      }

      if (portal === 'admin' && userRow.role !== 'admin') {
        throw new PortalAccessError('Invalid credentials for Admin portal access');
      }

      if (
        portal === 'command_center' &&
        !['command_center', 'admin', 'officer'].includes(userRow.role)
      ) {
        throw new PortalAccessError('Invalid credentials for Command Center portal access');
      }
    }

    const user: User = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      role: userRow.role as UserRole,
      department: (userRow.department as DepartmentType) || null,
      created_at: userRow.created_at,
    };

    const { token, expires_at } = generateAccessToken(user);

    return {
      user,
      token,
      expires_at,
    };
  },

  /**
   * Registers a new Citizen account strictly.
   */
  async registerCitizen(data: {
    name: string;
    email: string;
    password: string;
  }): Promise<AuthResponse> {
    const trimmedName = data.name.trim();
    const normalizedEmail = data.email.trim().toLowerCase();

    if (trimmedName.length < 2) {
      throw new AuthError('NAME_TOO_SHORT', 'Name must be at least 2 characters', 400);
    }

    if (data.password.length < 8) {
      throw new AuthError('PASSWORD_TOO_SHORT', 'Password must be at least 8 characters in length', 400);
    }

    try {
      // Check for existing account
      const existing = await query<{ id: string }>('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
      if (existing.rows.length > 0) {
        throw new EmailAlreadyExistsError();
      }

      const passwordHash = await hashPassword(data.password);
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
        [userId, trimmedName, normalizedEmail, passwordHash]
      );

      const row = insertRes.rows[0];
      const user: User = {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role as UserRole,
        department: null,
        created_at: row.created_at,
      };

      const { token, expires_at } = generateAccessToken(user);

      return {
        user,
        token,
        expires_at,
      };
    } catch (err: unknown) {
      if (err instanceof AuthError) {
        throw err;
      }
      const e = err as any;
      if (e && e.code === '23505') {
        throw new EmailAlreadyExistsError();
      }
      if (isDbConnectionError(err)) {
        console.error('[AuthService.registerCitizen] Database unavailable:', err instanceof Error ? err.message : err);
        throw new DatabaseUnavailableError();
      }
      throw err;
    }
  },

  /**
   * Retrieves a user by their unique ID from the database.
   */
  async getUserById(id: string): Promise<User | null> {
    try {
      const res = await query<{
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
        [id]
      );

      if (res.rows.length === 0) {
        return null;
      }

      const row = res.rows[0];
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role as UserRole,
        department: (row.department as DepartmentType) || null,
        created_at: row.created_at,
      };
    } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        console.error('[AuthService.getUserById] Database unavailable:', err instanceof Error ? err.message : err);
        throw new DatabaseUnavailableError();
      }
      throw err;
    }
  },

  /**
   * Verifies a JWT token and retrieves the corresponding database user record.
   */
  async verifyTokenAndGetUser(token: string): Promise<User> {
    const payload = verifyAccessToken(token);
    const user = await AuthService.getUserById(payload.sub);
    if (!user) {
      throw new UserNotFoundError();
    }
    return user;
  },
};
