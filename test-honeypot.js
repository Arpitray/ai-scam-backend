// test-honeypot.js
// Comprehensive test script for the scam detection honeypot server

const baseUrl = 'http://localhost:3000';

// Helper function to make API calls
async function apiCall(endpoint, method = 'POST', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  const response = await fetch(`${baseUrl}${endpoint}`, options);
  return response.json();
}

// Test functions
async function testScamDetection() {
  console.log('\n=== Testing Scam Detection ===\n');
  
  const testMessages = [
    "Hello! How are you?",
    "URGENT! Your account will be suspended. Click here immediately!",
    "We've sent you a verification code. Please share the 6-digit OTP.",
    "Congratulations! You've won a $1000 prize. Click this link to claim."
  ];
  
  for (const message of testMessages) {
    const result = await apiCall('/analyze', 'POST', { message });
    console.log(`Message: "${message}"`);
    console.log(`Scam Probability: ${result.probability}`);
    console.log(`Scam Types: ${result.scamTypes.join(', ') || 'None'}`);
    console.log(`Is Scam: ${result.isScam}\n`);
  }
}

async function testHoneypotConversation() {
  console.log('\n=== Testing Honeypot Conversation ===\n');
  
  const conversationId = 'test-conv-' + Date.now();
  
  // Simulate a multi-stage scam conversation
  const stages = [0, 1, 2, 3];
  
  for (const stage of stages) {
    // Get mock scammer message
    const scammerData = await apiCall('/mock-scammer', 'POST', { stage });
    console.log(`\n[Stage ${stage}: ${scammerData.stage}]`);
    console.log(`Scammer: ${scammerData.message}`);
    
    // Get honeypot response
    const honeypotResponse = await apiCall('/honeypot/respond', 'POST', {
      conversationId,
      scammerMessage: scammerData.message
    });
    
    console.log(`Honeypot: ${honeypotResponse.reply}`);
    console.log(`Total messages: ${honeypotResponse.messageCount}`);
  }
  
  return conversationId;
}

async function testConversationAnalysis(conversationId) {
  console.log('\n=== Testing Conversation Analysis ===\n');
  
  const analysis = await apiCall('/analyze-conversation', 'POST', { conversationId });
  
  console.log(`Messages analyzed: ${analysis.messageCount}`);
  console.log('\nAnalysis Results:');
  console.log(`Scam Types: ${analysis.analysis.scamType.join(', ')}`);
  console.log(`Requested Data: ${analysis.analysis.requestedData.join(', ')}`);
  console.log(`Attack Methods: ${analysis.analysis.attackMethod.join(', ')}`);
  console.log(`Psychological Techniques: ${analysis.analysis.psychologicalTechniques.join(', ')}`);
}

async function testConversationRetrieval(conversationId) {
  console.log('\n=== Testing Conversation Retrieval ===\n');
  
  const conversation = await apiCall(`/conversation/${conversationId}`, 'GET');
  
  console.log(`Conversation ID: ${conversation.conversationId}`);
  console.log(`Total messages: ${conversation.messageCount}\n`);
  
  conversation.history.slice(0, 4).forEach((msg, idx) => {
    console.log(`[${idx + 1}] ${msg.sender}: ${msg.message.substring(0, 60)}...`);
  });
}

async function testFullWorkflow() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Scam Detection Honeypot - Complete Test Suite          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  try {
    // Test 1: Scam detection
    await testScamDetection();
    
    // Test 2: Honeypot conversation
    const conversationId = await testHoneypotConversation();
    
    // Test 3: Conversation analysis
    await testConversationAnalysis(conversationId);
    
    // Test 4: Retrieve conversation
    await testConversationRetrieval(conversationId);
    
    // Test 5: Health check
    console.log('\n=== Testing Health Check ===\n');
    const health = await apiCall('/health', 'GET');
    console.log(`Server Status: ${health.status}`);
    console.log(`Active Conversations: ${health.activeConversations}`);
    
    console.log('\n✅ All tests completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

// Run tests
testFullWorkflow();
