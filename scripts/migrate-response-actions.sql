-- ═══════════════════════════════════════════════════════════════
-- RDA → FORGE Integration: Database Migration
-- Run: psql $DATABASE_URL -f scripts/migrate-response-actions.sql
-- ═══════════════════════════════════════════════════════════════

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS response_actions (
  id SERIAL PRIMARY KEY,
  discovery_id INTEGER REFERENCES discoveries(id),
  action_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'initiated',
  forge_project_id VARCHAR(100),
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Add forge_project_id column if missing (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'response_actions' AND column_name = 'forge_project_id'
  ) THEN
    ALTER TABLE response_actions ADD COLUMN forge_project_id VARCHAR(100);
  END IF;
END $$;

-- Indexes (IF NOT EXISTS is idempotent)
CREATE INDEX IF NOT EXISTS idx_response_actions_discovery ON response_actions(discovery_id);
CREATE INDEX IF NOT EXISTS idx_response_actions_status ON response_actions(status);
CREATE INDEX IF NOT EXISTS idx_response_actions_created ON response_actions(created_at DESC);

-- Verify
SELECT 'response_actions table ready' AS status, 
       COUNT(*) AS existing_rows 
FROM response_actions;
