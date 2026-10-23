import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import app from '../src/index';
import { query } from '../src/db';
import { generateAccessToken } from '../src/services/auth';

let server: Server;
let baseUrl: string;

let adminToken: string;
let commandCenterToken: string;
let officerToken: string;
let deptSupplyToken: string;
let citizenToken: string;

const testUsers = [
  { id: 'usr-life-admin', name: 'Lifecycle Admin', email: 'admin@test-lifecycle.org', role: 'admin', dept: null },
  { id: 'usr-life-cmd', name: 'Lifecycle Commander', email: 'cmd@test-lifecycle.org', role: 'command_center', dept: null },
  { id: 'usr-life-officer', name: 'Lifecycle Officer', email: 'officer@test-lifecycle.org', role: 'officer', dept: null },
  { id: 'usr-life-supply', name: 'Lifecycle Supply', email: 'supply@test-lifecycle.org', role: 'department', dept: 'supply' },
  { id: 'usr-life-citizen', name: 'Lifecycle Citizen', email: 'citizen@test-lifecycle.org', role: 'citizen', dept: null },
];

async function resetStockAndAllocations() {
  await query(`DELETE FROM allocations WHERE plan_id LIKE 'rec-test-%' OR plan_id LIKE 'rec-sim-%' OR plan_id LIKE 'rec-realloc-%'`);
  await query(`UPDATE resources SET quantity = 2500 WHERE center_id = 'center-3' AND resource_type = 'food_kits'`);
  await query(`UPDATE resources SET quantity = 2000 WHERE center_id = 'center-3' AND resource_type = 'water_units'`);
  await query(`UPDATE resources SET quantity = 4 WHERE center_id = 'center-3' AND resource_type = 'boats'`);
  await query(`UPDATE resources SET quantity = 5 WHERE center_id = 'center-3' AND resource_type = 'medical_teams'`);
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Seed test users
  for (const u of testUsers) {
    await query(
      `INSERT INTO users (id, name, email, password_hash, role, department)
       VALUES ($1, $2, $3, '$2b$10$abcdefghijklmnopqrstuu', $4, $5)
       ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, department = EXCLUDED.department`,
      [u.id, u.name, u.email, u.role, u.dept]
    );
  }

  adminToken = generateAccessToken({ id: 'usr-life-admin', name: 'Lifecycle Admin', email: 'admin@test-lifecycle.org', role: 'admin' }).token;
  commandCenterToken = generateAccessToken({ id: 'usr-life-cmd', name: 'Lifecycle Commander', email: 'cmd@test-lifecycle.org', role: 'command_center' }).token;
  officerToken = generateAccessToken({ id: 'usr-life-officer', name: 'Lifecycle Officer', email: 'officer@test-lifecycle.org', role: 'officer' }).token;
  deptSupplyToken = generateAccessToken({ id: 'usr-life-supply', name: 'Lifecycle Supply', email: 'supply@test-lifecycle.org', role: 'department', department: 'supply' }).token;
  citizenToken = generateAccessToken({ id: 'usr-life-citizen', name: 'Lifecycle Citizen', email: 'citizen@test-lifecycle.org', role: 'citizen' }).token;

  // Clean slate before test execution
  await query(`DELETE FROM recommendations WHERE id LIKE 'rec-test-%' OR id LIKE 'rec-sim-%' OR id LIKE 'rec-realloc-%'`);
  await query(`DELETE FROM audit_log WHERE user_id LIKE 'usr-life-%'`);
  await resetStockAndAllocations();
});

