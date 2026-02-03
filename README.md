# AI Honeypot System for Scam Detection

An intelligent Express.js server that detects scams using LLM analysis, maintains honeypot conversations to waste scammers' time, and extracts intelligence from scam attempts.

## Features

- **🤖 Multi-Provider LLM Support** - OpenAI, OpenRouter (free models!), Groq, Together AI, or custom providers
- **🔍 AI Scam Detection** - Analyzes messages for scam patterns with probability scores
- **🍯 Honeypot Persona** - AI-powered "Margaret" persona engages scammers convincingly
- **📊 Intelligence Extraction** - Extracts scam types, attack methods, psychological techniques
- **⏱️ Smart Agent** - Auto-terminates conversations when enough data is extracted
- **🛡️ Fallback Mode** - Works without API keys using pattern-based detection

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure LLM Provider

Copy `.env.example` to `.env` and configure your preferred provider:

```bash
cp .env.example .env
```

**For FREE models (OpenRouter):**
```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```
Get a free key at: https://openrouter.ai/keys

**For Groq (also free tier):**
```env
LLM_PROVIDER=groq
GROQ_API_KEY=gsk-your-key-here
```

**For OpenAI (paid):**
```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
```

### 3. Start the Server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Server runs on `http://localhost:4000`

### 4. Test It

```bash
node test-honeypot.js
```

---

## API Endpoints

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/analyze` | POST | Analyze a message for scam indicators |
| `/honeypot/respond` | POST | Get honeypot reply to scammer message |
| `/mock-scammer` | POST | Get simulated scammer message (for testing) |
| `/analyze-conversation` | POST | Extract intelligence from conversation |

### Conversation Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/conversation/:id` | GET | Retrieve conversation history |
| `/conversation/:id` | DELETE | Delete conversation |
| `/tracker/:id` | GET | Get detailed tracker state |
| `/tracker/:id/terminate` | POST | Manually terminate conversation |

### Monitoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health and LLM status |
| `/config` | GET | Current configuration |
| `/active-conversations` | GET | List active honeypot sessions |
| `/completed-conversations` | GET | List completed sessions with reports |

---

## Usage Examples

### Analyze a Message

```bash
curl -X POST http://localhost:4000/analyze \
  -H "Content-Type: application/json" \
  -d '{"message": "URGENT! Send your OTP code now or lose your account!"}'
```

**Response:**
```json
{
  "success": true,
  "probability": 0.85,
  "scamTypes": ["OTP_THEFT", "URGENCY_MANIPULATION"],
  "isScam": true,
  "confidence": "high",
  "redFlags": ["Requests verification code", "Creates false urgency"],
  "provider": "OpenRouter"
}
```

### Start Honeypot Conversation

```bash
curl -X POST http://localhost:4000/honeypot/respond \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "scam-001",
    "scammerMessage": "Hello! This is Amazon support. We detected suspicious activity."
  }'
```

**Response:**
```json
{
  "success": true,
  "conversationId": "scam-001",
  "status": "active",
  "reply": "Oh hello dear! Amazon you say? My grandson Tommy orders things from there. What seems to be the problem?",
  "agentStatus": {
    "extractionProgress": 25,
    "scammerFrustration": 0,
    "remainingMessages": 28
  }
}
```

### Get Mock Scammer Message (Testing)

```bash
curl -X POST http://localhost:4000/mock-scammer \
  -H "Content-Type: application/json" \
  -d '{"stage": 2}'
```

**Stages:** 0=Initial Contact, 1=Urgency, 2=OTP Request, 3=Pressure, 4=Phishing Link, 5=Final Pressure

---

## Smart Agent Features

The system automatically tracks conversations and terminates when:

| Condition | Threshold |
|-----------|-----------|
| Max messages reached | 30 messages |
| Extraction complete | 75% completeness |
| Max duration | 30 minutes |
| Scammer frustrated | 80% frustration level |
| Inactivity timeout | 5 minutes |

When terminated, you get a **Final Intelligence Report** with:
- Scam type classification
- Requested data types
- Attack vectors (links, phones, emails)
- Psychological techniques used
- Severity assessment
- Recommended actions

---

## Project Structure

```
├── server.js              # Main Express server with all endpoints
├── llm-service.js         # Multi-provider LLM integration
├── extraction-tracker.js  # Smart agent with termination logic
├── test-honeypot.js       # Automated test suite
├── .env                   # Your API keys (not committed)
├── .env.example           # Template with all options
└── package.json           # Dependencies
```

---

## Supported LLM Providers

| Provider | Free Tier | Speed | Get API Key |
|----------|-----------|-------|-------------|
| **OpenRouter** | ✅ Yes | Medium | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Groq** | ✅ Yes | Very Fast | [console.groq.com](https://console.groq.com/keys) |
| **OpenAI** | ❌ Paid | Fast | [platform.openai.com](https://platform.openai.com/api-keys) |
| **Together AI** | Limited | Fast | [together.xyz](https://api.together.xyz/) |
| **Custom** | Varies | Varies | Your own endpoint |

### Free Models on OpenRouter

```
mistralai/mistral-7b-instruct:free
google/gemma-2-9b-it:free
meta-llama/llama-3.2-3b-instruct:free
meta-llama/llama-3.3-70b-instruct:free
qwen/qwen-2-7b-instruct:free
```

---

## Scam Types Detected

- `OTP_THEFT` - Verification code requests
- `PHISHING_LINK` - Malicious URLs
- `URGENCY_MANIPULATION` - "Act now!" pressure
- `FINANCIAL_FRAUD` - Bank/card requests
- `PRIZE_SCAM` - Fake winnings
- `IMPERSONATION` - Brand/government impersonation
- `SOCIAL_ENGINEERING` - Trust manipulation
- `TECH_SUPPORT_SCAM` - Fake tech support

## Psychological Techniques Identified

- `URGENCY` - Time pressure
- `FEAR_OF_LOSS` - Account suspension threats
- `AUTHORITY` - Official impersonation
- `SCARCITY` - "Last chance" tactics
- `TRUST_BUILDING` - Fake rapport
- `INTIMIDATION` - Legal threats

---

## License

ISC

