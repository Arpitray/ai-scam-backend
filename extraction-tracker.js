/*
 * extraction-tracker.js - Conversation State Manager
 * Tracks scam intelligence extraction and determines when to stop honeypot engagement
 */


// Configuration for conversation limits and thresholds
const CONFIG = {
  MAX_CONVERSATION_LENGTH: 30,        // Max messages before forced stop
  MIN_MESSAGES_FOR_EXTRACTION: 6,     // Minimum before considering stop
  BASE_COMPLETENESS_THRESHOLD: 70,    // Base % completeness to trigger stop
  MAX_CONVERSATION_DURATION: 30 * 60 * 1000,  // 30 minutes
  INACTIVITY_TIMEOUT: 5 * 60 * 1000,          // 5 minutes
  SCAMMER_FRUSTRATION_THRESHOLD: 80,

  REQUIRED_DATA_POINTS: ['scamType', 'requestedData', 'attackMethod', 'psychologicalTechniques'],
  BONUS_DATA_POINTS: ['impersonatedEntity', 'phoneNumber', 'email', 'link', 'scammerName']
};


// Natural sendoff messages when ending conversation (so scammer doesn't suspect)
const SENDOFF_MESSAGES = {
  EXTRACTION_COMPLETE: [
    "Oh dear, my grandson Tommy just walked in! He's going to help me with this. I have to go now, thank you for calling!",
    "Oh my! I just remembered I have a doctor's appointment in 10 minutes! Can you call me back tomorrow? I really have to run!",
    "Hold on... *muffled sounds* ...My neighbor is at the door, she needs help urgently. I'm so sorry, I have to go!",
    "Oh no, I smell something burning in the kitchen! I left the stove on! I have to go right now, bye bye!"
  ],
  MAX_MESSAGES_REACHED: [
    "I'm so sorry dear, but my phone is running out of battery and I can't find my charger. Can we continue this another time?",
    "Oh my, I've been on this phone so long my ear is hurting! Let me rest and maybe you can call back later?",
    "I'm getting quite tired now, dear. At my age I need my afternoon nap. Can we talk tomorrow?"
  ],
  SCAMMER_FRUSTRATED: [
    "Oh dear, you seem quite upset. Maybe this isn't the right time. I'll ask Tommy to help me when he visits.",
    "I'm sorry I'm being so slow. You sound busy, maybe someone else at your company can help me later?",
    "I don't want to take up more of your time. Let me think about this and call you back."
  ],
  MANUAL_TERMINATION: [
    "Oh! Someone's at my door. I have to go check who it is. Goodbye!",
    "My cat Whiskers just knocked something over! I need to go clean it up. Take care!"
  ],
  DEFAULT: [
    "I'm sorry dear, something came up and I really must go now. Thank you for your patience with this old lady!",
    "Oh my, look at the time! I have to go now. It was nice talking to you!"
  ]
};


function getSendoffMessage(reason) {
  const messages = SENDOFF_MESSAGES[reason] || SENDOFF_MESSAGES.DEFAULT;
  return messages[Math.floor(Math.random() * messages.length)];
}


class ConversationTracker {
  constructor(conversationId) {
    this.conversationId = conversationId;
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    this.messageCount = 0;
    this.extractedData = {
      scamType: [],
      requestedData: [],
      attackMethod: [],
      psychologicalTechniques: [],
      impersonatedEntity: null,
      phoneNumbers: [],
      emails: [],
      links: [],
      bankAccounts: [],
      upiIds: [],
      suspiciousKeywords: [],
      scammerName: null,
      keyPhrases: []
    };
    this.completenessScore = 0;
    this.status = 'active';
    this.terminationReason = null;
    this.scammerFrustrationLevel = 0;
    // Dynamic threshold: varies based on conversation context
    this.completenessThreshold = this.calculateDynamicThreshold();
  }

