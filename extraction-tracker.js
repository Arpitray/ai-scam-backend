/*
 * extraction-tracker.js - Conversation State Manager
 * Tracks scam intelligence extraction and determines when to stop honeypot engagement
 */


// Configuration for conversation limits and thresholds
const CONFIG = {
  MAX_CONVERSATION_LENGTH: 30,        // Max messages before forced stop
  MIN_MESSAGES_FOR_EXTRACTION: 6,     // Minimum before considering stop
  COMPLETENESS_THRESHOLD: 75,         // % completeness to trigger stop
  MAX_CONVERSATION_DURATION: 30 * 60 * 1000,  // 30 minutes
  INACTIVITY_TIMEOUT: 5 * 60 * 1000,          // 5 minutes

  REQUIRED_DATA_POINTS: ['scamType', 'requestedData', 'attackMethod', 'psychologicalTechniques'],
  BONUS_DATA_POINTS: ['impersonatedEntity', 'phoneNumber', 'email', 'link', 'scammerName']
};


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
      scammerName: null,
      keyPhrases: []
    };
    this.completenessScore = 0;
    this.status = 'active';
    this.terminationReason = null;
    this.scammerFrustrationLevel = 0;
  }


  // Process new message and check if we should stop
  addMessage(sender, message, analysisResult = null) {
    this.messageCount++;
    this.lastActivityTime = Date.now();

    if (sender === 'scammer') {
      this.analyzeScammerMessage(message);
    }

    if (analysisResult) {
      this.mergeAnalysisResult(analysisResult);
    }

    this.calculateCompleteness();
    return this.checkTerminationConditions();
  }


  // Extract intelligence from scammer message
  analyzeScammerMessage(message) {
    const lowerMessage = message.toLowerCase();

    // Detect OTP theft attempts
    if (lowerMessage.includes('otp') || lowerMessage.includes('verification code') || lowerMessage.includes('6-digit')) {
      this.addUniqueItem('scamType', 'OTP_THEFT');
      this.addUniqueItem('requestedData', 'OTP_CODE');
    }

    // Extract links
    if (lowerMessage.match(/https?:\/\/[^\s]+/)) {
      const links = message.match(/https?:\/\/[^\s]+/g);
      links?.forEach(link => this.addUniqueItem('links', link));
      this.addUniqueItem('scamType', 'PHISHING');
      this.addUniqueItem('attackMethod', 'MALICIOUS_LINK');
    }

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

    // Extract contact info
    const phoneMatches = message.match(/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/g);
    phoneMatches?.forEach(phone => this.addUniqueItem('phoneNumbers', phone));

    const emailMatches = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    emailMatches?.forEach(email => this.addUniqueItem('emails', email));

    this.extractKeyPhrases(message);
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


  addUniqueItem(field, value) {
    if (Array.isArray(this.extractedData[field]) && !this.extractedData[field].includes(value)) {
      this.extractedData[field].push(value);
    }
  }


  mergeAnalysisResult(result) {
    if (result.scamTypes) {
      result.scamTypes.forEach(type => this.addUniqueItem('scamType', type));
    }
    if (result.requestedData?.attempted) {
      result.requestedData.attempted.forEach(data => this.addUniqueItem('requestedData', data));
    }
    if (result.attackVectors?.links) {
      result.attackVectors.links.forEach(link => this.addUniqueItem('links', link));
    }
    if (result.psychologicalTechniques) {
      result.psychologicalTechniques.forEach(tech => this.addUniqueItem('psychologicalTechniques', tech));
    }
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
  checkTerminationConditions() {
    const currentTime = Date.now();
    const duration = currentTime - this.startTime;
    const inactivity = currentTime - this.lastActivityTime;

    if (this.messageCount >= CONFIG.MAX_CONVERSATION_LENGTH) {
      return this.terminate('MAX_MESSAGES_REACHED', `Max messages (${CONFIG.MAX_CONVERSATION_LENGTH}) reached`);
    }

    if (duration >= CONFIG.MAX_CONVERSATION_DURATION) {
      return this.terminate('MAX_DURATION_REACHED', `Max duration (${CONFIG.MAX_CONVERSATION_DURATION / 60000} min) reached`);
    }

    if (inactivity >= CONFIG.INACTIVITY_TIMEOUT) {
      return this.terminate('INACTIVITY_TIMEOUT', `Inactivity timeout (${CONFIG.INACTIVITY_TIMEOUT / 60000} min) exceeded`);
    }

    if (this.messageCount >= CONFIG.MIN_MESSAGES_FOR_EXTRACTION && 
        this.completenessScore >= CONFIG.COMPLETENESS_THRESHOLD) {
      return this.terminate('EXTRACTION_COMPLETE', `Extraction completeness (${this.completenessScore}%) reached threshold`);
    }

    if (this.scammerFrustrationLevel >= 80) {
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


module.exports = { ConversationTracker, TrackerManager, CONFIG };
