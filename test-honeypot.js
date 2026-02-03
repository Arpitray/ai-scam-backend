/*
 * test-honeypot.js - API Test Suite
 * Tests all endpoints of the honeypot system
 */


const http = require('http');


// Server config
const HOST = 'localhost';
const PORT = 4000;


// Test conversation ID
let testConversationId = 'test-' + Date.now();


// Simple HTTP request helper
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}


async function runTests() {
  console.log('\n============================================');
  console.log('   AI HONEYPOT SYSTEM - API TEST SUITE');
  console.log('============================================\n');

  let passed = 0;
  let failed = 0;


  // Test 1: Health Check
  console.log('[TEST 1] Health Check (/health)');
  try {
    const res = await makeRequest('GET', '/health');
    if (res.status === 200 && res.data.status === 'healthy') {
      console.log('  ✓ PASSED - Server is healthy\n');
      passed++;
    } else {
      console.log('  ✗ FAILED - Bad response\n');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ FAILED - ' + err.message + '\n');
    failed++;
  }


  // Test 2: Config Endpoint
  console.log('[TEST 2] Config Check (/config)');
  try {
    const res = await makeRequest('GET', '/config');
    if (res.status === 200 && res.data.provider) {
      console.log('  ✓ PASSED - Provider: ' + res.data.provider + '\n');
      passed++;
    } else {
      console.log('  ✗ FAILED - No provider config\n');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ FAILED - ' + err.message + '\n');
    failed++;
  }


  // Test 3: Scam Analysis
  console.log('[TEST 3] Scam Analysis (/analyze)');
  try {
    const res = await makeRequest('POST', '/analyze', {
      message: 'Your Amazon account has been suspended! Click here to verify: http://amaz0n-verify.com'
    });
    if (res.status === 200 && res.data.isScam !== undefined) {
      console.log('  ✓ PASSED - isScam: ' + res.data.isScam);
      console.log('  Confidence: ' + (res.data.confidence || res.data.scamConfidence) + '%\n');
      passed++;
    } else {
      console.log('  ✗ FAILED - Invalid response\n');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ FAILED - ' + err.message + '\n');
    failed++;
  }


  // Test 4: Honeypot Response (first message)
  console.log('[TEST 4] Honeypot Response - Initial (/honeypot/respond)');
  try {
    const res = await makeRequest('POST', '/honeypot/respond', {
      conversationId: testConversationId,
      scammerMessage: 'Hello! We noticed suspicious activity on your bank account. Please verify your identity.'
    });
    if (res.status === 200 && res.data.response) {
      console.log('  ✓ PASSED - Got honeypot reply');
      console.log('  Reply: "' + res.data.response.substring(0, 60) + '..."\n');
      passed++;
    } else {
      console.log('  ✗ FAILED - No response generated\n');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ FAILED - ' + err.message + '\n');
    failed++;
  }


  // Test 5: Continue Conversation
  console.log('[TEST 5] Honeypot Response - Continue Conversation');
  try {
    const res = await makeRequest('POST', '/honeypot/respond', {
      conversationId: testConversationId,
      scammerMessage: 'Please send me your OTP code that was sent to your phone.'
    });
    if (res.status === 200 && res.data.response) {
      console.log('  ✓ PASSED - Conversation continued');
      console.log('  Message #' + (res.data.conversationLength || '?'));
      console.log('  Completeness: ' + (res.data.extractionProgress?.completeness || '?') + '%\n');
      passed++;
    } else {
      console.log('  ✗ FAILED - Bad response\n');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ FAILED - ' + err.message + '\n');
    failed++;
  }


  // Test 6: Check Tracker Status
  console.log('[TEST 6] Tracker Status (/tracker/:id)');
  try {
    const res = await makeRequest('GET', '/tracker/' + testConversationId);
    if (res.status === 200 && res.data.extractedData) {
      console.log('  ✓ PASSED - Tracker data retrieved');
      console.log('  Scam Types: ' + (res.data.extractedData.scamType?.join(', ') || 'none') + '\n');
      passed++;
    } else {
      console.log('  ✗ FAILED - No tracker data\n');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ FAILED - ' + err.message + '\n');
    failed++;
  }


  // Test 7: Get Conversation History
  console.log('[TEST 7] Conversation History (/conversation/:id)');
  try {
    const res = await makeRequest('GET', '/conversation/' + testConversationId);
    if (res.status === 200 && res.data.history) {
      console.log('  ✓ PASSED - History retrieved');
      console.log('  Messages: ' + res.data.history.length + '\n');
      passed++;
    } else {
      console.log('  ✗ FAILED - No history\n');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ FAILED - ' + err.message + '\n');
    failed++;
  }


  // Test 8: Mock Scammer (full conversation)
  console.log('[TEST 8] Mock Scammer (/mock-scammer)');
  try {
    const res = await makeRequest('POST', '/mock-scammer', {
      rounds: 3
    });
    if (res.status === 200 && res.data.conversation) {
      console.log('  ✓ PASSED - Mock conversation generated');
      console.log('  Rounds: ' + res.data.conversation.length + '\n');
      passed++;
    } else {
      console.log('  ✗ FAILED - No conversation\n');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ FAILED - ' + err.message + '\n');
    failed++;
  }


  // Test 9: Analyze Full Conversation
  console.log('[TEST 9] Conversation Analysis (/analyze-conversation)');
  try {
    const res = await makeRequest('POST', '/analyze-conversation', {
      conversation: [
        { role: 'scammer', content: 'Your account has been compromised!' },
        { role: 'victim', content: 'Oh no! What should I do?' },
        { role: 'scammer', content: 'Send me your OTP to verify your identity' }
      ]
    });
    if (res.status === 200) {
      console.log('  ✓ PASSED - Analysis complete');
      console.log('  Scam Types: ' + (res.data.scamTypes?.join(', ') || 'none') + '\n');
      passed++;
    } else {
      console.log('  ✗ FAILED - Bad response\n');
      failed++;
    }
  } catch (err) {
    console.log('  ✗ FAILED - ' + err.message + '\n');
    failed++;
  }


  // Results
  console.log('============================================');
  console.log('   TEST RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  console.log('============================================\n');

  return failed === 0;
}


// Run tests
runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test runner failed:', err);
    process.exit(1);
  });
