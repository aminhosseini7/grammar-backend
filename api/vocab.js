// api/vocab.js
// Serverless function on Vercel for VOCAB explanations
// از همان تنظیمات HuggingFace که در grammar.js استفاده می‌کنی

const ALLOWED_ORIGIN = "https://aminhosseini7.github.io";

// همون URL و مدل grammar.js
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL_ID = "HuggingFaceTB/SmolLM3-3B:hf-inference";

module.exports = async (req, res) => {
  // ----- CORS -----
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

  const { word } = req.body || {};
  const trimmed = (word || "").trim();

  if (!trimmed) {
    return res.status(400).json({ error: "Field 'word' is required" });
  }

  const apiToken = process.env.HF_API_TOKEN;
  if (!apiToken) {
    return res
      .status(500)
      .json({ error: "Server misconfigured: no HF_API_TOKEN" });
  }

  // ----- Prompt -----
  const systemPrompt = `
You are an English–Persian vocabulary tutor.

You receive ONE English word and you must return a JSON object with these fields:

{
  "meaning_fa": "short Persian meaning of the word",
  "example_en": "a simple English sentence using the word",
  "usage_fa": "a short Persian explanation of how the word is used in context",
  "note": "a short, friendly mnemonic in Persian to help remember the word"
}

Rules:
- Answer ONLY valid JSON, no backticks, no markdown, no extra text.
- Use simple, clear Persian so an upper-intermediate learner can understand.
`.trim();

  const userPrompt = `
Word: "${trimmed}"
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
        temperature: 0.5,
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

    // ساختار OpenAI-style
    let content =
      hfData?.choices?.[0]?.message?.content &&
      String(hfData.choices[0].message.content).trim();

    if (!content) {
      return res.status(500).json({
        error: "Empty response from model",
        raw: hfData,
      });
    }

    // فقط بخش JSON را نگه می‌داریم
    let parsed;
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error("No JSON object found in content");
      }
      const jsonText = match[0];
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return res.status(500).json({
        error: "Model did not return valid JSON",
        raw: content,
        detail: String(e),
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
