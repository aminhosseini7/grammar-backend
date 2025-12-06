// api/grammar.js
// Serverless function on Vercel for grammar checking
// using Hugging Face Inference API (router) + CORS for GitHub Pages

const ALLOWED_ORIGIN = "https://aminhosseini7.github.io";

// مدل متنی که می‌خوایم استفاده کنیم
const HF_MODEL_ID = "google/flan-t5-large";
// آدرس جدید Router هاگینگ‌فیس
const HF_API_URL = `https://router.huggingface.co/hf-inference/models/${HF_MODEL_ID}`;

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, level = "B1" } = req.body || {};

  if (!text) {
    return res.status(400).json({ error: "Field 'text' is required" });
  }

  const apiToken = process.env.HF_API_TOKEN;
  if (!apiToken) {
    return res.status(500).json({ error: "Server misconfigured: no HF_API_TOKEN" });
  }

  const prompt = `
You are an English grammar tutor. The learner's CEFR level is ${level}.

Analyze the following text, correct it if needed, and explain the errors.

You MUST return ONLY valid JSON with this exact schema and nothing else:

{
  "corrected": "string",
  "errors_explained_fa": "string (Persian explanation of the errors, simple but formal)",
  "errors_explained_en": "string (English explanation of the errors)",
  "examples": ["example sentence 1", "example sentence 2"],
  "suggested_practice": "short Persian instruction for a practice task"
}

Learner text:
"""${text}""".
  `.trim();

  try {
    const resp = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // طبق مستندات Router:
        // https://router.huggingface.co/hf-inference/models/{model_id}
        inputs: prompt,
        parameters: {
          max_new_tokens: 512,
          temperature: 0.4,
        },
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(500).json({
        error: "HuggingFace API error",
        status: resp.status,
        detail: errText,
      });
    }

    const hfData = await resp.json();

    // ساختار معمول پاسخ text-generation/text2text از Inference:
    // [ { "generated_text": "..." } ]
    let generated = "";
    if (Array.isArray(hfData) && hfData.length > 0) {
      generated =
        hfData[0].generated_text ||
        hfData[0].summary_text ||
        "";
    } else if (typeof hfData === "object" && hfData !== null) {
      generated =
        hfData.generated_text ||
        hfData.summary_text ||
        "";
    }

    const content = (generated || "").trim();

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return res.status(500).json({
        error: "Model did not return valid JSON",
        raw: content,
      });
    }

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({
      error: "Request to HuggingFace failed",
      detail: String(e),
    });
  }
};
