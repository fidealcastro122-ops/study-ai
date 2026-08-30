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
    const { question, language } = req.body;
    const file = req.file;

    let promptText = question || "";
    if (language) {
      promptText = `[الرد يجب أن يكون حصرياً باللغة: ${language}]\n\n${promptText}`;
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

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
    });

    res.json({ answer: response.text });
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ answer: "حدث خطأ في معالجة الطلب داخل الخادم." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});