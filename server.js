require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");
const OpenAI = require("openai");

const app = express();

app.use(cors());
app.use(express.json({ limit: "60mb" }));

const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.7-flash";
const XAI_MODEL = process.env.XAI_MODEL || "grok-4.6";

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

const VALID_CATEGORIES = new Set([
  "chat",
  "files",
  "topics",
  "pattern",
  "predict",
  "emergency",
  "quiz",
]);

const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_SIZE = 12 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 35 * 1024 * 1024;

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Study AI Pro server is running.",
    geminiModel: GEMINI_MODEL,
    xaiModel: XAI_MODEL,
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    server: true,
    gemini: Boolean(GEMINI_API_KEY),
    xai: Boolean(XAI_API_KEY),
    models: {
      pro: GEMINI_MODEL,
      fast: XAI_MODEL,
    },
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

function getCategoryInstruction(category, language) {
  const instructions = {
    chat: {
      ar: `
أنت Study AI Pro، مساعد أكاديمي ذكي ومحترف.

ساعد الطالب في الدراسة والفهم والتحليل وحل المشكلات الأكاديمية.
اشرح بطريقة واضحة ومنظمة، ولا تعطِ إجابات عشوائية.
إذا كانت المسألة تحتاج خطوات، اعرضها خطوة بخطوة.
إذا كان السؤال غير واضح، اطلب المعلومة الناقصة فقط.
`,
      en: `
You are Study AI Pro, a professional academic AI assistant.

Help the student with studying, understanding, analysis, problem solving, and academic questions.
Give clear and structured explanations.
When a problem requires steps, explain it step by step.
If the question is unclear, request only the missing information.
`,
    },

    files: {
      ar: `
أنت محلل ملفات ومحاضرات أكاديمية متخصص.

حلل الملفات أو النصوص التي يرسلها الطالب.
استخرج:
- أهم المعلومات
- التعاريف
- المفاهيم
- القواعد
- النقاط المتكررة
- النقاط التي تبدو مهمة للاختبار
- الأسئلة المحتملة
- نقاط الضعف أو المعلومات غير الواضحة

لا تخترع معلومات غير موجودة في الملف.
إذا لم تجد معلومة، قل بوضوح إنها غير موجودة.
`,
      en: `
You are a specialized academic file and lecture analyst.

Analyze files or text provided by the student.
Extract:
- Important information
- Definitions
- Concepts
- Rules
- Repeated points
- Potentially important exam points
- Possible questions
- Weak or unclear areas

Do not invent information that is not present in the provided material.
If something is not found, clearly say that it is not present.
`,
    },

    topics: {
      ar: `
أنت محلل للمواضيع الأكاديمية.

حلل المادة والأسئلة والملفات لتحديد:
- المواضيع الأكثر تكراراً
- المواضيع الأكثر أهمية
- المواضيع المرتبطة ببعضها
- المواضيع التي تحتاج مراجعة
- ترتيب الأولوية في الدراسة

قدم تحليلاً عملياً يساعد الطالب على تحديد ماذا يدرس أولاً.
`,
      en: `
You are an academic topic analyst.

Analyze the provided material, questions, and files to identify:
- Most repeated topics
- Most important topics
- Related topics
- Topics that need review
- Study priority order

Provide practical analysis that helps the student decide what to study first.
`,
    },

    pattern: {
      ar: `
أنت محلل محترف لنمط أسئلة الأستاذ والاختبارات.

حلل الأسئلة السابقة لاكتشاف:
- طريقة صياغة الأسئلة
- أنواع الأسئلة
- المواضيع المتكررة
- مستوى الصعوبة
- الكلمات والمفاهيم التي تتكرر
- الأنماط المحتملة في الاختبار القادم

لا تدّعِ معرفة الاختبار الحقيقي.
قدم استنتاجات مبنية فقط على البيانات المتاحة.
`,
      en: `
You are a professional professor-exam pattern analyst.

Analyze previous questions to identify:
- Question wording style
- Question types
- Repeated topics
- Difficulty level
- Repeated concepts and keywords
- Possible patterns for the next exam

Never claim to know the actual exam.
Base conclusions only on the available evidence.
`,
    },

    predict: {
      ar: `
أنت مساعد متخصص في تحليل احتمالات أسئلة الاختبار.

استخدم المواد والأسئلة السابقة لتحديد:
- المواضيع ذات الاحتمالية الأعلى
- الأسئلة المحتملة
- المفاهيم التي يجب مراجعتها
- الأسباب التي جعلت هذه المواضيع مهمة
- درجة الثقة في كل توقع

مهم جداً:
التوقعات ليست ضماناً ولا تعني أنك تعرف الاختبار الحقيقي.
يجب توضيح مستوى الثقة بناءً على الأدلة.
`,
      en: `
You are an exam-question probability analysis assistant.

Use previous materials and questions to identify:
- Higher-probability topics
- Possible questions
- Concepts that should be reviewed
- Reasons why these topics appear important
- Confidence level for each prediction

Important:
Predictions are not guarantees and do not mean you know the actual exam.
Explain confidence based on available evidence.
`,
    },

    emergency: {
      ar: `
أنت مساعد تخطيط دراسي للطوارئ.

إذا كان الطالب لديه وقت قليل قبل الاختبار:
- حدد الأولويات
- رتب المواضيع
- اقترح خطة زمنية
- ركز على أعلى قيمة دراسية
- تجنب إضاعة الوقت على التفاصيل منخفضة الأولوية
- اقترح مراجعة سريعة واختباراً ذاتياً

اجعل الخطة عملية وقابلة للتنفيذ.
`,
      en: `
You are an emergency study planning assistant.

When the student has limited time before an exam:
- Identify priorities
- Rank topics
- Suggest a time-based plan
- Focus on the highest-value material
- Avoid wasting time on low-priority details
- Suggest rapid review and self-testing

Make the plan practical and executable.
`,
    },

    quiz: {
      ar: `
أنت محاكي اختبارات أكاديمي تفاعلي.

أنشئ أسئلة مناسبة لمستوى الطالب والمواد المقدمة.
لا تعطِ الإجابة مباشرة عندما تطرح السؤال.
انتظر إجابة الطالب ثم:
- صحح الإجابة
- اشرح لماذا
- حدد الخطأ
- أعطِ الإجابة الصحيحة عند الحاجة
- حدد نقطة الضعف
- اقترح سؤالاً تالياً مناسباً

يمكنك استخدام اختيار متعدد، صح وخطأ، أسئلة قصيرة، وأسئلة تحليلية.
`,
      en: `
You are an interactive academic exam simulator.

Create questions appropriate to the student's level and provided material.
Do not reveal the answer immediately after asking a question.
Wait for the student's answer, then:
- Grade it
- Explain why
- Identify the mistake
- Provide the correct answer when needed
- Identify the weak area
- Suggest an appropriate next question

You may use multiple choice, true/false, short answer, and analytical questions.
`,
    },
  };

  const selected = instructions[category] || instructions.chat;

  return language === "en" ? selected.en : selected.ar;
}

