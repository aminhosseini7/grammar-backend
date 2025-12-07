// api/vocab.js  (روی Vercel)

// ✅ حواشی CORS برای GitHub Pages
function setCors(res, req) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  setCors(res, req);

  // ✅ پاسخ به preflight (OPTIONS) تا خطای CORS نگیریم
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { word } = req.body || {};
    if (!word || typeof word !== "string") {
      res.status(400).json({ error: "Missing 'word' in body" });
      return;
    }

    const HF_API_KEY = process.env.HF_API_KEY;
    if (!HF_API_KEY) {
      res.status(500).json({ error: "Missing HuggingFace API key" });
      return;
    }

    // ⚠️ اگر قبلاً از مدل/آدرس دیگری استفاده می‌کردی، فقط این بخش را
    // با تنظیمات قبلی خودت هماهنگ کن؛ CORS مهمش بالاست.
    const response = await fetch("https://router.huggingface.co/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/Meta-Llama-3.1-8B-Instruct",
        messages: [
          {
            role: "system",
            content:
              "You are an English vocabulary tutor. For the given word, respond ONLY with valid JSON of the form: " +
              "{ \"meaning_fa\": \"…\", \"example_en\": \"…\", \"usage_fa\": \"…\", \"note\": \"…\" } . " +
              "Do not add any extra text.",
          },
          {
            role: "user",
            content: `Generate Persian meaning, English example sentence, Persian usage explanation, and a short funny memory hint for the word: "${word}".`,
          },
        ],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      res
        .status(500)
        .json({ error: "HuggingFace API error", status: response.status, detail: txt });
      return;
    }

    const data = await response.json();
    const content =
      data.choices?.[0]?.message?.content ?? "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      res.status(500).json({
        error: "Model did not return valid JSON",
        raw: content,
      });
      return;
    }

    res.status(200).json({
      word,
      meaning_fa: parsed.meaning_fa || "",
      example_en: parsed.example_en || "",
      usage_fa: parsed.usage_fa || "",
      note: parsed.note || "",
    });
  } catch (err) {
    console.error("Error in /api/vocab:", err);
    res.status(500).json({
      error: "Internal server error",
      detail: String(err),
    });
  }
};
