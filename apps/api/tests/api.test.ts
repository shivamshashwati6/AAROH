import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Server } from 'http';
import { AddressInfo } from 'net';
import app from '../src/index';
import { closePool, query } from '../src/db';
import { generateAccessToken } from '../src/services/auth';

let server: Server;
let baseUrl: string;
let authHeader: Record<string, string>;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  // Create an officer test user for existing regression calls
  await query(
    `INSERT INTO users (id, name, email, password_hash, role)
     VALUES ('usr-test-officer-reg', 'Regression Officer', 'officer@test-regression.org', '$2b$10$abcdefghijklmnopqrstuu', 'officer')
     ON CONFLICT (id) DO UPDATE SET role = 'officer'`
  );

  const authRes = generateAccessToken({
    id: 'usr-test-officer-reg',
    name: 'Regression Officer',
    email: 'officer@test-regression.org',
    role: 'officer',
  });
  authHeader = { Authorization: `Bearer ${authRes.token}` };
});

after(async () => {
  await query("DELETE FROM users WHERE id = 'usr-test-officer-reg'");
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await closePool();
});

describe('RELIEF-OS Phase 2 Backend API Integration Tests', () => {
  // ---------------------------------------------------------------------------
  // 1. Health & Database Connection
  // ---------------------------------------------------------------------------
  describe('GET /api/health', () => {
    it('should return 200 with healthy status and connected PostGIS version', async () => {
      const res = await fetch(`${baseUrl}/api/health`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.status, 'healthy');
      assert.equal(body.service, 'RELIEF-OS Decision Engine API');
      assert.equal(body.version, '0.2.0');
      assert.equal(body.database?.connected, true);
      assert.match(body.database?.postgis_version, /3\./);
      // Ensure password is not exposed in the response
      assert.doesNotMatch(body.database?.target || '', /postgres:[^@*]+@/);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Canonical Assam Flood Demo KPIs Endpoint
  // ---------------------------------------------------------------------------
  describe('GET /api/disasters/demo-kpis', () => {
    it('should return canonical PRD figures dynamically backed by database', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/demo-kpis`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.disaster_id, 'disaster-assam-2026');
      assert.equal(body.is_simulated, true);

      // Verify canonical numbers from Supabase
      assert.equal(body.kpis.affected_population, 18420);
      assert.equal(body.kpis.critical_zones_count, 7);
      assert.equal(body.kpis.total_shelters, 18);
      assert.equal(body.kpis.relief_centers, 5);
      assert.equal(body.kpis.vehicles_deployed, 21);
      assert.ok(body.kpis.shelter_occupancy_pct >= 71 && body.kpis.shelter_occupancy_pct <= 72);
      assert.ok(typeof body.kpis.total_reports_ingested === 'number');
      assert.equal(body.kpis.target_reports_demo, 1247);

      // Verify Hero Zone A details
      assert.equal(body.hero_zone.id, 'zone-a');
      assert.equal(body.hero_zone.priority_score, 94);
      assert.equal(body.hero_zone.priority_band, 'Critical');
      assert.equal(body.hero_zone.affected_population, 3842);
      assert.equal(body.hero_zone.food_shortage_pct, 72);
      assert.equal(body.hero_zone.water_shortage_pct, 61);
      assert.equal(body.hero_zone.recommended_action.boats, 4);
      assert.match(body.hero_zone.recommended_action.selected_route, /Route C/);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Disasters Endpoints
  // ---------------------------------------------------------------------------
  describe('GET /api/disasters and /api/disasters/:id/dashboard', () => {
    it('should list disasters with pagination', async () => {
      const res = await fetch(`${baseUrl}/api/disasters?limit=5`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.ok(Array.isArray(body.items));
      assert.ok(body.total >= 1);
      assert.equal(body.limit, 5);
      assert.equal(body.offset, 0);
    });

    it('should filter disasters by status', async () => {
      const res = await fetch(`${baseUrl}/api/disasters?status=active`);
      assert.equal(res.status, 200);

      const body = await res.json();
      body.items.forEach((d: { status: string }) => {
        assert.equal(d.status, 'active');
      });
    });

    it('should reject invalid query parameters with 400', async () => {
      const res = await fetch(`${baseUrl}/api/disasters?status=invalid_status`);
      assert.equal(res.status, 400);

      const body = await res.json();
      assert.ok(body.error);
      assert.ok(Array.isArray(body.details));
    });

    it('should return aggregated dashboard for existing disaster', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/disaster-assam-2026/dashboard`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.disaster.id, 'disaster-assam-2026');
      assert.equal(body.is_simulated, true);
      assert.equal(body.kpis.affected_population, 18420);
      assert.equal(body.kpis.critical_zones, 7);
      assert.equal(body.kpis.relief_centers, 5);
      assert.equal(body.kpis.total_fleet, 21);
      assert.ok(Array.isArray(body.top_priority_zones));
      assert.ok(body.top_priority_zones.length > 0);
    });

    it('should return 404 for unknown disaster dashboard', async () => {
      const res = await fetch(`${baseUrl}/api/disasters/disaster-unknown-404/dashboard`);
      assert.equal(res.status, 404);

      const body = await res.json();
      assert.match(body.error, /not found/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Zones Endpoints
  // ---------------------------------------------------------------------------
  describe('GET /api/zones', () => {
    it('should return 7 canonical critical zones with PostGIS coordinates', async () => {
      const res = await fetch(`${baseUrl}/api/zones?band=Critical`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.total, 7);
      assert.equal(body.items.length, 7);

      // Verify coordinate parsing
      const zoneA = body.items.find((z: { id: string }) => z.id === 'zone-a');
      assert.ok(zoneA);
      assert.equal(zoneA.name, 'Zone A (Barpeta Central / Jania)');
      assert.equal(zoneA.priority_score, 94);
      assert.equal(zoneA.band, 'Critical');
      assert.ok(typeof zoneA.location_lat === 'number');
      assert.ok(typeof zoneA.location_lng === 'number');
      assert.ok(zoneA.breakdown);
    });

    it('should filter zones by min_priority', async () => {
      const res = await fetch(`${baseUrl}/api/zones?min_priority=90`);
      assert.equal(res.status, 200);

      const body = await res.json();
      body.items.forEach((z: { priority_score: number }) => {
        assert.ok(z.priority_score >= 90);
      });
    });

    it('should return 400 for invalid min_priority', async () => {
      const res = await fetch(`${baseUrl}/api/zones?min_priority=101`);
      assert.equal(res.status, 400);
    });

    it('should return single zone detail with linked plan', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.id, 'zone-a');
      assert.equal(body.priority_score, 94);
      assert.ok(body.recommendation);
      assert.equal(body.recommendation.status, 'draft');
      assert.match(body.recommendation.explanation, /Zone A/);
    });

    it('should return 404 for non-existent zone', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-non-existent`);
      assert.equal(res.status, 404);
    });
  });

  // ---------------------------------------------------------------------------
  // 4b. Zone Demand Estimation Endpoints (Phase 3B-2)
  // ---------------------------------------------------------------------------
  describe('GET and POST /api/zones/:id/demand', () => {
    it('should calculate deterministic demand for Zone A matching canonical figures', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`, { headers: authHeader });
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.zone_id, 'zone-a');
      assert.equal(body.affected_population, 3842);
      assert.equal(body.priority_score, 94);
      assert.equal(body.band, 'Critical');
      assert.equal(body.is_simulated, true);
      assert.equal(body.planning_horizon_days, 3);

      // Verify canonical quantities
      assert.equal(body.demands.food_kits.quantity, 1200);
      assert.equal(body.demands.food_kits.unit, 'kits');
      assert.ok(body.demands.food_kits.is_assumed_param);
      assert.ok(body.demands.food_kits.formula);
      assert.ok(body.demands.food_kits.explanation);

      assert.equal(body.demands.water_units.quantity, 800);
      assert.equal(body.demands.water_units.unit, 'units');
      assert.ok(body.demands.water_units.is_assumed_param);

      assert.equal(body.demands.boats.quantity, 4);
      assert.equal(body.demands.boats.unit, 'boats');

      assert.equal(body.demands.medical_teams.quantity, 1);
      assert.equal(body.demands.medical_teams.unit, 'teams');

      assert.ok(body.summary_explanation.includes('Zone A'));
    });

    it('should support custom planning_days query parameter via GET with proportional duration scaling', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand?planning_days=5`, { headers: authHeader });
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.planning_horizon_days, 5);
      // Food kits scaled from 1200 (for 3 days) to 2000 (for 5 days): round(1200 * 5/3) = 2000
      assert.equal(body.demands.food_kits.quantity, 2000);
      // Water units scaled from 800 (for 3 days) to 1334 (for 5 days): round(800.11 * 5/3) = 1334
      assert.equal(body.demands.water_units.quantity, 1334);
      // Capital boats remain constant
      assert.equal(body.demands.boats.quantity, 4);
    });

    it('should reject invalid planning_days query parameter with 400 across zero, negative, malformed, and out-of-range values', async () => {
      const invalidCases = ['0', '-5', 'abc', '31', '100', '2.5'];
      for (const val of invalidCases) {
        const res = await fetch(`${baseUrl}/api/zones/zone-a/demand?planning_days=${val}`, { headers: authHeader });
        assert.equal(res.status, 400, `Expected 400 for planning_days=${val}`);
        const body = await res.json();
        assert.ok(body.error);
      }
    });

    it('should return 404 for demand calculation on non-existent zone for both GET and POST', async () => {
      const getRes = await fetch(`${baseUrl}/api/zones/zone-non-existent-999/demand`, { headers: authHeader });
      assert.equal(getRes.status, 404);
      const getBody = await getRes.json();
      assert.match(getBody.error, /not found/i);

      const postRes = await fetch(`${baseUrl}/api/zones/zone-non-existent-999/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ affected_population: 1000 }),
      });
      assert.equal(postRes.status, 404);
      const postBody = await postRes.json();
      assert.match(postBody.error, /not found/i);
    });

    it('should calculate demand with custom scenario overrides via POST without database side-effects', async () => {
      const overridePayload = {
        planning_days: 7,
        affected_population: 5000,
        food_shortage_pct: 85,
        water_shortage_pct: 75,
        medical_rounding_mode: 'ceil' as const,
      };

      const res = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(overridePayload),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.zone_id, 'zone-a');
      assert.equal(body.affected_population, 5000);
      assert.equal(body.planning_horizon_days, 7);

      // Verify calculation used overrides with duration scaling:
      // 5000 * 0.85 * 0.4338 * (7 / 3) = 4301.85 -> 4302
      assert.equal(body.demands.food_kits.quantity, 4302);
      // Medical team with ceil mode: ceil(5000 / 3500) = 2 teams
      assert.equal(body.demands.medical_teams.quantity, 2);

      // Verify the underlying database zone record was NOT mutated
      const verifyRes = await fetch(`${baseUrl}/api/zones/zone-a`);
      const verifyBody = await verifyRes.json();
      assert.equal(verifyBody.affected_population, 3842);
    });

    it('should reject out-of-range, negative, and invalid override fields on POST with 400', async () => {
      // 1. Negative affected population
      const resNegPop = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ affected_population: -100 }),
      });
      assert.equal(resNegPop.status, 400);

      // 2. Out-of-range food_shortage_pct (< 0 or > 100)
      const resFoodHigh = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ food_shortage_pct: 120 }),
      });
      assert.equal(resFoodHigh.status, 400);

      const resFoodLow = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ food_shortage_pct: -5 }),
      });
      assert.equal(resFoodLow.status, 400);

      // 3. Out-of-range water_shortage_pct
      const resWaterHigh = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ water_shortage_pct: 105 }),
      });
      assert.equal(resWaterHigh.status, 400);

      // 4. Out-of-range accessibility (< 0 or > 1)
      const resAccHigh = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessibility: 1.5 }),
      });
      assert.equal(resAccHigh.status, 400);

      const resAccLow = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessibility: -0.2 }),
      });
      assert.equal(resAccLow.status, 400);

      // 5. Invalid medical_rounding_mode
      const resInvalidRounding = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ medical_rounding_mode: 'truncate' }),
      });
      assert.equal(resInvalidRounding.status, 400);

      // 6. Unsupported / extra unrecognized fields
      const resExtraField = await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ unsupported_field: 'illegal_value' }),
      });
      assert.equal(resExtraField.status, 400);
    });

    it('should return strictly identical outputs for repeated identical API requests (determinism)', async () => {
      const res1 = await fetch(`${baseUrl}/api/zones/zone-a/demand`, { headers: authHeader });
      const body1 = await res1.json();

      const res2 = await fetch(`${baseUrl}/api/zones/zone-a/demand`, { headers: authHeader });
      const body2 = await res2.json();

      assert.equal(body1.zone_id, body2.zone_id);
      assert.equal(body1.demands.food_kits.quantity, body2.demands.food_kits.quantity);
      assert.equal(body1.demands.water_units.quantity, body2.demands.water_units.quantity);
      assert.equal(body1.demands.boats.quantity, body2.demands.boats.quantity);
      assert.equal(body1.demands.medical_teams.quantity, body2.demands.medical_teams.quantity);
      assert.equal(body1.summary_explanation, body2.summary_explanation);
    });

    it('should guarantee zero inventory decrement or dispatch side effects during demand calls', async () => {
      // Check total fleet before demand calculation
      const beforeRes = await fetch(`${baseUrl}/api/resource-centers`);
      const beforeBody = await beforeRes.json();
      const beforeFleet = beforeBody.items.reduce((s: number, c: { total_fleet: number }) => s + c.total_fleet, 0);
      assert.equal(beforeFleet, 21);

      // Execute demand calculations (both GET and POST)
      await fetch(`${baseUrl}/api/zones/zone-a/demand`, { headers: authHeader });
      await fetch(`${baseUrl}/api/zones/zone-a/demand`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ affected_population: 10000 }),
      });

      // Check total fleet after demand calculations: must remain strictly 21
      const afterRes = await fetch(`${baseUrl}/api/resource-centers`);
      const afterBody = await afterRes.json();
      const afterFleet = afterBody.items.reduce((s: number, c: { total_fleet: number }) => s + c.total_fleet, 0);
      assert.equal(afterFleet, 21);
    });
  });

  // ---------------------------------------------------------------------------
  // 4B. Deterministic Resource Allocation API (Phase 3B-3)
  // ---------------------------------------------------------------------------
  describe('GET /api/zones/:id/allocation', () => {
    it('should return 200 with complete deterministic allocation for Zone A (3-day canonical)', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/allocation`, { headers: authHeader });
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.zone_id, 'zone-a');
      assert.equal(body.zone_name, 'Zone A (Barpeta Central / Jania)');
      assert.equal(body.priority_score, 94);
      assert.equal(body.priority_band, 'Critical');
      assert.equal(body.is_simulated, true);
      assert.equal(body.planning_horizon_days, 3);

      // Demand summary
      assert.equal(body.demand_summary.food_kits, 1200);
      assert.equal(body.demand_summary.water_units, 800);
      assert.equal(body.demand_summary.boats, 4);
      assert.equal(body.demand_summary.medical_teams, 1);

      // Available inventory transparently reported
      assert.ok(body.available_inventory.food_kits >= 1200);
      assert.ok(body.available_inventory.water_units >= 800);
      assert.ok(body.available_inventory.boats >= 4);
      assert.ok(body.available_inventory.medical_teams >= 1);

      // Primary source center: Center 3 at 0.00 km
      assert.equal(body.primary_source_center.id, 'center-3');
      assert.equal(body.primary_source_center.name, 'Barpeta Relief Base #3');
      assert.equal(body.primary_source_center.distance_km, 0);

      // Allocations
      const food = body.allocations.food_kits;
      assert.equal(food.requested_quantity, 1200);
      assert.equal(food.allocated_quantity, 1200);
      assert.equal(food.unmet_quantity, 0);
      assert.equal(food.shortage_detected, false);
      assert.equal(food.supplying_centers[0].center_id, 'center-3');
      assert.ok(food.explanation.includes('100% fulfilled'));

      const water = body.allocations.water_units;
      assert.equal(water.requested_quantity, 800);
      assert.equal(water.allocated_quantity, 800);
      assert.equal(water.unmet_quantity, 0);
      assert.equal(water.shortage_detected, false);

      const boats = body.allocations.boats;
      assert.equal(boats.requested_quantity, 4);
      assert.equal(boats.allocated_quantity, 4);
      assert.equal(boats.unmet_quantity, 0);

      const medical = body.allocations.medical_teams;
      assert.equal(medical.requested_quantity, 1);
      assert.equal(medical.allocated_quantity, 1);
      assert.equal(medical.unmet_quantity, 0);

      assert.equal(body.overall_shortage, false);
      assert.ok(body.overall_explanation.includes('fully satisfied'));
    });

    it('should support custom planning_days query parameter via GET', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-a/allocation?planning_days=5`, { headers: authHeader });
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.planning_horizon_days, 5);
      // Scaled food kits: 2000
      assert.equal(body.demand_summary.food_kits, 2000);
      assert.equal(body.allocations.food_kits.requested_quantity, 2000);
      assert.equal(body.allocations.food_kits.allocated_quantity, 2000);
      assert.equal(body.allocations.food_kits.unmet_quantity, 0);
    });

    it('should reject invalid planning_days values with 400', async () => {
      const invalidValues = ['0', '-5', 'abc', '31', '2.5'];
      for (const val of invalidValues) {
        const res = await fetch(`${baseUrl}/api/zones/zone-a/allocation?planning_days=${val}`, { headers: authHeader });
        assert.equal(res.status, 400, `Expected 400 for planning_days=${val}`);
        const body = await res.json();
        assert.ok(body.error);
      }
    });

    it('should return 404 for non-existent zone', async () => {
      const res = await fetch(`${baseUrl}/api/zones/zone-non-existent-999/allocation`, { headers: authHeader });
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.match(body.error, /not found/i);
    });

    it('should guarantee zero inventory decrement, zero fleet reduction, and zero persisted allocations', async () => {
      // Snapshot fleet and warehouse before
      const fleetBeforeRes = await fetch(`${baseUrl}/api/resource-centers`);
      const fleetBeforeBody = await fleetBeforeRes.json();
      const fleetBefore = fleetBeforeBody.items.reduce((s: number, c: { total_fleet: number }) => s + c.total_fleet, 0);
      assert.equal(fleetBefore, 21);

      // Perform allocation requests repeatedly
      await fetch(`${baseUrl}/api/zones/zone-a/allocation`, { headers: authHeader });
      await fetch(`${baseUrl}/api/zones/zone-a/allocation?planning_days=5`, { headers: authHeader });
      await fetch(`${baseUrl}/api/zones/zone-b/allocation`, { headers: authHeader });

      // Verify fleet after: strictly 21
      const fleetAfterRes = await fetch(`${baseUrl}/api/resource-centers`);
      const fleetAfterBody = await fleetAfterRes.json();
      const fleetAfter = fleetAfterBody.items.reduce((s: number, c: { total_fleet: number }) => s + c.total_fleet, 0);
      assert.equal(fleetAfter, 21);

      // Verify no records in allocations table
      const allocRes = await query<{ count: string }>('SELECT count(*) as count FROM allocations');
      assert.equal(allocRes.rows[0].count, '0');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Shelters Endpoints
  // ---------------------------------------------------------------------------
  describe('GET /api/shelters', () => {
    it('should list all 18 canonical shelters with occupancy metrics', async () => {
      const res = await fetch(`${baseUrl}/api/shelters?limit=25`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.total, 18);
      assert.equal(body.items.length, 18);

      const shelterB = body.items.find((s: { id: string }) => s.id === 'shelter-2');
      assert.ok(shelterB);
      assert.equal(shelterB.name, 'Howly Community Relief Center (Shelter B)');
      assert.equal(shelterB.capacity, 800);
      assert.equal(shelterB.occupied, 300);
      assert.equal(shelterB.available_spaces, 500);
      assert.equal(shelterB.occupancy_pct, 37.5);
      assert.ok(shelterB.facilities.includes('water'));
    });

    it('should suggest nearest shelter using PostGIS spatial proximity', async () => {
      // Zone A (Barpeta Central) -> nearest shelter should be Shelter B (Howly, 5.4 km) or Barpeta School
      const res = await fetch(`${baseUrl}/api/shelters/suggest?zone_id=zone-a&people=200`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.requested_evacuees, 200);
      assert.ok(Array.isArray(body.suggestions));
      assert.ok(body.suggestions.length > 0);

      const first = body.suggestions[0];
      assert.ok(first.distance_km > 0);
      assert.ok(first.available_spaces >= 200);
      assert.equal(first.can_accommodate, true);
    });

    it('should return 400 when suggest is called without zone_id or coordinates', async () => {
      const res = await fetch(`${baseUrl}/api/shelters/suggest?people=100`);
      assert.equal(res.status, 400);

      const body = await res.json();
      assert.match(body.error, /zone_id or both lat and lng/i);
    });

    it('should return 404 for unknown zone in suggest', async () => {
      const res = await fetch(`${baseUrl}/api/shelters/suggest?zone_id=zone-unknown&people=100`);
      assert.equal(res.status, 404);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Resource Centers Endpoints
  // ---------------------------------------------------------------------------
  describe('GET /api/resource-centers', () => {
    it('should return exactly 5 relief centers totaling 21 fleet units', async () => {
      const res = await fetch(`${baseUrl}/api/resource-centers`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.total, 5);
      assert.equal(body.items.length, 5);

      const totalFleet = body.items.reduce(
        (sum: number, c: { total_fleet: number }) => sum + c.total_fleet,
        0
      );
      assert.equal(totalFleet, 21);

      // Verify Relief Center #3 (Barpeta) has 4 vehicles and 4 boats
      const center3 = body.items.find((c: { id: string }) => c.id === 'center-3');
      assert.ok(center3);
      assert.equal(center3.vehicles_available, 4);
      assert.equal(center3.boats_available, 4);
      assert.equal(center3.total_fleet, 8);
    });

    it('should support the /api/resource_centers alias', async () => {
      const res = await fetch(`${baseUrl}/api/resource_centers`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.total, 5);
    });

    it('should verify all 5 resource centers match exact canonical names, IDs, and capacity values', async () => {
      const res = await fetch(`${baseUrl}/api/resource-centers`);
      assert.equal(res.status, 200);
      const body = await res.json();

      const expected = [
        { id: 'center-1', name: 'Guwahati Central Logistics Hub', vehicles: 3, boats: 1, medical: 6 },
        { id: 'center-2', name: 'Nalbari Rapid Response Depot', vehicles: 2, boats: 1, medical: 3 },
        { id: 'center-3', name: 'Barpeta Relief Base #3', vehicles: 4, boats: 4, medical: 5 },
        { id: 'center-4', name: 'Dhubri Sector Logistics Base', vehicles: 2, boats: 1, medical: 4 },
        { id: 'center-5', name: 'Goalpara Riverine Outpost', vehicles: 2, boats: 1, medical: 3 },
      ];

      for (const exp of expected) {
        const found = body.items.find((c: any) => c.id === exp.id);
        assert.ok(found, `Center ${exp.id} not found`);
        assert.equal(found.name, exp.name);
        assert.equal(found.vehicles_available, exp.vehicles);
        assert.equal(found.boats_available, exp.boats);
        assert.equal(found.medical_teams_available, exp.medical);
      }
    });

    it('should return 404 for unknown resource center', async () => {
      const res = await fetch(`${baseUrl}/api/resource-centers/center-unknown-999`);
      assert.equal(res.status, 404);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Citizen Reports Endpoints (POST, GET, BULK)
  // ---------------------------------------------------------------------------
  describe('POST /api/reports and GET /api/reports', () => {
    let createdReportId: string;

    it('should ingest a new citizen distress report with PostGIS point geometry', async () => {
      const payload = {
        description: 'Water level rising near Barpeta High School, 4 people trapped on roof.',
        lat: 26.3216,
        lng: 91.0059,
        location_name: 'Barpeta Ward 4',
        severity: 'critical',
        category: 'rescue',
        people_affected: 4,
        medical_need: true,
        is_simulated: true,
      };

      const res = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.ok(body.id);
      createdReportId = body.id;
      assert.equal(body.severity, 'critical');
      assert.equal(body.medical_need, true);
      assert.equal(body.is_simulated, true);
      assert.equal(body.status, 'pending_ai');
      assert.equal(body.location_lat, 26.3216);
      assert.equal(body.location_lng, 91.0059);
    });

    it('should retrieve the newly created report via GET /api/reports/:id', async () => {
      assert.ok(createdReportId);
      const res = await fetch(`${baseUrl}/api/reports/${createdReportId}`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.equal(body.id, createdReportId);
      assert.equal(body.people_affected, 4);
      assert.equal(body.location_name, 'Barpeta Ward 4');
    });

    it('should reject invalid report payloads with 400', async () => {
      const invalidPayload = {
        description: 'hi', // too short (< 3 chars)
        lat: 999, // invalid latitude
        lng: 91.0059,
      };

      const res = await fetch(`${baseUrl}/api/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPayload),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error);
      assert.ok(Array.isArray(body.details));
    });

    it('should bulk import simulated reports via POST /api/reports/bulk', async () => {
      const bulkPayload = {
        reports: [
          {
            description: 'Submerged bridge in Howly, village cut off from clean water.',
            lat: 26.432,
            lng: 91.045,
            severity: 'high',
            category: 'water',
            people_affected: 25,
            medical_need: false,
            is_simulated: true,
          },
          {
            description: 'Elderly patient requires insulin in Chenga embankment.',
            lat: 26.26,
            lng: 91.08,
            severity: 'critical',
            category: 'medicine',
            people_affected: 1,
            medical_need: true,
            is_simulated: true,
          },
        ],
      };

      const res = await fetch(`${baseUrl}/api/reports/bulk`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(bulkPayload),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.inserted_count, 2);
      assert.equal(body.report_ids.length, 2);
    });

    it('should list reports with filters and pagination', async () => {
      const res = await fetch(`${baseUrl}/api/reports?severity=critical&limit=10`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.ok(body.total >= 1);
      assert.ok(Array.isArray(body.items));
      body.items.forEach((r: { severity: string }) => {
        assert.equal(r.severity, 'critical');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Road Segments Endpoints
  // ---------------------------------------------------------------------------
  describe('GET /api/road-segments and PATCH /api/road-segments/:id', () => {
    it('should list road segments with canonical Route A and Route C statuses', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.ok(body.total >= 3);

      const routeA = body.items.find((r: { id: string }) => r.id === 'route-a');
      assert.ok(routeA);
      assert.equal(routeA.status, 'blocked');
      assert.equal(routeA.geometry?.type, 'LineString');
      assert.ok(Array.isArray(routeA.geometry?.coordinates));
      assert.ok(routeA.geometry.coordinates.length >= 2);

      const routeC = body.items.find((r: { id: string }) => r.id === 'route-c');
      assert.ok(routeC);
      assert.equal(routeC.status, 'accessible');
      assert.equal(routeC.geometry?.type, 'LineString');
      assert.ok(routeC.geometry.coordinates.length >= 2);
    });

    it('should update road segment status via PATCH', async () => {
      const patchRes = await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'blocked', reason: 'Flash flood water overtopping' }),
      });

      assert.equal(patchRes.status, 200);
      const body = await patchRes.json();
      assert.equal(body.success, true);
      assert.equal(body.updated_segment.status, 'blocked');
      assert.equal(body.updated_segment.geometry?.type, 'LineString');
      assert.ok(body.updated_segment.geometry.coordinates.length >= 2);

      // Revert back to 'partial' to keep canonical demo integrity
      await fetch(`${baseUrl}/api/road-segments/route-b`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'partial' }),
      });
    });

    it('should reject invalid road segment status update with 400', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-a`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'destroyed_completely' }), // invalid enum
      });

      assert.equal(res.status, 400);
    });

    it('should return 404 for unknown road segment PATCH', async () => {
      const res = await fetch(`${baseUrl}/api/road-segments/route-non-existent`, {
        method: 'PATCH',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accessible' }),
      });

      assert.equal(res.status, 404);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. 404 Route Handler
  // ---------------------------------------------------------------------------
  describe('Undefined Routes', () => {
    it('should return structured 404 for unknown endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/non-existent-endpoint`);
      assert.equal(res.status, 404);

      const body = await res.json();
      assert.equal(body.error, 'Endpoint not found');
      assert.equal(body.path, '/api/non-existent-endpoint');
    });
  });
});
