// api/vocab.js
// توليد معنی، مثال، کاربرد و نکته برای يک لغت
// با HuggingFace Router (OpenAI-style) + CORS برای GitHub Pages

const ALLOWED_ORIGIN = "https://aminhosseini7.github.io";

// HF Router – OpenAI-compatible endpoint
const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
// مدلی که روی HF در دسترس است
const HF_MODEL_ID = "HuggingFaceTB/SmolLM3-3B:hf-inference";

module.exports = async (req, res) => {
  // ---------- CORS ----------
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

  // ---------- ورودی ----------
  const { word } = req.body || {};
  if (!word || typeof word !== "string") {
    return res.status(400).json({ error: "Field 'word' (string) is required" });
  }

  const apiToken = process.env.HF_API_TOKEN;
  if (!apiToken) {
    return res
      .status(500)
      .json({ error: "Server misconfigured: no HF_API_TOKEN" });
  }

  // ---------- پرامپت سیستم ----------
  const systemPrompt = `
You are an English vocabulary tutor for Persian learners.

For a given English word, you MUST respond ONLY with a single valid JSON object.
No backticks, no extra text. EXACT SCHEMA:

{
  "meaning_fa": "short Persian meaning of the word (1–2 phrases)",
  "example_en": "one simple English example sentence using the word",
  "usage_fa": "1–2 short Persian sentences about how and when this word is used",
  "note": "a very short fun mnemonic or memory tip in Persian (optional but recommended)"
}

All Persian text must be in Persian (Farsi), UTF-8.
Use clear, simple, formal–friendly language suitable for an adult learner.
If the word is a phrase (like 'status quo', 'bear on', 'set up'), explain and give an example for that phrase.
  `.trim();

  const userPrompt = `
Word: "${word}"

Please fill ALL fields in the JSON.
  `.trim();

  try {
    // ---------- درخواست به HuggingFace ----------
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

    let content =
      hfData?.choices?.[0]?.message?.content &&
      String(hfData.choices[0].message.content).trim();

    if (!content) {
      return res.status(500).json({
        error: "Empty response from model",
        raw: hfData,
      });
    }

    // ---------- استخراج JSON از خروجی مدل ----------
    let parsed;
    try {
      // در صورت وجود <think>...</think> فقط آبجکت JSON را جدا می‌کنیم
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

    // ---------- نرمال‌سازی خروجی ----------
    const result = {
      word,
      meaning_fa:
        (parsed.meaning_fa || parsed.fa_meaning || parsed.meaning || "").trim(),
      example_en:
        (parsed.example_en || parsed.example || parsed.exampleEn || "").trim(),
      usage_fa:
        (parsed.usage_fa || parsed.usage || parsed.fa_usage || "").trim(),
      note: (parsed.note || parsed.memory_tip || "").trim(),
    };

    // اگر همه‌چیز خالی بود، حداقل یک پیام خطا بدهیم
    if (
      !result.meaning_fa &&
      !result.example_en &&
      !result.usage_fa &&
      !result.note
    ) {
      return res.status(500).json({
        error: "Model returned empty fields",
        raw: parsed,
      });
    }

    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({
      error: "Request to HuggingFace failed",
      detail: String(e),
    });
  }
};
