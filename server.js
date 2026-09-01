require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const Groq = require("groq-sdk");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn("Warning: GEMINI_API_KEY is missing.");
}

if (!GROQ_API_KEY) {
  console.warn("Warning: GROQ_API_KEY is missing.");
}

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    })
  : null;

const groq = GROQ_API_KEY
  ? new Groq({
      apiKey: GROQ_API_KEY,
    })
  : null;


/*
  Activation codes

  ضع الأكواد في Render Environment Variables
  بهذا الشكل:

  ACTIVATION_CODES=CODE1,CODE2,CODE3,CODE4,CODE5

  يمكنك وضع 10 أكواد أو أكثر.

  مهم:
  هذه النسخة تحفظ الأكواد المستخدمة في ذاكرة السيرفر.
  إذا أُعيد تشغيل السيرفر، ستعود الأكواد غير المحفوظة
  في قاعدة بيانات إلى حالتها الأصلية.

  لمنع ذلك بشكل دائم سنحتاج قاعدة بيانات مثل PostgreSQL.
*/

const activationCodes = new Set(
  (process.env.ACTIVATION_CODES || "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
);

const usedActivationCodes = new Map();


/*
  اختبار السيرفر
*/

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Study AI Pro server is running.",
  });
});


/*
  التحقق من اسم المستخدم وكود التفعيل
*/

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

    console.log(
      `Activation code used: ${code} by ${username}`
    );

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


/*
  إنشاء تعليمات خاصة حسب نوع الشات
*/

function getSystemInstruction(category, language) {
  const languageInstruction =
    language === "ar"
      ? "أجب باللغة العربية ما لم يطلب المستخدم لغة أخرى."
      : "Answer in English unless the user requests another language.";

  const instructions = {
    chat:
      "أنت مساعد أكاديمي ذكي. ساعد الطالب بإجابات واضحة ومنظمة ودقيقة.",

    files:
      "أنت متخصص في تحليل ملفات ومحاضرات الأستاذ. حلل المحتوى المقدم واستخرج المعلومات المهمة، التعاريف، النقاط المتكررة والأسئلة المحتملة.",

    topics:
      "أنت محلل للمواضيع الأكاديمية. حلل المواد والأسئلة لتحديد المواضيع الأكثر تكراراً وأهميتها والأوزان المحتملة.",

    pattern:
      "أنت محلل لنمط أسئلة الأستاذ. حلل الأسئلة السابقة واكتشف طريقة صياغة الأسئلة والمواضيع المتكررة وأنماط الاختبار.",

    predict:
      "أنت مساعد لتحليل احتمالات أسئلة الاختبار. استخدم المواد والأسئلة السابقة لتحديد المواضيع والأسئلة المحتملة، مع توضيح أن التوقعات ليست ضماناً.",

    emergency:
      "أنت مساعد تخطيط دراسي للطوارئ. ساعد الطالب على استغلال الوقت المتبقي بأفضل طريقة، ورتب الأولويات والمواضيع المهمة.",

    quiz:
      "أنت محاكي اختبارات أكاديمي. اطرح أسئلة مناسبة، انتظر إجابات الطالب، صححها، واشرح الأخطاء وسجل نقاط الضعف.",
  };

  return `${instructions[category] || instructions.chat}

${languageInstruction}

لا تدّعي معرفة شيء غير موجود في المعلومات المقدمة.
كن واضحاً ومنظماً ومفيداً.
`;
}


/*
  طلب الذكاء الاصطناعي
*/

app.post("/api/chat", async (req, res) => {
  const message = String(req.body.message || "").trim();
  const username = String(req.body.username || "").trim();
  const model = String(req.body.model || "pro").trim();
  const category = String(req.body.category || "chat").trim();
  const language = String(req.body.language || "ar").trim();

  if (!message) {
    return res.status(400).json({
      success: false,
      message: "Message is required.",
    });
  }

  if (!username) {
    return res.status(401).json({
      success: false,
      message: "User is not authenticated.",
    });
  }

  try {
    const systemInstruction = getSystemInstruction(
      category,
      language
    );

    const fullPrompt = `${systemInstruction}

اسم المستخدم: ${username}

رسالة المستخدم:
${message}`;

    let reply = "";

    /*
      PRO
      Gemini
    */

    if (model === "pro") {
      if (!ai) {
        return res.status(500).json({
          success: false,
          message: "Gemini API key is not configured.",
        });
      }

      const response = await ai.models.generateContent({
        model:
          process.env.GEMINI_MODEL ||
          "gemini-3.7-flash",
        contents: fullPrompt,
      });

      reply = response.text || "";
    }

    /*
      FLASH
      Groq
    */

    else if (model === "flash") {
      if (!groq) {
        return res.status(500).json({
          success: false,
          message: "Groq API key is not configured.",
        });
      }

      const completion =
        await groq.chat.completions.create({
          model:
            process.env.GROQ_MODEL ||
            "llama-3.3-70b-versatile",

          messages: [
            {
              role: "system",
              content: systemInstruction,
            },
            {
              role: "user",
              content: message,
            },
          ],
        });

      reply =
        completion.choices?.[0]?.message?.content ||
        "";
    }

    /*
      نموذج غير معروف
    */

    else {
      return res.status(400).json({
        success: false,
        message: "Invalid AI model.",
      });
    }

    if (!reply.trim()) {
      return res.status(502).json({
        success: false,
        message: "The AI returned an empty response.",
      });
    }

    return res.json({
      success: true,
      reply,
      model,
      category,
    });
  } catch (error) {
    console.error("AI request error:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Failed to process the AI request.",
    });
  }
});


/*
  تشغيل السيرفر
*/

app.listen(PORT, () => {
  console.log(
    `Study AI Pro server running on port ${PORT}`
  );

  console.log(
    `Activation codes loaded: ${activationCodes.size}`
  );

  console.log(
    `Gemini configured: ${Boolean(GEMINI_API_KEY)}`
  );

  console.log(
    `Groq configured: ${Boolean(GROQ_API_KEY)}`
  );
});
