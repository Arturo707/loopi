// api/refresh-feed.js
// Cron job: runs every 30 min via Vercel cron.
// Fetches live market data, pre-generates ranked feeds for Moderate + Aggressive,
// and pre-computes Loopi Scores for all GEN_Z_SYMBOLS — all cached in Firestore.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { computeScore, SCORE_TTL_MS } from '../lib/loopi-score-core.js';

let db = null;
try {
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    db = getFirestore();
  } else {
    console.warn('[refresh-feed] Firebase env vars not set — will not cache');
  }
} catch (err) {
  console.warn('[refresh-feed] Firebase init failed:', err.message);
}

const GEN_Z_SYMBOLS = [
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'PLTR',
  'IBIT', 'GLD', 'JPM', 'V', 'WMT', 'SOFI', 'AMD', 'NFLX', 'DIS', 'UBER',
  'COIN', 'BRK-B', 'XLE', 'IWM', 'TLT',
];

const RANK_SYSTEM = `You are the brain behind Loopi — a investing app for Gen Z users who are curious about markets but don't have a finance degree. Your job is to analyze today's market snapshot and build a personalized feed that helps the user:
1. Understand what's actually happening in the market today
2. See concrete opportunities that fit their profile
3. Feel informed and confident, not overwhelmed

PHILOSOPHY: Value investing fundamentals (Greenwald/Buffett) + generational common sense. Look for assets with solid fundamentals. Cut the hype.

PROFILES — differences must be OBVIOUS in the output:

- Conservative: ONLY broad index ETFs (SPY, QQQ, VTI) and gold (GLD). Max 2-3 stocks from ultra-established companies (Apple, Microsoft, Berkshire). NEVER volatile stocks, NEVER small caps, NEVER crypto ETFs. This user does not want surprises.

- Moderate: ETFs as ~40% of the feed + Magnificent 7 (AAPL, MSFT, NVDA, AMZN, META, GOOGL, TSLA) + 2-3 stocks with solid momentum today. NEVER the same speculative picks as Aggressive.

- Aggressive: PRIORITIZE stocks with the biggest moves today, small caps with a clear narrative, leveraged ETFs (SOXL, TQQQ), crypto ETFs (IBIT, BITO). FEW broad index ETFs — this user wants action.

RULES:
- Reflect WHAT'S HAPPENING TODAY
- Tips sound like a sharp friend texting you about a stock — warm, confident. No disclaimers.

TIP VOICE: Explain the stock to a smart friend who's new to investing. Be specific about what's happening today.

FORMAT — respond ONLY with valid JSON:
{
  "top": [
    {"symbol": "SPY", "indicator": "🟢", "tip": "S&P 500 dipped today on macro fears but the long-term case is unchanged. If you're building a base, this is it."}
  ],
  "rest": ["AAPL", "MSFT"]
}

- "top": exactly 12 assets with indicator (🟢 Interesting, 🟡 Neutral, 🔴 Avoid) and a tip of max 50 words
- "rest": remaining symbols ranked by profile relevance, no tips
- Nothing outside the JSON`;

async function fetchMarketData() {
  const fmpKey = process.env.FMP_API_KEY;
  if (!fmpKey) throw new Error('FMP_API_KEY not configured');

  const [gainersRes, losersRes, activesRes, ...quoteResponses] = await Promise.all([
    fetch(`https://financialmodelingprep.com/stable/biggest-gainers?apikey=${fmpKey}`),
    fetch(`https://financialmodelingprep.com/stable/biggest-losers?apikey=${fmpKey}`),
    fetch(`https://financialmodelingprep.com/stable/most-actives?apikey=${fmpKey}`),
    ...GEN_Z_SYMBOLS.map(s => fetch(`https://financialmodelingprep.com/stable/quote?symbol=${s}&apikey=${fmpKey}`)),
  ]);

  const [gainersRaw, losersRaw, activesRaw, ...quoteRaws] = await Promise.all([
    gainersRes.json(),
    losersRes.json(),
    activesRes.json(),
    ...quoteResponses.map(r => r.json()),
  ]);

  const toArray = (x) => (Array.isArray(x) ? x : []);
  const genZData = quoteRaws.flatMap(toArray).filter(x => x?.symbol);

  const genZSet = new Set(GEN_Z_SYMBOLS);
  const seen = new Set();
  const items = [];

  for (const item of [...genZData, ...toArray(gainersRaw), ...toArray(losersRaw), ...toArray(activesRaw)]) {
    if (!item?.symbol || seen.has(item.symbol)) continue;
    if (!genZSet.has(item.symbol)) continue;
    const price = Number(item.price);
    if (price < 1) continue;
    seen.add(item.symbol);
    items.push({
      symbol: item.symbol,
      name: item.name || item.symbol,
      price,
      changesPercentage: Number(item.changesPercentage ?? item.changePercentage ?? 0),
      type: (item.exchange ?? '').toUpperCase() === 'AMEX' && (item.name ?? '').toUpperCase().includes('ETF') ? 'etf' : 'stock',
    });
  }

  return items;
}

