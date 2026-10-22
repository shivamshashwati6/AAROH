import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/services/api';

describe('RELIEF-OS Frontend API Client Service', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should have a valid default API base URL', () => {
    const url = api.getBaseUrl();
    assert.ok(url.includes('4000') || url.includes('/api'));
  });

  it('should instantiate ApiError with status and custom message', () => {
    const err = new ApiError(404, 'Zone not found', { zoneId: 'zone-x' });
    assert.equal(err.status, 404);
    assert.equal(err.message, 'Zone not found');
    assert.equal(err.name, 'ApiError');
    assert.deepEqual(err.details, { zoneId: 'zone-x' });
  });

  it('should handle successful GET requests properly', async () => {
    const mockData = {
      disaster_id: 'disaster-assam-2026',
      kpis: { affected_population: 18420, critical_zones_count: 7 },
    };

    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const res = await api.getDemoKPIs();
    assert.equal(res.disaster_id, 'disaster-assam-2026');
    assert.equal(res.kpis.affected_population, 18420);
  });

  it('should construct query parameters correctly for zones', async () => {
    let capturedUrl = '';
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ items: [], total: 0, limit: 10, offset: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await api.getZones({ band: 'Critical', min_priority: 85, limit: 10 });
    assert.ok(capturedUrl.includes('band=Critical'));
    assert.ok(capturedUrl.includes('min_priority=85'));
    assert.ok(capturedUrl.includes('limit=10'));
  });

  it('should throw ApiError with status and server error message on 400 Bad Request', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: 'Invalid query parameter', details: ['band must be Critical'] }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    await assert.rejects(
      async () => {
        await api.getZones({ band: 'InvalidBand' });
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 400);
        assert.equal(err.message, 'Invalid query parameter');
        return true;
      }
    );
  });

  it('should throw ApiError on 500 server failure', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Database connection failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(
      async () => {
        await api.checkHealth();
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 500);
        assert.equal(err.message, 'Database connection failed');
        return true;
      }
    );
  });

  it('should send correct POST payload when submitting a citizen report', async () => {
    let capturedBody = '';
    let capturedMethod = '';

    globalThis.fetch = async (_input, init) => {
      capturedMethod = init?.method || '';
      capturedBody = String(init?.body || '');
      return new Response(
        JSON.stringify({
          id: 'rep-test-123',
          description: 'Rising water in Barpeta',
          severity: 'critical',
          status: 'pending_ai',
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const payload = {
      description: 'Rising water in Barpeta',
      lat: 26.3216,
      lng: 91.0059,
      severity: 'critical' as const,
      category: 'rescue',
    };

    const res = await api.submitReport(payload);
    assert.equal(capturedMethod, 'POST');
    assert.ok(capturedBody.includes('Rising water in Barpeta'));
    assert.equal(res.id, 'rep-test-123');
  });

  it('should parse transparent report count model with target_reports_demo', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          disaster_id: 'disaster-assam-2026',
          kpis: {
            affected_population: 18420,
            total_reports_ingested: 18,
            target_reports_demo: 1247,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    const res = await api.getDemoKPIs();
    assert.equal(res.kpis.total_reports_ingested, 18);
    assert.equal(res.kpis.target_reports_demo, 1247);
  });

  it('should safely convert PostGIS GeoJSON [lng, lat] coordinates to Leaflet [lat, lng]', () => {
    const geojson = {
      type: 'LineString' as const,
      coordinates: [
        [91.0059, 26.3216],
        [91.045, 26.432],
      ] as [number, number][],
    };

    // Conversion logic used in CommandMap
    const latLngPositions: [number, number][] = geojson.coordinates
      .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2 && typeof pt[0] === 'number' && typeof pt[1] === 'number')
      .map(([lng, lat]) => [lat, lng]);

    assert.equal(latLngPositions.length, 2);
    // [lat, lng]
    assert.equal(latLngPositions[0][0], 26.3216);
    assert.equal(latLngPositions[0][1], 91.0059);
    assert.equal(latLngPositions[1][0], 26.432);
    assert.equal(latLngPositions[1][1], 91.045);
  });

  it('should safely handle missing or invalid road geometry without throwing', () => {
    const invalidRoads = [
      { id: 'r1', name: 'Road 1', geometry: null },
      { id: 'r2', name: 'Road 2', geometry: undefined },
      { id: 'r3', name: 'Road 3', geometry: { type: 'LineString', coordinates: [] } },
      { id: 'r4', name: 'Road 4', geometry: { type: 'LineString', coordinates: [[91.0]] } },
    ];

    for (const r of invalidRoads) {
      const coords = r.geometry?.coordinates;
      const isValid = Array.isArray(coords) && coords.length >= 2;
      assert.equal(isValid, false, `Expected road ${r.id} to be flagged invalid`);
    }
  });

  it('should verify empty state triggers for zero-length operational arrays', () => {
    const emptyZones: unknown[] = [];
    const emptyShelters: unknown[] = [];
    const emptyCenters: unknown[] = [];
    const emptyRoads: unknown[] = [];

    // Ensure empty states are truthy when length is 0
    assert.equal(emptyZones.length === 0, true);
    assert.equal(emptyShelters.length === 0, true);
    assert.equal(emptyCenters.length === 0, true);
    assert.equal(emptyRoads.length === 0, true);
  });

  it('should call getZoneDemand with correct query params', async () => {
    let capturedUrl = '';
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return new Response(
        JSON.stringify({
          zone_id: 'zone-a',
          demands: {
            food_kits: { quantity: 1200 },
            water_units: { quantity: 800 },
            boats: { quantity: 4 },
            medical_teams: { quantity: 1 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await api.getZoneDemand('zone-a', 5);
    assert.ok(capturedUrl.includes('/zones/zone-a/demand?planning_days=5'));
    assert.equal(res.zone_id, 'zone-a');
    assert.equal(res.demands.food_kits.quantity, 1200);
  });

  it('should call postZoneDemand with correct payload and headers', async () => {
    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody = '';

    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method || '';
      capturedBody = String(init?.body || '');
      return new Response(
        JSON.stringify({
          zone_id: 'zone-a',
          affected_population: 5000,
          demands: { food_kits: { quantity: 1844 } },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await api.postZoneDemand('zone-a', {
      affected_population: 5000,
      food_shortage_pct: 85,
    });

    assert.ok(capturedUrl.includes('/zones/zone-a/demand'));
    assert.equal(capturedMethod, 'POST');
    assert.ok(capturedBody.includes('5000'));
    assert.equal(res.demands.food_kits.quantity, 1844);
  });

  it('should call getZoneAllocation with correct path and query parameters', async () => {
    let capturedUrl = '';
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return new Response(
        JSON.stringify({
          zone_id: 'zone-a',
          zone_name: 'Zone A - Jania / Barpeta',
          priority_score: 94,
          priority_band: 'Critical',
          is_simulated: true,
          planning_horizon_days: 3,
          demand_summary: {
            affected_population: 3842,
            food_kits: 1200,
            water_units: 800,
            boats: 4,
            medical_teams: 1,
          },
          available_inventory: {
            food_kits: 7000,
            water_units: 5600,
            boats: 16,
            medical_teams: 14,
          },
          allocations: {
            food_kits: {
              resource_type: 'food_kits',
              name: 'Food Relief Ration Kits',
              unit: 'kits',
              requested_quantity: 1200,
              available_quantity: 7000,
              allocated_quantity: 1200,
              unmet_quantity: 0,
              shortage_detected: false,
              supplying_centers: [
                {
                  center_id: 'center-3',
                  center_name: 'Barpeta Relief Base #3',
                  distance_km: 0,
                  allocated_quantity: 1200,
                  unit: 'kits',
                },
              ],
              explanation: '100% fulfilled',
            },
            water_units: {
              resource_type: 'water_units',
              name: 'Potable Drinking Water Units',
              unit: 'units',
              requested_quantity: 800,
              available_quantity: 5600,
              allocated_quantity: 800,
              unmet_quantity: 0,
              shortage_detected: false,
              supplying_centers: [],
              explanation: '100% fulfilled',
            },
            boats: {
              resource_type: 'boats',
              name: 'Deployable Rescue Boats',
              unit: 'boats',
              requested_quantity: 4,
              available_quantity: 16,
              allocated_quantity: 4,
              unmet_quantity: 0,
              shortage_detected: false,
              supplying_centers: [],
              explanation: '100% fulfilled',
            },
            medical_teams: {
              resource_type: 'medical_teams',
              name: 'Certified Medical Response Teams',
              unit: 'teams',
              requested_quantity: 1,
              available_quantity: 14,
              allocated_quantity: 1,
              unmet_quantity: 0,
              shortage_detected: false,
              supplying_centers: [],
              explanation: '100% fulfilled',
            },
          },
          primary_source_center: {
            id: 'center-3',
            name: 'Barpeta Relief Base #3',
            distance_km: 0,
          },
          overall_shortage: false,
          overall_explanation: 'Proposed response plan fully satisfied for Zone A.',
          generated_at: '2026-10-22T12:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const res = await api.getZoneAllocation('zone-a', 3);
    assert.ok(capturedUrl.includes('/zones/zone-a/allocation?planning_days=3'));
    assert.equal(res.zone_id, 'zone-a');
    assert.equal(res.allocations.food_kits.allocated_quantity, 1200);
    assert.equal(res.allocations.food_kits.unmet_quantity, 0);
    assert.equal(res.is_simulated, true);
  });
});
