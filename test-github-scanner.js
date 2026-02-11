require('dotenv').config();

// Import using require since we're in CommonJS
const { GitHubScanner } = require('./dist/scanners/GitHubScanner');

async function testGitHubScanner() {
  console.log('🧪 Testing GitHub Scanner\n');
  console.log('='.repeat(60));

  try {
    const scanner = new GitHubScanner();

    // Test 1: Check rate limit
    console.log('\n📊 TEST 1: Rate Limit Check');
    console.log('─'.repeat(60));
    const rateLimit = await scanner.checkRateLimit();
    console.log(`✅ Rate Limit: ${rateLimit.remaining}/${rateLimit.limit} remaining`);
    console.log(`   Resets at: ${rateLimit.reset.toLocaleString()}`);

    // Test 2: Search by keywords
    console.log('\n🔍 TEST 2: Keyword Search');
    console.log('─'.repeat(60));
    const keywords = ['autonomous development', 'code generation', 'AI agents'];
    const searchResults = await scanner.searchByKeywords(keywords, 50);
    
    console.log(`\n📋 Found ${searchResults.length} repositories:\n`);
    searchResults.slice(0, 5).forEach((discovery, i) => {
      console.log(`${i + 1}. ${discovery.title}`);
      console.log(`   ⭐ ${discovery.stars} stars | 🔗 ${discovery.url}`);
      console.log(`   📝 ${discovery.description?.substring(0, 80)}...`);
      console.log('');
    });

    // Test 3: Scan trending
    console.log('\n📊 TEST 3: Trending Repositories');
    console.log('─'.repeat(60));
    const trendingResults = await scanner.scanTrending({
      languages: ['typescript', 'python'],
    });
    
    console.log(`\n📋 Found ${trendingResults.length} trending repositories:\n`);
    trendingResults.slice(0, 3).forEach((discovery, i) => {
      console.log(`${i + 1}. ${discovery.title}`);
      console.log(`   ⭐ ${discovery.stars} stars | 🔗 ${discovery.url}`);
      console.log('');
    });

    console.log('='.repeat(60));
    console.log('✅ GitHub Scanner tests complete!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testGitHubScanner();
