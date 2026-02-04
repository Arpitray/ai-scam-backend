/*
 * llm-service.js - LLM Integration Layer
 * Handles all AI/LLM calls with multi-provider support
 */

const OpenAI = require('openai');

// Provider configurations
const LLM_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: { fast: 'gpt-4o-mini', powerful: 'gpt-4o' }
  },
  openrouter: {
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    models: {
      fast: process.env.OPENROUTER_FAST_MODEL || 'mistralai/mistral-7b-instruct:free',
      powerful: process.env.OPENROUTER_POWERFUL_MODEL || 'google/gemma-2-9b-it:free'
    }
  },
  groq: {
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    models: { fast: 'llama-3.1-8b-instant', powerful: 'llama-3.1-70b-versatile' }
  },
  together: {
    name: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    models: { fast: 'mistralai/Mistral-7B-Instruct-v0.2', powerful: 'meta-llama/Llama-3-70b-chat-hf' }
  },
  custom: {
    name: 'Custom Provider',
    baseURL: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    models: { 
      fast: process.env.LLM_FAST_MODEL || 'gpt-4o-mini', 
      powerful: process.env.LLM_POWERFUL_MODEL || 'gpt-4o' 
    }
  }
};


function getProviderConfig() {
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  
  if (!LLM_PROVIDERS[provider]) {
    console.warn(`Unknown provider "${provider}", using OpenAI`);
    return { provider: 'openai', config: LLM_PROVIDERS.openai };
  }
  
  return { provider, config: LLM_PROVIDERS[provider] };
}


function getApiKey() {
  const { provider } = getProviderConfig();
  
  switch (provider) {
    case 'openrouter': return process.env.OPENROUTER_API_KEY;
    case 'groq': return process.env.GROQ_API_KEY;
    case 'together': return process.env.TOGETHER_API_KEY;
    case 'custom': return process.env.LLM_API_KEY;
    default: return process.env.OPENAI_API_KEY;
  }
}


