// api/alpaca-transfer.js
// Initiates an ACH transfer (pull funds from bank into Alpaca account).
// POST /api/alpaca-transfer

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

  const { accountId, achRelationshipId, amount } = req.body;

  if (!accountId || !achRelationshipId || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    const response = await fetch(
      `${ALPACA_BASE}/v1/accounts/${accountId}/transfers`,
      {
        method: 'POST',
        headers: alpacaHeaders(),
        body: JSON.stringify({
          transfer_type: 'ach',
          relationship_id: achRelationshipId,
          amount: parsedAmount.toFixed(2),
          direction: 'INCOMING',
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('[alpaca-transfer] Transfer failed:', data);
      return res.status(response.status).json({ error: data.message || 'Transfer failed', details: data });
    }

    return res.status(200).json({
      transferId: data.id,
      status: data.status,
      amount: data.amount,
      direction: data.direction,
    });
  } catch (error) {
    console.error('[alpaca-transfer] error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
