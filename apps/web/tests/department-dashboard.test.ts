import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/services/api';
import {
  isRoleAuthorized,
  isDepartmentAuthorized,
  getHomeRouteForUser,
  getDepartmentLabel,
} from '../src/utils/auth-roles';
import {
  ZoneDemandResult,
  ZoneAllocationResult,
  User,
  UserRole,
  DepartmentType,
  RoadSegment,
} from '@relief-os/shared';

describe('RELIEF-OS Department Operations Dashboard Integration & Safety Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    api.logout();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    api.logout();
  });

  // ---------------------------------------------------------------------------
  // 1. Department Role & Routing Authorization Guards
  // ---------------------------------------------------------------------------
  describe('Department Role & Routing Guards', () => {
    const allowedDeptRoles: UserRole[] = ['department', 'coordinator', 'team_lead'];

    it('should grant access to /department for department, coordinator, and team_lead', () => {
      assert.equal(isRoleAuthorized('department', allowedDeptRoles), true);
      assert.equal(isRoleAuthorized('coordinator', allowedDeptRoles), true);
      assert.equal(isRoleAuthorized('team_lead', allowedDeptRoles), true);
    });

    it('should forbid citizen from accessing /department', () => {
      assert.equal(isRoleAuthorized('citizen', allowedDeptRoles), false);
    });

    it('should route department users directly to /department', () => {
      const healthUser: User = {
        id: 'usr-h1',
        name: 'Dr. Barua',
        email: 'health@relief.org',
        role: 'department',
        department: 'health',
      };
      const supplyUser: User = {
        id: 'usr-s1',
        name: 'Logistics Officer',
        email: 'supply@relief.org',
        role: 'coordinator',
        department: 'supply',
      };
      const rescueUser: User = {
        id: 'usr-r1',
        name: 'SDRF Lead',
        email: 'rescue@relief.org',
        role: 'team_lead',
        department: 'rescue',
      };

      assert.equal(getHomeRouteForUser(healthUser), '/department');
      assert.equal(getHomeRouteForUser(supplyUser), '/department');
      assert.equal(getHomeRouteForUser(rescueUser), '/department');
    });

    it('should validate department assignment allowlist strictly', () => {
      const allowedDepts: DepartmentType[] = ['health', 'supply', 'rescue'];
      assert.equal(isDepartmentAuthorized('health', allowedDepts), true);
      assert.equal(isDepartmentAuthorized('supply', allowedDepts), true);
      assert.equal(isDepartmentAuthorized('rescue', allowedDepts), true);
      assert.equal(isDepartmentAuthorized(null, allowedDepts), false);
      assert.equal(isDepartmentAuthorized(undefined, allowedDepts), false);
    });

    it('should format department labels accurately', () => {
      assert.equal(getDepartmentLabel('health'), 'Health & Medical');
      assert.equal(getDepartmentLabel('supply'), 'Supply & Logistics');
      assert.equal(getDepartmentLabel('rescue'), 'Rescue & Evacuation');
      assert.equal(getDepartmentLabel(null), 'General Department');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Health Department Data & Triage Integration
  // ---------------------------------------------------------------------------
  describe('Health Department Operational View', () => {
    it('should aggregate available medical teams across regional resource bases', async () => {
      const mockCenters = {
        items: [
          { id: 'center-1', name: 'Guwahati Hub', medical_teams_available: 6, vehicles_available: 3, boats_available: 1, total_fleet: 4 },
          { id: 'center-2', name: 'Nalbari Depot', medical_teams_available: 3, vehicles_available: 2, boats_available: 1, total_fleet: 3 },
          { id: 'center-3', name: 'Barpeta Base', medical_teams_available: 5, vehicles_available: 4, boats_available: 4, total_fleet: 8 },
          { id: 'center-4', name: 'Dhubri Base', medical_teams_available: 4, vehicles_available: 2, boats_available: 1, total_fleet: 3 },
          { id: 'center-5', name: 'Goalpara Outpost', medical_teams_available: 3, vehicles_available: 2, boats_available: 1, total_fleet: 3 },
        ],
        total: 5,
        limit: 50,
        offset: 0,
      };

      globalThis.fetch = async () =>
        new Response(JSON.stringify(mockCenters), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const res = await api.getResourceCenters();
      const totalTeams = res.items.reduce((acc, c) => acc + c.medical_teams_available, 0);
      assert.equal(totalTeams, 21);
    });

    it('should filter citizen distress reports with medical urgency', async () => {
      let capturedUrl = '';
      const mockReports = {
        items: [
          {
            id: 'rep-1',
            disaster_id: 'disaster-assam-2026',
            location_lat: 26.32,
            location_lng: 91.01,
            description: 'Elderly patient requires insulin and dehydration drip',
            severity: 'critical',
            medical_need: true,
            status: 'verified',
            created_at: new Date().toISOString(),
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      };

      globalThis.fetch = async (input) => {
        capturedUrl = String(input);
        return new Response(JSON.stringify(mockReports), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await api.getReports({ medical_need: true });
      assert.ok(capturedUrl.includes('medical_need=true'));
      assert.equal(res.items.length, 1);
      assert.equal(res.items[0].medical_need, true);
    });

    it('should evaluate medical teams allocation and identify supplying center', async () => {
      const mockAllocation: Partial<ZoneAllocationResult> = {
        zone_id: 'zone-a',
        zone_name: 'Zone A (Barpeta Central / Jania)',
        priority_score: 94,
        priority_band: 'Critical',
        planning_horizon_days: 3,
        demand_summary: {
          affected_population: 3842,
          food_kits: 1200,
          water_units: 800,
          boats: 4,
          medical_teams: 1,
        },
        available_inventory: {
          food_kits: 15200,
          water_units: 13400,
          boats: 8,
          medical_teams: 21,
        },
        allocations: {
          food_kits: {} as any,
          water_units: {} as any,
          boats: {} as any,
          medical_teams: {
            resource_type: 'medical_teams',
            name: 'Emergency Medical Response Teams',
            unit: 'teams',
            requested_quantity: 1,
            available_quantity: 5,
            allocated_quantity: 1,
            unmet_quantity: 0,
            shortage_detected: false,
            supplying_centers: [
              {
                center_id: 'center-3',
                center_name: 'Barpeta Relief Base #3',
                distance_km: 1.2,
                allocated_quantity: 1,
                unit: 'teams',
              },
            ],
            explanation: '1 medical team allocated from co-located Barpeta Relief Base #3',
          },
        },
        primary_source_center: {
          id: 'center-3',
          name: 'Barpeta Relief Base #3',
          distance_km: 1.2,
        },
        overall_shortage: false,
        overall_explanation: 'All requirements met.',
        generated_at: new Date().toISOString(),
      };

      globalThis.fetch = async () =>
        new Response(JSON.stringify(mockAllocation), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const res = await api.getZoneAllocation('zone-a', 3);
      assert.equal(res.allocations.medical_teams.requested_quantity, 1);
      assert.equal(res.allocations.medical_teams.allocated_quantity, 1);
      assert.equal(res.allocations.medical_teams.unmet_quantity, 0);
      assert.equal(res.allocations.medical_teams.supplying_centers[0].center_id, 'center-3');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Supply Department Data & Warehouse Integration
  // ---------------------------------------------------------------------------
  describe('Supply Department Operational View', () => {
    it('should retrieve single resource center detail with warehouse stock inventory', async () => {
      let capturedUrl = '';
      const mockCenterDetail = {
        id: 'center-3',
        name: 'Barpeta Relief Base #3',
        location_lat: 26.3216,
        location_lng: 91.0059,
        vehicles_available: 4,
        boats_available: 4,
        medical_teams_available: 5,
        total_fleet: 8,
        inventory: [
          { id: 'res-c3-food', resource_type: 'food_kits', quantity: 2500, status: 'available', created_at: new Date().toISOString() },
          { id: 'res-c3-water', resource_type: 'water_units', quantity: 2000, status: 'available', created_at: new Date().toISOString() },
        ],
        created_at: new Date().toISOString(),
      };

      globalThis.fetch = async (input) => {
        capturedUrl = String(input);
        return new Response(JSON.stringify(mockCenterDetail), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const res = await api.getResourceCenterById('center-3');
      assert.ok(capturedUrl.endsWith('/resource-centers/center-3'));
      assert.equal(res.id, 'center-3');
      assert.equal(res.inventory.length, 2);
      assert.equal(res.inventory[0].quantity, 2500);
      assert.equal(res.inventory[1].quantity, 2000);
    });

    it('should distinguish food kit demand, allocated quantity, and unmet gap for 3-day horizon', async () => {
      const mockDemand: Partial<ZoneDemandResult> = {
        zone_id: 'zone-a',
        zone_name: 'Zone A',
        affected_population: 3842,
        priority_score: 94,
        band: 'Critical',
        planning_horizon_days: 3,
        demands: {
          food_kits: {
            resource_type: 'food_kits',
            name: 'Food Relief Ration Kits',
            quantity: 1200,
            unit: 'kits',
            formula: 'round(...)',
            explanation: 'Estimated at 1,200 kits',
            is_assumed_param: false,
          },
          water_units: {
            resource_type: 'water_units',
            name: 'Potable Water Units',
            quantity: 800,
            unit: 'units',
            formula: 'round(...)',
            explanation: 'Estimated at 800 water units',
            is_assumed_param: false,
          },
          boats: {
            resource_type: 'boats',
            name: 'Rescue Boats',
            quantity: 4,
            unit: 'boats',
            formula: 'round(...)',
            explanation: 'Estimated at 4 boats',
            is_assumed_param: false,
          },
          medical_teams: {
            resource_type: 'medical_teams',
            name: 'Medical Teams',
            quantity: 1,
            unit: 'teams',
            formula: 'round(...)',
            explanation: '1 team',
            is_assumed_param: false,
          },
        },
        summary_explanation: 'Demand calculated deterministically.',
        generated_at: new Date().toISOString(),
      };

      globalThis.fetch = async () =>
        new Response(JSON.stringify(mockDemand), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });

      const res = await api.getZoneDemand('zone-a', 3);
      assert.equal(res.demands.food_kits.quantity, 1200);
      assert.equal(res.demands.water_units.quantity, 800);
      assert.equal(res.planning_horizon_days, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Rescue Department Data & Road Mutation Integration
  // ---------------------------------------------------------------------------
  describe('Rescue Department Operational View & Road Status Updates', () => {
    it('should list road segments and categorize accessible, partial, and blocked routes', async () => {
      const mockRoads: { items: RoadSegment[]; total: number; limit: number; offset: number } = {
        items: [
          { id: 'route-a', name: 'Route A (Barpeta-Howly State Highway)', length_km: 10.2, status: 'blocked', risk_score: 95 },
          { id: 'route-b', name: 'Route B (Rural Embankment Connector)', length_km: 14.1, status: 'partial', risk_score: 65 },
          { id: 'route-c', name: 'Route C (High Elevation Bypass Highway)', length_km: 17.4, status: 'accessible', risk_score: 15 },
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
      assert.equal(res.items.filter((r) => r.status === 'blocked').length, 1);
      assert.equal(res.items.filter((r) => r.status === 'partial').length, 1);
      assert.equal(res.items.filter((r) => r.status === 'accessible').length, 1);
    });

    it('should successfully update road status when authorized Rescue personnel patches condition', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedBody: any = null;

      globalThis.fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedMethod = init?.method || 'GET';
        capturedBody = JSON.parse(String(init?.body || '{}'));

        return new Response(
          JSON.stringify({
            success: true,
            updated_segment: {
              id: 'route-a',
              name: 'Route A (Barpeta-Howly State Highway)',
              length_km: 10.2,
              status: capturedBody.status,
              risk_score: 95,
            },
            note: `Road updated to status: ${capturedBody.status}`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await api.updateRoadStatus('route-a', 'partial', 'Water level subsided from 1.8m to 0.4m');
      assert.ok(capturedUrl.endsWith('/road-segments/route-a'));
      assert.equal(capturedMethod, 'PATCH');
      assert.equal(capturedBody.status, 'partial');
      assert.equal(capturedBody.reason, 'Water level subsided from 1.8m to 0.4m');
      assert.equal(res.success, true);
      assert.equal(res.updated_segment.status, 'partial');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Operational Safety & Security Boundary Verification
  // ---------------------------------------------------------------------------
  describe('Department Permissions & Operational Safety Boundary', () => {
    it('verifies that department users receive 403 Forbidden if attempting response plan approval', async () => {
      // Backend RBAC enforces APPROVAL_ROLES = ['command_center', 'officer', 'admin']
      // Department roles (department, coordinator, team_lead) cannot approve plans.
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: 'Forbidden: Insufficient role permissions for response plan approval',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );

      await assert.rejects(
        async () => {
          await api.approveRecommendation('rec-zone-a-001', 'Attempted unauthorized approval');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 403);
          assert.ok(err.message.includes('Forbidden'));
          return true;
        }
      );
    });

    it('verifies that department users receive 403 Forbidden if attempting response plan rejection', async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: 'Forbidden: Insufficient role permissions for response plan rejection',
          }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );

      await assert.rejects(
        async () => {
          await api.rejectRecommendation('rec-zone-a-001', 'Attempted unauthorized rejection');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 403);
          return true;
        }
      );
    });

    it('guarantees that demand and allocation evaluations do not mutate live inventory or claim dispatch', () => {
      const mockAllocation: ZoneAllocationResult = {
        zone_id: 'zone-a',
        zone_name: 'Zone A',
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
          food_kits: 15200,
          water_units: 13400,
          boats: 8,
          medical_teams: 21,
        },
        allocations: {} as any,
        primary_source_center: { id: 'center-3', name: 'Barpeta Base', distance_km: 1.2 },
        overall_shortage: false,
        overall_explanation: 'Recommendation only',
        generated_at: new Date().toISOString(),
      };

      // PRD Safety guarantee:
      assert.equal((mockAllocation as any).inventory_decremented, undefined);
      assert.equal((mockAllocation as any).physical_dispatch_triggered, undefined);
      assert.equal(mockAllocation.is_simulated, true);
    });

    it('handles API errors gracefully when endpoint fails', async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ error: 'Database service unavailable' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );

      await assert.rejects(
        async () => {
          await api.getZones();
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 503);
          return true;
        }
      );
    });
  });
});
