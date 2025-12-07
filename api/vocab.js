// api/vocab.js
// Vercel serverless function – تولید معنی و مثال برای یک کلمه با HuggingFace

export default async function handler(req, res) {
  // CORS برای GitHub Pages
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { word } = req.body || {};

    if (!word || typeof word !== "string" || !word.trim()) {
      return res.status(400).json({ error: "Missing 'word' in body" });
    }

    const apiKey =
      process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY || "";

    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "Missing HuggingFace API key on server" });
    }

    const systemPrompt =
      "You are an English–Persian vocabulary tutor. The user sends ONE English word.";

    const userPrompt = `
Word: "${word.trim()}"

Return ONLY a JSON object with EXACTLY these keys:

{
  "fa": "کوتاه‌ترین معنی فارسی، ۵ تا ۱۵ واژه – بدون توضیح اضافه",
  "example": "یک جملهٔ بسیار ساده و طبیعی انگلیسی (سطح B1) با این لغت",
  "usage": "یک جملهٔ فارسی که کاربرد این کلمه را توضیح می‌دهد",
  "hint": "یک جملهٔ خیلی کوتاه و خودمانی فارسی برای حفظ کردن این لغت (مثل یک ترفند یا تصویر ذهنی)"
}

Rules:
- فقط همین JSON را بده؛ هیچ متن دیگری قبل یا بعدش ننویس.
- توی مقدارها از \\n اضافه بی‌دلیل استفاده نکن.
- اگر چند معنی ممکن است، رایج‌ترین معنی برای زبان‌آموز سطح B1 را انتخاب کن.
`.trim();

    const hfResponse = await fetch(
      "https://router.huggingface.co/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "meta-llama/Llama-3.3-70B-Instruct", // همان مدلی که در grammar.js استفاده کردی
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 256,
        }),
      }
    );

    const hfData = await hfResponse.json();

    const content =
      hfData?.choices?.[0]?.message?.content ||
      hfData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ||
      "";

    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace === -1) {
      return res.status(500).json({
        error: "Model did not return JSON",
        raw: content,
      });
    }

    const jsonText = content.slice(firstBrace, lastBrace + 1);

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return res.status(500).json({
        error: "Model did not return valid JSON",
        raw: content,
      });
    }

    const result = {
      fa: parsed.fa || "",
      example: parsed.example || "",
      usage: parsed.usage || "",
      hint: parsed.hint || "",
    };

    return res.status(200).json(result);
  } catch (e) {
    console.error("Error in /api/vocab:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
