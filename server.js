const express = require('express');
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

// In-memory conversation storage (key: conversation_id, value: messages array)
const conversations = new Map();

// ============================================================================
// AI FUNCTIONS
// ============================================================================

/**
 * Detects if a message is a scam using AI analysis
 * @param {string} message - The message to analyze
 * @returns {Object} - Scam probability and types
 */
async function detectScam(message) {
  // Simulated AI detection logic
  // In production, this would call an actual AI model
  
  const lowerMessage = message.toLowerCase();
  let probability = 0;
  const scamTypes = [];
  
  // Check for common scam patterns
  if (lowerMessage.includes('otp') || lowerMessage.includes('verification code')) {
    probability += 0.3;
    scamTypes.push('OTP_THEFT');
  }
  
  if (lowerMessage.includes('urgent') || lowerMessage.includes('immediately') || lowerMessage.includes('asap')) {
    probability += 0.2;
    scamTypes.push('URGENCY_MANIPULATION');
  }
  
  if (lowerMessage.match(/click|link|http|www\./)) {
    probability += 0.25;
    scamTypes.push('PHISHING_LINK');
  }
  
  if (lowerMessage.includes('bank') || lowerMessage.includes('account') || lowerMessage.includes('card')) {
    probability += 0.15;
    scamTypes.push('FINANCIAL_FRAUD');
  }
  
  if (lowerMessage.includes('prize') || lowerMessage.includes('won') || lowerMessage.includes('lottery')) {
    probability += 0.3;
    scamTypes.push('PRIZE_SCAM');
  }
  
  if (lowerMessage.includes('tax') || lowerMessage.includes('irs') || lowerMessage.includes('government')) {
    probability += 0.25;
    scamTypes.push('IMPERSONATION');
  }

  if (lowerMessage.match(/\d{6}/)) {
    probability += 0.1;
    scamTypes.push('OTP_REQUEST');
  }
  
  // Cap probability at 1.0
  probability = Math.min(probability, 1.0);
  
  return {
    probability: parseFloat(probability.toFixed(2)),
    scamTypes: [...new Set(scamTypes)], // Remove duplicates
    isScam: probability > 0.5
  };
}

/**
 * Generates a honeypot reply using AI
 * @param {Array} conversationHistory - Array of previous messages
 * @param {string} scammerMessage - Latest message from scammer
 * @returns {string} - AI-generated honeypot reply
 */
async function generateHoneypotReply(conversationHistory, scammerMessage) {
  // Simulated AI reply generation
  // In production, this would call an actual AI model with a prompt
  
  const messageCount = conversationHistory.length;
  const lowerMessage = scammerMessage.toLowerCase();
  
  // Early stage - appear curious and willing
  if (messageCount < 3) {
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "Hello! Who is this?";
    }
    return "I'm not sure I understand. Can you explain more?";
  }
  
  // Mid stage - show interest but ask questions
  if (messageCount < 6) {
    if (lowerMessage.includes('otp') || lowerMessage.includes('code')) {
      return "Oh, I got a code but I'm not sure what it's for. Is this legitimate?";
    }
    if (lowerMessage.includes('link') || lowerMessage.includes('click')) {
      return "I'm a bit confused. Can you tell me more about why I need to click this?";
    }
    return "That sounds interesting. How does this work exactly?";
  }
  
  // Later stage - delay tactics
  if (lowerMessage.includes('urgent') || lowerMessage.includes('immediately')) {
    return "I want to help but I'm at work right now. Can this wait an hour?";
  }
  
  if (lowerMessage.includes('otp') || lowerMessage.includes('code')) {
    return "I see the code, it's 6 digits right? Let me just verify this is safe first.";
  }
  
  // Default responses to keep conversation going
  const delayResponses = [
    "Let me think about this for a moment.",
    "I'm checking my account now, give me a second.",
    "Can you verify who you are first? I want to be sure.",
    "My phone is acting slow, bear with me.",
    "I need to talk to my son about this first."
  ];
  
  return delayResponses[messageCount % delayResponses.length];
}

// ============================================================================
// MOCK SCAMMER SIMULATION
// ============================================================================

/**
 * Simulates scammer messages based on conversation stage
 * @param {number} stage - Current conversation stage (0-based)
 * @returns {Object} - Scammer message and metadata
 */
