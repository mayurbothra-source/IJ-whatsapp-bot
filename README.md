# Indo Japan WhatsApp Bot

AI-powered WhatsApp chatbot for Indo Japan Group real estate enquiries.

## How it works
- Tenants message your WhatsApp Business number
- The bot reads your `units.json` and uses Claude AI to answer queries
- Interested leads are captured and you are notified

## Setup

### 1. Clone and install
```bash
git clone https://github.com/mayurbothra-source/ij-whatsapp-bot
cd ij-whatsapp-bot
npm install
```

### 2. Configure environment variables
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

Required values:
- `WHATSAPP_TOKEN` — from Meta Developer Portal (regenerate after sharing)
- `PHONE_NUMBER_ID` — 1086256607903688
- `VERIFY_TOKEN` — indojapan2026 (or any secret string you choose)
- `ANTHROPIC_API_KEY` — from console.anthropic.com

### 3. Deploy to Render (free tier)
1. Push this repo to GitHub
2. Go to render.com → New Web Service
3. Connect your GitHub repo
4. Set environment variables in Render dashboard
5. Deploy — Render gives you a public URL like `https://ij-bot.onrender.com`

### 4. Configure webhook in Meta
1. Go to Meta Developer Portal → WhatsApp → Configuration
2. Webhook URL: `https://your-render-url.onrender.com/webhook`
3. Verify token: `indojapan2026`
4. Subscribe to `messages`

## Updating listings
Edit `units.json` and push to GitHub — Render auto-deploys.
