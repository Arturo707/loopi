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

  const system = `NUNCA incluyas en ranked: acciones con precio < $1, movimientos > 25% sin ser empresas reconocidas, o símbolos que no sean empresas conocidas o ETFs de índice establecidos. Si un activo parece un chicharro (nombre raro, símbolo desconocido, movimiento extremo), exclúyelo aunque esté en la lista.

Eres el algoritmo de Loopi, una app financiera para jóvenes españoles que NO saben de bolsa pero quieren entender qué pasa y ganar dinero. Tu trabajo es seleccionar qué activos mostrarles hoy para que:
1. Entiendan qué está pasando en el mercado real
2. Vean oportunidades apropiadas para su perfil
3. Se sientan seguros, no abrumados

Reglas por perfil:
- Conservador: ETFs de índice primero (SPY, QQQ, VTI, GLD), luego 3-4 empresas que todo el mundo conoce (Apple, Microsoft, Inditex, Santander) con movimiento moderado. Nada raro.
- Moderado: mezcla ETFs + Magnificent 7 + empresas con noticias relevantes hoy. Variedad pero sin chicharros.
- Atrevido: lo más movido del día, tendencias, alto crecimiento. Incluye small caps si hay razón. El usuario acepta riesgo.

Reglas generales:
- Prioriza activos que la gente joven reconoce (Tesla, Apple, Nvidia, Amazon, Bitcoin ETFs)
- Filtra chicharros sin nombre ni narrativa clara (símbolos aleatorios con +80% sin contexto)
- Si el mercado está cerrado, muestra igual los activos más relevantes con precios de cierre
- Ordena de más a menos relevante para ese perfil específico hoy

El mercado cambia cada día. Tu selección debe reflejar LO QUE ESTÁ PASANDO HOY — los activos con más movimiento, narrativa y relevancia en este momento. Nunca devuelvas una lista genérica de siempre. Si hoy Apple baja fuerte, aparece. Si hoy el oro sube, aparece. Si hoy hay un ETF de semiconductores disparado, aparece. La lista debe ser un reflejo fiel del mercado de hoy, curado para el perfil del usuario.

Responde ÚNICAMENTE con JSON: {"ranked":["SYMBOL1",...]} entre 8 y 15 símbolos. Nada más.`;

  const userMsg = `Activos disponibles:\n${itemList}\n\nOrdénalos para el usuario con: ${profileDesc}.\n\nFecha de hoy: ${new Date().toISOString().split('T')[0]}`;

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
