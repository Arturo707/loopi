import { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } from 'plaid';

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
    console.log('[create-link-token] req.body:', JSON.stringify(req.body));
    const { userId, user_id } = req.body;
    const clientUserId = userId || user_id;

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: clientUserId },
      client_name: 'Loopi',
      products: [Products.Auth],
      country_codes: [CountryCode.Us],
      language: 'en',
    });

    res.status(200).json({ link_token: response.data.link_token });
  } catch (error) {
    console.error('Plaid create-link-token error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
}
