// api/loopi-score.js
// GET /api/loopi-score?ticker=NVDA
// Returns: { ticker, score, band, momentum, buzz, familiarity, narrativeLine, vibeCheck }

// In-memory cache — 5 min TTL
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const FAMILIARITY = {
  AAPL: 95, TSLA: 90, NVDA: 90, AMZN: 88, META: 85, GOOGL: 85, MSFT: 85,
  GME: 85, NFLX: 80, AMD: 80, COIN: 75, PLTR: 70, SPY: 70, RIVN: 65,
  SOFI: 60, QQQ: 65,
};

const getBand = (score) => {
  if (score >= 85) return 'fafo';
  if (score >= 65) return 'watching';
  if (score >= 40) return 'mid';
  return 'cooked';
};

async function fetchMomentum(ticker, fmpKey) {
  const url = `https://financialmodelingprep.com/stable/quote?symbol=${ticker}&apikey=${fmpKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP quote failed: ${res.status}`);
  const data = await res.json();
  const quote = Array.isArray(data) ? data[0] : data;

  if (!quote || !quote.price) {
    return { score: 50, priceScore: 50, volumeScore: 50, pctChange: 0, price: null };
  }

  const pctChange = Number(quote.changesPercentage || 0);
  const volume = Number(quote.volume || 0);
  const avgVolume = Number(quote.avgVolume || 1);

  // Price change: clamp [-10%, +10%] → [0, 100]. Flat (0%) = 50.
  const priceScore = Math.round(Math.min(Math.max((pctChange + 10) / 20 * 100, 0), 100));

  // Volume ratio vs 30d avg: clamp [0x, 3x] → [0, 100]
  const ratio = volume / Math.max(avgVolume, 1);
  const volumeScore = Math.round(Math.min(ratio / 3, 1) * 100);

  const score = Math.round((priceScore + volumeScore) / 2);
  return { score, priceScore, volumeScore, pctChange, price: quote.price };
}

