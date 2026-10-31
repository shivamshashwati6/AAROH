import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import app from '../src/index';
import { query, closePool } from '../src/db';
import { generateAccessToken } from '../src/services/auth';
import {
  extractReportDeterministic,
  calculateDistanceMeters,
  calculateTextJaccardSimilarity,
  detectReportClusters,
  RawCitizenReport,
} from '../src/services/intelligence';

let server: Server;
let baseUrl: string;

let adminToken: string;
let commandCenterToken: string;
let officerToken: string;
let deptToken: string;
let citizenToken: string;

const testUsers = [
  { id: 'usr-sit-admin', name: 'Situation Admin', email: 'admin@sit-test.org', role: 'admin', dept: null },
  { id: 'usr-sit-cmd', name: 'Situation Commander', email: 'cmd@sit-test.org', role: 'command_center', dept: null },
  { id: 'usr-sit-officer', name: 'Situation Officer', email: 'officer@sit-test.org', role: 'officer', dept: null },
  { id: 'usr-sit-dept', name: 'Situation Health Dept', email: 'dept@sit-test.org', role: 'department', dept: 'health' },
  { id: 'usr-sit-citizen', name: 'Situation Citizen', email: 'citizen@sit-test.org', role: 'citizen', dept: null },
];

const testDisasterId = 'disaster-sit-test-2026';
const emptyDisasterId = 'disaster-sit-empty-2026';
const createdReportIds: string[] = [];

