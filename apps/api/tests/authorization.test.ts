import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import app from '../src/index';
import { query, closePool } from '../src/db';
import { generateAccessToken } from '../src/services/auth';

let server: Server;
let baseUrl: string;

// Tokens for various roles
let adminToken: string;
let commandCenterToken: string;
let officerToken: string;
let coordinatorToken: string;
let teamLeadToken: string;
let deptHealthToken: string;
let deptSupplyToken: string;
let deptRescueToken: string;
let citizenToken: string;
const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature';

const testUsers = [
  { id: 'usr-authz-admin', name: 'Authz Admin', email: 'admin@test-authz.org', role: 'admin', dept: null },
  { id: 'usr-authz-cmd', name: 'Authz Command Center', email: 'cmd@test-authz.org', role: 'command_center', dept: null },
  { id: 'usr-authz-officer', name: 'Authz District Officer', email: 'officer@test-authz.org', role: 'officer', dept: null },
  { id: 'usr-authz-coord', name: 'Authz Coordinator', email: 'coord@test-authz.org', role: 'coordinator', dept: null },
  { id: 'usr-authz-lead', name: 'Authz Team Lead', email: 'lead@test-authz.org', role: 'team_lead', dept: null },
  { id: 'usr-authz-health', name: 'Authz Health Dept', email: 'health@test-authz.org', role: 'department', dept: 'health' },
  { id: 'usr-authz-supply', name: 'Authz Supply Dept', email: 'supply@test-authz.org', role: 'department', dept: 'supply' },
  { id: 'usr-authz-rescue', name: 'Authz Rescue Dept', email: 'rescue@test-authz.org', role: 'department', dept: 'rescue' },
  { id: 'usr-authz-citizen', name: 'Authz Citizen', email: 'citizen@test-authz.org', role: 'citizen', dept: null },
];

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

  // Generate tokens
  adminToken = generateAccessToken({ id: 'usr-authz-admin', name: 'Authz Admin', email: 'admin@test-authz.org', role: 'admin' }).token;
  commandCenterToken = generateAccessToken({ id: 'usr-authz-cmd', name: 'Authz Command Center', email: 'cmd@test-authz.org', role: 'command_center' }).token;
  officerToken = generateAccessToken({ id: 'usr-authz-officer', name: 'Authz District Officer', email: 'officer@test-authz.org', role: 'officer' }).token;
  coordinatorToken = generateAccessToken({ id: 'usr-authz-coord', name: 'Authz Coordinator', email: 'coord@test-authz.org', role: 'coordinator' }).token;
  teamLeadToken = generateAccessToken({ id: 'usr-authz-lead', name: 'Authz Team Lead', email: 'lead@test-authz.org', role: 'team_lead' }).token;
  deptHealthToken = generateAccessToken({ id: 'usr-authz-health', name: 'Authz Health Dept', email: 'health@test-authz.org', role: 'department', department: 'health' }).token;
  deptSupplyToken = generateAccessToken({ id: 'usr-authz-supply', name: 'Authz Supply Dept', email: 'supply@test-authz.org', role: 'department', department: 'supply' }).token;
  deptRescueToken = generateAccessToken({ id: 'usr-authz-rescue', name: 'Authz Rescue Dept', email: 'rescue@test-authz.org', role: 'department', department: 'rescue' }).token;
  citizenToken = generateAccessToken({ id: 'usr-authz-citizen', name: 'Authz Citizen', email: 'citizen@test-authz.org', role: 'citizen' }).token;
});

after(async () => {
  // CRITICAL FOREIGN KEY CLEANUP:
  // Reset any recommendation approved_by references before deleting users
  await query("UPDATE recommendations SET approved_by = NULL, status = 'draft' WHERE id = 'rec-zone-a-001'");
  await query("DELETE FROM recommendations WHERE id LIKE 'rec-test-%'");
  await query("DELETE FROM reports WHERE id LIKE 'rep-test-%'");
  await query("DELETE FROM disasters WHERE id LIKE 'disaster-test-%'");
  await query("DELETE FROM audit_log WHERE user_id LIKE 'usr-authz-%'");
  await query("DELETE FROM users WHERE id LIKE 'usr-authz-%'");

  // Revert route-b if modified
  await query("UPDATE road_segments SET status = 'partial' WHERE id = 'route-b'");

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await closePool();
});