function getMockScammerMessage(stage) {
  const scamSequence = [
    // Stage 0: Initial contact
    {
      message: "Hello! This is Sarah from Amazon Customer Service. We've detected suspicious activity on your account.",
      stage: 'INITIAL_CONTACT',
      technique: 'IMPERSONATION'
    },
    // Stage 1: Create urgency
    {
      message: "Your account will be suspended in the next 2 hours if we don't verify your identity. This is urgent!",
      stage: 'URGENCY_CREATION',
      technique: 'FEAR_INDUCEMENT'
    },
    // Stage 2: Request action
    {
      message: "We've sent a verification code to your phone. Please share that 6-digit code so we can confirm it's really you.",
      stage: 'OTP_REQUEST',
      technique: 'CREDENTIAL_THEFT'
    },
    // Stage 3: Increase pressure
    {
      message: "Sir/Ma'am, I need that code immediately or your account will be permanently locked and you'll lose access to all your orders!",
      stage: 'PRESSURE_INCREASE',
      technique: 'LOSS_AVERSION'
    },
    // Stage 4: Alternative attack
    {
      message: "If you can't find the code, please click this link to verify: http://amaz0n-verify.suspicious.com/account",
      stage: 'PHISHING_LINK',
      technique: 'PHISHING'
    },
    // Stage 5: Final pressure
    {
      message: "This is your last chance! Click the link NOW or we will close your account. You have 5 minutes!",
      stage: 'FINAL_PRESSURE',
      technique: 'ULTIMATUM'
    },
    // Stage 6: Repetition
    {
      message: "Are you still there? I'm waiting for the code. Please hurry!",
      stage: 'PERSISTENCE',
      technique: 'PRESSURE'
    }
  ];
  
  // Loop back to pressure tactics if beyond defined stages
  if (stage >= scamSequence.length) {
    const loopIndex = 3 + (stage % 3);
    return scamSequence[Math.min(loopIndex, scamSequence.length - 1)];
  }
  
  return scamSequence[stage];
}

// ============================================================================
// CONVERSATION ANALYSIS
// ============================================================================

/**
 * Analyzes conversation transcript and extracts scam intelligence
 * @param {Array} transcript - Array of conversation messages
 * @returns {Object} - Structured analysis
 */
