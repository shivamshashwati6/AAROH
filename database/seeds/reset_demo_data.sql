-- ==============================================================================
-- RELIEF-OS Seed Reset: reset_demo_data.sql
-- ==============================================================================
-- Safely resets simulated tables and clears mock operational state.
-- Does NOT drop schema or PostGIS extension.
-- ==============================================================================

TRUNCATE TABLE
    audit_log,
    simulation_runs,
    recommendations,
    allocations,
    reports,
    resources,
    road_segments,
    shelters,
    resource_centers,
    zones,
    disasters
CASCADE;

-- Re-run seed script:
-- \i database/seeds/001_assam_flood_seed.sql
