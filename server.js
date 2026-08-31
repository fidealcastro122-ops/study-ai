require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const { Groq } = require('groq-sdk');

const app = express();
app.use(cors());
app.use(express.json());

// تهيئة النماذج المجانية باستخدام المفاتيح من ملف الـ .env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.post('/api/chat', async (req, res) => {
  const { question, mode } = req.body;
  
  try {
    let fullText = "";

    // استخدام Groq للسرعة الفائقة أو وضع الطوارئ
    if (mode === 'fast' || mode === 'survival') {
      const completion = await groq.chat.completions.create({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: question }],
      });
      fullText = completion.choices[0]?.message?.content || "";
      
    } else {
      // الوضع الافتراضي عبر Gemini لتحليل الملفات والمحتوى
      const response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: question,
      });
      fullText = response.text;
    }

    res.json({ text: fullText });
  } catch (error) {
    console.error("Multi-AI Error:", error);
    res.status(500).json({ error: "فشل في معالجة الطلب" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Free Multi-AI Server running on port ${PORT}`));
