require('dotenv').config();

const { AlertOrchestrator } = require('./dist/notifiers/AlertOrchestrator');

async function testAlerts() {
  console.log('🧪 TESTING RDA ALERT SYSTEM\n');
  console.log('='.repeat(60));

  const alerts = new AlertOrchestrator();

  // Test all channels
  await alerts.testAllChannels();

  console.log('\n' + '='.repeat(60));
  console.log('✅ Alert system test complete!');
  console.log('='.repeat(60));

  await alerts.close();
}

testAlerts().catch(console.error);
