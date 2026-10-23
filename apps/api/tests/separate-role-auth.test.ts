/**
 * RELIEF-OS Comprehensive Integration Tests: Separate Role-Based Authentication & Authorization
 * 
 * Verifies all 15 critical requirements:
 * 1. Successful citizen signup and database persistence.
 * 2. Duplicate email signup (409 Conflict).
 * 3. Invalid signup data (400 Bad Request).
 * 4. Successful login with correct credentials.
 * 5. Incorrect password (401 Unauthorized).
 * 6. Citizen login attempting to authenticate a department/admin account (rejected 401).
 * 7. Department login attempting to authenticate a citizen/admin account (rejected 401).
 * 8. Admin login attempting to authenticate a citizen/department account (rejected 401).
 * 9. Public signup cannot assign privileged roles (403 Forbidden).
 * 10. Citizen access to admin endpoints returns 403.
 * 11. Department access to admin-only endpoints returns 403.
 * 12. Unauthenticated protected API access is rejected (401).
 * 13. Password hash is never exposed in API responses.
 * 14. Successful login issues valid JWT token with authentic database role.
 * 15. Existing users and role permissions continue to work.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import app from '../src/index';
import { query, closePool } from '../src/db';

let server: Server;
let baseUrl: string;

// Unique test suite identifier for database record isolation
const SUITE_ID = `test_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
const testUserIds: string[] = [];

// Isolated test user credentials
const CITIZEN_EMAIL = `cit_${SUITE_ID}@test-isolated.org`;
const CITIZEN_PASS = 'StrongCitizenPass2026!';

const DEPT_EMAIL = `dept_${SUITE_ID}@test-isolated.org`;
const DEPT_PASS = 'StrongDeptPass2026!';

const ADMIN_EMAIL = `admin_${SUITE_ID}@test-isolated.org`;
const ADMIN_PASS = 'StrongAdminPass2026!';

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Seed isolated department and admin accounts directly in database
  const deptHash = await bcrypt.hash(DEPT_PASS, 10);
  const adminHash = await bcrypt.hash(ADMIN_PASS, 10);

  const deptId = `usr-dept-${SUITE_ID}`;
  const adminId = `usr-adm-${SUITE_ID}`;

  await query(
    `INSERT INTO users (id, name, email, password_hash, role, department)
     VALUES 
       ($1, 'Rescue Lead Test', $2, $3, 'department', 'rescue'),
       ($4, 'System Admin Test', $5, $6, 'admin', NULL)`,
    [deptId, DEPT_EMAIL, deptHash, adminId, ADMIN_EMAIL, adminHash]
  );

  testUserIds.push(deptId, adminId);
});

after(async () => {
  if (testUserIds.length > 0) {
    await query('DELETE FROM users WHERE id = ANY($1::varchar[])', [testUserIds]);
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

describe('RELIEF-OS Critical Authentication Repair & Separate Role-Based Login', () => {
  let citizenToken: string;
  let departmentToken: string;
  let adminToken: string;

  // ---------------------------------------------------------------------------
  // 1. Successful Citizen Signup and Database Persistence
  // ---------------------------------------------------------------------------
  it('1. should successfully register a citizen and persist record to database', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Assam Resident',
        email: CITIZEN_EMAIL,
        password: CITIZEN_PASS,
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();

    assert.ok(body.user?.id);
    testUserIds.push(body.user.id);

    assert.equal(body.user.name, 'Assam Resident');
    assert.equal(body.user.email, CITIZEN_EMAIL.toLowerCase());
    assert.equal(body.user.role, 'citizen');
    assert.equal(body.user.department, null);
    assert.ok(body.token);
    assert.ok(body.expires_at);

    // Verify password hash is strictly NEVER exposed in API response
    assert.equal(body.user.password_hash, undefined);
    assert.equal(body.password_hash, undefined);

    // Verify persistence directly in PostgreSQL
    const dbRes = await query<{ id: string; name: string; role: string; department: string | null }>(
      'SELECT id, name, role, department FROM users WHERE id = $1',
      [body.user.id]
    );
    assert.equal(dbRes.rows.length, 1);
    assert.equal(dbRes.rows[0].role, 'citizen');
    assert.equal(dbRes.rows[0].department, null);
  });

  // ---------------------------------------------------------------------------
  // 2. Duplicate Email Signup Rejection
  // ---------------------------------------------------------------------------
  it('2. should reject duplicate email registration with 409 Conflict', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Registrant',
        email: CITIZEN_EMAIL,
        password: 'AnotherPassword123!',
      }),
    });

    assert.equal(res.status, 409);
    const body = await res.json();
    assert.match(body.error, /already exists/i);
  });

  // ---------------------------------------------------------------------------
  // 3. Invalid Signup Data Rejection
  // ---------------------------------------------------------------------------
  it('3. should reject invalid signup data (short password, bad email, short name) with 400', async () => {
    // Short password
    const resShort = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Valid Name',
        email: `short_${SUITE_ID}@test.org`,
        password: 'short',
      }),
    });
    assert.equal(resShort.status, 400);
    const bodyShort = await resShort.json();
    assert.match(bodyShort.error, /8 characters/i);

    // Invalid email
    const resBadEmail = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Valid Name',
        email: 'invalid-email-format',
        password: 'ValidPassword123!',
      }),
    });
    assert.equal(resBadEmail.status, 400);
    const bodyBadEmail = await resBadEmail.json();
    assert.match(bodyBadEmail.error, /Invalid email address/i);

    // Short name
    const resShortName = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'A',
        email: `badname_${SUITE_ID}@test.org`,
        password: 'ValidPassword123!',
      }),
    });
    assert.equal(resShortName.status, 400);
    const bodyShortName = await resShortName.json();
    assert.match(bodyShortName.error, /Name must be at least 2 characters/i);
  });

  // ---------------------------------------------------------------------------
  // 4. Successful Login with Correct Credentials
  // ---------------------------------------------------------------------------
  it('4. should successfully log in with correct credentials on matching portal', async () => {
    // Citizen login on citizen portal
    const resCit = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: CITIZEN_EMAIL,
        password: CITIZEN_PASS,
        portal: 'citizen',
      }),
    });
    assert.equal(resCit.status, 200);
    const bodyCit = await resCit.json();
    assert.ok(bodyCit.token);
    assert.equal(bodyCit.user.role, 'citizen');
    citizenToken = bodyCit.token;

    // Department login on department portal
    const resDept = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: DEPT_EMAIL,
        password: DEPT_PASS,
        portal: 'department',
      }),
    });
    assert.equal(resDept.status, 200);
    const bodyDept = await resDept.json();
    assert.ok(bodyDept.token);
    assert.equal(bodyDept.user.role, 'department');
    assert.equal(bodyDept.user.department, 'rescue');
    departmentToken = bodyDept.token;

    // Admin login on admin portal
    const resAdmin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASS,
        portal: 'admin',
      }),
    });
    assert.equal(resAdmin.status, 200);
    const bodyAdmin = await resAdmin.json();
    assert.ok(bodyAdmin.token);
    assert.equal(bodyAdmin.user.role, 'admin');
    adminToken = bodyAdmin.token;
  });

  // ---------------------------------------------------------------------------
  // 5. Incorrect Password Rejection
  // ---------------------------------------------------------------------------
  it('5. should reject login with incorrect password with 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: CITIZEN_EMAIL,
        password: 'WrongPassword999!',
        portal: 'citizen',
      }),
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.token, undefined);
    assert.match(body.error, /invalid email or password/i);
  });

  // ---------------------------------------------------------------------------
  // 6. Citizen login attempting to authenticate a department/admin account
  // ---------------------------------------------------------------------------
  it('6. should reject citizen login portal attempting to authenticate department or admin account', async () => {
    // Department account on citizen portal
    const resDeptOnCit = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: DEPT_EMAIL,
        password: DEPT_PASS,
        portal: 'citizen',
      }),
    });
    assert.equal(resDeptOnCit.status, 401);
    const bodyDeptOnCit = await resDeptOnCit.json();
    assert.equal(bodyDeptOnCit.token, undefined);
    assert.match(bodyDeptOnCit.error, /Citizen portal access/i);

    // Admin account on citizen portal
    const resAdminOnCit = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASS,
        portal: 'citizen',
      }),
    });
    assert.equal(resAdminOnCit.status, 401);
    const bodyAdminOnCit = await resAdminOnCit.json();
    assert.equal(bodyAdminOnCit.token, undefined);
    assert.match(bodyAdminOnCit.error, /Citizen portal access/i);
  });

  // ---------------------------------------------------------------------------
  // 7. Department login attempting to authenticate a citizen/admin account
  // ---------------------------------------------------------------------------
  it('7. should reject department login portal attempting to authenticate citizen or admin account', async () => {
    // Citizen account on department portal
    const resCitOnDept = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: CITIZEN_EMAIL,
        password: CITIZEN_PASS,
        portal: 'department',
      }),
    });
    assert.equal(resCitOnDept.status, 401);
    const bodyCitOnDept = await resCitOnDept.json();
    assert.equal(bodyCitOnDept.token, undefined);
    assert.match(bodyCitOnDept.error, /Department portal access/i);

    // Admin account on department portal
    const resAdminOnDept = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASS,
        portal: 'department',
      }),
    });
    assert.equal(resAdminOnDept.status, 401);
    const bodyAdminOnDept = await resAdminOnDept.json();
    assert.equal(bodyAdminOnDept.token, undefined);
    assert.match(bodyAdminOnDept.error, /Department portal access/i);
  });

  // ---------------------------------------------------------------------------
  // 8. Admin login attempting to authenticate a citizen/department account
  // ---------------------------------------------------------------------------
  it('8. should reject admin login portal attempting to authenticate citizen or department account', async () => {
    // Citizen account on admin portal
    const resCitOnAdmin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: CITIZEN_EMAIL,
        password: CITIZEN_PASS,
        portal: 'admin',
      }),
    });
    assert.equal(resCitOnAdmin.status, 401);
    const bodyCitOnAdmin = await resCitOnAdmin.json();
    assert.equal(bodyCitOnAdmin.token, undefined);
    assert.match(bodyCitOnAdmin.error, /Admin portal access/i);

    // Department account on admin portal
    const resDeptOnAdmin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: DEPT_EMAIL,
        password: DEPT_PASS,
        portal: 'admin',
      }),
    });
    assert.equal(resDeptOnAdmin.status, 401);
    const bodyDeptOnAdmin = await resDeptOnAdmin.json();
    assert.equal(bodyDeptOnAdmin.token, undefined);
    assert.match(bodyDeptOnAdmin.error, /Admin portal access/i);
  });

  // ---------------------------------------------------------------------------
  // 9. Public signup cannot assign privileged roles
  // ---------------------------------------------------------------------------
  it('9. should strictly forbid public registration from claiming admin, department, or command roles with 403', async () => {
    const maliciousPayloads = [
      { name: 'Fake Admin', email: `fakeadmin_${SUITE_ID}@test.org`, password: 'Password123!', role: 'admin' },
      { name: 'Fake Dept', email: `fakedept_${SUITE_ID}@test.org`, password: 'Password123!', role: 'department', department: 'health' },
      { name: 'Fake Cmd', email: `fakecmd_${SUITE_ID}@test.org`, password: 'Password123!', role: 'command_center' },
      { name: 'Citizen With Dept', email: `citdept_${SUITE_ID}@test.org`, password: 'Password123!', department: 'supply' },
    ];

    for (const payload of maliciousPayloads) {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 403, `Must reject privileged role ${payload.role || payload.department}`);
      const body = await res.json();
      assert.match(body.error, /restricted to citizen accounts only/i);
    }
  });

  // ---------------------------------------------------------------------------
  // 10. Citizen access to admin endpoints returns 403
  // ---------------------------------------------------------------------------
  it('10. should return 403 Forbidden when citizen token attempts admin-only endpoint', async () => {
    // Attempting to run What-If simulation
    const resSim = await fetch(`${baseUrl}/api/simulation/run`, {
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
    assert.equal(resSim.status, 403);

    // Attempting to create disaster
    const resDis = await fetch(`${baseUrl}/api/disasters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        name: 'Unauthorized Citizen Flood',
        type: 'flood',
        region: 'Assam',
      }),
    });
    assert.equal(resDis.status, 403);
  });

  // ---------------------------------------------------------------------------
  // 11. Department access to admin-only endpoints returns 403
  // ---------------------------------------------------------------------------
  it('11. should return 403 Forbidden when department token attempts admin-only endpoints', async () => {
    // Department user attempting disaster creation
    const resDis = await fetch(`${baseUrl}/api/disasters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${departmentToken}`,
      },
      body: JSON.stringify({
        name: 'Dept Unauthorized Disaster',
        type: 'flood',
        region: 'Assam',
      }),
    });
    assert.equal(resDis.status, 403);

    // Department user attempting response plan approval (Module 8)
    const resApprove = await fetch(`${baseUrl}/api/recommendations/rec-zone-a-supply-01/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${departmentToken}`,
      },
      body: JSON.stringify({
        officer_notes: 'Unauthorized department approval attempt',
      }),
    });
    assert.equal(resApprove.status, 403);
  });

  // ---------------------------------------------------------------------------
  // 12. Unauthenticated protected API access is rejected (401)
  // ---------------------------------------------------------------------------
  it('12. should reject unauthenticated requests to protected API endpoints with 401', async () => {
    const resMe = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(resMe.status, 401);

    const resSim = await fetch(`${baseUrl}/api/simulation/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone_id: 'zone-a', scenario_type: 'fleet_reduction' }),
    });
    assert.equal(resSim.status, 401);

    const resDis = await fetch(`${baseUrl}/api/disasters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauth Flood', type: 'flood', region: 'Assam' }),
    });
    assert.equal(resDis.status, 401);
  });

  // ---------------------------------------------------------------------------
  // 13. Token identity verification via GET /api/auth/me
  // ---------------------------------------------------------------------------
  it('13. should verify token identity accurately via GET /api/auth/me for all roles', async () => {
    // Citizen
    const resCitMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${citizenToken}` },
    });
    assert.equal(resCitMe.status, 200);
    const bodyCitMe = await resCitMe.json();
    assert.equal(bodyCitMe.user.role, 'citizen');
    assert.equal(bodyCitMe.user.department, null);

    // Department
    const resDeptMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${departmentToken}` },
    });
    assert.equal(resDeptMe.status, 200);
    const bodyDeptMe = await resDeptMe.json();
    assert.equal(bodyDeptMe.user.role, 'department');
    assert.equal(bodyDeptMe.user.department, 'rescue');

    // Admin
    const resAdminMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(resAdminMe.status, 200);
    const bodyAdminMe = await resAdminMe.json();
    assert.equal(bodyAdminMe.user.role, 'admin');
  });

  // ---------------------------------------------------------------------------
  // 14. Backward Compatibility for Legacy Logins Without Target Portal
  // ---------------------------------------------------------------------------
  it('14. should preserve legacy login behavior when target portal is not specified', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: CITIZEN_EMAIL,
        password: CITIZEN_PASS,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.user.role, 'citizen');
  });

  // ---------------------------------------------------------------------------
  // 15. Existing Users and Role Permissions Continue to Work
  // ---------------------------------------------------------------------------
  it('15. should authenticate canonical demo accounts and uphold their existing permissions', async () => {
    // Canonical citizen demo account
    const resDemoCit = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'citizen@relief.internal',
        password: 'Password123!',
        portal: 'citizen',
      }),
    });
    assert.equal(resDemoCit.status, 200);
    const bodyDemoCit = await resDemoCit.json();
    assert.equal(bodyDemoCit.user.role, 'citizen');

    // Canonical admin demo account
    const resDemoAdmin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@relief.internal',
        password: 'Password123!',
        portal: 'admin',
      }),
    });
    assert.equal(resDemoAdmin.status, 200);
    const bodyDemoAdmin = await resDemoAdmin.json();
    assert.equal(bodyDemoAdmin.user.role, 'admin');
  });
});
