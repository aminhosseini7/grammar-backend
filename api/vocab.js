export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { word } = req.body || {};
  if (!word) {
    return res.status(400).json({ error: "Missing word" });
  }

  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing HuggingFace API key on server" });
  }

  const prompt = `
For the English word "${word}", give result as a JSON object ONLY:
{
  "meaning_fa": "...",
  "example_en": "...",
  "usage_fa": "...",
  "note": "..."
}
meaning_fa & usage_fa & note must be Persian.
example_en must be English.
Return ONLY valid JSON. No markdown, no commentary.
`;

  try {
    const apiRes = await fetch("https://router.huggingface.co/chat/completions", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${apiKey}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/Meta-Llama-3-8B-Instruct",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 200
      }),
    });

    const data = await apiRes.json();

    let text = data?.choices?.[0]?.message?.content || "";
    let jsonStart = text.indexOf("{");
    let jsonEnd = text.lastIndexOf("}") + 1;

    if (jsonStart === -1 || jsonEnd === -1) {
      return res.status(200).json({ ok: false, error: "NO_JSON" });
    }

    let parsed = JSON.parse(text.slice(jsonStart, jsonEnd));

    return res.status(200).json({
      ok: true,
      word,
      ...parsed
    });

  } catch (err) {
    console.error("Server error =>", err);
    return res.status(200).json({ ok: false, error: "SERVER_ERROR" });
  }
}
