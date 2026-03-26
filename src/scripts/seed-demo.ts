import dotenv from 'dotenv';
import { closePool, getPool } from '../database/pool.js';

dotenv.config();

async function main() {
  const pool = getPool();

  const discoveries = [
    {
      source: 'github',
      url: 'https://github.com/example/agent-orchestrator',
      title: 'Agent Orchestrator for CI Workflows',
      description: 'A multi-agent pipeline for code review, test repair, and deployment checks.',
      intelligence_level: 'HIGH',
      threat_score: 7.8,
      opportunity_score: 8.4,
      metadata: { topics: ['agents', 'ci', 'automation'], language: 'TypeScript' },
    },
    {
      source: 'hackernews',
      url: 'https://news.ycombinator.com/item?id=40000001',
      title: 'Teams are replacing brittle CI glue with policy-driven delivery automation',
      description: 'Discussion about governance, policy, and visibility in engineering automation stacks.',
      intelligence_level: 'CRITICAL',
      threat_score: 8.6,
      opportunity_score: 7.9,
      metadata: { topics: ['governance', 'automation'], language: 'N/A' },
    },
    {
      source: 'arxiv',
      url: 'https://arxiv.org/abs/2501.00001',
      title: 'Repository-Scale Evaluation for Autonomous Engineering Agents',
      description: 'Research on evaluating software agents against large, real-world repositories.',
      intelligence_level: 'HIGH',
      threat_score: 7.2,
      opportunity_score: 8.8,
      metadata: { topics: ['evaluation', 'agents', 'research'], language: 'Python' },
    },
  ];

  for (const discovery of discoveries) {
    await pool.query(
      `INSERT INTO discoveries (source, source_id, url, title, description, intelligence_level, threat_score, opportunity_score, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (source, url)
       DO UPDATE SET title = EXCLUDED.title,
                     description = EXCLUDED.description,
                     intelligence_level = EXCLUDED.intelligence_level,
                     threat_score = EXCLUDED.threat_score,
                     opportunity_score = EXCLUDED.opportunity_score,
                     metadata = EXCLUDED.metadata`,
      [
        discovery.source,
        discovery.url,
        discovery.url,
        discovery.title,
        discovery.description,
        discovery.intelligence_level,
        discovery.threat_score,
        discovery.opportunity_score,
        JSON.stringify(discovery.metadata),
      ]
    );
  }

  const discoveryRow = await pool.query(`SELECT id FROM discoveries ORDER BY discovered_at DESC LIMIT 1`);
  const discoveryId = discoveryRow.rows[0]?.id;

  if (discoveryId) {
    await pool.query(
      `INSERT INTO deep_analyses (discovery_id, repo_url, total_loc, file_count, frameworks, architecture_pattern, ai_competitive_analysis)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        discoveryId,
        'https://github.com/example/agent-orchestrator',
        18420,
        137,
        JSON.stringify(['React', 'FastAPI', 'PostgreSQL']),
        'modular monolith',
        'Strong engineering automation signal with a focus on policy, observability, and developer workflow reliability.',
      ]
    );
  }

  await pool.query(
    `INSERT INTO innovation_proposals
     (name, concept, problem_statement, inspiration_sources, target_users, capabilities, novelty_score, reasoning, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      'review-flight-recorder',
      'A timeline-first analysis workspace for software teams tracking automated code review and CI failures.',
      'Teams lose context when automated review, policy, and test systems disagree across tools.',
      JSON.stringify(['Agent Orchestrator for CI Workflows', 'Repository-Scale Evaluation for Autonomous Engineering Agents']),
      'Engineering managers and platform teams',
      JSON.stringify(['Incident-style review timeline', 'Policy diff view', 'Agent output comparisons', 'Risk trend reporting']),
      8,
      'The signal exists across tools but is rarely unified into one operator-friendly view.',
      'proposed',
    ]
  );

  console.log('Demo data seeded.');
  await closePool();
}

main().catch(async (error) => {
  console.error('Seed failed:', error);
  await closePool();
  process.exit(1);
});
