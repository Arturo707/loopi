// v3 - Twelve Data
// GET → { items: [...], marketOpen: boolean }
// Fetches stock and ETF quotes from Twelve Data in parallel.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return res.status(500).json({ error: 'TWELVE_DATA_API_KEY not configured' });

  try {
    const [stocksRes, etfsRes] = await Promise.all([
      fetch(`https://api.twelvedata.com/quote?symbol=AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,JPM,IAG,BBVA&apikey=${key}`),
      fetch(`https://api.twelvedata.com/quote?symbol=SPY,QQQ,VTI,IWDA,VWCE,CSPX,GLD,EIMI,EXS1,AGGH&apikey=${key}`),
    ]);

    const [stocksData, etfsData] = await Promise.all([
      stocksRes.json(),
      etfsRes.json(),
    ]);

    // Twelve Data returns an object keyed by symbol for multi-symbol requests
    const stockResults = Object.values(stocksData).filter((x) => x.symbol);
    const etfResults   = Object.values(etfsData).filter((x) => x.symbol);

    console.log(`[market-feed] Twelve Data stocks=${stockResults.length} etfs=${etfResults.length}`);

    const stocks = stockResults.map((item) => ({
      symbol:            item.symbol,
      name:              item.name || item.symbol,
      price:             parseFloat(item.close)          || 0,
      changesPercentage: parseFloat(item.percent_change) || 0,
      type:              'stock',
    }));

    const etfs = etfResults.map((item) => ({
      symbol:            item.symbol,
      name:              item.name || item.symbol,
      price:             parseFloat(item.close)          || 0,
      changesPercentage: parseFloat(item.percent_change) || 0,
      type:              'etf',
    }));

    const marketOpen = [...stockResults, ...etfResults].some(
      (item) => item.is_market_open === true
    );

    console.log(`[market-feed] marketOpen=${marketOpen} total=${etfs.length + stocks.length}`);

    // ETFs first so the Conservador risk filter sees them at the top
    const items = [...etfs, ...stocks];

    return res.status(200).json({ items, marketOpen });
  } catch (err) {
    console.error('[market-feed] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
