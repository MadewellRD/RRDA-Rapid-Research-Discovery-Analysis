/**
 * test-alerts.ts — ESM-compatible alert system test.
 *
 * Replaces the old test-alerts.js which used require() in an ESM project.
 * Run: npx tsx test-alerts.ts   (or:  npm run build && node dist/test-alerts.js)
 */

import dotenv from 'dotenv';
dotenv.config();

import { AlertOrchestrator } from './src/notifiers/AlertOrchestrator.js';
import { closePool } from './src/database/pool.js';

async function testAlerts() {
  console.log('🧪 TESTING RDA ALERT SYSTEM\n');
  console.log('='.repeat(60));

  const alerts = new AlertOrchestrator();

  // Test all channels
  await alerts.testAllChannels();

  console.log('\n' + '='.repeat(60));
  console.log('✅ Alert system test complete!');
  console.log('='.repeat(60));

  // Clean up shared pool
  await closePool();
}

testAlerts().catch(console.error);
