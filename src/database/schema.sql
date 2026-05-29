-- RDA Intelligence Database Schema

-- Discoveries from all sources
CREATE TABLE IF NOT EXISTS discoveries (
    id SERIAL PRIMARY KEY,
    source VARCHAR(50) NOT NULL,
    source_id VARCHAR(255),
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    
    -- Metrics
    stars INT DEFAULT 0,
    forks INT DEFAULT 0,
    upvotes INT DEFAULT 0,
    comments INT DEFAULT 0,
    
    -- Timestamps
    discovered_at TIMESTAMP DEFAULT NOW(),
    last_checked TIMESTAMP DEFAULT NOW(),
    
    -- Intelligence classification
    intelligence_level VARCHAR(20),
    threat_score DECIMAL(5,2) DEFAULT 0,
    opportunity_score DECIMAL(5,2) DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'discovered',
    archived BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    metadata JSONB,
    
    CONSTRAINT unique_discovery UNIQUE(source, url)
);

CREATE INDEX idx_discoveries_intelligence ON discoveries(intelligence_level);
CREATE INDEX idx_discoveries_status ON discoveries(status);
CREATE INDEX idx_discoveries_discovered ON discoveries(discovered_at DESC);
CREATE INDEX idx_discoveries_source ON discoveries(source);
CREATE INDEX idx_discoveries_threat ON discoveries(threat_score DESC);
CREATE INDEX idx_discoveries_opportunity ON discoveries(opportunity_score DESC);

-- Deep analyses
CREATE TABLE IF NOT EXISTS deep_analyses (
    id SERIAL PRIMARY KEY,
    discovery_id INT REFERENCES discoveries(id) ON DELETE CASCADE,
    analyzed_at TIMESTAMP DEFAULT NOW(),

    -- Detailed analysis results
    repo_url TEXT,
    total_loc INT DEFAULT 0,
    file_count INT DEFAULT 0,
    frameworks JSONB,
    architecture_pattern TEXT,
    has_ci_cd BOOLEAN DEFAULT FALSE,
    has_tests BOOLEAN DEFAULT FALSE,
    has_docker BOOLEAN DEFAULT FALSE,
    has_ai_deps BOOLEAN DEFAULT FALSE,
    dependency_count INT DEFAULT 0,
    readme_summary TEXT,
    ai_competitive_analysis TEXT,
    clone_size_mb DECIMAL(10,2),
    analysis_duration_ms INT,

    -- Legacy-compatible fields
    summary TEXT,
    architecture TEXT,
    languages JSONB,
    unique_features JSONB,
    dependencies JSONB,
    
    -- Competitive intelligence
    competitive_threat TEXT,
    integration_feasibility TEXT,
    recommended_action TEXT,
    business_case TEXT,
    key_insights JSONB,
    
    -- Cost tracking
    analysis_cost DECIMAL(10,6),
    tokens_used INT
);

CREATE INDEX idx_deep_analyses_discovery ON deep_analyses(discovery_id);
CREATE INDEX idx_deep_analyses_date ON deep_analyses(analyzed_at DESC);

-- Cross-source correlations
CREATE TABLE IF NOT EXISTS correlations (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP DEFAULT NOW(),
    
    correlation_type VARCHAR(50),
    confidence DECIMAL(5,2),
    discovery_ids INT[] NOT NULL,
    
    insight TEXT,
    pattern TEXT,
    actionable BOOLEAN DEFAULT FALSE,
    action_taken TEXT
);

-- Monetization opportunities
CREATE TABLE IF NOT EXISTS opportunities (
    id SERIAL PRIMARY KEY,
    discovered_from INT REFERENCES discoveries(id),
    
    opportunity_name TEXT NOT NULL,
    opportunity_type VARCHAR(50),
    
    market_size BIGINT,
    competition_level VARCHAR(20),
    development_time TEXT,
    development_cost DECIMAL(10,2),
    revenue_potential BIGINT,
    opportunity_score DECIMAL(5,2),
    
    business_case TEXT,
    
    status VARCHAR(20) DEFAULT 'evaluating',
    created_at TIMESTAMP DEFAULT NOW(),
    decided_at TIMESTAMP
);

-- Source configurations
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    category VARCHAR(50),
    tier VARCHAR(20) DEFAULT 'free',
    enabled BOOLEAN DEFAULT TRUE,
    
    scan_frequency VARCHAR(50),
    last_scan TIMESTAMP,
    next_scan TIMESTAMP,
    
    rate_limit_requests INT,
    rate_limit_window VARCHAR(20),
    requests_used INT DEFAULT 0,
    requests_reset TIMESTAMP,
    
    total_discoveries INT DEFAULT 0,
    high_value_discoveries INT DEFAULT 0,
    
    config JSONB
);

-- Alerts sent
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    discovery_id INT REFERENCES discoveries(id),
    
    alert_type VARCHAR(50),
    channel VARCHAR(20),
    recipient VARCHAR(255),
    
    sent_at TIMESTAMP DEFAULT NOW(),
    delivered BOOLEAN DEFAULT FALSE,
    
    content TEXT,
    metadata JSONB
);

-- Daily metrics
CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    
    discoveries_total INT DEFAULT 0,
    discoveries_critical INT DEFAULT 0,
    discoveries_high INT DEFAULT 0,
    
    analyses_performed INT DEFAULT 0,
    avg_analysis_time_seconds INT,
    total_tokens_used BIGINT DEFAULT 0,
    total_cost_usd DECIMAL(10,4) DEFAULT 0,
    
    opportunities_identified INT DEFAULT 0,
    
    api_calls_github INT DEFAULT 0,
    api_calls_other INT DEFAULT 0
);

