-- ==============================================================================
-- RELIEF-OS Database Schema Migration: 001_initial_schema.sql
-- ==============================================================================
-- Requires PostgreSQL with PostGIS extension enabled.
-- ==============================================================================

-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'officer', 'coordinator', 'team_lead')),
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Disasters Table
CREATE TABLE IF NOT EXISTS disasters (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('flood', 'cyclone', 'landslide', 'earthquake', 'fire', 'extreme_weather')),
    region VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'simulated')),
    is_simulated BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Zones Table
CREATE TABLE IF NOT EXISTS zones (
    id VARCHAR(64) PRIMARY KEY,
    disaster_id VARCHAR(64) REFERENCES disasters(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    geometry GEOMETRY(Geometry, 4326),
    population INT NOT NULL DEFAULT 0,
    affected_population INT NOT NULL DEFAULT 0,
    severity VARCHAR(50) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    medical_risk VARCHAR(50) NOT NULL CHECK (medical_risk IN ('low', 'medium', 'high', 'critical')),
    accessibility NUMERIC(4, 3) NOT NULL DEFAULT 1.000, -- 0.000 (blocked) to 1.000 (fully accessible)
    vulnerability NUMERIC(4, 3) NOT NULL DEFAULT 0.500, -- 0.000 to 1.000
    priority_score INT NOT NULL DEFAULT 0 CHECK (priority_score BETWEEN 0 AND 100),
    band VARCHAR(20) NOT NULL CHECK (band IN ('Critical', 'High', 'Medium', 'Low')),
    breakdown_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Citizen Reports Table
CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(64) PRIMARY KEY,
    disaster_id VARCHAR(64) REFERENCES disasters(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    location_name VARCHAR(255),
    description TEXT NOT NULL,
    disaster_type VARCHAR(50),
    severity VARCHAR(50) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    category VARCHAR(100),
    people_affected INT,
    medical_need BOOLEAN NOT NULL DEFAULT false,
    confidence NUMERIC(3, 2) DEFAULT 1.00,
    is_simulated BOOLEAN NOT NULL DEFAULT true,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_ai' CHECK (status IN ('pending_ai', 'analyzed', 'verified')),
    contact_number VARCHAR(50), -- Optional for privacy
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Resource Centers Table
CREATE TABLE IF NOT EXISTS resource_centers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    vehicles_available INT NOT NULL DEFAULT 0,
    boats_available INT NOT NULL DEFAULT 0,
    medical_teams_available INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Resources Inventory Table
CREATE TABLE IF NOT EXISTS resources (
    id VARCHAR(64) PRIMARY KEY,
    center_id VARCHAR(64) REFERENCES resource_centers(id) ON DELETE CASCADE,
    resource_type VARCHAR(100) NOT NULL, -- 'food_kit', 'water_pack', 'medical_unit', 'boat'
    quantity INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'dispatched')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Shelters Table
CREATE TABLE IF NOT EXISTS shelters (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    capacity INT NOT NULL DEFAULT 0,
    occupied INT NOT NULL DEFAULT 0,
    facilities TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Road Segments Table
CREATE TABLE IF NOT EXISTS road_segments (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    geometry GEOMETRY(LineString, 4326),
    length_km NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'accessible' CHECK (status IN ('accessible', 'partial', 'blocked')),
    risk_score INT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Allocations Table
CREATE TABLE IF NOT EXISTS allocations (
    id VARCHAR(64) PRIMARY KEY,
    zone_id VARCHAR(64) REFERENCES zones(id) ON DELETE CASCADE,
    resource_id VARCHAR(64) REFERENCES resources(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 0,
    priority INT NOT NULL DEFAULT 1,
    recommended_route VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'in_transit', 'delivered', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Recommendations & Response Plans Table
CREATE TABLE IF NOT EXISTS recommendations (
    id VARCHAR(64) PRIMARY KEY,
    zone_id VARCHAR(64) REFERENCES zones(id) ON DELETE CASCADE,
    plan JSONB NOT NULL,
    explanation TEXT NOT NULL,
    approved_by VARCHAR(64) REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'modified', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Simulation Runs Table
CREATE TABLE IF NOT EXISTS simulation_runs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    base_snapshot JSONB NOT NULL,
    changes JSONB NOT NULL,
    result JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 13. Audit Log Table
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 14. System Settings Table (configurable scoring weights and parameters)
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Default configurable priority weights
INSERT INTO settings (key, value) VALUES
(
    'priority_scoring_weights',
    '{"w_population": 0.25, "w_severity": 0.20, "w_medical": 0.20, "w_shortage": 0.15, "w_accessibility": 0.10, "w_vulnerability": 0.10}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Spatial Indexes for PostGIS Query Performance
CREATE INDEX IF NOT EXISTS idx_zones_geometry ON zones USING GIST (geometry);
CREATE INDEX IF NOT EXISTS idx_reports_location ON reports USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_shelters_location ON shelters USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_centers_location ON resource_centers USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_road_segments_geom ON road_segments USING GIST (geometry);
