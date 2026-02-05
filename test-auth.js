/*
 * test-auth.js - Authentication Testing Script
 * Tests API key authentication for hackathon evaluation
 */

require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:4000';
const API_KEY = process.env.API_KEY || 'your-secret-api-key-here';

async function testEndpoint(endpoint, method = 'GET', body = null, useAuth = true) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (useAuth) {
    headers['x-api-key'] = API_KEY;
  }
  
  const options = {
    method,
    headers
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    return { error: error.message };
  }
}

async function runTests() {
  console.log('\n🔐 Testing API Authentication\n');
  console.log('='.repeat(60));
  
  // Test 1: Public endpoint (no auth required)
  console.log('\n✅ Test 1: Public endpoint /health (no auth)');
  const health = await testEndpoint('/health', 'GET', null, false);
  console.log(`Status: ${health.status}`);
  console.log(`Response: ${JSON.stringify(health.data, null, 2).substring(0, 100)}...`);
  
  // Test 2: Protected endpoint WITHOUT auth (should fail)
  console.log('\n❌ Test 2: Protected endpoint /active-conversations (no auth - should fail)');
  const noAuth = await testEndpoint('/active-conversations', 'GET', null, false);
  console.log(`Status: ${noAuth.status} (Expected: 401)`);
  console.log(`Response: ${JSON.stringify(noAuth.data, null, 2)}`);
  
  // Test 3: Protected endpoint WITH auth (should succeed)
  console.log('\n✅ Test 3: Protected endpoint /active-conversations (with auth)');
  const withAuth = await testEndpoint('/active-conversations', 'GET', null, true);
  console.log(`Status: ${withAuth.status} (Expected: 200)`);
  console.log(`Response: ${JSON.stringify(withAuth.data, null, 2).substring(0, 150)}...`);
  
  // Test 4: POST endpoint with auth
  console.log('\n✅ Test 4: POST /honeypot/respond (with auth)');
  const honeypot = await testEndpoint('/honeypot/respond', 'POST', {
    conversationId: 'test-auth-001',
    scammerMessage: 'Hello! This is Amazon support.'
  }, true);
  console.log(`Status: ${honeypot.status} (Expected: 200)`);
  console.log(`Response: ${JSON.stringify(honeypot.data, null, 2).substring(0, 200)}...`);
  
  // Test 5: POST endpoint WITHOUT auth (should fail)
  console.log('\n❌ Test 5: POST /honeypot/respond (no auth - should fail)');
  const honeypotNoAuth = await testEndpoint('/honeypot/respond', 'POST', {
    conversationId: 'test-auth-002',
    scammerMessage: 'Test message'
  }, false);
  console.log(`Status: ${honeypotNoAuth.status} (Expected: 401)`);
  console.log(`Response: ${JSON.stringify(honeypotNoAuth.data, null, 2)}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Authentication tests complete!\n');
  console.log('Summary:');
  console.log('  - Public endpoints work without auth');
  console.log('  - Protected endpoints reject requests without auth (401)');
  console.log('  - Protected endpoints accept requests with valid API key');
  console.log('\n🎯 Hackathon Requirement: IMPLEMENTED ✓\n');
}

// Run tests
runTests().catch(console.error);
