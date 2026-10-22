import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError } from '../src/services/api';
import { safeStorage } from '../src/utils/storage';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from '../src/utils/auth-roles';
import { User, AuthResponse } from '@relief-os/shared';

describe('RELIEF-OS Frontend Auth API Service Tests', () => {
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
  // 1. Successful Login & Token Persistence
  // ---------------------------------------------------------------------------
  it('should authenticate user and persist token and user to storage upon successful login', async () => {
    const mockUser: User = {
      id: 'usr-officer-01',
      name: 'District Officer Sharma',
      email: 'officer@relief-os.org',
      role: 'officer',
      department: null,
    };
    const mockToken = 'mock.jwt.token.officer';
    const mockResponse: AuthResponse = {
      user: mockUser,
      token: mockToken,
      expires_at: '2026-10-23T20:00:00Z',
    };

    let capturedUrl = '';
    let capturedMethod = '';
    let capturedBody = '';

    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedMethod = init?.method || 'GET';
      capturedBody = String(init?.body || '');
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const res = await api.login({ email: 'officer@relief-os.org', password: 'ValidPassword123' });

    assert.ok(capturedUrl.endsWith('/auth/login'));
    assert.equal(capturedMethod, 'POST');
    assert.ok(capturedBody.includes('officer@relief-os.org'));
    assert.equal(res.user.id, 'usr-officer-01');
    assert.equal(res.token, mockToken);

    // Verify token set in API client and storage
    assert.equal(api.getToken(), mockToken);
    assert.equal(safeStorage.getItem(AUTH_TOKEN_KEY), mockToken);
    const storedUser = JSON.parse(safeStorage.getItem(AUTH_USER_KEY) || '{}');
    assert.equal(storedUser.id, 'usr-officer-01');
  });

  // ---------------------------------------------------------------------------
  // 2. Successful Citizen Signup Flow
  // ---------------------------------------------------------------------------
  it('should successfully register a citizen and strictly omit role or department fields', async () => {
    const mockCitizen: User = {
      id: 'usr-citizen-42',
      name: 'Aarav Borah',
      email: 'aarav@assam.org',
      role: 'citizen',
      department: null,
    };
    const mockToken = 'mock.jwt.token.citizen';

    let capturedPayload: any = null;

    globalThis.fetch = async (_input, init) => {
      capturedPayload = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          user: mockCitizen,
          token: mockToken,
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    const res = await api.registerCitizen({
      name: 'Aarav Borah',
      email: 'aarav@assam.org',
      password: 'SecurePassword2026',
    });

    assert.equal(res.user.role, 'citizen');
    assert.equal(api.getToken(), mockToken);
    // Security check: ensure no privileged fields were transmitted
    assert.equal(capturedPayload.role, undefined);
    assert.equal(capturedPayload.department, undefined);
    assert.equal(capturedPayload.name, 'Aarav Borah');
    assert.equal(capturedPayload.email, 'aarav@assam.org');
  });

  // ---------------------------------------------------------------------------
  // 3. Invalid Credentials and API Error Handling
  // ---------------------------------------------------------------------------
  it('should throw ApiError with status 401 on invalid login credentials', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Invalid email or password' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(
      async () => {
        await api.login({ email: 'bad@user.com', password: 'WrongPassword' });
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 401);
        assert.equal(err.message, 'Invalid email or password');
        return true;
      }
    );
  });

  it('should throw ApiError with status 409 when registering duplicate citizen email', async () => {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: 'An account with this email address already exists' }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      );

    await assert.rejects(
      async () => {
        await api.registerCitizen({
          name: 'Duplicate User',
          email: 'exists@relief-os.org',
          password: 'Password12345',
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 409);
        assert.match(err.message, /already exists/i);
        return true;
      }
    );
  });

  // ---------------------------------------------------------------------------
  // 4. Session Retrieval & Authorization Header Verification
  // ---------------------------------------------------------------------------
  it('should send Authorization: Bearer <token> for authenticated requests when token is present', async () => {
    api.setToken('test-bearer-token-12345');

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = async (_input, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(
        JSON.stringify({
          user: {
            id: 'usr-health-01',
            name: 'Dr. Barua',
            email: 'health@relief-os.org',
            role: 'department',
            department: 'health',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };

    const me = await api.getMe();
    assert.equal(capturedHeaders['Authorization'], 'Bearer test-bearer-token-12345');
    assert.equal(me.user.role, 'department');
    assert.equal(me.user.department, 'health');
  });

  it('should not send Authorization header for unauthenticated public requests', async () => {
    api.logout();

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = async (_input, init) => {
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    await api.checkHealth();
    assert.equal(capturedHeaders['Authorization'], undefined);
  });

  // ---------------------------------------------------------------------------
  // 5. Expired Token Handling & Auth Error Listener
  // ---------------------------------------------------------------------------
  it('should notify auth error listeners when receiving a 401 response', async () => {
    api.setToken('expired-jwt-token');

    let listenerCalled = false;
    const unsubscribe = api.onAuthError(() => {
      listenerCalled = true;
    });

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'Access token has expired. Please log in again.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(
      async () => {
        await api.getMe();
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.equal(err.status, 401);
        return true;
      }
    );

    assert.equal(listenerCalled, true, 'Auth error listener should have been invoked on 401');
    unsubscribe();
  });

  // ---------------------------------------------------------------------------
  // 6. Logout Clearing
  // ---------------------------------------------------------------------------
  it('should completely clear in-memory and stored token on logout', () => {
    api.setToken('token-to-be-cleared');
    safeStorage.setItem(AUTH_USER_KEY, JSON.stringify({ id: 'usr-1' }));

    assert.equal(api.getToken(), 'token-to-be-cleared');
    assert.ok(safeStorage.getItem(AUTH_TOKEN_KEY));
    assert.ok(safeStorage.getItem(AUTH_USER_KEY));

    api.logout();

    assert.equal(api.getToken(), null);
    assert.equal(safeStorage.getItem(AUTH_TOKEN_KEY), null);
    assert.equal(safeStorage.getItem(AUTH_USER_KEY), null);
  });
});
