require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("Warning: GEMINI_API_KEY is missing.");
}

if (!XAI_API_KEY) {
  console.warn("Warning: XAI_API_KEY is missing.");
}

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    })
  : null;

const xaiClient = XAI_API_KEY
  ? new OpenAI({
      apiKey: XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    })
  : null;

const activationCodes = new Set(
  (process.env.ACTIVATION_CODES || "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
);

const usedActivationCodes = new Map();

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Study AI Pro server is running.",
  });
});

app.post("/api/verify", (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const code = String(req.body.code || "")
      .trim()
      .toUpperCase();

    if (!username || !code) {
      return res.status(400).json({
        success: false,
        message: "Username and activation code are required.",
      });
    }

    if (username.length < 2 || username.length > 40) {
      return res.status(400).json({
        success: false,
        message: "Invalid username.",
      });
    }

    if (!activationCodes.has(code)) {
      return res.status(401).json({
        success: false,
        message: "Invalid activation code.",
      });
    }

    if (usedActivationCodes.has(code)) {
      return res.status(409).json({
        success: false,
        message: "This activation code has already been used.",
      });
    }

    usedActivationCodes.set(code, {
      username,
      usedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: "Account activated successfully.",
      username,
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Verification server error.",
    });
  }
});

function getSystemInstruction(category, language) {
  const languageInstruction =
    language === "ar"
      ? "أجب باللغة العربية ما لم يطلب المستخدم لغة أخرى."
      : "Answer in English unless the user requests another language.";

  const instructions = {
    chat: "أنت مساعد أكاديمي ذكي ومحترف. ساعد الطالب بإجابات واضحة ومنظمة ودقيقة.",
    files: "أنت متخصص في تحليل ملفات ومحاضرات الأستاذ. حلل المحتوى المقدم واستخرج المعلومات المهمة، التعاريف، النقاط المتكررة والأسئلة المحتملة.",
    topics: "أنت محلل للمواضيع الأكاديمية. حلل المواد والأسئلة لتحديد المواضيع الأكثر تكراراً وأهميتها والأوزان المحتملة.",
    pattern: "أنت محلل لنمط أسئلة الأستاذ. حلل الأسئلة السابقة واكتشف طريقة صياغة الأسئلة والمواضيع المتكررة وأنماط الاختبار.",
    predict: "أنت مساعد لتحليل احتمالات أسئلة الاختبار. استخدم المواد والأسئلة السابقة لتحديد المواضيع والأسئلة المحتملة، مع توضيح أن التوقعات ليست ضماناً.",
    emergency: "أنت مساعد تخطيط دراسي للطوارئ. ساعد الطالب على استغلال الوقت المتبقي بأفضل طريقة، ورتب الأولويات والمواضيع المهمة.",
    quiz: "أنت محاكي اختبارات أكاديمي. اطرح أسئلة مناسبة، انتظر إجابات الطالب، صححها، واشرح الأخطاء وسجل نقاط الضعف.",
  };

  return `${instructions[category] || instructions.chat}\n\n${languageInstruction}\n\nلا تدّعي معرفة شيء غير موجود في المعلومات المقدمة.\nكن واضحاً ومنظماً ومفيداً.`;
}

app.post("/api/chat", async (req, res) => {
  const message = String(req.body.message || "").trim();
  const username = String(req.body.username || "").trim();
  const model = String(req.body.model || "pro").trim();
  const category = String(req.body.category || "chat").trim();
  const language = String(req.body.language || "ar").trim();

  if (!message) {
    return res.status(400).json({ success: false, message: "Message is required." });
  }

  if (!username) {
    return res.status(401).json({ success: false, message: "User is not authenticated." });
  }

  try {
    const systemInstruction = getSystemInstruction(category, language);
    let reply = "";

    if (model === "pro") {
      if (!ai) {
        return res.status(500).json({ success: false, message: "Gemini API key is not configured." });
      }

      const fullPrompt = `${systemInstruction}\n\nاسم المستخدم: ${username}\n\nرسالة المستخدم:\n${message}`;
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        contents: fullPrompt,
      });

      reply = response.text || "";
    } else if (model === "flash") {
      if (!xaiClient) {
        return res.status(500).json({ success: false, message: "xAI API key is not configured." });
      }

      const completion = await xaiClient.chat.completions.create({
        model: process.env.XAI_MODEL || "grok-2",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: message },
        ],
      });

      reply = completion.choices?.[0]?.message?.content || "";
    } else {
      return res.status(400).json({ success: false, message: "Invalid AI model." });
    }

    if (!reply.trim()) {
      return res.status(502).json({ success: false, message: "The AI returned an empty response." });
    }

    return res.json({ success: true, reply, model, category });
  } catch (error) {
    console.error("AI request error:", error);
    return res.status(500).json({ success: false, message: error?.message || "Failed to process the AI request." });
  }
});

app.listen(PORT, () => {
  console.log(`Study AI Pro server running on port ${PORT}`);
  console.log(`Activation codes loaded: ${activationCodes.size}`);
  console.log(`Gemini configured: ${Boolean(GEMINI_API_KEY)}`);
  console.log(`xAI configured: ${Boolean(XAI_API_KEY)}`);
});
