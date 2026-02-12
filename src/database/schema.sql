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
CREATE TABLE IF NOT EXISTS analyses (
    id SERIAL PRIMARY KEY,
    discovery_id INT REFERENCES discoveries(id) ON DELETE CASCADE,
    analyzed_at TIMESTAMP DEFAULT NOW(),
    
    -- Analysis results
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

CREATE INDEX idx_analyses_discovery ON analyses(discovery_id);
CREATE INDEX idx_analyses_date ON analyses(analyzed_at DESC);

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

-- ═══════════════════════════════════════════════════════════════
-- RDA → FORGE Integration: Response Actions
-- Tracks autonomous responses triggered by RDA discoveries
-- ═══════════════════════════════════════════════════════════════

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

CREATE INDEX IF NOT EXISTS idx_response_actions_discovery ON response_actions(discovery_id);
CREATE INDEX IF NOT EXISTS idx_response_actions_status ON response_actions(status);
CREATE INDEX IF NOT EXISTS idx_response_actions_created ON response_actions(created_at DESC);