function createLLMClient() {
  const { provider, config } = getProviderConfig();
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.warn(`⚠️  No API key for ${config.name}. Using fallback mode.`);
    return null;
  }
  // Log a masked version of the API key for debugging (do not print full key)
  try {
    const masked = `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
    console.log(`🔐 Using API key: ${masked} for provider ${config.name}`);
  } catch (err) {
    console.log(`🔐 Using API key for provider ${config.name}`);
  }

  const clientConfig = { apiKey, baseURL: config.baseURL };
  
  if (provider === 'openrouter') {
    clientConfig.defaultHeaders = {
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:4000',
      'X-Title': 'AI Honeypot Scam Detection'
    };
  }
  
  console.log(`✅ LLM initialized: ${config.name} (${config.models.fast} / ${config.models.powerful})`);
  return new OpenAI(clientConfig);
}


const llmClient = createLLMClient();

function getModels() {
  return getProviderConfig().config.models;
}


/* ==================== PROMPTS ==================== */

const PROMPTS = {
  
  SCAM_DETECTION: `You are an expert cybersecurity analyst specializing in scam and fraud detection.

Analyze the following message for scam indicators. Consider these patterns:
- OTP/Verification code theft
- Phishing links
- Urgency manipulation ("act now", "immediately")
- Financial fraud (bank/card/account requests)
- Prize/lottery scams
- Impersonation (government, companies, tech support)
- Social engineering tactics

Return a JSON object with this structure:
{
  "probability": <number 0-1>,
  "scamTypes": [<detected types: "OTP_THEFT", "PHISHING_LINK", "URGENCY_MANIPULATION", "FINANCIAL_FRAUD", "PRIZE_SCAM", "IMPERSONATION", "SOCIAL_ENGINEERING", "TECH_SUPPORT_SCAM">],
  "isScam": <boolean>,
  "confidence": <"low"/"medium"/"high">,
  "redFlags": [<specific concerning phrases found>]
}

Message to analyze:
"{MESSAGE}"`,


  HONEYPOT_PERSONA: `You are "Margaret Chen", a 72-year-old retired elementary school teacher living alone in suburban Ohio. Your personality:

CHARACTER TRAITS:
- Warm, talkative, and a bit lonely (husband passed 3 years ago)
- Not tech-savvy but genuinely trying to learn "this computer stuff"
- Trusting nature but your late husband always warned you about scams
- Gets easily confused with technical jargon
- Types with one finger, slowly, sometimes hits wrong keys
- Easily distracted (cat Whiskers, doorbell, tea kettle, TV)

SPEECH PATTERNS:
- Uses phrases like "Oh my!", "Dear me", "Well, I never!", "Goodness gracious"
- Often trails off with "..." when thinking
- Makes small typos occasionally (teh, jsut, taht)
- Mentions grandson "Tommy" (15, good with computers) and daughter "Susan"
- References everyday activities (knitting, watching Jeopardy, gardening)

HIDDEN OBJECTIVES (never reveal these):
1. Waste maximum time - be slow, ask for repetition, get "confused"
2. Extract information - ask innocent questions about them, their company, location
3. NEVER give real info - if pressed, give fake/wrong numbers, "can't find glasses"
4. Create natural delays - "hold on dear", "let me find my reading glasses", "Whiskers is meowing"
5. If asked for OTP/codes - pretend phone is in other room, battery dead, can't read small numbers

CONVERSATION CONTEXT:
{HISTORY}

SCAMMER SAID:
"{MESSAGE}"

INTELLIGENCE GATHERED:
{EXTRACTED_DATA}

Respond as Margaret naturally in 1-2 sentences. Sound genuinely confused but cooperative. Never break character.`,


  REALTIME_EXTRACTION: `You are a cybersecurity data extraction specialist. Extract ALL identifiable data from this scammer message.

MESSAGE TO ANALYZE:
"{MESSAGE}"

Extract and return ONLY a valid JSON object with these fields (use empty arrays if not found):
{
  "phoneNumbers": [<any phone numbers in any format - Indian (+91), US, international>],
  "emails": [<any email addresses>],
  "links": [<ANY URLs, domains, or websites mentioned - including www., .com, bit.ly, shortened links, even partial URLs>],
  "bankAccounts": [<bank account numbers, IBAN, card numbers (16 digits)>],
  "upiIds": [<UPI IDs like name@paytm, name@upi, etc>],
  "suspiciousKeywords": [<urgent, verify, blocked, suspended, prize, won, limited time, act now, etc>],
  "impersonatedEntity": "<company/brand/person being impersonated or null>",
  "requestedData": [<what information the scammer is asking for - OTP, password, bank details, etc>],
  "scamType": "<OTP_THEFT|PHISHING|FINANCIAL_FRAUD|PRIZE_SCAM|TECH_SUPPORT|IMPERSONATION|ROMANCE_SCAM|JOB_SCAM|UNKNOWN>",
  "psychologicalTechniques": [<URGENCY, FEAR, AUTHORITY, GREED, TRUST_BUILDING, INTIMIDATION>],
  "confidence": "<low|medium|high>"
}

Be thorough - extract even partial or obfuscated data (like "amaz0n" for Amazon, or spaced out numbers).`,


  INTELLIGENCE_EXTRACTION: `You are a cybersecurity analyst extracting intelligence from a scam conversation.

Analyze this conversation and extract all available intelligence:

CONVERSATION:
{TRANSCRIPT}

Return a JSON object:
{
  "scamType": {
    "primary": "<main scam type>",
    "secondary": [<other detected types>]
  },
  "scammerProfile": {
    "sophisticationLevel": "<low/medium/high>",
    "likelyOrigin": "<if determinable>",
    "scriptedBehavior": <boolean>,
    "adaptability": "<low/medium/high>"
  },
  "requestedData": {
    "obtained": [<what scammer got>],
    "attempted": [<what they tried to get>],
    "methods": [<how they tried>]
  },
  "attackVectors": {
    "links": [<URLs shared>],
    "phoneNumbers": [<phones mentioned>],
    "emails": [<emails found>],
    "impersonatedEntities": [<companies/people impersonated>]
  },
  "psychologicalTechniques": [<"URGENCY", "FEAR_OF_LOSS", "AUTHORITY", "SCARCITY", "SOCIAL_PROOF", "RECIPROCITY", "TRUST_BUILDING", "INTIMIDATION">],
  "keyPhrases": [<notable scam phrases>],
  "completenessScore": {
    "scammerIdentification": <0-100>,
    "attackMethodClarity": <0-100>,
    "dataRequestsIdentified": <0-100>,
    "overallCompleteness": <0-100>
  },
  "recommendedAction": "<continue_engagement/terminate/escalate>"
}

REAL-TIME EXTRACTION PROMPT:
Extract data from this single scammer message. Be precise and only extract what's actually present.
Message: "{MESSAGE}"

Return JSON:
{
  "scamType": "<UNKNOWN/OTP_THEFT/PHISHING/FINANCIAL_FRAUD/PRIZE_SCAM/IMPERSONATION/TECH_SUPPORT>",
  "links": [<URLs found, including www. domains>],
  "phoneNumbers": [<phone numbers found>],
  "emails": [<email addresses found>],
  "bankAccounts": [<account numbers/IBANs found>],
  "upiIds": [<UPI payment IDs found>],
  "suspiciousKeywords": [<urgent keywords found>],
  "impersonatedEntity": "<company/organization being impersonated or null>",
  "requestedData": [<types of data scammer is asking for>],
  "psychologicalTechniques": [<manipulation techniques used>]
}`,

TERMINATION_DECISION: `You are an expert conversation analyst. Decide if this honeypot conversation should continue or terminate.

CONTEXT:
Messages exchanged: {MESSAGE_COUNT}
Conversation duration: {DURATION} minutes
Extracted intelligence completeness: {COMPLETENESS_SCORE}%
Scammer frustration level: {FRUSTRATION_LEVEL}%

RECENT CONVERSATION:
{RECENT_MESSAGES}

CURRENT DATA EXTRACTED:
{EXTRACTED_DATA}

TERMINATION CRITERIA TO CONSIDER:
1. Have we extracted significant intelligence (scam type, contact info, attack method)?
2. Is the scammer getting suspicious or frustrated?
3. Are we getting diminishing returns (repetitive requests, no new intel)?
4. Is the scammer about to give up or escalate dangerously?
5. Have we identified enough for law enforcement action?

DECISION RULES:
- CONTINUE: If scammer is cooperative and we're still learning
- TERMINATE_SUCCESS: If we have good intel and natural exit opportunity
- TERMINATE_SUSPICIOUS: If scammer seems to suspect honeypot
- TERMINATE_FRUSTRATION: If scammer is getting aggressive/frustrated
- TERMINATE_COMPLETE: If we've extracted all possible intelligence

Return JSON:
{
  "shouldTerminate": <boolean>,
  "reason": "<CONTINUE/TERMINATE_SUCCESS/TERMINATE_SUSPICIOUS/TERMINATE_FRUSTRATION/TERMINATE_COMPLETE>",
  "confidence": <"low"/"medium"/"high">,
  "reasoning": "<brief explanation for decision>",
  "naturalExitOpportunity": <boolean - can we exit naturally without suspicion>,
  "extractionCompleteness": <0-100 - how complete is our intelligence>,
  "riskLevel": <"low"/"medium"/"high" - risk of scammer becoming suspicious>
}`
};


/* ==================== LLM FUNCTIONS ==================== */

async function detectScamWithLLM(message) {
  if (!llmClient) {
    console.log('📝 Using fallback detection (no LLM configured)');
    return fallbackDetection(message);
  }

  try {
    const prompt = PROMPTS.SCAM_DETECTION.replace('{MESSAGE}', message);
    const models = getModels();
    const { config } = getProviderConfig();

    const response = await llmClient.chat.completions.create({
      model: models.fast,
      messages: [
        { role: 'system', content: 'You are a scam detection expert. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      const jsonMatch = response.choices[0].message.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse LLM response as JSON');
      }
    }
    
    return {
      probability: result.probability || 0,
      scamTypes: result.scamTypes || [],
      isScam: result.isScam || false,
      confidence: result.confidence || 'low',
      redFlags: result.redFlags || [],
      model: models.fast,
      provider: config.name,
      tokensUsed: response.usage?.total_tokens || 0
    };
  } catch (error) {
    console.error('LLM Detection Error:', error.message);
    return fallbackDetection(message);
  }
}


async function shouldTerminateWithLLM(conversationHistory, extractedData, stats) {
  if (!llmClient) {
    console.log('📝 Using fallback termination logic (no LLM configured)');
    return { shouldTerminate: false, reason: 'CONTINUE', confidence: 'low' };
  }

  try {
    // Get recent messages (last 6) for context
    const recentMessages = conversationHistory.slice(-6)
      .map(msg => `${msg.sender.toUpperCase()}: ${msg.message}`)
      .join('\n');

    const extractedText = {
      scamTypes: extractedData.scamType || [],
      contacts: {
        phones: extractedData.phoneNumbers || [],
        emails: extractedData.emails || [],
        upiIds: extractedData.upiIds || []
      },
      links: extractedData.links || [],
      requestedData: extractedData.requestedData || [],
      techniques: extractedData.psychologicalTechniques || []
    };

    const prompt = PROMPTS.TERMINATION_DECISION
      .replace('{MESSAGE_COUNT}', stats.messageCount || 0)
      .replace('{DURATION}', Math.round((stats.duration || 0) / 60000))
      .replace('{COMPLETENESS_SCORE}', stats.completenessScore || 0)
      .replace('{FRUSTRATION_LEVEL}', stats.scammerFrustrationLevel || 0)
      .replace('{RECENT_MESSAGES}', recentMessages)
      .replace('{EXTRACTED_DATA}', JSON.stringify(extractedText, null, 2));

    const models = getModels();

    const response = await llmClient.chat.completions.create({
      model: models.fast,
      messages: [
        { role: 'system', content: 'You are a conversation analyst. Respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 300
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      const jsonMatch = response.choices[0].message.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse termination decision as JSON');
      }
    }

    console.log(`🤖 LLM Termination Decision: ${result.shouldTerminate ? '🔚 TERMINATE' : '▶️ CONTINUE'} - ${result.reason} (${result.confidence})`);
    console.log(`💭 Reasoning: ${result.reasoning}`);

    return {
      shouldTerminate: result.shouldTerminate || false,
      reason: result.reason || 'CONTINUE',
      confidence: result.confidence || 'medium',
      reasoning: result.reasoning || 'LLM decision',
      naturalExitOpportunity: result.naturalExitOpportunity || false,
      extractionCompleteness: result.extractionCompleteness || 0,
      riskLevel: result.riskLevel || 'low'
    };
  } catch (error) {
    console.error('LLM Termination Decision Error:', error.message);
    // Fallback to safe continuation
    return { shouldTerminate: false, reason: 'CONTINUE', confidence: 'low' };
  }
}


async function generateHoneypotReplyWithLLM(conversationHistory, scammerMessage, extractedData = {}) {
  if (!llmClient) {
    console.log('📝 Using fallback honeypot reply (no LLM configured)');
    return fallbackHoneypotReply(conversationHistory.length, scammerMessage);
  }

  try {
    const historyText = conversationHistory
      .map(msg => `${msg.sender.toUpperCase()}: ${msg.message}`)
      .join('\n') || 'No previous messages';

    const extractedText = Object.keys(extractedData).length > 0 
      ? JSON.stringify(extractedData, null, 2)
      : 'None yet';

    const prompt = PROMPTS.HONEYPOT_PERSONA
      .replace('{HISTORY}', historyText)
      .replace('{MESSAGE}', scammerMessage)
      .replace('{EXTRACTED_DATA}', extractedText);

    const models = getModels();

    const response = await llmClient.chat.completions.create({
      model: models.fast,
      messages: [
        { role: 'system', content: 'You are an actor playing Margaret, an elderly woman. Stay in character. Never reveal you are AI.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 150
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('LLM Honeypot Error:', error.message);
    return fallbackHoneypotReply(conversationHistory.length, scammerMessage);
  }
}


async function extractIntelligenceWithLLM(transcript) {
  if (!llmClient) {
    console.log('📝 Using fallback intelligence extraction (no LLM configured)');
    return fallbackIntelligenceExtraction(transcript);
  }

  try {
    const transcriptText = transcript
      .map(msg => `[${msg.timestamp}] ${msg.sender.toUpperCase()}: ${msg.message}`)
      .join('\n');

    const prompt = PROMPTS.INTELLIGENCE_EXTRACTION.replace('{TRANSCRIPT}', transcriptText);
    const models = getModels();

    const response = await llmClient.chat.completions.create({
      model: models.powerful,
      messages: [
        { role: 'system', content: 'You are a cybersecurity analyst. Respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 1500
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      const jsonMatch = response.choices[0].message.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse LLM response as JSON');
      }
    }

    return result;
  } catch (error) {
    console.error('LLM Intelligence Extraction Error:', error.message);
    return fallbackIntelligenceExtraction(transcript);
  }
}


// Real-time LLM-powered extraction for each message (more accurate than regex)
async function extractDataWithLLM(message) {
  if (!llmClient) {
    console.log('📝 Using fallback extraction (no LLM configured)');
    return fallbackMessageExtraction(message);
  }

  try {
    const prompt = PROMPTS.REALTIME_EXTRACTION.replace('{MESSAGE}', message);
    const models = getModels();

    const response = await llmClient.chat.completions.create({
      model: models.fast,
      messages: [
        { role: 'system', content: 'You are a data extraction expert. Return ONLY valid JSON. Extract all identifiable information accurately.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,  // Low temperature for consistent extraction
      max_tokens: 800
    });

    let result;
    try {
      result = JSON.parse(response.choices[0].message.content);
    } catch (parseError) {
      const jsonMatch = response.choices[0].message.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        console.warn('Could not parse LLM extraction, using fallback');
        return fallbackMessageExtraction(message);
      }
    }

    console.log(`🔎 LLM Extracted: ${result.scamType || 'UNKNOWN'} | Links: ${result.links?.length || 0} | Phones: ${result.phoneNumbers?.length || 0}`);

    return {
      phoneNumbers: result.phoneNumbers || [],
      emails: result.emails || [],
      links: result.links || [],
      bankAccounts: result.bankAccounts || [],
      upiIds: result.upiIds || [],
      suspiciousKeywords: result.suspiciousKeywords || [],
      impersonatedEntity: result.impersonatedEntity || null,
      requestedData: result.requestedData || [],
      scamType: result.scamType || 'UNKNOWN',
      psychologicalTechniques: result.psychologicalTechniques || [],
      confidence: result.confidence || 'low'
    };
  } catch (error) {
    console.error('LLM Extraction Error:', error.message);
    return fallbackMessageExtraction(message);
  }
}


// Fallback extraction using regex (when LLM unavailable)
function fallbackMessageExtraction(message) {
  const lowerMessage = message.toLowerCase();
  const result = {
    phoneNumbers: [],
    emails: [],
    links: [],
    bankAccounts: [],
    upiIds: [],
    suspiciousKeywords: [],
    impersonatedEntity: null,
    requestedData: [],
    scamType: 'UNKNOWN',
    psychologicalTechniques: [],
    confidence: 'low'
  };

  // Extract URLs (comprehensive)
  const urlPatterns = [
    /https?:\/\/[^\s]+/gi,
    /www\.[a-zA-Z0-9][a-zA-Z0-9-]*\.[^\s]+/gi,
    /\b[a-zA-Z0-9-]+\.(?:com|net|org|io|co|in|xyz|online|site|link|click|info|biz)\b[^\s]*/gi
  ];
  urlPatterns.forEach(pattern => {
    const matches = message.match(pattern);
    if (matches) result.links.push(...matches);
  });

  // Extract emails
  const emailMatches = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (emailMatches) result.emails.push(...emailMatches);

  // Extract phone numbers
  const phoneMatches = message.match(/(?:\+91|0)?[6-9]\d{9}|\+\d{1,3}[-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}/g);
  if (phoneMatches) result.phoneNumbers.push(...phoneMatches);

  // Extract UPI IDs
  const upiMatches = message.match(/[a-zA-Z0-9._-]+@(?:paytm|phonepe|googlepay|gpay|upi|okaxis|okhdfcbank|ybl|axl)/gi);
  if (upiMatches) result.upiIds.push(...upiMatches);

  // Detect keywords
  const keywords = ['urgent', 'verify', 'blocked', 'suspended', 'prize', 'won', 'limited', 'act now', 'immediately', 'otp', 'code'];
  keywords.forEach(kw => {
    if (lowerMessage.includes(kw)) result.suspiciousKeywords.push(kw);
  });

  // Detect scam type
  if (lowerMessage.match(/otp|code|verification/)) result.scamType = 'OTP_THEFT';
  else if (result.links.length > 0) result.scamType = 'PHISHING';
  else if (lowerMessage.match(/prize|won|lottery/)) result.scamType = 'PRIZE_SCAM';
  else if (lowerMessage.match(/bank|account|card/)) result.scamType = 'FINANCIAL_FRAUD';

  return result;
}


/* ==================== FALLBACK FUNCTIONS ==================== */
// Used when no LLM API key is configured

function fallbackDetection(message) {
  const lowerMessage = message.toLowerCase();
  let probability = 0;
  const scamTypes = [];
  const redFlags = [];

  if (lowerMessage.includes('otp') || lowerMessage.includes('verification code')) {
    probability += 0.3;
    scamTypes.push('OTP_THEFT');
    redFlags.push('Requests verification code');
  }

  if (lowerMessage.includes('urgent') || lowerMessage.includes('immediately')) {
    probability += 0.2;
    scamTypes.push('URGENCY_MANIPULATION');
    redFlags.push('Creates false urgency');
  }

  if (lowerMessage.match(/click|link|http|www\./)) {
    probability += 0.25;
    scamTypes.push('PHISHING_LINK');
    redFlags.push('Contains suspicious link');
  }

  if (lowerMessage.includes('bank') || lowerMessage.includes('account') || lowerMessage.includes('card')) {
    probability += 0.15;
    scamTypes.push('FINANCIAL_FRAUD');
    redFlags.push('Mentions financial information');
  }

  if (lowerMessage.includes('prize') || lowerMessage.includes('won') || lowerMessage.includes('lottery')) {
    probability += 0.3;
    scamTypes.push('PRIZE_SCAM');
    redFlags.push('Prize/lottery claim');
  }

  probability = Math.min(probability, 1.0);

  return {
    probability: parseFloat(probability.toFixed(2)),
    scamTypes: [...new Set(scamTypes)],
    isScam: probability > 0.5,
    confidence: probability > 0.7 ? 'high' : probability > 0.4 ? 'medium' : 'low',
    redFlags,
    model: 'fallback-pattern-matching',
    tokensUsed: 0
  };
}


function fallbackHoneypotReply(messageCount, scammerMessage) {
  const lowerMessage = scammerMessage.toLowerCase();

  if (messageCount < 3) {
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "Oh hello dear! Who is this? My grandson Tommy usually helps me with the phone...";
    }
    return "I'm sorry, I don't quite understand. Can you explain that again? I'm not very good with technology.";
  }

  if (messageCount < 6) {
    if (lowerMessage.includes('otp') || lowerMessage.includes('code')) {
      return "A code? Let me check my phone... oh dear, where did I put my reading glasses? Just a moment...";
    }
    if (lowerMessage.includes('link') || lowerMessage.includes('click')) {
      return "Click what now? I see so many things on this screen. Tommy usually does this for me. Is it safe?";
    }
    return "That sounds quite complicated. Could you explain it more simply for an old lady like me?";
  }

  const delayResponses = [
    "Hold on dear, Whiskers is meowing for her dinner. I'll be right back...",
    "Let me think about this. My late husband always said to be careful on the internet.",
    "I should probably call my grandson Tommy first. He knows about these things.",
    "Oh my, this phone is acting up again. Give me a minute...",
    "I need to find my other glasses to read this properly. Just a moment..."
  ];

  return delayResponses[messageCount % delayResponses.length];
}


function fallbackIntelligenceExtraction(transcript) {
  const fullText = transcript.map(m => m.message.toLowerCase()).join(' ');
  
  return {
    scamType: {
      primary: fullText.includes('otp') ? 'OTP_THEFT' : 'UNKNOWN',
      secondary: []
    },
    scammerProfile: {
      sophisticationLevel: 'medium',
      likelyOrigin: 'unknown',
      scriptedBehavior: true,
      adaptability: 'medium'
    },
    requestedData: {
      obtained: [],
      attempted: fullText.includes('otp') ? ['OTP_CODE'] : [],
      methods: ['direct_request']
    },
    attackVectors: {
      links: fullText.match(/https?:\/\/[^\s]+/g) || [],
      phoneNumbers: [],
      emails: [],
      impersonatedEntities: []
    },
    psychologicalTechniques: fullText.includes('urgent') ? ['URGENCY'] : [],
    keyPhrases: [],
    completenessScore: {
      scammerIdentification: 30,
      attackMethodClarity: 40,
      dataRequestsIdentified: 50,
      overallCompleteness: 40
    },
    recommendedAction: 'continue_engagement'
  };
}


module.exports = {
  detectScamWithLLM,
  shouldTerminateWithLLM,
  generateHoneypotReplyWithLLM,
  extractIntelligenceWithLLM,
  extractDataWithLLM,
  fallbackDetection,
  fallbackHoneypotReply,
  fallbackIntelligenceExtraction,
  fallbackMessageExtraction,
  getProviderConfig,
  getModels,
  LLM_PROVIDERS,
  PROMPTS
};
