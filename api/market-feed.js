// v2 - Yahoo Finance
// GET → { items: [...], marketOpen: boolean }
// Fetches stock and ETF quotes from Yahoo Finance in parallel.
// No API key required. Works regardless of market hours.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [stocksRes, etfsRes] = await Promise.all([
      fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL,MSFT,NVDA,AMZN,GOOGL,META,TSLA,JPM,IAG,BBVA'),
      fetch('https://query1.finance.yahoo.com/v7/finance/quote?symbols=SPY,QQQ,VTI,IWDA,VWCE,CSPX,GLD,EIMI,AGGH,EXS1'),
    ]);

    const [stocksData, etfsData] = await Promise.all([
      stocksRes.json(),
      etfsRes.json(),
    ]);

    const stockResults = stocksData.quoteResponse?.result ?? [];
    const etfResults   = etfsData.quoteResponse?.result   ?? [];

    console.log(`[market-feed] Yahoo stocks=${stockResults.length} etfs=${etfResults.length}`);

    const stocks = stockResults.map((item) => ({
      symbol:            item.symbol,
      name:              item.longName || item.shortName || item.symbol,
      price:             item.regularMarketPrice        ?? 0,
      changesPercentage: item.regularMarketChangePercent ?? 0,
      type:              'stock',
    }));

    const etfs = etfResults.map((item) => ({
      symbol:            item.symbol,
      name:              item.longName || item.shortName || item.symbol,
      price:             item.regularMarketPrice        ?? 0,
      changesPercentage: item.regularMarketChangePercent ?? 0,
      type:              'etf',
    }));

    const marketOpen = [...stockResults, ...etfResults].some(
      (item) => (item.regularMarketPrice ?? 0) > 0
    );

    console.log(`[market-feed] marketOpen=${marketOpen} total items=${etfs.length + stocks.length}`);

    // ETFs first so Conservador filter sees them at the top
    const items = [...etfs, ...stocks];

    return res.status(200).json({ items, marketOpen });
  } catch (err) {
    console.error('[market-feed] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
