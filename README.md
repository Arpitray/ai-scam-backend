# Scam Detection Honeypot Server

A minimal Express server for detecting scams, maintaining honeypot conversations, and analyzing scammer behavior.

## Installation

```bash
npm install
```

## Running the Server

```bash
npm start
```

The server will start on port 3000 (or the PORT environment variable if set).

## Endpoints

### POST /analyze
Analyzes a message for scam indicators using AI detection.

**Request:**
```json
{
  "message": "Hello! We've sent a verification code to your phone. Please share the 6-digit code."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Hello! We've sent a verification code to your phone. Please share the 6-digit code.",
  "probability": 0.4,
  "scamTypes": ["OTP_THEFT", "OTP_REQUEST"],
  "isScam": false
}
```

---

### POST /honeypot/respond
Maintains a conversation with a scammer and generates intelligent honeypot replies.

**Request:**
```json
{
  "conversationId": "conv-123",
  "scammerMessage": "We need your verification code immediately!"
}
```

**Optional: Include conversation history**
```json
{
  "conversationId": "conv-123",
  "scammerMessage": "We need your verification code immediately!",
  "conversationHistory": [
    {
      "sender": "scammer",
      "message": "Hello, this is Amazon customer service",
      "timestamp": "2026-01-27T10:00:00.000Z"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "conversationId": "conv-123",
  "reply": "Oh, I got a code but I'm not sure what it's for. Is this legitimate?",
  "conversationHistory": [
    {
      "sender": "scammer",
      "message": "We need your verification code immediately!",
      "timestamp": "2026-01-27T10:30:00.000Z"
    },
    {
      "sender": "honeypot",
      "message": "Oh, I got a code but I'm not sure what it's for. Is this legitimate?",
      "timestamp": "2026-01-27T10:30:01.000Z"
    }
  ],
  "messageCount": 2
}
```

---

### POST /mock-scammer
Simulates scammer messages based on conversation stage (for testing).

**Request:**
```json
{
  "stage": 2
}
```

**Response:**
```json
{
  "success": true,
  "stage": 2,
  "message": "We've sent a verification code to your phone. Please share that 6-digit code so we can confirm it's really you.",
  "stage": "OTP_REQUEST",
  "technique": "CREDENTIAL_THEFT"
}
```

**Stages:**
- 0: INITIAL_CONTACT
- 1: URGENCY_CREATION
- 2: OTP_REQUEST
- 3: PRESSURE_INCREASE
- 4: PHISHING_LINK
- 5: FINAL_PRESSURE
- 6+: PERSISTENCE (loops)

---

### POST /analyze-conversation
Analyzes a complete conversation transcript and extracts scam intelligence.

**Request with transcript:**
```json
{
  "transcript": [
    {
      "sender": "scammer",
      "message": "Hello! This is Sarah from Amazon Customer Service.",
      "timestamp": "2026-01-27T10:00:00.000Z"
    },
    {
      "sender": "honeypot",
      "message": "Hello! Who is this?",
      "timestamp": "2026-01-27T10:00:15.000Z"
    },
    {
      "sender": "scammer",
      "message": "We need your verification code immediately!",
      "timestamp": "2026-01-27T10:01:00.000Z"
    }
  ]
}
```

**Or request with conversationId:**
```json
{
  "conversationId": "conv-123"
}
```

**Response:**
```json
{
  "success": true,
  "messageCount": 3,
  "analysis": {
    "scamType": ["IMPERSONATION", "OTP_THEFT"],
    "requestedData": ["OTP_CODE"],
    "attackMethod": ["BRAND_IMPERSONATION", "FAKE_VERIFICATION"],
    "psychologicalTechniques": ["URGENCY", "FALSE_AUTHORITY"]
  }
}
```

---

### GET /conversation/:id
Retrieves stored conversation history.

**Request:**
```
GET /conversation/conv-123
```

**Response:**
```json
{
  "success": true,
  "conversationId": "conv-123",
  "history": [
    {
      "sender": "scammer",
      "message": "Hello!",
      "timestamp": "2026-01-27T10:00:00.000Z"
    }
  ],
  "messageCount": 1
}
```

---

### DELETE /conversation/:id
Deletes conversation history.

**Request:**
```
DELETE /conversation/conv-123
```

**Response:**
```json
{
  "success": true,
  "deleted": true
}
```

---

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "activeConversations": 5
}
```

## Testing Workflow Example

### 1. Simulate a Complete Scam Conversation

```bash
# Stage 0: Initial contact
curl -X POST http://localhost:3000/mock-scammer \
  -H "Content-Type: application/json" \
  -d '{"stage": 0}'

# Response honeypot to scammer
curl -X POST http://localhost:3000/honeypot/respond \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "test-conv-1",
    "scammerMessage": "Hello! This is Sarah from Amazon Customer Service."
  }'

# Stage 1: Create urgency
curl -X POST http://localhost:3000/mock-scammer \
  -H "Content-Type: application/json" \
  -d '{"stage": 1}'

# Continue conversation
curl -X POST http://localhost:3000/honeypot/respond \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "test-conv-1",
    "scammerMessage": "Your account will be suspended in 2 hours!"
  }'

# Analyze the conversation
curl -X POST http://localhost:3000/analyze-conversation \
  -H "Content-Type: application/json" \
  -d '{"conversationId": "test-conv-1"}'
```

### 2. Analyze a Single Message

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "message": "URGENT! Click this link to verify your account: http://fake-bank.com"
  }'
```

## Features

- **AI Scam Detection**: Analyzes messages for scam patterns and assigns probability scores
- **Honeypot Conversation**: Maintains context-aware conversations to waste scammers' time
- **Mock Scammer**: Simulates realistic scam scenarios for testing
- **Conversation Analysis**: Extracts scam intelligence from conversation transcripts
- **In-Memory Storage**: Stores conversation history (no database required)

## Scam Types Detected

- OTP_THEFT
- URGENCY_MANIPULATION
- PHISHING_LINK
- FINANCIAL_FRAUD
- PRIZE_SCAM
- IMPERSONATION

## Psychological Techniques Identified

- URGENCY
- FEAR_OF_LOSS
- SCARCITY
- FALSE_AUTHORITY
- FAKE_HELPFULNESS

