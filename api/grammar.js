// api/grammar.js
// Serverless function on Vercel for grammar checking
// using Hugging Face Router (OpenAI-compatible) + CORS for GitHub Pages

const ALLOWED_ORIGIN = "https://aminhosseini7.github.io";

// HF Router (OpenAI-style)
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
// مدلی که روی HF Inference API در دسترس است
const HF_MODEL_ID = "HuggingFaceTB/SmolLM3-3B:hf-inference";

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
    return res
      .status(500)
      .json({ error: "Server misconfigured: no HF_API_TOKEN" });
  }

  // پرامپت سیستم: به مدل می‌گوید فقط JSON بدهد
  const systemPrompt = `
You are an English grammar tutor. The learner's CEFR level is ${level}.

You must analyze the learner's text, correct it if needed, and explain the errors.

You MUST reply with ONLY valid JSON (no backticks, no extra text) in EXACTLY this schema:

{
  "corrected": "string",
  "errors_explained_fa": "string (Persian explanation of the errors, simple but formal)",
  "errors_explained_en": "string (English explanation of the errors)",
  "examples": ["example sentence 1", "example sentence 2"],
  "suggested_practice": "short Persian instruction for a practice task"
}
`.trim();

  const userPrompt = `
Learner level: ${level}

Learner text:
"""${text}"""
`.trim();

  try {
    const resp = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_MODEL_ID,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
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

    // ساختار OpenAI-style:
    // { choices: [ { message: { content: "..." } } ] }
    let content =
      hfData?.choices?.[0]?.message?.content &&
      String(hfData.choices[0].message.content).trim();

    if (!content) {
      return res.status(500).json({
        error: "Empty response from model",
        raw: hfData,
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // اگر مدل به‌جای JSON متن معمولی برگرداند، برای دیباگ خام را می‌فرستیم
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
