import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

// ─── Config ──────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const FMP_STABLE   = 'https://financialmodelingprep.com/stable';
const FMP_BASE     = 'https://financialmodelingprep.com/api/v3';
const FMP_KEY      = process.env.EXPO_PUBLIC_FMP_API_KEY;
const FEED_DOC     = doc(db, 'market', 'feed');

// ─── Hardcoded fallback feed ─────────────────────────────────────────────────
// Shown immediately on load. Replaced by Firestore cache or live FMP data when available.

const FALLBACK_STOCKS = [
  { symbol: 'NVDA', name: 'NVIDIA',      price: 881,   changePercent:  2.1, exchange: 'NASDAQ' },
  { symbol: 'AAPL', name: 'Apple',       price: 228,   changePercent:  0.8, exchange: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla',       price: 175,   changePercent: -1.2, exchange: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft',   price: 415,   changePercent:  0.5, exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon',      price: 198,   changePercent:  1.3, exchange: 'NASDAQ' },
  { symbol: 'META', name: 'Meta',        price: 589,   changePercent:  3.2, exchange: 'NASDAQ' },
  { symbol: 'GOOG', name: 'Alphabet',    price: 175,   changePercent:  0.9, exchange: 'NASDAQ' },
  { symbol: 'IAG',  name: 'Iberia',      price: 2.41,  changePercent:  1.8, exchange: 'BME'    },
  { symbol: 'SAN',  name: 'Santander',   price: 4.82,  changePercent:  0.4, exchange: 'BME'    },
  { symbol: 'ITX',  name: 'Inditex',     price: 52.30, changePercent:  1.1, exchange: 'BME'    },
  { symbol: 'GOLD', name: 'Oro',         price: 2340,  changePercent:  0.6, exchange: 'CMDTY'  },
  { symbol: 'BTC',  name: 'Bitcoin',     price: 87500, changePercent:  2.4, exchange: 'CRYPTO' },
];

// ─── FMP helpers ─────────────────────────────────────────────────────────────

async function fmpGet(path, { stable = false } = {}) {
  const base = stable ? FMP_STABLE : FMP_BASE;
  const sep  = path.includes('?') ? '&' : '?';
  const res  = await fetch(`${base}${path}${sep}apikey=${FMP_KEY}`);
  if (!res.ok) throw new Error(`FMP HTTP ${res.status}`);
  const data = await res.json();
  if (data?.['Error Message']) throw new Error(data['Error Message']);
  return data;
}

const toArray = (d) => {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') { const v = Object.values(d).find(Array.isArray); if (v) return v; }
  return [];
};

const normalizeStock = (item) => ({
  symbol:        item.symbol ?? '',
  name:          item.name ?? item.companyName ?? '',
  price:         Number(item.price ?? 0),
  changePercent: Number(item.changesPercentage ?? item.changePercentage ?? item.change ?? 0),
  exchange:      item.exchange ?? item.exchangeShortName ?? '',
});

const isValidStock = (s) => s.price > 0 && s.symbol.length > 0 && s.name.length > 0;

const buildFeed = (actives, gainers) => {
  const seen = new Set();
  return [...toArray(actives), ...toArray(gainers)]
    .map(normalizeStock)
    .filter((s) => { if (seen.has(s.symbol) || !isValidStock(s)) return false; seen.add(s.symbol); return true; });
};

// ─── Context ─────────────────────────────────────────────────────────────────

const MarketContext = createContext(null);

export function MarketProvider({ children }) {
  // Start with fallback data — user sees content immediately, no spinner
  const [stocks, setStocks]   = useState(FALLBACK_STOCKS);
  const [loading, setLoading] = useState(false);
  const [stale, setStale]     = useState(false);
  const [error, setError]     = useState(null);
  const fetchingRef = useRef(false);

  // Fetch live data from FMP, update UI, write to Firestore cache best-effort
  const fetchAndCache = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const [a, g] = await Promise.all([
        fmpGet('/most-actives',    { stable: true }),
        fmpGet('/biggest-gainers', { stable: true }),
      ]);
      const combined = buildFeed(a, g);
      setStocks(combined);
      setStale(false);
      setError(null);
      console.log('[Market] FMP fetched:', combined.length, 'stocks');
      // Best-effort cache write — never blocks or fails the UI
      setDoc(FEED_DOC, { stocks: combined, updatedAt: serverTimestamp() })
        .then(() => console.log('[Market] Cached to Firestore'))
        .catch((e) => console.warn('[Market] Firestore write skipped:', e.message));
    } catch (err) {
      console.error('[Market] FMP fetch failed:', err.message);
      setError('No se pudo actualizar el mercado.');
      setStale(false);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // Check Firestore for a fresher cached response — 5 s timeout guards
      // against an uncreated/unreachable database hanging indefinitely.
      try {
        const snap = await Promise.race([
          getDoc(FEED_DOC),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Firestore timeout')), 5000)),
        ]);
        if (cancelled || !snap.exists()) return;

        const { stocks: saved, updatedAt } = snap.data();
        if (!saved?.length) return;

        const ageMs = updatedAt?.toMillis ? Date.now() - updatedAt.toMillis() : Infinity;
        console.log('[Market] Cache age:', Math.round(ageMs / 1000), 's, stocks:', saved.length);

        // Replace fallback with cached data regardless of age — any real data is better
        if (!cancelled) setStocks(saved);

        if (ageMs > CACHE_TTL_MS) {
          // Cache is stale — silently refresh in background
          console.log('[Market] Cache stale, refreshing in background…');
          if (!cancelled) setStale(true);
          fetchAndCache();
        }
      } catch (err) {
        // Firestore unavailable or timed out — fallback data already shown, nothing to do
        console.warn('[Market] Firestore read skipped:', err.message);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [fetchAndCache]);

  // Manual refresh — forces a live FMP fetch regardless of cache age
  const refresh = useCallback(() => {
    setStale(true);
    fetchAndCache();
  }, [fetchAndCache]);

  return (
    <MarketContext.Provider value={{ stocks, loading, stale, error, refresh }}>
      {children}
    </MarketContext.Provider>
  );
}

export const useMarket = () => useContext(MarketContext);
