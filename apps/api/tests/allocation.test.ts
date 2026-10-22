import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDeterministicAllocation,
  calculateZoneAllocation,
  normalizeResourceType,
  AllocationError,
  InventoryPool,
} from '../src/services/allocation';
import { calculateZoneDemand, ZoneDemandInput } from '../src/services/demand';
import { query, closePool } from '../src/db';

describe('RELIEF-OS Deterministic Resource Allocation Engine', () => {
  after(async () => {
    await closePool();
  });
  const canonicalZoneAInput: ZoneDemandInput = {
    zone_id: 'zone-a',
    zone_name: 'Zone A (Barpeta Central / Jania)',
    affected_population: 3842,
    total_population: 12500,
    severity: 'critical',
    medical_risk: 'high',
    accessibility: 0.25,
    vulnerability: 0.88,
    priority_score: 94,
    band: 'Critical',
    food_shortage_pct: 72,
    water_shortage_pct: 61,
    is_simulated: true,
  };

  const sampleDemand = calculateZoneDemand(canonicalZoneAInput, { planning_days: 3 });

  const buildMockPool = (overrides?: Partial<InventoryPool>): InventoryPool => ({
    'center-1': {
      center: {
        id: 'center-1',
        name: 'Guwahati Regional Hub',
        distance_km: 98.4,
        lat: 26.1445,
        lng: 91.7362,
        vehicles_available: 8,
        boats_available: 5,
        medical_teams_available: 4,
      },
      stock: {
        food_kits: 5000,
        water_units: 4000,
        boats: 5,
        medical_teams: 4,
      },
    },
    'center-3': {
      center: {
        id: 'center-3',
        name: 'Barpeta Relief Base #3',
        distance_km: 0.0,
        lat: 26.3216,
        lng: 91.0059,
        vehicles_available: 6,
        boats_available: 4,
        medical_teams_available: 5,
      },
      stock: {
        food_kits: 2500,
        water_units: 2000,
        boats: 4,
        medical_teams: 5,
      },
    },
    'center-2': {
      center: {
        id: 'center-2',
        name: 'Nalbari Staging Depot',
        distance_km: 42.1,
        lat: 26.4431,
        lng: 91.4398,
        vehicles_available: 3,
        boats_available: 3,
        medical_teams_available: 2,
      },
      stock: {
        food_kits: 1500,
        water_units: 1200,
        boats: 3,
        medical_teams: 2,
      },
    },
    ...overrides,
  });

  // ---------------------------------------------------------------------------
  // 1. Resource Type Normalization
  // ---------------------------------------------------------------------------
  describe('Resource Type Normalization', () => {
    it('should map food kit variations to food_kits', () => {
      assert.equal(normalizeResourceType('food_kits'), 'food_kits');
      assert.equal(normalizeResourceType('food_kit'), 'food_kits');
      assert.equal(normalizeResourceType('food'), 'food_kits');
      assert.equal(normalizeResourceType(' FOOD_KITS '), 'food_kits');
    });

    it('should map water pack variations to water_units', () => {
      assert.equal(normalizeResourceType('water_units'), 'water_units');
      assert.equal(normalizeResourceType('water_unit'), 'water_units');
      assert.equal(normalizeResourceType('water_pack'), 'water_units');
      assert.equal(normalizeResourceType('water'), 'water_units');
    });

    it('should map boat variations to boats', () => {
      assert.equal(normalizeResourceType('boats'), 'boats');
      assert.equal(normalizeResourceType('boat'), 'boats');
    });

    it('should map medical variations to medical_teams', () => {
      assert.equal(normalizeResourceType('medical_teams'), 'medical_teams');
      assert.equal(normalizeResourceType('medical_team'), 'medical_teams');
      assert.equal(normalizeResourceType('medical_unit'), 'medical_teams');
      assert.equal(normalizeResourceType('medical'), 'medical_teams');
    });

    it('should return null for unsupported types', () => {
      assert.equal(normalizeResourceType('helicopters'), null);
      assert.equal(normalizeResourceType('tents'), null);
      assert.equal(normalizeResourceType('blankets'), null);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Deterministic Center Selection and Tie-Breaking
  // ---------------------------------------------------------------------------
  describe('Deterministic Selection & Ordering', () => {
    it('should strictly prioritize the closest center by distance_km', () => {
      const pool = buildMockPool();
      const result = computeDeterministicAllocation(sampleDemand, pool);

      assert.equal(result.primary_source_center.id, 'center-3');
      assert.equal(result.primary_source_center.distance_km, 0);

      // Verify Center 3 (0 km) fulfills the demand first
      assert.equal(result.allocations.food_kits.supplying_centers[0].center_id, 'center-3');
      assert.equal(result.allocations.boats.supplying_centers[0].center_id, 'center-3');
    });

    it('should break ties between equidistant centers using stable center_id ASC', () => {
      const equidistantPool: InventoryPool = {
        'center-z': {
          center: {
            id: 'center-z',
            name: 'Z-Depot',
            distance_km: 15.0,
            lat: 26.0,
            lng: 91.0,
            vehicles_available: 5,
            boats_available: 2,
            medical_teams_available: 2,
          },
          stock: { food_kits: 500, water_units: 500, boats: 2, medical_teams: 2 },
        },
        'center-a': {
          center: {
            id: 'center-a',
            name: 'A-Depot',
            distance_km: 15.0,
            lat: 26.0,
            lng: 91.0,
            vehicles_available: 5,
            boats_available: 2,
            medical_teams_available: 2,
          },
          stock: { food_kits: 500, water_units: 500, boats: 2, medical_teams: 2 },
        },
      };

      const result = computeDeterministicAllocation(sampleDemand, equidistantPool);
      // center-a should be chosen before center-z
      assert.equal(result.primary_source_center.id, 'center-a');
      assert.equal(result.allocations.food_kits.supplying_centers[0].center_id, 'center-a');
    });

    it('should produce strictly identical allocation results on repeated runs', () => {
      const pool = buildMockPool();
      const res1 = computeDeterministicAllocation(sampleDemand, pool);
      const res2 = computeDeterministicAllocation(sampleDemand, pool);

      assert.deepEqual(res1.allocations, res2.allocations);
      assert.equal(res1.primary_source_center.id, res2.primary_source_center.id);
      assert.equal(res1.overall_shortage, res2.overall_shortage);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Sufficient Inventory Allocation
  // ---------------------------------------------------------------------------
  describe('Sufficient Inventory Fulfillment', () => {
    it('should fulfill 100% of canonical Zone A 3-day demand from nearest center with adequate stock', () => {
      const pool = buildMockPool();
      const result = computeDeterministicAllocation(sampleDemand, pool);

      // Zone A demands: 1,200 food kits, 800 water units, 4 boats, 1 medical team
      assert.equal(result.allocations.food_kits.requested_quantity, 1200);
      assert.equal(result.allocations.food_kits.allocated_quantity, 1200);
      assert.equal(result.allocations.food_kits.unmet_quantity, 0);
      assert.equal(result.allocations.food_kits.shortage_detected, false);

      assert.equal(result.allocations.water_units.requested_quantity, 800);
      assert.equal(result.allocations.water_units.allocated_quantity, 800);
      assert.equal(result.allocations.water_units.unmet_quantity, 0);
      assert.equal(result.allocations.water_units.shortage_detected, false);

      assert.equal(result.allocations.boats.requested_quantity, 4);
      assert.equal(result.allocations.boats.allocated_quantity, 4);
      assert.equal(result.allocations.boats.unmet_quantity, 0);

      assert.equal(result.allocations.medical_teams.requested_quantity, 1);
      assert.equal(result.allocations.medical_teams.allocated_quantity, 1);
      assert.equal(result.allocations.medical_teams.unmet_quantity, 0);

      assert.equal(result.overall_shortage, false);
      assert.ok(result.overall_explanation.includes('fully satisfied'));
      assert.equal(result.is_simulated, true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Multi-Center Split Delivery
  // ---------------------------------------------------------------------------
  describe('Multi-Center Split Delivery (FR-6.3)', () => {
    it('should split delivery across centers when nearest center has partial stock', () => {
      // Center 3 (closest, 0 km) has only 700 food kits (demand is 1,200)
      // Center 2 (next closest, 42.1 km) has 1,500 food kits
      const pool = buildMockPool({
        'center-3': {
          center: {
            id: 'center-3',
            name: 'Barpeta Relief Base #3',
            distance_km: 0.0,
            lat: 26.3216,
            lng: 91.0059,
            vehicles_available: 6,
            boats_available: 4,
            medical_teams_available: 5,
          },
          stock: {
            food_kits: 700,
            water_units: 800,
            boats: 4,
            medical_teams: 5,
          },
        },
      });

      const result = computeDeterministicAllocation(sampleDemand, pool);
      const foodAlloc = result.allocations.food_kits;

      assert.equal(foodAlloc.requested_quantity, 1200);
      assert.equal(foodAlloc.allocated_quantity, 1200);
      assert.equal(foodAlloc.unmet_quantity, 0);
      assert.equal(foodAlloc.shortage_detected, false);

      // Verify split across 2 supplying centers
      assert.equal(foodAlloc.supplying_centers.length, 2);
      assert.equal(foodAlloc.supplying_centers[0].center_id, 'center-3');
      assert.equal(foodAlloc.supplying_centers[0].allocated_quantity, 700);
      assert.equal(foodAlloc.supplying_centers[1].center_id, 'center-2');
      assert.equal(foodAlloc.supplying_centers[1].allocated_quantity, 500);

      assert.ok(foodAlloc.explanation.includes('split across 2 centers'));
      assert.ok(foodAlloc.explanation.includes('700 from Barpeta Relief Base #3'));
      assert.ok(foodAlloc.explanation.includes('500 from Nalbari Staging Depot'));
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Shortage Detection and Unmet Demand
  // ---------------------------------------------------------------------------
  describe('Shortage Detection & Deficit Tracking (FR-6.4)', () => {
    it('should accurately calculate unmet quantity and set shortage_detected when regional stock is insufficient', () => {
      // Total food kits across all centers = 800 (demand is 1,200)
      const pool: InventoryPool = {
        'center-a': {
          center: {
            id: 'center-a',
            name: 'Depot Alpha',
            distance_km: 10.0,
            lat: 26.0,
            lng: 91.0,
            vehicles_available: 2,
            boats_available: 1,
            medical_teams_available: 1,
          },
          stock: { food_kits: 500, water_units: 1000, boats: 4, medical_teams: 2 },
        },
        'center-b': {
          center: {
            id: 'center-b',
            name: 'Depot Beta',
            distance_km: 25.0,
            lat: 26.0,
            lng: 91.0,
            vehicles_available: 2,
            boats_available: 1,
            medical_teams_available: 1,
          },
          stock: { food_kits: 300, water_units: 1000, boats: 4, medical_teams: 2 },
        },
      };

      const result = computeDeterministicAllocation(sampleDemand, pool);
      const foodAlloc = result.allocations.food_kits;

      assert.equal(foodAlloc.requested_quantity, 1200);
      assert.equal(foodAlloc.allocated_quantity, 800);
      assert.equal(foodAlloc.unmet_quantity, 400);
      assert.equal(foodAlloc.shortage_detected, true);
      assert.equal(result.overall_shortage, true);

      assert.ok(foodAlloc.explanation.includes('Partial fulfillment'));
      assert.ok(foodAlloc.explanation.includes('400 kits'));
      assert.ok(result.overall_explanation.includes('Regional supply deficit detected'));
      assert.ok(result.overall_explanation.includes('400 food kits'));
    });

    it('should handle complete zero stock with 100% deficit and zero allocated', () => {
      const zeroPool: InventoryPool = {
        'center-empty': {
          center: {
            id: 'center-empty',
            name: 'Empty Staging Point',
            distance_km: 5.0,
            lat: 26.0,
            lng: 91.0,
            vehicles_available: 0,
            boats_available: 0,
            medical_teams_available: 0,
          },
          stock: { food_kits: 0, water_units: 0, boats: 0, medical_teams: 0 },
        },
      };

      const result = computeDeterministicAllocation(sampleDemand, zeroPool);

      assert.equal(result.allocations.food_kits.allocated_quantity, 0);
      assert.equal(result.allocations.food_kits.unmet_quantity, 1200);
      assert.equal(result.allocations.food_kits.shortage_detected, true);

      assert.equal(result.allocations.boats.allocated_quantity, 0);
      assert.equal(result.allocations.boats.unmet_quantity, 4);
      assert.equal(result.allocations.boats.shortage_detected, true);

      assert.equal(result.overall_shortage, true);
      assert.ok(result.allocations.food_kits.explanation.includes('Critical shortage'));
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Safety and Negative Stock Prevention
  // ---------------------------------------------------------------------------
  describe('Safety & Invariant Guarantees', () => {
    it('should never allocate negative quantities even if stock in database is negative', () => {
      const corruptedPool: InventoryPool = {
        'center-neg': {
          center: {
            id: 'center-neg',
            name: 'Corrupted Center',
            distance_km: 1.0,
            lat: 26.0,
            lng: 91.0,
            vehicles_available: -2,
            boats_available: -1,
            medical_teams_available: 0,
          },
          stock: { food_kits: -500, water_units: -100, boats: -3, medical_teams: -1 },
        },
      };

      const result = computeDeterministicAllocation(sampleDemand, corruptedPool);

      assert.ok(result.allocations.food_kits.allocated_quantity >= 0);
      assert.ok(result.allocations.water_units.allocated_quantity >= 0);
      assert.ok(result.allocations.boats.allocated_quantity >= 0);
      assert.ok(result.allocations.medical_teams.allocated_quantity >= 0);
      assert.equal(result.allocations.food_kits.allocated_quantity, 0);
    });

    it('should throw AllocationError if candidate centers pool is completely empty', () => {
      assert.throws(
        () => computeDeterministicAllocation(sampleDemand, {}),
        (err: Error) => {
          assert.ok(err instanceof AllocationError);
          assert.equal((err as AllocationError).code, 'NO_CENTERS_AVAILABLE');
          return true;
        }
      );
    });

    it('should never count the same inventory twice across multiple resource categories', () => {
      const pool = buildMockPool();
      const initialCenter3Food = pool['center-3'].stock.food_kits;
      const initialCenter3Water = pool['center-3'].stock.water_units;

      computeDeterministicAllocation(sampleDemand, pool);

      // The original input pool object must remain unmutated
      assert.equal(pool['center-3'].stock.food_kits, initialCenter3Food);
      assert.equal(pool['center-3'].stock.water_units, initialCenter3Water);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Database Integration via calculateZoneAllocation
  // ---------------------------------------------------------------------------
  describe('Database Integration (calculateZoneAllocation)', () => {
    it('should successfully compute allocation for Zone A using live database inventory', async () => {
      const result = await calculateZoneAllocation('zone-a', { planning_days: 3 });

      assert.equal(result.zone_id, 'zone-a');
      assert.equal(result.zone_name, 'Zone A (Barpeta Central / Jania)');
      assert.equal(result.priority_score, 94);
      assert.equal(result.priority_band, 'Critical');
      assert.equal(result.is_simulated, true);
      assert.equal(result.planning_horizon_days, 3);

      // Canonical demand checks: 1,200 food kits, 800 water units, 4 boats, 1 team
      assert.equal(result.demand_summary.food_kits, 1200);
      assert.equal(result.demand_summary.water_units, 800);
      assert.equal(result.demand_summary.boats, 4);
      assert.equal(result.demand_summary.medical_teams, 1);

      // Center 3 (Barpeta Relief Base #3) is at Jania (0.00 km) and satisfies 100% of demand
      assert.equal(result.primary_source_center.id, 'center-3');
      assert.equal(result.allocations.food_kits.allocated_quantity, 1200);
      assert.equal(result.allocations.food_kits.unmet_quantity, 0);
      assert.equal(result.allocations.water_units.allocated_quantity, 800);
      assert.equal(result.allocations.boats.allocated_quantity, 4);
      assert.equal(result.allocations.medical_teams.allocated_quantity, 1);
      assert.equal(result.overall_shortage, false);
    });

    it('should throw AllocationError with ZONE_NOT_FOUND for non-existent zone', async () => {
      await assert.rejects(
        async () => {
          await calculateZoneAllocation('zone-non-existent-999');
        },
        (err: Error) => {
          assert.ok(err instanceof AllocationError);
          assert.equal((err as AllocationError).code, 'ZONE_NOT_FOUND');
          return true;
        }
      );
    });

    it('should verify repeated allocation calculations never mutate database inventory or recommendation records', async () => {
      // Snapshot inventory and tables before
      const preResources = await query<{ count: string; total_qty: string }>(
        `SELECT count(*) as count, sum(quantity) as total_qty FROM resources WHERE status = 'available'`
      );
      const preCenters = await query<{ sum_boats: string; sum_med: string }>(
        `SELECT sum(boats_available) as sum_boats, sum(medical_teams_available) as sum_med FROM resource_centers`
      );
      const preRecommendations = await query<{ count: string }>(
        `SELECT count(*) as count FROM recommendations`
      );
      const preAllocations = await query<{ count: string }>(
        `SELECT count(*) as count FROM allocations`
      );

      // Execute calculation multiple times
      await calculateZoneAllocation('zone-a', { planning_days: 3 });
      await calculateZoneAllocation('zone-a', { planning_days: 5 });
      await calculateZoneAllocation('zone-b', { planning_days: 3 });

      // Snapshot inventory and tables after
      const postResources = await query<{ count: string; total_qty: string }>(
        `SELECT count(*) as count, sum(quantity) as total_qty FROM resources WHERE status = 'available'`
      );
      const postCenters = await query<{ sum_boats: string; sum_med: string }>(
        `SELECT sum(boats_available) as sum_boats, sum(medical_teams_available) as sum_med FROM resource_centers`
      );
      const postRecommendations = await query<{ count: string }>(
        `SELECT count(*) as count FROM recommendations`
      );
      const postAllocations = await query<{ count: string }>(
        `SELECT count(*) as count FROM allocations`
      );

      assert.equal(postResources.rows[0].count, preResources.rows[0].count);
      assert.equal(postResources.rows[0].total_qty, preResources.rows[0].total_qty);
      assert.equal(postCenters.rows[0].sum_boats, preCenters.rows[0].sum_boats);
      assert.equal(postCenters.rows[0].sum_med, preCenters.rows[0].sum_med);
      assert.equal(postRecommendations.rows[0].count, preRecommendations.rows[0].count);
      assert.equal(postAllocations.rows[0].count, preAllocations.rows[0].count);
    });

    it('should exclude reserved, dispatched, and unsupported resources from live inventory', async () => {
      // Temporarily insert a reserved row and an unsupported resource type row
      await query(
        `INSERT INTO resources (id, center_id, resource_type, quantity, status)
         VALUES 
           ('res-test-reserved', 'center-3', 'food_kits', 50000, 'reserved'),
           ('res-test-tents', 'center-3', 'tents', 10000, 'available')
         ON CONFLICT (id) DO UPDATE SET quantity = EXCLUDED.quantity, status = EXCLUDED.status`
      );

      try {
        const result = await calculateZoneAllocation('zone-a', { planning_days: 3 });
        // The reserved 50,000 food kits must NOT be included in available_inventory
        // Canonical total available food kits across 5 centers is exactly 16,200
        assert.equal(result.available_inventory.food_kits, 16200);
      } finally {
        await query(`DELETE FROM resources WHERE id IN ('res-test-reserved', 'res-test-tents')`);
      }
    });

    it('should verify zero-distance result for Zone A <-> Center 3 is derived from exact PostGIS geometry equivalence', async () => {
      const geoCheck = await query<{ is_identical: boolean; distance_meters: number }>(
        `SELECT 
           ST_Equals(c.location, z.geometry) as is_identical,
           ST_Distance(c.location::geography, z.geometry::geography) as distance_meters
         FROM resource_centers c
         CROSS JOIN zones z
         WHERE c.id = 'center-3' AND z.id = 'zone-a'`
      );

      assert.equal(geoCheck.rows[0].is_identical, true);
      assert.equal(geoCheck.rows[0].distance_meters, 0);
    });
  });
});