describe('RELIEF-OS Step 3: Backend Role-Based Authorization & API Security Tests', () => {
  // ---------------------------------------------------------------------------
  // 1. PATCH /api/road-segments/:id
  // ---------------------------------------------------------------------------
  describe('PATCH /api/road-segments/:id (Operational Mutation)', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'blocked', reason: 'Flooding' }),
      });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.match(body.error, /authentication required/i);
    });

    it('should reject invalid token with 401', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${invalidToken}`,
        },
        body: JSON.stringify({ status: 'blocked' }),
      });
      assert.equal(res.status, 401);
    });

    it('should forbid citizen from modifying road segments with 403', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({ status: 'blocked' }),
      });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.match(body.error, /forbidden/i);
    });

    it('should allow command center to update road status with 200 and write audit log', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({ status: 'blocked', reason: 'High water levels' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.updated_segment.status, 'blocked');

      // Verify audit_log entry
      const auditRes = await query<{ user_id: string; action: string }>(
        `SELECT user_id, action FROM audit_log WHERE user_id = 'usr-authz-cmd' ORDER BY created_at DESC LIMIT 1`
      );
      assert.ok(auditRes.rows.length > 0);
      assert.equal(auditRes.rows[0].user_id, 'usr-authz-cmd');
      assert.equal(auditRes.rows[0].action, 'ROAD_STATUS_UPDATED');
    });

    it('should allow field team lead to update road status with 200', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teamLeadToken}`,
        },
        body: JSON.stringify({ status: 'partial', reason: 'Partial clearance' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.updated_segment.status, 'partial');
    });

    it('should allow department (rescue) to update road status with 200', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptRescueToken}`,
        },
        body: JSON.stringify({ status: 'partial' }),
      });
      assert.equal(res.status, 200);
    });

    it('should forbid non-rescue departments (health, supply) from updating road status with 403', async () => {
      const resSupply = await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptSupplyToken}`,
        },
        body: JSON.stringify({ status: 'blocked' }),
      });
      assert.equal(resSupply.status, 403);
      const bodySupply = await resSupply.json();
      assert.match(bodySupply.error, /forbidden/i);

      const resHealth = await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptHealthToken}`,
        },
        body: JSON.stringify({ status: 'accessible' }),
      });
      assert.equal(resHealth.status, 403);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. POST /api/disasters
  // ---------------------------------------------------------------------------
  describe('POST /api/disasters (Disaster Creation)', () => {
    const payload = {
      name: 'Assam Monsoon Wave 2',
      type: 'flood',
      region: 'Barpeta District',
      status: 'active',
      is_simulated: true,
    };

    it('should reject unauthenticated request with 401', async () => {
      const res = await fetch(`${baseUrl}/api/disasters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 401);
    });

    it('should forbid citizen with 403', async () => {
      const res = await fetch(`${baseUrl}/api/disasters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 403);
    });

    it('should forbid department user with 403', async () => {
      const res = await fetch(`${baseUrl}/api/disasters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptHealthToken}`,
        },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 403);
    });

    it('should forbid team lead with 403', async () => {
      const res = await fetch(`${baseUrl}/api/disasters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teamLeadToken}`,
        },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 403);
    });

    it('should allow command center to create disaster with 201 and log audit', async () => {
      const res = await fetch(`${baseUrl}/api/disasters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.ok(body.id);
      assert.equal(body.name, payload.name);

      // Verify audit log
      const auditRes = await query<{ action: string; details: { disaster_id: string } }>(
        `SELECT action, details FROM audit_log WHERE user_id = 'usr-authz-cmd' AND action = 'DISASTER_CREATED' LIMIT 1`
      );
      assert.ok(auditRes.rows.length > 0);
      assert.equal(auditRes.rows[0].details.disaster_id, body.id);
    });

    it('should allow district officer to create disaster with 201', async () => {
      const res = await fetch(`${baseUrl}/api/disasters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({ ...payload, name: 'Officer Created Flood' }),
      });
      assert.equal(res.status, 201);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. POST /api/reports/bulk
  // ---------------------------------------------------------------------------
  describe('POST /api/reports/bulk (Bulk Simulated Reports)', () => {
    const bulkPayload = {
      reports: [
        {
          description: 'Authz test bulk report 1',
          lat: 26.32,
          lng: 91.00,
          severity: 'high',
          category: 'food',
          people_affected: 10,
          medical_need: false,
          is_simulated: true,
        },
      ],
    };

    it('should reject unauthenticated request with 401', async () => {
      const res = await fetch(`${baseUrl}/api/reports/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkPayload),
      });
      assert.equal(res.status, 401);
    });

    it('should forbid citizen with 403', async () => {
      const res = await fetch(`${baseUrl}/api/reports/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify(bulkPayload),
      });
      assert.equal(res.status, 403);
    });

    it('should forbid department user with 403', async () => {
      const res = await fetch(`${baseUrl}/api/reports/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deptSupplyToken}`,
        },
        body: JSON.stringify(bulkPayload),
      });
      assert.equal(res.status, 403);
    });

    it('should allow command center with 201 and record audit log', async () => {
      const res = await fetch(`${baseUrl}/api/reports/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify(bulkPayload),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.inserted_count, 1);

      // Verify audit log
      const auditRes = await query<{ action: string }>(
        `SELECT action FROM audit_log WHERE user_id = 'usr-authz-cmd' AND action = 'REPORTS_BULK_INGESTED' LIMIT 1`
      );
      assert.ok(auditRes.rows.length > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. POST /api/reports (Public Citizen Reporting) & Contact Privacy
  // ---------------------------------------------------------------------------
  describe('POST /api/reports & Citizen Contact Privacy', () => {
    let createdReportId: string;
    const testContact = '+91 98765 43210';

    it('should allow anonymous public emergency report submission with 201', async () => {
      const res = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Public distress: house surrounded by water in Ward 2',
          lat: 26.321,
          lng: 91.005,
          severity: 'critical',
          category: 'rescue',
          contact_number: testContact,
          people_affected: 3,
          medical_need: true,
          is_simulated: true,
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.ok(body.id);
      createdReportId = body.id;
      // The submitter receives confirmation with the submitted payload
      assert.equal(body.contact_number, testContact);
    });

    it('should redact contact_number (null) for unauthenticated GET /api/reports/:id', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${createdReportId}`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.id, createdReportId);
      assert.equal(body.contact_number, null, 'Public unauthenticated caller must NOT see citizen contact number');
    });

    it('should redact contact_number (null) for citizen GET /api/reports/:id', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${createdReportId}`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.contact_number, null, 'Citizen role must NOT see other citizens contact numbers');
    });

    it('should redact contact_number across public GET /api/reports listing', async () => {
      const res = await fetch(`${baseUrl}/api/reports?limit=10`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.items.length > 0);
      body.items.forEach((item: { contact_number: string | null }) => {
        assert.equal(item.contact_number, null);
      });
    });

    it('should reveal contact_number to authorized command center', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${createdReportId}`, {
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.contact_number, testContact);
    });

    it('should reveal contact_number to authorized department officer', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${createdReportId}`, {
        headers: { Authorization: `Bearer ${deptRescueToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.contact_number, testContact);
    });

    it('should reveal contact_number to authorized district officer', async () => {
      const res = await fetch(`${baseUrl}/api/reports/${createdReportId}`, {
        headers: { Authorization: `Bearer ${officerToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.contact_number, testContact);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. GET/POST /api/zones/:id/demand (Internal Decision Data)
  // ---------------------------------------------------------------------------
  describe('Internal Planning: GET and POST /api/zones/:id/demand', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`);
      assert.equal(res.status, 401);
    });

    it('should reject invalid token with 401', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        headers: { Authorization: `Bearer ${invalidToken}` },
      });
      assert.equal(res.status, 401);
    });

    it('should forbid citizen with 403', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should allow command center with 200', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.zone_id, 'zone-a');
      assert.equal(body.demands.food_kits.quantity, 1200);
    });

    it('should allow department (supply) with 200', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        headers: { Authorization: `Bearer ${deptSupplyToken}` },
      });
      assert.equal(res.status, 200);
    });

    it('should allow legacy officer with 200', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        headers: { Authorization: `Bearer ${officerToken}` },
      });
      assert.equal(res.status, 200);
    });

    it('should allow coordinator and team lead with 200', async () => {
      const res1 = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        headers: { Authorization: `Bearer ${coordinatorToken}` },
      });
      assert.equal(res1.status, 200);

      const res2 = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        headers: { Authorization: `Bearer ${teamLeadToken}` },
      });
      assert.equal(res2.status, 200);
    });

    it('should forbid citizen on POST demand overrides with 403', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({ planning_days: 5 }),
      });
      assert.equal(res.status, 403);
    });

    it('should allow command center on POST demand overrides with 200', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({ planning_days: 5 }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.planning_horizon_days, 5);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. GET /api/zones/:id/allocation (Internal Decision Data)
  // ---------------------------------------------------------------------------
  describe('Internal Planning: GET /api/zones/:id/allocation', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/allocation`);
      assert.equal(res.status, 401);
    });

    it('should reject invalid token with 401', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/allocation`, {
        headers: { Authorization: `Bearer ${invalidToken}` },
      });
      assert.equal(res.status, 401);
    });

    it('should forbid citizen with 403', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/allocation`, {
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should allow command center with 200', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/allocation`, {
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.zone_id, 'zone-a');
      assert.equal(body.demand_summary.food_kits, 1200);
    });

    it('should allow department (health) with 200', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/allocation`, {
        headers: { Authorization: `Bearer ${deptHealthToken}` },
      });
      assert.equal(res.status, 200);
    });

    it('should allow officer with 200', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/allocation`, {
        headers: { Authorization: `Bearer ${officerToken}` },
      });
      assert.equal(res.status, 200);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Human in the Loop: Recommendation Approval Workflow
  // ---------------------------------------------------------------------------
  describe('Approval Workflow: POST /api/recommendations/:id/approve & reject', () => {
    const recId = 'rec-zone-a-001';

    it('should reject unauthenticated approve with 401', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${recId}/approve`, {
        method: 'POST',
      });
      assert.equal(res.status, 401);
    });

    it('should forbid citizen with 403', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${recId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should forbid department user with 403 (approval authority is Command/Officer only)', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${recId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${deptHealthToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should forbid team lead with 403', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${recId}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${teamLeadToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should allow command center to approve plan with 200, record approver and audit log, without inventory decrement', async () => {
      // Fleet snapshot before approval
      const fleetBefore = await query<{ sum: string }>('SELECT coalesce(sum(vehicles_available + boats_available), 0) as sum FROM resource_centers');
      const invBefore = await query<{ sum: string }>('SELECT coalesce(sum(quantity), 0) as sum FROM resources');

      const res = await fetch(`${baseUrl}/api/recommendations/${recId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({ notes: 'Priority deployment approved for Barpeta' }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.recommendation.status, 'approved');
      assert.equal(body.recommendation.approved_by, 'usr-authz-cmd');
      assert.ok(body.recommendation.approved_at);

      // Verify STRICT constraint: zero fleet reduction, zero inventory decrement
      const fleetAfter = await query<{ sum: string }>('SELECT coalesce(sum(vehicles_available + boats_available), 0) as sum FROM resource_centers');
      const invAfter = await query<{ sum: string }>('SELECT coalesce(sum(quantity), 0) as sum FROM resources');
      assert.equal(fleetAfter.rows[0].sum, fleetBefore.rows[0].sum);
      assert.equal(invAfter.rows[0].sum, invBefore.rows[0].sum);

      // Verify audit_log
      const auditRes = await query<{ action: string; details: { recommendation_id: string } }>(
        `SELECT action, details FROM audit_log WHERE user_id = 'usr-authz-cmd' AND action = 'RECOMMENDATION_APPROVED' LIMIT 1`
      );
      assert.ok(auditRes.rows.length > 0);
      assert.equal(auditRes.rows[0].details.recommendation_id, recId);
    });

    it('should allow officer to reject plan with 200 via /api/plans alias', async () => {
      const res = await fetch(`${baseUrl}/api/plans/${recId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({ reason: 'Route C needs further clearance assessment' }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.recommendation.status, 'rejected');
      assert.equal(body.recommendation.approved_by, 'usr-authz-officer');

      // Verify audit_log
      const auditRes = await query<{ action: string }>(
        `SELECT action FROM audit_log WHERE user_id = 'usr-authz-officer' AND action = 'RECOMMENDATION_REJECTED' LIMIT 1`
      );
      assert.ok(auditRes.rows.length > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Public Read Endpoints Preserved
  // ---------------------------------------------------------------------------
  describe('Public Read Endpoints Preserved', () => {
    it('should allow anonymous access to GET /api/shelters', async () => {
      const res = await fetch(`${baseUrl}/api/shelters`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.total, 18);
    });

    it('should allow anonymous access to GET /api/shelters/suggest', async () => {
      const res = await fetch(`${baseUrl}/api/shelters/suggest?zone_id=zone-a&people=100`);
      assert.equal(res.status, 200);
    });

    it('should allow anonymous access to GET /api/road-segments', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.total >= 3);
    });

    it('should allow anonymous access to GET /api/zones', async () => {
      const res = await fetch(`${baseUrl}/api/zones`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.total >= 7);
    });

    it('should allow anonymous access to GET /api/zones/zone-a', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.id, 'zone-a');
    });

    it('should allow anonymous access to GET /api/disasters and demo-kpis', async () => {
      const res1 = await fetch(`${baseUrl}/api/disasters`);
      assert.equal(res1.status, 200);

      const res2 = await fetch(`${baseUrl}/api/disasters/demo-kpis`);
      assert.equal(res2.status, 200);
      const body2 = await res2.json();
      assert.equal(body2.kpis.affected_population, 18420);
    });

    it('should allow anonymous access to GET /api/resource-centers', async () => {
      const res = await fetch(`${baseUrl}/api/resource-centers`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.total, 5);
    });
  });
});
