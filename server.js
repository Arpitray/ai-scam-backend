/*
 * server.js - Main Express Server
 * Handles all API routes for the honeypot system
 */

require('dotenv').config();
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
  generateHoneypotReplyWithLLM, 
  extractIntelligenceWithLLM,
  getProviderConfig,
  getModels 
} = require('./llm-service');

const { TrackerManager, CONFIG: TRACKER_CONFIG } = require('./extraction-tracker');

app.use(express.json());
app.use(corsMiddleware);
const trackerManager = new TrackerManager();
const conversations = new Map();

// Cleanup old trackers every 15 minutes
setInterval(() => trackerManager.cleanup(), 15 * 60 * 1000);


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

// Analyze a single message for scam indicators
app.post('/analyze', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Missing required field: message' });
    }

    const result = await detectScamWithLLM(message);
    res.json({ success: true, message, ...result });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed', message: error.message });
  }
});


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
      return res.json({
        success: true,
        conversationId,
        status: 'terminated',
        message: 'This conversation has been terminated',
        terminationReason: tracker.terminationReason,
        finalReport: tracker.generateFinalReport()
      });
    }

    let history = conversationHistory || conversations.get(conversationId) || [];

    // Add scammer message
    history.push({
      sender: 'scammer',
      message: scammerMessage,
      timestamp: new Date().toISOString()
    });

    // Check if we should terminate
    const termCheck = tracker.addMessage('scammer', scammerMessage);

    if (!termCheck.shouldContinue) {
      conversations.set(conversationId, history);
      return res.json({
        success: true,
        conversationId,
        status: 'terminated',
        terminationReason: termCheck.terminationReason,
        terminationDescription: termCheck.terminationDescription,
        finalReport: termCheck.finalReport,
        conversationHistory: history
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

    res.json({
      success: true,
      conversationId,
      status: 'active',
      reply: honeypotReply,
      conversationHistory: history,
      messageCount: history.length,
      agentStatus: {
        extractionProgress: trackerState.completenessScore,
        scammerFrustration: trackerState.scammerFrustrationLevel,
        extractedScamTypes: trackerState.extractedData.scamType,
        conversationDuration: trackerState.duration,
        remainingMessages: TRACKER_CONFIG.MAX_CONVERSATION_LENGTH - trackerState.messageCount
      }
    });

  } catch (error) {
    console.error('Honeypot response error:', error);
    res.status(500).json({ error: 'Honeypot response failed', message: error.message });
  }
});


// Get mock scammer message for testing
app.post('/mock-scammer', (req, res) => {
  try {
    const { stage } = req.body;
    const scammerStage = stage !== undefined ? stage : 0;
    const scammerData = getMockScammerMessage(scammerStage);
    res.json({ success: true, stage: scammerStage, ...scammerData });
  } catch (error) {
    res.status(500).json({ error: 'Mock scammer generation failed', message: error.message });
  }
});


// Analyze entire conversation for intelligence extraction
app.post('/analyze-conversation', async (req, res) => {
  try {
    const { transcript, conversationId } = req.body;

    let conversationData = transcript;

    if (conversationId && !transcript) {
      conversationData = conversations.get(conversationId);
      if (!conversationData) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    }

    if (!conversationData || conversationData.length === 0) {
      return res.status(400).json({ error: 'Missing required field: transcript or conversationId' });
    }

    const analysis = await extractIntelligenceWithLLM(conversationData);

    let trackerData = null;
    if (conversationId) {
      trackerData = trackerManager.getTracker(conversationId).getState();
    }

    res.json({ success: true, messageCount: conversationData.length, analysis, trackerData });

  } catch (error) {
    console.error('Conversation analysis error:', error);
    res.status(500).json({ error: 'Conversation analysis failed', message: error.message });
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
  const result = tracker.terminate(reason || 'MANUAL_TERMINATION', 'Conversation manually terminated by user');
  res.json({ success: true, conversationId: id, ...result });
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
  console.log(`✅ Completeness threshold: ${TRACKER_CONFIG.COMPLETENESS_THRESHOLD}%\n`);
});
