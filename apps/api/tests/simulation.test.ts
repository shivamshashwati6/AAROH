import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import app from '../src/index';
import { query, closePool } from '../src/db';
import { generateAccessToken } from '../src/services/auth';

let server: Server;
let baseUrl: string;

let officerToken: string;
let commandCenterToken: string;
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

  // Seed test users
  await query(
    `INSERT INTO users (id, name, email, password_hash, role, department)
     VALUES 
       ('usr-sim-off', 'Simulation Officer', 'officer@sim-test.org', '$2b$10$abcdefghijklmnopqrstuu', 'officer', NULL),
       ('usr-sim-cmd', 'Simulation Commander', 'cmd@sim-test.org', '$2b$10$abcdefghijklmnopqrstuu', 'command_center', NULL),
       ('usr-sim-adm', 'Simulation Admin', 'admin@sim-test.org', '$2b$10$abcdefghijklmnopqrstuu', 'admin', NULL),
       ('usr-sim-cit', 'Simulation Citizen', 'cit@sim-test.org', '$2b$10$abcdefghijklmnopqrstuu', 'citizen', NULL)
     ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role`
  );

  officerToken = generateAccessToken({
    id: 'usr-sim-off',
    name: 'Simulation Officer',
    email: 'officer@sim-test.org',
    role: 'officer',
  }).token;

  commandCenterToken = generateAccessToken({
    id: 'usr-sim-cmd',
    name: 'Simulation Commander',
    email: 'cmd@sim-test.org',
    role: 'command_center',
  }).token;

  adminToken = generateAccessToken({
    id: 'usr-sim-adm',
    name: 'Simulation Admin',
    email: 'admin@sim-test.org',
    role: 'admin',
  }).token;

  citizenToken = generateAccessToken({
    id: 'usr-sim-cit',
    name: 'Simulation Citizen',
    email: 'cit@sim-test.org',
    role: 'citizen',
  }).token;
});

const simUserIds = ['usr-sim-off', 'usr-sim-cmd', 'usr-sim-adm', 'usr-sim-cit'];

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await query("DELETE FROM simulation_runs WHERE user_id = ANY($1::varchar[])", [simUserIds]);
  await query("DELETE FROM audit_log WHERE user_id = ANY($1::varchar[])", [simUserIds]);
  await query("DELETE FROM users WHERE id = ANY($1::varchar[])", [simUserIds]);
  await closePool();
});

