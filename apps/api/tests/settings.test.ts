/**
 * RELIEF-OS Phase 1 Security Hardening & Configurable Settings Regression Tests
 * 
 * Verifies:
 * Task A.1: Contact privacy & redaction on single/bulk reports for anonymous, citizen, and operational roles.
 * Task A.2: JWT secret safety in production (fatal startup rejection on missing/insecure secrets).
 * Task B: Configurable priority scoring weights:
 *         - GET /api/settings/weights (defaults, active configuration)
 *         - PUT /api/settings/weights (admin-only RBAC, 100% total validation, database persistence, audit logging)
 *         - POST /api/settings/weights/reset (restore canonical defaults)
 *         - Priority engine calculations and explanations under active weights
 *         - GET /api/settings system configuration overview
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import bcrypt from 'bcryptjs';
import app from '../src/index';
import { query, closePool } from '../src/db';
import {
  validateJwtConfigAtStartup,
  getJwtSecret,
  AuthError,
} from '../src/services/auth';
import {
  calculatePriorityScore,
  getActivePriorityWeights,
  validateAndNormalizeWeights,
  CANONICAL_PRIORITY_WEIGHTS,
} from '../src/services/priority';
import { redactContactNumber, OPERATIONAL_ROLES } from '../src/routes/reports';

let server: Server;
let baseUrl: string;

const TEST_ADMIN_ID = 'usr-admin-phase1-sec';
const TEST_ADMIN_EMAIL = 'admin-phase1-sec@relief.internal';
const TEST_ADMIN_PASS = 'AdminSecPass2026!';

const TEST_HEALTH_ID = 'usr-health-phase1-sec';
const TEST_HEALTH_EMAIL = 'health-phase1-sec@relief.internal';
const TEST_HEALTH_PASS = 'HealthSecPass2026!';

const TEST_CITIZEN_ID = 'usr-citizen-phase1-sec';
const TEST_CITIZEN_EMAIL = 'citizen-phase1-sec@relief.internal';
const TEST_CITIZEN_PASS = 'CitizenSecPass2026!';

let adminToken: string;
let healthToken: string;
let citizenToken: string;

const createdReportIds: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const adminHash = await bcrypt.hash(TEST_ADMIN_PASS, 10);
  const healthHash = await bcrypt.hash(TEST_HEALTH_PASS, 10);
  const citizenHash = await bcrypt.hash(TEST_CITIZEN_PASS, 10);

  // Seed test accounts with explicit roles
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, department)
     VALUES 
       ($1, 'Phase 1 Admin User', $2, $3, 'admin', NULL),
       ($4, 'Phase 1 Health Responder', $5, $6, 'department', 'health'),
       ($7, 'Phase 1 Citizen User', $8, $9, 'citizen', NULL)
     ON CONFLICT (email) DO UPDATE 
     SET password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         department = EXCLUDED.department`,
    [
      TEST_ADMIN_ID, TEST_ADMIN_EMAIL, adminHash,
      TEST_HEALTH_ID, TEST_HEALTH_EMAIL, healthHash,
      TEST_CITIZEN_ID, TEST_CITIZEN_EMAIL, citizenHash,
    ]
  );

  // Authenticate and acquire tokens
  const aLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASS }),
  });
  assert.equal(aLogin.status, 200);
  adminToken = (await aLogin.json()).token;

  const hLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_HEALTH_EMAIL, password: TEST_HEALTH_PASS }),
  });
  assert.equal(hLogin.status, 200);
  healthToken = (await hLogin.json()).token;

  const cLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_CITIZEN_EMAIL, password: TEST_CITIZEN_PASS }),
  });
  assert.equal(cLogin.status, 200);
  citizenToken = (await cLogin.json()).token;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));

  // Reset scoring weights to PRD canonical defaults in DB
  await query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('priority_scoring_weights', $1, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(CANONICAL_PRIORITY_WEIGHTS)]
  );

  // Clean up created reports
  if (createdReportIds.length > 0) {
    await query(
      `DELETE FROM reports WHERE id = ANY($1::varchar[])`,
      [createdReportIds]
    );
  }

  // Clean up test users and audit logs
  await query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
    TEST_ADMIN_ID,
    TEST_HEALTH_ID,
    TEST_CITIZEN_ID,
  ]);
  await query("DELETE FROM audit_log WHERE user_id = $1", [TEST_ADMIN_ID]);
  await closePool();
});

describe('Task A: Security Hardening Regression Tests', () => {
  describe('1. Citizen Contact Number Privacy & Redaction', () => {
    let testReportId: string;
    const RAW_PHONE = '+91 98765 43210';

    it('should create a report with a contact number and redact it in public response', async () => {
      const res = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Flash flood water entering ground floor near Kali Mandir',
          lat: 26.18,
          lng: 91.75,
          location_name: 'Guwahati Sector 4',
          disaster_id: 'disaster-assam-2026',
          severity: 'high',
          category: 'flood_rescue',
          people_affected: 8,
          medical_need: true,
          contact_number: RAW_PHONE,
          is_simulated: true,
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      testReportId = data.id;
      createdReportIds.push(testReportId);

      // Submitter receives confirmation of their submitted report
      assert.equal(data.contact_number, RAW_PHONE);
    });

    it('should return null contact_number when anonymous user fetches single report', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${testReportId}`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.contact_number, null, 'Anonymous GET /api/reports/:id must return contact_number: null');
    });

    it('should return null contact_number when authenticated citizen fetches single report', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${testReportId}`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.contact_number, null, 'Citizen GET /api/reports/:id must return contact_number: null');
    });

    it('should return plaintext contact_number when authorized health responder fetches report', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${testReportId}`, {
        headers: { Authorization: `Bearer ${healthToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(
        data.contact_number,
        RAW_PHONE,
        'Department responder must receive plaintext contact_number'
      );
    });

    it('should return plaintext contact_number when admin fetches report', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${testReportId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.contact_number, RAW_PHONE, 'Admin must receive plaintext contact_number');
    });

    it('should reject bulk reports from unauthenticated or citizen callers', async () => {
      const bulkPayload = {
        reports: [
          {
            description: 'Simulated citizen rescue call',
            lat: 26.2,
            lng: 91.8,
            contact_number: '+91 99999 88888',
          },
        ],
      };

      // Unauthenticated
      const anonRes = await fetch(`${baseUrl}/api/reports/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkPayload),
      });
      assert.equal(anonRes.status, 401);

      // Citizen
      const citRes = await fetch(`${baseUrl}/api/reports/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify(bulkPayload),
      });
      assert.equal(citRes.status, 403);
    });

    it('should allow admin to bulk insert reports without logging sensitive contact numbers in audit log', async () => {
      const sensitivePhone = '+91 91234 56789';
      const bulkRes = await fetch(`${baseUrl}/api/reports/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          reports: [
            {
              description: 'Bulk ingested emergency report A',
              lat: 26.15,
              lng: 91.72,
              severity: 'critical',
              category: 'water_rescue',
              people_affected: 15,
              medical_need: true,
              contact_number: sensitivePhone,
              is_simulated: true,
            },
            {
              description: 'Bulk ingested emergency report B',
              lat: 26.16,
              lng: 91.73,
              severity: 'high',
              category: 'food_shortage',
              people_affected: 40,
              medical_need: false,
              contact_number: '+91 98765 00000',
              is_simulated: true,
            },
          ],
        }),
      });

      assert.equal(bulkRes.status, 201);
      const bulkData = await bulkRes.json();
      assert.equal(bulkData.success, true);
      assert.equal(bulkData.inserted_count, 2);
      createdReportIds.push(...bulkData.report_ids);

      // Verify audit_log entry exists and DOES NOT contain sensitive phone numbers
      const auditRes = await query<{ details: string }>(
        `SELECT details FROM audit_log WHERE action = 'REPORTS_BULK_INGESTED' AND user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [TEST_ADMIN_ID]
      );
      assert.equal(auditRes.rows.length, 1);
      const auditDetails = JSON.stringify(auditRes.rows[0].details);
      assert.equal(auditDetails.includes(sensitivePhone), false, 'Audit log must never leak raw contact numbers');
    });

    it('helper redactContactNumber should consistently apply operational role checks', () => {
      const raw = '+91 12345 67890';
      // Operational roles
      for (const opRole of OPERATIONAL_ROLES) {
        assert.equal(redactContactNumber(raw, { role: opRole }), raw);
      }
      // Non-operational roles
      assert.equal(redactContactNumber(raw, { role: 'citizen' }), null);
      assert.equal(redactContactNumber(raw, { role: 'public' }), null);
      assert.equal(redactContactNumber(raw, null), null);
      assert.equal(redactContactNumber(raw, undefined), null);
    });
  });

  describe('2. JWT Secret Production Safety', () => {
    it('should throw fatal error on validateJwtConfigAtStartup if NODE_ENV=production and JWT_SECRET is missing', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_SECRET;

        assert.throws(
          () => validateJwtConfigAtStartup(),
          /FATAL SECURITY CONFIGURATION ERROR.*JWT_SECRET must be explicitly set/
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalSecret !== undefined) process.env.JWT_SECRET = originalSecret;
      }
    });

    it('should throw fatal error on validateJwtConfigAtStartup if NODE_ENV=production and JWT_SECRET is dev-secret or < 32 chars', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = 'production';

        // dev-secret
        process.env.JWT_SECRET = 'dev-secret';
        assert.throws(
          () => validateJwtConfigAtStartup(),
          /Insecure or default JWT_SECRET detected/
        );

        // too short
        process.env.JWT_SECRET = 'short_insecure_secret_123';
        assert.throws(
          () => validateJwtConfigAtStartup(),
          /Insecure or default JWT_SECRET detected.*Minimum 32 characters/
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalSecret !== undefined) process.env.JWT_SECRET = originalSecret;
      }
    });

    it('should pass validateJwtConfigAtStartup if NODE_ENV=production and a secure >=32 char secret is provided', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        process.env.JWT_SECRET = 'a_very_strong_production_jwt_secret_with_sufficient_entropy_64chars';

        assert.doesNotThrow(() => validateJwtConfigAtStartup());
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalSecret !== undefined) process.env.JWT_SECRET = originalSecret;
      }
    });

    it('getJwtSecret should throw AuthError in production when secret is missing', () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_SECRET;

        assert.throws(() => getJwtSecret(), (err: unknown) => {
          return err instanceof AuthError && err.code === 'JWT_SECRET_MISSING';
        });
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalSecret !== undefined) process.env.JWT_SECRET = originalSecret;
      }
    });
  });
});

describe('Task B: Configurable Priority Weights Engine & Settings API', () => {
  it('GET /api/settings/weights should return active scoring weights (canonical defaults initially)', async () => {
    const res = await fetch(`${baseUrl}/api/settings/weights`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(typeof data.weights, 'object');
    assert.equal(data.weights.w_population, 0.25);
    assert.equal(data.weights.w_severity, 0.20);
    assert.equal(data.weights.w_medical, 0.20);
    assert.equal(data.weights.w_shortage, 0.15);
    assert.equal(data.weights.w_accessibility, 0.10);
    assert.equal(data.weights.w_vulnerability, 0.10);

    assert.equal(data.percentages.population, 25);
    assert.equal(data.percentages.severity, 20);
    assert.equal(data.percentages.medical, 20);
    assert.equal(data.percentages.shortage, 15);
    assert.equal(data.percentages.accessibility, 10);
    assert.equal(data.percentages.vulnerability, 10);

    const sumPercentages = Object.values(data.percentages).reduce((a: any, b: any) => a + b, 0);
    assert.equal(sumPercentages, 100);
  });

  it('PUT /api/settings/weights should reject unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/settings/weights`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        w_population: 25,
        w_severity: 20,
        w_medical: 20,
        w_shortage: 15,
        w_accessibility: 10,
        w_vulnerability: 10,
      }),
    });
    assert.equal(res.status, 401);
  });

  it('PUT /api/settings/weights should reject citizen with 403', async () => {
    const res = await fetch(`${baseUrl}/api/settings/weights`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify({
        w_population: 25,
        w_severity: 20,
        w_medical: 20,
        w_shortage: 15,
        w_accessibility: 10,
        w_vulnerability: 10,
      }),
    });
    assert.equal(res.status, 403);
  });

  it('PUT /api/settings/weights should reject department responder with 403', async () => {
    const res = await fetch(`${baseUrl}/api/settings/weights`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${healthToken}`,
      },
      body: JSON.stringify({
        w_population: 25,
        w_severity: 20,
        w_medical: 20,
        w_shortage: 15,
        w_accessibility: 10,
        w_vulnerability: 10,
      }),
    });
    assert.equal(res.status, 403);
  });

  it('PUT /api/settings/weights should reject invalid weights configuration (sum != 100%)', async () => {
    // Sum = 90%
    const resUnder = await fetch(`${baseUrl}/api/settings/weights`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        w_population: 20,
        w_severity: 20,
        w_medical: 20,
        w_shortage: 10,
        w_accessibility: 10,
        w_vulnerability: 10,
      }),
    });
    assert.equal(resUnder.status, 400);

    // Sum = 110%
    const resOver = await fetch(`${baseUrl}/api/settings/weights`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        w_population: 35,
        w_severity: 20,
        w_medical: 20,
        w_shortage: 15,
        w_accessibility: 10,
        w_vulnerability: 10,
      }),
    });
    assert.equal(resOver.status, 400);
  });

  it('PUT /api/settings/weights should reject negative or non-finite weights', async () => {
    const resNeg = await fetch(`${baseUrl}/api/settings/weights`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        w_population: -10,
        w_severity: 30,
        w_medical: 30,
        w_shortage: 20,
        w_accessibility: 15,
        w_vulnerability: 15,
      }),
    });
    assert.equal(resNeg.status, 400);
  });

  it('PUT /api/settings/weights should update weights when called by admin and persist to database', async () => {
    // Custom weights totaling 100%: Pop=30, Sev=20, Med=20, Short=10, Acc=10, Vuln=10
    const updateRes = await fetch(`${baseUrl}/api/settings/weights`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        w_population: 30,
        w_severity: 20,
        w_medical: 20,
        w_shortage: 10,
        w_accessibility: 10,
        w_vulnerability: 10,
      }),
    });

    assert.equal(updateRes.status, 200);
    const data = await updateRes.json();

    assert.equal(data.weights.w_population, 0.30);
    assert.equal(data.weights.w_shortage, 0.10);
    assert.equal(data.percentages.population, 30);
    assert.equal(data.percentages.shortage, 10);
    assert.equal(data.is_default, false);

    // Verify database settings table directly
    const dbRes = await query<{ value: any }>(
      `SELECT value FROM settings WHERE key = 'priority_scoring_weights'`
    );
    assert.equal(dbRes.rows.length, 1);
    const stored = dbRes.rows[0].value;
    assert.equal(stored.w_population, 0.3);
    assert.equal(stored.w_shortage, 0.1);

    // Verify audit log has recorded change with user attribution
    const auditRes = await query<{ action: string; details: any }>(
      `SELECT action, details FROM audit_log WHERE action = 'PRIORITY_WEIGHTS_UPDATED' AND user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [TEST_ADMIN_ID]
    );
    assert.equal(auditRes.rows.length, 1);
    assert.equal(auditRes.rows[0].action, 'PRIORITY_WEIGHTS_UPDATED');
  });

  it('GET /api/settings/weights should return the newly updated active weights', async () => {
    const res = await fetch(`${baseUrl}/api/settings/weights`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.weights.w_population, 0.30);
    assert.equal(data.percentages.population, 30);
    assert.equal(data.is_default, false);
  });

  it('Priority engine should use custom active weights in score calculation and factor breakdown', async () => {
    const active = await getActivePriorityWeights();
    assert.equal(active.weights.w_population, 0.30);

    // Zone A canonical inputs
    const zoneAInputs = {
      population_impact: 1.00,
      severity: 0.95,
      medical_risk: 0.90,
      resource_shortage: 0.90,
      accessibility_difficulty: 0.90,
      vulnerability: 0.95,
    };

    // Calculate using active weights
    const result = calculatePriorityScore(zoneAInputs, active.weights);
    // Pop: 1.00 * 0.30 = 0.30
    // Sev: 0.95 * 0.20 = 0.19
    // Med: 0.90 * 0.20 = 0.18
    // Short: 0.90 * 0.10 = 0.09
    // Acc: 0.90 * 0.10 = 0.09
    // Vuln: 0.95 * 0.10 = 0.095
    // Sum = 0.945 -> 95
    assert.equal(result.priority_score, 95);
    assert.equal(result.band, 'Critical');
    assert.equal(result.factors.population.weight, 0.30);
    assert.equal(result.factors.shortage.weight, 0.10);
    assert.equal(result.explanation.includes('under active scoring weights'), true);
  });

  it('POST /api/settings/weights/reset should restore canonical defaults when requested by admin', async () => {
    const res = await fetch(`${baseUrl}/api/settings/weights/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });

    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.weights.w_population, 0.25);
    assert.equal(data.weights.w_shortage, 0.15);
    assert.equal(data.percentages.population, 25);
    assert.equal(data.percentages.shortage, 15);
    assert.equal(data.is_default, true);

    // Verify canonical defaults reproduce canonical Zone A score 94
    const zoneAInputs = {
      population_impact: 1.00,
      severity: 0.95,
      medical_risk: 0.90,
      resource_shortage: 0.90,
      accessibility_difficulty: 0.90,
      vulnerability: 0.95,
    };
    const defaultResult = calculatePriorityScore(zoneAInputs, CANONICAL_PRIORITY_WEIGHTS);
    assert.equal(defaultResult.priority_score, 94);
    assert.equal(defaultResult.band, 'Critical');
  });

  it('GET /api/settings should return complete system settings including demand multipliers', async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(typeof data.priority_weights, 'object');
    assert.equal(typeof data.demand_parameters, 'object');
    assert.equal(data.demand_parameters.planning_days, 3);
    assert.equal(data.demand_parameters.food_kits_per_person_ratio, 0.4338);
    assert.equal(data.demand_parameters.water_units_per_person_ratio, 0.3414);
    assert.equal(data.demand_parameters.stranded_people_per_boat, 720);
    assert.equal(data.demand_parameters.people_per_medical_team, 3500);
    assert.equal(data.demand_parameters.medical_rounding_mode, 'round');
  });
});
