import { User, UserRole, DepartmentType } from '@relief-os/shared';

export const AUTH_TOKEN_KEY = 'relief_os_auth_token';
export const AUTH_USER_KEY = 'relief_os_auth_user';

/**
 * Checks if a given role is Citizen.
 */
export function isCitizenRole(role?: UserRole | null): boolean {
  return role === 'citizen';
}

/**
 * Checks if a given role is Admin.
 */
export function isAdminRole(role?: UserRole | null): boolean {
  return role === 'admin';
}

/**
 * Checks if a given role possesses Command Center operational authority.
 * Includes canonical 'command_center' as well as PRD legacy roles 'admin' and 'officer'.
 */
export function isCommandCenterRole(role?: UserRole | null): boolean {
  return role === 'command_center' || role === 'admin' || role === 'officer';
}

/**
 * Checks if a given role possesses Department operational authority.
 * Includes canonical 'department' as well as PRD legacy roles 'coordinator' and 'team_lead'.
 */
export function isDepartmentRole(role?: UserRole | null): boolean {
  return role === 'department' || role === 'coordinator' || role === 'team_lead';
}

/**
 * Reusable authorization guard that resolves canonical & legacy role compatibility.
 */
export function isRoleAuthorized(
  userRole: UserRole | null | undefined,
  allowedRoles: UserRole[]
): boolean {
  if (!userRole) return false;

  // Direct match
  if (allowedRoles.includes(userRole)) {
    return true;
  }

  // Check canonical group expansions
  for (const allowed of allowedRoles) {
    if (allowed === 'command_center' && isCommandCenterRole(userRole)) {
      return true;
    }
    if (allowed === 'department' && isDepartmentRole(userRole)) {
      return true;
    }
    if (allowed === 'citizen' && isCitizenRole(userRole)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a department user belongs to one of the authorized department types.
 */
export function isDepartmentAuthorized(
  userDept: DepartmentType | null | undefined,
  allowedDepartments?: DepartmentType[]
): boolean {
  if (!allowedDepartments || allowedDepartments.length === 0) {
    return true;
  }
  if (!userDept) {
    return false;
  }
  return allowedDepartments.includes(userDept);
}

/**
 * Determines the target home route for an authenticated user based on role hierarchy.
 */
export function getHomeRouteForUser(user: User | null | undefined): string {
  if (!user) {
    return '/login';
  }

  if (isAdminRole(user.role)) {
    return '/admin';
  }

  if (isCitizenRole(user.role)) {
    return '/citizen';
  }

  if (isCommandCenterRole(user.role)) {
    return '/command';
  }

  if (isDepartmentRole(user.role)) {
    return '/department';
  }

  return '/login';
}

/**
 * Resolves a safe, role-authorized redirect destination after authentication.
 * If the user was trying to access a specific protected section they are authorized for,
 * preserves that path. Otherwise, cleanly routes them to their primary home portal.
 * Strictly prevents redirecting authenticated users back to '/', '/login', '/signup', or unauthorized portals.
 */
export function getSafeRedirectForUser(
  user: User | null | undefined,
  fromPath?: string | null
): string {
  if (!user) {
    return '/login';
  }

  const homeRoute = getHomeRouteForUser(user);

  if (!fromPath || fromPath === '/' || fromPath === '/login' || fromPath === '/signup') {
    return homeRoute;
  }

  // Authorize admin destinations
  if (fromPath.startsWith('/admin')) {
    return isAdminRole(user.role) ? fromPath : homeRoute;
  }

  // Authorize citizen destinations
  if (fromPath.startsWith('/citizen')) {
    return isCitizenRole(user.role) ? fromPath : homeRoute;
  }

  // Authorize command center destinations
  if (fromPath.startsWith('/command')) {
    return isCommandCenterRole(user.role) ? fromPath : homeRoute;
  }

  // Authorize department destinations
  if (fromPath.startsWith('/department')) {
    return isDepartmentRole(user.role) ? fromPath : homeRoute;
  }

  // Authorize public operational views like dashboard and report
  if (fromPath.startsWith('/dashboard') || fromPath.startsWith('/report')) {
    return fromPath;
  }

  return homeRoute;
}

/**
 * Returns human-friendly formatted role title.
 */
export function getRoleBadgeLabel(role: UserRole): string {
  switch (role) {
    case 'citizen':
      return 'Citizen';
    case 'command_center':
      return 'Command Center Officer';
    case 'admin':
      return 'System Administrator';
    case 'officer':
      return 'District Officer (Command Center)';
    case 'department':
      return 'Department Personnel';
    case 'coordinator':
      return 'Relief Coordinator (Department)';
    case 'team_lead':
      return 'Field Team Lead (Department)';
    default:
      return role;
  }
}

/**
 * Returns human-friendly department title.
 */
export function getDepartmentLabel(dept: DepartmentType | null | undefined): string {
  switch (dept) {
    case 'health':
      return 'Health & Medical';
    case 'supply':
      return 'Supply & Logistics';
    case 'rescue':
      return 'Rescue & Evacuation';
    default:
      return 'General Department';
  }
}
