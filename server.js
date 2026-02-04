/*
 * server.js - Main Express Server
 * Handles all API routes for the honeypot system
 */

// Clear any existing env vars that might interfere
delete process.env.OPENAI_API_KEY;
delete process.env.OPENROUTER_API_KEY;

require('dotenv').config({ override: true });
const express = require('express');
const app = express();

// CORS middleware allowing frontend at localhost:3000
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
function corsMiddleware(req, res, next) {
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
}

const { 
  detectScamWithLLM, 
  shouldTerminateWithLLM,
  generateHoneypotReplyWithLLM, 
  extractIntelligenceWithLLM,
  extractDataWithLLM,
  getProviderConfig,
  getModels 
} = require('./llm-service');

const { TrackerManager, CONFIG: TRACKER_CONFIG, getSendoffMessage } = require('./extraction-tracker');

app.use(express.json());
app.use(corsMiddleware);
const trackerManager = new TrackerManager();
const conversations = new Map();

// Cleanup old trackers every 15 minutes
setInterval(() => trackerManager.cleanup(), 15 * 60 * 1000);


// Send extracted intelligence to a webhook (configurable via EXTRACTED_INTEL_WEBHOOK)
const { URL } = require('url');
const http = require('http');
const https = require('https');

// In-memory store for extracted intelligence received via webhook
const extractedIntelligenceStore = [];

function sendExtractedIntelligence(payload) {
  // Always store locally so that the immediate dashboard view works without relying on a self-webhook
  try {
    const localPayload = { ...payload, _receivedAt: new Date().toISOString() };
    extractedIntelligenceStore.push(localPayload);
  } catch (err) {
    console.error('Error storing intelligence locally:', err);
  }

  // Send to external webhook (Default: Hackathon Endpoint)
  const webhook = process.env.EXTRACTED_INTEL_WEBHOOK || 'https://hackathon.guvi.in/api/updateHoneyPotFinalResult';

  try {
    const urlObj = new URL(webhook);
    const data = JSON.stringify(payload);
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(opts, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        console.log(`🔔 Webhook response from ${urlObj.hostname}: ${res.statusCode}`);
      });
    });

    req.on('error', (err) => {
      console.error('Failed to send extracted intelligence webhook:', err.message);
    });

    req.write(data);
    req.end();
    console.log('🔔 Extracted intelligence webhook sent to', webhook);
  } catch (err) {
    console.error('Could not send extracted intelligence webhook:', err.message);
  }
}

