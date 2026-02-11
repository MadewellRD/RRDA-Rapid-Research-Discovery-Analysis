/**
 * CLI runner for individual scanners.
 *
 * Fix for #11: The old package.json scripts pointed at class files that
 * don't have a main() entrypoint and therefore do nothing when executed.
 *
 * Usage:
 *   npx tsx src/scanners/run.ts github
 *   npx tsx src/scanners/run.ts hn
 *   npx tsx src/scanners/run.ts reddit
 *   npx tsx src/scanners/run.ts arxiv
 *   npx tsx src/scanners/run.ts all
 */

import dotenv from 'dotenv';
dotenv.config();

import { GitHubScanner } from './GitHubScanner.js';
import { HackerNewsScanner } from './HackerNewsScanner.js';
import { RedditScanner } from './RedditScanner.js';
import { ArxivScanner } from './ArxivScanner.js';
import { RDACore } from '../core/RDACore.js';
import { closePool } from '../database/pool.js';

const scanner = process.argv[2]?.toLowerCase();

if (!scanner || !['github', 'hn', 'reddit', 'arxiv', 'all'].includes(scanner)) {
  console.error('Usage: npx tsx src/scanners/run.ts <github|hn|reddit|arxiv|all>');
  process.exit(1);
}

async function run() {
  const core = new RDACore();
  let discoveries: any[] = [];

  console.log(`\n🔍 Running ${scanner} scanner...\n`);

  if (scanner === 'github' || scanner === 'all') {
    const gh = new GitHubScanner();
    const results = await gh.scanTrending({
      languages: ['typescript', 'javascript', 'python'],
      since: 'daily',
    });
    console.log(`✅ GitHub: ${results.length} repos`);
    discoveries.push(...results);
  }

  if (scanner === 'hn' || scanner === 'all') {
    const hn = new HackerNewsScanner();
    const frontPage = await hn.scanFrontPage({ minScore: 50 });
    const showHN = await hn.scanShowHN(30);
    const results = [...frontPage, ...showHN];
    console.log(`✅ HN: ${results.length} stories`);
    discoveries.push(...results);
  }

  if (scanner === 'reddit' || scanner === 'all') {
    const reddit = new RedditScanner();
    const results = await reddit.scanSubreddits({
      subreddits: ['programming', 'machinelearning'],
      minScore: 100,
    });
    console.log(`✅ Reddit: ${results.length} posts`);
    discoveries.push(...results);
  }

  if (scanner === 'arxiv' || scanner === 'all') {
    const arxiv = new ArxivScanner();
    const results = await arxiv.scanCategories({
      categories: ['cs.AI', 'cs.LG', 'cs.SE'],
      maxResults: 20,
    });
    console.log(`✅ ArXiv: ${results.length} papers`);
    discoveries.push(...results);
  }

  // Assess and store
  console.log(`\n📊 Assessing ${discoveries.length} discoveries...\n`);

  let stored = 0;
  for (const discovery of discoveries) {
    try {
      const assessment = await core.assessIntelligence(discovery);
      const id = await core.storeDiscovery(discovery, assessment);
      console.log(`   💾 #${id} [${assessment.level}] ${discovery.title}`);
      stored++;
    } catch (err: any) {
      console.error(`   ⚠️  Failed: ${err.message}`);
    }
  }

  console.log(`\n✅ Done — ${stored}/${discoveries.length} stored\n`);

  await closePool();
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
