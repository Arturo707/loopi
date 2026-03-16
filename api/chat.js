// api/chat.js — server-side proxy for Anthropic API
// Keeps ANTHROPIC_API_KEY out of the browser bundle
//
// POST { messages, systemPrompt }              → { text }
// POST ?mode=generate-tip { symbol, name, price, changePct, age?, incomeRange?, experience? }
//                                              → { indicator, tip }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  // ── mode=generate-tip ──────────────────────────────────────────────────────
  if (req.query.mode === 'generate-tip') {
    const { symbol, name, price, changePct, age, incomeRange, experience } = req.body;
    if (!symbol || !name || price == null || changePct == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const pct = Number(changePct);
    const abs = Math.abs(pct);
    let toneHint;
    if (abs > 20)      toneHint = 'El movimiento supera el 20%. Advierte del riesgo de volatilidad extrema y posible noticia puntual o manipulación.';
    else if (pct > 5)  toneHint = 'Sube con fuerza. No te dejes llevar por el hype. Evalúa si es momentum real o si ya está en el pico.';
    else if (pct < -5) toneHint = 'Baja con fuerza. ¿Oportunidad o caída con más por venir? Sé honesto sobre el riesgo.';
    else               toneHint = 'Movimiento moderado. Describe qué está pasando sin exagerar ni inflar expectativas.';

    const profileParts = [];
    if (age)         profileParts.push(`${age} años`);
    if (incomeRange) profileParts.push(`ingresos ${incomeRange}€/mes`);
    if (experience)  profileParts.push(`experiencia inversora: ${experience}`);
    const profileHint = profileParts.length > 0
      ? ` El usuario tiene: ${profileParts.join(', ')}. Adapta el consejo a su perfil (horizonte temporal, nivel de riesgo adecuado, simplicidad si es novato).`
      : '';

    const system  = `Eres un gestor de patrimonio honesto y directo. No exageres ni vendas humo. ${toneHint}${profileHint} Responde ÚNICAMENTE con JSON válido: {"indicator":"🟢","tip":"..."} — indicator es 🟢 (Interesante), 🟡 (Neutral) o 🔴 (Evitar) según tu valoración real. El campo tip en español casual, máximo 60 palabras, sin jerga. Nada fuera del JSON.`;
    const userMsg = `${name} (${symbol}): precio $${Number(price).toFixed(2)}, cambio ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% hoy.`;

    try {
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 220,
          system,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });

      const data = await apiRes.json();
      if (data.error) return res.status(502).json({ error: data.error.message });

      const raw = (data.content?.[0]?.text ?? '').trim();
      try { const p = JSON.parse(raw); if (p.indicator && p.tip) return res.json(p); } catch {}
      const m = raw.match(/\{[\s\S]*?"indicator"[\s\S]*?"tip"[\s\S]*?\}/);
      if (m) { try { const p = JSON.parse(m[0]); if (p.indicator && p.tip) return res.json(p); } catch {} }
      return res.json({ indicator: '🟡', tip: raw.slice(0, 200) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── default: chat proxy ────────────────────────────────────────────────────
  const { messages, systemPrompt } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Anthropic API error' });
    }

    return res.status(200).json({ text: data.content[0].text.trim() });
  } catch (err) {
    console.error('[chat] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
