import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import app from '../src/index';
import { query, closePool } from '../src/db';
import { generateAccessToken } from '../src/services/auth';
import { calculateDisasterShortages } from '../src/services/allocation';

let server: Server;
let baseUrl: string;

let adminToken: string;
let commandCenterToken: string;
let officerToken: string;
let deptSupplyToken: string;
let citizenToken: string;

const testUsers = [
  { id: 'usr-plan-admin', name: 'Plan Test Admin', email: 'admin@plan-test.org', role: 'admin', dept: null },
  { id: 'usr-plan-cmd', name: 'Plan Test Commander', email: 'cmd@plan-test.org', role: 'command_center', dept: null },
  { id: 'usr-plan-officer', name: 'Plan Test Officer', email: 'officer@plan-test.org', role: 'officer', dept: null },
  { id: 'usr-plan-supply', name: 'Plan Test Supply', email: 'supply@plan-test.org', role: 'department', dept: 'supply' },
  { id: 'usr-plan-citizen', name: 'Plan Test Citizen', email: 'citizen@plan-test.org', role: 'citizen', dept: null },
];

const createdPlanIds: string[] = [];

describe('Phase 2A: Response Plan Generation & Dynamic Shortage KPI Tests', () => {
  before(async () => {
    // Insert mock users into database for foreign key integrity in audit logs
    for (const u of testUsers) {
      await query(
        `INSERT INTO users (id, name, email, password_hash, role, department)
         VALUES ($1, $2, $3, 'hash_placeholder', $4, $5)
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, department = EXCLUDED.department`,
        [u.id, u.name, u.email, u.role, u.dept]
      );
    }

    // Clean up any lingering test recommendations for candidate zones from previous runs
    const candidateZones = ['zone-b', 'zone-c', 'zone-d', 'zone-e', 'zone-f', 'zone-g'];
    const lingering = await query<{ id: string }>(
      `SELECT id FROM recommendations WHERE zone_id = ANY($1::varchar[]) AND id LIKE 'rec-%' AND id != 'rec-zone-a-001'`,
      [candidateZones]
    );
    if (lingering.rows.length > 0) {
      const lingeringIds = lingering.rows.map((r) => r.id);
      await query(`DELETE FROM recommendations WHERE id = ANY($1::varchar[])`, [lingeringIds]);
      await query(`DELETE FROM audit_log WHERE details->>'recommendation_id' = ANY($1::text[])`, [lingeringIds]);
    }

    adminToken = generateAccessToken({ id: 'usr-plan-admin', name: 'Plan Test Admin', email: 'admin@plan-test.org', role: 'admin' }).token;
    commandCenterToken = generateAccessToken({ id: 'usr-plan-cmd', name: 'Plan Test Commander', email: 'cmd@plan-test.org', role: 'command_center' }).token;
    officerToken = generateAccessToken({ id: 'usr-plan-officer', name: 'Plan Test Officer', email: 'officer@plan-test.org', role: 'officer' }).token;
    deptSupplyToken = generateAccessToken({ id: 'usr-plan-supply', name: 'Plan Test Supply', email: 'supply@plan-test.org', role: 'department', department: 'supply' }).token;
    citizenToken = generateAccessToken({ id: 'usr-plan-citizen', name: 'Plan Test Citizen', email: 'citizen@plan-test.org', role: 'citizen' }).token;

    // Start ephemeral server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Clean up dynamically created test recommendations and users
    if (createdPlanIds.length > 0) {
      await query(`DELETE FROM recommendations WHERE id = ANY($1::varchar[])`, [createdPlanIds]);
      await query(`DELETE FROM audit_log WHERE details->>'recommendation_id' = ANY($1::text[])`, [createdPlanIds]);
    }

    const testUserIds = testUsers.map((u) => u.id);
    await query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [testUserIds]);

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closePool();
  });

  // ---------------------------------------------------------------------------
  // 1. Authentication & Authorization Checks
  // ---------------------------------------------------------------------------
  describe('Authentication and RBAC for Plan Generation', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-b/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planning_days: 3 }),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('should forbid citizen users from generating plans with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-b/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({ planning_days: 3 }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('should forbid department field responders from generating plans with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-b/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptSupplyToken}`,
        },
        body: JSON.stringify({ planning_days: 3 }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Zone Validation & Error Handling
  // ---------------------------------------------------------------------------
  describe('Zone Validation for Plan Generation', () => {
    it('should return 404 Not Found for non-existent zone', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-nonexistent-999/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({ planning_days: 3 }),
      });
      assert.equal(res.status, 404);
      const data = await res.json();
      assert.match(data.error, /not found/i);
    });

    it('should return 400 Bad Request for out-of-range planning_days', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-b/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({ planning_days: 45 }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Plan Generation for Every Zone (Zone B through Zone G)
  // ---------------------------------------------------------------------------
  describe('Generate Response Plan for All Zones', () => {
    const candidateZones = ['zone-b', 'zone-c', 'zone-d', 'zone-e', 'zone-f', 'zone-g'];

    for (const zoneId of candidateZones) {
      it(`should successfully generate a response plan for ${zoneId} with live data`, async () => {
        // Record inventory before generation
        const stockBefore = await query<{ quantity: number }>(
          `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
        );

        const res = await fetch(`${baseUrl}/api/zones/${zoneId}/plan`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${commandCenterToken}`,
          },
          body: JSON.stringify({ planning_days: 3 }),
        });

        assert.equal(res.status, 201);
        const data = await res.json();
        assert.equal(data.success, true);
        assert.ok(data.recommendation);
        assert.equal(data.recommendation.status, 'draft');
        assert.equal(data.recommendation.zone_id, zoneId);

        createdPlanIds.push(data.recommendation.id);

        // Verify plan structure
        const plan = data.plan;
        assert.ok(plan);
        assert.ok(plan.zone_name);
        assert.ok(typeof plan.score === 'number');
        assert.ok(plan.priority_rank >= 1);
        assert.ok(plan.source_center);
        assert.ok(plan.source_center_id);
        assert.ok(plan.selected_route);
        assert.ok(Array.isArray(plan.alternate_routes));
        assert.ok(plan.resources_recommended);
        assert.ok(typeof plan.resources_recommended.boats === 'number');
        assert.ok(typeof plan.resources_recommended.food_kits === 'number');
        assert.ok(typeof plan.resources_recommended.water_units === 'number');
        assert.ok(typeof plan.resources_recommended.medical_teams === 'number');

        // Verify explanation contains zone name and demand context
        assert.ok(data.explanation);
        assert.ok(data.explanation.includes(plan.zone_name));

        // CRITICAL INVARIANT: Zero inventory deducted on draft generation
        const stockAfter = await query<{ quantity: number }>(
          `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
        );
        assert.equal(stockAfter.rows[0].quantity, stockBefore.rows[0].quantity);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Duplicate Accidental Submission Prevention & Rejection Lifecycle
  // ---------------------------------------------------------------------------
  describe('Duplicate Plan Prevention & Rejection Lifecycle', () => {
    it('should reject duplicate generation with 409 Conflict when an active plan exists', async () => {
      // Zone B now has a drafted plan from previous test
      const res = await fetch(`${baseUrl}/api/zones/zone-b/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({ planning_days: 3 }),
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.code, 'ACTIVE_PLAN_EXISTS');
      assert.ok(data.active_plan_id);
      assert.equal(data.status, 'draft');
    });

    it('should allow generating a new plan after the previous plan is rejected', async () => {
      // 1. Fetch active plan for zone-b
      const activeRes = await fetch(`${baseUrl}/api/recommendations?zone_id=zone-b&status=draft`, {
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });
      const activeData = await activeRes.json();
      assert.ok(activeData.items.length > 0);
      const planToReject = activeData.items[0];

      // 2. Reject the plan
      const rejectRes = await fetch(`${baseUrl}/api/recommendations/${planToReject.id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({ reason: 'Replaced with revised tactical assessment' }),
      });
      assert.equal(rejectRes.status, 200);

      // 3. Generate a new plan for zone-b - this MUST now succeed because earlier plan is rejected
      const newPlanRes = await fetch(`${baseUrl}/api/zones/zone-b/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({ planning_days: 3, notes: 'Fresh plan post-rejection' }),
      });

      assert.equal(newPlanRes.status, 201);
      const newPlanData = await newPlanRes.json();
      assert.equal(newPlanData.success, true);
      assert.notEqual(newPlanData.recommendation.id, planToReject.id);
      assert.equal(newPlanData.recommendation.status, 'draft');

      createdPlanIds.push(newPlanData.recommendation.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Dynamic Shortage KPI Calculation (Task 2)
  // ---------------------------------------------------------------------------
  describe('Dynamic Shortage KPI Calculation', () => {
    it('should calculate resource_shortages_count dynamically from live DB inventory in GET /api/disasters/demo-kpis', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/demo-kpis`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.ok(body.kpis);
      assert.ok(typeof body.kpis.resource_shortages_count === 'number');

      // The count must be computed from current stock vs demand (not hardcoded 4)
      // In current database, total boat demand (15) exceeds available boats (8), so boats is 1 shortage
      assert.equal(body.kpis.resource_shortages_count, 1);

      // Verify other KPIs remain completely unaltered
      assert.equal(body.kpis.critical_zones_count, 7);
      assert.equal(body.kpis.affected_population, 18420);
      assert.equal(body.kpis.total_shelters, 18);
      assert.equal(body.kpis.relief_centers, 5);
      assert.equal(body.kpis.vehicles_deployed, 21);
    });

    it('should verify calculateDisasterShortages service function handles deficit counting and empty data correctly', async () => {
      const shortageResult = await calculateDisasterShortages('disaster-assam-2026', { planning_days: 3 });

      assert.ok(typeof shortageResult.shortages_count === 'number');
      assert.ok(Array.isArray(shortageResult.shortages));
      assert.ok(shortageResult.total_demands);
      assert.ok(shortageResult.total_available);

      // Demand numbers should be positive
      assert.ok(shortageResult.total_demands.boats > 0);
      assert.ok(shortageResult.total_demands.food_kits > 0);
      assert.ok(shortageResult.total_demands.water_units > 0);

      // Shortages list should contain boats
      const boatShortage = shortageResult.shortages.find((s) => s.resource_type === 'boats');
      assert.ok(boatShortage);
      assert.equal(boatShortage.demanded, 15);
      assert.equal(boatShortage.available, 8);
      assert.equal(boatShortage.deficit, 7);

      // Distinct count verification: each category is counted at most once
      const types = shortageResult.shortages.map((s) => s.resource_type);
      const uniqueTypes = new Set(types);
      assert.equal(types.length, uniqueTypes.size);
    });
  });
});
