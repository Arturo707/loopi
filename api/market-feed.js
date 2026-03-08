// v8 - FMP Starter: gainers + losers + most-actives + must-have quotes
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
    const marketOpen  = gainersArr.length > 0 || losersArr.length > 0;

    // Combine all sources: must-haves first so they're never bumped by the cap,
    // then gainers → losers → actives for market-driven content
    const seen  = new Set();
    const items = [];

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

      if (items.length >= 80) break;
    }

    console.log('[market-feed] after quality filter:', items.length, 'stocks:', items.map(s => s.symbol).join(','));
    console.log(`[market-feed] marketOpen=${marketOpen} total=${items.length}`);
    return res.status(200).json({ items, marketOpen });

  } catch (err) {
    console.error('[market-feed] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
