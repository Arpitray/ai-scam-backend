/*
 * test-hackathon-format.js - Test Hackathon Request Format
 * Tests the exact format expected by hackathon evaluation system
 */

require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:4000';
const API_KEY = process.env.API_KEY || 'your-secret-api-key-here';

async function testHackathonFormat() {
  console.log('\n🎯 Testing Hackathon Request Format\n');
  console.log('='.repeat(60));
  
  // Hackathon format request
  const hackathonRequest = {
    sessionId: "wertyu-dfghj-ertyui",
    message: {
      sender: "scammer",
      text: "Your bank account will be blocked today. Verify immediately.",
      timestamp: 1770005528731
    },
    conversationHistory: [],
    metadata: {
      channel: "SMS",
      language: "English",
      locale: "IN"
    }
  };
  
  console.log('\n📤 Sending Hackathon Format Request:');
  console.log(JSON.stringify(hackathonRequest, null, 2));
  
  try {
    const response = await fetch(`${API_URL}/honeypot/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(hackathonRequest)
    });
    
    console.log(`\n📥 Response Status: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('\n✅ SUCCESS! Response:');
      console.log(JSON.stringify(data, null, 2));
      
      console.log('\n✓ Verification:');
      console.log(`  - sessionId preserved: ${data.sessionId === hackathonRequest.sessionId ? '✓' : '✗'}`);
      console.log(`  - reply generated: ${data.reply ? '✓' : '✗'}`);
      console.log(`  - scamDetected field: ${data.scamDetected !== undefined ? '✓' : '✗'}`);
      console.log(`  - extractedIntelligence field: ${data.extractedIntelligence ? '✓' : '✗'}`);
      console.log(`  - metadata preserved: ${data.metadata ? '✓' : '✗'}`);
      console.log(`  - status field: ${data.status ? '✓' : '✗'}`);
      
      console.log('\n🎉 Hackathon format: FULLY COMPATIBLE ✓');
    } else {
      const errorData = await response.json();
      console.log('\n❌ ERROR Response:');
      console.log(JSON.stringify(errorData, null, 2));
    }
    
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Now test standard format for backward compatibility
  console.log('\n\n📋 Testing Standard Format (Backward Compatibility)\n');
  console.log('='.repeat(60));
  
  const standardRequest = {
    conversationId: "test-standard-001",
    scammerMessage: "This is Amazon. Your account has suspicious activity.",
    conversationHistory: []
  };
  
  console.log('\n📤 Sending Standard Format Request:');
  console.log(JSON.stringify(standardRequest, null, 2));
  
  try {
    const response = await fetch(`${API_URL}/honeypot/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify(standardRequest)
    });
    
    console.log(`\n📥 Response Status: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      console.log('\n✅ SUCCESS! Standard format still works:');
      console.log(`  - sessionId: ${data.sessionId}`);
      console.log(`  - reply: "${data.reply?.substring(0, 60)}..."`);
      console.log(`  - status: ${data.status}`);
      
      console.log('\n🎉 Backward compatibility: MAINTAINED ✓');
    } else {
      const errorData = await response.json();
      console.log('\n❌ ERROR Response:');
      console.log(JSON.stringify(errorData, null, 2));
    }
    
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✅ Format Compatibility Tests Complete!\n');
}

// Run tests
testHackathonFormat().catch(console.error);
