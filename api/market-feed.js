// v5 - FMP Starter (stable endpoints only)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const toArray = (x) => (Array.isArray(x) ? x : []);

const ETF_SYMBOLS = ['SPY', 'QQQ', 'VTI', 'GLD', 'CSPX'];
const FALLBACK_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM'];

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.FMP_API_KEY;
  if (!key) return res.status(500).json({ error: 'FMP_API_KEY not configured' });

  try {
    // All stable endpoints
    const [gainersRes, losersRes, etfsRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/biggest-gainers?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/stable/biggest-losers?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/stable/quote?symbol=${ETF_SYMBOLS.join(',')}&apikey=${key}`),
    ]);

    const [gainersRaw, losersRaw, etfsRaw] = await Promise.all([
      gainersRes.json(),
      losersRes.json(),
      etfsRes.json(),
    ]);

    const gainersArr = toArray(gainersRaw).filter((x) => x.symbol && x.price != null);
    const losersArr  = toArray(losersRaw).filter((x) => x.symbol && x.price != null);
    const marketOpen = gainersArr.length > 0 || losersArr.length > 0;

    // ── Stocks ──
    let stockItems;
    if (marketOpen) {
      stockItems = [...gainersArr.slice(0, 8), ...losersArr.slice(0, 8)].map((item) => ({
        symbol:            item.symbol,
        name:              item.name || item.symbol,
        price:             Number(item.price) || 0,
        changesPercentage: Number(item.changesPercentage ?? item.changePercentage ?? 0),
        type:              'stock',
      }));
    } else {
      // Fallback: use biggest-gainers as static snapshot (market closed)
      const fallbackRes = await fetch(`https://financialmodelingprep.com/stable/company-outlook?symbol=AAPL&apikey=${key}`);
      // Use gainersRaw as fallback if it has data regardless of market state
      const fallback = toArray(gainersRaw).length > 0 ? toArray(gainersRaw) : toArray(losersRaw);
      stockItems = fallback.slice(0, 10).map((item) => ({
        symbol:            item.symbol,
        name:              item.name || item.symbol,
        price:             Number(item.price) || 0,
        changesPercentage: Number(item.changesPercentage ?? item.changePercentage ?? 0),
        type:              'stock',
      }));
    }

    // ── ETFs ──
    const etfItems = toArray(etfsRaw)
      .filter((x) => x.symbol && x.price != null)
      .map((item) => ({
        symbol:            item.symbol,
        name:              item.name || item.symbol,
        price:             Number(item.price) || 0,
        changesPercentage: Number(item.changesPercentage ?? item.changePercentage ?? 0),
        type:              'etf',
      }));

    // Deduplicate, ETFs first
    const seen  = new Set();
    const items = [];
    for (const item of [...etfItems, ...stockItems]) {
      if (!seen.has(item.symbol)) {
        seen.add(item.symbol);
        items.push(item);
      }
    }

    console.log(`[market-feed] marketOpen=${marketOpen} etfs=${etfItems.length} stocks=${stockItems.length} total=${items.length}`);
    return res.status(200).json({ items, marketOpen });

  } catch (err) {
    console.error('[market-feed] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}