after(async () => {
  // Clean up any test recommendations and allocations created
  await query(`DELETE FROM recommendations WHERE id LIKE 'rec-test-%' OR id LIKE 'rec-sim-%' OR id LIKE 'rec-realloc-%'`);
  await query(`DELETE FROM audit_log WHERE user_id LIKE 'usr-life-%'`);
  await query(`DELETE FROM users WHERE id LIKE 'usr-life-%'`);
  await resetStockAndAllocations();

  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('RELIEF-OS Phase 2: Response Plan Lifecycle & Safe Inventory Execution', () => {

  describe('1. Plan Lifecycle State Transitions', () => {
    const planId = 'rec-test-lifecycle-001';

    before(async () => {
      // Seed a clean draft plan for Zone B
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Initial draft recommendation', 'draft', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'draft', plan = EXCLUDED.plan`,
        [
          planId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center: 'Barpeta Relief Base #3',
            source_center_id: 'center-3',
            selected_route: 'Route C',
            resources_recommended: {
              boats: 2,
              food_kits: 100,
              water_units: 200,
              medical_teams: 1,
            },
          }),
        ]
      );
    });

    it('should transition draft -> modified when operator updates proposed quantities', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${planId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resources: {
            boats: 3,
            food_kits: 150,
            water_units: 250,
            medical_teams: 1,
          },
          reason: 'Field recon indicates higher population displacement in sector 2',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.recommendation.status, 'modified');
      assert.equal(data.recommendation.plan.resources_recommended.food_kits, 150);

      // Verify audit log has PLAN_MODIFIED
      const audit = await query(
        `SELECT action, user_id, details FROM audit_log WHERE user_id = $1 AND action = 'PLAN_MODIFIED' ORDER BY created_at DESC LIMIT 1`,
        ['usr-life-officer']
      );
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].user_id, 'usr-life-officer');
      assert.equal(audit.rows[0].details.reason, 'Field recon indicates higher population displacement in sector 2');
    });

    it('should transition modified -> approved upon human authorization without deducting stock', async () => {
      // Check stock before approval
      const stockBefore = await query(
        `SELECT resource_type, quantity FROM resources WHERE center_id = 'center-3'`
      );

      const res = await fetch(`${baseUrl}/api/recommendations/${planId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: 'Authorized for field tasking by District Command' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.recommendation.status, 'approved');
      assert.equal(data.recommendation.approved_by, 'usr-life-cmd');

      // Guarantee ZERO stock was deducted on approval
      const stockAfter = await query(
        `SELECT resource_type, quantity FROM resources WHERE center_id = 'center-3'`
      );
      assert.deepEqual(stockAfter.rows, stockBefore.rows);
    });

    it('should transition approved -> in_transit upon explicit dispatch and deduct stock atomically', async () => {
      const stockBefore = await query(
        `SELECT resource_type, quantity FROM resources WHERE center_id = 'center-3' ORDER BY resource_type`
      );
      const stockMapBefore = new Map(stockBefore.rows.map((r: any) => [r.resource_type, r.quantity]));

      const res = await fetch(`${baseUrl}/api/recommendations/${planId}/dispatch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ execution_notes: 'Convoy Alpha dispatched via Route C' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.recommendation.status, 'in_transit');
      assert.equal(data.recommendation.dispatched_by, 'usr-life-cmd');

      // Verify stock was deducted accurately
      const stockAfter = await query(
        `SELECT resource_type, quantity FROM resources WHERE center_id = 'center-3' ORDER BY resource_type`
      );
      const stockMapAfter = new Map(stockAfter.rows.map((r: any) => [r.resource_type, r.quantity]));

      assert.equal(stockMapAfter.get('food_kits'), stockMapBefore.get('food_kits') - 150);
      assert.equal(stockMapAfter.get('water_units'), stockMapBefore.get('water_units') - 250);

      // Verify allocations row created
      const allocs = await query(`SELECT * FROM allocations WHERE plan_id = $1`, [planId]);
      assert.ok(allocs.rows.length >= 1);
      assert.equal(allocs.rows[0].status, 'in_transit');
    });

    it('should transition in_transit -> delivered upon delivery confirmation', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${planId}/deliver`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: 'Supplies safely received at Shelter #1' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.recommendation.status, 'delivered');
      assert.ok(data.recommendation.completed_at);

      // Verify allocations updated to delivered
      const allocs = await query(`SELECT * FROM allocations WHERE plan_id = $1`, [planId]);
      assert.equal(allocs.rows[0].status, 'delivered');

      // Restore inventory and clean up allocations so other tests stay clean
      await resetStockAndAllocations();
    });
  });

  describe('2. Invalid Transitions and Server-Side Guard Rails', () => {
    const invalidPlanId = 'rec-test-invalid-001';

    before(async () => {
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Draft test plan', 'draft', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'draft'`,
        [
          invalidPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 10 },
          }),
        ]
      );
    });

    it('should reject dispatching a DRAFT plan with 400 (PLAN_NOT_APPROVED)', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${invalidPlanId}/dispatch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /only approved response plans can be dispatched/i);
    });

    it('should reject delivering an unapproved or draft plan with 400', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${invalidPlanId}/deliver`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /only in_transit response plans can be marked delivered/i);
    });

    it('should reject failing a non-dispatched plan with 400', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${invalidPlanId}/fail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ failure_reason: 'Test reason' }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /only in_transit response plans can be marked failed/i);
    });

    it('should reject reallocating a non-failed plan with 400', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${invalidPlanId}/reallocate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /only failed response plans can be reallocated/i);
    });
  });

  describe('3. Plan Modification Feasibility & Validation', () => {
    const modPlanId = 'rec-test-mod-001';

    before(async () => {
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Draft test plan for modification', 'draft', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'draft'`,
        [
          modPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 50 },
          }),
        ]
      );
    });

    it('should reject modification without a reason with 400', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${modPlanId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resources: { food_kits: 100 },
          reason: '   ',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /reason is required/i);
    });

    it('should reject negative resource quantities with 400', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${modPlanId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resources: { food_kits: -20 },
          reason: 'Testing negative input',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /cannot be negative/i);
    });

    it('should reject modifying supplying center to one with a blocked route (Route A)', async () => {
      // Center #1 connects via Route A which is blocked
      const res = await fetch(`${baseUrl}/api/recommendations/${modPlanId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          supplying_center_id: 'center-barpeta-01',
          reason: 'Rerouting attempt to blocked depot',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /route.*blocked|impassable/i);
    });
  });

  describe('4. Safe Inventory Deduction, Rollback & Idempotency', () => {
    it('should atomically roll back and return 409 when inventory is insufficient', async () => {
      const shortPlanId = 'rec-test-shortage-001';

      // Insert approved plan requesting 999,999 food kits (exceeds warehouse stock)
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Huge request', 'approved', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'approved', plan = EXCLUDED.plan`,
        [
          shortPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 999999 },
          }),
        ]
      );

      const stockBefore = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );

      const res = await fetch(`${baseUrl}/api/recommendations/${shortPlanId}/dispatch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.match(data.error, /insufficient.*stock/i);

      // Verify stock was NOT deducted
      const stockAfter = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      assert.equal(stockAfter.rows[0].quantity, stockBefore.rows[0].quantity);

      // Verify plan status remains approved (not in_transit)
      const planCheck = await query(`SELECT status FROM recommendations WHERE id = $1`, [shortPlanId]);
      assert.equal(planCheck.rows[0].status, 'approved');
    });

    it('should be idempotent: retrying dispatch on already dispatched plan does not double-deduct', async () => {
      const idemPlanId = 'rec-test-idem-001';

      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Idempotent test plan', 'approved', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'approved', plan = EXCLUDED.plan`,
        [
          idemPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 20 },
          }),
        ]
      );

      // First dispatch
      const res1 = await fetch(`${baseUrl}/api/recommendations/${idemPlanId}/dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });
      assert.equal(res1.status, 200);

      const stockAfterFirst = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );

      // Immediate retry dispatch
      const res2 = await fetch(`${baseUrl}/api/recommendations/${idemPlanId}/dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });
      assert.equal(res2.status, 200);
      const data2 = await res2.json();
      assert.equal(data2.already_dispatched, true);

      // Stock must be exactly identical (zero additional deduction)
      const stockAfterRetry = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      assert.equal(stockAfterRetry.rows[0].quantity, stockAfterFirst.rows[0].quantity);

      // Reset stock and allocations
      await resetStockAndAllocations();
    });
  });

  describe('5. Failed Delivery Handling & Audited Reallocation', () => {
    it('should restore inventory when delivery fails with stock_returned disposition', async () => {
      const failPlanId = 'rec-test-fail-ret-001';

      // Setup in_transit plan with 50 food kits
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'In transit test plan', 'in_transit', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'in_transit', plan = EXCLUDED.plan`,
        [
          failPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 50 },
          }),
        ]
      );

      const stockBefore = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );

      const res = await fetch(`${baseUrl}/api/recommendations/${failPlanId}/fail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          failure_reason: 'Convoy aborted due to flash surge; returned intact to depot',
          disposition: 'stock_returned',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.recommendation.status, 'failed');

      // Stock should be restituted (+50)
      const stockAfter = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      assert.equal(stockAfter.rows[0].quantity, stockBefore.rows[0].quantity + 50);

      // Reset stock to canonical 2500
      await resetStockAndAllocations();
    });

    it('should NOT restore inventory when delivery fails with stock_lost disposition', async () => {
      const failLostPlanId = 'rec-test-fail-lost-001';

      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'In transit lost plan', 'in_transit', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'in_transit', plan = EXCLUDED.plan`,
        [
          failLostPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 30 },
          }),
        ]
      );

      const stockBefore = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );

      const res = await fetch(`${baseUrl}/api/recommendations/${failLostPlanId}/fail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          failure_reason: 'Cargo truck flooded and rations contaminated',
          disposition: 'stock_lost',
        }),
      });

      assert.equal(res.status, 200);
      const stockAfter = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      // Stock remains unchanged (lost)
      assert.equal(stockAfter.rows[0].quantity, stockBefore.rows[0].quantity);
    });

    it('should create an audited replacement DRAFT plan when reallocated without double deductions', async () => {
      const reallocPlanId = 'rec-test-fail-ret-001';

      const res = await fetch(`${baseUrl}/api/recommendations/${reallocPlanId}/reallocate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planning_days: 3, notes: 'Reallocating after route disruption' }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.plan.status, 'draft');
      assert.ok(data.plan.id);

      // Verify audit log has PLAN_REALLOCATED_DRAFT
      const audit = await query(
        `SELECT action FROM audit_log WHERE user_id = 'usr-life-cmd' AND action = 'PLAN_REALLOCATED_DRAFT' ORDER BY created_at DESC LIMIT 1`
      );
      assert.equal(audit.rows.length, 1);

      // Clean up reallocated plan
      await query(`DELETE FROM recommendations WHERE id = $1`, [data.plan.id]);
    });
  });

  describe('6. Simulation-to-Draft-Plan Promotion (FR-9.6)', () => {
    it('should promote a simulation run to a DRAFT plan without mutating operational stock', async () => {
      // 1. Run a simulation
      const simRes = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          zone_id: 'zone-b',
          scenario_type: 'fleet_reduction',
          remove_vehicles: 2,
          remove_boats: 1,
        }),
      });

      assert.equal(simRes.status, 200);
      const simData = await simRes.json();
      const simId = simData.simulation_id;
      assert.ok(simId);

      // Capture stock before promotion
      const stockBefore = await query(`SELECT SUM(quantity) as total FROM resources`);
      const fleetBefore = await query(`SELECT SUM(vehicles_available) as total FROM resource_centers`);

      // 2. Promote simulation run to draft plan
      const promoRes = await fetch(`${baseUrl}/api/simulation/runs/${simId}/promote`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: 'Promoting scenario for tactical commander review' }),
      });

      assert.equal(promoRes.status, 201);
      const promoData = await promoRes.json();
      assert.equal(promoData.success, true);
      assert.equal(promoData.recommendation.status, 'draft');
      assert.equal(promoData.recommendation.source_simulation_id, simId);

      // 3. Verify zero operational stock or fleet mutation
      const stockAfter = await query(`SELECT SUM(quantity) as total FROM resources`);
      const fleetAfter = await query(`SELECT SUM(vehicles_available) as total FROM resource_centers`);
      assert.equal(stockAfter.rows[0].total, stockBefore.rows[0].total);
      assert.equal(fleetAfter.rows[0].total, fleetBefore.rows[0].total);

      // Clean up promoted plan and test simulation run
      await query(`DELETE FROM recommendations WHERE id = $1`, [promoData.recommendation.id]);
      await query(`DELETE FROM simulation_runs WHERE id = $1`, [simId]);
    });
  });

  describe('7. Security & Role-Based Authorization Guards', () => {
    const secPlanId = 'rec-test-sec-001';

    before(async () => {
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Security test plan', 'draft', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'draft'`,
        [secPlanId, JSON.stringify({ zone_id: 'zone-b', resources_recommended: { food_kits: 10 } })]
      );
    });

    it('should reject unauthenticated requests to modify plan with 401', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${secPlanId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'No auth' }),
      });
      assert.equal(res.status, 401);
    });

    it('should reject unauthenticated requests to dispatch plan with 401', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${secPlanId}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      assert.equal(res.status, 401);
    });

    it('should reject citizen access to approve plan with 403', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${secPlanId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should reject citizen access to modify plan with 403', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${secPlanId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${citizenToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Citizen bypass attempt' }),
      });
      assert.equal(res.status, 403);
    });

    it('should reject citizen access to dispatch plan with 403', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${secPlanId}/dispatch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should reject department staff from modifying response plan with 403', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${secPlanId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${deptSupplyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Department bypass' }),
      });
      assert.equal(res.status, 403);
    });
  });

});
