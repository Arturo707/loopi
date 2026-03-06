// v6 - FMP Starter (stable endpoints only, ETFs fetched individually)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const toArray = (x) => (Array.isArray(x) ? x : []);

const ETF_SYMBOLS = ['SPY', 'QQQ', 'VTI', 'GLD'];

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.FMP_API_KEY;
  if (!key) return res.status(500).json({ error: 'FMP_API_KEY not configured' });

  try {
    const [gainersRes, losersRes, ...etfResponses] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/biggest-gainers?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/stable/biggest-losers?apikey=${key}`),
      ...ETF_SYMBOLS.map((s) =>
        fetch(`https://financialmodelingprep.com/stable/quote?symbol=${s}&apikey=${key}`)
      ),
    ]);

    const [gainersRaw, losersRaw, ...etfRaws] = await Promise.all([
      gainersRes.json(),
      losersRes.json(),
      ...etfResponses.map((r) => r.json()),
    ]);

    const isClean = (x) => {
      const price = Number(x.price);
      const absPct = Math.abs(Number(x.changesPercentage ?? x.changePercentage ?? 0));
      if (absPct > 25) return false;
      if (price < 1) return false;
      if (price < 5 && absPct > 15) return false;
      return true;
    };

    const gainersArr = toArray(gainersRaw).filter((x) => x.symbol && x.price != null && isClean(x));
    const losersArr  = toArray(losersRaw).filter((x) => x.symbol && x.price != null && isClean(x));
    const marketOpen = gainersArr.length > 0 || losersArr.length > 0;

    // ── ETFs ──────────────────────────────────────────────────────────────────
    const etfItems = etfRaws
      .flat()
      .filter((x) => x && x.symbol && x.price != null)
      .map((item) => ({
        symbol:            item.symbol,
        name:              item.name || item.symbol,
        price:             Number(item.price) || 0,
        changesPercentage: Number(item.changePercentage ?? item.changesPercentage ?? 0),
        type:              'etf',
      }));

    // ── Stocks ────────────────────────────────────────────────────────────────
    const source = marketOpen
      ? [...gainersArr.slice(0, 8), ...losersArr.slice(0, 8)]
      : [...toArray(gainersRaw).slice(0, 10)];

    const stockItems = source.map((item) => ({
      symbol:            item.symbol,
      name:              item.name || item.symbol,
      price:             Number(item.price) || 0,
      changesPercentage: Number(item.changesPercentage ?? item.changePercentage ?? 0),
      type:              'stock',
    }));

    // ── Deduplicate (ETFs first) ───────────────────────────────────────────────
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