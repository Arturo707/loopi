// v7 - FMP Starter: gainers + losers + most-actives, broad pool for rank-feed
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const toArray = (x) => (Array.isArray(x) ? x : []);

const isClean = (x) => {
  const price  = Number(x.price);
  const absPct = Math.abs(Number(x.changesPercentage ?? x.changePercentage ?? 0));
  if (price < 2) return false;
  if (absPct > 30) return false;
  if ((x.symbol ?? '').length > 5) return false;
  return true;
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.FMP_API_KEY;
  if (!key) return res.status(500).json({ error: 'FMP_API_KEY not configured' });

  try {
    const [gainersRes, losersRes, activesRes] = await Promise.all([
      fetch(`https://financialmodelingprep.com/stable/biggest-gainers?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/stable/biggest-losers?apikey=${key}`),
      fetch(`https://financialmodelingprep.com/stable/most-actives?apikey=${key}`),
    ]);

    const [gainersRaw, losersRaw, activesRaw] = await Promise.all([
      gainersRes.json(),
      losersRes.json(),
      activesRes.json(),
    ]);

    const gainersArr = toArray(gainersRaw);
    const losersArr  = toArray(losersRaw);
    const activesArr = toArray(activesRaw);
    const marketOpen = gainersArr.length > 0 || losersArr.length > 0;

    // Combine all three, deduplicate, filter, cap at 60
    const seen  = new Set();
    const items = [];

    for (const item of [...gainersArr, ...losersArr, ...activesArr]) {
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

      if (items.length >= 60) break;
    }

    console.log(`[market-feed] marketOpen=${marketOpen} total=${items.length}`);
    return res.status(200).json({ items, marketOpen });

  } catch (err) {
    console.error('[market-feed] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
