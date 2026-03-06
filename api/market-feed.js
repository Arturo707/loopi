// GET → { items: [...], marketOpen: boolean }
// Fetches gainers, losers, and top ETFs from FMP in parallel.
// Falls back to curated quote lists when the market is closed or endpoints return empty.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const FALLBACK_STOCK_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'IAG', 'BBVA'];
const FALLBACK_ETF_SYMBOLS   = ['SPY', 'QQQ', 'VTI', 'IWDA', 'VWCE', 'CSPX', 'GLD', 'EIMI', 'AGGH', 'EXS1'];

const toArray = (x) => (Array.isArray(x) ? x : []);

function normalizeStock(item) {
  return {
    symbol:            item.symbol,
    name:              item.name || item.symbol,
    price:             Number(item.price)             || 0,
    changesPercentage: Number(item.changesPercentage) || 0,
    type:              'stock',
  };
}

function normalizeEtf(item) {
  return {
    symbol:            item.symbol,
    name:              item.name || item.symbol,
    price:             Number(item.price)             || 0,
    changesPercentage: Number(item.changesPercentage) || 0,
    volume:            Number(item.volume)            || 0,
    type:              'etf',
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.json();
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.FMP_API_KEY;
  if (!key) return res.status(500).json({ error: 'FMP_API_KEY not configured' });

  try {
    // ── Fetch gainers, losers, and ETF quotes in parallel ──────────────────
    const [gainersRaw, losersRaw, etfsRaw] = await Promise.all([
      fetchJson(`https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${key}`),
      fetchJson(`https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${key}`),
      fetchJson(`https://financialmodelingprep.com/api/v3/quotes/etf?apikey=${key}`),
    ]);

    const gainersArr = toArray(gainersRaw).filter((x) => x.symbol && x.price != null);
    const losersArr  = toArray(losersRaw).filter((x) => x.symbol && x.price != null);
    const etfsArr    = toArray(etfsRaw).filter((x) => x.symbol && x.price != null);

    console.log(`[market-feed] gainers=${gainersArr.length} losers=${losersArr.length} etfs=${etfsArr.length}`);

    // Market is open when gainers/losers are non-empty (FMP only populates them during trading hours)
    const marketOpen = gainersArr.length > 0 || losersArr.length > 0;

    // ── Stocks: live gainers+losers, or fall back to curated quote list ─────
    let stockItems;
    if (marketOpen) {
      const gainers = gainersArr.slice(0, 8).map(normalizeStock);
      const losers  = losersArr.slice(0, 8).map(normalizeStock);
      stockItems = [...gainers, ...losers];
      console.log(`[market-feed] stocks (live): gainers=${gainers.length} losers=${losers.length}`);
    } else {
      console.log('[market-feed] Market closed — fetching curated stock quotes');
      const symbols    = FALLBACK_STOCK_SYMBOLS.join(',');
      const quotesRaw  = await fetchJson(
        `https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${key}`
      );
      stockItems = toArray(quotesRaw)
        .filter((x) => x.symbol && x.price != null)
        .map(normalizeStock);
      console.log(`[market-feed] stocks (curated fallback): ${stockItems.length}`);
    }

    // ── ETFs: top by volume from full quote list, or fall back to curated ──
    let etfItems;
    if (etfsArr.length > 0) {
      etfItems = etfsArr
        .sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))
        .slice(0, 8)
        .map(normalizeEtf)
        .map(({ volume: _v, ...rest }) => rest);
      console.log(`[market-feed] ETFs (live top-volume): ${etfItems.length}`);
    } else {
      console.log('[market-feed] ETF quotes empty — fetching curated ETF quotes');
      const symbols   = FALLBACK_ETF_SYMBOLS.join(',');
      const quotesRaw = await fetchJson(
        `https://financialmodelingprep.com/api/v3/quote/${symbols}?apikey=${key}`
      );
      etfItems = toArray(quotesRaw)
        .filter((x) => x.symbol && x.price != null)
        .map(normalizeEtf)
        .map(({ volume: _v, ...rest }) => rest);
      console.log(`[market-feed] ETFs (curated fallback): ${etfItems.length}`);
    }

    // ── Merge: ETFs first, then stocks. Deduplicate by symbol. ─────────────
    const seen  = new Set();
    const items = [];
    for (const item of [...etfItems, ...stockItems]) {
      if (!seen.has(item.symbol)) {
        seen.add(item.symbol);
        items.push(item);
      }
    }

    return res.status(200).json({ items, marketOpen });
  } catch (err) {
    console.error('[market-feed] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
