// api/vocab.js  (در ریپوی grammar-backend)

// دقیــــقاً همان مقادیری که در grammar.js استفاده می‌کنی را اینجا کپی کن
// مهم این است که URL و مدل، همان چیزی باشد که الان برای گرامر کار می‌کند.
const HF_API_URL = /* همـان HF_API_URL که در api/grammar.js استفاده شده */;
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

// اگر grammar.js به‌جای HF_API_URL مستقیماً از "https://router.huggingface.co/..." استفاده کرده:
//   - همان خط را از آنجا کپی کن و اینجا بگذار
//   - همین‌طور اگر ENV دیگری برای مدل داری، همان را هم استفاده کن.

async function callHF(prompt) {
  const res = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 320,
        temperature: 0.6,
      }
    })
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HuggingFace API error: ${res.status} – ${detail}`);
  }

  const data = await res.json();

  // بسته به خروجی مدلی که در grammar.js استفاده کردی، این بخش را
  // دقیقاً مثل grammar.js تنظیم کن.
  // اگر در grammar.js مثلاً data[0].generated_text استفاده می‌شود، همین را اینجا هم بکن.
  let text;

  // حالت رایج در Inference API
  if (Array.isArray(data) && data[0]?.generated_text) {
    text = data[0].generated_text;
  } else if (data.generated_text) {
    text = data.generated_text;
  } else if (data.choices?.[0]?.message?.content) {
    // اگر از مدل‌های سازگار با Chat استفاده می‌کنی (مثل grammar.js)
    text = data.choices[0].message.content;
  } else {
    text = JSON.stringify(data);
  }

  return text;
}

// یک قالب پرامپت ساده برای واژگان
function buildPrompt(word) {
  return `
You are an English–Persian vocabulary tutor.

Word: "${word}"

Return a strict JSON object with the following fields:
- meaning_fa: short Persian meaning of the word
- example_en: a simple English sentence using the word
- usage_fa: a Persian explanation of how this word is typically used
- note: a short, friendly mnemonic in Persian to help remember the word

Important:
- Answer ONLY JSON, no extra text.
- Use simple, clear language.
`;
}

function parseJsonSafe(text) {
  try {
    // اگر مدل قبل از JSON کمی توضیح می‌دهد، سعی می‌کنیم فقط بخش JSON را بگیریم
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const word = (body.word || "").trim();

    if (!word) {
      return res.status(400).json({ error: "Missing 'word' in body" });
    }

    const prompt = buildPrompt(word);
    const raw = await callHF(prompt);
    const parsed = parseJsonSafe(raw);

    if (!parsed) {
      return res.status(500).json({
        error: "Model did not return valid JSON",
        raw
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Vocab API error:", err);
    return res.status(500).json({
      error: "HuggingFace API error",
      detail: String(err.message || err)
    });
  }
};