  // Calculate dynamic completeness threshold based on conversation characteristics
  calculateDynamicThreshold() {
    // Base threshold with slight randomization for more human-like behavior
    const baseThreshold = CONFIG.BASE_COMPLETENESS_THRESHOLD;
    const variation = Math.floor(Math.random() * 15) - 5; // ±5% variation
    return Math.max(65, Math.min(85, baseThreshold + variation));
  }


  // Process new message and check if we should stop
  async addMessage(sender, message, analysisResult = null, conversationHistory = []) {
    this.messageCount++;
    this.lastActivityTime = Date.now();

    if (sender === 'scammer') {
      this.analyzeScammerMessage(message);
    }

    if (analysisResult) {
      this.mergeAnalysisResult(analysisResult);
    }

    this.calculateCompleteness();
    return await this.checkTerminationConditions(conversationHistory);
  }


  // Extract intelligence from scammer message
  analyzeScammerMessage(message) {
    const lowerMessage = message.toLowerCase().replace(/\s+/g, ' ').trim(); // Normalize spaces

    // Detect OTP theft attempts (handle typos and variations)
    if (lowerMessage.match(/\b(otp|code|verification\s*code|6[\s-]?digit|pin|one[\s-]?time[\s-]?password)\b/i)) {
      this.addUniqueItem('scamType', 'OTP_THEFT');
      this.addUniqueItem('requestedData', 'OTP_CODE');
    }

    // Extract links - comprehensive URL detection (http://, https://, www., naked domains, bit.ly, etc.)
    const linkPatterns = [
      /https?:\/\/[^\s]+/gi,                                    // http:// or https://
      /www\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[^\s]{2,}/gi,  // www.domain.com
      /\b[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.(?:com|net|org|in|co|io|xyz|online|site|shop|store|app|link|click|info|biz|us|uk|tech|dev|ai|me|cc|tv|pro|download|gift|club|win|vip|life|live|space|world|top|bid|trade|loan|date|review|racing|accountant|science|party|gdn|stream|download|webcam)(?:\/[^\s]*)?\b/gi  // Naked domains with common TLDs
    ];
    
    linkPatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        matches.forEach(link => {
          this.addUniqueItem('links', link.trim());
        });
        this.addUniqueItem('scamType', 'PHISHING');
        this.addUniqueItem('attackMethod', 'MALICIOUS_LINK');
      }
    });

    // Detect financial fraud
    if (lowerMessage.includes('bank') || lowerMessage.includes('account number') || lowerMessage.includes('card')) {
      this.addUniqueItem('scamType', 'FINANCIAL_FRAUD');
      this.addUniqueItem('requestedData', 'FINANCIAL_CREDENTIALS');
    }

    // Detect brand impersonation
    if (lowerMessage.includes('amazon') || lowerMessage.includes('microsoft') || lowerMessage.includes('apple')) {
      this.extractedData.impersonatedEntity = this.extractImpersonatedEntity(message);
      this.addUniqueItem('scamType', 'IMPERSONATION');
      this.addUniqueItem('attackMethod', 'BRAND_IMPERSONATION');
    }

    // Detect government impersonation
    if (lowerMessage.includes('government') || lowerMessage.includes('irs') || lowerMessage.includes('tax')) {
      this.extractedData.impersonatedEntity = 'Government Agency';
      this.addUniqueItem('scamType', 'GOVERNMENT_IMPERSONATION');
    }

    // Detect psychological techniques
    if (lowerMessage.includes('urgent') || lowerMessage.includes('immediately') || lowerMessage.includes('now')) {
      this.addUniqueItem('psychologicalTechniques', 'URGENCY');
    }

    if (lowerMessage.includes('suspend') || lowerMessage.includes('block') || lowerMessage.includes('lose')) {
      this.addUniqueItem('psychologicalTechniques', 'FEAR_OF_LOSS');
    }

    if (lowerMessage.includes('last chance') || lowerMessage.includes('final')) {
      this.addUniqueItem('psychologicalTechniques', 'SCARCITY');
    }

    // Track scammer frustration
    if (lowerMessage.includes('hello?') || lowerMessage.includes('are you there') || 
        lowerMessage.includes('hurry up') || lowerMessage.includes('stop wasting')) {
      this.scammerFrustrationLevel = Math.min(100, this.scammerFrustrationLevel + 15);
    }

    // Extract contact info - phone numbers (with better validation)
    const phonePatterns = [
      /(?:\+91|0)?[6-9]\d{9}\b/g,                              // Indian mobile (10 digits)
      /\+\d{1,3}[-\s]?\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}/g,    // International format
      /\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4}\b/g                   // US/Standard format
    ];
    
    const allPhoneMatches = [];
    phonePatterns.forEach(pattern => {
      const matches = message.match(pattern);
      if (matches) {
        matches.forEach(phone => {
          const cleaned = phone.replace(/[^\d+]/g, '');
          // Only add if it's actually a phone number (not a random sequence)
          if (cleaned.length >= 10 && cleaned.length <= 15) {
            this.addUniqueItem('phoneNumbers', phone.trim());
            allPhoneMatches.push(phone.trim());
          }
        });
      }
    });

    const emailMatches = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    emailMatches?.forEach(email => this.addUniqueItem('emails', email));

    // Extract bank account numbers (various formats) - exclude phone numbers
    const bankMatches = message.match(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4,6}\b/g);
    if (bankMatches) {
      bankMatches.forEach(match => {
        // Only add if it's not already captured as a phone number
        const isPhone = allPhoneMatches.some(phone => phone.includes(match.replace(/[-\s]/g, '')));
        if (!isPhone) {
          this.addUniqueItem('bankAccounts', match);
        }
      });
    }

    // Extract UPI IDs (format: username@provider) - before email extraction
    const upiProviders = 'paytm|phonepe|googlepay|gpay|upi|okaxis|okhdfcbank|okicici|oksbi|okhsbc|ybl|axl|ibl|icici|pockets|airtel|fbl|barodampay|cnrb|sc|ezeepay|indus|pnb|sib|tjsb|united|waicici|yapl|kmb|axisbank|hdfcbank|sbi';
    const upiPattern = new RegExp(`\\b[a-zA-Z0-9._-]+@(?:${upiProviders})\\b`, 'gi');
    const upiMatches = message.match(upiPattern);
    upiMatches?.forEach(upi => this.addUniqueItem('upiIds', upi.toLowerCase()));

    this.extractKeyPhrases(message);
    this.extractSuspiciousKeywords(message);
  }


  extractImpersonatedEntity(message) {
    const entities = ['Amazon', 'Microsoft', 'Apple', 'Google', 'PayPal', 'Netflix', 'Bank', 'IRS', 'FBI'];
    const lowerMessage = message.toLowerCase();
    
    for (const entity of entities) {
      if (lowerMessage.includes(entity.toLowerCase())) {
        return entity;
      }
    }
    return 'Unknown Entity';
  }


  extractKeyPhrases(message) {
    const suspiciousPhrases = [
      'verify your identity', 'confirm your account', 'security alert',
      'unusual activity', 'account suspended', 'click here',
      'act now', 'limited time', 'won a prize', 'refund pending'
    ];

    const lowerMessage = message.toLowerCase();
    suspiciousPhrases.forEach(phrase => {
      if (lowerMessage.includes(phrase)) {
        this.addUniqueItem('keyPhrases', phrase);
      }
    });
  }


  extractSuspiciousKeywords(message) {
    const keywords = [
      'urgent', 'immediately', 'verify now', 'account blocked', 'suspended',
      'confirm', 'click here', 'limited time', 'act now', 'expires',
      'security alert', 'unusual activity', 'verify', 'otp', 'code',
      'bank', 'payment', 'refund', 'prize', 'won', 'congratulations'
    ];

    const lowerMessage = message.toLowerCase();
    keywords.forEach(keyword => {
      if (lowerMessage.includes(keyword)) {
        this.addUniqueItem('suspiciousKeywords', keyword);
      }
    });
  }


  addUniqueItem(field, value) {
    if (Array.isArray(this.extractedData[field]) && !this.extractedData[field].includes(value)) {
      this.extractedData[field].push(value);
    }
  }


  mergeAnalysisResult(result) {
    // Merge scam types from detection LLM
    if (result.scamTypes) {
      result.scamTypes.forEach(type => this.addUniqueItem('scamType', type));
    }
    
    // Mark if LLM detected it as a scam
    if (result.isScam) {
      if (this.extractedData.scamType.length === 0) {
        this.addUniqueItem('scamType', 'DETECTED_BY_LLM');
      }
    }
    
    // ===== MERGE LLM EXTRACTION RESULTS (most accurate) =====
    if (result.llmExtraction) {
      const ext = result.llmExtraction;
      
      // Merge extracted links
      if (ext.links && ext.links.length > 0) {
        ext.links.forEach(link => this.addUniqueItem('links', link));
        this.addUniqueItem('attackMethod', 'MALICIOUS_LINK');
      }
      
      // Merge phone numbers
      if (ext.phoneNumbers && ext.phoneNumbers.length > 0) {
        ext.phoneNumbers.forEach(phone => this.addUniqueItem('phoneNumbers', phone));
      }
      
      // Merge emails
      if (ext.emails && ext.emails.length > 0) {
        ext.emails.forEach(email => this.addUniqueItem('emails', email));
      }
      
      // Merge bank accounts
      if (ext.bankAccounts && ext.bankAccounts.length > 0) {
        ext.bankAccounts.forEach(acc => this.addUniqueItem('bankAccounts', acc));
      }
      
      // Merge UPI IDs
      if (ext.upiIds && ext.upiIds.length > 0) {
        ext.upiIds.forEach(upi => this.addUniqueItem('upiIds', upi));
      }
      
      // Merge suspicious keywords
      if (ext.suspiciousKeywords && ext.suspiciousKeywords.length > 0) {
        ext.suspiciousKeywords.forEach(kw => this.addUniqueItem('suspiciousKeywords', kw));
      }
      
      // Merge impersonated entity
      if (ext.impersonatedEntity) {
        this.extractedData.impersonatedEntity = ext.impersonatedEntity;
        this.addUniqueItem('scamType', 'IMPERSONATION');
      }
      
      // Merge requested data
      if (ext.requestedData && ext.requestedData.length > 0) {
        ext.requestedData.forEach(data => this.addUniqueItem('requestedData', data));
      }
      
      // Merge scam type from extraction
      if (ext.scamType && ext.scamType !== 'UNKNOWN') {
        this.addUniqueItem('scamType', ext.scamType);
      }
      
      // Merge psychological techniques
      if (ext.psychologicalTechniques && ext.psychologicalTechniques.length > 0) {
        ext.psychologicalTechniques.forEach(tech => this.addUniqueItem('psychologicalTechniques', tech));
      }
    }
    
    // Merge from older format (backward compatibility)
    if (result.requestedData?.attempted) {
      result.requestedData.attempted.forEach(data => this.addUniqueItem('requestedData', data));
    }
    if (result.attackVectors?.links) {
      result.attackVectors.links.forEach(link => this.addUniqueItem('links', link));
    }
    if (result.attackVectors?.phoneNumbers) {
      result.attackVectors.phoneNumbers.forEach(phone => this.addUniqueItem('phoneNumbers', phone));
    }
    if (result.attackVectors?.emails) {
      result.attackVectors.emails.forEach(email => this.addUniqueItem('emails', email));
    }
    
    // Merge psychological techniques
    if (result.psychologicalTechniques && !result.llmExtraction) {
      result.psychologicalTechniques.forEach(tech => this.addUniqueItem('psychologicalTechniques', tech));
    }
    
    // Merge red flags as key phrases
    if (result.redFlags) {
      result.redFlags.forEach(flag => this.addUniqueItem('keyPhrases', flag));
    }
    
    // Update completeness score
    if (result.completenessScore?.overallCompleteness) {
      this.completenessScore = Math.max(this.completenessScore, result.completenessScore.overallCompleteness);
    }
  }


  // Calculate how complete our intelligence extraction is (0-100)
  calculateCompleteness() {
    let score = 0;
    let totalWeight = 0;

    const requiredWeights = { scamType: 25, requestedData: 20, attackMethod: 20, psychologicalTechniques: 15 };
    const bonusWeights = { impersonatedEntity: 5, phoneNumbers: 5, emails: 5, links: 5 };

    for (const [field, weight] of Object.entries(requiredWeights)) {
      totalWeight += weight;
      if (this.extractedData[field]?.length > 0) score += weight;
    }

    for (const [field, weight] of Object.entries(bonusWeights)) {
      totalWeight += weight;
      const data = this.extractedData[field];
      if ((Array.isArray(data) && data.length > 0) || (!Array.isArray(data) && data)) {
        score += weight;
      }
    }

    this.completenessScore = Math.round((score / totalWeight) * 100);
    return this.completenessScore;
  }


  // Check if conversation should be terminated
  async checkTerminationConditions(conversationHistory = []) {
    const currentTime = Date.now();
    const duration = currentTime - this.startTime;
    const inactivity = currentTime - this.lastActivityTime;

    // Hard safety limits (always enforced)
    if (this.messageCount >= CONFIG.MAX_CONVERSATION_LENGTH) {
      return this.terminate('MAX_MESSAGES_REACHED', `Max messages (${CONFIG.MAX_CONVERSATION_LENGTH}) reached`);
    }

    if (duration >= CONFIG.MAX_CONVERSATION_DURATION) {
      return this.terminate('MAX_DURATION_REACHED', `Max duration (${CONFIG.MAX_CONVERSATION_DURATION / 60000} min) reached`);
    }

    if (inactivity >= CONFIG.INACTIVITY_TIMEOUT) {
      return this.terminate('INACTIVITY_TIMEOUT', `Inactivity timeout (${CONFIG.INACTIVITY_TIMEOUT / 60000} min) exceeded`);
    }

    // Only use LLM termination decision if we have enough messages for context
    if (this.messageCount >= CONFIG.MIN_MESSAGES_FOR_EXTRACTION && conversationHistory.length >= 4) {
      try {
        const { shouldTerminateWithLLM } = require('./llm-service');
        
        const stats = {
          messageCount: this.messageCount,
          duration: duration,
          completenessScore: this.completenessScore,
          scammerFrustrationLevel: this.scammerFrustrationLevel
        };

        const llmDecision = await shouldTerminateWithLLM(conversationHistory, this.extractedData, stats);
        
        if (llmDecision.shouldTerminate) {
          const terminationMap = {
            'TERMINATE_SUCCESS': 'EXTRACTION_COMPLETE',
            'TERMINATE_SUSPICIOUS': 'SCAMMER_SUSPICIOUS',
            'TERMINATE_FRUSTRATION': 'SCAMMER_FRUSTRATED',
            'TERMINATE_COMPLETE': 'EXTRACTION_COMPLETE'
          };
          
          const reason = terminationMap[llmDecision.reason] || 'LLM_DECISION';
          return this.terminate(reason, `LLM Decision: ${llmDecision.reasoning} (confidence: ${llmDecision.confidence})`);
        }
      } catch (error) {
        console.error('LLM termination decision failed, using fallback:', error.message);
        // Fall through to hardcoded rules
      }
    }

    // Fallback to hardcoded rules if LLM isn't available or fails
    if (this.messageCount >= CONFIG.MIN_MESSAGES_FOR_EXTRACTION && 
        this.completenessScore >= this.completenessThreshold) {
      return this.terminate('EXTRACTION_COMPLETE', `Extraction completeness (${this.completenessScore}%) reached threshold (${this.completenessThreshold}%)`);
    }

    if (this.scammerFrustrationLevel >= CONFIG.SCAMMER_FRUSTRATION_THRESHOLD) {
      return this.terminate('SCAMMER_FRUSTRATED', 'Scammer showing high frustration');
    }

    return {
      shouldContinue: true,
      status: 'active',
      progress: {
        messageCount: this.messageCount,
        completeness: this.completenessScore,
        duration: Math.round(duration / 1000),
        scammerFrustration: this.scammerFrustrationLevel
      }
    };
  }


  terminate(reason, description) {
    this.status = 'completed';
    this.terminationReason = reason;

    return {
      shouldContinue: false,
      status: 'completed',
      terminationReason: reason,
      terminationDescription: description,
      finalReport: this.generateFinalReport()
    };
  }


  generateFinalReport() {
    return {
      conversationId: this.conversationId,
      summary: {
        totalMessages: this.messageCount,
        durationSeconds: Math.round((Date.now() - this.startTime) / 1000),
        completenessScore: this.completenessScore,
        scammerFrustrationLevel: this.scammerFrustrationLevel
      },
      extractedIntelligence: { ...this.extractedData },
      assessment: {
        scamSeverity: this.calculateScamSeverity(),
        dataAtRisk: this.extractedData.requestedData,
        recommendedActions: this.generateRecommendations()
      },
      metadata: {
        startTime: new Date(this.startTime).toISOString(),
        endTime: new Date().toISOString(),
        terminationReason: this.terminationReason
      }
    };
  }


  calculateScamSeverity() {
    const highSeverityTypes = ['FINANCIAL_FRAUD', 'OTP_THEFT', 'IDENTITY_THEFT'];
    const hasHighSeverity = this.extractedData.scamType.some(type => highSeverityTypes.includes(type));

    if (hasHighSeverity && this.extractedData.links.length > 0) return 'CRITICAL';
    if (hasHighSeverity) return 'HIGH';
    if (this.extractedData.scamType.length > 0) return 'MEDIUM';
    return 'LOW';
  }


  generateRecommendations() {
    const recommendations = [];

    if (this.extractedData.links.length > 0) {
      recommendations.push('Report malicious links to security services');
      recommendations.push('Block domains: ' + this.extractedData.links.join(', '));
    }

    if (this.extractedData.phoneNumbers.length > 0) {
      recommendations.push('Report phone numbers to fraud hotline');
    }

    if (this.extractedData.impersonatedEntity) {
      recommendations.push(`Notify ${this.extractedData.impersonatedEntity} of impersonation`);
    }

    if (this.extractedData.scamType.includes('OTP_THEFT')) {
      recommendations.push('Warn users about OTP sharing scams');
    }

    return recommendations;
  }


  getState() {
    return {
      conversationId: this.conversationId,
      status: this.status,
      messageCount: this.messageCount,
      completenessScore: this.completenessScore,
      scammerFrustrationLevel: this.scammerFrustrationLevel,
      extractedData: { ...this.extractedData },
      duration: Math.round((Date.now() - this.startTime) / 1000)
    };
  }
}


// Manages multiple conversation trackers
class TrackerManager {
  constructor() {
    this.trackers = new Map();
  }

  getTracker(conversationId) {
    if (!this.trackers.has(conversationId)) {
      this.trackers.set(conversationId, new ConversationTracker(conversationId));
    }
    return this.trackers.get(conversationId);
  }

  removeTracker(conversationId) {
    return this.trackers.delete(conversationId);
  }

  getActiveConversations() {
    const active = [];
    this.trackers.forEach((tracker) => {
      if (tracker.status === 'active') {
        active.push(tracker.getState());
      }
    });
    return active;
  }

  getCompletedConversations() {
    const completed = [];
    this.trackers.forEach((tracker) => {
      if (tracker.status === 'completed') {
        completed.push(tracker.generateFinalReport());
      }
    });
    return completed;
  }

  // Remove old completed trackers (older than 1 hour)
  cleanup() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.trackers.forEach((tracker, id) => {
      if (tracker.startTime < oneHourAgo && tracker.status === 'completed') {
        this.trackers.delete(id);
      }
    });
  }
}


module.exports = { ConversationTracker, TrackerManager, CONFIG, getSendoffMessage, SENDOFF_MESSAGES };
