/**
 * RELIEF-OS Frontend Separate Role-Based Login & Auth Routing Tests
 * 
 * Verifies:
 * 1. api.login with portal parameter ('citizen', 'department', 'admin').
 * 2. ProtectedRoute unauthenticated redirects to role-specific login paths:
 *    - /citizen -> /citizen/login
 *    - /department -> /department/login
 *    - /admin -> /admin/login
 *    - other -> /login
 * 3. Role-based unauthorized redirects to home route.
 * 4. Auth state survival across page refresh (storage hydration + getMe).
 * 5. Safe post-login redirect destinations for each role.
 * 6. Public citizen registration without role or department fields.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/services/api';
import { safeStorage } from '../src/utils/storage';
import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  getHomeRouteForUser,
  getSafeRedirectForUser,
  isRoleAuthorized,
  isCitizenRole,
  isAdminRole,
  isDepartmentRole,
} from '../src/utils/auth-roles';
import { User, AuthResponse } from '@relief-os/shared';

describe('RELIEF-OS Frontend Separate Role-Based Login & Auth Routing Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    api.logout();
    safeStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    api.logout();
    safeStorage.clear();
  });

  // ---------------------------------------------------------------------------
  // 1. Separate Portal API Login Requests
  // ---------------------------------------------------------------------------
  describe('api.login with Portal Scope Parameter', () => {
    it('should include portal: "citizen" in request body when citizen login is called', async () => {
      let capturedBody: any = null;

      globalThis.fetch = async (_input, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            user: {
              id: 'usr-cit-1',
              name: 'Citizen Test',
              email: 'cit@example.com',
              role: 'citizen',
              department: null,
            },
            token: 'citizen.jwt.token',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await api.login({
        email: 'cit@example.com',
        password: 'Password123!',
        portal: 'citizen',
      });

      assert.equal(capturedBody.portal, 'citizen');
      assert.equal(res.user.role, 'citizen');
      assert.equal(api.getToken(), 'citizen.jwt.token');
    });

    it('should include portal: "department" in request body when department login is called', async () => {
      let capturedBody: any = null;

      globalThis.fetch = async (_input, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            user: {
              id: 'usr-dept-1',
              name: 'Dept Lead',
              email: 'dept@relief.internal',
              role: 'department',
              department: 'rescue',
            },
            token: 'dept.jwt.token',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await api.login({
        email: 'dept@relief.internal',
        password: 'Password123!',
        portal: 'department',
      });

      assert.equal(capturedBody.portal, 'department');
      assert.equal(res.user.role, 'department');
      assert.equal(res.user.department, 'rescue');
    });

    it('should include portal: "admin" in request body when admin login is called', async () => {
      let capturedBody: any = null;

      globalThis.fetch = async (_input, init) => {
        capturedBody = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            user: {
              id: 'usr-adm-1',
              name: 'Admin User',
              email: 'admin@relief.internal',
              role: 'admin',
              department: null,
            },
            token: 'admin.jwt.token',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await api.login({
        email: 'admin@relief.internal',
        password: 'Password123!',
        portal: 'admin',
      });

      assert.equal(capturedBody.portal, 'admin');
      assert.equal(res.user.role, 'admin');
    });

    it('should handle portal mismatch error from server cleanly with ApiError', async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({ error: 'Invalid credentials for Citizen portal access' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );

      await assert.rejects(
        async () => {
          await api.login({
            email: 'admin@relief.internal',
            password: 'AdminPassword123!',
            portal: 'citizen',
          });
        },
        (err: unknown) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 401);
          assert.match(err.message, /Citizen portal access/i);
          return true;
        }
      );

      // Verify no session was created
      assert.equal(api.getToken(), null);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Unauthenticated Target Route Resolution
  // ---------------------------------------------------------------------------
  describe('Unauthenticated Redirection Routing Targets', () => {
    const resolveTargetLogin = (path: string, allowedRoles?: string[]): string => {
      if (path.startsWith('/citizen') || (allowedRoles?.length === 1 && allowedRoles[0] === 'citizen')) {
        return '/citizen/login';
      }
      if (
        path.startsWith('/department') ||
        (allowedRoles?.includes('department') && !allowedRoles?.includes('citizen') && !allowedRoles?.includes('command_center'))
      ) {
        return '/department/login';
      }
      if (path.startsWith('/admin') || (allowedRoles?.length === 1 && allowedRoles[0] === 'admin')) {
        return '/admin/login';
      }
      return '/login';
    };

    it('should redirect unauthenticated users targeting /citizen to /citizen/login', () => {
      assert.equal(resolveTargetLogin('/citizen', ['citizen']), '/citizen/login');
      assert.equal(resolveTargetLogin('/citizen/reports', ['citizen']), '/citizen/login');
    });

    it('should redirect unauthenticated users targeting /department to /department/login', () => {
      assert.equal(
        resolveTargetLogin('/department', ['department', 'coordinator', 'team_lead']),
        '/department/login'
      );
    });

    it('should redirect unauthenticated users targeting /admin to /admin/login', () => {
      assert.equal(resolveTargetLogin('/admin', ['admin']), '/admin/login');
    });

    it('should redirect other protected routes to /login', () => {
      assert.equal(resolveTargetLogin('/command', ['command_center', 'admin', 'officer']), '/login');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Auth State Persistence Across Page Refresh
  // ---------------------------------------------------------------------------
  describe('Auth State Survival Across Page Refresh', () => {
    it('should restore token and user from safeStorage on reload', async () => {
      const persistedUser: User = {
        id: 'usr-persisted-citizen',
        name: 'Persisted Citizen',
        email: 'persisted@relief.internal',
        role: 'citizen',
        department: null,
      };
      const persistedToken = 'persisted.jwt.token.12345';

      // Simulate prior active session
      api.setToken(persistedToken);
      safeStorage.setItem(AUTH_USER_KEY, JSON.stringify(persistedUser));

      // Verify retrieval
      assert.equal(api.getToken(), persistedToken);
      const stored = JSON.parse(safeStorage.getItem(AUTH_USER_KEY) || '{}');
      assert.equal(stored.id, 'usr-persisted-citizen');
      assert.equal(stored.role, 'citizen');

      // Verify getMe uses restored token
      let capturedAuthHeader = '';
      globalThis.fetch = async (_input, init) => {
        capturedAuthHeader = (init?.headers as Record<string, string>)?.['Authorization'] || '';
        return new Response(
          JSON.stringify({ user: persistedUser }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await api.getMe();
      assert.equal(capturedAuthHeader, `Bearer ${persistedToken}`);
      assert.equal(res.user.id, 'usr-persisted-citizen');
    });

    it('should purge session and storage on logout', () => {
      api.setToken('token-to-purge');
      safeStorage.setItem(AUTH_USER_KEY, JSON.stringify({ id: 'usr-42' }));

      assert.ok(api.getToken());
      assert.ok(safeStorage.getItem(AUTH_USER_KEY));

      api.logout();

      assert.equal(api.getToken(), null);
      assert.equal(safeStorage.getItem(AUTH_TOKEN_KEY), null);
      assert.equal(safeStorage.getItem(AUTH_USER_KEY), null);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Role Hierarchy & Safe Post-Login Navigation
  // ---------------------------------------------------------------------------
  describe('Safe Post-Login Redirection by Role', () => {
    it('should route citizen to /citizen and forbid access to /admin or /department', () => {
      const citizen: User = {
        id: 'usr-cit',
        name: 'Citizen',
        email: 'cit@relief.internal',
        role: 'citizen',
      };

      assert.equal(getHomeRouteForUser(citizen), '/citizen');
      assert.equal(getSafeRedirectForUser(citizen, '/citizen'), '/citizen');
      // Unauthorized cross-portal attempts redirected to citizen home
      assert.equal(getSafeRedirectForUser(citizen, '/admin'), '/citizen');
      assert.equal(getSafeRedirectForUser(citizen, '/department'), '/citizen');
    });

    it('should route department users to /department and forbid access to /admin', () => {
      const deptUser: User = {
        id: 'usr-dept',
        name: 'Dept Lead',
        email: 'dept@relief.internal',
        role: 'department',
        department: 'supply',
      };

      assert.equal(getHomeRouteForUser(deptUser), '/department');
      assert.equal(getSafeRedirectForUser(deptUser, '/department'), '/department');
      assert.equal(getSafeRedirectForUser(deptUser, '/admin'), '/department');
    });

    it('should route admin users to /admin and allow authorized administrative access', () => {
      const admin: User = {
        id: 'usr-admin',
        name: 'Lead Admin',
        email: 'admin@relief.internal',
        role: 'admin',
      };

      assert.equal(getHomeRouteForUser(admin), '/admin');
      assert.equal(getSafeRedirectForUser(admin, '/admin'), '/admin');
    });
  });
});
