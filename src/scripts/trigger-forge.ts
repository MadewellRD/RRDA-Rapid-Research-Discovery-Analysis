#!/usr/bin/env node
/**
 * Manual FORGE Trigger Script
 * 
 * Usage:
 *   npx ts-node scripts/trigger-forge.ts --discovery-id 42
 *   npx ts-node scripts/trigger-forge.ts --test
 *   npx ts-node scripts/trigger-forge.ts --health
 * 
 * Options:
 *   --discovery-id <id>  Trigger FORGE for a specific discovery
 *   --test               Insert a synthetic threat and trigger FORGE
 *   --health             Check FORGE API health
 *   --dry-run            Show what would be triggered without calling FORGE
 */
import dotenv from 'dotenv';
dotenv.config();

import { getPool, closePool } from '../database/pool.js';
import { FORGEClient } from '../integrations/FORGEClient.js';
import { AutonomousResponseOrchestrator } from '../integrations/AutonomousResponseOrchestrator.js';
import { Discovery } from '../types/index.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--health')) {
    await checkHealth();
    return;
  }

  if (args.includes('--test')) {
    await testTrigger(args.includes('--dry-run'));
    return;
  }

  const idIndex = args.indexOf('--discovery-id');
  if (idIndex >= 0 && args[idIndex + 1]) {
    const id = parseInt(args[idIndex + 1], 10);
    await triggerForDiscovery(id, args.includes('--dry-run'));
    return;
  }

  // Show recent HIGH+ discoveries
  await showHighThreats();
}

async function checkHealth() {
  const forge = new FORGEClient();
  const healthy = await forge.healthCheck();
  
  if (healthy) {
    console.log('✅ FORGE API is healthy');
    console.log(`   URL: ${process.env.FORGE_API_URL || 'http://localhost:3001'}`);
  } else {
    console.log('❌ FORGE API is unreachable');
    console.log(`   URL: ${process.env.FORGE_API_URL || 'http://localhost:3001'}`);
    console.log('   Check: Is forge-api service running?');
  }
}

async function testTrigger(dryRun: boolean) {
  console.log('🧪 Creating synthetic HIGH threat for testing...\n');
  
  const pool = getPool();
  
  // Insert synthetic discovery
  const result = await pool.query(
    `INSERT INTO discoveries (title, source, url, description, threat_score, intelligence_level, discovered_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id, title, threat_score, intelligence_level`,
    [
      'TEST-synthetic-competitor-framework',
      'manual',
      'https://github.com/test/synthetic',
      'Synthetic test discovery for FORGE integration validation. This is an AI-powered code generation framework with multi-agent orchestration.',
      8.5,
      'HIGH',
    ]
  );

  const row = result.rows[0];
  console.log(`   Created discovery #${row.id}: ${row.title}`);
  console.log(`   Threat: ${row.intelligence_level} (${row.threat_score}/10)\n`);

  const discovery: Discovery = {
    id: row.id,
    title: row.title,
    source: 'manual',
    url: 'https://github.com/test/synthetic',
    description: 'Synthetic test discovery for FORGE integration validation.',
    intelligence_level: row.intelligence_level,
    threat_score: row.threat_score,
    recommended_action: 'Build counter-feature demonstrating superior capabilities',
  };

  if (dryRun) {
    const forge = new FORGEClient();
    console.log(`   [DRY RUN] Would trigger: ${forge.shouldTrigger(discovery) ? 'YES' : 'NO'}`);
  } else {
    const orchestrator = new AutonomousResponseOrchestrator();
    await orchestrator.processDiscovery(discovery);
  }

  await closePool();
  console.log('\n✅ Test complete');
}

async function triggerForDiscovery(id: number, dryRun: boolean) {
  console.log(`🎯 Loading discovery #${id}...\n`);
  
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, title, source, url, description, threat_score, intelligence_level, recommended_action
     FROM discoveries WHERE id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    console.error(`❌ Discovery #${id} not found`);
    await closePool();
    process.exit(1);
  }

  const row = result.rows[0];
  console.log(`   Title: ${row.title}`);
  console.log(`   Source: ${row.source}`);
  console.log(`   Level: ${row.intelligence_level} (${row.threat_score}/10)`);
  console.log('');

  const discovery: Discovery = {
    id: row.id,
    title: row.title,
    source: row.source,
    url: row.url,
    description: row.description,
    intelligence_level: row.intelligence_level,
    threat_score: row.threat_score,
    recommended_action: row.recommended_action,
  };

  if (dryRun) {
    const forge = new FORGEClient();
    console.log(`   [DRY RUN] Would trigger: ${forge.shouldTrigger(discovery) ? 'YES' : 'NO'}`);
  } else {
    const orchestrator = new AutonomousResponseOrchestrator();
    await orchestrator.processDiscovery(discovery);
  }

  await closePool();
}

async function showHighThreats() {
  console.log('📊 Recent HIGH+ discoveries (candidates for FORGE trigger):\n');
  
  const pool = getPool();
  const result = await pool.query(
    `SELECT d.id, d.title, d.source, d.threat_score, d.intelligence_level,
            ra.id as action_id, ra.status as action_status, ra.forge_project_id
     FROM discoveries d
     LEFT JOIN response_actions ra ON d.id = ra.discovery_id
     WHERE d.intelligence_level IN ('CRITICAL', 'HIGH')
       AND d.threat_score >= 7.5
     ORDER BY d.discovered_at DESC
     LIMIT 20`
  );

  if (result.rows.length === 0) {
    console.log('   No HIGH+ discoveries found above threshold.\n');
    console.log('Usage:');
    console.log('   npx ts-node scripts/trigger-forge.ts --test           # Create synthetic threat');
    console.log('   npx ts-node scripts/trigger-forge.ts --health         # Check FORGE API');
    console.log('   npx ts-node scripts/trigger-forge.ts --discovery-id 42  # Trigger for specific ID');
  } else {
    for (const row of result.rows) {
      const status = row.action_id ? `[${row.action_status}${row.forge_project_id ? ` → ${row.forge_project_id}` : ''}]` : '[NOT TRIGGERED]';
      console.log(`   #${row.id}  ${row.intelligence_level} ${row.threat_score}/10  ${status}  ${row.title.substring(0, 60)}`);
    }
    console.log(`\n   Total: ${result.rows.length} HIGH+ discoveries`);
    console.log('\nTo trigger: npx ts-node scripts/trigger-forge.ts --discovery-id <id>');
  }

  await closePool();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