-- Initialize sources
INSERT INTO sources (name, category, tier, enabled, scan_frequency, config) VALUES
('github_trending', 'code', 'free', true, '15min', '{"languages": ["TypeScript", "Python", "JavaScript"]}'),
('github_search', 'code', 'free', true, '1hour', '{"keywords": ["autonomous development", "code generation"]}'),
('hackernews', 'community', 'free', true, '1hour', '{"min_score": 10}'),
('reddit_programming', 'community', 'free', true, '6hours', '{"subreddits": ["programming", "machinelearning"]}'),
('arxiv', 'research', 'free', true, '24hours', '{"categories": ["cs.AI", "cs.SE"]}'),
('npm_registry', 'code', 'free', true, '24hours', '{"keywords": ["code-generation", "ai"]}')
ON CONFLICT (name) DO NOTHING;

-- Initialize today's metrics
INSERT INTO metrics (date) VALUES (CURRENT_DATE)
ON CONFLICT (date) DO NOTHING;

-- Manual scan jobs (replaces in-memory array)
CREATE TABLE IF NOT EXISTS scan_jobs (
  id VARCHAR(100) PRIMARY KEY,
  source VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  discovered_count INT,
  stored_count INT,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_jobs_status ON scan_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_started ON scan_jobs(started_at DESC);

-- Innovation proposals synthesized from recent signals
-- Requires: CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS innovation_proposals (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  concept TEXT NOT NULL,
  problem_statement TEXT,
  inspiration_sources JSONB DEFAULT '[]',
  target_users TEXT,
  capabilities JSONB DEFAULT '[]',
  novelty_score INTEGER DEFAULT 5,
  reasoning TEXT,
  status VARCHAR(20) DEFAULT 'proposed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  concept_embedding vector(1536)
);

CREATE INDEX IF NOT EXISTS idx_innovation_proposals_status ON innovation_proposals(status);
CREATE INDEX IF NOT EXISTS idx_innovation_proposals_created ON innovation_proposals(created_at DESC);
-- Enable after running: CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE INDEX IF NOT EXISTS idx_innovation_proposals_embedding
--   ON innovation_proposals USING ivfflat (concept_embedding vector_cosine_ops) WITH (lists = 100);

-- ─── Runtime configuration (DB-backed, editable via dashboard) ────────────────
CREATE TABLE IF NOT EXISTS config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  secret BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO config (key, value, secret, description) VALUES
('LLM_PROVIDER',              'openai',                false, 'LLM provider: openai or bitnet'),
('LLM_DEFAULT_MODEL',         'gpt-4o-mini',           false, 'Model used for scoring and clustering'),
('LLM_CREATIVE_MODEL',        'gpt-4o',                false, 'Model used for creative synthesis'),
('BITNET_BASE_URL',           'http://localhost:8080/v1', false, 'Local bitnet-compatible inference URL'),
('OPENAI_API_KEY',            '',                      true,  'OpenAI API key'),
('ENABLE_SCHEDULER',          'true',                  false, 'Enable background scan scheduler'),
('ENABLE_AUTO_ANALYSIS',      'true',                  false, 'Automatically deep-analyse high-value discoveries'),
('INNOVATION_CYCLE_MINUTES',  '20',                    false, 'How often the innovation agent runs (minutes)'),
('SCAN_GITHUB',               'true',                  false, 'Enable GitHub scanner'),
('SCAN_HACKERNEWS',           'true',                  false, 'Enable HackerNews scanner'),
('SCAN_REDDIT',               'true',                  false, 'Enable Reddit scanner'),
('SCAN_ARXIV',                'true',                  false, 'Enable ArXiv scanner'),
('GITHUB_SCAN_FREQUENCY',     '15min',                 false, 'GitHub scan interval'),
('HACKERNEWS_SCAN_FREQUENCY', '1hour',                 false, 'HackerNews scan interval'),
('REDDIT_SCAN_FREQUENCY',     '6hours',                false, 'Reddit scan interval'),
('ARXIV_SCAN_FREQUENCY',      '24hours',               false, 'ArXiv scan interval'),
('SLACK_WEBHOOK_URL',         '',                      true,  'Slack incoming webhook URL'),
('ALERT_EMAIL',               '',                      false, 'Recipient email for critical alerts'),
('SMTP_HOST',                 '',                      false, 'SMTP server hostname'),
('SMTP_PORT',                 '587',                   false, 'SMTP server port'),
('SMTP_USER',                 '',                      false, 'SMTP authentication username'),
('SMTP_PASSWORD',             '',                      true,  'SMTP authentication password'),
('GITHUB_TOKEN_1',            '',                      true,  'Primary GitHub API token'),
('GITHUB_TOKEN_2',            '',                      true,  'Secondary GitHub API token (optional)'),
('CORS_ORIGIN',               'http://localhost:4173', false, 'Allowed CORS origin for the dashboard'),
('MAX_CLONE_SIZE_MB',         '500',                   false, 'Max repo clone size for deep analysis (MB)'),
('CLONE_RETENTION_HOURS',     '4',                     false, 'How long clones are kept on disk (hours)')
ON CONFLICT (key) DO NOTHING;
