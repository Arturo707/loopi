// v11 - FMP feed + synthetic scores + real today's news headlines as vibes
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth } from '../lib/requireAuth.js';
import { computeSyntheticScore } from '../lib/loopi-score-core.js';
import { isUsMarketOpen } from '../lib/market-hours.js';

// Serve cached full scores for up to 24h — matches loopi-score.js serve TTL.
// Synthetic scores are computed from live FMP data and always fresh.
const SCORE_TTL_MS = 24 * 60 * 60 * 1000;

let db = null;
try {
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    db = getFirestore();
  }
} catch (err) {
  console.warn('[market-feed] Firebase init failed — scores will be omitted:', err.message);
}

// Fetch today's top news headline per symbol from FMP in one batched call.
// Returns { SYMBOL: { title, site, url, publishedDate } } — most recent first.
async function fetchNewsForSymbols(symbols, fmpKey) {
  if (!symbols.length || !fmpKey) return {};
  try {
    const batch = symbols.slice(0, 40);
    const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${batch.join(',')}&limit=${batch.length * 2}&apikey=${fmpKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      console.warn('[market-feed] news fetch non-ok:', res.status);
      return {};
    }
    const articles = await res.json();
    if (!Array.isArray(articles)) return {};
    const grouped = {};
    // Articles come sorted newest-first; first hit per symbol wins.
    for (const a of articles) {
      const sym = (a?.symbol || '').toUpperCase();
      if (!sym || !a?.title) continue;
      if (grouped[sym]) continue;
      grouped[sym] = {
        title: String(a.title).trim(),
        site: a.site || null,
        url:  a.url  || null,
        publishedDate: a.publishedDate || null,
      };
    }
    console.log(`[market-feed] news fetched: ${Object.keys(grouped).length}/${batch.length}`);
    return grouped;
  } catch (err) {
    console.warn('[market-feed] news fetch failed:', err.message);
    return {};
  }
}

async function batchReadScores(symbols) {
  if (!db || !symbols.length) return {};
  try {
    const docRefs = symbols.map((sym) => db.collection('scores').doc(sym));
    const snaps   = await db.getAll(...docRefs);
    const scores  = {};
    const now     = Date.now();
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      const d   = snap.data();
      const age = now - new Date(d.cachedAt || 0).getTime();
      if (age < SCORE_TTL_MS) scores[snap.id] = d;
    });
    return scores;
  } catch (err) {
    console.warn('[market-feed] Score batch-read failed:', err.message);
    return {};
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const toArray = (x) => (Array.isArray(x) ? x : []);

const MUST_HAVE = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL', 'PLTR', 'IBIT', 'GLD', 'XLE', 'MSTR', 'BRK-B', 'JPM', 'V', 'WMT', 'ITX', 'SAN'];

const isClean = (x) => {
  const price  = Number(x.price);
  const absPct = Math.abs(Number(x.changesPercentage ?? x.changePercentage ?? 0));
  const sym    = x.symbol ?? '';
  const name   = x.name ?? '';
  if (price < 5) return false;
  if (absPct > 25) return false;
  if (name.length <= 2) return false;
  if (sym.length < 1 || sym.length > 5) return false;
  return true;
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const authUser = await requireAuth(req, res);
  if (!authUser) return;

  const key = process.env.FMP_API_KEY;
  if (!key) return res.status(500).json({ error: 'FMP_API_KEY not configured' });

  try {
    const [gainersRes, losersRes, activesRes, ...mustHaveResponses] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/biggest-gainers?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/stable/biggest-losers?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/stable/most-actives?apikey=${key}`),
      ...MUST_HAVE.map((s) => fetch(`https://financialmodelingprep.com/stable/quote?symbol=${s}&apikey=${key}`)),
    ]);

    const [gainersRaw, losersRaw, activesRaw, ...mustHaveRaws] = await Promise.all([
      gainersRes.json(),
      losersRes.json(),
      activesRes.json(),
      ...mustHaveResponses.map((r) => r.json()),
    ]);

    const gainersArr  = toArray(gainersRaw);
    const losersArr   = toArray(losersRaw);
    const activesArr  = toArray(activesRaw);
    const mustHaveArr = mustHaveRaws.flatMap(toArray).filter((x) => x && x.symbol);
    // Authoritative market status: US equity wall-clock in ET. The FMP data
    // shape is unreliable (returns closing-day gainers even after hours).
    const marketOpen  = isUsMarketOpen();

    // Combine all sources: must-haves first so they're never bumped by the cap,
    // then gainers → losers → actives for market-driven content
    const seen  = new Set();
    const items = [];
    const syntheticScores = {};

    for (const item of [...mustHaveArr, ...gainersArr, ...losersArr, ...activesArr]) {
      if (!item.symbol || seen.has(item.symbol)) continue;
      if (!isClean(item)) continue;
      seen.add(item.symbol);

      const name  = item.name || item.symbol;
      const exch  = (item.exchange ?? '').toUpperCase();
      const isEtf = exch === 'AMEX' && name.toUpperCase().includes('ETF');

      items.push({
        symbol:            item.symbol,
        name,
        price:             Number(item.price) || 0,
        changesPercentage: Number(item.changesPercentage ?? item.changePercentage ?? 0),
        type:              isEtf ? 'etf' : 'stock',
      });

      // Compute synthetic score from the raw FMP item (which has volume/avgVolume).
      // This guarantees every card has a real score + band on first paint —
      // no waiting for per-stock /loopi-score fetches to resolve.
      syntheticScores[item.symbol] = computeSyntheticScore(item);

      if (items.length >= 80) break;
    }

    console.log('[market-feed] after quality filter:', items.length, 'stocks:', items.map(s => s.symbol).join(','));
    console.log(`[market-feed] marketOpen=${marketOpen} total=${items.length}`);

    // Fetch today's news headlines + Firestore-cached full scores in parallel.
    // News drives real insights in the vibeCheck; cached full scores bring
    // AI-polished loopi-voice copy when available.
    const symbols = items.map((s) => s.symbol);
    const [news, cachedScores] = await Promise.all([
      fetchNewsForSymbols(symbols, key),
      batchReadScores(symbols),
    ]);

    // Build scores: synthetic baseline → overlay cached full → overlay news headline.
    // News always wins for vibeCheck because it's real and today-specific.
    const scores = {};
    for (const sym of symbols) {
      const base   = syntheticScores[sym];
      const cached = cachedScores[sym];
      const merged = { ...base, ...(cached || {}) };
      if (news[sym]) {
        merged.vibeCheck      = news[sym].title;
        merged.newsTitle      = news[sym].title;
        merged.newsSite       = news[sym].site;
        merged.newsUrl        = news[sym].url;
        merged.newsDate       = news[sym].publishedDate;
        merged.synthetic      = false;
      }
      scores[sym] = merged;
    }

    console.log(`[market-feed] synthetic: ${Object.keys(syntheticScores).length}, cached full: ${Object.keys(cachedScores).length}, news: ${Object.keys(news).length}`);
    return res.status(200).json({ items, marketOpen, scores });

  } catch (err) {
    console.error('[market-feed] Error:', err.message);
    return res.status(500).json({ error: err.message, scores: {} });
  }
}
