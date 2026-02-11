require('dotenv').config();
const { RDACore } = require('./dist/core/RDACore');

async function testFullScan() {
  const rda = new RDACore();
  
  try {
    await rda.performFullScan();
  } catch (error) {
    console.error('Scan failed:', error);
  } finally {
    await rda.close();
  }
}

testFullScan();