describe('RELIEF-OS What-If Simulation Engine API Integration Tests', () => {
  // ---------------------------------------------------------------------------
  // 1. Role-Based Access Control & Authentication
  // ---------------------------------------------------------------------------
  describe('Authentication & Role Restrictions', () => {
    it('should reject unauthenticated request with 401', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_type: 'fleet_reduction', remove_boats: 2 }),
      });
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.ok(data.error.includes('Authentication required'));
    });

    it('should forbid citizen role with 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${citizenToken}`,
        },
        body: JSON.stringify({ scenario_type: 'fleet_reduction', remove_boats: 2 }),
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.ok(data.error.includes('Forbidden'));
    });

    it('should allow command_center, officer, and admin roles', async () => {
      for (const token of [officerToken, commandCenterToken, adminToken]) {
        const res = await fetch(`${baseUrl}/api/simulation/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
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
        assert.ok(data.simulation_id.startsWith('sim-'));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Scenario 1: Fleet Reduction
  // ---------------------------------------------------------------------------
  describe('Scenario 1: Fleet Reduction', () => {
    it('should calculate baseline vs simulated boat allocation and track deficit', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          center_id: 'center-3',
          remove_boats: 4, // Remove all 4 boats at Barpeta Base #3
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.zone_id, 'zone-a');
      assert.equal(data.scenario_type, 'fleet_reduction');

      // Requested boats for Zone A is 4
      const boatDiff = data.comparison.resources.find((r: any) => r.resource_type === 'boats');
      assert.ok(boatDiff);
      assert.equal(boatDiff.requested_quantity, 4);
      assert.equal(boatDiff.baseline_allocated, 4);

      // Center 3 had 4 boats, removing 4 means Center 3 has 0 boats left.
      // Other centers (Guwahati: 1, Nalbari: 1, Dhubri: 1, Goalpara: 1) total 4 boats remaining.
      // Greedily allocated from next closest centers: Nalbari (1), Goalpara (1), Guwahati (1), Dhubri (1)
      assert.equal(boatDiff.simulated_allocated, 4);
      assert.equal(boatDiff.simulated_unmet, 0);

      // Check supplying centers diff shows Center 3 lost allocation
      const c3Diff = data.comparison.supplying_centers_diff.find(
        (c: any) => c.center_id === 'center-3' && c.resource_type === 'boats'
      );
      assert.ok(c3Diff);
      assert.equal(c3Diff.delta, -4);
    });

    it('should detect new shortage when boat reduction exceeds total regional reserve', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          remove_boats: 6, // Remove 6 boats out of 8 total regional boats
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      const boatDiff = data.comparison.resources.find((r: any) => r.resource_type === 'boats');
      assert.ok(boatDiff);
      assert.equal(boatDiff.requested_quantity, 4);
      // Only 2 boats remain in region (8 - 6 = 2)
      assert.equal(boatDiff.simulated_allocated, 2);
      assert.equal(boatDiff.simulated_unmet, 2);
      assert.equal(boatDiff.unmet_increase, 2);
      assert.equal(boatDiff.shortage_status, 'new_shortage');

      assert.ok(data.suggested_mitigations.length > 0);
    });

    it('should reject reduction exceeding available vehicles or boats with 400', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          remove_boats: 50, // Only 8 boats exist in region
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Cannot remove 50 boats'));
    });

    it('should reject negative or non-integer fleet values with 400', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          remove_boats: -2,
        }),
      });

      assert.equal(res.status, 400);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Scenario 2: Inventory Reduction
  // ---------------------------------------------------------------------------
  describe('Scenario 2: Inventory Reduction', () => {
    it('should calculate food kit depletion across regional depots and report diffs', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'inventory_reduction',
          reduce_stock_pct: 50,
          resource_type: 'food_kits',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      const foodDiff = data.comparison.resources.find((r: any) => r.resource_type === 'food_kits');
      assert.ok(foodDiff);
      assert.equal(foodDiff.requested_quantity, 1200);
      // Regional food kits originally 15,200. At 50%, 7,600 remain, which still fulfills 1,200 demand
      assert.equal(foodDiff.simulated_allocated, 1200);
      assert.equal(foodDiff.simulated_unmet, 0);
    });

    it('should detect critical food shortage when reduction wipes out sufficient stock', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'inventory_reduction',
          reduce_stock_pct: 95, // 95% loss of all food and water
          resource_type: 'food_kits',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      const foodDiff = data.comparison.resources.find((r: any) => r.resource_type === 'food_kits');
      assert.ok(foodDiff);
      assert.equal(foodDiff.requested_quantity, 1200);
      // 5% of 16,200 is 810 kits available across all centers (Center 1: 250, Center 2: 160, Center 3: 200, Center 4: 75, Center 5: 125)
      assert.equal(foodDiff.simulated_allocated, 810);
      assert.equal(foodDiff.simulated_unmet, 390);
      assert.equal(foodDiff.shortage_status, 'new_shortage');

      assert.ok(data.comparison.new_shortages_detected.length > 0);
    });

    it('should reject invalid reduce_stock_pct values (< 1 or > 100) with 400', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'inventory_reduction',
          reduce_stock_pct: 120,
        }),
      });

      assert.equal(res.status, 400);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Scenario 3: Road Blockage
  // ---------------------------------------------------------------------------
  describe('Scenario 3: Road Blockage', () => {
    it('should simulate road blockage and return honest routing impact report', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'road_blockage',
          blocked_road_id: 'route-c',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(data.comparison.road_impact);
      assert.equal(data.comparison.road_impact.road_id, 'route-c');
      assert.equal(data.comparison.road_impact.simulated_status, 'blocked');
      assert.equal(data.comparison.road_impact.length_km, 17.4);
      assert.ok(
        data.comparison.road_impact.routing_impact_notice.includes(
          'Automated algorithmic graph rerouting is not implemented'
        )
      );
    });

    it('should return 404 when road segment does not exist', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'road_blockage',
          blocked_road_id: 'non-existent-road-xyz',
        }),
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.ok(data.error.includes("Road segment with ID 'non-existent-road-xyz' not found"));
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Scenario 4: Compound Stress-Test (Simultaneous Disruption)
  // ---------------------------------------------------------------------------
  describe('Scenario 4: Compound Stress-Test (Simultaneous Multi-Vector Disruption)', () => {
    it('should simultaneously apply fleet deduction, inventory reduction, and road blockage in a single run', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          center_id: 'center-3',
          scenario_type: 'compound',
          remove_vehicles: 2,
          remove_boats: 2,
          reduce_stock_pct: 50,
          blocked_road_id: 'route-c',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();

      assert.equal(data.scenario_type, 'compound');
      assert.ok(data.simulation_id);

      // Verify all 4 resource categories are returned using identical units
      const foodDiff = data.comparison.resources.find((r: any) => r.resource_type === 'food_kits');
      const waterDiff = data.comparison.resources.find((r: any) => r.resource_type === 'water_units');
      const boatDiff = data.comparison.resources.find((r: any) => r.resource_type === 'boats');
      const medDiff = data.comparison.resources.find((r: any) => r.resource_type === 'medical_teams');

      assert.ok(foodDiff);
      assert.equal(foodDiff.unit, 'kits');
      assert.equal(foodDiff.requested_quantity, 1200);

      assert.ok(waterDiff);
      assert.equal(waterDiff.unit, 'units');
      assert.equal(waterDiff.requested_quantity, 800);

      assert.ok(boatDiff);
      assert.equal(boatDiff.unit, 'boats');
      assert.equal(boatDiff.requested_quantity, 4);
      // Multi-center split delivery satisfies 4 boats: Center 3 contribution drops by 2, and neighboring bases absorb the rest
      assert.equal(boatDiff.simulated_allocated, 4);
      assert.equal(boatDiff.simulated_unmet, 0);

      // Verify supplying center changes track that Center 3 contribution decreased by 2
      const centerChanges = data.comparison.supplying_centers_diff || data.comparison.supplying_center_changes;
      assert.ok(centerChanges);
      const center3Change = centerChanges.find(
        (c: any) => c.center_id === 'center-3' && c.resource_type === 'boats'
      );
      assert.ok(center3Change);
      assert.equal(center3Change.delta, -2);

      assert.ok(medDiff);
      assert.equal(medDiff.unit, 'teams');
      assert.equal(medDiff.requested_quantity, 1);

      // Verify road impact is simultaneously included
      assert.ok(data.comparison.road_impact);
      assert.equal(data.comparison.road_impact.road_id, 'route-c');
      assert.equal(data.comparison.road_impact.simulated_status, 'blocked');
      assert.ok(
        data.comparison.road_impact.routing_impact_notice.includes(
          'Automated algorithmic graph rerouting is not implemented'
        )
      );

      // Verify center deltas
      assert.ok(centerChanges.length > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Validation and Entity Boundaries
  // ---------------------------------------------------------------------------
  describe('Input Validation & Entity Boundaries', () => {
    it('should return 404 when zone does not exist', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'phantom-zone-999',
          scenario_type: 'fleet_reduction',
          remove_boats: 1,
        }),
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.ok(data.error.includes("Zone with ID 'phantom-zone-999' not found"));
    });

    it('should return 404 when center_id does not exist', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          center_id: 'center-phantom',
          remove_boats: 1,
        }),
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.ok(data.error.includes("Resource center with ID 'center-phantom' not found"));
    });

    it('should return 400 for unsupported scenario types', async () => {
      const res = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'alien_invasion',
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes('Invalid simulation parameters'));
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Zero Operational State Mutation Guarantee
  // ---------------------------------------------------------------------------
  describe('Non-Mutation Guarantee (PRD Safety)', () => {
    it('guarantees that real resources, fleet, and road segments remain 100% unchanged after simulation', async () => {
      // 1. Snapshot database state before simulations
      const preResources = await query('SELECT center_id, resource_type, quantity FROM resources ORDER BY id');
      const preCenters = await query('SELECT id, vehicles_available, boats_available FROM resource_centers ORDER BY id');
      const preRoads = await query('SELECT id, status FROM road_segments ORDER BY id');

      // 2. Run multiple stress-test simulations with extreme reductions
      await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          remove_boats: 4,
          remove_vehicles: 5,
        }),
      });

      await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'inventory_reduction',
          reduce_stock_pct: 80,
        }),
      });

      await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'road_blockage',
          blocked_road_id: 'route-c',
        }),
      });

      // 3. Snapshot database state after simulations
      const postResources = await query('SELECT center_id, resource_type, quantity FROM resources ORDER BY id');
      const postCenters = await query('SELECT id, vehicles_available, boats_available FROM resource_centers ORDER BY id');
      const postRoads = await query('SELECT id, status FROM road_segments ORDER BY id');

      // 4. Strictly assert zero mutations
      assert.deepEqual(preResources.rows, postResources.rows);
      assert.deepEqual(preCenters.rows, postCenters.rows);

      // Verify simulated road segment (route-c) was NOT mutated in database (remains accessible)
      const routeCPost = postRoads.rows.find((r) => r.id === 'route-c');
      const routeCPre = preRoads.rows.find((r) => r.id === 'route-c');
      assert.ok(routeCPost);
      assert.equal(routeCPost.status, routeCPre?.status);
      assert.equal(routeCPost.status, 'accessible');
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Determinism Guarantee
  // ---------------------------------------------------------------------------
  describe('Mathematical Determinism', () => {
    it('produces strictly identical results for repeated identical simulation runs', async () => {
      const payload = {
        zone_id: 'zone-a',
        scenario_type: 'inventory_reduction',
        reduce_stock_pct: 40,
        planning_days: 3,
      };

      const res1 = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data1 = await res1.json();

      const res2 = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify(payload),
      });
      const data2 = await res2.json();

      assert.deepEqual(data1.comparison.resources, data2.comparison.resources);
      assert.deepEqual(data1.simulated.allocation.allocations, data2.simulated.allocation.allocations);
      assert.deepEqual(data1.comparison.new_shortages_detected, data2.comparison.new_shortages_detected);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Persistence in simulation_runs & Audit Log
  // ---------------------------------------------------------------------------
  describe('Persistence and Historical Run Retrieval', () => {
    it('should persist simulation run in database and allow retrieval via GET /api/simulation/runs', async () => {
      const runRes = await fetch(`${baseUrl}/api/simulation/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${officerToken}`,
        },
        body: JSON.stringify({
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          remove_boats: 2,
        }),
      });

      assert.equal(runRes.status, 200);
      const runData = await runRes.json();
      assert.equal(runData.persisted, true);

      // Verify row exists in simulation_runs table
      const dbRes = await query('SELECT id, user_id, base_snapshot, changes, result FROM simulation_runs WHERE id = $1', [
        runData.simulation_id,
      ]);
      assert.equal(dbRes.rows.length, 1);
      assert.equal(dbRes.rows[0].user_id, 'usr-sim-off');

      // Verify audit log record
      const auditRes = await query(
        "SELECT id, action, details FROM audit_log WHERE action = 'SIMULATION_RUN' AND user_id = $1 ORDER BY id DESC LIMIT 1",
        ['usr-sim-off']
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].details.simulation_id, runData.simulation_id);

      // Verify listing endpoint
      const listRes = await fetch(`${baseUrl}/api/simulation/runs`, {
        headers: { Authorization: `Bearer ${officerToken}` },
      });
      assert.equal(listRes.status, 200);
      const listData = await listRes.json();
      assert.ok(listData.items.length >= 1);
      assert.ok(listData.items.some((item: any) => item.id === runData.simulation_id));

      // Verify single get endpoint
      const singleRes = await fetch(`${baseUrl}/api/simulation/runs/${runData.simulation_id}`, {
        headers: { Authorization: `Bearer ${officerToken}` },
      });
      assert.equal(singleRes.status, 200);
      const singleData = await singleRes.json();
      assert.equal(singleData.id, runData.simulation_id);
    });
  });
});
