import { Configuration, PlaidApi, PlaidEnvironments, ProcessorTokenCreateRequestProcessorEnum } from 'plaid';

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(config);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { public_token, account_id, alpaca_account_id } = req.body;

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });
    const access_token = exchangeResponse.data.access_token;

    // Create Alpaca processor token
    const processorResponse = await plaidClient.processorTokenCreate({
      access_token,
      account_id,
      processor: ProcessorTokenCreateRequestProcessorEnum.Alpaca,
    });
    const processor_token = processorResponse.data.processor_token;

    // Send processor token to Alpaca to create ACH relationship
    const alpacaRes = await fetch(
      `https://broker-api.sandbox.alpaca.markets/v1/accounts/${alpaca_account_id}/ach_relationships`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(
            `${process.env.ALPACA_BROKER_KEY}:${process.env.ALPACA_BROKER_SECRET}`
          ).toString('base64'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          processor_token,
        }),
      }
    );

    const alpacaData = await alpacaRes.json();

    if (!alpacaRes.ok) {
      throw new Error(alpacaData.message || 'Alpaca ACH relationship failed');
    }

    res.status(200).json({
      success: true,
      ach_relationship_id: alpacaData.id
    });
  } catch (error) {
    console.error('Plaid exchange-token error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to link bank account' });
  }
}
