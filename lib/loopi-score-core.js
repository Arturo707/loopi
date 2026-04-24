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

export async function generateText(ticker, scoreData, anthropicKey, { allowWebSearch = false, timeoutMs = 8000 } = {}) {
  const { score, band, momentum, buzz, familiarity, pctChange, price } = scoreData;
  // Web search adds 5-15s latency — gate behind explicit opt-in (cron only).
  const useWebSearch = allowWebSearch && score >= 85;

  const priceStr  = price != null ? `$${Number(price).toFixed(2)}` : 'N/A';
  const changeStr = pctChange != null ? `${pctChange >= 0 ? '+' : ''}${Number(pctChange).toFixed(2)}%` : 'unknown';

  const userMsg = [
    `Ticker: ${ticker}`,
    `Price: ${priceStr} (${changeStr} today)`,
    `Loopi Score: ${score}/100 — band: ${band}`,
    `Momentum: ${momentum}/100 | Buzz: ${buzz ?? 'N/A'}/100 | Familiarity: ${familiarity}/100`,
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

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

// Instant score from a live FMP quote/gainer/loser item — no Reddit, no Claude.
// Used by market-feed so every card renders a real score on first paint.
export function computeSyntheticScore(item) {
  const symbol     = item.symbol;
  const pctChange  = Number(item.changesPercentage ?? item.changePercentage ?? 0);
  const volume     = Number(item.volume ?? 0);
  const avgVolume  = Number(item.avgVolume ?? 0);
  const price      = Number(item.price ?? 0);

  const priceScore = Math.round(Math.min(Math.max((pctChange + 10) / 20 * 100, 0), 100));
  const hasVolume  = avgVolume > 0 && volume > 0;
  const volumeScore = hasVolume
    ? Math.round(Math.min((volume / avgVolume) / 3, 1) * 100)
    : 50;
  const momentumScore = hasVolume
    ? Math.round((priceScore + volumeScore) / 2)
    : priceScore;

  const familiarityScore = FAMILIARITY[symbol] ?? 40;
  // Without Reddit buzz: weight momentum 60%, familiarity 40%
  const score = Math.round(momentumScore * 0.6 + familiarityScore * 0.4);
  const band  = getBand(score);

  const dir = pctChange >= 0 ? 'up' : 'down';
  const narrativeLine = `${symbol} is ${dir} ${Math.abs(pctChange).toFixed(2)}% today${price ? ` at $${price.toFixed(2)}` : ''}.`;

  // Deterministic per-band vibe so the card has real copy on first paint,
  // even before the AI vibeCheck lands from cron or on-demand fetch.
  const absPct = Math.abs(pctChange);
  const fmtPct = `${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%`;
  const vibeByBand = {
    fafo:     `${symbol} is ripping today — ${fmtPct} on heavy volume. Someone is eating well.`,
    watching: `${symbol} is moving ${fmtPct} with real interest behind it. Worth keeping on the radar.`,
    mid:      absPct < 1
      ? `${symbol} is basically flat at ${fmtPct}. The market's ignoring it, which is its own kind of signal.`
      : `${symbol} is ${fmtPct} today. Nothing dramatic — just another day at the office.`,
    cooked:   `${symbol} is down ${absPct.toFixed(1)}% today. Bag holders, hang in there.`,
  };

  return {
    ticker: symbol,
    score,
    band,
    momentum: momentumScore,
    buzz: null,
    familiarity: familiarityScore,
    narrativeLine,
    vibeCheck: vibeByBand[band] || narrativeLine,
    synthetic: true,
  };
}

// Full pipeline: FMP + Reddit + familiarity + Claude text.
// `allowWebSearch` should only be true in the cron (long timeout budget).
export async function computeScore(ticker, fmpKey, anthropicKey, opts = {}) {
  const { allowWebSearch = false, timeoutMs = 8000 } = opts;

  const [momentumData, buzzData] = await Promise.all([
    fetchMomentum(ticker, fmpKey),
    fetchBuzz(ticker),
  ]);

  const familiarityScore = FAMILIARITY[ticker] ?? 40;
  const score = Math.round(momentumData.score * 0.4 + buzzData.score * 0.4 + familiarityScore * 0.2);
  const band  = getBand(score);

  const pct = momentumData.pctChange;
  const fallbackNarrative = `${ticker} is ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct || 0).toFixed(2)}% today.`;

  // Punchy deterministic fallback vibe per band — ensures UI always has text
  // even if Claude fails or times out.
  const FALLBACK_VIBES = {
    fafo:     `${ticker} is ripping today — ${pct >= 0 ? '+' : ''}${(pct || 0).toFixed(1)}%. Someone is making bank.`,
    watching: `${ticker} is moving ${pct >= 0 ? '+' : ''}${(pct || 0).toFixed(1)}% with real volume behind it. Worth a look.`,
    mid:      `${ticker} is ${pct >= 0 ? '+' : ''}${(pct || 0).toFixed(1)}% today. Nothing to see here, which is its own kind of signal.`,
    cooked:   `${ticker} is down ${Math.abs(pct || 0).toFixed(1)}% today. Bag holders, we salute you.`,
  };

  let narrativeLine = fallbackNarrative;
  let vibeCheck     = FALLBACK_VIBES[band] || fallbackNarrative;

  if (anthropicKey) {
    try {
      const texts = await generateText(ticker, {
        score, band,
        momentum: momentumData.score, buzz: buzzData.score, familiarity: familiarityScore,
        pctChange: pct, price: momentumData.price,
      }, anthropicKey, { allowWebSearch, timeoutMs });
      if (texts.narrativeLine) narrativeLine = texts.narrativeLine;
      if (texts.vibeCheck)     vibeCheck     = texts.vibeCheck;
    } catch (err) {
      console.warn(`[loopi-score-core] Text generation fell back for ${ticker}:`, err.message);
      // keep the deterministic fallback vibe
    }
  }

  return {
    ticker, score, band,
    momentum: momentumData.score, buzz: buzzData.score, familiarity: familiarityScore,
    narrativeLine, vibeCheck,
  };
}