function analyzeConversation(transcript) {
  const analysis = {
    scamType: [],
    requestedData: [],
    attackMethod: [],
    psychologicalTechniques: []
  };
  
  // Combine all messages for analysis
  const fullConversation = transcript
    .map(msg => msg.message.toLowerCase())
    .join(' ');
  
  // Detect scam types
  if (fullConversation.includes('otp') || fullConversation.includes('verification code')) {
    analysis.scamType.push('OTP_THEFT');
    analysis.requestedData.push('OTP_CODE');
  }
  
  if (fullConversation.match(/click|link|http/)) {
    analysis.scamType.push('PHISHING');
    analysis.attackMethod.push('MALICIOUS_LINK');
  }
  
  if (fullConversation.includes('bank') || fullConversation.includes('account number') || fullConversation.includes('card')) {
    analysis.scamType.push('FINANCIAL_FRAUD');
    analysis.requestedData.push('FINANCIAL_CREDENTIALS');
  }
  
  if (fullConversation.includes('amazon') || fullConversation.includes('customer service') || fullConversation.includes('government')) {
    analysis.scamType.push('IMPERSONATION');
    analysis.attackMethod.push('BRAND_IMPERSONATION');
  }
  
  if (fullConversation.includes('prize') || fullConversation.includes('won')) {
    analysis.scamType.push('PRIZE_SCAM');
  }
  
  // Detect requested data
  if (fullConversation.match(/\d{6}|six.digit|code/)) {
    analysis.requestedData.push('OTP_CODE');
  }
  
  if (fullConversation.includes('password') || fullConversation.includes('pin')) {
    analysis.requestedData.push('PASSWORD');
  }
  
  if (fullConversation.includes('social security') || fullConversation.includes('ssn')) {
    analysis.requestedData.push('SSN');
  }
  
  // Detect attack methods
  if (fullConversation.includes('suspended') || fullConversation.includes('locked')) {
    analysis.attackMethod.push('ACCOUNT_SUSPENSION_THREAT');
  }
  
  if (fullConversation.includes('verify') || fullConversation.includes('confirm')) {
    analysis.attackMethod.push('FAKE_VERIFICATION');
  }
  
  // Detect psychological techniques
  if (fullConversation.includes('urgent') || fullConversation.includes('immediately') || fullConversation.includes('asap') || fullConversation.includes('hurry')) {
    analysis.psychologicalTechniques.push('URGENCY');
  }
  
  if (fullConversation.includes('lose') || fullConversation.includes('suspended') || fullConversation.includes('blocked')) {
    analysis.psychologicalTechniques.push('FEAR_OF_LOSS');
  }
  
  if (fullConversation.includes('last chance') || fullConversation.includes('final') || fullConversation.includes('now or never')) {
    analysis.psychologicalTechniques.push('SCARCITY');
  }
  
  if (fullConversation.includes('trust') || fullConversation.includes('official') || fullConversation.includes('legitimate')) {
    analysis.psychologicalTechniques.push('FALSE_AUTHORITY');
  }
  
  if (fullConversation.includes('help you') || fullConversation.includes('assist you')) {
    analysis.psychologicalTechniques.push('FAKE_HELPFULNESS');
  }
  
  // Remove duplicates
  analysis.scamType = [...new Set(analysis.scamType)];
  analysis.requestedData = [...new Set(analysis.requestedData)];
  analysis.attackMethod = [...new Set(analysis.attackMethod)];
  analysis.psychologicalTechniques = [...new Set(analysis.psychologicalTechniques)];
  
  return analysis;
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * POST /analyze
 * Analyzes a message for scam indicators
 */
app.post('/analyze', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        error: 'Missing required field: message'
      });
    }

    // Call AI scam detection
    const result = await detectScam(message);

    res.json({
      success: true,
      message,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

/**
 * POST /honeypot/respond
 * Maintains conversation with scammer and generates honeypot replies
 */
app.post('/honeypot/respond', async (req, res) => {
  try {
    const { conversationId, scammerMessage, conversationHistory } = req.body;

    if (!conversationId || !scammerMessage) {
      return res.status(400).json({
        error: 'Missing required fields: conversationId and scammerMessage'
      });
    }

    // Get or create conversation history
    let history = conversationHistory || conversations.get(conversationId) || [];
    
    // Add scammer message to history
    history.push({
      sender: 'scammer',
      message: scammerMessage,
      timestamp: new Date().toISOString()
    });

    // Generate honeypot reply using AI
    const honeypotReply = await generateHoneypotReply(history, scammerMessage);
    
    // Add honeypot reply to history
    history.push({
      sender: 'honeypot',
      message: honeypotReply,
      timestamp: new Date().toISOString()
    });

    // Store updated conversation
    conversations.set(conversationId, history);

    res.json({
      success: true,
      conversationId,
      reply: honeypotReply,
      conversationHistory: history,
      messageCount: history.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Honeypot response failed',
      message: error.message
    });
  }
});

/**
 * POST /mock-scammer
 * Simulates scammer messages for testing
 */
app.post('/mock-scammer', (req, res) => {
  try {
    const { stage } = req.body;
    
    const scammerStage = stage !== undefined ? stage : 0;
    const scammerData = getMockScammerMessage(scammerStage);

    res.json({
      success: true,
      stage: scammerStage,
      ...scammerData
    });
  } catch (error) {
    res.status(500).json({
      error: 'Mock scammer generation failed',
      message: error.message
    });
  }
});

/**
 * POST /analyze-conversation
 * Analyzes entire conversation transcript for scam intelligence
 */
app.post('/analyze-conversation', (req, res) => {
  try {
    const { transcript, conversationId } = req.body;

    let conversationData = transcript;
    
    // If conversationId provided, get from storage
    if (conversationId && !transcript) {
      conversationData = conversations.get(conversationId);
      if (!conversationData) {
        return res.status(404).json({
          error: 'Conversation not found'
        });
      }
    }

    if (!conversationData || conversationData.length === 0) {
      return res.status(400).json({
        error: 'Missing required field: transcript or conversationId'
      });
    }

    const analysis = analyzeConversation(conversationData);

    res.json({
      success: true,
      messageCount: conversationData.length,
      analysis
    });
  } catch (error) {
    res.status(500).json({
      error: 'Conversation analysis failed',
      message: error.message
    });
  }
});

/**
 * GET /conversation/:id
 * Retrieves conversation history
 */
app.get('/conversation/:id', (req, res) => {
  const { id } = req.params;
  const history = conversations.get(id);
  
  if (!history) {
    return res.status(404).json({
      error: 'Conversation not found'
    });
  }
  
  res.json({
    success: true,
    conversationId: id,
    history,
    messageCount: history.length
  });
});

/**
 * DELETE /conversation/:id
 * Deletes conversation history
 */
app.delete('/conversation/:id', (req, res) => {
  const { id } = req.params;
  const existed = conversations.delete(id);
  
  res.json({
    success: true,
    deleted: existed
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeConversations: conversations.size
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found'
  });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Scam detection honeypot ready`);
});