function getFormattingInstruction(language) {
  if (language === "en") {
    return `
FORMAT YOUR ANSWERS AS RICH MARKDOWN.

Use:
# / ## / ### headings when appropriate.
**bold** for important concepts.
*italic* for emphasis.
==keyword== to highlight especially important keywords.
- bullet lists.
1. numbered lists.
> blockquotes when useful.
Markdown tables when comparing information.
Fenced code blocks with a language name for code.
Links in standard Markdown format.

You may use these callouts:
> [!NOTE] ...
> [!TIP] ...
> [!WARNING] ...
> [!IMPORTANT] ...
> [!SUMMARY] ...

Keep formatting readable and professional.
Do not overuse headings or emojis.
`;
  }

  return `
نسّق إجاباتك باستخدام Markdown بشكل احترافي وغني.

استخدم:
# / ## / ### للعناوين عند الحاجة.
**النص العريض** للمفاهيم المهمة.
*المائل* للتأكيد.
==الكلمات المهمة== لإبراز الكلمات الأساسية.
- القوائم النقطية.
1. القوائم المرقمة.
> الاقتباسات عند الحاجة.
جداول Markdown عند المقارنة.
كتل كود fenced مع اسم اللغة عند عرض الكود.
روابط Markdown عند الحاجة.

يمكنك استخدام صناديق التنبيه التالية:
> [!NOTE] ...
> [!TIP] ...
> [!WARNING] ...
> [!IMPORTANT] ...
> [!SUMMARY] ...

اجعل التنسيق واضحاً واحترافياً.
لا تكثر من العناوين أو الإيموجي بدون حاجة.
`;
}

