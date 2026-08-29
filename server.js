const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("GEMINI_API_KEY is missing.");
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey,
});

const MODEL = "gemini-3.6-flash";

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Study AI server is running",
    model: MODEL,
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    console.log(`Sending request to ${MODEL}...`);

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: message,
      config: {
        thinkingConfig: {
          thinkingLevel: "low",
        },
      },
    });

    console.log("Gemini response received.");

    res.json({
      success: true,
      reply: response.text,
    });
  } catch (error) {
    console.error("Gemini error:", error);

    res.status(500).json({
      success: false,
      error: error.message || "Gemini request failed",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Study AI server running on http://0.0.0.0:${PORT}`);
  console.log(`Using model: ${MODEL}`);
});