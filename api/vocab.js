// api/vocab.js  (در ریپوی grammar-backend)

// این endpoint فقط با POST کار می‌کند و
// از HuggingFace (router) برای ساخت معنی/مثال و ... استفاده می‌کند.

const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = "meta-llama/Meta-Llama-3-8B-Instruct";
const HF_URL = "https://router.huggingface.co/inference/v1/chat/completions";

export default async function handler(req, res) {
  // فقط POST مجاز است
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // چک کردن توکن
  if (!HF_API_KEY) {
    return res.status(500).json({
      error: "HuggingFace API key missing on server",
    });
  }

  let word = "";
  try {
    word = (req.body && req.body.word) || "";
  } catch (e) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  if (typeof word !== "string" || !word.trim()) {
    return res.status(400).json({ error: "Missing 'word' in body" });
  }
  word = word.trim();

  try {
    // پرامپت: خروجی باید حتما JSON باشد
    const systemPrompt = `
You are an English–Persian vocabulary assistant.
Given a single English word, you MUST return a compact JSON object with the following fields:

- meaning_fa : a short Persian meaning (no extra commentary)
- example_en : one natural English sentence using the word
- usage_fa   : a short Persian explanation of how/when this word is used
- note       : a very short Persian mnemonic or hint to remember the word

Return ONLY valid JSON, no Markdown, no explanation, no backticks.
`.trim();

    const userPrompt = `Word: "${word}"`;

    const hfRes = await fetch(HF_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 256,
      }),
    });

    if (!hfRes.ok) {
      const txt = await hfRes.text().catch(() => "");
      return res.status(502).json({
        error: "HuggingFace API error",
        status: hfRes.status,
        detail: txt.slice(0, 500),
      });
    }

    const completion = await hfRes.json();
    const content =
      completion?.choices?.[0]?.message?.content || "";

    let jsonPart = content;

    // اگر مدل قبل و بعد JSON متن اضافی گذاشت، فقط بخش بین { } را نگه می‌داریم
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      jsonPart = content.slice(start, end + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonPart);
    } catch (e) {
      // اینجا دیگه SyntaxError را می‌گیریم و 500 نمی‌دهیم
      return res.status(200).json({
        error: "Model did not return valid JSON",
        raw: content,
      });
    }

    // در نهایت جواب استاندارد
    return res.status(200).json({
      word,
      ...parsed,
    });
  } catch (e) {
    console.error("Vocab API error:", e);
    return res.status(500).json({
      error: "Internal Vocab API error",
      detail: String(e),
    });
  }
}
