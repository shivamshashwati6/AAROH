-- ==============================================================================
-- RELIEF-OS Database Schema Migration: 004_situation_analysis.sql
-- ==============================================================================
-- 1. Creates situation_analyses table to persist AI and rule-based situation
--    overviews, fact extractions, duplicate clusters, and uncertainty flags.
-- 2. Adds backward-compatible columns to reports table:
--    - duplicate_cluster_id: link to detected duplicate cluster
--    - ai_extracted: structured JSON extracted from natural language distress text
--    - analyzed_at: timestamp of analysis execution
-- 3. Creates performance indices for disaster report queue and situation lookups.
-- ==============================================================================

-- 1. Create situation_analyses table
CREATE TABLE IF NOT EXISTS situation_analyses (
    id VARCHAR(64) PRIMARY KEY,
    disaster_id VARCHAR(64) REFERENCES disasters(id) ON DELETE CASCADE,
    analyzed_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    summary TEXT NOT NULL,
    facts JSONB NOT NULL DEFAULT '[]',
    inferred JSONB NOT NULL DEFAULT '[]',
    uncertainties JSONB NOT NULL DEFAULT '[]',
    conflicts JSONB NOT NULL DEFAULT '[]',
    categories_breakdown JSONB NOT NULL DEFAULT '{}',
    severity_breakdown JSONB NOT NULL DEFAULT '{}',
    urgent_needs JSONB NOT NULL DEFAULT '[]',
    high_severity_count INT NOT NULL DEFAULT 0,
    total_reports_analyzed INT NOT NULL DEFAULT 0,
    clusters JSONB NOT NULL DEFAULT '[]',
    provider VARCHAR(50) NOT NULL DEFAULT 'rule_based',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Add columns to reports table
ALTER TABLE reports ADD COLUMN IF NOT EXISTS duplicate_cluster_id VARCHAR(64);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS ai_extracted JSONB;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMP WITH TIME ZONE;

-- 3. Create indices for performance
CREATE INDEX IF NOT EXISTS idx_reports_disaster_status ON reports (disaster_id, status);
CREATE INDEX IF NOT EXISTS idx_situation_analyses_disaster ON situation_analyses (disaster_id, created_at DESC);
