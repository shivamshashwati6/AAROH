/**
 * RELIEF-OS Admin Dashboard & Department Report Access API Regression Tests
 * 
 * Tests:
 * 1. Admin login redirects & token generation.
 * 2. GET /api/admin/overview - 200 for admin, 403 for non-admin (citizen/department), 401 for unauthenticated.
 * 3. GET /api/admin/users - 200 with sanitized user directory (zero password_hash exposure), 403 for non-admin.
 * 4. PATCH /api/admin/users/:id/role - enforces DB constraints (department requires valid dept, non-dept requires null dept).
 * 5. POST /api/admin/users - provision responder accounts (admin-only).
 * 6. Department report access (GET /api/reports):
 *    - Health, Supply, Rescue can view reports.
 *    - Operational users get contact_number; unauthenticated/citizen gets contact_number: null.
 *    - Department users are restricted from admin APIs (403) and plan approvals (403).
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

const ADMIN_ID = 'usr-admin-phase5-test';
const ADMIN_EMAIL = 'admin-phase5@relief.internal';
const ADMIN_PASS = 'AdminPass2026!';

const HEALTH_ID = 'usr-health-phase5-test';
const HEALTH_EMAIL = 'health-phase5@relief.internal';
const HEALTH_PASS = 'HealthPass2026!';

const CITIZEN_ID = 'usr-cit-phase5-test';
const CITIZEN_EMAIL = 'citizen-phase5@relief.internal';
const CITIZEN_PASS = 'CitizenPass2026!';

let adminToken: string;
let healthToken: string;
let citizenToken: string;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const adminHash = await bcrypt.hash(ADMIN_PASS, 10);
  const healthHash = await bcrypt.hash(HEALTH_PASS, 10);
  const citizenHash = await bcrypt.hash(CITIZEN_PASS, 10);

  // Insert or update test accounts
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, department)
     VALUES 
       ($1, 'Phase 5 Admin', $2, $3, 'admin', NULL),
       ($4, 'Phase 5 Health Responder', $5, $6, 'department', 'health'),
       ($7, 'Phase 5 Citizen', $8, $9, 'citizen', NULL)
     ON CONFLICT (email) DO UPDATE 
     SET password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         department = EXCLUDED.department`,
    [
      ADMIN_ID, ADMIN_EMAIL, adminHash,
      HEALTH_ID, HEALTH_EMAIL, healthHash,
      CITIZEN_ID, CITIZEN_EMAIL, citizenHash,
    ]
  );

  // Obtain JWT tokens for each role
  const aLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASS }),
  });
  assert.equal(aLogin.status, 200);
  adminToken = (await aLogin.json()).token;

  const hLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: HEALTH_EMAIL, password: HEALTH_PASS }),
  });
  assert.equal(hLogin.status, 200);
  healthToken = (await hLogin.json()).token;

  const cLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: CITIZEN_EMAIL, password: CITIZEN_PASS }),
  });
  assert.equal(cLogin.status, 200);
  citizenToken = (await cLogin.json()).token;
});

const provisionedUserIds: string[] = [];

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (provisionedUserIds.length > 0) {
    await query("DELETE FROM users WHERE id = ANY($1::varchar[])", [provisionedUserIds]);
  }
  await query("DELETE FROM users WHERE id IN ($1, $2, $3)", [ADMIN_ID, HEALTH_ID, CITIZEN_ID]);
  await query("DELETE FROM audit_log WHERE user_id = $1", [ADMIN_ID]);
  await closePool();
});

describe('PHASE 2 & 3: Admin & Department Report Access Regression Tests', () => {
  // ---------------------------------------------------------------------------
  // Admin Endpoints Security & Data Sanitization
  // ---------------------------------------------------------------------------
  describe('GET /api/admin/overview', () => {
    it('should allow admin to retrieve full system overview and metrics', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(data.system, 'system object must be present');
      assert.ok(data.users_summary, 'users_summary must be present');
      assert.ok(data.reports_summary, 'reports_summary must be present');
      assert.ok(data.departments_overview, 'departments_overview must be present');
      assert.ok(data.departments_overview.health, 'health department overview must be present');
      assert.ok(data.departments_overview.supply, 'supply department overview must be present');
      assert.ok(data.departments_overview.rescue, 'rescue department overview must be present');
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`);
      assert.equal(res.status, 401);
    });

    it('should reject citizen request with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should reject department user request with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/admin/overview`, {
        headers: { Authorization: `Bearer ${healthToken}` },
      });
      assert.equal(res.status, 403);
    });
  });

  describe('GET /api/admin/users', () => {
    it('should return sanitized user directory for admin with zero password_hash leaks', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(Array.isArray(data.items), 'items must be an array');
      assert.ok(data.total > 0, 'total must be > 0');

      // Verify strict password hash redaction
      for (const u of data.items) {
        assert.equal((u as any).password, undefined, 'password must never be exposed');
        assert.equal((u as any).password_hash, undefined, 'password_hash must never be exposed');
        assert.ok(u.id, 'user must have id');
        assert.ok(u.email, 'user must have email');
        assert.ok(u.role, 'user must have role');
      }
    });

    it('should forbid non-admin users from accessing user directory', async () => {
      const citRes = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(citRes.status, 403);

      const deptRes = await fetch(`${baseUrl}/api/admin/users`, {
        headers: { Authorization: `Bearer ${healthToken}` },
      });
      assert.equal(deptRes.status, 403);
    });
  });

  describe('PATCH /api/admin/users/:id/role', () => {
    it('should allow admin to update a user role and department', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/${CITIZEN_ID}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          role: 'department',
          department: 'supply',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.user.role, 'department');
      assert.equal(data.user.department, 'supply');

      // Restore back to citizen
      const restoreRes = await fetch(`${baseUrl}/api/admin/users/${CITIZEN_ID}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          role: 'citizen',
          department: null,
        }),
      });
      assert.equal(restoreRes.status, 200);
    });

    it('should reject role=department without department assignment with 400', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/${CITIZEN_ID}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          role: 'department',
          department: null,
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Department role requires a valid department'));
    });

    it('should reject non-department role with non-null department with 400', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/${CITIZEN_ID}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          role: 'citizen',
          department: 'health',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Department must be NULL for non-department role'));
    });

    it('should forbid non-admins from changing roles', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users/${CITIZEN_ID}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${healthToken}`,
        },
        body: JSON.stringify({
          role: 'admin',
          department: null,
        }),
      });
      assert.equal(res.status, 403);
    });
  });

  describe('POST /api/admin/users (Provision Operational User)', () => {
    it('should allow admin to provision a new responder account', async () => {
      const testEmail = `prov-test-${Date.now()}@relief.internal`;
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: 'Provisioned Rescue Operator',
          email: testEmail,
          password: 'TemporaryRescuePass2026!',
          role: 'department',
          department: 'rescue',
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.user.id);
      provisionedUserIds.push(data.user.id);
      assert.equal(data.user.email, testEmail);
      assert.equal(data.user.role, 'department');
      assert.equal(data.user.department, 'rescue');
      assert.equal((data.user as any).password_hash, undefined);
    });

    it('should reject provisioning by unauthorized roles with 403', async () => {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({
          name: 'Malicious Attempt',
          email: 'hack@relief.internal',
          password: 'Password123!',
          role: 'admin',
        }),
      });
      assert.equal(res.status, 403);
    });
  });

  // ---------------------------------------------------------------------------
  // Department Report Access & Privacy Controls
  // ---------------------------------------------------------------------------
  describe('Department Report Access & Privacy Protection (GET /api/reports)', () => {
    it('should allow department responders to retrieve actual stored reports', async () => {
      const res = await fetch(`${baseUrl}/api/reports?limit=10`, {
        headers: { Authorization: `Bearer ${healthToken}` },
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(Array.isArray(data.items), 'items must be an array');
      assert.ok(data.total >= 0);

      // Verify report schema fields
      if (data.items.length > 0) {
        const rep = data.items[0];
        assert.ok(rep.id, 'report must have id');
        assert.ok(rep.description, 'report must have description');
        assert.ok(typeof rep.location_lat === 'number', 'lat must be numeric');
        assert.ok(typeof rep.location_lng === 'number', 'lng must be numeric');
        assert.ok(rep.severity, 'report must have severity');
        assert.ok(rep.status, 'report must have status');
        assert.ok(rep.created_at, 'report must have timestamp');
      }
    });

    it('should provide contact_number to authenticated operational roles (Health/Supply/Rescue/Admin)', async () => {
      const res = await fetch(`${baseUrl}/api/reports?limit=5`, {
        headers: { Authorization: `Bearer ${healthToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();

      // For operational roles, contact_number field is populated (or string if citizen submitted it)
      for (const item of data.items) {
        // Must have the property defined (can be string or null if not provided by submitter)
        assert.ok('contact_number' in item, 'contact_number key must exist for operational user');
      }
    });

    it('should REDACT citizen contact_number for unauthenticated or public citizen callers', async () => {
      const publicRes = await fetch(`${baseUrl}/api/reports?limit=5`);
      assert.equal(publicRes.status, 200);
      const publicData = await publicRes.json();

      for (const item of publicData.items) {
        assert.equal(item.contact_number, null, 'Public caller must never see citizen contact number');
      }

      const citRes = await fetch(`${baseUrl}/api/reports?limit=5`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(citRes.status, 200);
      const citData = await citRes.json();

      for (const item of citData.items) {
        assert.equal(item.contact_number, null, 'Citizen caller must never see other citizen contact numbers');
      }
    });

    it('should preserve read-only restrictions: department users CANNOT approve plans (POST /api/plans/:id/approve)', async () => {
      const res = await fetch(`${baseUrl}/api/plans/plan-fake-id/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${healthToken}`,
        },
      });

      // Must reject with 403 Forbidden because department users are read-only for plan approvals
      assert.equal(res.status, 403);
    });
  });
});
