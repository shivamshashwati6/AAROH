import React from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { UserRole, DepartmentType } from '@relief-os/shared';
import { useAuth } from '../context/AuthContext';
import {
  isRoleAuthorized,
  isDepartmentAuthorized,
  getHomeRouteForUser,
} from '../utils/auth-roles';
import { ShieldAlert, Loader2 } from 'lucide-react';

export interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  allowedDepartments?: DepartmentType[];
  children?: React.ReactNode;
}

export function ProtectedRoute({
  allowedRoles,
  allowedDepartments,
  children,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // 1. Initial auth state verification
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b12] flex flex-col items-center justify-center p-6 text-slate-300">
        <div className="flex items-center gap-3 bg-[#0d1522] border border-[#1f2e48] px-6 py-4 rounded-xl shadow-2xl">
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          <span className="text-sm font-medium tracking-wide">
            Verifying security credentials &amp; session...
          </span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated check
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Role authorization check
  if (allowedRoles && allowedRoles.length > 0) {
    const authorized = isRoleAuthorized(user.role, allowedRoles);
    if (!authorized) {
      // Forbidden: redirect user to their designated home route
      const homeRoute = getHomeRouteForUser(user);
      // Avoid infinite redirect if current route matches home route
      if (location.pathname !== homeRoute) {
        return <Navigate to={homeRoute} replace />;
      }
      return (
        <div className="min-h-screen bg-[#070b12] flex flex-col items-center justify-center p-6 text-slate-300">
          <div className="max-w-md w-full bg-[#0d1522] border border-red-500/30 p-6 rounded-xl shadow-2xl text-center">
            <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
            <p className="text-sm text-slate-400 mb-6">
              Your account role (<span className="text-white font-semibold">{user.role}</span>) does not have authorization to view this section.
            </p>
            <a
              href={homeRoute}
              className="inline-block px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm transition"
            >
              Return to Authorized Workspace
            </a>
          </div>
        </div>
      );
    }
  }

  // 4. Department authorization check (if restricted to specific departments)
  if (allowedDepartments && allowedDepartments.length > 0) {
    const deptAuthorized = isDepartmentAuthorized(user.department, allowedDepartments);
    if (!deptAuthorized) {
      return (
        <div className="min-h-screen bg-[#070b12] flex flex-col items-center justify-center p-6 text-slate-300">
          <div className="max-w-md w-full bg-[#0d1522] border border-amber-500/30 p-6 rounded-xl shadow-2xl text-center">
            <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Department Restraint</h2>
            <p className="text-sm text-slate-400 mb-6">
              This operational module requires one of the following department authorizations:{' '}
              <span className="text-white font-medium">{allowedDepartments.join(', ')}</span>.
              Your assigned department:{' '}
              <span className="text-amber-400 font-bold">{user.department || 'None'}</span>.
            </p>
            <Navigate to="/department" replace />
          </div>
        </div>
      );
    }
  }

  // 5. Render children or nested route outlet
  return children ? <>{children}</> : <Outlet />;
}
