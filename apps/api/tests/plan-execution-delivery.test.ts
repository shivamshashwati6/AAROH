import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import app from '../src/index';
import { query } from '../src/db';
import { generateAccessToken } from '../src/services/auth';

let server: Server;
let baseUrl: string;

let cmdCenterToken: string;
let officerToken: string;
let departmentToken: string;
let citizenToken: string;

const testUsers = [
  { id: 'usr-exec-cmd', name: 'Exec Commander', email: 'cmd@test-exec.org', role: 'command_center', dept: null },
  { id: 'usr-exec-officer', name: 'Exec Officer', email: 'officer@test-exec.org', role: 'officer', dept: null },
  { id: 'usr-exec-dept', name: 'Exec Department', email: 'dept@test-exec.org', role: 'department', dept: 'supply' },
  { id: 'usr-exec-citizen', name: 'Exec Citizen', email: 'citizen@test-exec.org', role: 'citizen', dept: null },
];

const execUserIds = testUsers.map((u) => u.id);
const knownTestPlanIds = [
  'rec-exec-test-001',
  'rec-exec-invalid-001',
  'rec-exec-shortage-001',
  'rec-exec-idem-001',
  'rec-exec-delivery-recalc-001',
  'rec-exec-fail-ret-001',
  'rec-exec-fail-lost-001',
];

async function resetStockAndAllocations() {
  await query(`DELETE FROM allocations WHERE plan_id = ANY($1::varchar[])`, [knownTestPlanIds]);
  await query(`UPDATE resources SET quantity = 2500 WHERE center_id = 'center-3' AND resource_type = 'food_kits'`);
  await query(`UPDATE resources SET quantity = 2000 WHERE center_id = 'center-3' AND resource_type = 'water_units'`);
  await query(`UPDATE resources SET quantity = 4 WHERE center_id = 'center-3' AND resource_type = 'boats'`);
  await query(`UPDATE resources SET quantity = 5 WHERE center_id = 'center-3' AND resource_type = 'medical_teams'`);
  await query(
    `UPDATE zones 
     SET priority_score = 88, 
         band = 'Critical', 
         breakdown_json = '{"population_impact": 0.88, "severity": 0.90, "medical_risk": 0.85, "resource_shortage": 0.80, "accessibility_difficulty": 0.70, "vulnerability": 0.75}'::jsonb 
     WHERE id = 'zone-b'`
  );
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

  cmdCenterToken = generateAccessToken({ id: 'usr-exec-cmd', name: 'Exec Commander', email: 'cmd@test-exec.org', role: 'command_center' }).token;
  officerToken = generateAccessToken({ id: 'usr-exec-officer', name: 'Exec Officer', email: 'officer@test-exec.org', role: 'officer' }).token;
  departmentToken = generateAccessToken({ id: 'usr-exec-dept', name: 'Exec Department', email: 'dept@test-exec.org', role: 'department', department: 'supply' }).token;
  citizenToken = generateAccessToken({ id: 'usr-exec-citizen', name: 'Exec Citizen', email: 'citizen@test-exec.org', role: 'citizen' }).token;

  // Clean slate before test execution
  await query(`DELETE FROM recommendations WHERE id = ANY($1::varchar[])`, [knownTestPlanIds]);
  await query(`DELETE FROM audit_log WHERE user_id = ANY($1::varchar[])`, [execUserIds]);
  await resetStockAndAllocations();
});

