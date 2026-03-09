// Fetches a user's holdings, balance, and P&L from Alpaca
// GET /api/alpaca-portfolio?accountId=xxx

const ALPACA_BASE = 'https://broker-api.sandbox.alpaca.markets';

const alpacaHeaders = () => {
  const credentials = Buffer.from(
    `${process.env.ALPACA_BROKER_KEY}:${process.env.ALPACA_BROKER_SECRET}`
  ).toString('base64');
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { accountId } = req.query;
  if (!accountId) return res.status(400).json({ error: 'Missing accountId' });

  try {
    const [accountRes, positionsRes] = await Promise.all([
      fetch(`${ALPACA_BASE}/v1/trading/accounts/${accountId}/account`, {
        headers: alpacaHeaders(),
      }),
      fetch(`${ALPACA_BASE}/v1/trading/accounts/${accountId}/positions`, {
        headers: alpacaHeaders(),
      }),
    ]);

    const [account, positions] = await Promise.all([
      accountRes.json(),
      positionsRes.json(),
    ]);

    if (!accountRes.ok) return res.status(accountRes.status).json({ error: account.message });

    return res.status(200).json({
      cash: parseFloat(account.cash),
      buyingPower: parseFloat(account.buying_power),
      portfolioValue: parseFloat(account.portfolio_value),
      positions: (positions || []).map(p => ({
        symbol: p.symbol,
        qty: parseFloat(p.qty),
        marketValue: parseFloat(p.market_value),
        costBasis: parseFloat(p.cost_basis),
        unrealizedPL: parseFloat(p.unrealized_pl),
        unrealizedPLPC: parseFloat(p.unrealized_plpc),
        currentPrice: parseFloat(p.current_price),
      })),
    });
  } catch (error) {
    console.error('alpaca-portfolio error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
