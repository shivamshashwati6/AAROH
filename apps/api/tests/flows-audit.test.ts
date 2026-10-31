/**
 * RELIEF-OS Phase 2 Complete Dynamic User Flows Audit Tests
 * Formally verifies User Flows A through F per User Audit Mandate.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import app from '../src/index';
import { query, closePool } from '../src/db';
import { generateAccessToken } from '../src/services/auth';

let server: Server;
let baseUrl: string;

let adminToken: string;
let commandCenterToken: string;
let officerToken: string;
let citizenToken: string;
let rescueDeptToken: string;
let supplyDeptToken: string;

const cleanupReportIds: string[] = [];
const cleanupPlanIds: string[] = [];

describe('RELIEF-OS Dynamic User Flows Audit (Phase 2)', () => {
  before(async () => {
    adminToken = generateAccessToken({
      id: 'usr-admin-demo',
      name: 'Admin Demo',
      email: 'admin@relief.internal',
      role: 'admin',
    }).token;

    commandCenterToken = generateAccessToken({
      id: 'usr-command-demo',
      name: 'Command Demo',
      email: 'command@relief.internal',
      role: 'command_center',
    }).token;

    officerToken = generateAccessToken({
      id: 'usr-officer-demo',
      name: 'Officer Demo',
      email: 'officer@relief.internal',
      role: 'officer',
    }).token;

    citizenToken = generateAccessToken({
      id: 'usr-citizen-demo',
      name: 'Citizen Demo',
      email: 'citizen@relief.internal',
      role: 'citizen',
    }).token;

    rescueDeptToken = generateAccessToken({
      id: 'usr-rescue-demo',
      name: 'Rescue Demo',
      email: 'rescue@relief.internal',
      role: 'department',
      department: 'rescue',
    }).token;

    supplyDeptToken = generateAccessToken({
      id: 'usr-supply-demo',
      name: 'Supply Demo',
      email: 'supply@relief.internal',
      role: 'department',
      department: 'supply',
    }).token;

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (cleanupReportIds.length > 0) {
      await query(`DELETE FROM reports WHERE id = ANY($1::varchar[])`, [cleanupReportIds]);
    }
    if (cleanupPlanIds.length > 0) {
      await query(`DELETE FROM recommendations WHERE id = ANY($1::varchar[])`, [cleanupPlanIds]);
      await query(`DELETE FROM audit_log WHERE details->>'recommendation_id' = ANY($1::text[])`, [cleanupPlanIds]);
    }
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closePool();
  });

  // ---------------------------------------------------------------------------
  // FLOW A: Citizen submits disaster report -> validates -> saved in DB -> appears in dashboard
  // ---------------------------------------------------------------------------
  describe('Flow A: Citizen Disaster Report Lifecycle', () => {
    let createdReportId: string;

    it('validates report payload and rejects invalid inputs with 400', async () => {
      const res = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: '', // Too short (< 3 chars)
          lat: 26.3211,
          lng: 91.0045,
        }),
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error);
    });

    it('submits valid emergency report and persists in PostgreSQL with PostGIS coordinates', async () => {
      const uniqueDesc = `Flow A Audit: 8 stranded people near Jania village embankment breach [${Date.now()}]`;
      const res = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({
          description: uniqueDesc,
          location_name: 'Jania Flood Embankment',
          lat: 26.3211,
          lng: 91.0045,
          severity: 'critical',
          category: 'rescue',
          people_affected: 8,
          medical_need: true,
          contact_number: '9876543210',
          is_simulated: false,
        }),
      });

      assert.equal(res.status, 201);
      const report = await res.json();
      assert.ok(report.id);
      assert.equal(report.severity, 'critical');
      assert.equal(report.status, 'pending_ai');
      assert.equal(report.people_affected, 8);
      assert.equal(report.medical_need, true);
      assert.equal(report.location_lat, 26.3211);
      assert.equal(report.location_lng, 91.0045);

      createdReportId = report.id;
      cleanupReportIds.push(report.id);

      // Verify direct database persistence
      const dbRes = await query<{ id: string; description: string; status: string }>(
        `SELECT id, description, status FROM reports WHERE id = $1`,
        [createdReportId]
      );
      assert.equal(dbRes.rows.length, 1);
      assert.equal(dbRes.rows[0].status, 'pending_ai');
    });

    it('retrieves saved report via GET /api/reports/:id and lists in report queue', async () => {
      // 1. Single report fetch
      const singleRes = await fetch(`${baseUrl}/api/reports/${createdReportId}`, {
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });
      assert.equal(singleRes.status, 200);
      const singleData = await singleRes.json();
      assert.equal(singleData.id, createdReportId);
      assert.equal(singleData.contact_number, '9876543210'); // Authorized role receives contact info

      // 2. Queue listing (Command Center view)
      const listRes = await fetch(`${baseUrl}/api/reports?limit=10`, {
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      const foundInQueue = listData.items.some((r: { id: string }) => r.id === createdReportId);
      assert.equal(foundInQueue, true);
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW B: Report queue -> Situation Analysis execution -> Results persist & retrieve
  // ---------------------------------------------------------------------------
  describe('Flow B: Command Center Situation Analysis Execution & Persistence', () => {
    it('executes situation analysis and persists structured intelligence results', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/disaster-assam-2026/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({
          limit: 50,
          force_reanalyze: true,
        }),
      });

      assert.equal(res.status, 200);
      const result = await res.json();
      assert.ok(result.disaster_id);
      assert.ok(typeof result.total_reports_analyzed === 'number');
      assert.ok(Array.isArray(result.clusters));
      assert.ok(Array.isArray(result.urgent_needs));
      assert.ok(result.summary);

      // Verify database persistence in situation_analyses table
      const dbRes = await query<{ count: string }>(
        `SELECT count(*) as count FROM situation_analyses WHERE disaster_id = 'disaster-assam-2026'`
      );
      assert.ok(parseInt(dbRes.rows[0].count, 10) >= 1);
    });

    it('retrieves latest situation analysis via GET /api/disasters/:id/situation', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/disaster-assam-2026/situation`);
      assert.equal(res.status, 200);
      const situation = await res.json();
      assert.equal(situation.disaster_id, 'disaster-assam-2026');
      assert.ok(situation.summary);
      assert.ok(Array.isArray(situation.reported_facts));
      assert.ok(Array.isArray(situation.urgent_needs));
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW C: Response Plan Generation -> Saved -> UI Approval Workflow
  // ---------------------------------------------------------------------------
  describe('Flow C: Command Center Response Plan Lifecycle & Approval', () => {
    let generatedPlanId: string;

    it('generates a draft response plan for zone-g against live inventory', async () => {
      // Clean any existing test plan on zone-g
      await query(`DELETE FROM recommendations WHERE zone_id = 'zone-g' AND id != 'rec-zone-a-001'`);

      const res = await fetch(`${baseUrl}/api/zones/zone-g/plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({ planning_days: 3, notes: 'Flow C Audit Plan Generation' }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.recommendation);
      assert.equal(data.recommendation.status, 'draft');
      assert.equal(data.recommendation.zone_id, 'zone-g');

      generatedPlanId = data.recommendation.id;
      cleanupPlanIds.push(generatedPlanId);
    });

    it('retrieves the generated draft plan via GET /api/recommendations', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations?zone_id=zone-g`, {
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      const plan = body.items.find((p: { id: string }) => p.id === generatedPlanId);
      assert.ok(plan);
      assert.equal(plan.status, 'draft');
    });

    it('approves the plan with officer notes and transitions status to approved', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/${generatedPlanId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({ notes: 'Authorized by District Relief Officer for Jania sector' }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.recommendation.status, 'approved');

      // Verify audit log recorded RECOMMENDATION_APPROVED
      const auditRes = await query<{ action: string }>(
        `SELECT action FROM audit_log WHERE details->>'recommendation_id' = $1`,
        [generatedPlanId]
      );
      assert.ok(auditRes.rows.some((r) => r.action === 'RECOMMENDATION_APPROVED'));
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW D: Dashboard KPIs derived dynamically from database records
  // ---------------------------------------------------------------------------
  describe('Flow D: Dynamic Database-Backed Dashboard KPIs', () => {
    it('derives all KPIs from live database state in GET /api/disasters/demo-kpis', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/demo-kpis`);
      assert.equal(res.status, 200);
      const body = await res.json();

      assert.equal(body.disaster_id, 'disaster-assam-2026');
      assert.ok(body.kpis);
      assert.equal(body.kpis.affected_population, 18420);
      assert.equal(body.kpis.critical_zones_count, 7);
      assert.equal(body.kpis.total_shelters, 18);
      assert.equal(body.kpis.relief_centers, 5);
      assert.equal(body.kpis.total_fleet, 21);
      assert.ok(typeof body.kpis.resource_shortages_count === 'number');

      // Hero zone
      assert.equal(body.hero_zone.id, 'zone-a');
      assert.equal(body.hero_zone.priority_score, 94);
      assert.equal(body.hero_zone.priority_band, 'Critical');
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW E: Unauthorized roles cannot execute restricted actions
  // ---------------------------------------------------------------------------
  describe('Flow E: Multi-Role Authorization & Security Boundaries', () => {
    it('forbids unauthenticated access to recommendations (401)', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations`);
      assert.equal(res.status, 401);
    });

    it('forbids citizen role from approving response plans (403)', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/rec-zone-a-001/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({ notes: 'Citizen attempt' }),
      });
      assert.equal(res.status, 403);
    });

    it('forbids department staff from approving response plans (403)', async () => {
      const res = await fetch(`${baseUrl}/api/recommendations/rec-zone-a-001/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supplyDeptToken}`,
        },
        body: JSON.stringify({ notes: 'Supply staff attempt' }),
      });
      assert.equal(res.status, 403);
    });

    it('forbids citizen role from running What-If simulations (403)', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({ scenario_type: 'fleet_reduction', remove_boats: 1 }),
      });
      assert.equal(res.status, 403);
    });

    it('forbids supply department from updating road conditions (403)', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-c`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supplyDeptToken}`,
        },
        body: JSON.stringify({ status: 'blocked' }),
      });
      assert.equal(res.status, 403);
    });

    it('allows authorized Rescue department to update road conditions (200)', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-c`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${rescueDeptToken}`,
        },
        body: JSON.stringify({ status: 'accessible', reason: 'Verified clear by Rescue unit' }),
      });
      assert.equal(res.status, 200);
    });
  });

  // ---------------------------------------------------------------------------
  // FLOW F: Invariant Guarantee - Read-only & planning operations never mutate inventory
  // ---------------------------------------------------------------------------
  describe('Flow F: Safety & Non-Mutation Invariants', () => {
    it('guarantees zero inventory deduction across demand, allocation, simulation, and analysis', async () => {
      // 1. Snapshot stock before
      const stockBefore = await query<{ sum: string }>(
        `SELECT sum(quantity) as sum FROM resources`
      );
      const fleetBefore = await query<{ sum: string }>(
        `SELECT sum(vehicles_available + boats_available) as sum FROM resource_centers`
      );

      // 2. Perform demand calculation
      await fetch(`${baseUrl}/api/zones/zone-a/demand?planning_days=5`, {
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });

      // 3. Perform allocation calculation
      await fetch(`${baseUrl}/api/zones/zone-a/allocation?planning_days=5`, {
        headers: { Authorization: `Bearer ${commandCenterToken}` },
      });

      // 4. Perform What-If simulation
      await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${commandCenterToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'inventory_reduction',
          reduce_stock_pct: 50,
          resource_type: 'food_kits',
        }),
      });

      // 5. Snapshot stock after
      const stockAfter = await query<{ sum: string }>(
        `SELECT sum(quantity) as sum FROM resources`
      );
      const fleetAfter = await query<{ sum: string }>(
        `SELECT sum(vehicles_available + boats_available) as sum FROM resource_centers`
      );

      assert.equal(stockBefore.rows[0].sum, stockAfter.rows[0].sum);
      assert.equal(fleetBefore.rows[0].sum, fleetAfter.rows[0].sum);
    });
  });
});