// Internal receiver endpoint (can be overridden by setting EXTRACTED_INTEL_WEBHOOK to an external URL)
app.post('/receive-extracted-intelligence', (req, res) => {
  try {
    const payload = req.body || {};
    payload._receivedAt = new Date().toISOString();
    extractedIntelligenceStore.push(payload);
    console.log('📥 Received extracted intelligence for session', payload.sessionId || '(unknown)');
    // Acknowledge receipt and return stored count
    res.json({ success: true, received: true, stored: extractedIntelligenceStore.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET stored extracted intelligence. Optional query: ?sessionId=abc123
app.get('/receive-extracted-intelligence', (req, res) => {
  try {
    const { sessionId } = req.query;
    if (sessionId) {
      const item = extractedIntelligenceStore.filter(p => p.sessionId === sessionId);
      return res.json({ success: true, count: item.length, items: item });
    }
    res.json({ success: true, count: extractedIntelligenceStore.length, items: extractedIntelligenceStore });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// Mock scammer messages for testing purposes
function getMockScammerMessage(stage) {
  const scamSequence = [
    {
      message: "Hello! This is Sarah from Amazon Customer Service. We've detected suspicious activity on your account.",
      stage: 'INITIAL_CONTACT',
      technique: 'IMPERSONATION'
    },
    {
      message: "Your account will be suspended in the next 2 hours if we don't verify your identity. This is urgent!",
      stage: 'URGENCY_CREATION',
      technique: 'FEAR_INDUCEMENT'
    },
    {
      message: "We've sent a verification code to your phone. Please share that 6-digit code so we can confirm it's really you.",
      stage: 'OTP_REQUEST',
      technique: 'CREDENTIAL_THEFT'
    },
    {
      message: "Sir/Ma'am, I need that code immediately or your account will be permanently locked and you'll lose access to all your orders!",
      stage: 'PRESSURE_INCREASE',
      technique: 'LOSS_AVERSION'
    },
    {
      message: "If you can't find the code, please click this link to verify: http://amaz0n-verify.suspicious.com/account",
      stage: 'PHISHING_LINK',
      technique: 'PHISHING'
    },
    {
      message: "This is your last chance! Click the link NOW or we will close your account. You have 5 minutes!",
      stage: 'FINAL_PRESSURE',
      technique: 'ULTIMATUM'
    },
    {
      message: "Are you still there? I'm waiting for the code. Please hurry!",
      stage: 'PERSISTENCE',
      technique: 'PRESSURE'
    }
  ];

  if (stage >= scamSequence.length) {
    const loopIndex = 3 + (stage % 3);
    return scamSequence[Math.min(loopIndex, scamSequence.length - 1)];
  }

  return scamSequence[stage];
}


/* ==================== API ROUTES ==================== */

// Main honeypot endpoint - receives scammer message, returns honeypot reply
app.post('/honeypot/respond', async (req, res) => {
  try {
    const { conversationId, scammerMessage, conversationHistory } = req.body;

    if (!conversationId || !scammerMessage) {
      return res.status(400).json({ error: 'Missing required fields: conversationId and scammerMessage' });
    }

    const tracker = trackerManager.getTracker(conversationId);

    // Return final report if conversation already ended
    if (tracker.status === 'completed') {
      const extractedData = tracker.extractedData;
      const finalReport = tracker.generateFinalReport();
      
      // Build payload and send extracted intelligence webhook for completed conversation
      const completedPayload = {
        sessionId: conversationId,
        scamDetected: extractedData.scamType.length > 0,
        totalMessagesExchanged: tracker.messageCount,
        extractedIntelligence: {
          bankAccounts: extractedData.bankAccounts || [],
          upiIds: extractedData.upiIds || [],
          phishingLinks: extractedData.links || [],
          phoneNumbers: extractedData.phoneNumbers || [],
          emails: extractedData.emails || [],
          suspiciousKeywords: extractedData.suspiciousKeywords || []
        },
        agentNotes: `Scam type: ${extractedData.scamType.join(', ') || 'Unknown'}. ` +
                    `Techniques: ${extractedData.psychologicalTechniques.join(', ') || 'None'}. ` +
                    `Termination: ${tracker.terminationReason}`,
        status: 'terminated',
        conversationHistory: conversations.get(conversationId) || [],
        finalReport: finalReport
      };

      setImmediate(() => sendExtractedIntelligence(completedPayload));

      return res.json({
        sessionId: conversationId,
        conversationHistory: conversations.get(conversationId) || [],
        scamDetected: extractedData.scamType.length > 0,
        totalMessagesExchanged: tracker.messageCount,
        extractedIntelligence: {
          bankAccounts: extractedData.bankAccounts || [],
          upiIds: extractedData.upiIds || [],
          phishingLinks: extractedData.links || [],
          phoneNumbers: extractedData.phoneNumbers || [],
          emails: extractedData.emails || [],
          suspiciousKeywords: extractedData.suspiciousKeywords || []
        },
        agentNotes: `Scam type: ${extractedData.scamType.join(', ') || 'Unknown'}. ` +
                    `Techniques: ${extractedData.psychologicalTechniques.join(', ') || 'None'}. ` +
                    `Termination: ${tracker.terminationReason}`,
        status: 'terminated',
        reply: 'Conversation ended',
        terminationReason: tracker.terminationReason
      });
    }

    let history = conversationHistory || conversations.get(conversationId) || [];

    // Add scammer message
    history.push({
      sender: 'scammer',
      message: scammerMessage,
      timestamp: new Date().toISOString()
    });

    // Use LLM for both scam detection AND intelligent data extraction
    const [scamAnalysis, llmExtraction] = await Promise.all([
      detectScamWithLLM(scammerMessage),
      extractDataWithLLM(scammerMessage)
    ]);
    
    console.log(`🔍 Scam Detection: ${scamAnalysis.isScam ? '⚠️ SCAM' : '✅ Safe'} (${scamAnalysis.confidence}) - Types: ${scamAnalysis.scamTypes.join(', ') || 'None'}`);

    // Merge LLM extraction with scam analysis for comprehensive result
    const combinedAnalysis = {
      ...scamAnalysis,
      llmExtraction: llmExtraction  // Pass LLM extracted data to tracker
    };

    // Check if we should terminate (pass combined LLM analysis and conversation history to tracker)
    const termCheck = await tracker.addMessage('scammer', scammerMessage, combinedAnalysis, history);

    if (!termCheck.shouldContinue) {
      // Generate a natural sendoff message so scammer doesn't suspect
      const sendoffMessage = getSendoffMessage(termCheck.terminationReason);
      
      // Add sendoff as final honeypot message
      history.push({
        sender: 'honeypot',
        message: sendoffMessage,
        timestamp: new Date().toISOString(),
        isSendoff: true
      });
      
      conversations.set(conversationId, history);
      
      const extractedData = tracker.extractedData;
      // Build payload and send extracted intelligence webhook when terminated mid-conversation
      const terminationPayload = {
        sessionId: conversationId,
        scamDetected: extractedData.scamType.length > 0,
        totalMessagesExchanged: history.length,
        extractedIntelligence: {
          bankAccounts: extractedData.bankAccounts || [],
          upiIds: extractedData.upiIds || [],
          phishingLinks: extractedData.links || [],
          phoneNumbers: extractedData.phoneNumbers || [],
          emails: extractedData.emails || [],
          suspiciousKeywords: extractedData.suspiciousKeywords || []
        },
        agentNotes: `Scam type: ${extractedData.scamType.join(', ') || 'Unknown'}. ` +
                    `Techniques: ${extractedData.psychologicalTechniques.join(', ') || 'None'}. ` +
                    `Termination: ${termCheck.terminationReason}`,
        status: 'terminated',
        terminationReason: termCheck.terminationReason,
        terminationDescription: termCheck.terminationDescription,
        finalReport: termCheck.finalReport,
        conversationHistory: history
      };

      setImmediate(() => sendExtractedIntelligence(terminationPayload));

      return res.json({
        sessionId: conversationId,
        scamDetected: extractedData.scamType.length > 0,
        totalMessagesExchanged: history.length,
        extractedIntelligence: {
          bankAccounts: extractedData.bankAccounts || [],
          upiIds: extractedData.upiIds || [],
          phishingLinks: extractedData.links || [],
          phoneNumbers: extractedData.phoneNumbers || [],
          emails: extractedData.emails || [],
          suspiciousKeywords: extractedData.suspiciousKeywords || []
        },
        agentNotes: `Scam type: ${extractedData.scamType.join(', ') || 'Unknown'}. ` +
                    `Techniques: ${extractedData.psychologicalTechniques.join(', ') || 'None'}. ` +
                    `Termination: ${termCheck.terminationReason}`,
        status: 'terminated',
        reply: sendoffMessage,
        terminationReason: termCheck.terminationReason
      });
    }

    // Generate honeypot reply
    const honeypotReply = await generateHoneypotReplyWithLLM(history, scammerMessage, tracker.extractedData);

    history.push({
      sender: 'honeypot',
      message: honeypotReply,
      timestamp: new Date().toISOString()
    });

    tracker.addMessage('honeypot', honeypotReply);
    conversations.set(conversationId, history);

    const trackerState = tracker.getState();
    const extractedData = trackerState.extractedData;

    res.json({
      sessionId: conversationId,
      scamDetected: extractedData.scamType.length > 0,
      totalMessagesExchanged: history.length,
      extractedIntelligence: {
        bankAccounts: extractedData.bankAccounts || [],
        upiIds: extractedData.upiIds || [],
        phishingLinks: extractedData.links || [],
        phoneNumbers: extractedData.phoneNumbers || [],
        emails: extractedData.emails || [],
        suspiciousKeywords: extractedData.suspiciousKeywords || []
      },
      conversationHistory: history,
      agentNotes: `Scam type: ${extractedData.scamType.join(', ') || 'Unknown'}. ` +
                  `Techniques: ${extractedData.psychologicalTechniques.join(', ') || 'None'}. ` +
                  `Completeness: ${trackerState.completenessScore}%`,
      status: 'active',
      reply: honeypotReply
    });

  } catch (error) {
    console.error('Honeypot response error:', error);
    res.status(500).json({ error: 'Honeypot response failed', message: error.message });
  }
});


// Get conversation history
app.get('/conversation/:id', (req, res) => {
  const { id } = req.params;
  const history = conversations.get(id);

  if (!history) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const trackerState = trackerManager.getTracker(id).getState();
  res.json({ success: true, conversationId: id, history, messageCount: history.length, trackerState });
});


// Delete conversation
app.delete('/conversation/:id', (req, res) => {
  const { id } = req.params;
  const existed = conversations.delete(id);
  trackerManager.removeTracker(id);
  res.json({ success: true, deleted: existed });
});


// Get tracker state for a conversation
app.get('/tracker/:id', (req, res) => {
  const { id } = req.params;
  
  if (!conversations.has(id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const tracker = trackerManager.getTracker(id);
  res.json({ success: true, conversationId: id, ...tracker.getState(), config: TRACKER_CONFIG });
});


// Manually terminate a conversation
app.post('/tracker/:id/terminate', (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!conversations.has(id)) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const tracker = trackerManager.getTracker(id);
  const terminationReason = reason || 'MANUAL_TERMINATION';
  const result = tracker.terminate(terminationReason, 'Conversation manually terminated by user');
  
  // Add sendoff message to conversation history
  const sendoffMessage = getSendoffMessage(terminationReason);
  const history = conversations.get(id) || [];
  history.push({
    sender: 'honeypot',
    message: sendoffMessage,
    timestamp: new Date().toISOString(),
    isSendoff: true
  });
  conversations.set(id, history);
  
  res.json({ 
    success: true, 
    conversationId: id, 
    sendoffMessage: sendoffMessage,
    ...result 
  });
});


// List all active conversations
app.get('/active-conversations', (req, res) => {
  const active = trackerManager.getActiveConversations();
  res.json({ success: true, count: active.length, conversations: active });
});


// List completed conversations with final reports
app.get('/completed-conversations', (req, res) => {
  const completed = trackerManager.getCompletedConversations();
  res.json({ success: true, count: completed.length, conversations: completed });
});


// Health check
app.get('/health', (req, res) => {
  const { provider, config } = getProviderConfig();
  const models = getModels();
  
  let hasApiKey = false;
  switch (provider) {
    case 'openrouter': hasApiKey = !!process.env.OPENROUTER_API_KEY; break;
    case 'groq': hasApiKey = !!process.env.GROQ_API_KEY; break;
    case 'together': hasApiKey = !!process.env.TOGETHER_API_KEY; break;
    case 'custom': hasApiKey = !!process.env.LLM_API_KEY; break;
    default: hasApiKey = !!process.env.OPENAI_API_KEY;
  }
  
  res.json({
    status: 'ok',
    activeConversations: conversations.size,
    llm: {
      configured: hasApiKey,
      provider: config.name,
      mode: hasApiKey ? 'llm' : 'fallback',
      models: { fast: models.fast, powerful: models.powerful }
    },
    trackerConfig: {
      maxMessages: TRACKER_CONFIG.MAX_CONVERSATION_LENGTH,
      completenessThreshold: TRACKER_CONFIG.COMPLETENESS_THRESHOLD,
      maxDurationMinutes: TRACKER_CONFIG.MAX_CONVERSATION_DURATION / 60000
    }
  });
});


// System configuration
app.get('/config', (req, res) => {
  const { provider, config } = getProviderConfig();
  const models = getModels();
  
  res.json({
    success: true,
    tracker: TRACKER_CONFIG,
    llm: {
      provider,
      providerName: config.name,
      baseURL: config.baseURL,
      models,
      configured: !!(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || 
                     process.env.GROQ_API_KEY || process.env.TOGETHER_API_KEY || process.env.LLM_API_KEY)
    },
    availableProviders: ['openai', 'openrouter', 'groq', 'together', 'custom']
  });
});


// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    availableEndpoints: [
      'POST /analyze',
      'POST /honeypot/respond',
      'POST /mock-scammer',
      'POST /analyze-conversation',
      'GET /conversation/:id',
      'DELETE /conversation/:id',
      'GET /tracker/:id',
      'POST /tracker/:id/terminate',
      'GET /active-conversations',
      'GET /completed-conversations',
      'GET /receive-extracted-intelligence',
      'GET /health',
      'GET /config'
    ]
  });
});


// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  const { config } = getProviderConfig();
  const models = getModels();
  
  console.log(`\n🍯 Honeypot Server running on port ${PORT}`);
  console.log(`📊 LLM: ${config.name} (${models.fast} / ${models.powerful})`);
  console.log(`⚙️  Max messages: ${TRACKER_CONFIG.MAX_CONVERSATION_LENGTH}`);
  console.log(`✅ Completeness threshold: ${TRACKER_CONFIG.BASE_COMPLETENESS_THRESHOLD}% (dynamic: 65-85%)\n`);
});
