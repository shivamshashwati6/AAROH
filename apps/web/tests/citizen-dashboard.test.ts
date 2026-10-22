import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/services/api';
import { Shelter, RoadSegment, PaginatedResult } from '@relief-os/shared';

describe('RELIEF-OS Citizen Dashboard Integration & Data Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    api.logout();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    api.logout();
  });

  // ---------------------------------------------------------------------------
  // 1. Shelter Information & Occupancy Status
  // ---------------------------------------------------------------------------
  it('should fetch shelters with correct available spaces and capacity calculation', async () => {
    const mockShelters: PaginatedResult<
      Shelter & { available_spaces: number; occupancy_pct: number; is_overcrowded: boolean }
    > = {
      items: [
        {
          id: 'sh-01',
          name: 'Barpeta Higher Secondary School Camp',
          location_lat: 26.32,
          location_lng: 91.01,
          capacity: 500,
          occupied: 320,
          available_spaces: 180,
          occupancy_pct: 64.0,
          facilities: ['Medical Aid', 'Clean Drinking Water', 'Sanitation'],
          is_overcrowded: false,
        },
        {
          id: 'sh-02',
          name: 'Dakshin Barpeta Community Hall',
          location_lat: 26.31,
          location_lng: 91.02,
          capacity: 200,
          occupied: 195,
          available_spaces: 5,
          occupancy_pct: 97.5,
          facilities: ['Food Kitchen', 'Emergency Generator'],
          is_overcrowded: true,
        },
      ],
      total: 2,
      limit: 50,
      offset: 0,
    };

    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockShelters), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const res = await api.getShelters({ limit: 50 });
    assert.equal(res.items.length, 2);

    const availableShelter = res.items[0];
    assert.equal(availableShelter.name, 'Barpeta Higher Secondary School Camp');
    assert.equal(availableShelter.available_spaces, 180);
    assert.equal(availableShelter.is_overcrowded, false);

    const fullShelter = res.items[1];
    assert.equal(fullShelter.available_spaces, 5);
    assert.equal(fullShelter.is_overcrowded, true);
  });

  // ---------------------------------------------------------------------------
  // 2. Family Shelter Suggestion Calculation
  // ---------------------------------------------------------------------------
  it('should fetch smart proximity shelter suggestions for a requested family count', async () => {
    let capturedUrl = '';
    globalThis.fetch = async (input) => {
      capturedUrl = String(input);
      return new Response(
        JSON.stringify({
          target_location: { lat: 26.32, lng: 91.0, zone_id: null },
          requested_evacuees: 4,
          suggestions_count: 1,
          suggestions: [
            {
              id: 'sh-01',
              name: 'Barpeta Higher Secondary School Camp',
              location_lat: 26.32,
              location_lng: 91.01,
              capacity: 500,
              occupied: 320,
              available_spaces: 180,
              occupancy_pct: 64.0,
              distance_km: 1.4,
              facilities: ['Clean Water', 'Medical Aid'],
              can_accommodate: true,
              recommended: true,
              evacuation_note: 'Capacity verified. Nearest safe refuge.',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    const res = await api.suggestShelters({ people: 4, limit: 3 });
    assert.ok(capturedUrl.includes('people=4'));
    assert.equal(res.suggestions.length, 1);
    assert.equal(res.suggestions[0].recommended, true);
    assert.equal(res.suggestions[0].can_accommodate, true);
    assert.equal(res.suggestions[0].distance_km, 1.4);
  });

  // ---------------------------------------------------------------------------
  // 3. Road Accessibility & Route Hazard Segregation
  // ---------------------------------------------------------------------------
  it('should list road segments and correctly classify hazardous and traversable routes', async () => {
    const mockRoads: PaginatedResult<RoadSegment> = {
      items: [
        {
          id: 'route-a',
          name: 'Route A - North Embankment Highway',
          status: 'blocked',
          length_km: 14.2,
          risk_score: 92,
        },
        {
          id: 'route-b',
          name: 'Route B - River Bend Corridor',
          status: 'partial',
          length_km: 8.5,
          risk_score: 65,
        },
        {
          id: 'route-c',
          name: 'Route C - South Valley Bypass',
          status: 'accessible',
          length_km: 22.0,
          risk_score: 18,
        },
      ],
      total: 3,
      limit: 50,
      offset: 0,
    };

    globalThis.fetch = async () =>
      new Response(JSON.stringify(mockRoads), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    const res = await api.getRoadSegments();
    assert.equal(res.items.length, 3);

    const blocked = res.items.filter((r) => r.status === 'blocked');
    const partial = res.items.filter((r) => r.status === 'partial');
    const accessible = res.items.filter((r) => r.status === 'accessible');

    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].name, 'Route A - North Embankment Highway');
    assert.equal(partial.length, 1);
    assert.equal(accessible.length, 1);
  });

  // ---------------------------------------------------------------------------
  // 4. In-Page Distress Ingestion by Citizen
  // ---------------------------------------------------------------------------
  it('should successfully dispatch citizen distress report with contact number and medical urgency', async () => {
    let capturedBody: any = null;

    globalThis.fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          id: 'rep-citizen-test-99',
          disaster_id: 'disaster-assam-2026',
          location_lat: 26.3211,
          location_lng: 91.0045,
          location_name: 'Ward 3, Barpeta Town',
          description: 'Family stranded on rooftop; water rising fast.',
          category: 'rescue',
          people_affected: 5,
          medical_need: true,
          contact_number: '+91 98765 00000',
          confidence: 0.95,
          is_simulated: false,
          status: 'pending_ai',
          created_at: new Date().toISOString(),
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    const res = await api.submitReport({
      description: 'Family stranded on rooftop; water rising fast.',
      location_name: 'Ward 3, Barpeta Town',
      lat: 26.3211,
      lng: 91.0045,
      category: 'rescue',
      people_affected: 5,
      medical_need: true,
      contact_number: '+91 98765 00000',
      is_simulated: false,
    });

    assert.equal(res.id, 'rep-citizen-test-99');
    assert.equal(capturedBody.category, 'rescue');
    assert.equal(capturedBody.people_affected, 5);
    assert.equal(capturedBody.medical_need, true);
    assert.equal(capturedBody.contact_number, '+91 98765 00000');
  });

  // ---------------------------------------------------------------------------
  // 5. Active Disaster Alerts Query
  // ---------------------------------------------------------------------------
  it('should fetch active disaster events for public emergency announcements', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              id: 'disaster-assam-2026',
              name: 'Assam Monsoon Flood 2026',
              type: 'flood',
              region: 'Barpeta District',
              status: 'active',
              is_simulated: true,
              created_at: '2026-06-01T00:00:00Z',
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    const disasters = await api.getDisasters({ status: 'active' });
    assert.equal(disasters.items.length, 1);
    assert.equal(disasters.items[0].region, 'Barpeta District');
    assert.equal(disasters.items[0].status, 'active');
  });

  // ---------------------------------------------------------------------------
  // 6. Network Failure & Error State Action
  // ---------------------------------------------------------------------------
  it('should throw ApiError with clear status when backend fails', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Database service unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(
      async () => {
        await api.getShelters();
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 503);
        assert.equal(err.message, 'Database service unavailable');
        return true;
      }
    );
  });
});
