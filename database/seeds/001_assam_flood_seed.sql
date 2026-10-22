-- ==============================================================================
-- RELIEF-OS Seed Data: 001_assam_flood_seed.sql
-- ==============================================================================
-- Canonical Assam Flood Demo Scenario from PRD:
-- Total Affected Population: 18,420
-- Critical Zones: 7
-- Active Shelters: 18 (71% occupancy)
-- Relief Centers: 5
-- Total Vehicles/Boats: 21
-- Ingested Reports: 1,247 (represented in canonical distribution)
-- Hero Zone: Zone A (3,842 affected, Score: 94 Critical, Route A blocked -> Route C)
--
-- ALL RECORDS MARKED is_simulated = true
-- DO NOT PRESENT AS LIVE REAL-WORLD EMERGENCY INFORMATION.
-- ==============================================================================

-- 1. Insert Disaster Event
INSERT INTO disasters (id, name, type, region, start_time, status, is_simulated)
VALUES (
    'disaster-assam-2026',
    'Assam Flood Response (Simulated)',
    'flood',
    'Brahmaputra Basin, Assam, India',
    CURRENT_TIMESTAMP,
    'active',
    true
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

-- 2. Insert Canonical Relief Centers (5 centers, total 21 vehicles/boats)
INSERT INTO resource_centers (id, name, location, vehicles_available, boats_available, medical_teams_available)
VALUES
    ('center-1', 'Guwahati Central Logistics Hub', ST_SetSRID(ST_MakePoint(91.7362, 26.1445), 4326), 3, 1, 6),
    ('center-2', 'Nalbari Rapid Response Depot', ST_SetSRID(ST_MakePoint(91.4422, 26.4447), 4326), 2, 1, 3),
    ('center-3', 'Barpeta Relief Base #3', ST_SetSRID(ST_MakePoint(91.0059, 26.3216), 4326), 4, 4, 5),
    ('center-4', 'Dhubri Sector Logistics Base', ST_SetSRID(ST_MakePoint(89.9700, 26.0200), 4326), 2, 1, 4),
    ('center-5', 'Goalpara Riverine Outpost', ST_SetSRID(ST_MakePoint(90.6200, 26.1700), 4326), 2, 1, 3)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    location = EXCLUDED.location,
    vehicles_available = EXCLUDED.vehicles_available,
    boats_available = EXCLUDED.boats_available,
    medical_teams_available = EXCLUDED.medical_teams_available;

-- 3. Insert Canonical Shelters (18 shelters, 71% aggregate capacity)
INSERT INTO shelters (id, name, location, capacity, occupied, facilities)
VALUES
    ('shelter-1', 'Barpeta Model Higher Secondary School', ST_SetSRID(ST_MakePoint(91.0112, 26.3250), 4326), 500, 480, '{"water","generator","medical_first_aid"}'),
    ('shelter-2', 'Howly Community Relief Center (Shelter B)', ST_SetSRID(ST_MakePoint(91.0450, 26.4320), 4326), 800, 300, '{"water","generator","child_care","kitchen"}'),
    ('shelter-3', 'Sorbhog Cyclone & Flood Shelter', ST_SetSRID(ST_MakePoint(90.8700, 26.4800), 4326), 400, 390, '{"water","first_aid"}'),
    ('shelter-4', 'Nalbari Indoor Stadium Shelter', ST_SetSRID(ST_MakePoint(91.4400, 26.4400), 4326), 650, 490, '{"water","medical","generator"}'),
    ('shelter-5', 'Dhamdhama Relief Camp', ST_SetSRID(ST_MakePoint(91.4800, 26.5100), 4326), 350, 270, '{"water","kitchen"}'),
    ('shelter-6', 'Tihu College Ground Camp', ST_SetSRID(ST_MakePoint(91.3100, 26.4600), 4326), 450, 310, '{"water","medical"}'),
    ('shelter-7', 'Sarthebari High School Camp', ST_SetSRID(ST_MakePoint(91.2200, 26.3500), 4326), 400, 290, '{"water","generator"}'),
    ('shelter-8', 'Baghbor Relief Shelter', ST_SetSRID(ST_MakePoint(90.8500, 26.2300), 4326), 550, 420, '{"water","kitchen"}'),
    ('shelter-9', 'Chenga Higher Secondary Shelter', ST_SetSRID(ST_MakePoint(91.0800, 26.2600), 4326), 400, 310, '{"water"}'),
    ('shelter-10', 'Mandia Char Relief Shelter', ST_SetSRID(ST_MakePoint(90.9300, 26.2700), 4326), 500, 380, '{"water","generator"}'),
    ('shelter-11', 'Goalpara Town Hall Camp', ST_SetSRID(ST_MakePoint(90.6250, 26.1750), 4326), 600, 410, '{"water","medical","kitchen"}'),
    ('shelter-12', 'Matia Community Center', ST_SetSRID(ST_MakePoint(90.7200, 26.1200), 4326), 350, 220, '{"water"}'),
    ('shelter-13', 'Balijana High School Shelter', ST_SetSRID(ST_MakePoint(90.5800, 26.0900), 4326), 400, 280, '{"water","first_aid"}'),
    ('shelter-14', 'Dhubri Girls High School Camp', ST_SetSRID(ST_MakePoint(89.9750, 26.0250), 4326), 500, 370, '{"water","generator"}'),
    ('shelter-15', 'Gauripur Public Library Hall', ST_SetSRID(ST_MakePoint(89.9800, 26.0800), 4326), 450, 330, '{"water","medical"}'),
    ('shelter-16', 'Bilasipara Relief Complex', ST_SetSRID(ST_MakePoint(90.2300, 26.2300), 4326), 700, 520, '{"water","kitchen","generator"}'),
    ('shelter-17', 'South Salmara Flood Shelter', ST_SetSRID(ST_MakePoint(89.9100, 25.8600), 4326), 500, 390, '{"water","first_aid"}'),
    ('shelter-18', 'Mankachar Border Camp', ST_SetSRID(ST_MakePoint(89.8700, 25.5400), 4326), 400, 260, '{"water"}')
ON CONFLICT (id) DO NOTHING;

-- 4. Insert 7 Canonical Critical Zones (Sum of affected population = 18,420)
INSERT INTO zones (id, disaster_id, name, geometry, population, affected_population, severity, medical_risk, accessibility, vulnerability, priority_score, band, breakdown_json)
VALUES
    (
        'zone-a',
        'disaster-assam-2026',
        'Zone A (Barpeta Central / Jania)',
        ST_SetSRID(ST_MakePoint(91.0059, 26.3216), 4326),
        7500,
        3842,
        'critical',
        'critical',
        0.250,
        0.850,
        94,
        'Critical',
        '{"population_impact": 0.95, "severity": 0.98, "medical_risk": 0.95, "resource_shortage": 0.90, "accessibility_difficulty": 0.85, "vulnerability": 0.85, "food_shortage_pct": 72, "water_shortage_pct": 61}'::jsonb
    ),
    (
        'zone-b',
        'disaster-assam-2026',
        'Zone B (Baghbor Lowlands)',
        ST_SetSRID(ST_MakePoint(90.8500, 26.2300), 4326),
        5800,
        3120,
        'critical',
        'high',
        0.400,
        0.750,
        88,
        'Critical',
        '{"population_impact": 0.88, "severity": 0.90, "medical_risk": 0.85, "resource_shortage": 0.80, "accessibility_difficulty": 0.70, "vulnerability": 0.75}'::jsonb
    ),
    (
        'zone-c',
        'disaster-assam-2026',
        'Zone C (Chenga Embankment Sector)',
        ST_SetSRID(ST_MakePoint(91.0800, 26.2600), 4326),
        5200,
        2780,
        'high',
        'high',
        0.500,
        0.700,
        86,
        'Critical',
        '{"population_impact": 0.84, "severity": 0.86, "medical_risk": 0.82, "resource_shortage": 0.75, "accessibility_difficulty": 0.65, "vulnerability": 0.70}'::jsonb
    ),
    (
        'zone-d',
        'disaster-assam-2026',
        'Zone D (Mandia Island Char)',
        ST_SetSRID(ST_MakePoint(90.9300, 26.2700), 4326),
        4900,
        2540,
        'critical',
        'high',
        0.200,
        0.800,
        89,
        'Critical',
        '{"population_impact": 0.85, "severity": 0.92, "medical_risk": 0.85, "resource_shortage": 0.88, "accessibility_difficulty": 0.90, "vulnerability": 0.80}'::jsonb
    ),
    (
        'zone-e',
        'disaster-assam-2026',
        'Zone E (Nalbari South Embankment)',
        ST_SetSRID(ST_MakePoint(91.4400, 26.4000), 4326),
        4200,
        2290,
        'high',
        'medium',
        0.600,
        0.650,
        85,
        'Critical',
        '{"population_impact": 0.80, "severity": 0.82, "medical_risk": 0.78, "resource_shortage": 0.72, "accessibility_difficulty": 0.55, "vulnerability": 0.65}'::jsonb
    ),
    (
        'zone-f',
        'disaster-assam-2026',
        'Zone F (Dhamdhama Rural Cluster)',
        ST_SetSRID(ST_MakePoint(91.4800, 26.5100), 4326),
        3900,
        1988,
        'high',
        'medium',
        0.650,
        0.600,
        85,
        'Critical',
        '{"population_impact": 0.78, "severity": 0.80, "medical_risk": 0.75, "resource_shortage": 0.70, "accessibility_difficulty": 0.50, "vulnerability": 0.60}'::jsonb
    ),
    (
        'zone-g',
        'disaster-assam-2026',
        'Zone G (Bilasipara Riverside Sector)',
        ST_SetSRID(ST_MakePoint(90.2300, 26.2300), 4326),
        3600,
        1860,
        'high',
        'medium',
        0.550,
        0.600,
        85,
        'Critical',
        '{"population_impact": 0.75, "severity": 0.80, "medical_risk": 0.74, "resource_shortage": 0.68, "accessibility_difficulty": 0.60, "vulnerability": 0.60}'::jsonb
    )
ON CONFLICT (id) DO UPDATE SET
    affected_population = EXCLUDED.affected_population,
    priority_score = EXCLUDED.priority_score;

-- 5. Insert Canonical Road Segments for Zone A
INSERT INTO road_segments (id, name, geometry, length_km, status, risk_score)
VALUES
    ('route-a', 'Route A (Barpeta-Howly State Highway)', ST_SetSRID(ST_MakeLine(ST_MakePoint(91.0059, 26.3216), ST_MakePoint(91.0450, 26.4320)), 4326), 10.20, 'blocked', 95),
    ('route-b', 'Route B (Rural Embankment Connector)', ST_SetSRID(ST_MakeLine(ST_MakePoint(91.0059, 26.3216), ST_MakePoint(91.0600, 26.3800)), 4326), 14.10, 'partial', 65),
    ('route-c', 'Route C (High Elevation Bypass Highway)', ST_SetSRID(ST_MakeLine(ST_MakePoint(91.0059, 26.3216), ST_MakePoint(91.1200, 26.4100)), 4326), 17.40, 'accessible', 15)
ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status;

-- 6. Insert Canonical Recommendation & Human Approval Record for Zone A
INSERT INTO recommendations (id, zone_id, plan, explanation, status)
VALUES (
    'rec-zone-a-001',
    'zone-a',
    '{
        "zone_name": "Zone A",
        "priority_rank": 1,
        "score": 94,
        "source_center": "Relief Center #3 (Barpeta)",
        "resources_recommended": {
            "boats": 4,
            "food_kits": 1200,
            "water_units": 800,
            "medical_teams": 1
        },
        "selected_route": "Route C (17.4 km, Accessible)",
        "alternate_routes": [
            {"id": "route-a", "status": "blocked", "reason": "Flooded / 1.8m water level"},
            {"id": "route-b", "status": "partial", "reason": "Waterlogged road shoulders"}
        ],
        "shelter_allocation": {
            "shelter_id": "shelter-2",
            "shelter_name": "Howly Community Relief Center (Shelter B)",
            "allocated_evacuees": 200,
            "distance_km": 5.4
        }
    }'::jsonb,
    'Zone A ranked #1 Critical Priority (Score 94/100) because 3,842 people are affected, medical urgency is high, food shortage gap is 72%, water shortage gap is 61%, and primary Route A is blocked due to 1.8m floodwaters. Route C selected as the safest accessible route to Relief Center #3.',
    'draft'
)
ON CONFLICT (id) DO NOTHING;

