// Places a buy or sell order for a user via Alpaca Broker API
// Optionally initiates an ACH transfer before placing the order (buy only)
// Supports fractional shares via dollar amount (notional)
// POST /api/alpaca-trade

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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { accountId, symbol, side, amount, qty, achRelationshipId } = req.body;

  if (!accountId || !symbol || !side || (!amount && !qty)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['buy', 'sell'].includes(side)) {
    return res.status(400).json({ error: 'side must be buy or sell' });
  }

  try {
    // For buy orders with an ACH relationship, initiate a transfer first
    if (side === 'buy' && achRelationshipId && amount) {
      const transferRes = await fetch(
        `${ALPACA_BASE}/v1/accounts/${accountId}/transfers`,
        {
          method: 'POST',
          headers: alpacaHeaders(),
          body: JSON.stringify({
            transfer_type: 'ach',
            relationship_id: achRelationshipId,
            amount: parseFloat(amount).toFixed(2),
            direction: 'INCOMING',
          }),
        }
      );
      if (!transferRes.ok) {
        const transferErr = await transferRes.json().catch(() => ({}));
        console.warn('[alpaca-trade] ACH transfer failed (proceeding with order):', transferErr.message);
      }
    }

    const orderBody = {
      symbol,
      side,
      type: 'market',
      time_in_force: 'day',
      ...(amount && side === 'buy'
        ? { notional: amount.toString() }
        : { qty: qty.toString() }
      ),
    };

    const response = await fetch(
      `${ALPACA_BASE}/v1/trading/accounts/${accountId}/orders`,
      {
        method: 'POST',
        headers: alpacaHeaders(),
        body: JSON.stringify(orderBody),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Alpaca order failed:', data);
      return res.status(response.status).json({
        error: data.message || 'Order failed',
        details: data,
      });
    }

    return res.status(200).json({
      orderId: data.id,
      symbol: data.symbol,
      side: data.side,
      status: data.status,
      submittedAt: data.submitted_at,
      notional: data.notional,
      qty: data.qty,
    });
  } catch (error) {
    console.error('alpaca-trade error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
