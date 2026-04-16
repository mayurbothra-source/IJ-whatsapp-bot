const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(express.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Load units data
const units = JSON.parse(fs.readFileSync("./units.json", "utf8"));

// Build system prompt with live unit data
function buildSystemPrompt() {
  const available = units.filter((u) => u.status === "Available");
  const unitList = available
    .map(
      (u) =>
        `- ${u.unit} at ${u.property} (${u.location}): ${u.type}, ${u.area.toLocaleString()} sq ft, ₹${u.rent.toLocaleString()}/month. Floor: ${u.floor === 0 ? "Ground" : u.floor}. Amenities: ${u.amenities.join(", ")}. ${u.description} Map: ${u.mapLink}`
    )
    .join("\n");

  return `You are a helpful real estate assistant for Indo Japan Group, a reputable commercial real estate company in Kolkata, India. You help prospective tenants find office, retail, and co-working spaces.

AVAILABLE UNITS:
${unitList}

INSTRUCTIONS:
- Be warm, professional, and concise — this is WhatsApp, so keep replies brief and clear
- When someone asks about available spaces, list the relevant options clearly
- Always mention the rent, area, and key amenities
- For location queries, share the Google Maps link
- If someone is interested in a unit, ask for their name and contact number and say the team will follow up within 24 hours
- If asked something you don't know, say "Please contact us directly at mayurbothra@live.com"
- Do not make up information about units that aren't listed
- Prices are in Indian Rupees (₹) per month
- You represent Indo Japan Group — Indo Japan House is in Salt Lake Sector V and Indo Japan Silicon is in New Town`;
}

// Send WhatsApp message
async function sendMessage(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("Error sending message:", err.response?.data || err.message);
  }
}

// Call Gemini AI
async function askGemini(userMessage, conversationHistory) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: buildSystemPrompt(),
    });

    // Convert history to Gemini format (exclude the latest user message)
    const history = conversationHistory.slice(0, -1).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(userMessage);
    return result.response.text();
  } catch (err) {
    console.error("Gemini error:", err.message);
    return "Sorry, I'm having trouble responding right now. Please contact us at mayurbothra@live.com";
  }
}

// Store conversation history per user (in-memory, resets on server restart)
const conversations = {};

// Webhook verification (Meta calls this when you configure the webhook)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified successfully");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receive incoming WhatsApp messages
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Always respond immediately to Meta

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return;

    const message = messages[0];
    const from = message.from; // sender's phone number
    const msgType = message.type;

    if (msgType !== "text") {
      await sendMessage(from, "Hi! I can only handle text messages right now. Please type your query and I'll help you.");
      return;
    }

    const userText = message.text.body;
    console.log(`Message from ${from}: ${userText}`);

    // Maintain conversation history (last 10 messages)
    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: "user", content: userText });
    if (conversations[from].length > 10) conversations[from] = conversations[from].slice(-10);

    // Get Gemini's reply
    const reply = await askGemini(userText, conversations[from]);

    // Store assistant reply in history
    conversations[from].push({ role: "assistant", content: reply });

    // Send reply back to user
    await sendMessage(from, reply);
    console.log(`Reply to ${from}: ${reply}`);

  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Indo Japan WhatsApp Bot is running", units: units.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
});
