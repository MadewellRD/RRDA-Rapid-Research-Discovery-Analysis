-- Table to track autonomous responses
CREATE TABLE IF NOT EXISTS response_actions (
  id SERIAL PRIMARY KEY,
  discovery_id INTEGER REFERENCES discoveries(id),
  action_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  forge_project_id VARCHAR(100),
  result JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX idx_response_actions_discovery ON response_actions(discovery_id);
CREATE INDEX idx_response_actions_status ON response_actions(status);
CREATE INDEX idx_response_actions_created ON response_actions(created_at DESC);