function normalizeModel(model) {
  const value = String(model || "")
    .trim()
    .toLowerCase();

  if (value === "pro" || value === "gemini") {
    return "pro";
  }

  if (
    value === "flash" ||
    value === "fast" ||
    value === "grok" ||
    value === "xai"
  ) {
    return "flash";
  }

  return null;
}

function normalizeCategory(category) {
  const value = String(category || "chat").trim().toLowerCase();

  return VALID_CATEGORIES.has(value) ? value : "chat";
}

function normalizeLanguage(language) {
  return String(language || "ar").trim().toLowerCase() === "en"
    ? "en"
    : "ar";
}

function cleanHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => {
      return (
        item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim()
      );
    })
    .slice(-16)
    .map((item) => ({
      role: item.role,
      content: item.content.slice(0, 12000),
    }));
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") {
    return null;
  }

  const match = dataUrl.match(
    /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/s
  );

  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .slice(0, MAX_ATTACHMENTS)
    .filter((file) => {
      return (
        file &&
        typeof file.name === "string" &&
        typeof file.type === "string" &&
        typeof file.dataUrl === "string"
      );
    })
    .map((file) => {
      const parsed = parseDataUrl(file.dataUrl);

      if (!parsed) {
        return null;
      }

      const buffer = Buffer.from(parsed.base64, "base64");

      if (!buffer.length || buffer.length > MAX_ATTACHMENT_SIZE) {
        return null;
      }

      return {
        name: file.name.slice(0, 180),
        type: file.type || parsed.mimeType,
        mimeType: parsed.mimeType,
        dataUrl: file.dataUrl,
        buffer,
        size: buffer.length,
      };
    })
    .filter(Boolean)
    .filter((file, index, array) => {
      const total = array
        .slice(0, index + 1)
        .reduce((sum, current) => sum + current.size, 0);

      return total <= MAX_TOTAL_ATTACHMENT_SIZE;
    });
}

function buildHistoryText(history) {
  if (!history.length) {
    return "";
  }

  return history
    .map((item) => {
      const role = item.role === "user" ? "USER" : "ASSISTANT";
      return `${role}:\n${item.content}`;
    })
    .join("\n\n");
}

function extractXaiResponseText(response) {
  if (!response) {
    return "";
  }

  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const pieces = [];

  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (!item) {
        continue;
      }

      if (typeof item.text === "string") {
        pieces.push(item.text);
      }

      if (Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content && typeof content.text === "string") {
            pieces.push(content.text);
          }
        }
      }
    }
  }

  return pieces.join("\n").trim();
}

async function uploadFileToXai(file) {
  if (!XAI_API_KEY) {
    throw new Error("xAI API key is not configured.");
  }

  const form = new FormData();

  form.append("purpose", "assistants");

  const blob = new Blob([file.buffer], {
    type: file.mimeType || file.type || "application/octet-stream",
  });

  form.append("file", blob, file.name);

  const response = await fetch("https://api.x.ai/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: form,
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        data?.message ||
        `xAI file upload failed with status ${response.status}.`
    );
  }

  return data;
}