describe('Phase 2B: Citizen Report Intelligence & AI Situation Analysis Tests', () => {
  before(async () => {
    // 1. Seed test users
    for (const u of testUsers) {
      await query(
        `INSERT INTO users (id, name, email, password_hash, role, department)
         VALUES ($1, $2, $3, 'hash_placeholder', $4, $5)
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, department = EXCLUDED.department`,
        [u.id, u.name, u.email, u.role, u.dept]
      );
    }

    adminToken = generateAccessToken({ id: 'usr-sit-admin', name: 'Situation Admin', email: 'admin@sit-test.org', role: 'admin' }).token;
    commandCenterToken = generateAccessToken({ id: 'usr-sit-cmd', name: 'Situation Commander', email: 'cmd@sit-test.org', role: 'command_center' }).token;
    officerToken = generateAccessToken({ id: 'usr-sit-officer', name: 'Situation Officer', email: 'officer@sit-test.org', role: 'officer' }).token;
    deptToken = generateAccessToken({ id: 'usr-sit-dept', name: 'Situation Health Dept', email: 'dept@sit-test.org', role: 'department', department: 'health' }).token;
    citizenToken = generateAccessToken({ id: 'usr-sit-citizen', name: 'Situation Citizen', email: 'citizen@sit-test.org', role: 'citizen' }).token;

    // 2. Seed test disasters
    await query(
      `INSERT INTO disasters (id, name, type, region, status, is_simulated, start_time)
       VALUES 
         ($1, 'Assam Intelligence Test Flood', 'flood', 'Barpeta District', 'active', true, CURRENT_TIMESTAMP),
         ($2, 'Empty Test Disaster', 'flood', 'Darrang District', 'active', true, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [testDisasterId, emptyDisasterId]
    );

    // 3. Seed controlled citizen reports for disaster-sit-test-2026
    const reportsToInsert = [
      {
        id: 'rep-sit-001',
        description: 'Water level rising near Barpeta High School, 4 people trapped on roof. Need rescue boat immediately.',
        lat: 26.3214,
        lng: 91.0051,
        location_name: 'Barpeta High School',
        contact_number: '9876543210',
      },
      {
        id: 'rep-sit-002', // Duplicate candidate 1: near Barpeta High School (approx 120m away), identical distress
        description: 'Water level rising near Barpeta High School, 4 people trapped on roof. Need boat urgently.',
        lat: 26.3220,
        lng: 91.0058,
        location_name: 'Barpeta High School',
        contact_number: '9876543211',
      },
      {
        id: 'rep-sit-003', // Medical critical emergency
        description: 'Elderly diabetic patient requires urgent insulin at Chenga embankment. Water entering house.',
        lat: 26.2511,
        lng: 91.1205,
        location_name: 'Chenga Embankment',
        contact_number: '9876543212',
      },
      {
        id: 'rep-sit-004', // Water shortage report
        description: 'Submerged bridge in Howly, village cut off from clean drinking water for 25 families.',
        lat: 26.4312,
        lng: 90.9712,
        location_name: 'Howly Bridge',
        contact_number: null,
      },
      {
        id: 'rep-sit-005', // Vague report without location / coordinates
        description: 'Water is very high. Please send help soon.',
        lat: 0,
        lng: 0,
        location_name: null,
        contact_number: null,
      },
    ];

    for (const r of reportsToInsert) {
      await query(
        `INSERT INTO reports (
          id, disaster_id, user_id, location, location_name, description, severity, category, people_affected, medical_need, confidence, is_simulated, status, contact_number
        ) VALUES (
          $1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, 'medium', 'general_distress', null, false, 1.00, true, 'pending_ai', $8
        ) ON CONFLICT (id) DO UPDATE SET status = 'pending_ai'`,
        [
          r.id,
          testDisasterId,
          'usr-sit-citizen',
          r.lng,
          r.lat,
          r.location_name,
          r.description,
          r.contact_number,
        ]
      );
      createdReportIds.push(r.id);
    }

    // 4. Start ephemeral server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    // Clean up test data
    if (createdReportIds.length > 0) {
      await query(`DELETE FROM reports WHERE id = ANY($1::varchar[])`, [createdReportIds]);
    }
    await query(`DELETE FROM situation_analyses WHERE disaster_id = ANY($1::varchar[])`, [[testDisasterId, emptyDisasterId]]);
    await query(`DELETE FROM audit_log WHERE details->>'disaster_id' = ANY($1::text[])`, [[testDisasterId, emptyDisasterId]]);
    await query(`DELETE FROM disasters WHERE id = ANY($1::varchar[])`, [[testDisasterId, emptyDisasterId]]);

    const testUserIds = testUsers.map((u) => u.id);
    await query(`DELETE FROM users WHERE id = ANY($1::varchar[])`, [testUserIds]);

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closePool();
  });

  // ---------------------------------------------------------------------------
  // 1. Authentication & RBAC for POST /api/disasters/:id/analyze
  // ---------------------------------------------------------------------------
  describe('Authentication and RBAC for Disaster Analysis', () => {
    it('should reject unauthenticated requests with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/${testDisasterId}/analyze`, {
        method: 'POST',
      });
      assert.equal(res.status, 401);
    });

    it('should forbid citizen users with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/${testDisasterId}/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${citizenToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should forbid field department responders with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/${testDisasterId}/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${deptToken}` },
      });
      assert.equal(res.status, 403);
    });

    it('should allow command_center role to trigger analysis', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/${testDisasterId}/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 10 }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.disaster_id, testDisasterId);
      assert.ok(data.total_reports_analyzed >= 5);
    });

    it('should allow admin role to trigger analysis', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/${testDisasterId}/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force_reanalyze: true, limit: 10 }),
      });
      assert.equal(res.status, 200);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Disaster ID & Payload Validation
  // ---------------------------------------------------------------------------
  describe('Disaster Validation & Boundary Handling', () => {
    it('should return 404 Not Found for non-existent disaster ID', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/disaster-nonexistent-999/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
      });
      assert.equal(res.status, 404);
      const err = await res.json();
      assert.ok(err.error.includes('not found'));
    });

    it('should return 400 Bad Request for out-of-range limit payload', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/${testDisasterId}/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 9999 }),
      });
      assert.equal(res.status, 400);
    });

    it('should handle disaster with zero reports cleanly (empty set)', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/${emptyDisasterId}/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${commandCenterToken}`,
          'Content-Type': 'application/json',
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.total_reports_analyzed, 0);
      assert.equal(data.clusters.length, 0);
      assert.ok(data.summary.includes('No pending citizen reports'));
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Deterministic NLP Extractor & Zero Hallucination
  // ---------------------------------------------------------------------------
  describe('Deterministic Rule-Based NLP Extraction Quality', () => {
    it('should accurately extract rescue urgency, trapped people, and location', () => {
      const text = 'Water level rising near Barpeta High School, 4 people trapped on roof. Need boat urgently.';
      const res = extractReportDeterministic(text);

      assert.equal(res.disaster_type, 'flood');
      assert.equal(res.category, 'rescue');
      assert.equal(res.severity, 'critical');
      assert.equal(res.people_affected, 4);
      assert.equal(res.medical_need, false);
      assert.ok(res.urgent_needs.includes('rescue'));
      assert.equal(res.extracted_location, 'Barpeta High School');
      assert.ok(res.confidence >= 0.9);
    });

    it('should accurately detect medical need, diabetic insulin dependency, and high severity', () => {
      const text = 'Elderly diabetic patient requires urgent insulin at Chenga embankment.';
      const res = extractReportDeterministic(text);

      assert.equal(res.category, 'medical');
      assert.equal(res.medical_need, true);
      assert.equal(res.severity, 'critical');
      assert.ok(res.urgent_needs.includes('medicine'));
      assert.equal(res.people_affected, 1);
    });

    it('should return null for people_affected when text has no numbers without hallucinating', () => {
      const text = 'Water entering courtyard, supplies needed.';
      const res = extractReportDeterministic(text);

      assert.equal(res.people_affected, null, 'Must never fabricate casualty or people affected numbers');
      assert.equal(res.medical_need, false);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Duplicate Detection & Proximity Clustering
  // ---------------------------------------------------------------------------
  describe('Report Clustering and Duplicate Detection', () => {
    it('should calculate accurate spatial distance using Haversine formula', () => {
      // Points in Barpeta ~ 100 meters apart
      const dist = calculateDistanceMeters(26.3214, 91.0051, 26.3220, 91.0058);
      assert.ok(dist >= 80 && dist <= 150, `Distance should be ~100m, got ${dist}m`);
    });

    it('should calculate accurate text Jaccard similarity', () => {
      const t1 = 'Water level rising near Barpeta High School, 4 people trapped on roof.';
      const t2 = 'Water level rising near Barpeta High School, 4 people trapped on roof. Need boat urgently.';
      const sim = calculateTextJaccardSimilarity(t1, t2);
      assert.ok(sim >= 0.70, `Expected high similarity, got ${sim}`);

      const t3 = 'Sun is shining in the market.';
      const diffSim = calculateTextJaccardSimilarity(t1, t3);
      assert.ok(diffSim < 0.2, `Expected low similarity, got ${diffSim}`);
    });

    it('should cluster reports within 150m and similar text into a duplicate cluster', () => {
      const sampleReports: RawCitizenReport[] = [
        {
          id: 'rep-test-a',
          disaster_id: 'disaster-1',
          user_id: null,
          location_lat: 26.3214,
          location_lng: 91.0051,
          location_name: 'Barpeta High School',
          description: 'Water level rising near Barpeta High School, 4 people trapped on roof.',
          severity: 'critical',
          category: 'rescue',
          people_affected: 4,
          medical_need: false,
          confidence: 0.95,
          is_simulated: true,
          status: 'analyzed',
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'rep-test-b',
          disaster_id: 'disaster-1',
          user_id: null,
          location_lat: 26.3220,
          location_lng: 91.0058,
          location_name: 'Barpeta High School',
          description: 'Water level rising near Barpeta High School, 4 people trapped on roof. Need boat.',
          severity: 'critical',
          category: 'rescue',
          people_affected: 4,
          medical_need: false,
          confidence: 0.95,
          is_simulated: true,
          status: 'analyzed',
          created_at: new Date().toISOString(),
        },
      ];

      const clusters = detectReportClusters(sampleReports);
      assert.equal(clusters.length, 1);
      assert.equal(clusters[0].total_reports, 2);
      assert.equal(clusters[0].primary_report_id, 'rep-test-a');
      assert.ok(clusters[0].duplicate_report_ids.includes('rep-test-b'));
      assert.ok(clusters[0].confidence >= 0.85);
      assert.equal(clusters[0].combined_people_estimate, 4, 'Must not double count 4 + 4 = 8');
    });

    it('should NOT merge reports with similar text if they are geographically far apart', () => {
      const sampleReports: RawCitizenReport[] = [
        {
          id: 'rep-zone-a',
          disaster_id: 'disaster-1',
          user_id: null,
          location_lat: 26.3214, // Barpeta
          location_lng: 91.0051,
          location_name: 'Barpeta Town',
          description: 'Water level rising, 4 people trapped on roof.',
          severity: 'critical',
          category: 'rescue',
          people_affected: 4,
          medical_need: false,
          confidence: 0.95,
          is_simulated: true,
          status: 'analyzed',
          created_at: new Date().toISOString(),
        },
        {
          id: 'rep-zone-g',
          disaster_id: 'disaster-1',
          user_id: null,
          location_lat: 26.7511, // Distant location (>50km away)
          location_lng: 92.1205,
          location_name: 'Mangaldai Riverbank',
          description: 'Water level rising, 4 people trapped on roof.',
          severity: 'critical',
          category: 'rescue',
          people_affected: 4,
          medical_need: false,
          confidence: 0.95,
          is_simulated: true,
          status: 'analyzed',
          created_at: new Date().toISOString(),
        },
      ];

      const clusters = detectReportClusters(sampleReports);
      assert.equal(clusters.length, 0, 'Text similarity alone without geographic proximity must NOT form duplicate cluster');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Situation Analysis Persistence & Read Endpoint
  // ---------------------------------------------------------------------------
  describe('Situation Analysis Persistence & Retrieval', () => {
    it('should persist analysis and retrieve it via GET /api/disasters/:id/situation', async () => {
      // 1. Run analysis
      const postRes = await fetch(`${baseUrl}/api/disasters/${testDisasterId}/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${officerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force_reanalyze: true }),
      });
      assert.equal(postRes.status, 200);
      const postData = await postRes.json();
      assert.ok(postData.id);
      assert.ok(postData.reported_facts.length > 0);
      assert.ok(postData.inferred_findings.length > 0);

      // 2. Fetch via GET /api/disasters/:id/situation
      const getRes = await fetch(`${baseUrl}/api/disasters/${testDisasterId}/situation`);
      assert.equal(getRes.status, 200);
      const getData = await getRes.json();
      assert.equal(getData.id, postData.id);
      assert.equal(getData.disaster_id, testDisasterId);
      assert.ok(getData.categories_breakdown);
      assert.ok(getData.urgent_needs.length > 0);
    });

    it('should verify citizen reports in database have status updated to analyzed', async () => {
      const dbRes = await query(
        `SELECT id, status, duplicate_cluster_id, ai_extracted FROM reports WHERE id = ANY($1::varchar[])`,
        [createdReportIds]
      );
      assert.ok(dbRes.rows.length >= 5);
      dbRes.rows.forEach((r) => {
        assert.equal(r.status, 'analyzed', `Report ${r.id} should have status 'analyzed'`);
        assert.ok(r.ai_extracted, `Report ${r.id} should have ai_extracted JSON`);
      });

      // At least one report should be linked to a duplicate_cluster_id
      const clustered = dbRes.rows.filter((r) => r.duplicate_cluster_id !== null);
      assert.ok(clustered.length >= 2, 'Expected rep-sit-001 and rep-sit-002 to be clustered');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Non-Mutation of Inventory & Zero Auto-Dispatch Safety
  // ---------------------------------------------------------------------------
  describe('Safety & Operational Boundaries Guarantee', () => {
    it('guarantees that report analysis NEVER deducts warehouse inventory or auto-dispatches', async () => {
      // Inventory snapshot before
      const invBefore = await query<{ sum: string }>('SELECT coalesce(sum(quantity), 0) as sum FROM resources');
      const plansBefore = await query<{ count: string }>(
        "SELECT count(*) as count FROM recommendations WHERE status IN ('approved', 'in_transit', 'delivered')"
      );

      // Execute repeated analysis
      const res = await fetch(`${baseUrl}/api/disasters/${testDisasterId}/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ force_reanalyze: true }),
      });
      assert.equal(res.status, 200);

      // Inventory snapshot after
      const invAfter = await query<{ sum: string }>('SELECT coalesce(sum(quantity), 0) as sum FROM resources');
      const plansAfter = await query<{ count: string }>(
        "SELECT count(*) as count FROM recommendations WHERE status IN ('approved', 'in_transit', 'delivered')"
      );

      assert.equal(invAfter.rows[0].sum, invBefore.rows[0].sum, 'Report analysis must NEVER deduct warehouse resources');
      assert.equal(plansAfter.rows[0].count, plansBefore.rows[0].count, 'Report analysis must NEVER auto-approve or auto-dispatch plans');
    });

    it('verifies that audit log records SITUATION_ANALYSIS_EXECUTED without citizen contact numbers', async () => {
      const auditRes = await query(
        "SELECT id, action, details FROM audit_log WHERE action = 'SITUATION_ANALYSIS_EXECUTED' ORDER BY id DESC LIMIT 1"
      );
      assert.equal(auditRes.rows.length, 1);
      const audit = auditRes.rows[0];
      assert.equal(audit.action, 'SITUATION_ANALYSIS_EXECUTED');
      assert.equal(audit.details.disaster_id, testDisasterId);

      const jsonStr = JSON.stringify(audit.details);
      assert.equal(jsonStr.includes('9876543210'), false, 'Sensitive contact number must NEVER be logged in audit log');
    });
  });
});
