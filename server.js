const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { GoogleGenAI } = require("@google/genai");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post("/api/chat", upload.single("file"), async (req, res) => {
  try {
    const { question, language, mode } = req.body;
    const file = req.file;

    let promptText = question || "";
    if (mode === "teacher_analysis") {
      promptText = `[Teacher Analysis Mode]: Based on previous files or questions, analyze the professor's style, question patterns, and expected exam topics:\n\n${promptText}`;
    }

    let contents = [promptText];
    if (file) {
      contents.push({
        inlineData: {
          data: file.buffer.toString("base64"),
          mimeType: file.mimetype,
        },
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.6-flash",
      contents: contents,
    });

    for await (const chunk of responseStream) {
      if (chunk.text) {
        res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).write(`data: ${JSON.stringify({ text: "Error processing request." })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
