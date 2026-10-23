import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { User, UserRole, DepartmentType } from '@relief-os/shared';
import { api, ApiError } from '../services/api';
import {
  isCitizenRole,
  isAdminRole,
  isCommandCenterRole,
  isDepartmentRole,
  AUTH_USER_KEY,
} from '../utils/auth-roles';
import { safeStorage } from '../utils/storage';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  userRole: UserRole | null;
  department: DepartmentType | null;
  isCitizen: boolean;
  isAdmin: boolean;
  isCommandCenter: boolean;
  login: (
    email: string,
    password: string,
    portal?: 'citizen' | 'department' | 'admin' | 'command_center',
    expectedRole?: string
  ) => Promise<User>;
  registerCitizen: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Optimistic user hydration from safeStorage if available
    const storedUser = safeStorage.getItem(AUTH_USER_KEY);
    if (storedUser) {
      try {
        return JSON.parse(storedUser) as User;
      } catch {
        return null;
      }
    }
    return null;
  });
  const [token, setToken] = useState<string | null>(() => api.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
    setToken(null);
    setError(null);
  }, []);

  // Listen for 401 unauthorized signals from API client
  useEffect(() => {
    const unsubscribe = api.onAuthError(() => {
      logout();
    });
    return unsubscribe;
  }, [logout]);

  // Session restoration on mount
  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const activeToken = api.getToken();
      if (!activeToken) {
        if (isMounted) {
          setIsLoading(false);
          setUser(null);
          setToken(null);
        }
        return;
      }

      try {
        const res = await api.getMe();
        if (isMounted) {
          setUser(res.user);
          setToken(activeToken);
          safeStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
          setError(null);
        }
      } catch (err: unknown) {
        // Expired or invalid token
        if (isMounted) {
          logout();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [logout]);

  const login = useCallback(
    async (
      email: string,
      password: string,
      portal?: 'citizen' | 'department' | 'admin' | 'command_center',
      expectedRole?: string
    ): Promise<User> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.login({ email, password, portal, expectedRole });
        setUser(res.user);
        setToken(res.token ?? null);
        return res.user;
      } catch (err: unknown) {
        const msg = err instanceof ApiError ? err.message : 'Authentication failed. Please check your credentials.';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const registerCitizen = useCallback(
    async (name: string, email: string, password: string): Promise<User> => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.registerCitizen({ name, email, password });
        setUser(res.user);
        setToken(res.token ?? null);
        return res.user;
      } catch (err: unknown) {
        const msg = err instanceof ApiError ? err.message : 'Registration failed. Please try again.';
        setError(msg);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const isAuthenticated = Boolean(user && token);
  const userRole = user?.role ?? null;
  const department = (user?.department as DepartmentType) ?? null;

  const isCitizen = useMemo(() => isCitizenRole(userRole), [userRole]);
  const isAdmin = useMemo(() => isAdminRole(userRole), [userRole]);
  const isCommandCenter = useMemo(() => isCommandCenterRole(userRole), [userRole]);
  const isDepartment = useMemo(() => isDepartmentRole(userRole), [userRole]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      token,
      isLoading,
      error,
      isAuthenticated,
      userRole,
      department,
      isCitizen,
      isAdmin,
      isCommandCenter,
      isDepartment,
      login,
      registerCitizen,
      logout,
      clearError,
    }),
    [
      user,
      token,
      isLoading,
      error,
      isAuthenticated,
      userRole,
      department,
      isCitizen,
      isAdmin,
      isCommandCenter,
      isDepartment,
      login,
      registerCitizen,
      logout,
      clearError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
