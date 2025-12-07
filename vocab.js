// api/vocab.js
// بک‌اند تولید معنی و مثال و نکته برای واژگان

export default async function handler(req, res) {
  // فقط POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { word } = req.body || {};

  if (!word || typeof word !== "string") {
    return res.status(400).json({ error: "Missing 'word' in body" });
  }

  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing HUGGINGFACE_API_KEY",
    });
  }

  const prompt = `
You are an English–Persian vocabulary tutor.

For the English word "${word}", produce a VALID JSON object (no markdown, no explanation, no code block) with EXACTLY this schema:

{
  "meaning_fa": "یک معنی کوتاه و روان به فارسی",
  "example_en": "یک جمله ساده سطح B1 با این کلمه",
  "usage_fa": "توضیح کوتاه فارسی از کاربرد کلمه",
  "note": "یک جمله‌ی خیلی کوتاه فارسی به عنوان راهنمای حفظ (mnemonic)"
}

Rules:
- meaning_fa and usage_fa and note MUST be in Persian.
- example_en MUST be in English.
- Output ONLY the JSON object. No extra text. No <think> tags.
    `;

  try {
    // درخواست به HuggingFace Router
    const hfRes = await fetch(
      "https://router.huggingface.co/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/Meta-Llama-3-8B-Instruct",
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant for English–Persian vocabulary learning.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 256,
        }),
      }
    );

    const raw = await hfRes.json();

    let text =
      raw?.choices?.[0]?.message?.content ||
      raw?.choices?.[0]?.message ||
      "";

    // اگر مدل مهمل یا همراه <think> برگرداند:
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      console.error("Vocab API: no JSON in model output:", text);
      return res.status(200).json({
        ok: false,
        error: "NO_JSON",
        message: "مدل خروجی JSON قابل‌تحلیل نداد.",
      });
    }

    const jsonPart = text.slice(first, last + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonPart);
    } catch (e) {
      console.error("Vocab API JSON parse error:", e, jsonPart);
      return res.status(200).json({
        ok: false,
        error: "BAD_JSON",
        message: "مدل JSON معتبر تولید نکرد.",
      });
    }

    const payload = {
      ok: true,
      word,
      meaning_fa: parsed.meaning_fa || "",
      example_en: parsed.example_en || "",
      usage_fa: parsed.usage_fa || "",
      note: parsed.note || "",
    };

    return res.status(200).json(payload);
  } catch (err) {
    console.error("Error in /api/vocab:", err);
    // اینجا دیگه ۵۰۰ خام به کاربر نمی‌دیم
    return res.status(200).json({
      ok: false,
      error: "SERVER_ERROR",
      message: "خطای داخلی سرور در /api/vocab.",
    });
  }
}