async function rankForProfile(items, profile, anthropicKey) {
  const itemList = items
    .map(s => `${s.symbol} (${s.name}, ${s.type === 'etf' ? 'ETF' : 'STOCK'}, price $${s.price.toFixed(2)}, change ${s.changesPercentage >= 0 ? '+' : ''}${s.changesPercentage.toFixed(1)}%)`)
    .join('\n');

  const userMsg = `User: risk profile: ${profile}.\nDate: ${new Date().toISOString().split('T')[0]}\n\nAvailable assets today:\n${itemList}\n\nBuild the personalized feed for this user.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: RANK_SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  const data = await apiRes.json();
  if (data.error) throw new Error(data.error.message);

  const raw = (data.content?.[0]?.text ?? '').trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*"top"[\s\S]*"rest"[\s\S]*\}/);
    if (m) try { parsed = JSON.parse(m[0]); } catch {}
  }

  if (!parsed?.top?.length) throw new Error('Claude returned invalid JSON');
  return parsed;
}

// Pre-compute Loopi Scores for a list of tickers, skipping any cached within TTL.
// Runs in batches of 5 to avoid rate-limiting FMP / Reddit / Anthropic.
async function computeAndCacheScores(symbols, fmpKey, anthropicKey) {
  if (!db) return;

  // Batch-read existing cached scores in one Firestore RPC
  const docRefs = symbols.map((sym) => db.collection('scores').doc(sym));
  let snaps;
  try { snaps = await db.getAll(...docRefs); }
  catch (err) { console.warn('[refresh-feed] Score batch-read failed:', err.message); return; }

  const now = Date.now();
  const toCompute = symbols.filter((sym, i) => {
    const snap = snaps[i];
    if (!snap.exists) return true;
    return now - new Date(snap.data().cachedAt || 0).getTime() >= SCORE_TTL_MS;
  });

  console.log(`[refresh-feed] Scores to compute: ${toCompute.length} / ${symbols.length}`);

  const BATCH = 5;
  for (let i = 0; i < toCompute.length; i += BATCH) {
    await Promise.all(
      toCompute.slice(i, i + BATCH).map(async (ticker) => {
        try {
          const result = await computeScore(ticker, fmpKey, anthropicKey);
          await db.collection('scores').doc(ticker).set({ ...result, cachedAt: new Date().toISOString() });
          console.log(`[refresh-feed] Score cached: ${ticker} ${result.score} (${result.band})`);
        } catch (err) {
          console.error(`[refresh-feed] Score failed for ${ticker}:`, err.message);
        }
      })
    );
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  if (!db) return res.status(500).json({ error: 'Firestore not configured' });

  console.log('[refresh-feed] Starting feed refresh');

  try {
    const items = await fetchMarketData();
    console.log('[refresh-feed] Market data fetched:', items.length, 'symbols');

    const generatedAt = new Date().toISOString();
    const date = generatedAt.split('T')[0];
    const results = {};

    for (const profile of ['Moderate', 'Aggressive']) {
      try {
        console.log('[refresh-feed] Ranking for', profile);
        const parsed = await rankForProfile(items, profile, anthropicKey);
        await db.collection('feed-cache').doc(profile).set({
          top: parsed.top,
          rest: parsed.rest ?? [],
          generatedAt,
          date,
        });
        results[profile] = 'ok';
        console.log('[refresh-feed]', profile, 'cached —', parsed.top.length, 'top items');
      } catch (err) {
        console.error('[refresh-feed] Failed for', profile, ':', err.message);
        results[profile] = `error: ${err.message}`;
      }
    }

    // Pre-compute Loopi Scores for the full symbol pool (fire-and-forget if it errors)
    try {
      await computeAndCacheScores(GEN_Z_SYMBOLS, process.env.FMP_API_KEY, anthropicKey);
    } catch (err) {
      console.error('[refresh-feed] Score computation failed:', err.message);
    }

    return res.status(200).json({ ok: true, results, generatedAt });
  } catch (err) {
    console.error('[refresh-feed] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
