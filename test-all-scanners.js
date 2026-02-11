require('dotenv').config();

const { GitHubScanner } = require('./dist/scanners/GitHubScanner');
const { HackerNewsScanner } = require('./dist/scanners/HackerNewsScanner');
const { RedditScanner } = require('./dist/scanners/RedditScanner');
const { ArxivScanner } = require('./dist/scanners/ArxivScanner');

async function testAllScanners() {
  console.log('🧪 Testing All RDA Scanners\n');
  console.log('='.repeat(70));

  // Test GitHub
  console.log('\n📊 TEST 1: GitHub Scanner');
  console.log('─'.repeat(70));
  const github = new GitHubScanner();
  const githubResults = await github.searchByKeywords(['AI agents'], 100);
  console.log(`✅ GitHub: ${githubResults.length} repositories\n`);

  // Test Hacker News
  console.log('\n📰 TEST 2: Hacker News Scanner');
  console.log('─'.repeat(70));
  const hn = new HackerNewsScanner();
  const hnFrontPage = await hn.scanFrontPage({ minScore: 50 });
  const hnShowHN = await hn.scanShowHN(20);
  console.log(`✅ HN Front Page: ${hnFrontPage.length} stories`);
  console.log(`✅ HN Show HN: ${hnShowHN.length} launches\n`);

  // Test Reddit
  console.log('\n🔴 TEST 3: Reddit Scanner');
  console.log('─'.repeat(70));
  const reddit = new RedditScanner();
  const redditResults = await reddit.scanSubreddits({
    subreddits: ['programming', 'machinelearning'],
    minScore: 50,
    timeFilter: 'day',
  });
  console.log(`✅ Reddit: ${redditResults.length} posts\n`);

  // Test ArXiv
  console.log('\n📚 TEST 4: ArXiv Scanner');
  console.log('─'.repeat(70));
  const arxiv = new ArxivScanner();
  const arxivResults = await arxiv.searchByKeywords(['autonomous agents'], 5);
  console.log(`✅ ArXiv: ${arxivResults.length} papers\n`);

  console.log('='.repeat(70));
  console.log('🎯 ALL SCANNERS OPERATIONAL!\n');
  console.log(`Total discoveries across all sources: ${
    githubResults.length + hnFrontPage.length + hnShowHN.length + 
    redditResults.length + arxivResults.length
  }`);
  console.log('='.repeat(70));
}

testAllScanners();
