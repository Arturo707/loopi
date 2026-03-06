// v4 - FMP Starter
// GET → { items: [...], marketOpen: boolean }
// Fetches gainers, losers, and ETF quotes from FMP in parallel.
// Falls back to curated stock quotes when the market is closed.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const toArray = (x) => (Array.isArray(x) ? x : []);

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.FMP_API_KEY;
  if (!key) return res.status(500).json({ error: 'FMP_API_KEY not configured' });

  try {
    const [gainersRes, losersRes, etfsRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/api/v3/stock_market/gainers?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/api/v3/stock_market/losers?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/api/v3/quote/SPY,QQQ,VTI,GLD,CSPX?apikey=${key}`),
    ]);

    const [gainersRaw, losersRaw, etfsRaw] = await Promise.all([
      gainersRes.json(),
      losersRes.json(),
      etfsRes.json(),
    ]);

    const gainersArr = toArray(gainersRaw).filter((x) => x.symbol && x.price != null);
    const losersArr  = toArray(losersRaw).filter((x) => x.symbol && x.price != null);
    const etfsArr    = toArray(etfsRaw).filter((x) => x.symbol && x.price != null);

    console.log(`[market-feed] gainers=${gainersArr.length} losers=${losersArr.length} etfs=${etfsArr.length}`);

    const marketOpen = gainersArr.length > 0 || losersArr.length > 0;

    // ── Stocks ──────────────────────────────────────────────────────────────
    let stockItems;
    if (marketOpen) {
      stockItems = [
        ...gainersArr.slice(0, 8),
        ...losersArr.slice(0, 8),
      ].map((item) => ({
        symbol:            item.symbol,
        name:              item.name || item.symbol,
        price:             Number(item.price)             || 0,
        changesPercentage: Number(item.changesPercentage) || 0,
        type:              'stock',
      }));
      console.log(`[market-feed] stocks (live): ${stockItems.length}`);
    } else {
      console.log('[market-feed] Market closed — fetching curated stock quotes');
      const fallbackRes = await fetch(
        `https://financialmodelingprep.com/api/v3/quote/AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,JPM,IAG,BBVA?apikey=${key}`
      );
      const fallbackRaw = await fallbackRes.json();
      stockItems = toArray(fallbackRaw)
        .filter((x) => x.symbol && x.price != null)
        .map((item) => ({
          symbol:            item.symbol,
          name:              item.name || item.symbol,
          price:             Number(item.price)             || 0,
          changesPercentage: Number(item.changesPercentage) || 0,
          type:              'stock',
        }));
      console.log(`[market-feed] stocks (curated fallback): ${stockItems.length}`);
    }

    // ── ETFs ─────────────────────────────────────────────────────────────────
    const etfItems = etfsArr.map((item) => ({
      symbol:            item.symbol,
      name:              item.name || item.symbol,
      price:             Number(item.price)             || 0,
      changesPercentage: Number(item.changesPercentage) || 0,
      type:              'etf',
    }));

    console.log(`[market-feed] marketOpen=${marketOpen} etfs=${etfItems.length} stocks=${stockItems.length}`);

    // ETFs first so the Conservador risk filter sees them at the top
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
