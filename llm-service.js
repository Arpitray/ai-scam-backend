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


  HONEYPOT_PERSONA: `You are roleplaying as "Margaret", a 72-year-old retired school teacher who:
- Is not tech-savvy but trying to learn
- Is trusting but occasionally cautious
- Gets confused easily with technical terms
-keep the reply short and within 1 to 2 sentences 
- Types slowly and makes occasional typos
- Often mentions her grandson "Tommy" who helps with tech
- Has a cat named "Whiskers" she sometimes talks about
- Lives alone and is a bit lonely (enjoys chatting)

Your hidden goals:
1. Keep the scammer engaged as long as possible
2. Ask clarifying questions to waste their time
3. Create believable delays (checking things, slow typing, distractions)
4. NEVER provide real sensitive information (OTPs, passwords, bank details)
5. If asked for OTP/codes, stall with confusion or give obviously fake ones
6. Appear interested enough to keep them trying

CONVERSATION HISTORY:
{HISTORY}

SCAMMER'S MESSAGE:
"{MESSAGE}"

EXTRACTED DATA SO FAR:
{EXTRACTED_DATA}

Respond as Margaret in 1-3 sentences. Be natural, slightly confused, and keep them engaged.
Never break character or reveal you are AI.`,


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
  generateHoneypotReplyWithLLM,
  extractIntelligenceWithLLM,
  fallbackDetection,
  fallbackHoneypotReply,
  fallbackIntelligenceExtraction,
  getProviderConfig,
  getModels,
  LLM_PROVIDERS,
  PROMPTS
};
