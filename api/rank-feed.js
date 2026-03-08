export default async function handler(req, res) {
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

  console.log('[RankFeed] profile received:', { riskProfile, age, incomeRange, experience });
  console.log('[RankFeed] pool size:', items.length, 'symbols:', items.map(i => i.symbol).join(','));

  const profileParts = [];
  if (riskProfile) profileParts.push(`perfil de riesgo: ${riskProfile}`);
  if (age)         profileParts.push(`${age} años`);
  if (incomeRange) profileParts.push(`ingresos ${incomeRange}€/mes`);
  if (experience)  profileParts.push(`experiencia inversora: ${experience}`);
  const profileDesc = profileParts.join(", ") || "perfil no especificado";

  const itemList = items
    .map((s) => `${s.symbol} (${s.name}, ${s.type === "etf" ? "ETF" : "STOCK"}, precio ${Number(s.price).toFixed(2)}, cambio ${Number(s.changesPercentage) >= 0 ? "+" : ""}${Number(s.changesPercentage).toFixed(1)}%)`)
    .join("\n");

  const system = `Eres el cerebro de Loopi — una app financiera para jóvenes españoles Gen Z que NO saben de bolsa pero quieren entender qué pasa en el mercado hoy y tomar buenas decisiones con su dinero.

TU MISIÓN: Analizar el snapshot del mercado de hoy y crear un feed personalizado que ayude al usuario a:
1. Entender qué está pasando en el mercado real hoy
2. Ver oportunidades concretas apropiadas para su perfil
3. Sentirse seguro y con criterio, no abrumado

FILOSOFÍA: Value investing (Greenwald/Buffett) + sentido común generacional. Busca activos con fundamentos sólidos. Rechaza hype sin fundamento.

PERFILES:
- Conservador: ETFs de índice como base (SPY, QQQ, VTI, GLD), luego empresas muy consolidadas con baja volatilidad. Nada especulativo. Tono tranquilizador.
- Moderado: ETFs como núcleo + Magnificent 7 + empresas con momentum real hoy. Tono equilibrado y didáctico.
- Atrevido: lo más movido del día con narrativa clara, alto crecimiento. Acepta volatilidad si hay razón. Tono directo y con energía.

DEMOGRAFÍA:
- Joven con ingresos bajos + sin experiencia: simplicidad, ETFs, largo plazo, lenguaje muy simple
- Joven con ingresos medios/altos + experiencia: más variedad, acciones individuales
- Experiencia alta: activos más sofisticados, análisis más profundo

REGLAS:
- Refleja LO QUE ESTÁ PASANDO HOY — si Apple cae fuerte aparece, si el oro sube aparece
- Filtra chicharros: excluye precio < $2, movimiento > 30% en empresas desconocidas
- Los tips suenan como un amigo que sabe de bolsa en un WhatsApp, no un robot
- IMPORTANTE: Conservador y Moderado deben verse MUY diferentes a Atrevido. Un conservador nunca ve los mismos activos que un atrevido.

FORMATO — responde ÚNICAMENTE con este JSON válido:
{
  "top": [
    {"symbol": "SPY", "indicator": "🟢", "tip": "El S&P500 baja hoy por miedo macro pero para largo plazo sigue siendo la base perfecta de cualquier cartera."},
    {"symbol": "GLD", "indicator": "🟢", "tip": "El oro sube cuando hay incertidumbre. Hoy tiene sentido tener un 5-10% aquí como cobertura."}
  ],
  "rest": ["AAPL", "MSFT", "NVDA"]
}

- "top": exactamente 12 activos con indicator (🟢 Interesante, 🟡 Neutral, 🔴 Evitar) y tip de máximo 50 palabras en español casual
- "rest": hasta 38 símbolos más en orden de relevancia para el perfil, sin tips
- Total máximo 50 activos
- Nada fuera del JSON`;

  const userMsg = `Usuario: ${profileDesc}.\nFecha: ${new Date().toISOString().split('T')[0]}\n\nActivos disponibles hoy:\n${itemList}\n\nCrea el feed personalizado para este usuario.`;

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
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    const data = await apiRes.json();
    if (data.error) return res.status(502).json({ error: data.error.message });

    const raw = (data.content?.[0]?.text ?? "").trim();
    console.log('[RankFeed] Claude raw response:', raw.slice(0, 500));

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*"top"[\s\S]*"rest"[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }

    if (parsed?.top?.length) {
      console.log('[RankFeed] top:', parsed.top.map(i => i.symbol).join(','));
      console.log('[RankFeed] rest:', parsed.rest?.join(','));
      return res.json(parsed);
    }

    // Fallback
    console.warn('[RankFeed] JSON parse failed, using fallback');
    return res.json({
      top: items.slice(0, 12).map(s => ({ symbol: s.symbol, indicator: "🟡", tip: "" })),
      rest: items.slice(12, 50).map(s => s.symbol),
    });

  } catch (err) {
    console.error('[RankFeed] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
