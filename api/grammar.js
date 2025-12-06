// api/grammar.js
// سرورلس فانکشن روی Vercel برای بررسی گرامر با DeepSeek

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, level = "B1" } = req.body || {};

  if (!text) {
    return res.status(400).json({ error: "Field 'text' is required" });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfigured: no API key" });
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
    const resp = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat", // طبق داکیومنت دیپ‌سیک :contentReference[oaicite:1]{index=1}
        messages: [
          { role: "system", content: "You are a helpful English grammar tutor." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res
        .status(500)
        .json({ error: "DeepSeek API error", status: resp.status, detail: errText });
    }

    const data = await resp.json();
    const content =
      data?.choices?.[0]?.message?.content?.trim() || "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // اگر مدل JSON تمیز نداد، متن خام رو برمی‌گردونیم برای دیباگ
      return res.status(500).json({
        error: "Model did not return valid JSON",
        raw: content,
      });
    }

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({
      error: "Request to DeepSeek failed",
      detail: String(e),
    });
  }
};
