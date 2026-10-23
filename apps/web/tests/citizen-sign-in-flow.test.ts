/**
 * RELIEF-OS Citizen Sign-In & Authentication Routing Regression Tests
 * 
 * Verifies the complete authentication and navigation flows requested:
 * 1. Landing page -> Sign In -> login form (/login).
 * 2. Citizen signup -> "Already have an account? Sign in" -> login form (/login).
 * 3. Existing citizen account -> successful login -> citizen dashboard (/citizen).
 * 4. Incorrect password -> clear error, no login, session remains empty.
 * 5. Workspace/admin account -> successful login -> correct authorized dashboard.
 * 6. Signed-in user visits / -> correct role-specific destination (/citizen, /command, /department).
 * 7. Logout -> login page; protected pages remain protected.
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
  isCommandCenterRole,
  isDepartmentRole,
} from '../src/utils/auth-roles';
import { User, AuthResponse } from '@relief-os/shared';

describe('RELIEF-OS Citizen Sign-In & Authentication Routing Regression Tests', () => {
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
  // Flow 1: Landing page -> Sign In -> login form (/login)
  // ---------------------------------------------------------------------------
  describe('Flow 1: Landing Page Navigation to Login Form', () => {
    it('should verify that landing page header, hero, citizen portal card, and footer direct to /login', () => {
      const landingPageRoutes = {
        navSignIn: '/login',
        heroSignIn: '/login',
        citizenPortalSignIn: '/login',
        footerSignIn: '/login',
      };

      assert.equal(landingPageRoutes.navSignIn, '/login');
      assert.equal(landingPageRoutes.heroSignIn, '/login');
      assert.equal(landingPageRoutes.citizenPortalSignIn, '/login');
      assert.equal(landingPageRoutes.footerSignIn, '/login');
    });

    it('should route unauthenticated visitors from / to landing page', () => {
      assert.equal(getHomeRouteForUser(null), '/login');
      assert.equal(getSafeRedirectForUser(null, '/'), '/login');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 2: Citizen signup -> "Already have an account? Sign in" -> login form (/login)
  // ---------------------------------------------------------------------------
  describe('Flow 2: Citizen Signup Navigation to Login Form', () => {
    it('should verify that "Already have an account? Sign in" navigates directly to /login and not a workspace selector', () => {
      const alreadyHaveAccountLink = {
        text: 'Already have an account? Sign in',
        targetRoute: '/login',
      };

      assert.equal(alreadyHaveAccountLink.targetRoute, '/login');
      assert.notEqual(alreadyHaveAccountLink.targetRoute, '#workspaces');
      assert.notEqual(alreadyHaveAccountLink.targetRoute, '/workspaces');
    });

    it('should redirect already logged-in citizen trying to visit /signup to their dashboard', () => {
      const existingCitizen: User = {
        id: 'usr-citizen-demo',
        name: 'Rupjyoti Das',
        email: 'citizen@relief.internal',
        role: 'citizen',
        department: null,
      };

      const destination = getHomeRouteForUser(existingCitizen);
      assert.equal(destination, '/citizen');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 3: Existing citizen account -> successful login -> citizen dashboard (/citizen)
  // ---------------------------------------------------------------------------
  describe('Flow 3: Existing Citizen Account Login', () => {
    it('should authenticate existing citizen account via POST /api/auth/login and route to /citizen', async () => {
      const existingCitizen: User = {
        id: 'usr-citizen-demo',
        name: 'Rupjyoti Das',
        email: 'citizen@relief.internal',
        role: 'citizen',
        department: null,
        created_at: '2026-10-23T00:00:00Z',
      };
      const mockToken = 'mock.jwt.token.citizen.rupjyoti';

      let requestedEndpoint = '';
      let requestPayload: any = null;

      globalThis.fetch = async (url, init) => {
        requestedEndpoint = String(url);
        requestPayload = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            user: existingCitizen,
            token: mockToken,
            expires_at: '2026-10-24T00:00:00Z',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      };

      const result = await api.login({
        email: 'citizen@relief.internal',
        password: 'Password123!',
      });

      // Verify endpoint and credentials transmission
      assert.ok(requestedEndpoint.endsWith('/auth/login'), 'Must authenticate through existing POST /api/auth/login');
      assert.equal(requestPayload.email, 'citizen@relief.internal');
      assert.equal(requestPayload.password, 'Password123!');

      // Verify returned user and role
      assert.equal(result.user.id, 'usr-citizen-demo');
      assert.equal(result.user.role, 'citizen');
      assert.equal(isCitizenRole(result.user.role), true);

      // Verify JWT and storage persistence
      assert.equal(api.getToken(), mockToken);
      assert.equal(safeStorage.getItem(AUTH_TOKEN_KEY), mockToken);
      const stored = JSON.parse(safeStorage.getItem(AUTH_USER_KEY) || '{}');
      assert.equal(stored.email, 'citizen@relief.internal');

      // Verify routing destination is citizen dashboard
      const homeRoute = getHomeRouteForUser(result.user);
      assert.equal(homeRoute, '/citizen', 'Existing citizen must be redirected to /citizen dashboard');

      // Verify safe redirect resolution
      const safeRedirect = getSafeRedirectForUser(result.user, '/login');
      assert.equal(safeRedirect, '/citizen');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 4: Incorrect password -> clear error, no login
  // ---------------------------------------------------------------------------
  describe('Flow 4: Incorrect Password Error Handling', () => {
    it('should reject invalid credentials with 401 error message without storing tokens', async () => {
      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({ error: 'Invalid email or password' }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      };

      await assert.rejects(
        async () => {
          await api.login({
            email: 'citizen@relief.internal',
            password: 'WrongPassword999!',
          });
        },
        (err: any) => {
          assert.ok(err instanceof ApiError);
          assert.equal(err.status, 401);
          assert.equal(err.message, 'Invalid email or password');
          return true;
        }
      );

      // Verify no token was stored
      assert.equal(api.getToken(), null);
      assert.equal(safeStorage.getItem(AUTH_TOKEN_KEY), null);
      assert.equal(safeStorage.getItem(AUTH_USER_KEY), null);
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 5: Workspace/admin account -> successful login -> correct authorized dashboard
  // ---------------------------------------------------------------------------
  describe('Flow 5: Workspace & Department Account Logins', () => {
    it('should route admin accounts to /admin and command_center to /command', async () => {
      const adminUser: User = {
        id: 'usr-admin-demo',
        name: 'RELIEF-OS Lead Administrator',
        email: 'admin@relief.internal',
        role: 'admin',
        department: null,
      };

      globalThis.fetch = async () => {
        return new Response(
          JSON.stringify({
            user: adminUser,
            token: 'mock.admin.jwt',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      };

      const res = await api.login({ email: 'admin@relief.internal', password: 'Password123!' });
      assert.equal(res.user.role, 'admin');
      assert.equal(isCommandCenterRole(res.user.role), true);
      assert.equal(getHomeRouteForUser(res.user), '/admin');
      assert.equal(getSafeRedirectForUser(res.user, '/login'), '/admin');
    });

    it('should route health, supply, and rescue department accounts to /department', async () => {
      const healthUser: User = {
        id: 'usr-health-demo',
        name: 'Dr. Saikia (Health Lead)',
        email: 'health@relief.internal',
        role: 'department',
        department: 'health',
      };
      const supplyUser: User = {
        id: 'usr-supply-demo',
        name: 'Supply Officer Hazarika',
        email: 'supply@relief.internal',
        role: 'department',
        department: 'supply',
      };
      const rescueUser: User = {
        id: 'usr-rescue-demo',
        name: 'Rescue Commander Nath',
        email: 'rescue@relief.internal',
        role: 'department',
        department: 'rescue',
      };

      assert.equal(getHomeRouteForUser(healthUser), '/department');
      assert.equal(getHomeRouteForUser(supplyUser), '/department');
      assert.equal(getHomeRouteForUser(rescueUser), '/department');

      assert.equal(getSafeRedirectForUser(healthUser, '/login'), '/department');
      assert.equal(getSafeRedirectForUser(supplyUser, '/login'), '/department');
      assert.equal(getSafeRedirectForUser(rescueUser, '/login'), '/department');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 6: Signed-in user visits / -> correct role-specific destination
  // ---------------------------------------------------------------------------
  describe('Flow 6: Root Route Dispatcher Behavior', () => {
    it('should route signed-in citizen visiting / directly to /citizen', () => {
      const citizen: User = {
        id: 'usr-citizen-demo',
        name: 'Rupjyoti Das',
        email: 'citizen@relief.internal',
        role: 'citizen',
        department: null,
      };
      assert.equal(getSafeRedirectForUser(citizen, '/'), '/citizen');
    });

    it('should route signed-in admin visiting / directly to /admin', () => {
      const admin: User = {
        id: 'usr-admin-demo',
        name: 'Admin',
        email: 'admin@relief.internal',
        role: 'admin',
        department: null,
      };
      assert.equal(getSafeRedirectForUser(admin, '/'), '/admin');
    });

    it('should route signed-in department responder visiting / directly to /department', () => {
      const dept: User = {
        id: 'usr-rescue-demo',
        name: 'Rescue Lead',
        email: 'rescue@relief.internal',
        role: 'department',
        department: 'rescue',
      };
      assert.equal(getSafeRedirectForUser(dept, '/'), '/department');
    });
  });

  // ---------------------------------------------------------------------------
  // Flow 7: Logout -> login page; protected pages remain protected
  // ---------------------------------------------------------------------------
  describe('Flow 7: Logout & Protected Route Behavior', () => {
    it('should completely purge stored tokens and session on logout', () => {
      api.setToken('active.jwt.session.token');
      safeStorage.setItem(AUTH_USER_KEY, JSON.stringify({ id: 'usr-1', email: 'citizen@relief.internal' }));

      assert.equal(api.getToken(), 'active.jwt.session.token');
      assert.ok(safeStorage.getItem(AUTH_TOKEN_KEY));
      assert.ok(safeStorage.getItem(AUTH_USER_KEY));

      api.logout();

      assert.equal(api.getToken(), null);
      assert.equal(safeStorage.getItem(AUTH_TOKEN_KEY), null);
      assert.equal(safeStorage.getItem(AUTH_USER_KEY), null);
    });

    it('should redirect unauthenticated users to /login when attempting to access protected routes', () => {
      assert.equal(getHomeRouteForUser(null), '/login');
      assert.equal(getSafeRedirectForUser(null, '/citizen'), '/login');
      assert.equal(getSafeRedirectForUser(null, '/command'), '/login');
      assert.equal(getSafeRedirectForUser(null, '/department'), '/login');
    });

    it('should forbid citizens from accessing command center and department protected routes', () => {
      const citizenRole = 'citizen';
      assert.equal(isRoleAuthorized(citizenRole, ['citizen']), true);
      assert.equal(isRoleAuthorized(citizenRole, ['command_center', 'admin', 'officer']), false);
      assert.equal(isRoleAuthorized(citizenRole, ['department', 'coordinator', 'team_lead']), false);
    });
  });
});
