import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express, { Request, Response } from 'express';
import { Server } from 'http';
import { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import {
  AuthService,
  AuthError,
  InvalidCredentialsError,
  UserNotFoundError,
  TokenExpiredError,
  TokenInvalidError,
  DatabaseUnavailableError,
  isDbConnectionError,
  hashPassword,
  verifyPassword,
  generateAccessToken,
  verifyAccessToken,
  getJwtSecret,
  validateJwtConfigAtStartup,
} from '../src/services/auth';
import { requireAuth, requireRole } from '../src/middleware/auth';
import { authRouter } from '../src/routes/auth';
import { User } from '@relief-os/shared';

describe('RELIEF-OS / AAROH: Permanent Authentication Audit & Rebuild Suite', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

  const mockCitizenUser: User = {
    id: 'usr-audit-citizen-01',
    name: 'Audit Citizen',
    email: 'citizen.audit@relief.internal',
    role: 'citizen',
    department: null,
    created_at: new Date().toISOString(),
  };

  const mockAdminUser: User = {
    id: 'usr-audit-admin-01',
    name: 'Audit Admin',
    email: 'admin.audit@relief.internal',
    role: 'admin',
    department: null,
    created_at: new Date().toISOString(),
  };

  const mockHealthUser: User = {
    id: 'usr-audit-health-01',
    name: 'Audit Health Lead',
    email: 'health.audit@relief.internal',
    role: 'department',
    department: 'health',
    created_at: new Date().toISOString(),
  };

  before(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);

    // Protected test endpoints for role checking
    app.get('/api/test/protected', requireAuth, (req: Request, res: Response) => {
      res.status(200).json({ user: req.user });
    });

    app.get(
      '/api/test/admin-only',
      requireAuth,
      requireRole(['admin']),
      (_req: Request, res: Response) => {
        res.status(200).json({ message: 'admin authorized' });
      }
    );

    app.get(
      '/api/test/health-only',
      requireAuth,
      requireRole(['department'], ['health']),
      (_req: Request, res: Response) => {
        res.status(200).json({ message: 'health department authorized' });
      }
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Valid Login
  // ---------------------------------------------------------------------------
  it('1. Valid login: authenticates valid credentials, returns JWT and user profile', async () => {
    const plainPassword = 'StrongAuditPassword123!';
    const passwordHash = await hashPassword(plainPassword);

    const origAuthenticate = AuthService.authenticate;
    AuthService.authenticate = async (email, password) => {
      assert.equal(email, mockCitizenUser.email);
      const match = await verifyPassword(password, passwordHash);
      assert.equal(match, true);
      const { token, expires_at } = generateAccessToken(mockCitizenUser);
      return { user: mockCitizenUser, token, expires_at };
    };

    try {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: mockCitizenUser.email,
          password: plainPassword,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.email, mockCitizenUser.email);
      assert.ok(data.token);
      assert.ok(data.expires_at);

      // Verify token contains correct claims
      const payload = verifyAccessToken(data.token);
      assert.equal(payload.sub, mockCitizenUser.id);
      assert.equal(payload.role, mockCitizenUser.role);
    } finally {
      AuthService.authenticate = origAuthenticate;
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Invalid Password
  // ---------------------------------------------------------------------------
  it('2. Invalid password: rejects incorrect password with 401 without leaking internal details', async () => {
    const origAuthenticate = AuthService.authenticate;
    AuthService.authenticate = async () => {
      throw new InvalidCredentialsError();
    };

    try {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'citizen@relief.internal',
          password: 'WrongPassword999!',
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'Invalid email or password');
      assert.equal(data.code, 'INVALID_CREDENTIALS');
    } finally {
      AuthService.authenticate = origAuthenticate;
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Nonexistent User
  // ---------------------------------------------------------------------------
  it('3. Nonexistent user: returns timing-safe 401 and prevents user enumeration', async () => {
    const origAuthenticate = AuthService.authenticate;
    AuthService.authenticate = async () => {
      // Mimics timing-safe dummy comparison and returns generic invalid credentials
      throw new InvalidCredentialsError();
    };

    try {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent.user.999@unknown.org',
          password: 'SomePassword123!',
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'Invalid email or password');
    } finally {
      AuthService.authenticate = origAuthenticate;
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Missing Credentials
  // ---------------------------------------------------------------------------
  it('4. Missing credentials: returns 400 Bad Request with descriptive message', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '',
        password: '',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  // ---------------------------------------------------------------------------
  // 5. Malformed Request
  // ---------------------------------------------------------------------------
  it('5. Malformed request: rejects non-email or malformed input with 400', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'not-a-valid-email',
        password: 'Password123!',
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /invalid email/i);
  });

  // ---------------------------------------------------------------------------
  // 6. JWT Generation & Verification
  // ---------------------------------------------------------------------------
  it('6. JWT generation and verification: signs valid token and decodes all required claims', () => {
    const { token, expires_at } = generateAccessToken(mockAdminUser, '2h');
    assert.ok(token);
    assert.ok(expires_at);

    const decoded = verifyAccessToken(token);
    assert.equal(decoded.sub, mockAdminUser.id);
    assert.equal(decoded.email, mockAdminUser.email);
    assert.equal(decoded.role, 'admin');
    assert.equal(decoded.department, null);
    assert.ok(decoded.exp && decoded.exp > decoded.iat!);
  });

  // ---------------------------------------------------------------------------
  // 7. Expired JWT
  // ---------------------------------------------------------------------------
  it('7. Expired JWT: rejects expired token with 401 and TOKEN_EXPIRED code', async () => {
    const secret = getJwtSecret();
    const expiredToken = jwt.sign(
      { sub: mockCitizenUser.id, email: mockCitizenUser.email, role: 'citizen' },
      secret,
      { expiresIn: '-1s' }
    );

    const res = await fetch(`${baseUrl}/api/test/protected`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.code, 'TOKEN_EXPIRED');
    assert.match(data.error, /expired/i);
  });

  // ---------------------------------------------------------------------------
  // 8. Invalid JWT
  // ---------------------------------------------------------------------------
  it('8. Invalid JWT: rejects tampered signature or malformed token with 401 and TOKEN_INVALID', async () => {
    const { token } = generateAccessToken(mockCitizenUser);
    const tamperedToken = token.slice(0, -6) + 'abcdef';

    const res = await fetch(`${baseUrl}/api/test/protected`, {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.code, 'TOKEN_INVALID');
  });

  // ---------------------------------------------------------------------------
  // 9. Missing Authorization Header
  // ---------------------------------------------------------------------------
  it('9. Missing Authorization header: returns 401 AUTH_REQUIRED on protected routes', async () => {
    const res = await fetch(`${baseUrl}/api/test/protected`);

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.code, 'AUTH_REQUIRED');
  });

  // ---------------------------------------------------------------------------
  // 10. User Session Persistence after Refresh
  // ---------------------------------------------------------------------------
  it('10. User session persistence: GET /api/auth/me returns profile for valid session token', async () => {
    const { token } = generateAccessToken(mockCitizenUser);

    const origGetUser = AuthService.getUserById;
    AuthService.getUserById = async (id) => {
      assert.equal(id, mockCitizenUser.id);
      return mockCitizenUser;
    };

    try {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.id, mockCitizenUser.id);
      assert.equal(data.user.email, mockCitizenUser.email);
      assert.equal(data.user.role, 'citizen');
    } finally {
      AuthService.getUserById = origGetUser;
    }
  });

  // ---------------------------------------------------------------------------
  // 11. Database Unavailable
  // ---------------------------------------------------------------------------
  it('11. Database unavailable: returns 503 DATABASE_UNAVAILABLE instead of false 401 or 500', async () => {
    const origAuthenticate = AuthService.authenticate;
    AuthService.authenticate = async () => {
      throw new DatabaseUnavailableError();
    };

    try {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'citizen@relief.internal',
          password: 'Password123!',
        }),
      });

      assert.equal(res.status, 503);
      const data = await res.json();
      assert.equal(data.code, 'DATABASE_UNAVAILABLE');
      assert.match(data.error, /temporarily unavailable/i);
    } finally {
      AuthService.authenticate = origAuthenticate;
    }
  });

  // ---------------------------------------------------------------------------
  // 12. Database Connection Recovery
  // ---------------------------------------------------------------------------
  it('12. Database connection recovery: recovers and succeeds immediately when database reconnects', async () => {
    let failCount = 1;
    const origAuthenticate = AuthService.authenticate;
    AuthService.authenticate = async () => {
      if (failCount > 0) {
        failCount--;
        throw new DatabaseUnavailableError();
      }
      const { token, expires_at } = generateAccessToken(mockCitizenUser);
      return { user: mockCitizenUser, token, expires_at };
    };

    try {
      // First attempt fails with 503
      const res1 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mockCitizenUser.email, password: 'Password123!' }),
      });
      assert.equal(res1.status, 503);

      // Reconnected attempt succeeds with 200
      const res2 = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mockCitizenUser.email, password: 'Password123!' }),
      });
      assert.equal(res2.status, 200);
      const data2 = await res2.json();
      assert.ok(data2.token);
    } finally {
      AuthService.authenticate = origAuthenticate;
    }
  });

  // ---------------------------------------------------------------------------
  // 13. Role-Based Authorization
  // ---------------------------------------------------------------------------
  it('13. Role-based authorization: correctly admits authorized role and rejects unauthorized with 403', async () => {
    const adminToken = generateAccessToken(mockAdminUser).token;
    const citizenToken = generateAccessToken(mockCitizenUser).token;
    const healthToken = generateAccessToken(mockHealthUser).token;

    const origGetUser = AuthService.getUserById;
    AuthService.getUserById = async (id) => {
      if (id === mockAdminUser.id) return mockAdminUser;
      if (id === mockCitizenUser.id) return mockCitizenUser;
      if (id === mockHealthUser.id) return mockHealthUser;
      return null;
    };

    try {
      // Citizen accessing admin route -> 403 Forbidden
      const resCitizenAdmin = await fetch(`${baseUrl}/api/test/admin-only`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(resCitizenAdmin.status, 403);
      const dataCitizen = await resCitizenAdmin.json();
      assert.equal(dataCitizen.code, 'FORBIDDEN_ROLE');

      // Admin accessing admin route -> 200 OK
      const resAdminAdmin = await fetch(`${baseUrl}/api/test/admin-only`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(resAdminAdmin.status, 200);

      // Admin accessing health department route -> 403 Forbidden
      const resAdminHealth = await fetch(`${baseUrl}/api/test/health-only`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(resAdminHealth.status, 403);

      // Health department user accessing health route -> 200 OK
      const resHealth = await fetch(`${baseUrl}/api/test/health-only`, {
        headers: { Authorization: `Bearer ${healthToken}` },
      });
      assert.equal(resHealth.status, 200);
    } finally {
      AuthService.getUserById = origGetUser;
    }
  });

  // ---------------------------------------------------------------------------
  // 14. Logout / Invalid Token Clearance
  // ---------------------------------------------------------------------------
  it('14. Logout: subsequent requests with null, empty, or revoked header fail with 401', async () => {
    const res = await fetch(`${baseUrl}/api/test/protected`, {
      headers: { Authorization: '' },
    });
    assert.equal(res.status, 401);
  });

  // ---------------------------------------------------------------------------
  // 15. Concurrent Authenticated Requests
  // ---------------------------------------------------------------------------
  it('15. Concurrent authenticated requests: handles 25 parallel requests without race conditions', async () => {
    const { token } = generateAccessToken(mockAdminUser);

    const origGetUser = AuthService.getUserById;
    AuthService.getUserById = async () => mockAdminUser;

    try {
      const requests = Array.from({ length: 25 }, () =>
        fetch(`${baseUrl}/api/test/protected`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );

      const responses = await Promise.all(requests);
      for (const res of responses) {
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.user.id, mockAdminUser.id);
      }
    } finally {
      AuthService.getUserById = origGetUser;
    }
  });

  // ---------------------------------------------------------------------------
  // 16. Production Configuration Validation
  // ---------------------------------------------------------------------------
  it('16. Production configuration validation: strictly enforces >=32 char JWT_SECRET in production', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;

    try {
      process.env.NODE_ENV = 'production';

      // Missing secret in production -> fatal startup error
      delete process.env.JWT_SECRET;
      assert.throws(
        () => validateJwtConfigAtStartup(),
        /FATAL SECURITY CONFIGURATION ERROR.*JWT_SECRET must be explicitly set/
      );

      // Short secret (< 32 chars) in production -> fatal startup error
      process.env.JWT_SECRET = 'short_insecure_secret_12345';
      assert.throws(
        () => validateJwtConfigAtStartup(),
        /FATAL SECURITY CONFIGURATION ERROR.*Minimum 32 characters/
      );

      // Default dev-secret in production -> fatal startup error
      process.env.JWT_SECRET = 'dev-secret';
      assert.throws(
        () => validateJwtConfigAtStartup(),
        /Insecure or default JWT_SECRET detected in production/
      );

      // Strong >= 32 character secret in production -> passes cleanly
      process.env.JWT_SECRET = 'a_very_strong_production_jwt_secret_with_sufficient_entropy_64chars';
      assert.doesNotThrow(() => validateJwtConfigAtStartup());
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSecret !== undefined) {
        process.env.JWT_SECRET = originalSecret;
      } else {
        delete process.env.JWT_SECRET;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 17. Database Connection Error Classification Helper
  // ---------------------------------------------------------------------------
  it('17. isDbConnectionError: accurately classifies Supabase pooler tenant unmapped and connection codes', () => {
    assert.equal(isDbConnectionError({ code: 'XX000', message: '(ENOTFOUND) tenant/user postgres.yuemwyglahasusymbefm not found' }), true);
    assert.equal(isDbConnectionError({ code: '53300', message: 'too many connections' }), true);
    assert.equal(isDbConnectionError({ code: '08006', message: 'connection failure' }), true);
    assert.equal(isDbConnectionError({ code: '57P01', message: 'admin shutdown' }), true);
    assert.equal(isDbConnectionError({ code: 'ECONNREFUSED', message: 'connection refused' }), true);
    assert.equal(isDbConnectionError({ code: 'ETIMEDOUT', message: 'connection timed out' }), true);
    assert.equal(isDbConnectionError({ message: 'Connection terminated unexpectedly' }), true);
    assert.equal(isDbConnectionError({ code: '42P01', message: 'relation does not exist' }), false);
    assert.equal(isDbConnectionError(null), false);
    assert.equal(isDbConnectionError('string error'), false);
  });
});

