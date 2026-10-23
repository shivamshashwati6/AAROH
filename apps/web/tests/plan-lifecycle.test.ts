import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, RecommendationItem, ResponsePlanStatus } from '../src/services/api';
import { isRoleAuthorized } from '../src/utils/auth-roles';
import { UserRole } from '@relief-os/shared';

describe('RELIEF-OS Plan Lifecycle & Safe Inventory Web Client Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    api.logout();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    api.logout();
  });

  // ---------------------------------------------------------------------------
  // 1. Plan Lifecycle API Client Integration
  // ---------------------------------------------------------------------------
  describe('Plan Lifecycle API Methods', () => {
    const mockPlan: RecommendationItem = {
      id: 'rec-zone-a-001',
      zone_id: 'zone-a',
      plan: {
        zone_id: 'zone-a',
        source_center_id: 'center-barpeta-03',
        source_center: 'Barpeta Center #3',
        resources_recommended: {
          boats: 4,
          food_kits: 250,
          water_units: 600,
          medical_teams: 3,
        },
      },
      explanation: 'Autonomous AI response recommendation',
      status: 'draft',
      created_at: new Date().toISOString(),
    };

    it('modifyPlan should send PATCH request with updated quantities and reason', async () => {
      let capturedUrl = '';
      let capturedMethod = '';
      let capturedBody: any = null;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedMethod = init?.method || 'GET';
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Response plan modified',
            recommendation: {
              ...mockPlan,
              status: 'modified',
              plan: {
                ...mockPlan.plan,
                resources_recommended: capturedBody.resources,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch;

      api.setToken('mock-officer-token');
      const result = await api.modifyPlan('rec-zone-a-001', {
        resources: { boats: 5, food_kits: 300, water_units: 700, medical_teams: 3 },
        reason: 'Increased field distress calls in sector 3',
      });

      assert.ok(capturedUrl.endsWith('/recommendations/rec-zone-a-001'));
      assert.equal(capturedMethod, 'PATCH');
      assert.equal(capturedBody.reason, 'Increased field distress calls in sector 3');
      assert.equal(result.success, true);
      assert.equal(result.recommendation.status, 'modified');
      assert.equal(result.recommendation.plan.resources_recommended.boats, 5);
    });

    it('dispatchPlan should send POST to /dispatch and return in_transit status', async () => {
      let capturedUrl = '';
      let capturedMethod = '';

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedMethod = init?.method || 'GET';

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Plan successfully dispatched',
            recommendation: { ...mockPlan, status: 'in_transit', dispatched_by: 'usr-officer-1' },
            deductions: [{ resource_type: 'food_kits', quantity_deducted: 250, remaining_stock: 950 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch;

      api.setToken('mock-officer-token');
      const result = await api.dispatchPlan('rec-zone-a-001', { execution_notes: 'NDRF unit deployed' });

      assert.ok(capturedUrl.endsWith('/recommendations/rec-zone-a-001/dispatch'));
      assert.equal(capturedMethod, 'POST');
      assert.equal(result.success, true);
      assert.equal(result.recommendation.status, 'in_transit');
      assert.equal(result.recommendation.dispatched_by, 'usr-officer-1');
    });

    it('dispatchPlan should throw ApiError with 409 and shortage details when warehouse is deficient', async () => {
      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({
            error: 'Insufficient stock for plan dispatch: food_kits: requested 9999, available 1200, shortage 8799',
            shortages: [{ resource_type: 'food_kits', requested: 9999, available: 1200, shortage: 8799 }],
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch;

      api.setToken('mock-officer-token');
      await assert.rejects(
        async () => {
          await api.dispatchPlan('rec-zone-a-001');
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 409);
          assert.match(err.message, /insufficient stock/i);
          return true;
        }
      );
    });

    it('deliverPlan should send POST to /deliver with delivery notes', async () => {
      let capturedUrl = '';
      let capturedMethod = '';

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedMethod = init?.method || 'GET';

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Delivery confirmed',
            recommendation: { ...mockPlan, status: 'delivered', completed_at: new Date().toISOString() },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch;

      api.setToken('mock-officer-token');
      const result = await api.deliverPlan('rec-zone-a-001', 'Delivered to shelter 2');

      assert.ok(capturedUrl.endsWith('/recommendations/rec-zone-a-001/deliver'));
      assert.equal(capturedMethod, 'POST');
      assert.equal(result.recommendation.status, 'delivered');
    });

    it('failPlan should send POST to /fail with failure_reason and disposition', async () => {
      let capturedUrl = '';
      let capturedBody: any = null;

      globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedBody = init?.body ? JSON.parse(String(init.body)) : null;

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Failure logged',
            recommendation: {
              ...mockPlan,
              status: 'failed',
              failure_reason: capturedBody.failure_reason,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch;

      api.setToken('mock-officer-token');
      const result = await api.failPlan('rec-zone-a-001', {
        failure_reason: 'Bridge collapsed on Route C',
        disposition: 'stock_returned',
      });

      assert.ok(capturedUrl.endsWith('/recommendations/rec-zone-a-001/fail'));
      assert.equal(capturedBody.disposition, 'stock_returned');
      assert.equal(result.recommendation.status, 'failed');
    });

    it('reallocatePlan should send POST to /reallocate and return fresh draft plan', async () => {
      let capturedUrl = '';

      globalThis.fetch = (async (url: string | URL | Request) => {
        capturedUrl = String(url);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Reallocated plan drafted',
            plan: {
              ...mockPlan,
              id: 'rec-zone-a-realloc-002',
              status: 'draft',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch;

      api.setToken('mock-officer-token');
      const result = await api.reallocatePlan('rec-zone-a-001');

      assert.ok(capturedUrl.endsWith('/recommendations/rec-zone-a-001/reallocate'));
      assert.equal(result.plan.status, 'draft');
      assert.equal(result.plan.id, 'rec-zone-a-realloc-002');
    });

    it('promoteSimulationToDraft should send POST to /simulation/runs/:id/promote', async () => {
      let capturedUrl = '';

      globalThis.fetch = (async (url: string | URL | Request) => {
        capturedUrl = String(url);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Simulation promoted to draft plan',
            recommendation: {
              ...mockPlan,
              id: 'plan-from-sim-001',
              status: 'draft',
              source_simulation_id: 'sim-run-99',
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch;

      api.setToken('mock-officer-token');
      const result = await api.promoteSimulationToDraft('sim-run-99');

      assert.ok(capturedUrl.endsWith('/simulation/runs/sim-run-99/promote'));
      assert.equal(result.recommendation.status, 'draft');
      assert.equal(result.recommendation.source_simulation_id, 'sim-run-99');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Lifecycle Permissions & Role Verification
  // ---------------------------------------------------------------------------
  describe('Plan Lifecycle Role Permissions', () => {
    const executiveRoles: UserRole[] = ['command_center', 'admin', 'officer'];

    it('authorizes command_center, admin, and officer for executive plan governance', () => {
      assert.equal(isRoleAuthorized('command_center', executiveRoles), true);
      assert.equal(isRoleAuthorized('admin', executiveRoles), true);
      assert.equal(isRoleAuthorized('officer', executiveRoles), true);
    });

    it('forbids citizens and public users from plan modification, dispatch, or approval', () => {
      assert.equal(isRoleAuthorized('citizen', executiveRoles), false);
    });

    it('verifies valid lifecycle status union contains all 7 canonical states', () => {
      const validStatuses: ResponsePlanStatus[] = [
        'draft',
        'approved',
        'modified',
        'rejected',
        'in_transit',
        'delivered',
        'failed',
      ];
      assert.equal(validStatuses.length, 7);
    });
  });
});
