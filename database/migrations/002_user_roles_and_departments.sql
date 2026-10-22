-- ==============================================================================
-- RELIEF-OS Database Schema Migration: 002_user_roles_and_departments.sql
-- ==============================================================================
-- Updates the users table to support canonical roles (citizen, command_center, department)
-- while preserving legacy roles (admin, officer, coordinator, team_lead).
-- Adds the department column for department users (health, supply, rescue).
-- Preserves all existing foreign key constraints and user rows.
-- ==============================================================================

-- 1. Add department column if not already existing
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(50);

-- 2. Drop existing role constraint safely
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 3. Add updated role check constraint supporting canonical + legacy roles
ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('citizen', 'command_center', 'department', 'admin', 'officer', 'coordinator', 'team_lead'));

-- 4. Drop existing department check constraint if already applied (for idempotency)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_department_check;

-- 5. Add department constraint enforcing valid department for 'department' users and NULL for non-department users
ALTER TABLE users ADD CONSTRAINT users_department_check
    CHECK (
        (role = 'department' AND department IS NOT NULL AND department IN ('health', 'supply', 'rescue'))
        OR
        (role != 'department' AND department IS NULL)
    );