async function deleteXaiFile(fileId) {
  if (!XAI_API_KEY || !fileId) {
    return;
  }

  try {
    await fetch(`https://api.x.ai/v1/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
    });
  } catch (error) {
    console.warn("Could not delete temporary xAI file:", error.message);
  }
}

async function generateWithGemini({
  username,
  message,
  history,
  attachments,
  systemInstruction,
  language,
}) {
  if (!ai) {
    throw new Error("Gemini API key is not configured.");
  }

  const parts = [];

  const historyText = buildHistoryText(history);

  let prompt = `${systemInstruction}

${getFormattingInstruction(language)}

اسم المستخدم:
${username}

`;

  if (historyText) {
    prompt += `سجل المحادثة السابقة:
${historyText}

`;
  }

  prompt += `رسالة المستخدم الحالية:
${message || "يرجى تحليل الملفات المرفقة."}`;

  parts.push({
    text: prompt,
  });

  for (const attachment of attachments) {
    parts.push({
      inlineData: {
        mimeType: attachment.mimeType,
        data: attachment.buffer.toString("base64"),
      },
    });
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts,
      },
    ],
  });

  return response.text || "";
}

async function generateWithXai({
  username,
  message,
  history,
  attachments,
  systemInstruction,
  language,
}) {
  if (!xaiClient) {
    throw new Error("xAI API key is not configured.");
  }

  const uploadedFileIds = [];

  try {
    const historyText = buildHistoryText(history);

    const textParts = [
      systemInstruction,
      getFormattingInstruction(language),
      `Username: ${username}`,
    ];

    if (historyText) {
      textParts.push(`Previous conversation:\n${historyText}`);
    }

    textParts.push(
      `Current user message:\n${message || "Please analyze the attached files."}`
    );

    const inputContent = [
      {
        type: "input_text",
        text: textParts.join("\n\n"),
      },
    ];

    for (const attachment of attachments) {
      const isImage = attachment.mimeType.startsWith("image/");

      if (isImage) {
        inputContent.push({
          type: "input_image",
          image_url: attachment.dataUrl,
        });

        inputContent.push({
          type: "input_text",
          text: `Attached image filename: ${attachment.name}`,
        });

        continue;
      }

      const uploaded = await uploadFileToXai(attachment);

      const fileId = uploaded?.id;

      if (!fileId) {
        throw new Error(
          `xAI did not return a file ID for "${attachment.name}".`
        );
      }

      uploadedFileIds.push(fileId);

      inputContent.push({
        type: "input_file",
        file_id: fileId,
      });

      inputContent.push({
        type: "input_text",
        text: `Attached file filename: ${attachment.name}`,
      });
    }

    const response = await xaiClient.responses.create({
      model: XAI_MODEL,
      input: [
        {
          role: "user",
          content: inputContent,
        },
      ],
    });

    return extractXaiResponseText(response);
  } finally {
    for (const fileId of uploadedFileIds) {
      await deleteXaiFile(fileId);
    }
  }
}

app.post("/api/chat", async (req, res) => {
  const message = String(req.body.message || "").trim();

  const username = String(req.body.username || "").trim();

  const requestedModel = String(req.body.model || "pro").trim();

  const model = normalizeModel(requestedModel);

  const category = normalizeCategory(req.body.category);

  const language = normalizeLanguage(req.body.language);

  const history = cleanHistory(req.body.history);

  const attachments = normalizeAttachments(req.body.attachments);

  if (!message && attachments.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Message or attachment is required.",
    });
  }

  if (!username) {
    return res.status(401).json({
      success: false,
      message: "User is not authenticated.",
    });
  }

  if (!model) {
    return res.status(400).json({
      success: false,
      message: "Invalid AI model.",
    });
  }

  if (
    Array.isArray(req.body.attachments) &&
    req.body.attachments.length > MAX_ATTACHMENTS
  ) {
    return res.status(400).json({
      success: false,
      message: `Maximum ${MAX_ATTACHMENTS} attachments are allowed.`,
    });
  }

  if (
    Array.isArray(req.body.attachments) &&
    attachments.length !== req.body.attachments.length
  ) {
    return res.status(400).json({
      success: false,
      message:
        "One or more attachments are invalid or exceed the allowed size.",
    });
  }

  try {
    const systemInstruction = getCategoryInstruction(category, language);

    let reply = "";

    if (model === "pro") {
      reply = await generateWithGemini({
        username,
        message,
        history,
        attachments,
        systemInstruction,
        language,
      });
    }

    if (model === "flash") {
      reply = await generateWithXai({
        username,
        message,
        history,
        attachments,
        systemInstruction,
        language,
      });
    }

    if (!reply || !reply.trim()) {
      return res.status(502).json({
        success: false,
        message: "The AI returned an empty response.",
      });
    }

    return res.json({
      success: true,
      reply: reply.trim(),
      model,
      category,
    });
  } catch (error) {
    console.error("AI request error:", error);

    const errorMessage =
      error?.response?.data?.error?.message ||
      error?.error?.message ||
      error?.message ||
      "Failed to process the AI request.";

    return res.status(500).json({
      success: false,
      message: errorMessage,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Study AI Pro server running on port ${PORT}`);
  console.log(`Activation codes loaded: ${activationCodes.size}`);
  console.log(`Gemini configured: ${Boolean(GEMINI_API_KEY)}`);
  console.log(`Gemini model: ${GEMINI_MODEL}`);
  console.log(`xAI configured: ${Boolean(XAI_API_KEY)}`);
  console.log(`xAI model: ${XAI_MODEL}`);
});
