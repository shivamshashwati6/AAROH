import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import app from '../src/index';
import { query, closePool } from '../src/db';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  verifyAccessToken,
  getJwtSecret,
  AuthError,
} from '../src/services/auth';
import { User } from '@relief-os/shared';

let server: Server;
let baseUrl: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

const createdUserIds: string[] = [];

after(async () => {
  // Clean up any test users created during the run using exact IDs and exact test email
  if (createdUserIds.length > 0) {
    await query("DELETE FROM users WHERE id = ANY($1::varchar[])", [createdUserIds]);
  }
  await query("DELETE FROM users WHERE email = $1", ['ratul.barman@test-auth.org']);
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await closePool();
});

describe('RELIEF-OS Step 2: Backend Authentication Service', () => {
  // ---------------------------------------------------------------------------
  // 1. Password Hashing & Token Verification Unit Tests
  // ---------------------------------------------------------------------------
  describe('Password Hashing & Verification Logic', () => {
    it('should securely hash password with bcrypt and never equal plaintext', async () => {
      const plain = 'StrongP@ssw0rd123';
      const hash = await hashPassword(plain);

      assert.notEqual(hash, plain);
      assert.match(hash, /^\$2[aby]\$/); // bcrypt signature

      const match = await verifyPassword(plain, hash);
      assert.equal(match, true);

      const wrongMatch = await verifyPassword('WrongPassword123', hash);
      assert.equal(wrongMatch, false);
    });

    it('should reject passwords shorter than 8 characters', async () => {
      await assert.rejects(
        async () => {
          await hashPassword('short');
        },
        (err: Error) => {
          assert.ok(err instanceof AuthError);
          assert.equal((err as AuthError).code, 'PASSWORD_TOO_SHORT');
          return true;
        }
      );
    });

    it('should fail safely if JWT_SECRET is unset or empty', () => {
      const originalSecret = process.env.JWT_SECRET;
      try {
        process.env.JWT_SECRET = '';
        assert.throws(
          () => getJwtSecret(),
          (err: Error) => {
            assert.ok(err instanceof AuthError);
            assert.equal((err as AuthError).code, 'JWT_SECRET_MISSING');
            return true;
          }
        );
      } finally {
        process.env.JWT_SECRET = originalSecret;
      }
    });

    it('should sign and verify valid JWT tokens correctly', () => {
      const testUser: User = {
        id: 'usr-unit-test-1',
        name: 'Unit Tester',
        email: 'tester@test-auth.org',
        role: 'citizen',
        department: null,
      };

      const { token, expires_at } = generateAccessToken(testUser);
      assert.ok(token);
      assert.ok(expires_at);

      const payload = verifyAccessToken(token);
      assert.equal(payload.sub, testUser.id);
      assert.equal(payload.email, testUser.email);
      assert.equal(payload.role, 'citizen');
      assert.equal(payload.department, null);
    });

    it('should reject expired tokens with TOKEN_EXPIRED', () => {
      const testUser: User = {
        id: 'usr-unit-test-2',
        name: 'Expired Tester',
        email: 'expired@test-auth.org',
        role: 'citizen',
        department: null,
      };

      // Generate token with negative expiration time (already expired)
      const { token } = generateAccessToken(testUser, -10);

      assert.throws(
        () => verifyAccessToken(token),
        (err: Error) => {
          assert.ok(err instanceof AuthError);
          assert.equal((err as AuthError).code, 'TOKEN_EXPIRED');
          return true;
        }
      );
    });

    it('should reject tampered or invalid token signatures with TOKEN_INVALID', () => {
      const badToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';
      assert.throws(
        () => verifyAccessToken(badToken),
        (err: Error) => {
          assert.ok(err instanceof AuthError);
          assert.equal((err as AuthError).code, 'TOKEN_INVALID');
          return true;
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Auth API Endpoints (register, login, me)
  // ---------------------------------------------------------------------------
  describe('Authentication Endpoints Integration', () => {
    const testCitizen = {
      name: 'Ratul Barman',
      email: 'ratul.barman@test-auth.org',
      password: 'SecurePassword123!',
    };

    it('should successfully register a CITIZEN account via POST /api/auth/register', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCitizen),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.ok(body.user?.id);
      createdUserIds.push(body.user.id);

      assert.ok(body.token);
      assert.ok(body.expires_at);
      assert.equal(body.user.name, 'Ratul Barman');
      assert.equal(body.user.email, 'ratul.barman@test-auth.org');
      assert.equal(body.user.role, 'citizen');
      assert.equal(body.user.department, null);

      // Verify password_hash is strictly NOT in the response
      assert.equal(body.user.password_hash, undefined);
      assert.equal(body.password_hash, undefined);
    });

    it('should reject duplicate email registration with 409 Conflict', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCitizen),
      });

      assert.equal(res.status, 409);
      const body = await res.json();
      assert.match(body.error, /already exists/i);
    });

    it('should reject public registration attempting to claim command_center or admin role with 403', async () => {
      const privilegedPayloads = [
        { name: 'Fake Officer', email: 'officer@test-auth.org', password: 'Password123!', role: 'command_center' },
        { name: 'Fake Admin', email: 'admin@test-auth.org', password: 'Password123!', role: 'admin' },
        { name: 'Fake Officer Legacy', email: 'legacy@test-auth.org', password: 'Password123!', role: 'officer' },
        { name: 'Fake Dept', email: 'dept@test-auth.org', password: 'Password123!', role: 'department', department: 'rescue' },
        { name: 'Citizen With Dept', email: 'citdept@test-auth.org', password: 'Password123!', department: 'health' },
      ];

      for (const payload of privilegedPayloads) {
        const res = await fetch(`${baseUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        assert.equal(res.status, 403, `Expected 403 for role=${payload.role || payload.department}`);
        const body = await res.json();
        assert.match(body.error, /restricted to citizen/i);
      }
    });

    it('should reject registration with invalid email or password < 8 characters with 400', async () => {
      const resShortPass = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Shorty', email: 'short@test-auth.org', password: '123' }),
      });
      assert.equal(resShortPass.status, 400);

      const resBadEmail = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Bad Email', email: 'not-an-email', password: 'Password123!' }),
      });
      assert.equal(resBadEmail.status, 400);
    });

    it('should successfully log in with valid credentials via POST /api/auth/login', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testCitizen.email,
          password: testCitizen.password,
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();

      assert.ok(body.token);
      assert.ok(body.expires_at);
      assert.equal(body.user.email, testCitizen.email);
      assert.equal(body.user.role, 'citizen');
      assert.equal(body.user.password_hash, undefined);
    });

    it('should return identical 401 error message for wrong password and non-existent account (user enumeration protection)', async () => {
      // 1. Existing account with incorrect password
      const resWrongPass = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testCitizen.email,
          password: 'CompletelyWrongPassword123!',
        }),
      });
      assert.equal(resWrongPass.status, 401);
      const bodyWrongPass = await resWrongPass.json();

      // 2. Non-existent account
      const resNoAccount = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'does.not.exist@test-auth.org',
          password: 'SomePassword123!',
        }),
      });
      assert.equal(resNoAccount.status, 401);
      const bodyNoAccount = await resNoAccount.json();

      // Both must return identical generic message
      assert.equal(bodyWrongPass.error, 'Invalid email or password');
      assert.equal(bodyNoAccount.error, 'Invalid email or password');
    });

    it('should successfully retrieve current profile via GET /api/auth/me with valid Bearer token', async () => {
      // Login first to get fresh token
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testCitizen.email,
          password: testCitizen.password,
        }),
      });
      const loginBody = await loginRes.json();
      const token = loginBody.token;

      // Call /api/auth/me
      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(meRes.status, 200);
      const meBody = await meRes.json();
      assert.equal(meBody.user.email, testCitizen.email);
      assert.equal(meBody.user.role, 'citizen');
      assert.equal(meBody.user.password_hash, undefined);
    });

    it('should reject GET /api/auth/me with 401 when Authorization header is missing, malformed, or invalid', async () => {
      // 1. Missing header
      const resMissing = await fetch(`${baseUrl}/api/auth/me`);
      assert.equal(resMissing.status, 401);

      // 2. Malformed header (not Bearer)
      const resMalformed = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Basic some-credentials' },
      });
      assert.equal(resMalformed.status, 401);

      // 3. Invalid token signature
      const resInvalid = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: 'Bearer this.is.a.bad.token' },
      });
      assert.equal(resInvalid.status, 401);
    });
  });
});