after(async () => {
  await query(`DELETE FROM recommendations WHERE id = ANY($1::varchar[])`, [knownTestPlanIds]);
  await query(`DELETE FROM allocations WHERE plan_id = ANY($1::varchar[])`, [knownTestPlanIds]);
  await query(`DELETE FROM audit_log WHERE user_id = ANY($1::varchar[])`, [execUserIds]);
  await query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [execUserIds]);
  await resetStockAndAllocations();

  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('PRD Module 10: Response Plan Execution & Delivery Tracking', () => {

  // ---------------------------------------------------------------------------
  // 1. Role Authorization Boundaries (Requirement 8)
  // ---------------------------------------------------------------------------
  describe('1. Role Authorization Boundaries', () => {
    const planId = 'rec-exec-test-001';

    before(async () => {
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Test plan for role verification', 'approved', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'approved', plan = EXCLUDED.plan`,
        [
          planId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center: 'Barpeta Base #3',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 100, water_units: 100, boats: 1, medical_teams: 1 },
          }),
        ]
      );
    });

    it('allows Command Center users to view and execute response plans', async () => {
      const getRes = await fetch(`${baseUrl}/api/recommendations/${planId}`, {
        headers: { Authorization: `Bearer ${cmdCenterToken}` },
      });
      assert.equal(getRes.status, 200);
      const plan = await getRes.json();
      assert.equal(plan.id, planId);
      assert.equal(plan.status, 'approved');
    });

    it('allows Department users to view delivery status but forbids executing plans (403)', async () => {
      // 1. Department can view plan details and status
      const getRes = await fetch(`${baseUrl}/api/recommendations/${planId}`, {
        headers: { Authorization: `Bearer ${departmentToken}` },
      });
      assert.equal(getRes.status, 200);
      const plan = await getRes.json();
      assert.equal(plan.id, planId);

      // 2. Department CANNOT execute the plan (Forbidden 403)
      const execRes = await fetch(`${baseUrl}/api/recommendations/${planId}/execute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${departmentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ execution_notes: 'Attempted dept execution' }),
      });
      assert.equal(execRes.status, 403);

      // 3. Department CANNOT modify the plan (Forbidden 403)
      const modRes = await fetch(`${baseUrl}/api/recommendations/${planId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${departmentToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Dept modify attempt', resources: { food_kits: 50 } }),
      });
      assert.equal(modRes.status, 403);
    });

    it('strictly forbids Citizens from accessing command recommendations (403)', async () => {
      // Citizen cannot view plans
      const getRes = await fetch(`${baseUrl}/api/recommendations/${planId}`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(getRes.status, 403);

      // Citizen cannot execute plans
      const execRes = await fetch(`${baseUrl}/api/recommendations/${planId}/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(execRes.status, 403);

      // Citizen cannot mark delivery
      const delRes = await fetch(`${baseUrl}/api/recommendations/${planId}/deliver`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(delRes.status, 403);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Lifecycle State Machine: Only APPROVED can be Executed (Requirement 1 & 3)
  // ---------------------------------------------------------------------------
  describe('2. State Machine: Only APPROVED can be executed', () => {
    const invalidPlanId = 'rec-exec-invalid-001';

    it('rejects executing a DRAFT plan with 400', async () => {
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Draft test plan', 'draft', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'draft'`,
        [invalidPlanId, JSON.stringify({ zone_id: 'zone-b', source_center_id: 'center-3', resources_recommended: { food_kits: 20 } })]
      );

      const res = await fetch(`${baseUrl}/api/recommendations/${invalidPlanId}/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cmdCenterToken}` },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /only approved response plans can be dispatched/i);
    });

    it('rejects executing a MODIFIED (unapproved) plan with 400', async () => {
      await query(`UPDATE recommendations SET status = 'modified' WHERE id = $1`, [invalidPlanId]);

      const res = await fetch(`${baseUrl}/api/recommendations/${invalidPlanId}/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cmdCenterToken}` },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /only approved response plans can be dispatched/i);
    });

    it('rejects executing a REJECTED plan with 400', async () => {
      await query(`UPDATE recommendations SET status = 'rejected' WHERE id = $1`, [invalidPlanId]);

      const res = await fetch(`${baseUrl}/api/recommendations/${invalidPlanId}/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cmdCenterToken}` },
      });
      assert.equal(res.status, 400);
    });

    it('rejects delivering a plan that is not in_transit with 400', async () => {
      await query(`UPDATE recommendations SET status = 'approved' WHERE id = $1`, [invalidPlanId]);

      const res = await fetch(`${baseUrl}/api/recommendations/${invalidPlanId}/deliver`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${officerToken}` },
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /only in_transit response plans can be marked delivered/i);
    });

    it('rejects declaring failure for a plan that is not in_transit with 400', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${invalidPlanId}/fail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ failure_reason: 'Premature failure declaration' }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /only in_transit response plans can be marked failed/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Execution, Single Stock Deduction & Idempotency (Requirement 4 & 5)
  // ---------------------------------------------------------------------------
  describe('3. Execution & Atomic Inventory Deduction Exactly Once', () => {
    const idemPlanId = 'rec-exec-idem-001';

    before(async () => {
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Execution plan for stock test', 'approved', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'approved', plan = EXCLUDED.plan`,
        [
          idemPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center: 'Barpeta Base #3',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 120, water_units: 180 },
          }),
        ]
      );
      await resetStockAndAllocations();
    });

    it('executes response plan, deducts stock atomically, and records execution timestamps and actor', async () => {
      const stockBefore = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      const foodBefore = stockBefore.rows[0].quantity;

      const res = await fetch(`${baseUrl}/api/recommendations/${idemPlanId}/execute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cmdCenterToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ execution_notes: 'Convoy Beta moving out on Route C' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.recommendation.status, 'in_transit');
      assert.equal(data.recommendation.dispatched_by, 'usr-exec-cmd');
      assert.ok(data.recommendation.dispatched_at);
      assert.equal(data.deductions.food_kits, 120);
      assert.equal(data.deductions.water_units, 180);

      // Verify stock was deducted in database exactly once
      const stockAfter = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      assert.equal(stockAfter.rows[0].quantity, foodBefore - 120);

      // Verify audit log has PLAN_EXECUTED
      const auditRes = await query(
        `SELECT action, details FROM audit_log WHERE user_id = 'usr-exec-cmd' AND action = 'PLAN_EXECUTED' ORDER BY created_at DESC LIMIT 1`
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].details.recommendation_id, idemPlanId);
      assert.equal(auditRes.rows[0].details.status_to, 'in_transit');
      assert.equal(auditRes.rows[0].details.deductions.food_kits, 120);
    });

    it('enforces idempotency: repeated execution does not double-deduct inventory', async () => {
      const stockBeforeRetry = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );

      const retryRes = await fetch(`${baseUrl}/api/recommendations/${idemPlanId}/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cmdCenterToken}` },
      });

      assert.equal(retryRes.status, 200);
      const data = await retryRes.json();
      assert.equal(data.already_dispatched, true);

      // Stock must be completely unchanged
      const stockAfterRetry = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      assert.equal(stockAfterRetry.rows[0].quantity, stockBeforeRetry.rows[0].quantity);
    });

    it('aborts execution with 409 and strictly prevents negative inventory when stock is insufficient', async () => {
      const shortPlanId = 'rec-exec-shortage-001';
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'Excessive request', 'approved', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'approved', plan = EXCLUDED.plan`,
        [
          shortPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 9999999 },
          }),
        ]
      );

      const stockBefore = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );

      const res = await fetch(`${baseUrl}/api/recommendations/${shortPlanId}/execute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cmdCenterToken}` },
      });

      assert.equal(res.status, 409);
      const data = await res.json();
      assert.match(data.error, /insufficient.*stock/i);

      // Stock remains intact
      const stockAfter = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      assert.equal(stockAfter.rows[0].quantity, stockBefore.rows[0].quantity);

      // Plan remains in approved state (not in_transit)
      const planCheck = await query(`SELECT status FROM recommendations WHERE id = $1`, [shortPlanId]);
      assert.equal(planCheck.rows[0].status, 'approved');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Delivery & Zone Shortage Recalculation (Requirement 6 & 7)
  // ---------------------------------------------------------------------------
  describe('4. Delivery & Zone Shortage Recalculation', () => {
    const deliveryPlanId = 'rec-exec-delivery-recalc-001';

    before(async () => {
      await resetStockAndAllocations();
      // Setup in_transit plan delivering 400 food kits and 300 water units to Zone B
      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, dispatched_by, dispatched_at, created_at)
         VALUES ($1, 'zone-b', $2, 'Delivery test plan', 'in_transit', 'usr-exec-cmd', NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'in_transit', plan = EXCLUDED.plan`,
        [
          deliveryPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center: 'Barpeta Base #3',
            source_center_id: 'center-3',
            resources_recommended: {
              food_kits: 400,
              water_units: 300,
              boats: 1,
              medical_teams: 1,
            },
          }),
        ]
      );
    });

    it('marks plan as delivered and recalculates zone remaining shortage and priority score using demand logic', async () => {
      const zoneBefore = await query<{ priority_score: number; band: string; breakdown_json: any }>(
        `SELECT priority_score, band, breakdown_json FROM zones WHERE id = 'zone-b'`
      );
      const scoreBefore = zoneBefore.rows[0].priority_score;

      const res = await fetch(`${baseUrl}/api/recommendations/${deliveryPlanId}/deliver`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: 'Convoy reached relief camp safely' }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.recommendation.status, 'delivered');
      assert.ok(data.recommendation.completed_at);

      // Verify delivery remaining shortage calculation was performed
      assert.ok(data.remaining_shortages);
      assert.ok(typeof data.remaining_shortages.food_kits === 'number');
      assert.ok(typeof data.remaining_shortages.water_units === 'number');

      // Verify zone row in DB has updated priority score and remaining shortage breakdown
      const zoneAfter = await query<{ priority_score: number; band: string; breakdown_json: any }>(
        `SELECT priority_score, band, breakdown_json FROM zones WHERE id = 'zone-b'`
      );
      const updatedZone = zoneAfter.rows[0];

      // Priority score should decrease or update reflecting fulfilled needs
      assert.ok(updatedZone.priority_score <= scoreBefore);
      assert.ok(updatedZone.breakdown_json.remaining_shortages);
      assert.equal(
        updatedZone.breakdown_json.remaining_shortages.food_kits,
        data.remaining_shortages.food_kits
      );

      // Verify audit log has PLAN_DELIVERED with remaining shortages
      const auditRes = await query(
        `SELECT action, details FROM audit_log WHERE user_id = 'usr-exec-officer' AND action = 'PLAN_DELIVERED' ORDER BY created_at DESC LIMIT 1`
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].details.recommendation_id, deliveryPlanId);
      assert.equal(auditRes.rows[0].details.status_to, 'delivered');
      assert.ok(auditRes.rows[0].details.remaining_shortages);
    });

    it('enforces idempotency on delivery: calling deliver again returns success without recalculation errors', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${deliveryPlanId}/deliver`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.recommendation.status, 'delivered');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Transport Failure Handling & Inventory Restoration (Requirement 3 & 7)
  // ---------------------------------------------------------------------------
  describe('5. Delivery Failure & Inventory Restoration', () => {
    it('restores warehouse inventory when transport fails with stock_returned disposition', async () => {
      const failRetPlanId = 'rec-exec-fail-ret-001';

      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'In transit return plan', 'in_transit', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'in_transit', plan = EXCLUDED.plan`,
        [
          failRetPlanId,
          JSON.stringify({
            zone_id: 'zone-b',
            source_center_id: 'center-3',
            resources_recommended: { food_kits: 80 },
          }),
        ]
      );

      const stockBefore = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );

      const res = await fetch(`${baseUrl}/api/recommendations/${failRetPlanId}/fail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          failure_reason: 'Road swept away at km 4; truck turned back to base safely',
          disposition: 'stock_returned',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.recommendation.status, 'failed');

      // Stock must be restored (+80)
      const stockAfter = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      assert.equal(stockAfter.rows[0].quantity, stockBefore.rows[0].quantity + 80);

      // Verify audit log has PLAN_FAILED
      const auditRes = await query(
        `SELECT action, details FROM audit_log WHERE user_id = 'usr-exec-officer' AND action = 'PLAN_FAILED' ORDER BY created_at DESC LIMIT 1`
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].details.disposition, 'stock_returned');
      assert.equal(auditRes.rows[0].details.restored_to_stock, true);
    });

    it('does NOT restore inventory when transport fails with stock_lost disposition', async () => {
      const failLostPlanId = 'rec-exec-fail-lost-001';

      await query(
        `INSERT INTO recommendations (id, zone_id, plan, explanation, status, created_at)
         VALUES ($1, 'zone-b', $2, 'In transit lost plan', 'in_transit', NOW())
         ON CONFLICT (id) DO UPDATE SET status = 'in_transit', plan = EXCLUDED.plan`,
        [
          failLostPlanId,
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

      const res = await fetch(`${baseUrl}/api/recommendations/${failLostPlanId}/fail`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          failure_reason: 'Cargo submerged and destroyed during river surge',
          disposition: 'stock_lost',
        }),
      });

      assert.equal(res.status, 200);

      // Stock must remain unchanged
      const stockAfter = await query(
        `SELECT quantity FROM resources WHERE center_id = 'center-3' AND resource_type = 'food_kits'`
      );
      assert.equal(stockAfter.rows[0].quantity, stockBefore.rows[0].quantity);
    });
  });

});

