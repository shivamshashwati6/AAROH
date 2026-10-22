import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, RecommendationItem } from '../src/services/api';
import { isRoleAuthorized, getHomeRouteForUser } from '../src/utils/auth-roles';
import {
  ZoneDemandResult,
  ZoneAllocationResult,
  User,
  UserRole,
} from '@relief-os/shared';

describe('RELIEF-OS Command Center Dashboard Integration & Data Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    api.logout();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    api.logout();
  });

  // ---------------------------------------------------------------------------
  // 1. Command Center Role Restrictions & Authorization Guards
  // ---------------------------------------------------------------------------
  describe('Command Center Role Restrictions', () => {
    const allowedCommandRoles: UserRole[] = ['command_center', 'admin', 'officer'];

    it('should grant access to Command Center for command_center, admin, and officer', () => {
      assert.equal(isRoleAuthorized('command_center', allowedCommandRoles), true);
      assert.equal(isRoleAuthorized('admin', allowedCommandRoles), true);
      assert.equal(isRoleAuthorized('officer', allowedCommandRoles), true);
    });

    it('should forbid citizen and department roles from accessing Command Center', () => {
      assert.equal(isRoleAuthorized('citizen', allowedCommandRoles), false);
      assert.equal(isRoleAuthorized('department', allowedCommandRoles), false);
      assert.equal(isRoleAuthorized('coordinator', allowedCommandRoles), false);
      assert.equal(isRoleAuthorized('team_lead', allowedCommandRoles), false);
    });

    it('should route command personnel directly to /command', () => {
      const cmdUser: User = { id: 'usr-c1', name: 'Commander', email: 'cmd@relief.org', role: 'command_center' };
      const officerUser: User = { id: 'usr-o1', name: 'Officer', email: 'officer@relief.org', role: 'officer' };
      const adminUser: User = { id: 'usr-a1', name: 'Admin', email: 'admin@relief.org', role: 'admin' };

      assert.equal(getHomeRouteForUser(cmdUser), '/command');
      assert.equal(getHomeRouteForUser(officerUser), '/command');
      assert.equal(getHomeRouteForUser(adminUser), '/command');
    });

    it('should route citizen away to /citizen and not /command', () => {
      const citizenUser: User = { id: 'usr-cit', name: 'Resident', email: 'resident@gmail.com', role: 'citizen' };
      assert.equal(getHomeRouteForUser(citizenUser), '/citizen');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. KPI Data Mapping & Loading/Error States
  // ---------------------------------------------------------------------------
  describe('KPI Data Mapping & Aggregation', () => {
    it('should map affected population, critical zones, fleet, and reports accurately from backend', async () => {
      const mockKPIs = {
        disaster_id: 'disaster-assam-2026',
        disaster_name: 'Assam Monsoon Flood 2026 (Simulated)',
        status: 'active',
        is_simulated: true,
        kpis: {
          active_disaster_count: 1,
          affected_population: 18420,
          critical_zones_count: 7,
          resource_shortages_count: 1,
          active_teams_count: 5,
          shelter_occupancy_pct: 68.4,
          total_shelters: 18,
          relief_centers: 5,
          vehicles_deployed: 21,
          total_reports_ingested: 32,
        },
        hero_zone: {
          id: 'zone-a',
          name: 'Zone A - Barpeta Urban Core',
          priority_score: 94,
          priority_band: 'Critical',
          affected_population: 3842,
          food_shortage_pct: 35,
          water_shortage_pct: 45,
          medical_risk: 'critical',
          nearest_shelter_km: 1.4,
          recommended_action: {
            boats: 8,
            food_kits: 1200,
            water_units: 1400,
            medical_teams: 1,
            source_center: 'Depot 1',
            selected_route: 'Route C',
          },
        },
      };

      globalThis.fetch = async () =>
        new Response(JSON.stringify(mockKPIs), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const res = await api.getDemoKPIs();
      assert.equal(res.kpis.affected_population, 18420);
      assert.equal(res.kpis.critical_zones_count, 7);
      assert.equal(res.kpis.vehicles_deployed, 21);
      assert.equal(res.kpis.total_reports_ingested, 32);
      assert.equal(res.hero_zone.priority_score, 94);
    });

    it('should throw ApiError with clear status when KPI service is unavailable', async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: 'Database service unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });

      await assert.rejects(
        async () => {
          await api.getDemoKPIs();
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 503);
          return true;
        }
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Zone Demand & Allocation Integration (Section 5)
  // ---------------------------------------------------------------------------
  describe('Zone Selection, Demand & Allocation Calculation', () => {
    it('should query demand calculation with correct planning_days parameter', async () => {
      let capturedUrl = '';
      globalThis.fetch = async (input) => {
        capturedUrl = String(input);
        const mockDemand: ZoneDemandResult = {
          zone_id: 'zone-a',
          zone_name: 'Zone A - Barpeta Urban Core',
          affected_population: 3842,
          priority_score: 94,
          band: 'Critical',
          severity: 'critical',
          medical_risk: 'critical',
          accessibility: 0.15,
          vulnerability: 0.85,
          is_simulated: true,
          planning_horizon_days: 7,
          demands: {
            food_kits: {
              resource_type: 'food_kits',
              name: 'Food Ration Kits',
              quantity: 2800,
              unit: 'kits',
              formula: 'ceil(affected * shortage * (7/3))',
              explanation: 'Calculated for 7-day horizon',
              is_assumed_param: true,
            },
            water_units: {
              resource_type: 'water_units',
              name: 'Water Purification Units',
              quantity: 3267,
              unit: 'packs',
              formula: 'ceil(affected * shortage * (7/3))',
              explanation: 'Calculated for 7-day horizon',
              is_assumed_param: true,
            },
            boats: {
              resource_type: 'boats',
              name: 'Inflatable Rescue Boats',
              quantity: 8,
              unit: 'boats',
              formula: 'fixed fleet demand based on accessibility',
              explanation: 'Calculated fleet',
              is_assumed_param: true,
            },
            medical_teams: {
              resource_type: 'medical_teams',
              name: 'Emergency Medical Teams',
              quantity: 1,
              unit: 'teams',
              formula: 'fixed team demand based on medical risk',
              explanation: 'Calculated teams',
              is_assumed_param: true,
            },
          },
          summary_explanation: '7-day planning horizon evaluated.',
          generated_at: new Date().toISOString(),
        };

        return new Response(JSON.stringify(mockDemand), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await api.getZoneDemand('zone-a', 7);
      assert.ok(capturedUrl.includes('planning_days=7'));
      assert.equal(res.planning_horizon_days, 7);
      assert.equal(res.demands.food_kits.quantity, 2800);
    });

    it('should query zone allocation with shortage indicators and supplying center details', async () => {
      let capturedUrl = '';
      globalThis.fetch = async (input) => {
        capturedUrl = String(input);
        const mockAllocation: ZoneAllocationResult = {
          zone_id: 'zone-a',
          zone_name: 'Zone A - Barpeta Urban Core',
          priority_score: 94,
          priority_band: 'Critical',
          is_simulated: true,
          planning_horizon_days: 3,
          demand_summary: {
            affected_population: 3842,
            food_kits: 1200,
            water_units: 1400,
            boats: 8,
            medical_teams: 1,
          },
          available_inventory: {
            food_kits: 5000,
            water_units: 6000,
            boats: 5,
            medical_teams: 3,
          },
          allocations: {
            food_kits: {
              resource_type: 'food_kits',
              name: 'Food Ration Kits',
              unit: 'kits',
              requested_quantity: 1200,
              available_quantity: 5000,
              allocated_quantity: 1200,
              unmet_quantity: 0,
              shortage_detected: false,
              supplying_centers: [{ center_id: 'c-1', center_name: 'Depot 1', distance_km: 2.5, allocated_quantity: 1200, unit: 'kits' }],
              explanation: 'Fully satisfied from Depot 1',
            },
            water_units: {
              resource_type: 'water_units',
              name: 'Clean Water Packs',
              unit: 'packs',
              requested_quantity: 1400,
              available_quantity: 6000,
              allocated_quantity: 1400,
              unmet_quantity: 0,
              shortage_detected: false,
              supplying_centers: [{ center_id: 'c-1', center_name: 'Depot 1', distance_km: 2.5, allocated_quantity: 1400, unit: 'packs' }],
              explanation: 'Fully satisfied from Depot 1',
            },
            boats: {
              resource_type: 'boats',
              name: 'Inflatable Rescue Boats',
              unit: 'boats',
              requested_quantity: 8,
              available_quantity: 5,
              allocated_quantity: 5,
              unmet_quantity: 3,
              shortage_detected: true,
              supplying_centers: [{ center_id: 'c-1', center_name: 'Depot 1', distance_km: 2.5, allocated_quantity: 5, unit: 'boats' }],
              explanation: 'Deficit of 3 boats. Secondary mobilization required.',
            },
            medical_teams: {
              resource_type: 'medical_teams',
              name: 'Emergency Medical Teams',
              unit: 'teams',
              requested_quantity: 1,
              available_quantity: 3,
              allocated_quantity: 1,
              unmet_quantity: 0,
              shortage_detected: false,
              supplying_centers: [{ center_id: 'c-1', center_name: 'Depot 1', distance_km: 2.5, allocated_quantity: 1, unit: 'teams' }],
              explanation: 'Fully satisfied from Depot 1',
            },
          },
          primary_source_center: { id: 'c-1', name: 'Depot 1', distance_km: 2.5 },
          overall_shortage: true,
          overall_explanation: 'Shortage detected: 3 rescue boats unmet.',
          generated_at: new Date().toISOString(),
        };

        return new Response(JSON.stringify(mockAllocation), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await api.getZoneAllocation('zone-a', 3);
      assert.ok(capturedUrl.includes('zones/zone-a/allocation'));
      assert.equal(res.overall_shortage, true);
      assert.equal(res.allocations.boats.shortage_detected, true);
      assert.equal(res.allocations.boats.unmet_quantity, 3);
      assert.equal(res.allocations.food_kits.unmet_quantity, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Human Approval & Rejection Workflow (Section 6)
  // ---------------------------------------------------------------------------
  describe('Recommendation Approval & Rejection API Client Integration', () => {
    it('should list recommendations with zone_id query filter', async () => {
      let capturedUrl = '';
      globalThis.fetch = async (input) => {
        capturedUrl = String(input);
        return new Response(
          JSON.stringify({
            items: [
              {
                id: 'rec-zone-a-001',
                zone_id: 'zone-a',
                plan: { requested_resources: { food_kits: 1200 } },
                explanation: 'Canonical Zone A recommendation',
                status: 'draft',
                created_at: new Date().toISOString(),
              },
            ],
            total: 1,
            limit: 10,
            offset: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await api.getRecommendations({ zone_id: 'zone-a' });
      assert.ok(capturedUrl.includes('zone_id=zone-a'));
      assert.equal(res.items.length, 1);
      assert.equal(res.items[0].id, 'rec-zone-a-001');
    });

    it('should approve recommendation with officer notes and return status approved', async () => {
      let capturedBody: any = null;
      let capturedUrl = '';

      globalThis.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(String(init?.body || '{}'));
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Response plan rec-zone-a-001 successfully approved.',
            recommendation: {
              id: 'rec-zone-a-001',
              zone_id: 'zone-a',
              status: 'approved',
              approved_by: 'usr-officer-1',
              approved_at: new Date().toISOString(),
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await api.approveRecommendation('rec-zone-a-001', 'Priority convoy authorized via Route C');
      assert.ok(capturedUrl.endsWith('/recommendations/rec-zone-a-001/approve'));
      assert.equal(capturedBody.notes, 'Priority convoy authorized via Route C');
      assert.equal(res.success, true);
      assert.equal(res.recommendation.status, 'approved');
    });

    it('should reject recommendation with required reason and return status rejected', async () => {
      let capturedBody: any = null;
      let capturedUrl = '';

      globalThis.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(String(init?.body || '{}'));
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Response plan rec-zone-a-001 rejected.',
            recommendation: {
              id: 'rec-zone-a-001',
              zone_id: 'zone-a',
              status: 'rejected',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await api.rejectRecommendation('rec-zone-a-001', 'Route A blocked; recalculate from Depot 2');
      assert.ok(capturedUrl.endsWith('/recommendations/rec-zone-a-001/reject'));
      assert.equal(capturedBody.reason, 'Route A blocked; recalculate from Depot 2');
      assert.equal(res.success, true);
      assert.equal(res.recommendation.status, 'rejected');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. What-If Simulation Client Integration & Safety (PRD Module 9)
  // ---------------------------------------------------------------------------
  describe('What-If Simulation Client Integration', () => {
    it('should execute What-If fleet reduction simulation and return baseline-versus-scenario diff', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedBody: any = null;

      const mockSimResponse = {
        simulation_id: 'sim-test-1234',
        zone_id: 'zone-a',
        zone_name: 'Zone A (Barpeta Central / Jania)',
        planning_days: 3,
        scenario_type: 'fleet_reduction',
        changes_applied: {
          zone_id: 'zone-a',
          scenario_type: 'fleet_reduction',
          remove_boats: 4,
        },
        baseline: {
          demand: { zone_id: 'zone-a' },
          allocation: { zone_id: 'zone-a' },
        },
        simulated: {
          allocation: { zone_id: 'zone-a' },
        },
        comparison: {
          resources: [
            {
              resource_type: 'boats',
              name: 'Rescue Boats',
              unit: 'boats',
              requested_quantity: 4,
              baseline_allocated: 4,
              simulated_allocated: 4,
              baseline_unmet: 0,
              simulated_unmet: 0,
              unmet_increase: 0,
              shortage_status: 'fulfilled',
            },
          ],
          supplying_centers_diff: [
            {
              center_id: 'center-3',
              center_name: 'Barpeta Base',
              resource_type: 'boats',
              baseline_quantity: 4,
              simulated_quantity: 0,
              delta: -4,
            },
          ],
          new_shortages_detected: [],
          road_impact: null,
        },
        suggested_mitigations: ['Regional inventory pool demonstrates resilience.'],
        summary_explanation: 'What-If scenario fleet_reduction evaluated for Zone A.',
        is_simulated: true,
        persisted: true,
        disclaimer: 'SIMULATION ONLY — No live operational inventory was altered.',
        created_at: new Date().toISOString(),
      };

      globalThis.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedMethod = init?.method || 'GET';
        capturedBody = JSON.parse(String(init?.body || '{}'));

        return new Response(JSON.stringify(mockSimResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await api.runSimulation({
        zone_id: 'zone-a',
        scenario_type: 'fleet_reduction',
        remove_boats: 4,
      });

      assert.ok(capturedUrl.endsWith('/simulation/run'));
      assert.equal(capturedMethod, 'POST');
      assert.equal(capturedBody.scenario_type, 'fleet_reduction');
      assert.equal(capturedBody.remove_boats, 4);

      assert.equal(res.simulation_id, 'sim-test-1234');
      assert.equal(res.is_simulated, true);
      assert.equal(res.comparison.resources[0].shortage_status, 'fulfilled');
      assert.equal(res.comparison.supplying_centers_diff[0].delta, -4);
    });

    it('should throw ApiError with status and details when simulation parameters are invalid', async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: 'Simulation validation error [remove_boats]: Cannot remove 50 boats; only 8 available.',
            field: 'remove_boats',
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );

      await assert.rejects(
        async () => {
          await api.runSimulation({
            zone_id: 'zone-a',
            scenario_type: 'fleet_reduction',
            remove_boats: 50,
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 400);
          assert.ok(err.message.includes('Cannot remove 50 boats'));
          return true;
        }
      );
    });
  });
});
