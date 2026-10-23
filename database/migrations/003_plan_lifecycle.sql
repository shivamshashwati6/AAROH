-- ==============================================================================
-- RELIEF-OS Database Schema Migration: 003_plan_lifecycle.sql
-- ==============================================================================
-- 1. Updates recommendations table status check constraint to support the full PRD
--    response plan lifecycle: Draft -> Approved -> In Transit -> Delivered / Failed
--    plus Modified and Rejected.
-- 2. Adds lifecycle tracking fields to recommendations (dispatched_by, dispatched_at,
--    completed_at, failure_reason, execution_notes, source_simulation_id).
-- 3. Adds link from allocations to recommendations (plan_id).
-- 4. Adds non-negative inventory constraint on resources table (quantity >= 0).
-- ==============================================================================

-- 1. Update status constraint on recommendations
ALTER TABLE recommendations DROP CONSTRAINT IF EXISTS recommendations_status_check;

ALTER TABLE recommendations ADD CONSTRAINT recommendations_status_check
    CHECK (status IN ('draft', 'approved', 'modified', 'rejected', 'in_transit', 'delivered', 'failed'));

-- 2. Add lifecycle tracking columns to recommendations
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS dispatched_by VARCHAR(64) REFERENCES users(id);
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS execution_notes TEXT;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS source_simulation_id VARCHAR(64) REFERENCES simulation_runs(id);

-- 3. Add plan_id foreign key to allocations table
ALTER TABLE allocations ADD COLUMN IF NOT EXISTS plan_id VARCHAR(64) REFERENCES recommendations(id) ON DELETE SET NULL;

-- 4. Enforce non-negative quantity constraint on resources
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_quantity_nonnegative;
ALTER TABLE resources ADD CONSTRAINT resources_quantity_nonnegative CHECK (quantity >= 0);
