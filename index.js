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

const units = JSON.parse(fs.readFileSync("./units.json", "utf8"));

function buildSystemPrompt() {
  const available = units.filter((u) => u.status === "Available");
  const unitList = available
    .map(
      (u) =>
        `- ${u.unit} at ${u.property} (${u.location}): ${u.furnishing}, ${u.area.toLocaleString()} sq ft, Rs.${u.rent.toLocaleString()}/month. Floor: ${u.floor === 0 || u.floor === "G" ? "Ground" : u.floor}. Amenities: ${u.amenities.join(", ")}. ${u.description}`
    )
    .join("\n");

  return `You are a helpful real estate assistant for Indo Japan Group, a reputable commercial real estate company in Kolkata, India. You help prospective tenants find office, retail, and co-working spaces.

AVAILABLE UNITS:
${unitList}

CONTACT INFORMATION:
- Primary contact: Mayur Bothra
- WhatsApp/Phone: +91 98364 62987
- Website: www.indojapan.in (for photos, more information and other details about the properties)

INSTRUCTIONS:
- Be warm, professional, and concise - this is WhatsApp, keep replies brief and clear
- Only discuss units listed above as Available - do not mention or make up other units
- Always mention the rent, area, furnishing type and key amenities when describing a unit
- When someone asks for photos or more information about a property, share the website: www.indojapan.in
- When someone shows interest in a unit or wants to visit, ask for their name and tell them to contact Mayur Bothra directly on +91 98364 62987
- If asked something you don't know, say to contact Mayur Bothra on +91 98364 62987
- Do not make up any information - only share what is listed above
- Prices are in Indian Rupees per month
- Indo Japan House is located in Salt Lake Sector 5, Kolkata
- Indo Japan Silicon is located in New Town (Bengal Silicon Valley), Kolkata
- Do not use markdown formatting like **bold** or *italic* - write in plain text only`;
}

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

async function askGemini(userMessage, conversationHistory, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: buildSystemPrompt(),
      });

      const history = conversationHistory.slice(0, -1).map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

      const chat = model.startChat({ history });
      const result = await chat.sendMessage(userMessage);
      return result.response.text();
    } catch (err) {
      console.error(`Gemini error (attempt ${attempt}):`, err.message);
      if (attempt < retries) {
        await new Promise(res => setTimeout(res, 3000 * attempt));
      }
    }
  }
  return "Sorry, I am having trouble responding right now. Please contact Mayur Bothra directly on +91 98364 62987";
}

const conversations = {};

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

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== "whatsapp_business_account") return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return;

    const message = messages[0];
    const from = message.from;
    const msgType = message.type;

    if (msgType !== "text") {
      await sendMessage(from, "Hi! I can only handle text messages right now. Please type your query and I will help you. For more information visit www.indojapan.in or contact Mayur Bothra on +91 98364 62987");
      return;
    }

    const userText = message.text.body;
    console.log(`Message from ${from}: ${userText}`);

    if (!conversations[from]) conversations[from] = [];
    conversations[from].push({ role: "user", content: userText });
    if (conversations[from].length > 10) conversations[from] = conversations[from].slice(-10);

    const reply = await askGemini(userText, conversations[from]);
    conversations[from].push({ role: "assistant", content: reply });

    await sendMessage(from, reply);
    console.log(`Reply to ${from}: ${reply}`);

  } catch (err) {
    console.error("Webhook error:", err);
  }
});

app.get("/", (req, res) => {
  res.json({ status: "Indo Japan WhatsApp Bot is running", units: units.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot server running on port ${PORT}`);
});
