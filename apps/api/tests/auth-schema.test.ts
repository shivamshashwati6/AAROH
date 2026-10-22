import { describe, it, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { query, closePool } from '../src/db';
import { User, UserRole, DepartmentType, AuthResponse } from '@relief-os/shared';

describe('RELIEF-OS Auth Step 1: Database Schema & Shared Types', () => {
  afterEach(async () => {
    await query("DELETE FROM users WHERE id LIKE 'test-user-%'");
  });

  after(async () => {
    await closePool();
  });

  // ---------------------------------------------------------------------------
  // 1. Shared Types Compilation & Structure
  // ---------------------------------------------------------------------------
  describe('Shared Types Interface Compliance', () => {
    it('should correctly structure User object with canonical roles and optional department', () => {
      const citizenUser: User = {
        id: 'usr-1',
        name: 'Citizen Jane',
        email: 'jane@example.com',
        role: 'citizen',
        department: null,
        created_at: new Date().toISOString(),
      };
      assert.equal(citizenUser.role, 'citizen');
      assert.equal(citizenUser.department, null);

      const commandUser: User = {
        id: 'usr-2',
        name: 'Commander John',
        email: 'john@relief.gov',
        role: 'command_center',
      };
      assert.equal(commandUser.role, 'command_center');

      const rescueUser: User = {
        id: 'usr-3',
        name: 'Rescue Captain',
        email: 'rescue@relief.gov',
        role: 'department',
        department: 'rescue',
      };
      assert.equal(rescueUser.role, 'department');
      assert.equal(rescueUser.department, 'rescue');
    });

    it('should correctly structure AuthResponse interface', () => {
      const auth: AuthResponse = {
        user: {
          id: 'usr-4',
          name: 'Medical Officer',
          email: 'med@relief.gov',
          role: 'department',
          department: 'health',
        },
        token: 'mock-jwt-token',
        expires_at: '2026-10-23T00:00:00.000Z',
      };
      assert.equal(auth.user.department, 'health');
      assert.ok(auth.token);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Database Constraint Verification (Migration 002)
  // ---------------------------------------------------------------------------
  describe('PostgreSQL Schema & Role Constraints (Migration 002)', () => {
    it('should successfully insert valid CITIZEN user with NULL department', async () => {
      await query(
        `INSERT INTO users (id, name, email, role, department, password_hash)
         VALUES ('test-user-cit', 'Citizen Bob', 'bob@test.in', 'citizen', NULL, 'dummyhash')`
      );

      const res = await query<{ id: string; role: string; department: string | null }>(
        "SELECT id, role, department FROM users WHERE id = 'test-user-cit'"
      );
      assert.equal(res.rows[0].role, 'citizen');
      assert.equal(res.rows[0].department, null);
    });

    it('should successfully insert valid COMMAND_CENTER user with NULL department', async () => {
      await query(
        `INSERT INTO users (id, name, email, role, department, password_hash)
         VALUES ('test-user-cmd', 'District Officer', 'officer@test.gov', 'command_center', NULL, 'dummyhash')`
      );

      const res = await query<{ id: string; role: string; department: string | null }>(
        "SELECT id, role, department FROM users WHERE id = 'test-user-cmd'"
      );
      assert.equal(res.rows[0].role, 'command_center');
      assert.equal(res.rows[0].department, null);
    });

    it('should successfully insert DEPARTMENT users with health, supply, and rescue departments', async () => {
      const depts: DepartmentType[] = ['health', 'supply', 'rescue'];

      for (const dept of depts) {
        await query(
          `INSERT INTO users (id, name, email, role, department, password_hash)
           VALUES ($1, $2, $3, 'department', $4, 'dummyhash')`,
          [`test-user-${dept}`, `Lead ${dept}`, `${dept}@test.gov`, dept]
        );

        const res = await query<{ id: string; role: string; department: string }>(
          `SELECT id, role, department FROM users WHERE id = $1`,
          [`test-user-${dept}`]
        );
        assert.equal(res.rows[0].role, 'department');
        assert.equal(res.rows[0].department, dept);
      }
    });

    it('should preserve and support legacy roles (admin, officer, coordinator, team_lead) with NULL department', async () => {
      const legacyRoles: UserRole[] = ['admin', 'officer', 'coordinator', 'team_lead'];

      for (const role of legacyRoles) {
        await query(
          `INSERT INTO users (id, name, email, role, department, password_hash)
           VALUES ($1, $2, $3, $4, NULL, 'dummyhash')`,
          [`test-user-${role}`, `Legacy ${role}`, `${role}@test.gov`, role]
        );

        const res = await query<{ id: string; role: string; department: string | null }>(
          `SELECT id, role, department FROM users WHERE id = $1`,
          [`test-user-${role}`]
        );
        assert.equal(res.rows[0].role, role);
        assert.equal(res.rows[0].department, null);
      }
    });

    it('should reject invalid role with check constraint violation (users_role_check)', async () => {
      await assert.rejects(
        async () => {
          await query(
            `INSERT INTO users (id, name, email, role, department, password_hash)
             VALUES ('test-user-inv', 'Invalid User', 'inv@test.gov', 'unauthorized_role', NULL, 'dummyhash')`
          );
        },
        (err: Error) => {
          assert.match(err.message, /users_role_check/);
          return true;
        }
      );
    });

    it('should reject DEPARTMENT role when department is NULL (users_department_check)', async () => {
      await assert.rejects(
        async () => {
          await query(
            `INSERT INTO users (id, name, email, role, department, password_hash)
             VALUES ('test-user-dept-null', 'Dept NoDept', 'nodept@test.gov', 'department', NULL, 'dummyhash')`
          );
        },
        (err: Error) => {
          assert.match(err.message, /users_department_check/);
          return true;
        }
      );
    });

    it('should reject DEPARTMENT role with invalid department (users_department_check)', async () => {
      await assert.rejects(
        async () => {
          await query(
            `INSERT INTO users (id, name, email, role, department, password_hash)
             VALUES ('test-user-dept-inv', 'Dept Finance', 'finance@test.gov', 'department', 'finance', 'dummyhash')`
          );
        },
        (err: Error) => {
          assert.match(err.message, /users_department_check/);
          return true;
        }
      );
    });

    it('should reject non-department role (e.g. citizen or command_center) when department is non-NULL', async () => {
      await assert.rejects(
        async () => {
          await query(
            `INSERT INTO users (id, name, email, role, department, password_hash)
             VALUES ('test-user-cit-dept', 'Citizen With Dept', 'citdept@test.gov', 'citizen', 'health', 'dummyhash')`
          );
        },
        (err: Error) => {
          assert.match(err.message, /users_department_check/);
          return true;
        }
      );
    });
  });
});
