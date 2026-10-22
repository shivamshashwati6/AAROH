import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCitizenRole,
  isCommandCenterRole,
  isDepartmentRole,
  isRoleAuthorized,
  isDepartmentAuthorized,
  getHomeRouteForUser,
  getRoleBadgeLabel,
  getDepartmentLabel,
} from '../src/utils/auth-roles';
import { User, UserRole, DepartmentType } from '@relief-os/shared';

describe('RELIEF-OS Frontend Role-Based Routing & Authorization Tests', () => {
  // ---------------------------------------------------------------------------
  // 1. Citizen Role Restrictions
  // ---------------------------------------------------------------------------
  describe('Citizen Role Authorization & Restrictions', () => {
    it('should identify citizen role correctly', () => {
      assert.equal(isCitizenRole('citizen'), true);
      assert.equal(isCitizenRole('command_center'), false);
      assert.equal(isCitizenRole('department'), false);
      assert.equal(isCitizenRole('admin'), false);
      assert.equal(isCitizenRole('officer'), false);
      assert.equal(isCitizenRole(null), false);
    });

    it('should allow citizen only on citizen-authorized routes and forbid command/department routes', () => {
      const citizenRole: UserRole = 'citizen';

      // Citizen route check
      assert.equal(isRoleAuthorized(citizenRole, ['citizen']), true);

      // Command Center route restriction: citizen MUST NOT have access
      assert.equal(
        isRoleAuthorized(citizenRole, ['command_center', 'admin', 'officer']),
        false,
        'Citizen must be forbidden from accessing Command Center routes'
      );

      // Department route restriction: citizen MUST NOT have access
      assert.equal(
        isRoleAuthorized(citizenRole, ['department', 'coordinator', 'team_lead']),
        false,
        'Citizen must be forbidden from accessing Department routes'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Command Center & Legacy Role Compatibility
  // ---------------------------------------------------------------------------
  describe('Command Center & Legacy Role Authorization', () => {
    it('should identify command center authority for canonical and legacy roles', () => {
      assert.equal(isCommandCenterRole('command_center'), true);
      assert.equal(isCommandCenterRole('admin'), true, 'Legacy admin should have command center authority');
      assert.equal(isCommandCenterRole('officer'), true, 'Legacy officer should have command center authority');
      assert.equal(isCommandCenterRole('citizen'), false);
      assert.equal(isCommandCenterRole('department'), false);
      assert.equal(isCommandCenterRole('coordinator'), false);
    });

    it('should grant access to Command Center routes for command_center, admin, and officer', () => {
      const allowedCommandRoles: UserRole[] = ['command_center', 'admin', 'officer'];

      assert.equal(isRoleAuthorized('command_center', allowedCommandRoles), true);
      assert.equal(isRoleAuthorized('admin', allowedCommandRoles), true);
      assert.equal(isRoleAuthorized('officer', allowedCommandRoles), true);

      // Even if allowedRoles only lists canonical 'command_center', legacy equivalents should be authorized
      assert.equal(isRoleAuthorized('admin', ['command_center']), true);
      assert.equal(isRoleAuthorized('officer', ['command_center']), true);

      // Command center cannot access citizen-only route
      assert.equal(isRoleAuthorized('command_center', ['citizen']), false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Department Routing for Health, Supply, and Rescue
  // ---------------------------------------------------------------------------
  describe('Department Routing & Department Type Verification', () => {
    it('should identify department authority for canonical and legacy roles', () => {
      assert.equal(isDepartmentRole('department'), true);
      assert.equal(isDepartmentRole('coordinator'), true, 'Legacy coordinator should have department authority');
      assert.equal(isDepartmentRole('team_lead'), true, 'Legacy team_lead should have department authority');
      assert.equal(isDepartmentRole('citizen'), false);
      assert.equal(isDepartmentRole('command_center'), false);
    });

    it('should grant access to Department route for department, coordinator, and team_lead', () => {
      const allowedDeptRoles: UserRole[] = ['department', 'coordinator', 'team_lead'];

      assert.equal(isRoleAuthorized('department', allowedDeptRoles), true);
      assert.equal(isRoleAuthorized('coordinator', allowedDeptRoles), true);
      assert.equal(isRoleAuthorized('team_lead', allowedDeptRoles), true);

      // Canonical expansion check
      assert.equal(isRoleAuthorized('coordinator', ['department']), true);
      assert.equal(isRoleAuthorized('team_lead', ['department']), true);

      // Department cannot access command center route
      assert.equal(isRoleAuthorized('department', ['command_center']), false);
    });

    it('should strictly verify department matches for Health, Supply, and Rescue units', () => {
      const healthDept: DepartmentType = 'health';
      const supplyDept: DepartmentType = 'supply';
      const rescueDept: DepartmentType = 'rescue';

      // Health authorization checks
      assert.equal(isDepartmentAuthorized(healthDept, ['health']), true);
      assert.equal(isDepartmentAuthorized(healthDept, ['supply']), false);
      assert.equal(isDepartmentAuthorized(healthDept, ['rescue']), false);

      // Supply authorization checks
      assert.equal(isDepartmentAuthorized(supplyDept, ['supply']), true);
      assert.equal(isDepartmentAuthorized(supplyDept, ['health']), false);
      assert.equal(isDepartmentAuthorized(supplyDept, ['rescue']), false);

      // Rescue authorization checks
      assert.equal(isDepartmentAuthorized(rescueDept, ['rescue']), true);
      assert.equal(isDepartmentAuthorized(rescueDept, ['health']), false);
      assert.equal(isDepartmentAuthorized(rescueDept, ['supply']), false);

      // Multi-department allowlist check
      assert.equal(isDepartmentAuthorized(healthDept, ['health', 'rescue']), true);
      assert.equal(isDepartmentAuthorized(supplyDept, ['health', 'rescue']), false);

      // Unassigned department should be rejected when specific departments are required
      assert.equal(isDepartmentAuthorized(null, ['health']), false);
      assert.equal(isDepartmentAuthorized(undefined, ['supply']), false);

      // When no specific department is required, all are permitted
      assert.equal(isDepartmentAuthorized(healthDept, []), true);
      assert.equal(isDepartmentAuthorized(null, undefined), true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Role-Based Home Route Determination & Redirects
  // ---------------------------------------------------------------------------
  describe('getHomeRouteForUser Routing Decision', () => {
    it('should redirect unauthenticated / null user to /login', () => {
      assert.equal(getHomeRouteForUser(null), '/login');
      assert.equal(getHomeRouteForUser(undefined), '/login');
    });

    it('should route citizen accounts to /citizen', () => {
      const citizenUser: User = {
        id: 'usr-1',
        name: 'Citizen User',
        email: 'cit@gmail.com',
        role: 'citizen',
        department: null,
      };
      assert.equal(getHomeRouteForUser(citizenUser), '/citizen');
    });

    it('should route command_center, admin, and officer accounts to /command', () => {
      const cmdUser: User = {
        id: 'usr-2',
        name: 'Command User',
        email: 'cmd@relief-os.org',
        role: 'command_center',
      };
      const adminUser: User = {
        id: 'usr-3',
        name: 'Admin User',
        email: 'admin@relief-os.org',
        role: 'admin',
      };
      const officerUser: User = {
        id: 'usr-4',
        name: 'District Officer',
        email: 'officer@relief-os.org',
        role: 'officer',
      };

      assert.equal(getHomeRouteForUser(cmdUser), '/command');
      assert.equal(getHomeRouteForUser(adminUser), '/command');
      assert.equal(getHomeRouteForUser(officerUser), '/command');
    });

    it('should route department, coordinator, and team_lead accounts to /department', () => {
      const deptHealthUser: User = {
        id: 'usr-5',
        name: 'Health Officer',
        email: 'health@relief-os.org',
        role: 'department',
        department: 'health',
      };
      const deptSupplyUser: User = {
        id: 'usr-6',
        name: 'Supply Coordinator',
        email: 'supply@relief-os.org',
        role: 'department',
        department: 'supply',
      };
      const deptRescueUser: User = {
        id: 'usr-7',
        name: 'Rescue Lead',
        email: 'rescue@relief-os.org',
        role: 'department',
        department: 'rescue',
      };
      const coordinatorUser: User = {
        id: 'usr-8',
        name: 'Field Coordinator',
        email: 'coord@relief-os.org',
        role: 'coordinator',
      };
      const teamLeadUser: User = {
        id: 'usr-9',
        name: 'Rescue Team Lead',
        email: 'lead@relief-os.org',
        role: 'team_lead',
      };

      assert.equal(getHomeRouteForUser(deptHealthUser), '/department');
      assert.equal(getHomeRouteForUser(deptSupplyUser), '/department');
      assert.equal(getHomeRouteForUser(deptRescueUser), '/department');
      assert.equal(getHomeRouteForUser(coordinatorUser), '/department');
      assert.equal(getHomeRouteForUser(teamLeadUser), '/department');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Display Labels and Formatting
  // ---------------------------------------------------------------------------
  describe('Role and Department Display Badges', () => {
    it('should format role badge titles accurately', () => {
      assert.equal(getRoleBadgeLabel('citizen'), 'Citizen');
      assert.equal(getRoleBadgeLabel('command_center'), 'Command Center Officer');
      assert.equal(getRoleBadgeLabel('admin'), 'Administrator (Command Center)');
      assert.equal(getRoleBadgeLabel('officer'), 'District Officer (Command Center)');
      assert.equal(getRoleBadgeLabel('department'), 'Department Personnel');
      assert.equal(getRoleBadgeLabel('coordinator'), 'Relief Coordinator (Department)');
      assert.equal(getRoleBadgeLabel('team_lead'), 'Field Team Lead (Department)');
    });

    it('should format department badge titles accurately', () => {
      assert.equal(getDepartmentLabel('health'), 'Health & Medical');
      assert.equal(getDepartmentLabel('supply'), 'Supply & Logistics');
      assert.equal(getDepartmentLabel('rescue'), 'Rescue & Evacuation');
      assert.equal(getDepartmentLabel(null), 'General Department');
      assert.equal(getDepartmentLabel(undefined), 'General Department');
    });
  });
});
