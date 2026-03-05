// GET → { items: [...] }
// Fetches gainers, losers, and top ETFs from FMP in parallel,
// deduplicates by symbol, and returns a normalized array.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
      fetch(`https://financialmodelingprep.com/api/v3/quotes/etf?apikey=${key}`),
    ]);

    const [gainersRaw, losersRaw, etfsRaw] = await Promise.all([
      gainersRes.json(),
      losersRes.json(),
      etfsRes.json(),
    ]);

    const toArray = (x) => (Array.isArray(x) ? x : []);

    // Top 8 gainers + top 8 losers (already sorted by FMP)
    const gainers = toArray(gainersRaw)
      .filter((x) => x.symbol && x.price != null)
      .slice(0, 8)
      .map(normalizeStock);

    const losers = toArray(losersRaw)
      .filter((x) => x.symbol && x.price != null)
      .slice(0, 8)
      .map(normalizeStock);

    // Top 8 ETFs by volume
    const etfs = toArray(etfsRaw)
      .filter((x) => x.symbol && x.price != null)
      .sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0))
      .slice(0, 8)
      .map(normalizeEtf)
      .map(({ volume: _v, ...rest }) => rest); // drop volume from output

    // Merge: ETFs first so Conservador filter sees them at the top,
    // then gainers, then losers. Deduplicate by symbol.
    const seen = new Set();
    const items = [];
    for (const item of [...etfs, ...gainers, ...losers]) {
      if (!seen.has(item.symbol)) {
        seen.add(item.symbol);
        items.push(item);
      }
    }

    return res.status(200).json(items);
  } catch (err) {
    console.error('[market-feed] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