async function fetchBuzz(ticker) {
  const subreddits = ['wallstreetbets', 'stocks', 'investing'];
  let total = 0;

  await Promise.all(
    subreddits.map(async (sub) => {
      try {
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(ticker)}&sort=new&t=day&limit=100`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'loopi-score/1.0 (by /u/loopiapp)' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const count = data?.data?.children?.length || 0;
        total += count;
      } catch {
        // ignore per-subreddit failures, buzz degrades gracefully
      }
    })
  );

  // Cap at 100 mentions = 100 score
  const score = Math.round(Math.min(total / 100, 1) * 100);
  return { score, mentions: total };
}

const VIBE_SYSTEM = `You are Loopi's market voice. You are financially literate, observant, and funny — but the humor comes from intelligence and specificity, not from slang or trying to sound young. You notice the thing everyone is thinking but not saying.

The goal is to write something a smart 24-year-old would screenshot and send to their group chat — not because it uses the right words, but because it's actually funny or exactly right.

Rules:
- vibeCheck is 2 sentences max
- If you know the specific catalyst (earnings beat, CEO did something weird, Fed spoke, product launch, viral moment) — name it and make that the observation. "NVDA up 6% because Jensen wore a leather jacket again" is the standard to aim for.
- If no specific catalyst, make a deadpan observation about the price action itself
- Confident take. No hedging, no "investors should consider", no "it's worth noting"
- Match energy to the score band:
    fafo (85-100): the stock is doing something unhinged, treat it accordingly
    watching (65-84): cautious excitement, something interesting is happening
    mid (40-64): dry and deadpan, this stock is fine and that's the most damning thing
    cooked (0-39): funeral energy, matter-of-fact about the damage
- Slang only when it genuinely fits the sentence. Never forced. FAFO, cooked, rent free, mid — fine when earned. "bussin fr fr" — never.
- Specific > clever > slang. In that order, always.

Return valid JSON only — no markdown, no code fences:
{ "narrativeLine": "...", "vibeCheck": "..." }

narrativeLine: 1 sentence, purely factual. States price action and catalyst if known. No personality, no slang.
vibeCheck: 2 sentences max in Loopi's voice.`;

async function generateText(ticker, scoreData, anthropicKey) {
  const { score, band, momentum, buzz, familiarity, pctChange, price } = scoreData;
  const useWebSearch = score >= 85;

  const priceStr = price != null ? `$${Number(price).toFixed(2)}` : 'N/A';
  const changeStr = pctChange != null
    ? `${pctChange >= 0 ? '+' : ''}${Number(pctChange).toFixed(2)}%`
    : 'unknown';

  const userMsg = [
    `Ticker: ${ticker}`,
    `Price: ${priceStr} (${changeStr} today)`,
    `Loopi Score: ${score}/100 — band: ${band}`,
    `Momentum: ${momentum}/100 | Buzz: ${buzz}/100 | Familiarity: ${familiarity}/100`,
    '',
    useWebSearch
      ? `Search for the latest news on ${ticker} to identify today's specific catalyst. Then return JSON with narrativeLine and vibeCheck.`
      : `Return JSON with narrativeLine and vibeCheck.`,
  ].join('\n');

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': anthropicKey,
    'anthropic-version': '2023-06-01',
  };
  if (useWebSearch) headers['anthropic-beta'] = 'web-search-2025-03-05';

  const body = {
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: VIBE_SYSTEM,
    messages: [{ role: 'user', content: userMsg }],
  };
  if (useWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${res.status}: ${err?.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  const textBlocks = (data.content || []).filter((b) => b.type === 'text');
  const raw = textBlocks.map((b) => b.text).join('').trim();

  // Extract JSON — Claude may wrap in markdown fences despite instructions
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // fall through to fallback
    }
  }

  // Fallback: treat entire text as vibeCheck
  return {
    narrativeLine: `${ticker} is ${changeStr} today at ${priceStr}.`,
    vibeCheck: raw,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ticker = (req.query.ticker || '').toUpperCase().trim();
  if (!ticker) return res.status(400).json({ error: 'ticker query param required' });

  // Return cached result if fresh
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL) {
    console.log(`[loopi-score] Cache hit for ${ticker}`);
    return res.status(200).json(hit.data);
  }

  const fmpKey = process.env.FMP_API_KEY || process.env.EXPO_PUBLIC_FMP_API_KEY;
  if (!fmpKey) return res.status(500).json({ error: 'FMP_API_KEY not configured' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    // Momentum + buzz in parallel
    const [momentumData, buzzData] = await Promise.all([
      fetchMomentum(ticker, fmpKey),
      fetchBuzz(ticker),
    ]);

    const familiarityScore = FAMILIARITY[ticker] ?? 40;

    const score = Math.round(
      momentumData.score * 0.4 +
      buzzData.score * 0.4 +
      familiarityScore * 0.2
    );
    const band = getBand(score);

    console.log(
      `[loopi-score] ${ticker} → score=${score} band=${band}` +
      ` momentum=${momentumData.score} buzz=${buzzData.score} familiarity=${familiarityScore}`
    );

    // Text generation (optional — degrades gracefully if no API key)
    let narrativeLine = `${ticker} is ${momentumData.pctChange >= 0 ? 'up' : 'down'} ${Math.abs(momentumData.pctChange || 0).toFixed(2)}% today.`;
    let vibeCheck = '';

    if (anthropicKey) {
      try {
        const texts = await generateText(
          ticker,
          { score, band, momentum: momentumData.score, buzz: buzzData.score, familiarity: familiarityScore, pctChange: momentumData.pctChange, price: momentumData.price },
          anthropicKey
        );
        narrativeLine = texts.narrativeLine || narrativeLine;
        vibeCheck = texts.vibeCheck || '';
      } catch (err) {
        console.error('[loopi-score] Text generation failed:', err.message);
      }
    } else {
      console.warn('[loopi-score] ANTHROPIC_API_KEY not set — skipping text generation');
    }

    const result = {
      ticker,
      score,
      band,
      momentum: momentumData.score,
      buzz: buzzData.score,
      familiarity: familiarityScore,
      narrativeLine,
      vibeCheck,
    };

    cache.set(ticker, { data: result, cachedAt: Date.now() });
    return res.status(200).json(result);
  } catch (err) {
    console.error('[loopi-score] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
