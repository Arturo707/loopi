// POST { code } → { balance, currency, accountId, iban, accessToken, expiresAt }
// Exchanges the Tink authorization code for a user access token,
// then fetches accounts and balances. Stateless — nothing stored server-side.

const TINK_BASE = 'https://api.tink.com';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function parseAmount(value) {
  // Tink v2 amount: { unscaledValue: "123456", scale: "2" } → 1234.56
  if (!value) return 0;
  return parseInt(value.unscaledValue, 10) / Math.pow(10, parseInt(value.scale, 10));
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });

  try {
    // 1. Exchange authorization code for user access token
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.EXPO_PUBLIC_TINK_CLIENT_ID,
      client_secret: process.env.TINK_CLIENT_SECRET,
      code,
    });
    const tokenRes = await fetch(`${TINK_BASE}/api/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);

    const { access_token, expires_in } = tokenData;
    const expiresAt = Date.now() + expires_in * 1000;

    // 2. Fetch accounts with the user token
    const accountsRes = await fetch(`${TINK_BASE}/data/v2/accounts`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!accountsRes.ok) throw new Error(`Accounts fetch failed: ${accountsRes.status}`);
    const accountsData = await accountsRes.json();

    const account = accountsData.accounts?.[0];
    if (!account) throw new Error('No accounts found for this user.');

    // Prefer available balance; fall back to booked
    const balanceValue =
      account.balances?.available?.amount?.value ||
      account.balances?.booked?.amount?.value;
    const currency =
      account.balances?.available?.amount?.currencyCode ||
      account.balances?.booked?.amount?.currencyCode ||
      'EUR';
    const iban = account.identifiers?.iban?.iban ?? null;

    return res.status(200).json({
      accountId: account.id,
      balance: parseAmount(balanceValue),
      currency,
      iban,
      accessToken: access_token,
      expiresAt,
    });
  } catch (err) {
    console.error('[tink-token]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
