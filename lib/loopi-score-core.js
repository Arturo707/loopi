// lib/loopi-score-core.js
// Shared Loopi Score logic — used by api/loopi-score.js and api/refresh-feed.js

export const SCORE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const FAMILIARITY = {
  AAPL: 95, TSLA: 90, NVDA: 90, AMZN: 88, META: 85, GOOGL: 85, MSFT: 85,
  GME: 85, NFLX: 80, AMD: 80, COIN: 75, PLTR: 70, SPY: 70, RIVN: 65,
  SOFI: 60, QQQ: 65,
};

export const getBand = (score) => {
  if (score >= 85) return 'fafo';
  if (score >= 65) return 'watching';
  if (score >= 40) return 'mid';
  return 'cooked';
};

export async function fetchMomentum(ticker, fmpKey) {
  const url = `https://financialmodelingprep.com/stable/quote?symbol=${ticker}&apikey=${fmpKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FMP quote failed: ${res.status}`);
  const data = await res.json();
  const quote = Array.isArray(data) ? data[0] : data;

  if (!quote || !quote.price) {
    return { score: 50, priceScore: 50, volumeScore: 50, pctChange: 0, price: null };
  }

  const pctChange   = Number(quote.changesPercentage || 0);
  const volume      = Number(quote.volume || 0);
  const avgVolume   = Number(quote.avgVolume || 1);
  const priceScore  = Math.round(Math.min(Math.max((pctChange + 10) / 20 * 100, 0), 100));
  const volumeScore = Math.round(Math.min((volume / Math.max(avgVolume, 1)) / 3, 1) * 100);
  const score       = Math.round((priceScore + volumeScore) / 2);
  return { score, priceScore, volumeScore, pctChange, price: quote.price };
}

export async function fetchBuzz(ticker) {
  const subreddits = ['wallstreetbets', 'stocks', 'investing'];
  let total = 0;

  await Promise.all(
    subreddits.map(async (sub) => {
      try {
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(ticker)}&sort=new&t=day&limit=100`;
        const res = await fetch(url, { headers: { 'User-Agent': 'loopi-score/1.0 (by /u/loopiapp)' } });
        if (!res.ok) return;
        const data = await res.json();
        total += data?.data?.children?.length || 0;
      } catch { /* ignore per-subreddit failures */ }
    })
  );

  return { score: Math.round(Math.min(total / 100, 1) * 100), mentions: total };
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

export async function generateText(ticker, scoreData, anthropicKey) {
  const { score, band, momentum, buzz, familiarity, pctChange, price } = scoreData;
  const useWebSearch = score >= 85;

  const priceStr  = price != null ? `$${Number(price).toFixed(2)}` : 'N/A';
  const changeStr = pctChange != null ? `${pctChange >= 0 ? '+' : ''}${Number(pctChange).toFixed(2)}%` : 'unknown';

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
  if (useWebSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${res.status}: ${err?.error?.message || 'unknown'}`);
  }

  const data = await res.json();
  const raw = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return { narrativeLine: `${ticker} is ${changeStr} today at ${priceStr}.`, vibeCheck: raw };
}

// Full pipeline: FMP + Reddit + familiarity + Claude text
export async function computeScore(ticker, fmpKey, anthropicKey) {
  const [momentumData, buzzData] = await Promise.all([
    fetchMomentum(ticker, fmpKey),
    fetchBuzz(ticker),
  ]);

  const familiarityScore = FAMILIARITY[ticker] ?? 40;
  const score = Math.round(momentumData.score * 0.4 + buzzData.score * 0.4 + familiarityScore * 0.2);
  const band  = getBand(score);

  let narrativeLine = `${ticker} is ${momentumData.pctChange >= 0 ? 'up' : 'down'} ${Math.abs(momentumData.pctChange || 0).toFixed(2)}% today.`;
  let vibeCheck = '';

  if (anthropicKey) {
    try {
      const texts = await generateText(ticker, {
        score, band,
        momentum: momentumData.score, buzz: buzzData.score, familiarity: familiarityScore,
        pctChange: momentumData.pctChange, price: momentumData.price,
      }, anthropicKey);
      narrativeLine = texts.narrativeLine || narrativeLine;
      vibeCheck     = texts.vibeCheck     || '';
    } catch (err) {
      console.error(`[loopi-score-core] Text generation failed for ${ticker}:`, err.message);
    }
  }

  return {
    ticker, score, band,
    momentum: momentumData.score, buzz: buzzData.score, familiarity: familiarityScore,
    narrativeLine, vibeCheck,
  };
}
