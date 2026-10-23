/**
 * RELIEF-OS Admin Account Authentication & Role Authorization Integration Tests
 * 
 * Validates:
 * 1. Admin login via POST /api/auth/login with valid credentials.
 * 2. Strict rejection of invalid passwords and non-existent accounts with 401.
 * 3. Token verification and identity retrieval via GET /api/auth/me.
 * 4. Authorization of the admin token on high-privilege operational endpoints:
 *    - POST /api/simulation/run
 *    - POST /api/disasters
 *    - PATCH /api/road-segments/:id
 * 5. Rejection of unauthenticated or unauthorized role attempts on these endpoints.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import bcrypt from 'bcryptjs';
import app from '../src/index';
import { query, closePool } from '../src/db';

let server: Server;
let baseUrl: string;

const TEST_ADMIN_EMAIL = 'admin-test@relief.internal';
const TEST_ADMIN_PASSWORD = 'SecureAdminPass2026!';
const TEST_ADMIN_ID = 'usr-admin-integration-test';

let adminToken: string;
let citizenToken: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Seed test admin and citizen in database
  const adminHash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 10);
  const citizenHash = await bcrypt.hash('CitizenPass123!', 10);

  await query(
    `INSERT INTO users (id, name, email, password_hash, role, department)
     VALUES 
       ($1, 'Integration Admin', $2, $3, 'admin', NULL),
       ('usr-cit-integration-test', 'Integration Citizen', 'citizen-test@relief.internal', $4, 'citizen', NULL)
     ON CONFLICT (email) DO UPDATE 
     SET password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         department = EXCLUDED.department`,
    [TEST_ADMIN_ID, TEST_ADMIN_EMAIL, adminHash, citizenHash]
  );
});

const createdSimIds: string[] = [];
const createdDisasterIds: string[] = [];

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (createdSimIds.length > 0) {
    await query(`DELETE FROM simulation_runs WHERE id = ANY($1::varchar[])`, [createdSimIds]);
  }
  if (createdDisasterIds.length > 0) {
    await query(`DELETE FROM disasters WHERE id = ANY($1::varchar[])`, [createdDisasterIds]);
  }
  await query("DELETE FROM users WHERE id IN ('usr-admin-integration-test', 'usr-cit-integration-test')");
  await query("DELETE FROM audit_log WHERE user_id = $1", [TEST_ADMIN_ID]);
  await closePool();
});

describe('RELIEF-OS Admin Account Authentication & Authorization Tests', () => {
  describe('Admin Login & Credential Verification', () => {
    it('should successfully authenticate admin with valid credentials and return JWT token', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_ADMIN_EMAIL,
          password: TEST_ADMIN_PASSWORD,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(data.token, 'Token must be issued');
      assert.ok(data.user, 'User object must be present');
      assert.equal(data.user.email, TEST_ADMIN_EMAIL);
      assert.equal(data.user.role, 'admin');
      assert.equal(data.user.department, null);

      // Verify no password leaks
      assert.equal((data.user as any).password, undefined);
      assert.equal((data.user as any).password_hash, undefined);

      adminToken = data.token;
    });

    it('should reject admin login with invalid password with 401', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TEST_ADMIN_EMAIL,
          password: 'IncorrectPassword999!',
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'Invalid email or password');
    });

    it('should reject admin login with non-existent email with identical 401 error', async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'unknown-admin@relief.internal',
          password: TEST_ADMIN_PASSWORD,
        }),
      });

      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.error, 'Invalid email or password');
    });
  });

  describe('Admin Identity Verification via GET /api/auth/me', () => {
    it('should return authenticated admin profile with valid Bearer token', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.user.id, TEST_ADMIN_ID);
      assert.equal(data.user.email, TEST_ADMIN_EMAIL);
      assert.equal(data.user.role, 'admin');
      assert.equal(data.user.department, null);
    });

    it('should reject GET /api/auth/me without token with 401', async () => {
      const res = await fetch(`${baseUrl}/api/auth/me`);
      assert.equal(res.status, 401);
    });
  });

  describe('Admin Privileged Operations Authorization', () => {
    it('should allow admin to run What-If simulations', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          remove_boats: 1,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.is_simulated, true);
      if (data.simulation_id) createdSimIds.push(data.simulation_id);
    });

    it('should allow admin to create emergency disasters', async () => {
      const res = await fetch(`${baseUrl}/api/disasters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Admin Test Flash Flood 2026',
          type: 'flood',
          region: 'Brahmaputra Basin',
          status: 'simulated',
          is_simulated: true,
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.name, 'Admin Test Flash Flood 2026');
      assert.ok(data.id);
      createdDisasterIds.push(data.id);

      // Cleanup created disaster
      await query('DELETE FROM disasters WHERE id = $1', [data.id]);
    });

    it('should allow admin to update road segment conditions', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-c`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          status: 'accessible',
          reason: 'Admin routine clearance inspection',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.updated_segment.status, 'accessible');
    });

    it('should forbid citizen from performing admin operations', async () => {
      // First obtain citizen token
      const citLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'citizen-test@relief.internal',
          password: 'CitizenPass123!',
        }),
      });
      assert.equal(citLoginRes.status, 200);
      const citData = await citLoginRes.json();
      citizenToken = citData.token;

      // Citizen attempting simulation
      const simRes = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          remove_boats: 1,
        }),
      });
      assert.equal(simRes.status, 403);

      // Citizen attempting disaster creation
      const disRes = await fetch(`${baseUrl}/api/disasters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({
          name: 'Unauthorized Citizen Flood',
          type: 'flood',
          region: 'Test',
        }),
      });
      assert.equal(disRes.status, 403);
    });
  });
});
