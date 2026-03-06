export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });

  const { items, riskProfile, age, incomeRange, experience } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing or empty items array" });
  }

  const profileParts = [];
  if (riskProfile) profileParts.push(`perfil de riesgo: ${riskProfile}`);
  if (age)         profileParts.push(`${age} años`);
  if (incomeRange) profileParts.push(`ingresos ${incomeRange}€/mes`);
  if (experience)  profileParts.push(`experiencia inversora: ${experience}`);
  const profileDesc = profileParts.length > 0
    ? profileParts.join(", ")
    : "perfil no especificado";

  const itemList = items
    .map((s) => `${s.symbol} (${s.name}, ${s.type === "etf" ? "ETF" : "STOCK"}, cambio ${Number(s.changesPercentage) >= 0 ? "+" : ""}${Number(s.changesPercentage).toFixed(1)}%)`)
    .join("\n");

  const system = `Eres un gestor de patrimonio. Tu tarea es seleccionar y ordenar activos para un usuario concreto.
Usuario: ${profileDesc}.
Devuelve ÚNICAMENTE JSON válido con este formato exacto: {"ranked":["SYM1","SYM2",...]}
Incluye entre 8 y 15 símbolos, ordenados de más a menos apropiado para el perfil del usuario.
Ten en cuenta el riesgo (ETFs son más conservadores que stocks), la volatilidad (cambio %), y el perfil indicado.
No incluyas ningún texto fuera del JSON.`;

  const userMsg = `Activos disponibles:\n${itemList}\n\nOrdénalos para el usuario con: ${profileDesc}.`;

  try {
    const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 256,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    const data = await apiRes.json();
    if (data.error) return res.status(502).json({ error: data.error.message });

    const raw = (data.content?.[0]?.text ?? "").trim();

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.ranked)) return res.json({ ranked: parsed.ranked });
    } catch {}

    const m = raw.match(/\{[\s\S]*?"ranked"[\s\S]*?\}/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed.ranked)) return res.json({ ranked: parsed.ranked });
      } catch {}
    }

    // Fallback: return symbols in original order
    return res.json({ ranked: items.map((s) => s.symbol).slice(0, 15) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
