import fetch from 'node-fetch';

async function testDirectForgeCall() {
  console.log('🧪 TESTING DIRECT FORGE API CALL');
  console.log('='.repeat(70));
  
  // Test 1: Health check
  console.log('\n1️⃣ Testing FORGE health...');
  try {
    const healthResponse = await fetch('http://localhost:3001/health');
    const health = await healthResponse.json();
    console.log('   ✅ FORGE is healthy:', health);
  } catch (error: any) {
    console.log('   ❌ FORGE health check failed:', error.message);
    return;
  }
  
  // Test 2: Create a project directly
  console.log('\n2️⃣ Creating test project via API...');
  try {
    const createResponse = await fetch('http://localhost:3001/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'direct-api-test',
        description: 'Testing direct FORGE API call',
        type: 'api',
        features: ['CRUD operations', 'Authentication']
      })
    });
    
    const result = await createResponse.json();
    console.log('   Response:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('   ✅ Project created:', result.data.projectId);
      
      // Wait and check status
      console.log('\n3️⃣ Waiting 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      console.log('\n4️⃣ Checking project status...');
      const statusResponse = await fetch(`http://localhost:3001/api/projects/${result.data.projectId}`);
      const status = await statusResponse.json();
      console.log('   Status:', status.data.status);
      console.log('   Phase:', status.data.phase);
      console.log('   Progress:', status.data.progress + '%');
    } else {
      console.log('   ❌ Failed to create project:', result.error);
    }
  } catch (error: any) {
    console.log('   ❌ API call failed:', error.message);
  }
}

testDirectForgeCall().catch(console.error);
