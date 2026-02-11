import dotenv from 'dotenv';
dotenv.config();

import { DeepAnalysisPipeline } from '../analyzers/DeepAnalysisPipeline.js';
import { closePool } from '../database/pool.js';

async function main() {
  const pipeline = new DeepAnalysisPipeline();
  const args = process.argv.slice(2);

  if (args[0] === '--id') {
    // Analyze specific discovery
    const id = parseInt(args[1]);
    if (isNaN(id)) {
      console.error('Usage: --id <discovery_id>');
      process.exit(1);
    }
    const result = await pipeline.analyze(id);
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Analyze all unprocessed
    const limit = parseInt(args[0]) || 10;
    const results = await pipeline.analyzeUnprocessed(limit);
    console.log(`\nResults: ${results.filter(r => r.success).length} success, ${results.filter(r => !r.success).length} failed`);
  }

  await closePool();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