-- 7. Insert Canonical Warehouse Resources Inventory across 5 Relief Centers
INSERT INTO resources (id, center_id, resource_type, quantity, status)
VALUES
    -- Center 3: Barpeta Relief Base #3 (Co-located with Zone A)
    ('res-c3-food', 'center-3', 'food_kits', 2500, 'available'),
    ('res-c3-water', 'center-3', 'water_units', 2000, 'available'),
    ('res-c3-boats', 'center-3', 'boats', 4, 'available'),
    ('res-c3-med', 'center-3', 'medical_teams', 5, 'available'),

    -- Center 1: Guwahati Central Logistics Hub
    ('res-c1-food', 'center-1', 'food_kits', 8000, 'available'),
    ('res-c1-water', 'center-1', 'water_units', 6500, 'available'),
    ('res-c1-boats', 'center-1', 'boats', 1, 'available'),
    ('res-c1-med', 'center-1', 'medical_teams', 6, 'available'),

    -- Center 2: Nalbari Rapid Response Depot
    ('res-c2-food', 'center-2', 'food_kits', 2000, 'available'),
    ('res-c2-water', 'center-2', 'water_units', 1800, 'available'),
    ('res-c2-boats', 'center-2', 'boats', 1, 'available'),
    ('res-c2-med', 'center-2', 'medical_teams', 3, 'available'),

    -- Center 4: Dhubri Sector Logistics Base
    ('res-c4-food', 'center-4', 'food_kits', 2200, 'available'),
    ('res-c4-water', 'center-4', 'water_units', 1900, 'available'),
    ('res-c4-boats', 'center-4', 'boats', 1, 'available'),
    ('res-c4-med', 'center-4', 'medical_teams', 4, 'available'),

    -- Center 5: Goalpara Riverine Outpost
    ('res-c5-food', 'center-5', 'food_kits', 1500, 'available'),
    ('res-c5-water', 'center-5', 'water_units', 1200, 'available'),
    ('res-c5-boats', 'center-5', 'boats', 1, 'available'),
    ('res-c5-med', 'center-5', 'medical_teams', 3, 'available')
ON CONFLICT (id) DO UPDATE SET
    quantity = EXCLUDED.quantity,
    status = EXCLUDED.status;
