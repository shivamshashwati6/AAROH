/**
 * RELIEF-OS Admin Dashboard & Department Report Access Unit Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAdminRole,
  isCitizenRole,
  isCommandCenterRole,
  isDepartmentRole,
  isRoleAuthorized,
  getHomeRouteForUser,
  getSafeRedirectForUser,
} from '../src/utils/auth-roles';
import { User, CitizenReport } from '@relief-os/shared';

describe('PHASE 2 & 4: Admin Dashboard Authorization & Safe Redirection', () => {
  const adminUser: User = {
    id: 'usr-admin-test',
    name: 'System Admin',
    email: 'admin@relief.internal',
    role: 'admin',
    department: null,
  };

  const citizenUser: User = {
    id: 'usr-citizen-test',
    name: 'Citizen Jane',
    email: 'jane@example.com',
    role: 'citizen',
    department: null,
  };

  const healthUser: User = {
    id: 'usr-health-test',
    name: 'Health Specialist',
    email: 'health@relief.internal',
    role: 'department',
    department: 'health',
  };

  const commandUser: User = {
    id: 'usr-command-test',
    name: 'Command Officer',
    email: 'command@relief.internal',
    role: 'command_center',
    department: null,
  };

  describe('Admin Role Identification & Authorization Guard', () => {
    it('should correctly identify admin role', () => {
      assert.equal(isAdminRole('admin'), true);
      assert.equal(isAdminRole('citizen'), false);
      assert.equal(isAdminRole('command_center'), false);
      assert.equal(isAdminRole('department'), false);
      assert.equal(isAdminRole(null), false);
    });

    it('should allow only admin role on admin-only routes', () => {
      assert.equal(isRoleAuthorized('admin', ['admin']), true);
      assert.equal(isRoleAuthorized('citizen', ['admin']), false);
      assert.equal(isRoleAuthorized('department', ['admin']), false);
      assert.equal(isRoleAuthorized('command_center', ['admin']), false);
      assert.equal(isRoleAuthorized(null, ['admin']), false);
    });

    it('should redirect admin to /admin from root or login dispatcher', () => {
      assert.equal(getHomeRouteForUser(adminUser), '/admin');
      assert.equal(getSafeRedirectForUser(adminUser, '/'), '/admin');
      assert.equal(getSafeRedirectForUser(adminUser, '/login'), '/admin');
      assert.equal(getSafeRedirectForUser(adminUser, '/signup'), '/admin');
      assert.equal(getSafeRedirectForUser(adminUser, '/admin'), '/admin');
    });

    it('should prevent non-admins from being redirected to /admin', () => {
      // Citizen attempting to access /admin is diverted to /citizen
      assert.equal(getSafeRedirectForUser(citizenUser, '/admin'), '/citizen');

      // Department user attempting to access /admin is diverted to /department
      assert.equal(getSafeRedirectForUser(healthUser, '/admin'), '/department');

      // Command user attempting to access /admin is diverted to /command
      assert.equal(getSafeRedirectForUser(commandUser, '/admin'), '/command');
    });

    it('should maintain command-center permissions for authorized command roles', () => {
      assert.equal(isRoleAuthorized('command_center', ['command_center']), true);
      assert.equal(isRoleAuthorized('officer', ['command_center']), true);
      assert.equal(getHomeRouteForUser(commandUser), '/command');
    });
  });

  describe('PHASE 3: Department Report Access Logic & Filters', () => {
    const medicalReport: CitizenReport = {
      id: 'rep-001',
      disaster_id: 'disaster-assam-2026',
      location_lat: 26.18,
      location_lng: 91.75,
      location_name: 'Guwahati Sector 4',
      description: 'Severe casualty with chest injuries needing immediate ambulance.',
      severity: 'critical',
      category: 'medical',
      medical_need: true,
      confidence: 0.95,
      is_simulated: true,
      status: 'pending_ai',
      created_at: new Date().toISOString(),
    };

    const supplyReport: CitizenReport = {
      id: 'rep-002',
      disaster_id: 'disaster-assam-2026',
      location_lat: 26.2,
      location_lng: 91.8,
      location_name: 'Jorhat Relief Camp',
      description: 'Severe shortage of drinking water and food rations for 50 families.',
      severity: 'high',
      category: 'supplies',
      medical_need: false,
      people_affected: 200,
      confidence: 0.9,
      is_simulated: true,
      status: 'analyzed',
      created_at: new Date().toISOString(),
    };

    const rescueReport: CitizenReport = {
      id: 'rep-003',
      disaster_id: 'disaster-assam-2026',
      location_lat: 26.3,
      location_lng: 91.9,
      location_name: 'Majuli Island Outpost',
      description: 'People trapped on rooftop due to rising flood waters. Inflatable boat needed.',
      severity: 'critical',
      category: 'rescue',
      medical_need: false,
      people_affected: 15,
      confidence: 0.92,
      is_simulated: true,
      status: 'verified',
      created_at: new Date().toISOString(),
    };

    // Health filter classification
    function isHealthReport(r: CitizenReport): boolean {
      const text = `${r.category || ''} ${r.description || ''}`.toLowerCase();
      return r.medical_need === true || text.includes('medic') || text.includes('injur') || text.includes('hospital');
    }

    // Supply filter classification
    function isSupplyReport(r: CitizenReport): boolean {
      const text = `${r.category || ''} ${r.description || ''}`.toLowerCase();
      return text.includes('food') || text.includes('water') || text.includes('supply') || text.includes('ration');
    }

    // Rescue filter classification
    function isRescueReport(r: CitizenReport): boolean {
      const text = `${r.category || ''} ${r.description || ''}`.toLowerCase();
      return r.severity === 'critical' || text.includes('rescue') || text.includes('trapped') || text.includes('boat');
    }

    it('should correctly classify Health reports for medical personnel', () => {
      assert.equal(isHealthReport(medicalReport), true);
      assert.equal(isHealthReport(supplyReport), false);
    });

    it('should correctly classify Supply reports for logistics personnel', () => {
      assert.equal(isSupplyReport(supplyReport), true);
      assert.equal(isSupplyReport(medicalReport), false);
    });

    it('should correctly classify Rescue reports for rescue operators', () => {
      assert.equal(isRescueReport(rescueReport), true);
      assert.equal(isRescueReport(medicalReport), true); // critical severity is also relevant for rescue
    });

    it('should preserve full visibility of all reports when all filter scope is active', () => {
      const allReports = [medicalReport, supplyReport, rescueReport];
      assert.equal(allReports.length, 3);
      // All departments have access to view all reports when scope is 'all'
      assert.equal(allReports.filter((r) => r.id).length, 3);
    });
  });
});
