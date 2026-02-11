import { AutonomousResponseOrchestrator } from './src/integrations/AutonomousResponseOrchestrator.js';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://rda_user:rda_secure_password_2026@localhost:5432/rda_intelligence'
});

async function processExistingThreats() {
  console.log('🔥 PROCESSING EXISTING HIGH-PRIORITY THREATS');
  console.log('='.repeat(70));
  
  // Get all HIGH priority discoveries not yet responded to
  const result = await pool.query(`
    SELECT d.* 
    FROM discoveries d
    LEFT JOIN response_actions ra ON d.id = ra.discovery_id
    WHERE d.intelligence_level = 'HIGH' 
      AND d.threat_score >= 7.5
      AND ra.id IS NULL
    ORDER BY d.threat_score DESC, d.discovered_at DESC
    LIMIT 5
  `);
  
  console.log(`\n📊 Found ${result.rows.length} HIGH priority threats without responses\n`);
  
  if (result.rows.length === 0) {
    console.log('✅ No unprocessed threats found');
    await pool.end();
    return;
  }
  
  const orchestrator = new AutonomousResponseOrchestrator();
  
  for (const discovery of result.rows) {
    console.log('━'.repeat(70));
    console.log(`🎯 Processing: ${discovery.title}`);
    console.log(`   Threat Score: ${discovery.threat_score}/10`);
    console.log(`   Source: ${discovery.source}`);
    console.log('');
    
    try {
      await orchestrator.processDiscovery(discovery);
      console.log('   ✅ Response triggered\n');
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}\n`);
    }
    
    // Wait 5 seconds between each to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  console.log('━'.repeat(70));
  console.log('\n🎉 Batch processing complete!');
  console.log(`\n💡 Check FORGE dashboard at http://$(hostname -I | awk '{print $1}'):3003\n`);
  
  await orchestrator.close();
  await pool.end();
}

processExistingThreats().catch(console.error);
